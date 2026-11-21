package main

// Video-Upload zu YouTube (fortsetzbares Hochladen in Stücken) mit Thumbnail und geplanter Veröffentlichung.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var ytUploadBase = "https://www.googleapis.com/upload/youtube/v3"

var upMu sync.Mutex // es läuft immer nur ein Upload gleichzeitig

func setUp(id string, f func(u *Upload)) {
	edit(func(d *Data) {
		for i := range d.Uploads {
			if d.Uploads[i].ID == id {
				f(&d.Uploads[i])
			}
		}
	})
}

// uploadLoop arbeitet die Warteschlange ab.
func uploadLoop() {
	for {
		time.Sleep(3 * time.Second)
		d := view()
		var next *Upload
		for i := range d.Uploads {
			if d.Uploads[i].Status == "wait" {
				next = &d.Uploads[i]
				break
			}
		}
		if next == nil || d.YT.Refresh == "" && d.YT.Access == "" {
			continue
		}
		u := *next
		setUp(u.ID, func(x *Upload) { x.Status, x.Error, x.Progress = "uploading", "", 0 })
		vid, err := doUpload(u)
		if err != nil {
			setUp(u.ID, func(x *Upload) { x.Status, x.Error = "error", err.Error() })
			continue
		}
		setUp(u.ID, func(x *Upload) { x.Status, x.VideoID, x.Progress = "done", vid, 1 })
		if u.Thumb != "" {
			if err := setThumb(vid, u.Thumb); err != nil {
				setUp(u.ID, func(x *Upload) {
					x.Error = tr("Video ist oben, aber das Thumbnail ging nicht: ", "Video uploaded, but the thumbnail failed: ") + err.Error()
				})
			}
		}
		go refreshYouTube()
	}
}

func doUpload(u Upload) (string, error) {
	upMu.Lock()
	defer upMu.Unlock()
	f, err := os.Open(u.File)
	if err != nil {
		return "", fmt.Errorf("%s %s", tr("Videodatei nicht gefunden:", "Video file not found:"), u.File)
	}
	defer f.Close()
	st, _ := f.Stat()
	size := st.Size()
	var tags []string
	for _, t := range strings.Split(u.Tags, ",") {
		if t = strings.TrimSpace(t); t != "" {
			tags = append(tags, t)
		}
	}
	status := map[string]any{"privacyStatus": u.Privacy, "selfDeclaredMadeForKids": u.Kids}
	if u.PublishAt > time.Now().Unix()+60 {
		// geplant: bis zum Termin privat, dann veröffentlicht YouTube selbst
		status["privacyStatus"] = "private"
		status["publishAt"] = time.Unix(u.PublishAt, 0).UTC().Format(time.RFC3339)
	}
	cat := u.Category
	if cat == "" {
		cat = "20"
	}
	meta := map[string]any{"snippet": map[string]any{"title": u.Title, "description": u.Desc, "tags": tags, "categoryId": cat}, "status": status}
	ctype := mime.TypeByExtension(strings.ToLower(filepath.Ext(u.File)))
	if !strings.HasPrefix(ctype, "video/") {
		ctype = "video/*"
	}
	resp, err := ytPostJSON(ytUploadBase+"/videos?uploadType=resumable&part=snippet,status", meta,
		map[string]string{"X-Upload-Content-Length": fmt.Sprint(size), "X-Upload-Content-Type": ctype})
	if err != nil {
		return "", err
	}
	loc := resp.Header.Get("Location")
	if resp.StatusCode >= 300 || loc == "" {
		_, e := ytJSON(resp, nil)
		if e == nil {
			e = fmt.Errorf("YouTube: keine Upload-Adresse")
		}
		return "", e
	}
	resp.Body.Close()
	const chunk = 8 << 20
	buf := make([]byte, chunk)
	var off int64
	retries := 0
	for off < size {
		n, err := f.ReadAt(buf, off)
		if err != nil && err != io.EOF {
			return "", err
		}
		end := off + int64(n) - 1
		r, err := ytDo("PUT", loc, bytes.NewReader(buf[:n]), ctype, map[string]string{"Content-Range": fmt.Sprintf("bytes %d-%d/%d", off, end, size)})
		if err != nil {
			if retries < 5 {
				retries++
				time.Sleep(time.Duration(retries*3) * time.Second)
				continue
			}
			return "", err
		}
		switch {
		case r.StatusCode == 308:
			r.Body.Close()
			// YouTube meldet, bis wohin es angekommen ist
			if rg := r.Header.Get("Range"); rg != "" {
				var a, b int64
				if _, e := fmt.Sscanf(rg, "bytes=%d-%d", &a, &b); e == nil {
					off = b + 1
				} else {
					off = end + 1
				}
			} else {
				off = end + 1
			}
			retries = 0
			p := float64(off) / float64(size)
			setUp(u.ID, func(x *Upload) { x.Progress = p })
		case r.StatusCode == 200 || r.StatusCode == 201:
			m, err := ytJSON(r, nil)
			if err != nil {
				return "", err
			}
			return s(m["id"]), nil
		case r.StatusCode >= 500 && retries < 5:
			r.Body.Close()
			retries++
			time.Sleep(time.Duration(retries*3) * time.Second)
		default:
			_, e := ytJSON(r, nil)
			return "", e
		}
	}
	return "", fmt.Errorf("YouTube: Upload unvollständig")
}

func setThumb(videoID, path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(b) > 2<<20 {
		return fmt.Errorf("%s", tr("Thumbnail ist größer als 2 MB.", "Thumbnail is larger than 2 MB."))
	}
	ct := "image/jpeg"
	if strings.HasSuffix(strings.ToLower(path), ".png") {
		ct = "image/png"
	}
	_, err = ytJSON(ytDo("POST", ytUploadBase+"/thumbnails/set?videoId="+videoID, bytes.NewReader(b), ct, nil))
	return err
}

func validUpload(u Upload) error {
	if strings.TrimSpace(u.File) == "" {
		return fmt.Errorf("%s", tr("Wähle eine Videodatei.", "Choose a video file."))
	}
	if _, err := os.Stat(u.File); err != nil {
		return fmt.Errorf("%s", tr("Die Videodatei gibt es nicht (mehr).", "The video file does not exist."))
	}
	if t := strings.TrimSpace(u.Title); t == "" || len([]rune(t)) > 100 {
		return fmt.Errorf("%s", tr("Der Titel muss 1 bis 100 Zeichen haben.", "The title needs 1 to 100 characters."))
	}
	if strings.ContainsAny(u.Title+u.Desc, "<>") {
		return fmt.Errorf("%s", tr("YouTube erlaubt keine Zeichen < und > in Titel und Beschreibung.", "YouTube does not allow < and > in title and description."))
	}
	if len([]rune(u.Desc)) > 5000 {
		return fmt.Errorf("%s", tr("Die Beschreibung darf höchstens 5000 Zeichen haben.", "The description can have at most 5000 characters."))
	}
	if len(u.Tags) > 480 {
		return fmt.Errorf("%s", tr("Die Tags sind zusammen zu lang (max. ca. 500 Zeichen).", "The tags are too long in total (max ~500 characters)."))
	}
	if u.Thumb != "" {
		if st, err := os.Stat(u.Thumb); err != nil {
			return fmt.Errorf("%s", tr("Das Thumbnail gibt es nicht.", "The thumbnail does not exist."))
		} else if st.Size() > 2<<20 {
			return fmt.Errorf("%s", tr("Das Thumbnail ist größer als 2 MB. Speichere es als JPG.", "The thumbnail is larger than 2 MB. Save it as JPG."))
		}
	}
	if u.PublishAt != 0 && u.PublishAt < time.Now().Unix()+15*60 {
		return fmt.Errorf("%s", tr("Der geplante Termin muss mindestens 15 Minuten in der Zukunft liegen.", "The scheduled time must be at least 15 minutes in the future."))
	}
	return nil
}

var _ = json.Marshal

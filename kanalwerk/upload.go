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

func targetsOf(u Upload) []string {
	if len(u.Targets) == 0 {
		return []string{"yt"}
	}
	return u.Targets
}

func setT(id, net string, f func(t *TState)) {
	setUp(id, func(x *Upload) {
		if x.TState == nil {
			x.TState = map[string]TState{}
		}
		t := x.TState[net]
		f(&t)
		x.TState[net] = t
		// Gesamtstand aus den Zielen
		done, errs, run := 0, 0, false
		var sum float64
		for _, n := range targetsOf(*x) {
			s := x.TState[n]
			switch s.Status {
			case "done", "skip":
				done++
				sum++
			case "error":
				errs++
				sum++
			case "uploading":
				run = true
				sum += s.Progress
			}
		}
		all := len(targetsOf(*x))
		x.Progress = sum / float64(all)
		switch {
		case run:
			x.Status = "uploading"
		case done+errs == all && errs > 0:
			x.Status = "error"
		case done == all:
			x.Status = "done"
		default:
			x.Status = "wait"
		}
		var msgs []string
		for _, n := range targetsOf(*x) {
			if e := x.TState[n].Error; e != "" {
				msgs = append(msgs, netName(n)+": "+e)
			}
		}
		x.Error = strings.Join(msgs, " · ")
		if y := x.TState["yt"]; y.ID != "" {
			x.VideoID = y.ID
		}
	})
}

func netName(n string) string {
	return map[string]string{"yt": "YouTube", "tt": "TikTok", "fb": "Facebook", "ig": "Instagram"}[n]
}

func connected(d Data, n string) bool {
	switch n {
	case "yt":
		return d.YT.Refresh != "" || d.YT.Access != ""
	case "tt":
		return d.TT.Access != ""
	case "fb":
		return metaPage(d).Token != ""
	case "ig":
		return metaPage(d).IGID != ""
	}
	return false
}

// uploadLoop arbeitet die Warteschlange ab: jedes Video nacheinander zu allen gewählten Netzwerken.
func uploadLoop() {
	for {
		time.Sleep(3 * time.Second)
		d := view()
		for _, u := range d.Uploads {
			if u.Status != "wait" {
				continue
			}
			for _, n := range targetsOf(u) {
				st := u.TState[n]
				if st.Status == "done" || st.Status == "error" || st.Status == "skip" {
					continue
				}
				if !connected(d, n) {
					if st.Note == "" {
						setT(u.ID, n, func(t *TState) { t.Note = tr("wartet auf Verbindung", "waiting for connection") })
					}
					continue
				}
				// TikTok und Instagram können nicht selbst zum Termin veröffentlichen: Social-Planer lädt dann zum Termin hoch.
				if (n == "tt" || n == "ig") && u.PublishAt > time.Now().Unix() {
					setT(u.ID, n, func(t *TState) { t.Note = tr("wird zum Termin hochgeladen", "uploads at the scheduled time") })
					continue
				}
				runTarget(u, n)
			}
		}
	}
}

func runTarget(u Upload, n string) {
	setT(u.ID, n, func(t *TState) { t.Status, t.Error, t.Note, t.Progress = "uploading", "", "", 0 })
	prog := func(p float64) { setT(u.ID, n, func(t *TState) { t.Progress = p }) }
	var id, note string
	var err error
	switch n {
	case "yt":
		id, err = doUpload(u, prog)
		if err == nil && u.Thumb != "" {
			if e := setThumb(id, u.Thumb); e != nil {
				note = tr("Thumbnail ging nicht: ", "Thumbnail failed: ") + e.Error()
			}
		}
		if err == nil {
			go refreshYouTube()
		}
	case "tt":
		id, note, err = ttUpload(u, prog)
	case "fb":
		id, note, err = fbUpload(u, prog)
	case "ig":
		id, note, err = igUpload(u, prog)
	}
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "dial tcp") || strings.Contains(msg, "no such host") || strings.Contains(msg, "Forbidden (agent proxy") || strings.Contains(msg, "timeout") {
			msg = tr("Keine Verbindung zu ", "No connection to ") + netName(n) + tr(". Prüfe deine Internetverbindung und versuch es nochmal.", ". Check your internet connection and try again.")
		}
		setT(u.ID, n, func(t *TState) { t.Status, t.Error = "error", msg })
		return
	}
	setT(u.ID, n, func(t *TState) { t.Status, t.ID, t.Note, t.Progress = "done", id, note, 1 })
}

func doUpload(u Upload, prog func(float64)) (string, error) {
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
			prog(p)
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
	if len(targetsOf(u)) == 0 {
		return fmt.Errorf("%s", tr("Wähle mindestens ein Netzwerk.", "Choose at least one network."))
	}
	for _, n := range targetsOf(u) {
		if n != "yt" && n != "tt" && n != "fb" && n != "ig" {
			return fmt.Errorf("bad target")
		}
		if (n == "tt" || n == "ig") && !strings.HasSuffix(strings.ToLower(u.File), ".mp4") && !strings.HasSuffix(strings.ToLower(u.File), ".mov") {
			return fmt.Errorf("%s", tr("TikTok und Instagram nehmen nur MP4 oder MOV.", "TikTok and Instagram only accept MP4 or MOV."))
		}
	}
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

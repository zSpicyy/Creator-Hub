// Motion Design für den Creator Hub: Kompositionen, Ebenen, Keyframes, Masken, Formen, Text-Animation
// und Effekte – aufgebaut wie After Effects. Die Oberfläche berechnet jedes Bild selbst; dieser Teil
// verwaltet Projekte und Medien und setzt beim Export die Bilder mit ffmpeg zu einem Video zusammen.
package main

import (
	"bufio"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"kit/solo"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"kit"
	"kit/ffmpeg"
)

//go:embed web
var webFS embed.FS

// Asset ist eine eingebundene Datei (Bild, Video, Ton). Sie bleibt an ihrem Ort auf dem Rechner.
type Asset struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Kind string `json:"kind"` // image | video | audio
	Path string `json:"path"`
}

// Doc ist ein Projekt. Kompositionen und Ebenen sind für den Server nur Daten (Data).
type Doc struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	W       int             `json:"w"`
	H       int             `json:"h"`
	Created int64           `json:"created"`
	Updated int64           `json:"updated"`
	Detail  string          `json:"detail"`
	Assets  []Asset         `json:"assets"`
	Data    json.RawMessage `json:"data"`
}

type job struct {
	cmd   *exec.Cmd
	in    io.WriteCloser
	bw    *bufio.Writer
	out   string
	tmp   string
	errb  *strings.Builder
	n     int
	total int
	start time.Time
}

type App struct {
	root  string
	mu    sync.Mutex
	dirty map[string]bool
	eng   *ffmpeg.Engine
	jobs  map[string]*job
}

var idRe = regexp.MustCompile(`^[a-z0-9]{6,32}$`)

func (a *App) dir(id string) string { return filepath.Join(a.root, "projects", id) }

func (a *App) load(id string) (*Doc, error) {
	if !idRe.MatchString(id) {
		return nil, errors.New("Projekt nicht gefunden.")
	}
	b, err := os.ReadFile(filepath.Join(a.dir(id), "project.json"))
	if err != nil {
		return nil, errors.New("Projekt nicht gefunden.")
	}
	var d Doc
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, errors.New("Das Projekt ist beschädigt.")
	}
	if d.Assets == nil {
		d.Assets = []Asset{}
	}
	return &d, nil
}

func (a *App) store(d *Doc) error {
	os.MkdirAll(a.dir(d.ID), 0o755)
	b, _ := json.MarshalIndent(d, "", " ")
	tmp := filepath.Join(a.dir(d.ID), "project.json.tmp")
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(a.dir(d.ID), "project.json"))
}

func (a *App) list() []map[string]any {
	es, _ := os.ReadDir(filepath.Join(a.root, "projects"))
	out := []map[string]any{}
	for _, e := range es {
		d, err := a.load(e.Name())
		if err != nil {
			continue
		}
		_, terr := os.Stat(filepath.Join(a.dir(d.ID), "thumb.png"))
		out = append(out, map[string]any{"id": d.ID, "name": d.Name, "w": d.W, "h": d.H, "detail": d.Detail, "updated": d.Updated, "thumb": terr == nil})
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["updated"].(int64) > out[j]["updated"].(int64) })
	return out
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 64<<20)).Decode(v)
}

func userDir(names ...string) string {
	h, _ := os.UserHomeDir()
	for _, n := range names {
		if st, err := os.Stat(filepath.Join(h, n)); err == nil && st.IsDir() {
			return filepath.Join(h, n)
		}
	}
	return h
}

var kinds = map[string]string{".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".bmp": "image", ".svg": "image", ".avif": "image",
	".mp4": "video", ".mov": "video", ".webm": "video", ".mkv": "video", ".m4v": "video", ".avi": "video",
	".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".ogg": "audio", ".flac": "audio", ".aac": "audio", ".opus": "audio"}

var formats = map[string][]string{
	"mp4":  {".mp4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-movflags", "+faststart"},
	"mov":  {".mov", "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"},
	"webm": {".webm", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-row-mt", "1"},
	"gif":  {".gif"},
	"png":  {""},
}

// Tonspuren für den Export: Datei, Beginn in der Komposition, Startpunkt in der Datei, Länge, Lautstärke
type audioIn struct {
	Asset string  `json:"asset"`
	At    float64 `json:"at"`
	In    float64 `json:"in"`
	Dur   float64 `json:"dur"`
	Vol   float64 `json:"vol"`
}

func f3(v float64) string { return strconv.FormatFloat(v, 'f', 3, 64) }

func (a *App) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		l, d, e := a.eng.State()
		kit.JSON(w, map[string]any{"projects": a.list(), "exportDir": userDir("Videos", "Movies"),
			"engine": map[string]any{"ready": a.eng.Ready(), "loading": l, "done": d, "error": e}})
	})
	mux.HandleFunc("/api/engine/install", func(w http.ResponseWriter, r *http.Request) {
		go a.eng.Install()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/new", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name string
			W, H int
			Data json.RawMessage
		}
		readJSON(r, &in)
		if in.W < 16 || in.H < 16 || in.W > 8192 || in.H > 8192 {
			kit.Fail(w, 400, "Ungültige Größe.")
			return
		}
		if strings.TrimSpace(in.Name) == "" {
			in.Name = kit.T("Meine Animation", "My animation")
		}
		now := time.Now().Unix()
		d := &Doc{ID: strings.ToLower(kit.RandID(12)), Name: in.Name, W: in.W, H: in.H, Created: now, Updated: now, Assets: []Asset{}, Data: in.Data}
		if len(d.Data) == 0 {
			d.Data = json.RawMessage("null")
		}
		d.Detail = fmt.Sprintf("%d × %d", d.W, d.H)
		if err := a.store(d); err != nil {
			kit.Fail(w, 500, "Das Projekt ließ sich nicht anlegen.")
			return
		}
		kit.JSON(w, d)
	})
	mux.HandleFunc("/api/project", func(w http.ResponseWriter, r *http.Request) {
		d, err := a.load(r.URL.Query().Get("id"))
		if err != nil {
			kit.Fail(w, 404, err.Error())
			return
		}
		for i := range d.Assets {
			if _, err := os.Stat(d.Assets[i].Path); err != nil {
				d.Assets[i].Kind += ":missing"
			}
		}
		kit.JSON(w, d)
	})
	mux.HandleFunc("/api/save", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ID, Name, Detail string
			W, H             int
			Keep             []string // Medien, die noch gebraucht werden
			Data             json.RawMessage
		}
		if err := readJSON(r, &in); err != nil {
			kit.Fail(w, 400, "Ungültiges Projekt.")
			return
		}
		d, err := a.load(in.ID)
		if err != nil {
			kit.Fail(w, 404, err.Error())
			return
		}
		if in.Name != "" {
			d.Name = in.Name
		}
		if in.W > 0 {
			d.W, d.H = in.W, in.H
		}
		d.Data = in.Data
		if in.Detail != "" {
			d.Detail = in.Detail
		}
		if in.Keep != nil {
			keep := map[string]bool{}
			for _, k := range in.Keep {
				keep[k] = true
			}
			var as []Asset
			for _, x := range d.Assets {
				if keep[x.ID] {
					as = append(as, x)
				}
			}
			if as == nil {
				as = []Asset{}
			}
			d.Assets = as
		}
		d.Updated = time.Now().Unix()
		if err := a.store(d); err != nil {
			kit.Fail(w, 500, "Speichern fehlgeschlagen.")
			return
		}
		a.mu.Lock()
		delete(a.dirty, d.ID)
		a.mu.Unlock()
		kit.JSON(w, map[string]any{"ok": true, "updated": d.Updated})
	})
	// Dateien einbinden (sie bleiben, wo sie sind)
	mux.HandleFunc("/api/import", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ID    string
			Paths []string
		}
		readJSON(r, &in)
		d, err := a.load(in.ID)
		if err != nil {
			kit.Fail(w, 404, err.Error())
			return
		}
		added := []Asset{}
		for _, p := range in.Paths {
			k, ok := kinds[strings.ToLower(filepath.Ext(p))]
			if !ok || !filepath.IsAbs(p) {
				continue
			}
			if st, err := os.Stat(p); err != nil || st.IsDir() {
				continue
			}
			x := Asset{ID: strings.ToLower(kit.RandID(10)), Name: filepath.Base(p), Kind: k, Path: p}
			d.Assets = append(d.Assets, x)
			added = append(added, x)
		}
		if len(added) == 0 {
			kit.Fail(w, 400, kit.T("Diese Dateien können nicht eingebunden werden.", "These files can't be imported."))
			return
		}
		a.store(d)
		kit.JSON(w, added)
	})
	mux.HandleFunc("/api/relink", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ID, Asset, Path string }
		readJSON(r, &in)
		d, err := a.load(in.ID)
		if err != nil {
			kit.Fail(w, 404, err.Error())
			return
		}
		for i := range d.Assets {
			if d.Assets[i].ID == in.Asset {
				d.Assets[i].Path = in.Path
			}
		}
		a.store(d)
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/asset", func(w http.ResponseWriter, r *http.Request) {
		d, err := a.load(r.URL.Query().Get("id"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		for _, x := range d.Assets {
			if x.ID == r.URL.Query().Get("a") {
				http.ServeFile(w, r, x.Path)
				return
			}
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/api/thumb", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if !idRe.MatchString(id) {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		p := filepath.Join(a.dir(id), "thumb.png")
		if r.Method == "GET" {
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, p)
			return
		}
		b, _ := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		os.WriteFile(p, b, 0o644)
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/dirty", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		a.mu.Lock()
		if r.URL.Query().Get("v") == "1" {
			a.dirty[id] = true
		} else {
			delete(a.dirty, id)
		}
		a.mu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/rename", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ID, Name string }
		readJSON(r, &in)
		d, err := a.load(in.ID)
		if err != nil || strings.TrimSpace(in.Name) == "" {
			kit.Fail(w, 400, "Umbenennen fehlgeschlagen.")
			return
		}
		d.Name = strings.TrimSpace(in.Name)
		a.store(d)
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/duplicate", func(w http.ResponseWriter, r *http.Request) {
		d, err := a.load(r.URL.Query().Get("id"))
		if err != nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		old := d.ID
		d.ID = strings.ToLower(kit.RandID(12))
		d.Created, d.Updated = time.Now().Unix(), time.Now().Unix()
		d.Name += " (Kopie)"
		if b, err := os.ReadFile(filepath.Join(a.dir(old), "thumb.png")); err == nil {
			os.MkdirAll(a.dir(d.ID), 0o755)
			os.WriteFile(filepath.Join(a.dir(d.ID), "thumb.png"), b, 0o644)
		}
		if err := a.store(d); err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		kit.JSON(w, map[string]string{"id": d.ID})
	})
	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if !idRe.MatchString(id) {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		os.RemoveAll(a.dir(id))
		kit.JSON(w, map[string]bool{"ok": true})
	})
	// Einzelbild speichern (PNG/JPG)
	mux.HandleFunc("/api/still", func(w http.ResponseWriter, r *http.Request) {
		dir, name := r.URL.Query().Get("dir"), filepath.Base(r.URL.Query().Get("name"))
		if dir == "" {
			dir = userDir("Pictures", "Bilder")
		}
		ext := strings.ToLower(filepath.Ext(name))
		if !filepath.IsAbs(dir) || (ext != ".png" && ext != ".jpg") {
			kit.Fail(w, 400, "Ungültiger Speicherort.")
			return
		}
		os.MkdirAll(dir, 0o755)
		p := freeName(filepath.Join(dir, name))
		b, _ := io.ReadAll(io.LimitReader(r.Body, 256<<20))
		if err := os.WriteFile(p, b, 0o644); err != nil {
			kit.Fail(w, 500, kit.T("Speichern fehlgeschlagen.", "Saving failed."))
			return
		}
		kit.JSON(w, map[string]string{"path": p})
	})
	// Export: Bilder kommen einzeln als PNG, ffmpeg setzt sie zusammen
	mux.HandleFunc("/api/render/start", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ID, Name, Dir, Format string
			FPS                   float64
			Frames                int
			Audio                 []audioIn
			Quality               int
		}
		readJSON(r, &in)
		if !a.eng.Ready() {
			kit.Fail(w, 409, kit.T("ffmpeg wird noch geladen. Bitte gleich noch einmal versuchen.", "ffmpeg is still loading. Please try again in a moment."))
			return
		}
		d, err := a.load(in.ID)
		if err != nil {
			kit.Fail(w, 404, err.Error())
			return
		}
		f, ok := formats[in.Format]
		if !ok || in.FPS <= 0 || in.Frames < 1 {
			kit.Fail(w, 400, "Ungültige Einstellungen.")
			return
		}
		if in.Dir == "" {
			in.Dir = userDir("Videos", "Movies")
		}
		if !filepath.IsAbs(in.Dir) {
			kit.Fail(w, 400, "Ungültiger Speicherort.")
			return
		}
		name := strings.TrimSpace(strings.Map(func(r rune) rune {
			if strings.ContainsRune(`\/:*?"<>|`, r) {
				return '-'
			}
			return r
		}, in.Name))
		if name == "" {
			name = d.Name
		}
		os.MkdirAll(in.Dir, 0o755)
		fps := strconv.FormatFloat(in.FPS, 'f', -1, 64)
		args := []string{"-hide_banner", "-nostdin", "-y", "-f", "image2pipe", "-c:v", "png", "-framerate", fps, "-i", "-"}
		var out string
		if in.Format == "png" {
			out = freeName(filepath.Join(in.Dir, name))
			os.MkdirAll(out, 0o755)
			args = append(args, filepath.Join(out, name+"_%05d.png"))
		} else {
			out = freeName(filepath.Join(in.Dir, name+f[0]))
			// Ton aus Video- und Tonebenen mischen
			var aud []audioIn
			for _, x := range in.Audio {
				for _, s := range d.Assets {
					if s.ID == x.Asset && x.Dur > 0 && hasAudio(a.eng.FFmpeg(), s.Path) {
						x.Asset = s.Path
						aud = append(aud, x)
					}
				}
			}
			if in.Format != "gif" && len(aud) > 0 {
				var fc []string
				var mix string
				for i, x := range aud {
					args = append(args, "-ss", f3(x.In), "-t", f3(x.Dur), "-i", x.Asset)
					vol := x.Vol
					if vol <= 0 {
						vol = 1
					}
					ms := int(x.At * 1000)
					fc = append(fc, fmt.Sprintf("[%d:a]aresample=48000,volume=%s,adelay=%d|%d[a%d]", i+1, f3(vol), ms, ms, i))
					mix += fmt.Sprintf("[a%d]", i)
				}
				fc = append(fc, fmt.Sprintf("%samix=inputs=%d:normalize=0:duration=longest[aout]", mix, len(aud)))
				args = append(args, "-filter_complex", strings.Join(fc, ";"), "-map", "0:v", "-map", "[aout]")
				if in.Format == "webm" {
					args = append(args, "-c:a", "libopus", "-b:a", "192k")
				} else if in.Format == "mov" {
					args = append(args, "-c:a", "pcm_s16le")
				} else {
					args = append(args, "-c:a", "aac", "-b:a", "192k")
				}
				args = append(args, "-t", f3(float64(in.Frames)/in.FPS))
			}
			if in.Format == "gif" {
				args = append(args, "-vf", "split[s0][s1];[s0]palettegen=reserve_transparent=1[p];[s1][p]paletteuse=dither=sierra2_4a", "-loop", "0")
			} else {
				args = append(args, f[1:]...)
				if in.Format == "mp4" {
					crf := 18
					if in.Quality == 1 {
						crf = 23
					} else if in.Quality == 3 {
						crf = 14
					}
					args = append(args, "-crf", strconv.Itoa(crf))
				}
			}
			args = append(args, out)
		}
		c := exec.Command(a.eng.FFmpeg(), args...)
		kit.HideCmd(c)
		eb := &strings.Builder{}
		c.Stderr = &limited{b: eb}
		pipe, err := c.StdinPipe()
		if err != nil || c.Start() != nil {
			kit.Fail(w, 500, kit.T("ffmpeg ließ sich nicht starten.", "ffmpeg could not be started."))
			return
		}
		j := &job{cmd: c, in: pipe, bw: bufio.NewWriterSize(pipe, 4<<20), out: out, errb: eb, total: in.Frames, start: time.Now()}
		key := strings.ToLower(kit.RandID(10))
		a.mu.Lock()
		a.jobs[key] = j
		a.mu.Unlock()
		kit.JSON(w, map[string]string{"job": key, "path": out})
	})
	mux.HandleFunc("/api/render/frame", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		j := a.jobs[r.URL.Query().Get("job")]
		a.mu.Unlock()
		if j == nil {
			kit.Fail(w, 404, "Export nicht gefunden.")
			return
		}
		if _, err := io.Copy(j.bw, io.LimitReader(r.Body, 512<<20)); err != nil {
			kit.Fail(w, 500, kit.T("Der Export wurde abgebrochen: ", "The export stopped: ")+lastLine(j.errb.String()))
			return
		}
		j.n++
		kit.JSON(w, map[string]int{"n": j.n})
	})
	mux.HandleFunc("/api/render/finish", func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("job")
		a.mu.Lock()
		j := a.jobs[key]
		delete(a.jobs, key)
		a.mu.Unlock()
		if j == nil {
			kit.Fail(w, 404, "Export nicht gefunden.")
			return
		}
		cancel := r.URL.Query().Get("cancel") == "1"
		if cancel {
			j.cmd.Process.Kill()
		} else {
			j.bw.Flush()
		}
		j.in.Close()
		err := j.cmd.Wait()
		if cancel {
			os.RemoveAll(j.out)
			kit.JSON(w, map[string]bool{"ok": true})
			return
		}
		if err != nil {
			os.Remove(j.out)
			kit.Fail(w, 500, kit.T("Der Export ist fehlgeschlagen: ", "The export failed: ")+lastLine(j.errb.String()))
			return
		}
		kit.JSON(w, map[string]string{"path": j.out})
	})
	mux.HandleFunc("/api/keys", func(w http.ResponseWriter, r *http.Request) {
		file := filepath.Join(a.root, "tastenkuerzel.json")
		if r.Method == "POST" {
			b, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
			if err != nil || !json.Valid(b) {
				kit.Fail(w, 400, "Ungültige Eingabe.")
				return
			}
			os.WriteFile(file, b, 0o644)
			kit.JSON(w, map[string]bool{"ok": true})
			return
		}
		b, err := os.ReadFile(file)
		if err != nil || !json.Valid(b) {
			b = []byte("{}")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
}

// limited sammelt nur die letzten Zeilen der ffmpeg-Ausgabe (für Fehlermeldungen)
type limited struct{ b *strings.Builder }

func (l *limited) Write(p []byte) (int, error) {
	if l.b.Len() > 64<<10 {
		s := l.b.String()
		l.b.Reset()
		l.b.WriteString(s[len(s)-16<<10:])
	}
	return l.b.Write(p)
}

func lastLine(s string) string {
	ls := strings.Split(strings.TrimSpace(s), "\n")
	if len(ls) == 0 {
		return ""
	}
	return strings.TrimSpace(ls[len(ls)-1])
}

func freeName(p string) string {
	ext := filepath.Ext(p)
	base := strings.TrimSuffix(p, ext)
	for i := 2; ; i++ {
		if _, err := os.Stat(p); err != nil {
			return p
		}
		p = fmt.Sprintf("%s (%d)%s", base, i, ext)
	}
}

func (a *App) anyDirty() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.dirty) > 0
}

func (a *App) busy() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.jobs) > 0
}

func main() {
	k := kit.New("Motion Design", "MotionDesign")
	k.W, k.H = 1500, 920
	app := &App{root: k.Root, dirty: map[string]bool{}, eng: ffmpeg.Shared(), jobs: map[string]*job{}}
	os.MkdirAll(filepath.Join(k.Root, "projects"), 0o755)
	app.routes(k.Mux)
	k.Ask = app.anyDirty
	k.OnClose = func() bool { return !app.busy() }
	if !app.eng.Ready() {
		go app.eng.Install()
	}
	sub, _ := fs.Sub(webFS, "web")
	solo.Enable(k, solo.Config{Tool: "Motion-Design", Title: "Motion Design", TitleEN: "Motion Design", Logo: "motion", Color: "#4f5bd5", Needs: []solo.Need{solo.FFmpeg("Für den Export als Video und für eingefügte Videos und Töne.", "For exporting videos and for imported videos and sounds.")}})
	k.Run(sub)
}

// hasAudio prüft, ob eine Datei eine Tonspur hat (Videos ohne Ton würden den Export sonst abbrechen).
var audioCache sync.Map

func hasAudio(ff, path string) bool {
	st, err := os.Stat(path)
	if err != nil {
		return false
	}
	key := fmt.Sprintf("%s|%d|%d", path, st.Size(), st.ModTime().Unix())
	if v, ok := audioCache.Load(key); ok {
		return v.(bool)
	}
	c := exec.Command(ff, "-hide_banner", "-i", path)
	kit.HideCmd(c)
	out, _ := c.CombinedOutput()
	ok := strings.Contains(string(out), "Audio:")
	audioCache.Store(key, ok)
	return ok
}

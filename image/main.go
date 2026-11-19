// Bildbearbeitung für den Creator Hub: Ebenen, Werkzeuge, Filter, Einfach- und Profi-Modus.
// Die Oberfläche zeichnet die Bilder selbst (damit gehen alle Formate, die das System lesen kann);
// dieser Teil verwaltet Projekte, Ebenendateien, Vorschaubilder und Exporte.
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"kit/solo"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"kit"
)

//go:embed web
var webFS embed.FS

// Doc ist ein Projekt. Die Ebenen-Eigenschaften sind für den Server nur Daten (json.RawMessage),
// die Oberfläche bestimmt ihren Aufbau. Bildinhalte liegen als PNG im Projektordner.
type Doc struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	W       int             `json:"w"`
	H       int             `json:"h"`
	Created int64           `json:"created"`
	Updated int64           `json:"updated"`
	Detail  string          `json:"detail"` // für die Projektübersicht im Hub
	Layers  json.RawMessage `json:"layers"`
	Adjust  json.RawMessage `json:"adjust,omitempty"`
	Extra   json.RawMessage `json:"extra,omitempty"`
}

type App struct {
	root  string
	mu    sync.Mutex
	dirty map[string]bool // ungespeicherte Änderungen je Projekt (meldet die Oberfläche)
}

var idRe = regexp.MustCompile(`^[a-z0-9]{6,32}$`)
var fileRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}\.png$`)

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
	var out []map[string]any
	for _, e := range es {
		d, err := a.load(e.Name())
		if err != nil {
			continue
		}
		_, terr := os.Stat(filepath.Join(a.dir(d.ID), "thumb.png"))
		out = append(out, map[string]any{"id": d.ID, "name": d.Name, "w": d.W, "h": d.H, "updated": d.Updated, "thumb": terr == nil})
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["updated"].(int64) > out[j]["updated"].(int64) })
	return out
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 64<<20)).Decode(v)
}

// imageDir: Standardordner für Exporte (Bilder-Ordner des Nutzers).
func imageDir() string {
	h, _ := os.UserHomeDir()
	for _, n := range []string{"Pictures", "Bilder"} {
		if st, err := os.Stat(filepath.Join(h, n)); err == nil && st.IsDir() {
			return filepath.Join(h, n)
		}
	}
	return h
}

var imageExt = map[string]string{".psd": "application/octet-stream", ".xcf": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
	".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff", ".avif": "image/avif", ".ico": "image/x-icon", ".svg": "image/svg+xml"}

func (a *App) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		kit.JSON(w, map[string]any{"projects": a.list(), "exportDir": imageDir()})
	})
	mux.HandleFunc("/api/new", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name string
			W, H int
		}
		readJSON(r, &in)
		if in.W < 1 || in.H < 1 || in.W > 30000 || in.H > 30000 {
			kit.Fail(w, 400, "Ungültige Bildgröße.")
			return
		}
		if strings.TrimSpace(in.Name) == "" {
			in.Name = kit.T("Mein Bild", "My image")
		}
		now := time.Now().Unix()
		d := &Doc{ID: strings.ToLower(kit.RandID(12)), Name: in.Name, W: in.W, H: in.H, Created: now, Updated: now, Layers: json.RawMessage("[]")}
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
		kit.JSON(w, d)
	})
	// Speichern: erst die geänderten Ebenenbilder (/api/layer), dann das Projekt mit Vorschaubild
	mux.HandleFunc("/api/layer", func(w http.ResponseWriter, r *http.Request) {
		id, f := r.URL.Query().Get("id"), r.URL.Query().Get("f")
		if !idRe.MatchString(id) || !fileRe.MatchString(f) {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		if r.Method == "GET" {
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, filepath.Join(a.dir(id), "ebenen", f))
			return
		}
		dir := filepath.Join(a.dir(id), "ebenen")
		os.MkdirAll(dir, 0o755)
		tmp := filepath.Join(dir, f+".tmp")
		out, err := os.Create(tmp)
		if err != nil {
			kit.Fail(w, 500, "Speichern fehlgeschlagen.")
			return
		}
		_, err = io.Copy(out, io.LimitReader(r.Body, 2<<30))
		out.Close()
		if err != nil {
			os.Remove(tmp)
			kit.Fail(w, 500, "Speichern fehlgeschlagen.")
			return
		}
		os.Rename(tmp, filepath.Join(dir, f))
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/save", func(w http.ResponseWriter, r *http.Request) {
		var d Doc
		if err := readJSON(r, &d); err != nil || !idRe.MatchString(d.ID) {
			kit.Fail(w, 400, "Ungültiges Projekt.")
			return
		}
		old, err := a.load(d.ID)
		if err != nil {
			kit.Fail(w, 404, err.Error())
			return
		}
		d.Created, d.Updated = old.Created, time.Now().Unix()
		d.Detail = fmt.Sprintf("%d × %d", d.W, d.H)
		if err := a.store(&d); err != nil {
			kit.Fail(w, 500, "Speichern fehlgeschlagen.")
			return
		}
		// nicht mehr benutzte Ebenenbilder wegräumen
		used := string(d.Layers) + string(d.Extra)
		if es, _ := os.ReadDir(filepath.Join(a.dir(d.ID), "ebenen")); len(es) > 0 {
			for _, e := range es {
				if !strings.Contains(used, `"`+e.Name()+`"`) {
					os.Remove(filepath.Join(a.dir(d.ID), "ebenen", e.Name()))
				}
			}
		}
		a.mu.Lock()
		delete(a.dirty, d.ID)
		a.mu.Unlock()
		kit.JSON(w, map[string]any{"ok": true, "updated": d.Updated})
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
	// Die Oberfläche meldet, ob es ungespeicherte Änderungen gibt (für die Nachfrage beim Schließen)
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
	// /api/duplicate?id=…: Projekt samt Ebenenbildern kopieren
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
		os.MkdirAll(a.dir(d.ID), 0o755)
		ents, _ := os.ReadDir(a.dir(old))
		for _, e := range ents {
			if e.IsDir() || e.Name() == "project.json" || strings.HasSuffix(e.Name(), ".tmp") {
				continue
			}
			if b, err := os.ReadFile(filepath.Join(a.dir(old), e.Name())); err == nil {
				os.WriteFile(filepath.Join(a.dir(d.ID), e.Name()), b, 0o644)
			}
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
	// Bild vom Rechner lesen (zum Öffnen oder als neue Ebene). Nur Bilddateien.
	mux.HandleFunc("/api/file", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		ct, ok := imageExt[strings.ToLower(filepath.Ext(p))]
		if !ok || !filepath.IsAbs(p) {
			kit.Fail(w, 400, kit.T("Dieses Dateiformat kann nicht geöffnet werden.", "This file type can't be opened."))
			return
		}
		f, err := os.Open(p)
		if err != nil {
			kit.Fail(w, 404, kit.T("Datei nicht gefunden.", "File not found."))
			return
		}
		defer f.Close()
		w.Header().Set("Content-Type", ct)
		io.Copy(w, f)
	})
	// Export: die fertig gerenderte Datei an den gewählten Ort schreiben
	mux.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		dir, name := r.URL.Query().Get("dir"), filepath.Base(r.URL.Query().Get("name"))
		if dir == "" {
			dir = imageDir()
		}
		ext := strings.ToLower(filepath.Ext(name))
		if !filepath.IsAbs(dir) || !map[string]bool{".png": true, ".jpg": true, ".webp": true, ".gif": true, ".bmp": true, ".tif": true, ".ico": true, ".pdf": true, ".psd": true}[ext] || name == "." {
			kit.Fail(w, 400, "Ungültiger Speicherort.")
			return
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			kit.Fail(w, 500, kit.T("Der Ordner lässt sich nicht anlegen.", "The folder can't be created."))
			return
		}
		// vorhandene Dateien nicht überschreiben
		p := filepath.Join(dir, name)
		base := strings.TrimSuffix(name, ext)
		for i := 2; ; i++ {
			if _, err := os.Stat(p); err != nil {
				break
			}
			p = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
		}
		out, err := os.Create(p)
		if err != nil {
			kit.Fail(w, 500, kit.T("Speichern fehlgeschlagen.", "Saving failed."))
			return
		}
		_, err = io.Copy(out, io.LimitReader(r.Body, 2<<30))
		out.Close()
		if err != nil {
			os.Remove(p)
			kit.Fail(w, 500, kit.T("Speichern fehlgeschlagen.", "Saving failed."))
			return
		}
		kit.JSON(w, map[string]string{"path": p})
	})
	// eigene Tastenkürzel (gelten für alle Projekte)
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

func (a *App) anyDirty() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.dirty) > 0
}

func main() {
	k := kit.New("Bildbearbeitung", "Bildbearbeitung")
	k.W, k.H = 1440, 900
	app := &App{root: k.Root, dirty: map[string]bool{}}
	os.MkdirAll(filepath.Join(k.Root, "projects"), 0o755)
	app.routes(k.Mux)
	app.aiRoutes(k.Mux)
	k.Ask = app.anyDirty // ungespeicherte Änderungen: erst nachfragen
	sub, _ := fs.Sub(webFS, "web")
	solo.Enable(k, solo.Config{Tool: "Bildbearbeitung", Title: "Bildbearbeitung", TitleEN: "Image Editor", Logo: "image", Color: "#3f78f0"})
	k.Run(sub)
}

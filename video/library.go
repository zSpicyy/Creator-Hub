package main

import (
	"embed"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"kit"
)

// Eingebaute Sounds (selbst erzeugt, frei nutzbar)
//
//go:embed sfx
var sfxFS embed.FS

// Custom ist ein selbst entworfener Übergang. Er gilt in allen Projekten.
type Custom struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Shape  string  `json:"shape"` // line | circle | diamond | blinds | checker | clock
	Angle  float64 `json:"angle"`
	Soft   float64 `json:"soft"`
	Count  float64 `json:"count"`
	Invert bool    `json:"invert"`
	Dur    float64 `json:"dur"`
}

type LibItem struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Kind string  `json:"kind"` // builtin | user
	Cat  string  `json:"cat,omitempty"`
	Dur  float64 `json:"dur,omitempty"`
}

// Library liegt außerhalb der Projekte: eigene Sounds und Übergänge bleiben für alle Projekte erhalten.
type Library struct {
	mu   sync.Mutex
	dir  string
	trns []Custom
	durs map[string]float64
	favs map[string][]string // Favoriten je Bereich (Audio, Übergänge, Sticker …), für alle Projekte
}

func newLibrary(dir string) *Library {
	l := &Library{dir: dir}
	os.MkdirAll(filepath.Join(dir, "Sounds"), 0o755)
	os.MkdirAll(filepath.Join(dir, "Medien"), 0o755)
	os.MkdirAll(filepath.Join(dir, "Sticker"), 0o755)
	if b, err := os.ReadFile(filepath.Join(dir, "uebergaenge.json")); err == nil {
		json.Unmarshal(b, &l.trns)
	}
	l.favs = map[string][]string{}
	if b, err := os.ReadFile(filepath.Join(dir, "favoriten.json")); err == nil {
		json.Unmarshal(b, &l.favs)
	}
	// eingebaute Sounds auspacken, damit sie wie normale Dateien benutzt werden können.
	// Ändert sich die Sammlung (neue Version), wird der Ordner neu geschrieben.
	bdir := filepath.Join(dir, "Eingebaut")
	idx, _ := sfxFS.ReadFile("sfx/index.json")
	json.Unmarshal(idx, &l.durs)
	if old, _ := os.ReadFile(filepath.Join(bdir, "index.json")); string(old) != string(idx) {
		os.RemoveAll(bdir)
		fs.WalkDir(sfxFS, "sfx", func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			dst := filepath.Join(bdir, filepath.FromSlash(strings.TrimPrefix(p, "sfx")))
			if d.IsDir() {
				os.MkdirAll(dst, 0o755)
			} else if b, err := sfxFS.ReadFile(p); err == nil {
				os.WriteFile(dst, b, 0o644)
			}
			return nil
		})
	}
	return l
}

func (l *Library) list() map[string]any {
	l.mu.Lock()
	defer l.mu.Unlock()
	items := []LibItem{}
	cats, _ := os.ReadDir(filepath.Join(l.dir, "Eingebaut"))
	for _, c := range cats {
		if !c.IsDir() {
			continue
		}
		es, _ := os.ReadDir(filepath.Join(l.dir, "Eingebaut", c.Name()))
		for _, e := range es {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".ogg") {
				items = append(items, LibItem{ID: "Eingebaut/" + c.Name() + "/" + e.Name(), Name: strings.TrimSuffix(e.Name(), ".ogg"), Kind: "builtin", Cat: c.Name(), Dur: l.durs[c.Name()+"/"+e.Name()]})
			}
		}
	}
	us, _ := os.ReadDir(filepath.Join(l.dir, "Sounds"))
	for _, e := range us {
		if !e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			items = append(items, LibItem{ID: "Sounds/" + e.Name(), Name: strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())), Kind: "user"})
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Kind != items[j].Kind {
			return items[i].Kind == "user"
		}
		if items[i].Cat != items[j].Cat {
			return items[i].Cat < items[j].Cat
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})
	tr := append([]Custom{}, l.trns...)
	media := []LibItem{}
	es, _ := os.ReadDir(filepath.Join(l.dir, "Medien"))
	for _, e := range es {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		k := "video"
		if audioExt[ext(e.Name())] {
			k = "audio"
		} else if imageExt[ext(e.Name())] {
			k = "image"
		}
		media = append(media, LibItem{ID: "Medien/" + e.Name(), Name: strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())), Kind: k})
	}
	favs := map[string][]string{}
	for k, v := range l.favs {
		favs[k] = append([]string{}, v...)
	}
	return map[string]any{"sounds": items, "custom": tr, "media": media, "favs": favs}
}

func (l *Library) path(id string) string {
	parts := strings.Split(id, "/")
	ok := len(parts) == 2 && (parts[0] == "Sounds" || parts[0] == "Medien" || parts[0] == "Sticker")
	if len(parts) == 3 && parts[0] == "Eingebaut" {
		ok = true
	}
	for _, p := range parts[1:] {
		if p == "" || strings.HasPrefix(p, ".") || strings.ContainsAny(p, `\:`) {
			ok = false
		}
	}
	if !ok {
		return ""
	}
	p := filepath.Join(append([]string{l.dir}, parts...)...)
	if _, err := os.Stat(p); err != nil {
		return ""
	}
	return p
}

func (l *Library) serve(w http.ResponseWriter, r *http.Request) {
	p := l.path(r.URL.Query().Get("s"))
	if p == "" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, p)
}

// addSounds kopiert eigene Sounds in die Bibliothek.
func (l *Library) addSounds(paths []string, a *App) ([]LibItem, error) {
	var out []LibItem
	for _, src := range paths {
		src = strings.Trim(strings.TrimSpace(src), `"`)
		if !audioExt[ext(src)] && !videoExt[ext(src)] {
			continue
		}
		name := filepath.Base(src)
		dst := filepath.Join(l.dir, "Sounds", name)
		for i := 2; ; i++ {
			if _, err := os.Stat(dst); err != nil {
				break
			}
			dst = filepath.Join(l.dir, "Sounds", strings.TrimSuffix(name, filepath.Ext(name))+" ("+itoa(i)+")"+filepath.Ext(name))
		}
		if videoExt[ext(src)] { // aus Videos nur den Ton übernehmen
			dst = strings.TrimSuffix(dst, filepath.Ext(dst)) + ".m4a"
			if err := a.cmd("-hide_banner", "-nostdin", "-y", "-i", src, "-vn", "-c:a", "aac", "-b:a", "192k", dst).Run(); err != nil {
				continue
			}
		} else if err := copyFile(src, dst); err != nil {
			return out, err
		}
		out = append(out, LibItem{ID: "Sounds/" + filepath.Base(dst), Name: strings.TrimSuffix(filepath.Base(dst), filepath.Ext(dst)), Kind: "user"})
	}
	if len(out) == 0 {
		return nil, errors.New("Keine Tondatei gefunden.")
	}
	return out, nil
}

func (l *Library) remove(id string) {
	if strings.HasPrefix(id, "Sounds/") || strings.HasPrefix(id, "Medien/") {
		if p := l.path(id); p != "" {
			os.Remove(p)
		}
	}
}

func (l *Library) saveTransition(c Custom) Custom {
	l.mu.Lock()
	defer l.mu.Unlock()
	if c.ID == "" {
		c.ID = kit.RandID(4)
	}
	if strings.TrimSpace(c.Name) == "" {
		c.Name = "Eigener Übergang"
	}
	found := false
	for i := range l.trns {
		if l.trns[i].ID == c.ID {
			l.trns[i], found = c, true
		}
	}
	if !found {
		l.trns = append(l.trns, c)
	}
	l.store()
	return c
}

func (l *Library) removeTransition(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for i := range l.trns {
		if l.trns[i].ID == id {
			l.trns = append(l.trns[:i], l.trns[i+1:]...)
			break
		}
	}
	l.store()
}

func (l *Library) store() {
	b, _ := json.MarshalIndent(l.trns, "", " ")
	os.WriteFile(filepath.Join(l.dir, "uebergaenge.json"), b, 0o644)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst + ".tmp")
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	out.Close()
	if err != nil {
		os.Remove(dst + ".tmp")
		return err
	}
	return os.Rename(dst+".tmp", dst)
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

// addMedia kopiert Videos, Bilder und Ton in "Meine Medien" (für alle Projekte).
func (l *Library) addMedia(paths []string) ([]LibItem, error) {
	var out []LibItem
	for _, src := range paths {
		src = strings.Trim(strings.TrimSpace(src), `"`)
		x := ext(src)
		if !audioExt[x] && !videoExt[x] && !imageExt[x] {
			continue
		}
		name := filepath.Base(src)
		dst := filepath.Join(l.dir, "Medien", name)
		for i := 2; ; i++ {
			if _, err := os.Stat(dst); err != nil {
				break
			}
			dst = filepath.Join(l.dir, "Medien", strings.TrimSuffix(name, filepath.Ext(name))+" ("+itoa(i)+")"+filepath.Ext(name))
		}
		if err := copyFile(src, dst); err != nil {
			return out, err
		}
		out = append(out, LibItem{ID: "Medien/" + filepath.Base(dst), Name: strings.TrimSuffix(filepath.Base(dst), filepath.Ext(dst)), Kind: "user"})
	}
	if len(out) == 0 {
		return nil, errors.New("Keine passende Datei gefunden.")
	}
	return out, nil
}

// sticker speichert ein im Fenster gezeichnetes Sticker-Bild (PNG) und gibt den Pfad zurück.
func (l *Library) sticker(name string, png []byte) (string, error) {
	safe := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return '-'
	}, strings.ToLower(name))
	if safe == "" || len(png) < 8 || string(png[1:4]) != "PNG" {
		return "", errors.New("Ungültiger Sticker.")
	}
	p := filepath.Join(l.dir, "Sticker", safe+".png")
	if err := os.WriteFile(p, png, 0o644); err != nil {
		return "", err
	}
	return p, nil
}

// setFav nimmt ein Element in die Favoriten eines Bereichs auf oder entfernt es.
func (l *Library) setFav(tab, id string, on bool) map[string][]string {
	l.mu.Lock()
	defer l.mu.Unlock()
	if tab != "" && id != "" && len(tab) < 40 && len(id) < 300 {
		list := l.favs[tab][:0:0]
		for _, x := range l.favs[tab] {
			if x != id {
				list = append(list, x)
			}
		}
		if on {
			list = append([]string{id}, list...)
		}
		if len(list) == 0 {
			delete(l.favs, tab)
		} else {
			l.favs[tab] = list
		}
		b, _ := json.MarshalIndent(l.favs, "", " ")
		os.WriteFile(filepath.Join(l.dir, "favoriten.json"), b, 0o644)
	}
	out := map[string][]string{}
	for k, v := range l.favs {
		out[k] = append([]string{}, v...)
	}
	return out
}

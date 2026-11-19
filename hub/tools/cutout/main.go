// Paket cutout ist der Freisteller: entfernt Hintergründe mit KI, mit Nacharbeit per Pinsel und Einkreisen.
package cutout

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"hub/tools/upscale"
	"kit"
	"kit/ai"
)

//go:embed web
var webFS embed.FS

const model = "cutout"

// workSide: größte Kantenlänge, in der Maske und Vorschau gerechnet werden. Das Ergebnis wird in voller Größe gespeichert.
const workSide = 2048

type Project struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Source  string  `json:"source"`
	W       int     `json:"w"`
	H       int     `json:"h"`
	MW      int     `json:"mw"` // Größe von Vorschau und Maske
	MH      int     `json:"mh"`
	Created int64   `json:"created"`
	Updated int64   `json:"updated"`
	Detail  string  `json:"detail"`
	Status  string  `json:"status"` // waiting | running | ready | error
	Error   string  `json:"error,omitempty"`
	Done    float64 `json:"done"`
	Ver     int     `json:"ver"` // zählt hoch, wenn sich Maske oder Farben ändern
	OutDir  string  `json:"outDir"`
	Bg      string  `json:"bg"` // "" = durchsichtig, sonst #rrggbb
	Result  string  `json:"result,omitempty"`
	Bytes   int64   `json:"bytes,omitempty"`
}

type App struct {
	mu       sync.Mutex
	root     string
	projects map[string]*Project
	queue    chan string
	busy     int
	aiMu     sync.Mutex // die KI rechnet immer nur ein Bild gleichzeitig (Arbeitsspeicher)
}

func dataRoot() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	return filepath.Join(d, "Freisteller")
}

func (a *App) dir(id string) string { return filepath.Join(a.root, "projects", id) }

func (a *App) save(p *Project) {
	os.MkdirAll(a.dir(p.ID), 0o755)
	b, _ := json.MarshalIndent(p, "", "  ")
	tmp := filepath.Join(a.dir(p.ID), "project.json.tmp")
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, filepath.Join(a.dir(p.ID), "project.json"))
	}
}

func newApp() *App {
	a := &App{root: dataRoot(), projects: map[string]*Project{}, queue: make(chan string, 4096)}
	os.MkdirAll(filepath.Join(a.root, "projects"), 0o755)
	entries, _ := os.ReadDir(filepath.Join(a.root, "projects"))
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join(a.root, "projects", e.Name(), "project.json"))
		var p Project
		if err == nil && json.Unmarshal(b, &p) == nil && p.ID != "" {
			if p.Status == "running" || p.Status == "waiting" { // beim letzten Mal nicht fertig geworden
				p.Status, p.Error = "error", "Wurde unterbrochen. Klicke auf „Neu berechnen“."
			}
			a.projects[p.ID] = &p
		}
	}
	go a.worker()
	return a
}

func (a *App) worker() {
	for id := range a.queue {
		a.mu.Lock()
		p := a.projects[id]
		if p == nil || p.Status != "waiting" {
			a.busy--
			a.mu.Unlock()
			continue
		}
		p.Status, p.Done = "running", 0.02
		a.mu.Unlock()
		err := a.compute(p)
		a.mu.Lock()
		if err != nil {
			p.Status, p.Error = "error", err.Error()
		} else {
			p.Status, p.Error, p.Done = "ready", "", 1
			p.Ver++
		}
		p.Updated = time.Now().Unix()
		a.save(p)
		a.busy--
		a.mu.Unlock()
	}
}

func (a *App) enqueue(p *Project) {
	p.Status, p.Error, p.Done = "waiting", "", 0
	a.busy++
	a.queue <- p.ID
}

// loadView liest die Vorschau (Arbeitsgröße) als Farbebene.
func (a *App) loadView(id string) (*plane, error) {
	f, err := os.Open(filepath.Join(a.dir(id), "view.png"))
	if err != nil {
		return nil, errors.New("Das Bild zu diesem Projekt fehlt.")
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, errors.New("Das Bild zu diesem Projekt ist beschädigt.")
	}
	return rgbPlane(toNRGBA(img)), nil
}

func toNRGBA(img image.Image) *image.NRGBA {
	if v, ok := img.(*image.NRGBA); ok {
		return v
	}
	b := img.Bounds()
	n := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(n, n.Bounds(), img, b.Min, draw.Src)
	return n
}

func (a *App) loadMask(id string, w, h int) (*plane, error) {
	f, err := os.Open(filepath.Join(a.dir(id), "mask.png"))
	if err != nil {
		return nil, errors.New("Die Maske zu diesem Projekt fehlt.")
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, errors.New("Die Maske zu diesem Projekt ist beschädigt.")
	}
	return maskPlane(img, w, h)
}

// maskPlane liest eine Maske aus einem Graustufenbild oder aus dem Alphakanal (so schickt sie der Browser).
func maskPlane(img image.Image, w, h int) (*plane, error) {
	b := img.Bounds()
	if b.Dx() != w || b.Dy() != h {
		return nil, errors.New("Die Maske passt nicht zur Bildgröße.")
	}
	m := newPlane(w, h, 1)
	switch v := img.(type) {
	case *image.Gray:
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				m.p[y*w+x] = float32(v.Pix[y*v.Stride+x]) / 255
			}
		}
	case *image.NRGBA:
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				m.p[y*w+x] = float32(v.Pix[y*v.Stride+x*4+3]) / 255
			}
		}
	default:
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				_, _, _, al := img.At(b.Min.X+x, b.Min.Y+y).RGBA()
				m.p[y*w+x] = float32(al) / 65535
			}
		}
	}
	return m, nil
}

func writeGray(path string, m *plane) error {
	g := image.NewGray(image.Rect(0, 0, m.w, m.h))
	for i, v := range m.p {
		g.Pix[i] = to8(v)
	}
	return writePNG(path, g)
}

func writePNG(path string, img image.Image) error {
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(f, img); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// writeDerived schreibt, was aus Bild und Maske folgt: die Farben ohne Saum (fg.png) und das Vorschaubild.
func (a *App) writeDerived(id string, I, m *plane) error {
	F := foreground(I, m)
	w, h := I.w, I.h
	fg := image.NewNRGBA(image.Rect(0, 0, w, h))
	cut := image.NewNRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < w*h; i++ {
		r, g, b := to8(F.p[i*3]), to8(F.p[i*3+1]), to8(F.p[i*3+2])
		fg.Pix[i*4], fg.Pix[i*4+1], fg.Pix[i*4+2], fg.Pix[i*4+3] = r, g, b, 255
		cut.Pix[i*4], cut.Pix[i*4+1], cut.Pix[i*4+2], cut.Pix[i*4+3] = r, g, b, to8(m.p[i])
	}
	if err := writePNG(filepath.Join(a.dir(id), "fg.png"), fg); err != nil {
		return err
	}
	return writePNG(filepath.Join(a.dir(id), "thumb.png"), upscale.Fit(cut, 420))
}

func (a *App) compute(p *Project) error {
	// Die KI wird beim ersten Mal erst geladen: so lange warten, statt mit einem Fehler abzubrechen.
	if !ai.Ready(model) {
		ai.Install(model)
		for i := 0; !ai.Ready(model); i++ {
			time.Sleep(500 * time.Millisecond)
			if st := ai.Get(model); !st.Loading && i > 2 && !ai.Ready(model) {
				if st.Error != "" {
					return errors.New("Die KI konnte nicht eingerichtet werden: " + st.Error)
				}
				return errors.New("Die KI konnte nicht eingerichtet werden.")
			}
		}
	}
	a.aiMu.Lock()
	defer a.aiMu.Unlock()
	sess, err := ai.Acquire(model)
	if err != nil {
		return err
	}
	defer ai.Done(model)
	I, err := a.loadView(p.ID)
	if err != nil {
		return err
	}
	m, err := matte(sess, I, func(d float64) {
		a.mu.Lock()
		p.Done = 0.05 + d*0.8
		a.mu.Unlock()
	})
	if err != nil {
		return err
	}
	if err := writeGray(filepath.Join(a.dir(p.ID), "mask.png"), m); err != nil {
		return errors.New("Die Maske ließ sich nicht speichern.")
	}
	writeGray(filepath.Join(a.dir(p.ID), "mask-ki.png"), m) // für „Zurücksetzen“
	return a.writeDerived(p.ID, I, m)
}

func (a *App) openImage(path string) (*Project, error) {
	path = strings.Trim(strings.TrimSpace(path), `"`)
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return nil, errors.New("Diese Datei gibt es nicht.")
	}
	img, err := upscale.Decode(path)
	if err != nil {
		return nil, err
	}
	view := upscale.Fit(img, workSide)
	p := &Project{ID: kit.RandID(6), Name: strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)), Created: time.Now().Unix(), Updated: time.Now().Unix(),
		Source: path, W: img.Bounds().Dx(), H: img.Bounds().Dy(), MW: view.Bounds().Dx(), MH: view.Bounds().Dy(), OutDir: filepath.Dir(path)}
	p.Detail = fmt.Sprintf("%d × %d Pixel", p.W, p.H)
	os.MkdirAll(a.dir(p.ID), 0o755)
	// Vorschau ohne Durchsicht ablegen (durchsichtige Stellen weiß)
	flat := image.NewNRGBA(view.Bounds())
	draw.Draw(flat, flat.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.Draw(flat, flat.Bounds(), view, image.Point{}, draw.Over)
	if err := writePNG(filepath.Join(a.dir(p.ID), "view.png"), flat); err != nil {
		return nil, errors.New("Das Projekt ließ sich nicht anlegen.")
	}
	writePNG(filepath.Join(a.dir(p.ID), "thumb.png"), upscale.Fit(flat, 420))
	a.mu.Lock()
	a.projects[p.ID] = p
	a.enqueue(p)
	a.save(p)
	a.mu.Unlock()
	return p, nil
}

func uniquePath(dir, name, ext string) string {
	p := filepath.Join(dir, name+"."+ext)
	for i := 2; ; i++ {
		if _, err := os.Stat(p); err != nil {
			return p
		}
		p = filepath.Join(dir, fmt.Sprintf("%s (%d).%s", name, i, ext))
	}
}

func parseColor(s string) (color.NRGBA, bool) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	if len(s) != 6 {
		return color.NRGBA{}, false
	}
	v, err := strconv.ParseUint(s, 16, 32)
	if err != nil {
		return color.NRGBA{}, false
	}
	return color.NRGBA{uint8(v >> 16), uint8(v >> 8), uint8(v), 255}, true
}

// export schreibt das Ergebnis in voller Größe. bg leer = durchsichtiges PNG, sonst Farbe (PNG oder JPG).
func (a *App) export(p *Project, bg, format, dir string) (string, error) {
	I, err := a.loadView(p.ID)
	if err != nil {
		return "", err
	}
	m, err := a.loadMask(p.ID, I.w, I.h)
	if err != nil {
		return "", err
	}
	F := foreground(I, m)
	// Original in voller Größe; fehlt es inzwischen, wird die Arbeitsgröße gespeichert
	full, err := upscale.Decode(p.Source)
	if err != nil || full.Bounds().Dx() != p.W || full.Bounds().Dy() != p.H {
		full = nil
	}
	W, H := I.w, I.h
	if full != nil {
		W, H = p.W, p.H
	}
	out := image.NewNRGBA(image.Rect(0, 0, W, H))
	if full == nil {
		for i := 0; i < W*H; i++ {
			out.Pix[i*4], out.Pix[i*4+1], out.Pix[i*4+2], out.Pix[i*4+3] = to8(F.p[i*3]), to8(F.p[i*3+1]), to8(F.p[i*3+2]), to8(m.p[i])
		}
	} else {
		// Maske und Farbkorrektur (F − I) werden weich auf die volle Größe gebracht; die Schärfe kommt aus dem Original
		D := newPlane(I.w, I.h, 4)
		for i := 0; i < I.w*I.h; i++ {
			D.p[i*4], D.p[i*4+1], D.p[i*4+2], D.p[i*4+3] = F.p[i*3]-I.p[i*3], F.p[i*3+1]-I.p[i*3+1], F.p[i*3+2]-I.p[i*3+2], m.p[i]
		}
		const band = 256
		for y0 := 0; y0 < H; y0 += band { // in Streifen, damit auch riesige Bilder wenig Arbeitsspeicher brauchen
			y1 := min(H, y0+band)
			sy0 := max(0, y0*I.h/H-2)
			sy1 := min(I.h, y1*I.h/H+3)
			up := resizeRows(D, sy0, sy1, W, H, y0, y1)
			par(y1-y0, func(a0, a1 int) {
				for y := y0 + a0; y < y0+a1; y++ {
					s := full.Pix[y*full.Stride:]
					d := out.Pix[y*out.Stride:]
					u := up.p[(y-y0)*W*4:]
					for x := 0; x < W; x++ {
						al := u[x*4+3]
						sa := float32(s[x*4+3]) / 255
						for c := 0; c < 3; c++ {
							v := float32(s[x*4+c]) / 255
							if al < .995 {
								v += u[x*4+c]
							}
							d[x*4+c] = to8(v)
						}
						d[x*4+3] = to8(al * sa)
					}
				}
			})
		}
	}
	ext := "png"
	var img image.Image = out
	if c, ok := parseColor(bg); ok {
		flat := image.NewRGBA(out.Bounds())
		draw.Draw(flat, flat.Bounds(), image.NewUniform(c), image.Point{}, draw.Src)
		draw.Draw(flat, flat.Bounds(), out, image.Point{}, draw.Over)
		img = flat
		if format == "jpg" {
			ext = "jpg"
		}
	}
	if dir == "" {
		dir = p.OutDir
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return "", errors.New("Den Zielordner gibt es nicht mehr. Wähle einen anderen.")
	}
	dst := uniquePath(dir, p.Name+" freigestellt", ext)
	tmp := dst + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return "", errors.New("In diesem Ordner darf nicht gespeichert werden. Wähle einen anderen.")
	}
	if ext == "jpg" {
		err = jpeg.Encode(f, img, &jpeg.Options{Quality: 95})
	} else {
		err = png.Encode(f, img)
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp)
		return "", errors.New("Das Bild ließ sich nicht speichern (Speicherplatz voll?).")
	}
	if err := os.Rename(tmp, dst); err != nil {
		os.Remove(tmp)
		return "", err
	}
	return dst, nil
}

// resizeRows vergrößert bilinear nur die Zielzeilen y0..y1 (Ziel insgesamt W × H) aus den Quellzeilen sy0..sy1.
func resizeRows(s *plane, sy0, sy1, W, H, y0, y1 int) *plane {
	ch := s.ch
	o := newPlane(W, y1-y0, ch)
	fx, fy := float64(s.w)/float64(W), float64(s.h)/float64(H)
	par(y1-y0, func(a, b int) {
		for y := y0 + a; y < y0+b; y++ {
			sy := (float64(y)+.5)*fy - .5
			iy := int(sy)
			if sy < 0 {
				iy = -1
			}
			ty := float32(sy - float64(iy))
			ya, yb := min(max(iy, 0), s.h-1), min(max(iy+1, 0), s.h-1)
			for x := 0; x < W; x++ {
				sx := (float64(x)+.5)*fx - .5
				ix := int(sx)
				if sx < 0 {
					ix = -1
				}
				tx := float32(sx - float64(ix))
				xa, xb := min(max(ix, 0), s.w-1), min(max(ix+1, 0), s.w-1)
				p00, p10 := s.p[(ya*s.w+xa)*ch:], s.p[(ya*s.w+xb)*ch:]
				p01, p11 := s.p[(yb*s.w+xa)*ch:], s.p[(yb*s.w+xb)*ch:]
				d := o.p[((y-y0)*W+x)*ch:]
				for c := 0; c < ch; c++ {
					d[c] = (p00[c]*(1-tx)+p10[c]*tx)*(1-ty) + (p01[c]*(1-tx)+p11[c]*tx)*ty
				}
			}
		}
	})
	_ = sy0
	_ = sy1
	return o
}

func downloadsDir() string {
	h, _ := os.UserHomeDir()
	if runtime.GOOS == "windows" {
		c := exec.Command("powershell", "-NoProfile", "-Command", "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path")
		kit.HideCmd(c)
		if out, err := c.Output(); err == nil {
			if p := strings.TrimSpace(string(out)); p != "" {
				if st, err := os.Stat(p); err == nil && st.IsDir() {
					return p
				}
			}
		}
	}
	if runtime.GOOS == "linux" {
		if out, err := exec.Command("xdg-user-dir", "DOWNLOAD").Output(); err == nil {
			if p := strings.TrimSpace(string(out)); p != "" && p != h {
				if st, err := os.Stat(p); err == nil && st.IsDir() {
					return p
				}
			}
		}
	}
	d := filepath.Join(h, "Downloads")
	os.MkdirAll(d, 0o755)
	return d
}

func (a *App) get(id string) *Project {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.projects[id]
}

func (a *App) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/projects", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		list := make([]Project, 0, len(a.projects))
		for _, p := range a.projects {
			list = append(list, *p)
		}
		a.mu.Unlock()
		sort.Slice(list, func(i, j int) bool { return list[i].Created > list[j].Created })
		kit.JSON(w, list)
	})
	mux.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			Paths []string `json:"paths"`
		}
		json.NewDecoder(r.Body).Decode(&rq)
		var out []*Project
		var last error
		for _, p := range rq.Paths {
			pr, err := a.openImage(p)
			if err != nil {
				last = err
				continue
			}
			out = append(out, pr)
		}
		if len(out) == 0 {
			if last == nil {
				last = errors.New("Keine Datei ausgewählt.")
			}
			kit.Fail(w, 400, last.Error())
			return
		}
		kit.JSON(w, out)
	})
	mux.HandleFunc("/api/project", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		p := a.projects[r.URL.Query().Get("id")]
		var c Project
		if p != nil {
			c = *p
		}
		a.mu.Unlock()
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		kit.JSON(w, c)
	})
	mux.HandleFunc("/api/img", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if a.get(id) == nil {
			http.NotFound(w, r)
			return
		}
		n := map[string]string{"view": "view.png", "mask": "mask.png", "fg": "fg.png", "thumb": "thumb.png"}[r.URL.Query().Get("k")]
		if n == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, filepath.Join(a.dir(id), n))
	})
	// Maske aus dem Browser speichern (nach Pinsel-Nacharbeit)
	mux.HandleFunc("/api/mask", func(w http.ResponseWriter, r *http.Request) {
		p := a.get(r.URL.Query().Get("id"))
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 64<<20))
		if err != nil {
			kit.Fail(w, 400, "Die Maske kam nicht an.")
			return
		}
		img, err := png.Decode(bytes.NewReader(body))
		if err != nil {
			kit.Fail(w, 400, "Die Maske ist kein gültiges Bild.")
			return
		}
		m, err := maskPlane(img, p.MW, p.MH)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		I, err := a.loadView(p.ID)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		if err := writeGray(filepath.Join(a.dir(p.ID), "mask.png"), m); err != nil {
			kit.Fail(w, 500, "Die Maske ließ sich nicht speichern.")
			return
		}
		a.writeDerived(p.ID, I, m)
		a.mu.Lock()
		p.Ver++
		p.Updated = time.Now().Unix()
		p.Result = ""
		a.save(p)
		v := p.Ver
		a.mu.Unlock()
		kit.JSON(w, map[string]int{"ver": v})
	})
	// Motiv einkreisen: die KI rechnet nur im Rechteck; dessen Maske ersetzt (mode=replace) oder ergänzt (mode=add) die bisherige.
	mux.HandleFunc("/api/region", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			ID         string `json:"id"`
			X, Y, W, H float64
			Mode       string `json:"mode"`
		}
		json.NewDecoder(r.Body).Decode(&rq)
		p := a.get(rq.ID)
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		x0, y0 := int(rq.X*float64(p.MW)), int(rq.Y*float64(p.MH))
		x1, y1 := int((rq.X+rq.W)*float64(p.MW)), int((rq.Y+rq.H)*float64(p.MH))
		x0, y0, x1, y1 = max(0, x0), max(0, y0), min(p.MW, x1), min(p.MH, y1)
		if x1-x0 < 16 || y1-y0 < 16 {
			kit.Fail(w, 400, "Der Bereich ist zu klein. Ziehe einen größeren Rahmen um das Motiv.")
			return
		}
		a.aiMu.Lock()
		defer a.aiMu.Unlock()
		sess, err := ai.Acquire(model)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		defer ai.Done(model)
		I, err := a.loadView(p.ID)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		m, err := a.loadMask(p.ID, p.MW, p.MH)
		if err != nil {
			m = newPlane(p.MW, p.MH, 1)
		}
		rm, err := region(sess, I, x0, y0, x1, y1)
		if err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		if rq.Mode != "add" { // nur dieses Motiv behalten
			for i := range m.p {
				m.p[i] = 0
			}
		}
		for y := y0; y < y1; y++ {
			for x := x0; x < x1; x++ {
				v := rm.p[(y-y0)*(x1-x0)+x-x0]
				if rq.Mode == "add" {
					v = max(v, m.p[y*p.MW+x])
				}
				m.p[y*p.MW+x] = v
			}
		}
		writeGray(filepath.Join(a.dir(p.ID), "mask.png"), m)
		a.writeDerived(p.ID, I, m)
		a.mu.Lock()
		p.Ver++
		p.Updated = time.Now().Unix()
		p.Result = ""
		a.save(p)
		v := p.Ver
		a.mu.Unlock()
		kit.JSON(w, map[string]int{"ver": v})
	})
	// Zurück zum Ergebnis der KI bzw. neu berechnen
	mux.HandleFunc("/api/reset", func(w http.ResponseWriter, r *http.Request) {
		p := a.get(r.URL.Query().Get("id"))
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		a.mu.Lock()
		if p.Status != "running" && p.Status != "waiting" {
			a.enqueue(p)
			a.save(p)
		}
		a.mu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			ID       string `json:"id"`
			Bg       string `json:"bg"`
			Format   string `json:"format"`
			OutDir   string `json:"outDir"`
			Download bool   `json:"download"`
		}
		json.NewDecoder(r.Body).Decode(&rq)
		p := a.get(rq.ID)
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		if p.Status != "ready" {
			kit.Fail(w, 400, "Das Bild ist noch nicht fertig freigestellt.")
			return
		}
		dir := rq.OutDir
		if rq.Download {
			dir = downloadsDir()
		}
		dst, err := a.export(p, rq.Bg, rq.Format, dir)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		st, _ := os.Stat(dst)
		a.mu.Lock()
		p.Result, p.Bg = dst, rq.Bg
		if !rq.Download && rq.OutDir != "" {
			p.OutDir = rq.OutDir
		}
		if st != nil {
			p.Bytes = st.Size()
		}
		a.save(p)
		a.mu.Unlock()
		kit.JSON(w, map[string]any{"path": dst, "bytes": p.Bytes})
	})
	mux.HandleFunc("/api/ai", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			ai.Install(model)
		}
		kit.JSON(w, ai.Get(model))
	})
	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		a.mu.Lock()
		p := a.projects[id]
		if p != nil && p.Status != "running" {
			delete(a.projects, id)
			os.RemoveAll(a.dir(id))
		}
		a.mu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
}

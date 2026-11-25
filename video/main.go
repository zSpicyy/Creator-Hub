// Videoschnitt: Schnittprogramm im Aufbau der großen Editoren (Bibliothek, Player, Eigenschaften, Zeitleiste).
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
	"sort"
	"strings"
	"sync"
	"time"

	"kit"
	"kit/ffmpeg"
)

//go:embed web
var webFS embed.FS

type Media struct {
	ID       string  `json:"id"`
	Path     string  `json:"path"`
	Name     string  `json:"name"`
	Kind     string  `json:"kind"` // video | audio | image
	Dur      float64 `json:"dur"`
	W        int     `json:"w"`
	H        int     `json:"h"`
	FPS      float64 `json:"fps"`
	HasAudio bool    `json:"hasAudio"`
	Size     int64   `json:"size"`
	Proxy    string  `json:"proxy"` // "" | "wait" | "work" | "ok" | "direct" | "error"
	ProxyPct float64 `json:"proxyPct"`
	Thumbs   int     `json:"thumbs"`
	Step     float64 `json:"step"` // Abstand der Vorschaubilder in Sekunden
	Wave     bool    `json:"wave"`
	Missing  bool    `json:"missing"`
	Error    string  `json:"error"`
	VCodec   string  `json:"vcodec,omitempty"`
	ACodec   string  `json:"acodec,omitempty"`
	PixFmt   string  `json:"pixfmt,omitempty"`
}

type Text struct {
	Content string  `json:"content"`
	Font    string  `json:"font"`
	Size    float64 `json:"size"` // Anteil der Bildhöhe
	Color   string  `json:"color"`
	Box     string  `json:"box"` // Hintergrundfarbe oder leer
	Outline float64 `json:"outline"`
	OColor  string  `json:"ocolor"`
	Shadow  bool    `json:"shadow"`
	Bold    bool    `json:"bold"`
	Align   string  `json:"align"`
}

type Trans struct {
	Type   string  `json:"type"` // xfade-Name oder "custom:<id>"
	Dur    float64 `json:"dur"`
	Custom *Custom `json:"custom,omitempty"`
}

type Clip struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"` // media | text | color
	MediaID   string  `json:"mediaId,omitempty"`
	Start     float64 `json:"start"`
	In        float64 `json:"in"`
	Out       float64 `json:"out"`
	Dur       float64 `json:"dur"` // für Text, Farbe und Bilder
	Speed     float64 `json:"speed"`
	Volume    float64 `json:"volume"`
	Mute      bool    `json:"mute"`
	FadeIn    float64 `json:"fadeIn"`
	FadeOut   float64 `json:"fadeOut"`
	Opacity   float64 `json:"opacity"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Scale     float64 `json:"scale"`
	Rot       float64 `json:"rot"`
	FlipH     bool    `json:"flipH"`
	FlipV     bool    `json:"flipV"`
	Bright    float64 `json:"bright"`
	Contrast  float64 `json:"contrast"`
	Sat       float64 `json:"sat"`
	Effect    string  `json:"effect"`
	EffectAmt float64 `json:"effectAmt"`
	Color     string  `json:"color,omitempty"`
	Text      *Text   `json:"text,omitempty"`
	TransIn   *Trans  `json:"transIn,omitempty"`
	Name      string  `json:"name"`
	// Filmora-Funktionen
	Reverse bool   `json:"reverse,omitempty"`
	Smooth  bool   `json:"smooth,omitempty"` // flüssige Zeitlupe (Zwischenbilder berechnen)
	Matte   string `json:"matte,omitempty"`  // KI-Maske (Hintergrund entfernt), Graustufen-Video
	// Nested: die ursprünglichen Clips eines verschachtelten Clips (zum Auflösen)
	Nested  json.RawMessage `json:"nested,omitempty"`
	CropL   float64         `json:"cropL,omitempty"`
	CropT   float64         `json:"cropT,omitempty"`
	CropR   float64         `json:"cropR,omitempty"`
	CropB   float64         `json:"cropB,omitempty"`
	Temp    float64         `json:"temp,omitempty"`
	Tint    float64         `json:"tint,omitempty"`
	Expo    float64         `json:"expo,omitempty"`
	Vig     float64         `json:"vig,omitempty"`
	Enhance bool            `json:"enhance,omitempty"`
	Key     string          `json:"key,omitempty"`
	KeySim  float64         `json:"keySim,omitempty"`
	KeyEdge float64         `json:"keyEdge,omitempty"`
	Stab    bool            `json:"stab,omitempty"`
	Pitch   float64         `json:"pitch,omitempty"`
	Denoise bool            `json:"denoise,omitempty"`
	// Keyframes je Eigenschaft (x, y, scale, rot, opacity, volume): [Zeit ab Clipanfang, Wert]
	Kf    map[string][][2]float64 `json:"kf,omitempty"`
	KfLin bool                    `json:"kfLin,omitempty"` // Schlüsselbilder gleichmäßig verbinden
	// Textanimation (Ein- und Ausgang) und Mischmodus
	Anim  *Anim  `json:"anim,omitempty"`
	Blend string `json:"blend,omitempty"`
	// Paket 1: Maske, Bereich unkenntlich machen, Farbe (Farbton, Kurven, LUT), Ton (Equalizer, Stimme, Ducking)
	Mask   *Mask   `json:"mask,omitempty"`
	Region *Region `json:"region,omitempty"`
	Hue    float64 `json:"hue,omitempty"`
	Curves *Curves `json:"curves,omitempty"`
	Lut    string  `json:"lut,omitempty"`
	EqLow  float64 `json:"eqLow,omitempty"`
	EqMid  float64 `json:"eqMid,omitempty"`
	EqHigh float64 `json:"eqHigh,omitempty"`
	Voice  string  `json:"voice,omitempty"`
	Duck   bool    `json:"duck,omitempty"`
	// Resolve-Funktionen: Farbräder, Tonbearbeitung (Fairlight), Spill-Unterdrückung
	Wheels *Wheels  `json:"wheels,omitempty"`
	Audio  *AudioFx `json:"audio,omitempty"`
	Spill  float64  `json:"spill,omitempty"`
}

// Wheels: Farbräder wie in Resolve, je [Rot, Grün, Blau, Gesamt] (etwa −1 … 1).
type Wheels struct {
	Lift   [4]float64 `json:"lift"`
	Gamma  [4]float64 `json:"gamma"`
	Gain   [4]float64 `json:"gain"`
	Offset [4]float64 `json:"offset"`
}

// AudioFx: Tonbearbeitung je Clip (wie Fairlight).
type AudioFx struct {
	HPF   float64 `json:"hpf,omitempty"`   // Hochpass in Hz (Brummen/Rumpeln weg)
	LPF   float64 `json:"lpf,omitempty"`   // Tiefpass in Hz
	Gate  float64 `json:"gate,omitempty"`  // Noise Gate, Schwelle in dB (z. B. -45)
	Comp  float64 `json:"comp,omitempty"`  // Kompressor-Stärke 0 … 1
	DeEss float64 `json:"deess,omitempty"` // De-Esser 0 … 1
	Limit bool    `json:"limit,omitempty"` // Limiter bei −1 dB
	Gain  float64 `json:"gain,omitempty"`  // Verstärkung in dB
}

// Mask: sichtbarer Bereich eines Clips (Mitte X/Y und Größe W/H als Anteil des Clipbildes).
type Mask struct {
	Shape   string  `json:"shape"` // rect | ellipse
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	W       float64 `json:"w"`
	H       float64 `json:"h"`
	Feather float64 `json:"feather"`
	Invert  bool    `json:"invert"`
}

// Region: Bereich verpixeln oder unscharf machen (z. B. Gesichter, Kennzeichen).
type Region struct {
	Mode string  `json:"mode"` // blur | pixel
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
	Amt  float64 `json:"amt"`
	// Path: verfolgte Bewegung [Zeit im Clip, Mitte x, Mitte y]
	Path [][3]float64 `json:"path,omitempty"`
}

// Curves: Punkte 0..1 je Kanal.
type Curves struct {
	V [][2]float64 `json:"v"`
	R [][2]float64 `json:"r"`
	G [][2]float64 `json:"g"`
	B [][2]float64 `json:"b"`
}

// Anim beschreibt, wie ein Text erscheint und verschwindet.
type Anim struct {
	In  string  `json:"in"`  // fade | slide-l | slide-r | slide-u | slide-d | pop | type
	Out string  `json:"out"` // fade | slide-l | slide-r | slide-u | slide-d | pop
	D   float64 `json:"d"`
}

// Marker ist eine farbige Markierung auf dem Lineal.
type Marker struct {
	ID    string  `json:"id"`
	T     float64 `json:"t"`
	Color string  `json:"color"`
	Name  string  `json:"name"`
}

type Track struct {
	ID     string  `json:"id"`
	Kind   string  `json:"kind"` // video | audio
	Name   string  `json:"name"`
	Mute   bool    `json:"mute"`
	Hidden bool    `json:"hidden"`
	Locked bool    `json:"locked"`
	Subs   bool    `json:"subs,omitempty"` // Untertitel-Spur
	Vol    float64 `json:"vol,omitempty"`  // Lautstärke der ganzen Spur (0 = 100 %)
	Clips  []*Clip `json:"clips"`
}

type Project struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Created int64    `json:"created"`
	Updated int64    `json:"updated"`
	Detail  string   `json:"detail"`
	W       int      `json:"w"`
	H       int      `json:"h"`
	FPS     float64  `json:"fps"`
	Media   []*Media `json:"media"`
	Tracks  []*Track `json:"tracks"`
	Export  *Export  `json:"export,omitempty"`
	Markers []Marker `json:"markers"`

	dirty    bool // Änderungen seit dem letzten Speichern (liegen nur im Arbeitsstand)
	draftOld bool // beim Start lag noch ein nicht gespeicherter Arbeitsstand vom letzten Mal
}

const draftFile = "arbeitsstand.json"

type App struct {
	mu       sync.Mutex
	root     string
	projects map[string]*Project
	eng      *ffmpeg.Engine
	jobs     chan job
	render   map[string]*RenderJob
	lib      *Library
}

func (a *App) dir(id string) string { return filepath.Join(a.root, "projects", id) }

// save schreibt den aktuellen Stand. Gibt es ungespeicherte Änderungen, landet er nur im
// Arbeitsstand (Schutz vor Abstürzen); project.json ändert sich erst beim Speichern.
func (a *App) save(p *Project) {
	name := "project.json"
	if p.dirty {
		name = draftFile
	}
	a.writeProject(p, name)
}

func (a *App) writeProject(p *Project, name string) {
	os.MkdirAll(a.dir(p.ID), 0o755)
	b, _ := json.MarshalIndent(p, "", " ")
	tmp := filepath.Join(a.dir(p.ID), name+".tmp")
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, filepath.Join(a.dir(p.ID), name))
	}
}

// commit speichert wirklich: project.json schreiben, Arbeitsstand löschen.
func (a *App) commit(p *Project) {
	p.dirty, p.draftOld = false, false
	p.Updated = time.Now().Unix()
	p.Detail = fmt.Sprintf("%d × %d · %s", p.W, p.H, clock(duration(p)))
	a.writeProject(p, "project.json")
	os.Remove(filepath.Join(a.dir(p.ID), draftFile))
}

// revert verwirft alles seit dem letzten Speichern. Importierte Dateien bleiben in der Medienliste.
func (a *App) revert(p *Project) error {
	b, err := os.ReadFile(filepath.Join(a.dir(p.ID), "project.json"))
	if err != nil {
		return err
	}
	var q Project
	if err := json.Unmarshal(b, &q); err != nil {
		return err
	}
	have := map[string]bool{}
	for _, m := range q.Media {
		have[m.ID] = true
	}
	for _, m := range p.Media {
		if !have[m.ID] {
			q.Media = append(q.Media, m)
		}
	}
	// laufende Vorbereitungen behalten ihren Stand
	cur := map[string]*Media{}
	for _, m := range p.Media {
		cur[m.ID] = m
	}
	for i, m := range q.Media {
		if c := cur[m.ID]; c != nil {
			q.Media[i] = c
		}
	}
	p.Name, p.W, p.H, p.FPS, p.Tracks, p.Markers, p.Export, p.Media = q.Name, q.W, q.H, q.FPS, q.Tracks, q.Markers, q.Export, q.Media
	p.dirty = false
	a.writeProject(p, "project.json")
	os.Remove(filepath.Join(a.dir(p.ID), draftFile))
	return nil
}

func (a *App) anyDirty() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, p := range a.projects {
		if p.dirty {
			return true
		}
	}
	return false
}

func newApp(root string) *App {
	a := &App{root: root, projects: map[string]*Project{}, eng: ffmpeg.Shared(), jobs: make(chan job, 1024), render: map[string]*RenderJob{}}
	a.lib = newLibrary(filepath.Join(root, "Bibliothek"))
	os.MkdirAll(filepath.Join(root, "projects"), 0o755)
	es, _ := os.ReadDir(filepath.Join(root, "projects"))
	for _, e := range es {
		b, err := os.ReadFile(filepath.Join(root, "projects", e.Name(), "project.json"))
		var p Project
		if err == nil && json.Unmarshal(b, &p) == nil && p.ID != "" {
			for _, m := range p.Media { // unterbrochene Vorbereitung neu anstoßen
				if m.Proxy == "work" || m.Proxy == "wait" {
					m.Proxy = ""
				}
			}
			if _, err := os.Stat(filepath.Join(root, "projects", p.ID, draftFile)); err == nil {
				p.draftOld = true
			}
			a.projects[p.ID] = &p
		}
	}
	for i := 0; i < 2; i++ {
		go a.worker()
		go a.worker() // zwei Dateien gleichzeitig vorbereiten
	}
	for _, p := range a.projects {
		for _, m := range p.Media {
			a.prepare(p, m)
		}
	}
	// ältere Projekte ohne Vorschaubild nachträglich versorgen
	go func() {
		a.mu.Lock()
		ps := make([]*Project, 0, len(a.projects))
		for _, p := range a.projects {
			ps = append(ps, p)
		}
		a.mu.Unlock()
		for _, p := range ps {
			a.projectThumb(p)
		}
	}()
	return a
}

func (a *App) newProject(name string, w, h int, fps float64) *Project {
	if w <= 0 || h <= 0 {
		w, h = 1920, 1080
	}
	if fps <= 0 {
		fps = 30
	}
	if strings.TrimSpace(name) == "" {
		name = "Mein Video"
	}
	p := &Project{ID: kit.RandID(6), Name: strings.TrimSpace(name), Created: time.Now().Unix(), Updated: time.Now().Unix(), W: w, H: h, FPS: fps,
		Media: []*Media{},
		Tracks: []*Track{
			{ID: kit.RandID(4), Kind: "video", Name: "Video 2", Clips: []*Clip{}},
			{ID: kit.RandID(4), Kind: "video", Name: "Video 1", Clips: []*Clip{}},
			{ID: kit.RandID(4), Kind: "audio", Name: "Audio 1", Clips: []*Clip{}},
			{ID: kit.RandID(4), Kind: "audio", Name: "Audio 2", Clips: []*Clip{}},
		}}
	p.Detail = fmt.Sprintf("%d × %d", w, h)
	a.mu.Lock()
	a.projects[p.ID] = p
	a.save(p)
	a.mu.Unlock()
	return p
}

// update übernimmt Zeitleiste und Einstellungen aus der Oberfläche. Medien verwaltet der Server selbst.
func (a *App) update(id string, in *Project) (*Project, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.projects[id]
	if p == nil {
		return nil, errors.New("Projekt nicht gefunden.")
	}
	if in.Name != "" {
		p.Name = in.Name
	}
	if in.W > 0 && in.H > 0 {
		p.W, p.H = in.W, in.H
	}
	if in.FPS > 0 {
		p.FPS = in.FPS
	}
	if in.Tracks != nil {
		p.Tracks = in.Tracks
	}
	if in.Export != nil {
		p.Export = in.Export
	}
	if in.Markers != nil {
		p.Markers = in.Markers
	}
	p.dirty = true
	a.save(p)
	return p, nil
}

func clock(s float64) string {
	t := int(s + 0.5)
	if t >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", t/3600, t%3600/60, t%60)
	}
	return fmt.Sprintf("%d:%02d", t/60, t%60)
}

func (c *Clip) Length() float64 {
	if c.Type != "media" || c.Out <= c.In {
		return c.Dur
	}
	sp := c.Speed
	if sp <= 0 {
		sp = 1
	}
	return (c.Out - c.In) / sp
}

func duration(p *Project) float64 {
	var d float64
	for _, t := range p.Tracks {
		for _, c := range t.Clips {
			if e := c.Start + c.Length(); e > d {
				d = e
			}
		}
	}
	return d
}

func (a *App) mediaOf(p *Project, id string) *Media {
	for _, m := range p.Media {
		if m.ID == id {
			return m
		}
	}
	return nil
}

func validID(id string) bool { return id != "" && !strings.ContainsAny(id, `/\.`) }

func (a *App) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		l, d, e := a.eng.State()
		a.mu.Lock()
		list := []*Project{}
		for _, p := range a.projects {
			list = append(list, p)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Updated > list[j].Updated })
		type lite struct {
			ID, Name, Detail string
			Updated          int64
			W, H             int
		}
		out := []lite{}
		for _, p := range list {
			out = append(out, lite{p.ID, p.Name, p.Detail, p.Updated, p.W, p.H})
		}
		a.mu.Unlock()
		gpu, gpuDone := hwStatus()
		kit.JSON(w, map[string]any{"projects": out, "engine": map[string]any{"ready": a.eng.Ready(), "loading": l, "done": d, "error": e}, "gpu": gpu, "gpuChecked": gpuDone,
			"transitions": transitions, "effects": effects, "fonts": fontNames(), "library": a.lib.list(), "videosDir": videosDir()})
	})
	mux.HandleFunc("/api/engine/install", func(w http.ResponseWriter, r *http.Request) {
		a.eng.Install()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/new", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			Name string
			W, H int
			FPS  float64
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq)
		kit.JSON(w, a.newProject(rq.Name, rq.W, rq.H, rq.FPS))
	})
	mux.HandleFunc("/api/project", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		switch r.Method {
		case "POST":
			var in Project
			if err := json.NewDecoder(io.LimitReader(r.Body, 64<<20)).Decode(&in); err != nil {
				kit.Fail(w, 400, "Ungültige Eingabe.")
				return
			}
			p, err := a.update(id, &in)
			if err != nil {
				kit.Fail(w, 404, err.Error())
				return
			}
			a.mu.Lock()
			kit.JSON(w, map[string]any{"updated": p.Updated, "detail": p.Detail, "dirty": p.dirty})
			a.mu.Unlock()
			go a.projectThumb(p)
		default:
			a.mu.Lock()
			defer a.mu.Unlock()
			p := a.projects[id]
			if p == nil {
				kit.Fail(w, 404, "Projekt nicht gefunden.")
				return
			}
			kit.JSON(w, struct {
				*Project
				Dirty bool `json:"dirty"`
				Draft bool `json:"draft"`
			}{p, p.dirty, p.draftOld})
		}
	})
	// Speichern / Verwerfen / Arbeitsstand vom letzten Mal
	mux.HandleFunc("/api/save", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		var in Project
		if r.ContentLength > 0 {
			json.NewDecoder(io.LimitReader(r.Body, 64<<20)).Decode(&in)
		}
		if r.ContentLength > 0 {
			if _, err := a.update(id, &in); err != nil {
				kit.Fail(w, 404, err.Error())
				return
			}
		}
		a.mu.Lock()
		p := a.projects[id]
		if p == nil {
			a.mu.Unlock()
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		a.commit(p)
		out := map[string]any{"updated": p.Updated, "detail": p.Detail, "dirty": false}
		a.mu.Unlock()
		go a.projectThumb(p)
		kit.JSON(w, out)
	})
	mux.HandleFunc("/api/revert", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		p := a.projects[r.URL.Query().Get("id")]
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		if err := a.revert(p); err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/draft", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		p := a.projects[r.URL.Query().Get("id")]
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		path := filepath.Join(a.dir(p.ID), draftFile)
		if r.URL.Query().Get("do") == "restore" {
			if b, err := os.ReadFile(path); err == nil {
				var q Project
				if json.Unmarshal(b, &q) == nil && q.ID == p.ID {
					p.Name, p.W, p.H, p.FPS, p.Tracks, p.Markers, p.Export = q.Name, q.W, q.H, q.FPS, q.Tracks, q.Markers, q.Export
					p.dirty = true
				}
			}
		} else {
			os.Remove(path)
		}
		p.draftOld = false
		kit.JSON(w, map[string]bool{"ok": true})
	})
	// /api/duplicate?id=…: Projekt mit allen Dateien im Projektordner kopieren
	mux.HandleFunc("/api/duplicate", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		a.mu.Lock()
		p := a.projects[id]
		if p == nil {
			a.mu.Unlock()
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		b, _ := json.Marshal(p)
		a.mu.Unlock()
		nid := kit.RandID(6)
		od, nd := a.dir(id), a.dir(nid)
		filepath.Walk(od, func(path string, fi os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			rel, _ := filepath.Rel(od, path)
			dst := filepath.Join(nd, rel)
			if fi.IsDir() {
				return os.MkdirAll(dst, 0o755)
			}
			if strings.HasSuffix(path, ".json") || strings.HasSuffix(path, ".tmp") {
				return nil
			}
			if in, err := os.Open(path); err == nil {
				if out, err := os.Create(dst); err == nil {
					io.Copy(out, in)
					out.Close()
				}
				in.Close()
			}
			return nil
		})
		// Pfade in den Projektordner auf die Kopie umbiegen
		ob, _ := json.Marshal(od)
		nb, _ := json.Marshal(nd)
		b = []byte(strings.ReplaceAll(string(b), strings.Trim(string(ob), `"`), strings.Trim(string(nb), `"`)))
		var q Project
		if err := json.Unmarshal(b, &q); err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		q.ID, q.Name = nid, q.Name+" (Kopie)"
		q.Created, q.Updated = time.Now().Unix(), time.Now().Unix()
		a.mu.Lock()
		a.projects[nid] = &q
		a.commit(&q)
		a.mu.Unlock()
		kit.JSON(w, map[string]string{"id": nid})
	})
	// /api/rename {ID, Name}
	mux.HandleFunc("/api/rename", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ ID, Name string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq)
		n := strings.TrimSpace(rq.Name)
		a.mu.Lock()
		defer a.mu.Unlock()
		p := a.projects[rq.ID]
		if p == nil || n == "" {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		p.Name = n
		// nur den Namen in der gespeicherten Fassung ändern, ungespeicherte Änderungen bleiben Entwurf
		pf := filepath.Join(a.dir(p.ID), "project.json")
		if raw, err := os.ReadFile(pf); err == nil {
			var m map[string]any
			if json.Unmarshal(raw, &m) == nil {
				m["name"] = n
				if nb, err := json.MarshalIndent(m, "", " "); err == nil {
					os.WriteFile(pf, nb, 0o644)
				}
			}
		}
		if p.dirty {
			a.save(p)
		}
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if !validID(id) {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		a.mu.Lock()
		delete(a.projects, id)
		a.mu.Unlock()
		os.RemoveAll(a.dir(id))
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/loudness", a.loudnessHandler)
	mux.HandleFunc("/api/import", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			ID    string
			Paths []string
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<22)).Decode(&rq)
		ms, err := a.importFiles(rq.ID, rq.Paths)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, ms)
	})
	mux.HandleFunc("/api/media", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		p := a.projects[r.URL.Query().Get("id")]
		var out []*Media
		if p != nil {
			b, _ := json.Marshal(p.Media)
			json.Unmarshal(b, &out)
		}
		a.mu.Unlock()
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		kit.JSON(w, out)
	})
	mux.HandleFunc("/api/media/remove", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		a.mu.Lock()
		defer a.mu.Unlock()
		p := a.projects[q.Get("id")]
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		for _, t := range p.Tracks {
			for _, c := range t.Clips {
				if c.MediaID == q.Get("m") {
					kit.Fail(w, 400, "Die Datei wird noch in der Zeitleiste benutzt.")
					return
				}
			}
		}
		for i, m := range p.Media {
			if m.ID == q.Get("m") {
				p.Media = append(p.Media[:i], p.Media[i+1:]...)
				os.RemoveAll(filepath.Join(a.dir(p.ID), "media", m.ID))
				break
			}
		}
		a.save(p)
		kit.JSON(w, map[string]bool{"ok": true})
	})
	// Dateien für die Vorschau: /api/file?id=&m=&k=play|thumb|wave&n=
	mux.HandleFunc("/api/file", a.serveFile)
	mux.HandleFunc("/api/snapshot", a.snapshot)
	mux.HandleFunc("/api/library/add", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ Paths []string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<22)).Decode(&rq)
		items, err := a.lib.addSounds(rq.Paths, a)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, items)
	})
	mux.HandleFunc("/api/library/addmedia", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ Paths []string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<22)).Decode(&rq)
		items, err := a.lib.addMedia(rq.Paths)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, items)
	})
	mux.HandleFunc("/api/sticker", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			ID, Name string
			Data     []byte
		}
		if json.NewDecoder(io.LimitReader(r.Body, 16<<20)).Decode(&rq) != nil {
			kit.Fail(w, 400, "Ungültige Eingabe.")
			return
		}
		p, err := a.lib.sticker(rq.Name, rq.Data)
		if err == nil {
			var ms []*Media
			if ms, err = a.importFiles(rq.ID, []string{p}); err == nil {
				kit.JSON(w, ms)
				return
			}
		}
		kit.Fail(w, 400, err.Error())
	})
	// eigene Tastenkürzel und Bereichsanordnung (gelten für alle Projekte)
	for _, n := range []string{"keys", "layout"} {
		file := filepath.Join(a.root, map[string]string{"keys": "tastenkuerzel.json", "layout": "anordnung.json"}[n])
		mux.HandleFunc("/api/"+n, func(w http.ResponseWriter, r *http.Request) {
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
	mux.HandleFunc("/api/favs", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			Tab, ID string
			On      bool
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&rq)
		kit.JSON(w, a.lib.setFav(rq.Tab, rq.ID, rq.On))
	})
	mux.HandleFunc("/api/library/remove", func(w http.ResponseWriter, r *http.Request) {
		a.lib.remove(r.URL.Query().Get("id"))
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/library/file", a.lib.serve)
	mux.HandleFunc("/api/library/use", func(w http.ResponseWriter, r *http.Request) {
		// Sound aus der Bibliothek ins Projekt übernehmen
		q := r.URL.Query()
		path := a.lib.path(q.Get("s"))
		if path == "" {
			kit.Fail(w, 404, "Sound nicht gefunden.")
			return
		}
		ms, err := a.importFiles(q.Get("id"), []string{path})
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, ms)
	})
	mux.HandleFunc("/api/transitions/save", func(w http.ResponseWriter, r *http.Request) {
		var c Custom
		if json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&c) != nil {
			kit.Fail(w, 400, "Ungültige Eingabe.")
			return
		}
		kit.JSON(w, a.lib.saveTransition(c))
	})
	mux.HandleFunc("/api/transitions/remove", func(w http.ResponseWriter, r *http.Request) {
		a.lib.removeTransition(r.URL.Query().Get("id"))
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/export", a.exportHandler)
	mux.HandleFunc("/api/export/job", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		j := a.render[r.URL.Query().Get("id")]
		if j == nil {
			kit.JSON(w, &RenderJob{})
			return
		}
		kit.JSON(w, j)
	})
	mux.HandleFunc("/api/export/cancel", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		j := a.render[r.URL.Query().Get("id")]
		a.mu.Unlock()
		if j != nil {
			j.cancel()
		}
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/thumb", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if !validID(id) {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(a.dir(id), "thumb.jpg"))
	})
}

func main() {
	k := kit.New("Videoschnitt", "Videoschnitt")
	k.W, k.H = 1440, 900
	app := newApp(k.Root)
	app.routes(k.Mux)
	app.analyzeRoutes(k.Mux)
	app.pkg2Routes(k.Mux)
	app.aiRoutes(k.Mux)
	k.OnClose = func() bool { return !app.busy() }
	k.Ask = app.anyDirty // ungespeicherte Änderungen: erst nachfragen
	niceSelf()
	go app.detectHW()     // Grafikkarte fürs Rendern schon im Hintergrund prüfen
	if !app.eng.Ready() { // ffmpeg gleich im Hintergrund einrichten, damit Videos sofort importiert werden können
		app.eng.Install()
	}
	go func() {
		for range time.Tick(2 * time.Second) {
			if k.Hidden() && !app.busy() {
				k.Quit()
				return
			}
		}
	}()
	sub, _ := fs.Sub(webFS, "web")
	solo.Enable(k, solo.Config{Tool: "Videoschnitt", Title: "Videoschnitt", TitleEN: "Video Editor", Logo: "video", Color: "#8a5ef0", Needs: []solo.Need{solo.FFmpeg("Damit Videos eingelesen, in der Vorschau abgespielt und exportiert werden können.", "So videos can be imported, previewed and exported.")}})
	k.Run(sub)
}

// busy: läuft gerade ein Export? Dann bleibt das Programm unsichtbar offen, bis er fertig ist.
func (a *App) busy() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, j := range a.render {
		if j.Running {
			return true
		}
	}
	return false
}

// videosDir: Standardordner für Exporte (Videos-Ordner des Nutzers).
func videosDir() string {
	h, _ := os.UserHomeDir()
	for _, n := range []string{"Videos", "Movies"} {
		if st, err := os.Stat(filepath.Join(h, n)); err == nil && st.IsDir() {
			return filepath.Join(h, n)
		}
	}
	return h
}

package main

import (
	"io/fs"
	"kit"
	"bufio"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

type Item struct {
	Src      string  `json:"src"`
	Out      string  `json:"out"`
	Kind     string  `json:"kind"`
	Status   string  `json:"status"` // waiting | running | done | error | skipped
	Msg      string  `json:"msg"`
	Pct      float64 `json:"pct"`
	InBytes  int64   `json:"inBytes"`
	OutBytes int64   `json:"outBytes"`
}

type Batch struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Created int64   `json:"created"`
	Updated int64   `json:"updated"`
	Detail  string  `json:"detail"`
	Target  string  `json:"target"`
	Quality string  `json:"quality"`
	OutDir  string  `json:"outDir"`
	Items   []*Item `json:"items"`
	Running bool    `json:"running"`
	cancel  chan struct{}
	cur     *exec.Cmd
}

type App struct {
	mu      sync.Mutex
	root    string
	batches map[string]*Batch
	eng     *Engine
}


func dataRoot() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	return filepath.Join(d, "Dateityp-Umwandler")
}

func (a *App) dir(id string) string { return filepath.Join(a.root, "projects", id) }

func (a *App) save(b *Batch) {
	os.MkdirAll(a.dir(b.ID), 0o755)
	data, _ := json.MarshalIndent(b, "", "  ")
	tmp := filepath.Join(a.dir(b.ID), "project.json.tmp")
	if os.WriteFile(tmp, data, 0o644) == nil {
		os.Rename(tmp, filepath.Join(a.dir(b.ID), "project.json"))
	}
}

func newApp() *App {
	a := &App{root: dataRoot(), batches: map[string]*Batch{}}
	a.eng = &Engine{dir: filepath.Join(a.root, "ffmpeg")}
	os.MkdirAll(filepath.Join(a.root, "projects"), 0o755)
	entries, _ := os.ReadDir(filepath.Join(a.root, "projects"))
	for _, e := range entries {
		data, err := os.ReadFile(filepath.Join(a.root, "projects", e.Name(), "project.json"))
		var b Batch
		if err == nil && json.Unmarshal(data, &b) == nil && b.ID != "" {
			b.Running = false
			for _, it := range b.Items { // beim letzten Mal unterbrochen
				if it.Status == "running" || it.Status == "waiting" {
					it.Status, it.Msg = "error", "Unterbrochen"
				}
			}
			a.batches[b.ID] = &b
		}
	}
	return a
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

type ConvReq struct {
	Files   []string `json:"files"`
	Target  string   `json:"target"`
	Quality string   `json:"quality"`
	OutDir  string   `json:"outDir"`
}

func (a *App) start(rq ConvReq) (*Batch, error) {
	if !a.eng.Ready() {
		return nil, errors.New("Die Umwandlung ist noch nicht eingerichtet.")
	}
	f := findFormat(rq.Target)
	if f == nil {
		return nil, errors.New("Unbekanntes Zielformat.")
	}
	if rq.OutDir != "" {
		if st, err := os.Stat(rq.OutDir); err != nil || !st.IsDir() {
			return nil, errors.New("Der Zielordner existiert nicht.")
		}
	}
	if rq.Quality != "high" && rq.Quality != "small" {
		rq.Quality = "medium"
	}
	b := &Batch{ID: kit.RandID(6), Created: time.Now().Unix(), Updated: time.Now().Unix(), Target: f.ID, Quality: rq.Quality, OutDir: rq.OutDir, cancel: make(chan struct{})}
	for _, p := range rq.Files {
		p = strings.Trim(strings.TrimSpace(p), `"`)
		if p == "" {
			continue
		}
		it := &Item{Src: p, Kind: kindOf(p), Status: "waiting"}
		if it.Kind == "unknown" {
			it.Kind = a.probe(p).Kind
		}
		st, err := os.Stat(p)
		switch {
		case err != nil || st.IsDir():
			it.Status, it.Msg = "skipped", "Datei nicht gefunden"
		case !possible(it.Kind, f):
			it.Status, it.Msg = "skipped", "Lässt sich nicht in "+f.Label+" umwandeln"
		default:
			it.InBytes = st.Size()
		}
		b.Items = append(b.Items, it)
	}
	if len(b.Items) == 0 {
		return nil, errors.New("Keine Dateien ausgewählt.")
	}
	first := filepath.Base(b.Items[0].Src)
	b.Name = strings.TrimSuffix(first, filepath.Ext(first))
	if len(b.Items) > 1 {
		b.Name += fmt.Sprintf(" und %d weitere", len(b.Items)-1)
	}
	b.Detail = fmt.Sprintf("%d Datei(en) → %s", len(b.Items), f.Label)
	b.Running = true
	a.mu.Lock()
	a.batches[b.ID] = b
	a.save(b)
	a.mu.Unlock()
	go a.run(b, f)
	return b, nil
}

func (a *App) run(b *Batch, f *Format) {
	ffmpeg := a.eng.find("ffmpeg")
	for i, it := range b.Items {
		select {
		case <-b.cancel:
			a.mu.Lock()
			for _, r := range b.Items[i:] {
				if r.Status == "waiting" {
					r.Status, r.Msg = "skipped", "Abgebrochen"
				}
			}
			a.mu.Unlock()
			goto end
		default:
		}
		if it.Status != "waiting" {
			continue
		}
		a.convertOne(b, it, f, ffmpeg)
		if i == 0 {
			a.thumb(b, it, ffmpeg)
		}
	}
end:
	a.mu.Lock()
	b.Running = false
	b.Updated = time.Now().Unix()
	done := 0
	for _, it := range b.Items {
		if it.Status == "done" {
			done++
		}
	}
	b.Detail = fmt.Sprintf("%d von %d → %s", done, len(b.Items), f.Label)
	a.save(b)
	a.mu.Unlock()
}

func (a *App) duration(src string) float64 {
	probe := a.eng.find("ffprobe")
	if probe == "" {
		return 0
	}
	c := exec.Command(probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", src)
	kit.HideCmd(c)
	out, err := c.Output()
	if err != nil {
		return 0
	}
	d, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return d
}

// Info beschreibt eine Datei, so wie ffprobe sie erkennt.
type Info struct {
	Path  string  `json:"path"`
	Kind  string  `json:"kind"`
	Size  int64   `json:"size"`
	W     int     `json:"w"`
	H     int     `json:"h"`
	Dur   float64 `json:"dur"`
	Codec string  `json:"codec"`
	Err   string  `json:"err"`
}

func (a *App) probe(p string) Info {
	p = strings.Trim(strings.TrimSpace(p), `"`)
	in := Info{Path: p, Kind: kindOf(p)}
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		in.Err = "Datei nicht gefunden"
		return in
	}
	in.Size = st.Size()
	probe := a.eng.find("ffprobe")
	if probe == "" {
		return in
	}
	cmd := exec.Command(probe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", p)
	kit.HideCmd(cmd)
	b, err := cmd.Output()
	if err != nil {
		if in.Kind == "unknown" {
			in.Err = "Kein Bild, Ton oder Video"
		}
		return in
	}
	var j struct {
		Streams []struct {
			Type   string `json:"codec_type"`
			Name   string `json:"codec_name"`
			W      int    `json:"width"`
			H      int    `json:"height"`
		} `json:"streams"`
		Format struct {
			Dur string `json:"duration"`
		} `json:"format"`
	}
	json.Unmarshal(b, &j)
	in.Dur, _ = strconv.ParseFloat(j.Format.Dur, 64)
	hasV, hasA := false, false
	for _, s := range j.Streams {
		if s.Type == "video" && s.W > 0 && !hasV {
			hasV, in.W, in.H, in.Codec = true, s.W, s.H, s.Name
		}
		if s.Type == "audio" {
			hasA = true
			if in.Codec == "" {
				in.Codec = s.Name
			}
		}
	}
	// Endung unbekannt: Art aus dem Inhalt ableiten
	if in.Kind == "unknown" {
		switch {
		case hasV && in.Dur > 0.5:
			in.Kind = "video"
		case hasV:
			in.Kind = "image"
		case hasA:
			in.Kind = "audio"
		}
	}
	return in
}

func friendly(stderr string) string {
	s := strings.ToLower(stderr)
	switch {
	case strings.Contains(s, "unknown encoder"), strings.Contains(s, "encoder not found"):
		return "Dieses Zielformat wird von der installierten ffmpeg-Version nicht unterstützt."
	case strings.Contains(s, "invalid data found"), strings.Contains(s, "moov atom not found"):
		return "Die Datei ist beschädigt oder kein Medium, das ich lesen kann."
	case strings.Contains(s, "no space left"), strings.Contains(s, "not enough space"):
		return "Auf dem Ziellaufwerk ist nicht genug Platz."
	case strings.Contains(s, "permission denied"):
		return "Kein Zugriff auf Datei oder Zielordner."
	case strings.Contains(s, "does not contain any stream"), strings.Contains(s, "output file does not contain"):
		return "In der Datei steckt nichts, was sich in dieses Format umwandeln lässt."
	}
	lines := strings.Split(strings.TrimSpace(stderr), "\n")
	if len(lines) > 0 && lines[len(lines)-1] != "" {
		return lines[len(lines)-1]
	}
	return "Die Umwandlung ist fehlgeschlagen."
}

func (a *App) convertOne(b *Batch, it *Item, f *Format, ffmpeg string) {
	dir := b.OutDir
	if dir == "" {
		dir = filepath.Dir(it.Src)
	}
	base := strings.TrimSuffix(filepath.Base(it.Src), filepath.Ext(it.Src))
	out := uniquePath(dir, base, f.Ext)
	tmp := filepath.Join(dir, ".umwandler-"+kit.RandID(4)+"."+f.Ext)
	total := a.duration(it.Src)
	args := ffmpegArgs(it.Src, tmp, f, it.Kind, b.Quality)
	cmd := exec.Command(ffmpeg, args...)
	kit.HideCmd(cmd)
	stdout, _ := cmd.StdoutPipe()
	var errBuf strings.Builder
	stderr, _ := cmd.StderrPipe()
	a.mu.Lock()
	it.Status, it.Out = "running", out
	b.cur = cmd
	a.mu.Unlock()
	if err := cmd.Start(); err != nil {
		a.mu.Lock()
		it.Status, it.Msg = "error", "ffmpeg ließ sich nicht starten"
		a.mu.Unlock()
		return
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(stderr)
		for sc.Scan() {
			errBuf.WriteString(sc.Text() + "\n")
			if errBuf.Len() > 8000 {
				s := errBuf.String()
				errBuf.Reset()
				errBuf.WriteString(s[len(s)-4000:])
			}
		}
	}()
	go func() {
		defer wg.Done()
		sc := bufio.NewScanner(stdout)
		for sc.Scan() {
			l := sc.Text()
			if v, ok := strings.CutPrefix(l, "out_time_us="); ok && total > 0 {
				us, _ := strconv.ParseFloat(v, 64)
				a.mu.Lock()
				it.Pct = min(0.99, us/1e6/total)
				a.mu.Unlock()
			}
		}
	}()
	wg.Wait()
	err := cmd.Wait()
	a.mu.Lock()
	defer a.mu.Unlock()
	b.cur = nil
	select {
	case <-b.cancel:
		os.Remove(tmp)
		it.Status, it.Msg = "skipped", "Abgebrochen"
		return
	default:
	}
	if err != nil {
		os.Remove(tmp)
		it.Status, it.Msg = "error", friendly(errBuf.String())
		return
	}
	if err := os.Rename(tmp, out); err != nil {
		os.Remove(tmp)
		it.Status, it.Msg = "error", "Die fertige Datei ließ sich nicht speichern."
		return
	}
	if st, err := os.Stat(out); err == nil {
		it.OutBytes = st.Size()
	}
	it.Status, it.Pct = "done", 1
}

func (a *App) thumb(b *Batch, it *Item, ffmpeg string) {
	if it.Kind != "video" && it.Kind != "image" {
		return
	}
	os.MkdirAll(a.dir(b.ID), 0o755)
	run := func(args ...string) {
		c := exec.Command(ffmpeg, args...)
		kit.HideCmd(c)
		c.Run()
	}
	run("-hide_banner", "-nostdin", "-y", "-ss", "1", "-i", it.Src, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", filepath.Join(a.dir(b.ID), "thumb.jpg"))
	if _, err := os.Stat(filepath.Join(a.dir(b.ID), "thumb.jpg")); err != nil { // kürzer als 1 s oder ein Bild
		run("-hide_banner", "-nostdin", "-y", "-i", it.Src, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", filepath.Join(a.dir(b.ID), "thumb.jpg"))
	}
}

func (a *App) routes(mux *http.ServeMux) {

	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		a.eng.mu.Lock()
		eng := map[string]any{"ready": a.eng.Ready(), "loading": a.eng.Loading, "done": a.eng.Done, "error": a.eng.Error}
		a.eng.mu.Unlock()
		a.mu.Lock()
		list := []*Batch{}
		for _, b := range a.batches {
			list = append(list, b)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Updated > list[j].Updated })
		kit.JSON(w, map[string]any{"engine": eng, "formats": formats, "batches": list})
		a.mu.Unlock()
	})
	mux.HandleFunc("/api/engine/install", func(w http.ResponseWriter, r *http.Request) {
		a.eng.Install()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/probe", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			Files []string `json:"files"`
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<22)).Decode(&rq)
		out := make([]Info, len(rq.Files))
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)
		for i, p := range rq.Files {
			wg.Add(1)
			sem <- struct{}{}
			go func(i int, p string) {
				defer wg.Done()
				out[i] = a.probe(p)
				<-sem
			}(i, p)
		}
		wg.Wait()
		kit.JSON(w, out)
	})
	mux.HandleFunc("/api/kinds", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			Files []string `json:"files"`
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<22)).Decode(&rq)
		out := map[string]int{}
		for _, p := range rq.Files {
			out[kindOf(strings.Trim(strings.TrimSpace(p), `"`))]++
		}
		kit.JSON(w, out)
	})
	mux.HandleFunc("/api/convert", func(w http.ResponseWriter, r *http.Request) {
		var rq ConvReq
		if json.NewDecoder(io.LimitReader(r.Body, 1<<24)).Decode(&rq) != nil {
			kit.Fail(w, 400, "Ungültige Eingabe.")
			return
		}
		b, err := a.start(rq)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, map[string]string{"id": b.ID})
	})
	mux.HandleFunc("/api/cancel", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		if b := a.batches[r.URL.Query().Get("id")]; b != nil && b.Running {
			select {
			case <-b.cancel:
			default:
				close(b.cancel)
			}
			if b.cur != nil && b.cur.Process != nil {
				b.cur.Process.Kill()
			}
		}
		a.mu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" || strings.ContainsAny(id, `/\.`) {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		a.mu.Lock()
		if b := a.batches[id]; b != nil && b.Running {
			a.mu.Unlock()
			kit.Fail(w, 400, "Erst abbrechen.")
			return
		}
		delete(a.batches, id)
		a.mu.Unlock()
		os.RemoveAll(a.dir(id))
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/img", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if strings.ContainsAny(id, `/\.`) {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(a.dir(id), "thumb.jpg"))
	})

}

func main() {
	k := kit.New("Dateityp-Umwandler", "Dateityp-Umwandler")
	app := newApp()
	app.root = k.Root
	app.routes(k.Mux)
	sub, _ := fs.Sub(webFS, "web")
	k.Run(sub)
}

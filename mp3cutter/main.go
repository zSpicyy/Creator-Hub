package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"kit"
	"kit/solo"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

type Project struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Created      int64    `json:"created"`
	Source       string   `json:"source"`
	OutDir       string   `json:"outDir"`
	Kind         string   `json:"kind"`
	Prefix       string   `json:"prefix"`
	Expected     int      `json:"expected"`
	MinLen       float64  `json:"minLen"`
	NoPause      bool     `json:"noPause"`
	Info         FileInfo `json:"info"`
	Analyzed     bool     `json:"analyzed"`
	Dur          float64  `json:"dur"`
	Cuts         []Cut    `json:"cuts"`
	Exported     []string `json:"exported"`
	Tracks       []Track  `json:"tracks"`
	Written      []string `json:"written"`
	Trashed      int      `json:"trashed"`
	PlaylistName string   `json:"playlistName"`
}

type Job struct {
	Kind    string  `json:"kind"` // analyze | export
	Running bool    `json:"running"`
	Done    float64 `json:"done"` // 0..1
	Text    string  `json:"text"`
	Err     string  `json:"err"`
	Started int64   `json:"started"`
	stop    chan struct{}
}

// Settings gelten für die ganze App.
type Settings struct {
	DefaultOutDir string `json:"defaultOutDir"`
	DefaultKind   string `json:"defaultKind"`
	NameFormat    string `json:"nameFormat"` // num-title, title, num-artist-title, artist-title
	WriteTags     bool   `json:"writeTags"`
	Subfolder     bool   `json:"subfolder"`
	Overwrite     bool   `json:"overwrite"`
	OpenAfter     bool   `json:"openAfter"`
	ReplaceOld    bool   `json:"replaceOld"`
	Cores         int    `json:"cores"`
	ClientID      string `json:"clientId"`
}

func (j *Job) mu(text string, a *App) {
	a.mu.Lock()
	j.Text = text
	a.mu.Unlock()
}

type App struct {
	mu       sync.Mutex
	set      Settings
	sp       *Spotify
	root     string
	projects map[string]*Project
	jobs     map[string]*Job
	cache    map[string]*Analysis
}

func dataRoot() string {
	if d := os.Getenv("MP3SCHNEIDER_DATA"); d != "" {
		return d
	}
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	return filepath.Join(d, "MP3-Schneider")
}

func newApp() *App {
	a := &App{root: dataRoot(), projects: map[string]*Project{}, jobs: map[string]*Job{}, cache: map[string]*Analysis{}}
	os.MkdirAll(filepath.Join(a.root, "projects"), 0o755)
	a.set = Settings{DefaultKind: "song", NameFormat: "num-title", WriteTags: true, ReplaceOld: true}
	if b, err := os.ReadFile(filepath.Join(a.root, "einstellungen.json")); err == nil {
		json.Unmarshal(b, &a.set)
	}
	analysisCores = a.set.Cores
	a.sp = newSpotify(a.root, func() string {
		a.mu.Lock()
		defer a.mu.Unlock()
		return a.set.ClientID
	})
	entries, _ := os.ReadDir(filepath.Join(a.root, "projects"))
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join(a.root, "projects", e.Name(), "project.json"))
		if err != nil {
			continue
		}
		var p Project
		if json.Unmarshal(b, &p) == nil && p.ID != "" {
			if len(p.Written) == 0 { // Projekte aus älteren Versionen
				for _, n := range p.Exported {
					p.Written = append(p.Written, filepath.Join(p.OutDir, n))
				}
			}
			a.projects[p.ID] = &p
		}
	}
	return a
}

func (a *App) dir(id string) string { return filepath.Join(a.root, "projects", id) }

func (a *App) save(p *Project) error {
	b, err := json.MarshalIndent(p, "", " ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(a.dir(p.ID), "project.json.tmp")
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(a.dir(p.ID), "project.json"))
}

func randID(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (a *App) analysis(p *Project) (*Analysis, error) {
	a.mu.Lock()
	an := a.cache[p.ID]
	a.mu.Unlock()
	if an != nil {
		return an, nil
	}
	an, err := loadFeat(filepath.Join(a.dir(p.ID), "analyse.bin"), p.Info.Size, p.Info.Modified)
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	a.cache[p.ID] = an
	cuts := append([]Cut(nil), p.Cuts...)
	a.mu.Unlock()
	if _, err := os.Stat(filepath.Join(a.dir(p.ID), "thumb.png")); err != nil {
		go waveThumb(an, cuts, filepath.Join(a.dir(p.ID), "thumb.png"))
	}
	return an, nil
}

func prefixOf(p *Project) string {
	if s := strings.TrimSpace(p.Prefix); s != "" {
		return s
	}
	if k, ok := kinds[p.Kind]; ok {
		return k.Prefix
	}
	return "Teil"
}

func cleanName(s string) string {
	r := strings.NewReplacer("<", "", ">", "", ":", "", "\"", "", "/", "", "\\", "", "|", "", "?", "", "*", "")
	s = strings.TrimRight(r.Replace(s), " .")
	if s == "" {
		return "Teil"
	}
	return s
}

func acceptedCuts(p *Project) []float64 {
	out := []float64{}
	for _, c := range p.Cuts {
		if c.Accepted {
			out = append(out, c.T)
		}
	}
	sort.Float64s(out)
	return out
}

func (a *App) startAnalyze(p *Project) {
	job := &Job{Kind: "analyze", Running: true, Text: "Analyse startet", Started: time.Now().Unix(), stop: make(chan struct{})}
	a.mu.Lock()
	a.jobs[p.ID] = job
	delete(a.cache, p.ID)
	a.mu.Unlock()
	go func() {
		featPath := filepath.Join(a.dir(p.ID), "analyse.bin")
		an, err := analyze(p.Source, featPath, job.stop, func(done, total int64, sec float64) {
			a.mu.Lock()
			job.Done = float64(done) / float64(total)
			job.Text = fmt.Sprintf("%s von der Aufnahme durchgehört", clock(sec))
			a.mu.Unlock()
		})
		a.mu.Lock()
		defer a.mu.Unlock()
		defer func() { job.Running = false }()
		if err != nil {
			if errors.Is(err, errCancelled) {
				job.Text = "Pausiert. Beim nächsten Start geht es an dieser Stelle weiter."
			} else {
				job.Err = err.Error()
			}
			return
		}
		kind, ok := kinds[p.Kind]
		if !ok {
			kind = kinds["song"]
		}
		if len(p.Tracks) > 0 {
			a.mu.Unlock()
			job.mu("Songs werden mit den Hörproben verglichen", a)
			found := matchTracks(an, p.Tracks, httpPreview)
			a.mu.Lock()
			if found > 0 {
				p.Tracks = orderByAnchors(p.Tracks)
			}
		}
		p.Cuts = detect(an, DetectOpts{Kind: kind, MinLen: p.MinLen, Expected: p.Expected, NoPause: p.NoPause, Tracks: p.Tracks})
		refineCuts(p.Source, an, p.Cuts)
		p.Dur = an.Dur
		p.Analyzed = true
		p.Exported = nil
		a.cache[p.ID] = an
		a.save(p)
		go waveThumb(an, append([]Cut(nil), p.Cuts...), filepath.Join(a.dir(p.ID), "thumb.png"))
		job.Done = 1
		job.Text = "Fertig"
	}()
}

// applyTracks füllt alle passenden Felder aus der Titelliste. Danach kann der Nutzer sie frei ändern.
func applyTracks(p *Project, tr []Track, name string) {
	if len(tr) == 0 {
		if p.Prefix == p.PlaylistName {
			p.Prefix = ""
		}
		p.Tracks, p.PlaylistName, p.Expected, p.MinLen = nil, "", 0, 0
		return
	}
	p.Tracks, p.Expected = tr, len(tr)
	if p.Kind != "song" && p.Kind != "music" {
		p.Kind = "song"
	}
	shortest := 0.0
	all := true
	for _, t := range tr {
		if t.Dur <= 0 {
			all = false
		} else if shortest == 0 || t.Dur < shortest {
			shortest = t.Dur
		}
	}
	p.MinLen = 0
	if all { // etwas Luft lassen, die Version in der Aufnahme kann kürzer sein
		p.MinLen = math.Max(10, math.Floor(shortest)-5)
	}
	if name != "" && (p.Prefix == "" || p.Prefix == p.PlaylistName) {
		p.Prefix = name
	}
	p.PlaylistName = name
}

func trackFileName(format string, nr int, t Track) string {
	title := cleanName(t.Title)
	art := cleanName(t.Artist)
	if t.Artist == "" {
		art = ""
	}
	withArt := title
	if art != "" {
		withArt = art + " - " + title
	}
	switch format {
	case "title":
		return title
	case "artist-title":
		return withArt
	case "num-artist-title":
		return fmt.Sprintf("%02d %s", nr, withArt)
	}
	return fmt.Sprintf("%02d %s", nr, title)
}

func clock(s float64) string {
	t := int(s)
	if t >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", t/3600, t/60%60, t%60)
	}
	return fmt.Sprintf("%d:%02d", t/60, t%60)
}

func (a *App) startExport(p *Project, an *Analysis) {
	job := &Job{Kind: "export", Running: true, Text: "Dateien werden geschrieben", Started: time.Now().Unix(), stop: make(chan struct{})}
	a.mu.Lock()
	a.jobs[p.ID] = job
	a.mu.Unlock()
	go func() {
		err := a.export(p, an, job)
		a.mu.Lock()
		defer a.mu.Unlock()
		job.Running = false
		if err != nil {
			if errors.Is(err, errCancelled) {
				job.Text = "Abgebrochen"
			} else {
				job.Err = err.Error()
			}
			return
		}
		a.save(p)
		job.Done = 1
		job.Text = "Fertig"
	}()
}

func (a *App) export(p *Project, an *Analysis, job *Job) error {
	a.mu.Lock()
	set := a.set
	a.mu.Unlock()
	dest := p.OutDir
	if set.Subfolder {
		dest = filepath.Join(dest, cleanName(p.Name))
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return fmt.Errorf("Der Zielordner lässt sich nicht anlegen: %v", err)
	}
	f, err := os.Open(p.Source)
	if err != nil {
		return fmt.Errorf("Die Quelldatei ist nicht erreichbar: %v", err)
	}
	defer f.Close()
	ranges, err := partRanges(f, an, acceptedCuts(p))
	if err != nil {
		return err
	}
	var total, done int64
	for _, r := range ranges {
		total += r[1] - r[0]
	}
	prefix := cleanName(prefixOf(p))
	buf := make([]byte, 4<<20)
	type part struct{ stem, tmp string }
	parts := []part{}
	cleanup := func() {
		for _, x := range parts {
			os.Remove(x.tmp)
		}
	}
	// Erst alle neuen Dateien vollständig schreiben. Die alten werden erst danach ersetzt.
	for i, r := range ranges {
		select {
		case <-job.stop:
			cleanup()
			return errCancelled
		default:
		}
		stem := fmt.Sprintf("%s %d", prefix, i+1)
		var tag []byte
		if i < len(p.Tracks) {
			stem = trackFileName(set.NameFormat, i+1, p.Tracks[i])
			if set.WriteTags {
				tag = id3Tag(p.Tracks[i], i+1)
			}
		}
		tmp := filepath.Join(dest, fmt.Sprintf("~%d.mp3schneider-tmp", i+1))
		out, err := os.Create(tmp)
		if err != nil {
			cleanup()
			return fmt.Errorf("%s lässt sich nicht anlegen: %v", stem, err)
		}
		parts = append(parts, part{stem, tmp})
		if _, err := out.Write(tag); err != nil {
			out.Close()
			cleanup()
			return fmt.Errorf("%s konnte nicht geschrieben werden: %v", stem, err)
		}
		if head, err := lengthHeader(f, r[0], r[1]); err == nil {
			if _, err := out.Write(head); err != nil {
				out.Close()
				cleanup()
				return fmt.Errorf("%s konnte nicht geschrieben werden: %v", stem, err)
			}
		}
		src := io.NewSectionReader(f, r[0], r[1]-r[0])
		for {
			n, re := src.Read(buf)
			if n > 0 {
				if _, we := out.Write(buf[:n]); we != nil {
					out.Close()
					cleanup()
					return fmt.Errorf("%s konnte nicht geschrieben werden. Ist die Platte voll? (%v)", stem, we)
				}
				done += int64(n)
				a.mu.Lock()
				job.Done = float64(done) / float64(total)
				job.Text = fmt.Sprintf("%s (%d von %d)", stem, i+1, len(ranges))
				a.mu.Unlock()
			}
			if re == io.EOF {
				break
			}
			if re != nil {
				out.Close()
				cleanup()
				return re
			}
			select {
			case <-job.stop:
				out.Close()
				cleanup()
				return errCancelled
			default:
			}
		}
		if err := out.Close(); err != nil {
			cleanup()
			return err
		}
	}
	// Alte Dateien dieses Projekts in den Papierkorb legen. Andere Dateien im Ordner bleiben unberührt.
	trashed := 0
	if set.ReplaceOld {
		old := []string{}
		for _, q := range p.Written {
			if strings.EqualFold(filepath.Clean(q), filepath.Clean(p.Source)) {
				continue
			}
			if st, e := os.Stat(q); e == nil && !st.IsDir() {
				old = append(old, q)
			}
		}
		if len(old) > 0 {
			if err := moveToTrash(old); err != nil {
				cleanup()
				return fmt.Errorf("Die alten Dateien ließen sich nicht in den Papierkorb legen: %v", err)
			}
			trashed = len(old)
		}
	}
	names, written := []string{}, []string{}
	for _, x := range parts {
		name := x.stem + ".mp3"
		path := filepath.Join(dest, name)
		for n := 2; !set.Overwrite; n++ { // vorhandene Dateien bleiben, außer es ist anders eingestellt
			if _, e := os.Stat(path); os.IsNotExist(e) {
				break
			}
			name = fmt.Sprintf("%s (%d).mp3", x.stem, n)
			path = filepath.Join(dest, name)
		}
		if err := os.Rename(x.tmp, path); err != nil {
			return fmt.Errorf("%s konnte nicht gespeichert werden: %v", name, err)
		}
		names = append(names, name)
		written = append(written, path)
	}
	a.mu.Lock()
	p.Exported, p.Written, p.Trashed = names, written, trashed
	a.mu.Unlock()
	if set.OpenAfter {
		openFolder(dest)
	}
	return nil
}

func (a *App) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/kinds", func(w http.ResponseWriter, r *http.Request) {
		order := []string{"song", "music", "take", "talk", "chapter", "stream"}
		out := []map[string]any{}
		for _, id := range order {
			k := kinds[id]
			out = append(out, map[string]any{"id": k.ID, "name": k.Name, "prefix": k.Prefix, "minLen": k.MinLen})
		}
		writeJSON(w, out)
	})
	mux.HandleFunc("GET /api/projects", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		out := []*Project{}
		for _, p := range a.projects {
			out = append(out, p)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Created > out[j].Created })
		b, err := json.Marshal(out)
		a.mu.Unlock()
		if err != nil {
			fail(w, 500, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("POST /api/projects", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name string `json:"name"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		in.Name = strings.TrimSpace(in.Name)
		if in.Name == "" {
			fail(w, 400, "Gib dem Projekt einen Namen.")
			return
		}
		p := &Project{ID: randID(6), Name: in.Name, Created: time.Now().Unix(), Kind: "song", NoPause: true, Cuts: []Cut{}}
		a.mu.Lock()
		if _, ok := kinds[a.set.DefaultKind]; ok {
			p.Kind = a.set.DefaultKind
		}
		p.OutDir = a.set.DefaultOutDir
		a.mu.Unlock()
		if err := os.MkdirAll(a.dir(p.ID), 0o755); err != nil {
			fail(w, 500, err.Error())
			return
		}
		a.mu.Lock()
		a.projects[p.ID] = p
		err := a.save(p)
		a.mu.Unlock()
		if err != nil {
			fail(w, 500, err.Error())
			return
		}
		writeJSON(w, p)
	})
	withP := func(h func(http.ResponseWriter, *http.Request, *Project)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			a.mu.Lock()
			p := a.projects[r.PathValue("id")]
			a.mu.Unlock()
			if p == nil {
				fail(w, 404, "Dieses Projekt gibt es nicht mehr.")
				return
			}
			h(w, r, p)
		}
	}
	mux.HandleFunc("PATCH /api/projects/{id}", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		var in map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			fail(w, 400, "Ungültige Eingabe.")
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		sourceChanged := false
		for key, raw := range in {
			switch key {
			case "name":
				json.Unmarshal(raw, &p.Name)
			case "outDir":
				json.Unmarshal(raw, &p.OutDir)
			case "kind":
				json.Unmarshal(raw, &p.Kind)
			case "prefix":
				json.Unmarshal(raw, &p.Prefix)
			case "expected":
				json.Unmarshal(raw, &p.Expected)
			case "minLen":
				json.Unmarshal(raw, &p.MinLen)
			case "noPause":
				json.Unmarshal(raw, &p.NoPause)
			case "cuts":
				json.Unmarshal(raw, &p.Cuts)
			case "source":
				var s string
				json.Unmarshal(raw, &s)
				s = strings.Trim(strings.TrimSpace(s), "\"")
				a.mu.Unlock()
				info, err := quickLook(s)
				a.mu.Lock()
				if err != nil {
					fail(w, 400, err.Error())
					return
				}
				if s != p.Source || info.Size != p.Info.Size || info.Modified != p.Info.Modified {
					sourceChanged = true
				}
				p.Source, p.Info = s, info
			}
		}
		if sourceChanged {
			p.Analyzed, p.Cuts, p.Dur, p.Exported = false, []Cut{}, 0, nil
			delete(a.cache, p.ID)
			delete(a.jobs, p.ID)
			os.Remove(filepath.Join(a.dir(p.ID), "analyse.bin"))
		}
		a.save(p)
		writeJSON(w, p)
	}))
	mux.HandleFunc("POST /api/projects/{id}/tracks", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		var in struct {
			Input    string `json:"input"`
			Clear    bool   `json:"clear"`
			Playlist string `json:"playlist"`
			Name     string `json:"name"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		var tr []Track
		var plName string
		if in.Playlist != "" {
			var err error
			if tr, err = a.sp.playlistTracks(in.Playlist); err != nil {
				fail(w, 400, err.Error())
				return
			}
			plName = in.Name
		} else if !in.Clear {
			var err error
			if tr, plName, err = loadTracks(in.Input); err != nil {
				fail(w, 400, err.Error())
				return
			}
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		applyTracks(p, tr, plName)
		a.save(p)
		writeJSON(w, p)
	}))
	mux.HandleFunc("DELETE /api/projects/{id}", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		a.mu.Lock()
		defer a.mu.Unlock()
		if j := a.jobs[p.ID]; j != nil && j.Running {
			fail(w, 409, "Halte zuerst die laufende Arbeit an.")
			return
		}
		delete(a.projects, p.ID)
		delete(a.cache, p.ID)
		os.RemoveAll(a.dir(p.ID)) // löscht nur Projektdaten, nie Quell- oder Ausgabedateien
		w.WriteHeader(204)
	}))
	mux.HandleFunc("POST /api/projects/{id}/analyze", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		a.mu.Lock()
		j := a.jobs[p.ID]
		a.mu.Unlock()
		if j != nil && j.Running {
			fail(w, 409, "Die App arbeitet gerade an diesem Projekt.")
			return
		}
		if p.Source == "" {
			fail(w, 400, "Wähle zuerst eine MP3-Datei.")
			return
		}
		a.startAnalyze(p)
		w.WriteHeader(202)
	}))
	mux.HandleFunc("POST /api/projects/{id}/export", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		a.mu.Lock()
		j := a.jobs[p.ID]
		a.mu.Unlock()
		if j != nil && j.Running {
			fail(w, 409, "Die App arbeitet gerade an diesem Projekt.")
			return
		}
		if p.OutDir == "" {
			fail(w, 400, "Wähle zuerst einen Zielordner.")
			return
		}
		an, err := a.analysis(p)
		if err != nil {
			fail(w, 400, "Die Analyse fehlt. Starte sie bitte noch einmal.")
			return
		}
		a.startExport(p, an)
		w.WriteHeader(202)
	}))
	mux.HandleFunc("POST /api/projects/{id}/stop", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		a.mu.Lock()
		defer a.mu.Unlock()
		if j := a.jobs[p.ID]; j != nil && j.Running {
			select {
			case <-j.stop:
			default:
				close(j.stop)
			}
		}
		w.WriteHeader(204)
	}))
	mux.HandleFunc("GET /api/projects/{id}/job", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		a.mu.Lock()
		defer a.mu.Unlock()
		j := a.jobs[p.ID]
		if j == nil {
			writeJSON(w, &Job{})
			return
		}
		writeJSON(w, j)
	}))
	mux.HandleFunc("GET /api/projects/{id}/wave", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		an, err := a.analysis(p)
		if err != nil || len(an.Rms) == 0 {
			fail(w, 404, "Keine Analyse vorhanden.")
			return
		}
		n, _ := strconv.Atoi(r.URL.Query().Get("n"))
		if n < 100 || n > 8000 {
			n = 1600
		}
		from, to := 0, len(an.Rms)
		if v, e := strconv.ParseFloat(r.URL.Query().Get("from"), 64); e == nil {
			from = int(math.Max(0, v*10))
		}
		if v, e := strconv.ParseFloat(r.URL.Query().Get("to"), 64); e == nil && v > 0 {
			to = int(math.Min(float64(len(an.Rms)), v*10))
		}
		if to <= from {
			from, to = 0, len(an.Rms)
		}
		out := make([]int, n)
		for i := range out {
			x, y := from+i*(to-from)/n, from+(i+1)*(to-from)/n
			if y <= x {
				y = x + 1
			}
			m := uint8(0)
			for _, v := range an.Rms[x:min(y, len(an.Rms))] {
				if v > m {
					m = v
				}
			}
			out[i] = int(m)
		}
		writeJSON(w, map[string]any{"peaks": out, "dur": an.Dur})
	}))
	mux.HandleFunc("GET /api/projects/{id}/audio", withP(func(w http.ResponseWriter, r *http.Request, p *Project) {
		an, err := a.analysis(p)
		if err != nil {
			fail(w, 404, "Keine Analyse vorhanden.")
			return
		}
		from, _ := strconv.ParseFloat(r.URL.Query().Get("from"), 64)
		to, _ := strconv.ParseFloat(r.URL.Query().Get("to"), 64)
		f, err := os.Open(p.Source)
		if err != nil {
			fail(w, 404, "Die Quelldatei ist nicht erreichbar.")
			return
		}
		defer f.Close()
		start, err := byteAt(f, an, from)
		if err != nil {
			fail(w, 500, err.Error())
			return
		}
		end := an.Chunks[len(an.Chunks)-1].End
		if to > from {
			if end, err = byteAt(f, an, to); err != nil {
				fail(w, 500, err.Error())
				return
			}
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		http.ServeContent(w, r, "ton.mp3", time.Time{}, io.NewSectionReader(f, start, end-start))
	}))
	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		writeJSON(w, map[string]any{"settings": a.set, "maxCores": runtime.NumCPU()})
	})
	mux.HandleFunc("PUT /api/settings", func(w http.ResponseWriter, r *http.Request) {
		var in Settings
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			fail(w, 400, "Ungültige Eingabe.")
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		in.ClientID = strings.TrimSpace(in.ClientID)
		a.set = in
		analysisCores = in.Cores
		b, _ := json.MarshalIndent(in, "", " ")
		if err := os.WriteFile(filepath.Join(a.root, "einstellungen.json"), b, 0o644); err != nil {
			fail(w, 500, "Die Einstellungen ließen sich nicht speichern.")
			return
		}
		writeJSON(w, in)
	})
	mux.HandleFunc("GET /api/spotify/status", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, a.sp.status()) })
	mux.HandleFunc("POST /api/spotify/connect", func(w http.ResponseWriter, r *http.Request) {
		if err := a.sp.connect(); err != nil {
			fail(w, 400, err.Error())
			return
		}
		w.WriteHeader(202)
	})
	mux.HandleFunc("POST /api/spotify/disconnect", func(w http.ResponseWriter, r *http.Request) {
		a.sp.disconnect()
		w.WriteHeader(204)
	})
	mux.HandleFunc("GET /api/spotify/playlists", func(w http.ResponseWriter, r *http.Request) {
		l, err := a.sp.playlists()
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		writeJSON(w, l)
	})
	mux.HandleFunc("POST /api/spotify/dashboard", func(w http.ResponseWriter, r *http.Request) {
		openURL("https://developer.spotify.com/dashboard")
		w.WriteHeader(204)
	})
	mux.HandleFunc("POST /api/pick", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Mode string `json:"mode"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		path, err := pickPath(in.Mode)
		if err != nil {
			fail(w, 501, err.Error())
			return
		}
		writeJSON(w, map[string]string{"path": path})
	})
	mux.HandleFunc("POST /api/open-folder", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Path string `json:"path"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		openFolder(in.Path)
		w.WriteHeader(204)
	})
}

func main() {
	k := kit.New("MP3-Schneider", "MP3 Schneider")
	k.W, k.H = 1240, 820
	app := newApp()
	app.routes(k.Mux)
	sub, _ := fs.Sub(webFS, "web")
	solo.Enable(k, solo.Config{Tool: "MP3-Schneider", Title: "MP3 Schneider", TitleEN: "MP3 Splitter", Logo: "mp3", Color: "#f0663a"})
	k.Run(sub)
}

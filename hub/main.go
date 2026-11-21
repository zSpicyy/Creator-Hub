package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"hub/tools/convert"
	"hub/tools/cutout"
	"hub/tools/upscale"
	"io"
	"io/fs"
	"kit"
	"kit/setup"
	"kit/update"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

// Tool beschreibt ein Werkzeug. Kind: "hub" läuft direkt im Hub-Fenster, "app" ist ein eigenes Programm,
// "soon" ist noch in Arbeit. Projekte liegen unter <Konfigurationsordner>/<DataDir>/projects/<id>/project.json.
type Tool struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Desc       string   `json:"desc"`
	Category   string   `json:"category"`
	Tags       []string `json:"tags"`
	Kind       string   `json:"kind"`
	Exe        string   `json:"-"`
	DataDir    string   `json:"-"`
	Installed  bool     `json:"installed"`
	Installing bool     `json:"installing"`
	Progress   float64  `json:"progress"`
	Error      string   `json:"error"`
	Running    bool     `json:"running"`
	Last       int64    `json:"last"`
}

var tools = []Tool{
	{ID: "mp3", Kind: "app", Name: "MP3 Schneider", Desc: "Schneidet lange Aufnahmen automatisch an den Pausen in einzelne Dateien.", Category: "Audio", Tags: []string{"mp3", "audio", "songs", "schneiden", "playlist", "spotify"}, Exe: exeName("MP3-Schneider"), DataDir: "MP3-Schneider"},
	{ID: "convert", Kind: "hub", Name: "Dateityp-Umwandler", Desc: "Wandelt Videos, Musik und Bilder in andere Formate um.", Category: "Dateien", Tags: []string{"konvertieren", "format", "umwandeln", "png", "jpg", "mp4", "wav"}, Exe: "", DataDir: "Dateityp-Umwandler"},
	{ID: "cutout", Kind: "hub", Name: "Freisteller", Desc: "Entfernt Hintergründe und schneidet Motive aus, mit Auswahl und Einkreisen.", Category: "Bild", Tags: []string{"hintergrund", "freistellen", "transparent", "ausschneiden", "ki"}, Exe: "", DataDir: "Freisteller"},
	{ID: "image", Kind: "app", Name: "Bildbearbeitung", Desc: "Ebenen, Pinsel, Auswahl und Filter – Werkzeuge wie in GIMP.", Category: "Bild", Tags: []string{"gimp", "photoshop", "bild", "ebenen", "malen", "filter", "thumbnail"}, Exe: exeName("Bildbearbeitung"), DataDir: "Bildbearbeitung"},
	{ID: "motion", Kind: "app", Name: "Motion Design", Desc: "Animierte Titel, Motion Graphics und Effekte mit Ebenen und Keyframes. Aufgebaut wie After Effects.", Category: "Video", Tags: []string{"after effects", "animation", "motion", "keyframes", "titel", "ebenen", "effekte"}, Exe: exeName("Motion-Design"), DataDir: "MotionDesign"},
	{ID: "video", Kind: "app", Name: "Videoschnitt", Desc: "Zeitleiste, Übergänge, Effekte, Filter, Sticker und Sounds. Aufgebaut wie Filmora.", Category: "Video", Tags: []string{"video", "schnitt", "filmora", "übergänge", "effekte", "filter", "sticker", "rendern"}, Exe: exeName("Videoschnitt"), DataDir: "Videoschnitt"},
	{ID: "streampilot", Kind: "app", Name: "StreamPilot", Desc: "Songwünsche, Vorlesen (TTS), Alerts und Chat-Befehle für deinen Twitch-Stream.", Category: "Stream", Tags: []string{"twitch", "stream", "spotify", "songwünsche", "tts", "vorlesen", "alerts", "bot", "chat"}, Exe: exeName("StreamPilot"), DataDir: "StreamPilot"},
	{ID: "kanalwerk", Kind: "app", Name: "Kanalwerk", Desc: "Uploads planen, Statistiken von YouTube und Twitch, beste Zeiten, Kanal-Vergleich, Link-Seite und Ankündigungen.", Category: "Stream", Tags: []string{"youtube", "twitch", "planen", "upload", "statistik", "analyse", "kalender", "bericht", "discord", "link in bio"}, Exe: exeName("Kanalwerk"), DataDir: "Kanalwerk"},
	{ID: "upscale", Kind: "hub", Name: "Upscaler", Desc: "Macht Bilder mit KI 2-, 4- oder 8-mal so groß und schärfer.", Category: "Bild", Tags: []string{"upscale", "vergrößern", "hochskalieren", "qualität", "x2", "x4", "x8"}, Exe: "", DataDir: "Upscaler"},
}

type HistoryItem struct {
	Tool  string `json:"tool"`
	Start int64  `json:"start"`
	Secs  int64  `json:"secs"`
	Open  bool   `json:"open"`
}

type Account struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Color string `json:"color"`
}

type Settings struct {
	Lang          string   `json:"lang"` // en | de
	AutoUpdate    bool     `json:"autoUpdate"`
	Theme         string   `json:"theme"`   // black | dark | light | system
	Accent        string   `json:"accent"`  // Name der Akzentfarbe
	Density       string   `json:"density"` // normal | compact
	Sort          string   `json:"sort"`
	View          string   `json:"view"` // grid | list
	HistoryOn     bool     `json:"historyOn"`
	HistoryMax    int      `json:"historyMax"`
	MinimizeOn    bool     `json:"minimizeOn"`
	ToolsDir      string   `json:"toolsDir"`
	ConfirmQuit   bool     `json:"confirmQuit"`
	CustomAccents []string `json:"customAccents"`
	UpdQuiet      bool     `json:"updQuiet"`  // Update-Hinweis unten rechts nie von selbst zeigen
	UpdRemind     string   `json:"updRemind"` // Hinweis nach dem Wegklicken wieder zeigen: start | 1h | 4h | 1d
}

// inHub ist ein Werkzeug, das im Hub-Fenster läuft.
type inHub interface {
	Handler() http.Handler
	Busy() bool
	Installed() bool
	Install()
	State() (bool, float64, string)
	Release()
}

type App struct {
	mu       sync.Mutex
	root     string
	set      Settings
	acct     *Account
	history  []HistoryItem
	running  map[string]*exec.Cmd
	exeDir   string
	hubTools map[string]inHub
	open     map[string]int64 // im Hub geöffnete Werkzeuge mit Startzeit
	appInst  map[string]*Tool // Installationsstand der eigenständigen Programme
	quit     func()
	notice   string // Meldung für die Oberfläche (einmal anzeigen)
}

func dataRoot() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	return filepath.Join(d, "CreatorHub")
}

func (a *App) save(name string, v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	tmp := filepath.Join(a.root, name+".tmp")
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, filepath.Join(a.root, name))
	}
}

func (a *App) load(name string, v any) {
	if b, err := os.ReadFile(filepath.Join(a.root, name)); err == nil {
		json.Unmarshal(b, v)
	}
}

func newApp() *App {
	a := &App{root: dataRoot(), running: map[string]*exec.Cmd{}, open: map[string]int64{}, appInst: map[string]*Tool{},
		hubTools: map[string]inHub{"convert": convert.New(), "upscale": upscale.New(), "cutout": cutout.New()}}
	os.MkdirAll(a.root, 0o755)
	if ex, err := os.Executable(); err == nil {
		a.exeDir = filepath.Dir(ex)
	}
	a.set = Settings{AutoUpdate: true, Lang: "en", Theme: "black", Accent: "indigo", Density: "normal", Sort: "az", View: "grid", HistoryOn: true, HistoryMax: 100}
	a.load("einstellungen.json", &a.set)
	a.load("verlauf.json", &a.history)
	var ac Account
	a.load("konto.json", &ac)
	if ac.Name != "" {
		a.acct = &ac
	}
	// Ein Programm, das beim letzten Mal noch lief, gilt als beendet.
	for i := range a.history {
		if a.history[i].Open {
			a.history[i].Open = false
		}
	}
	return a
}

// findExe sucht das Werkzeug im eingestellten Ordner, in "Werkzeuge" und neben dem Hub.
func (a *App) findExe(t Tool) string {
	dirs := []string{}
	if a.set.ToolsDir != "" {
		dirs = append(dirs, a.set.ToolsDir)
	}
	dirs = append(dirs, toolsDir(), filepath.Join(a.exeDir, "Werkzeuge"), a.exeDir)
	for _, d := range dirs {
		p := filepath.Join(d, t.Exe)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func (a *App) toolList() []Tool {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]Tool, len(tools))
	copy(out, tools)
	for i := range out {
		t := &out[i]
		switch t.Kind {
		case "hub":
			h := a.hubTools[t.ID]
			t.Installed = h.Installed()
			t.Installing, t.Progress, t.Error = h.State()
			_, t.Running = a.open[t.ID]
		case "app":
			t.Installed = a.findExe(*t) != ""
			if st := a.appInst[t.ID]; st != nil {
				t.Installing, t.Progress, t.Error = st.Installing, st.Progress, st.Error
			}
			_, t.Running = a.running[t.ID]
		}
		for _, h := range a.history {
			if h.Tool == t.ID && h.Start > t.Last {
				t.Last = h.Start
			}
		}
	}
	return out
}

func toolByID(id string) *Tool {
	for i := range tools {
		if tools[i].ID == id {
			return &tools[i]
		}
	}
	return nil
}

// install richtet ein Werkzeug beim ersten Benutzen ein.
func (a *App) install(id string) error {
	t := toolByID(id)
	if t == nil {
		return fmt.Errorf("Unbekanntes Werkzeug.")
	}
	switch t.Kind {
	case "soon":
		return fmt.Errorf("%s ist noch in Arbeit.", t.Name)
	case "hub":
		a.hubTools[id].Install()
		if id == "convert" {
			go func() {
				for i := 0; i < 1800; i++ {
					if a.hubTools["convert"].Installed() {
						ensureConverterApp()
						return
					}
					time.Sleep(time.Second)
				}
			}()
		}
		return nil
	}
	a.mu.Lock()
	st := a.appInst[id]
	if st == nil {
		st = &Tool{}
		a.appInst[id] = st
	}
	if st.Installing {
		a.mu.Unlock()
		return nil
	}
	st.Installing, st.Error, st.Progress = true, "", 0
	a.mu.Unlock()
	go func() {
		err := extractTool(t.Exe, func(p float64) { a.mu.Lock(); st.Progress = p; a.mu.Unlock() })
		a.mu.Lock()
		st.Installing = false
		if err != nil {
			st.Error = err.Error()
		}
		a.mu.Unlock()
	}()
	return nil
}

func (a *App) addHistory(id string, start time.Time) {
	if !a.set.HistoryOn {
		return
	}
	a.history = append(a.history, HistoryItem{Tool: id, Start: start.Unix(), Open: true})
	if m := a.set.HistoryMax; m > 0 && len(a.history) > m {
		a.history = a.history[len(a.history)-m:]
	}
	a.save("verlauf.json", a.history)
}

func (a *App) endHistory(id string, start int64) {
	for i := len(a.history) - 1; i >= 0; i-- {
		h := &a.history[i]
		if h.Tool == id && h.Open && h.Start == start {
			h.Open = false
			h.Secs = time.Now().Unix() - start
			break
		}
	}
	a.save("verlauf.json", a.history)
}

// busy: läuft noch ein eigenständiges Programm oder rechnet ein Werkzeug im Hub?
func (a *App) busy() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.running) > 0 {
		return true
	}
	for _, h := range a.hubTools {
		if h.Busy() {
			return true
		}
	}
	return false
}

func (a *App) launch(id string, files []string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	var t *Tool
	for i := range tools {
		if tools[i].ID == id {
			t = &tools[i]
		}
	}
	if t == nil {
		return fmt.Errorf("Unbekanntes Werkzeug.")
	}
	if t.Kind == "hub" {
		if _, ok := a.open[id]; !ok {
			now := time.Now()
			a.open[id] = now.Unix()
			a.addHistory(id, now)
		}
		return nil
	}
	if t.Kind == "soon" {
		return fmt.Errorf("%s ist noch in Arbeit.", t.Name)
	}
	if len(files) > 0 {
		kit.SendTo(t.DataDir, files)
	}
	if _, ok := a.running[id]; ok {
		return nil // läuft schon; das Werkzeug holt sich die Dateien aus seinem Eingang
	}
	exe := a.findExe(*t)
	if exe == "" {
		return fmt.Errorf("%s ist noch nicht installiert.", t.Name)
	}
	cmd := exec.Command(exe)
	cmd.Dir = filepath.Dir(exe)
	for _, e := range os.Environ() { // Testeinstellungen des Hubs nicht an Werkzeuge weitergeben
		if !strings.HasPrefix(e, "KIT_PORT=") && !strings.HasPrefix(e, "KIT_TOKEN=") {
			cmd.Env = append(cmd.Env, e)
		}
	}
	// Kein HideCmd: das würde bei Fensterprogrammen das erste Fenster unsichtbar machen
	if err := kit.StartApp(cmd); err != nil {
		return fmt.Errorf("Der Start ist fehlgeschlagen: %v", err)
	}
	a.running[id] = cmd
	start := time.Now()
	a.addHistory(id, start)
	name := t.Name
	go func() {
		err := cmd.Wait()
		a.mu.Lock()
		defer a.mu.Unlock()
		delete(a.running, id)
		a.endHistory(id, start.Unix())
		if err != nil && time.Since(start) < 20*time.Second {
			cfg, _ := os.UserConfigDir()
			a.notice = fmt.Sprintf(kit.T("%s wurde direkt nach dem Start beendet (%v). Ein Fehlerbericht liegt in %s.", "%s closed right after starting (%v). An error report is in %s."), name, err, filepath.Join(cfg, t.DataDir, "absturz.txt"))
		}
	}()
	return nil
}

// Project ist die gemeinsame Sicht auf ein Projekt egal welches Werkzeug es angelegt hat.
type Project struct {
	Tool    string `json:"tool"`
	ID      string `json:"id"`
	Name    string `json:"name"`
	Created int64  `json:"created"`
	Updated int64  `json:"updated"`
	Thumb   bool   `json:"thumb"`
	Detail  string `json:"detail"`
}

func (a *App) projects() []Project {
	cfg, _ := os.UserConfigDir()
	out := []Project{}
	for _, t := range tools {
		dir := filepath.Join(cfg, t.DataDir, "projects")
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			pdir := filepath.Join(dir, e.Name())
			b, err := os.ReadFile(filepath.Join(pdir, "project.json"))
			if err != nil {
				continue
			}
			var raw struct {
				ID       string  `json:"id"`
				Name     string  `json:"name"`
				Created  int64   `json:"created"`
				Updated  int64   `json:"updated"`
				Detail   string  `json:"detail"`
				Analyzed bool    `json:"analyzed"`
				Dur      float64 `json:"dur"`
			}
			if json.Unmarshal(b, &raw) != nil || raw.ID == "" {
				continue
			}
			p := Project{Tool: t.ID, ID: raw.ID, Name: raw.Name, Created: raw.Created, Updated: raw.Updated, Detail: raw.Detail}
			if st, err := os.Stat(filepath.Join(pdir, "project.json")); err == nil && p.Updated == 0 {
				p.Updated = st.ModTime().Unix()
			}
			if t.ID == "mp3" && p.Detail == "" && raw.Dur > 0 {
				p.Detail = fmt.Sprintf("%d:%02d Min. Aufnahme", int(raw.Dur)/60, int(raw.Dur)%60)
			}
			if t.ID == "convert" {
				// Umwandler: kein Vorschaubild, der Name sagt, was umgewandelt wurde
			} else if _, err := os.Stat(filepath.Join(pdir, "thumb.png")); err == nil {
				p.Thumb = true
			} else if _, err := os.Stat(filepath.Join(pdir, "thumb.jpg")); err == nil {
				p.Thumb = true
			}
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Updated > out[j].Updated })
	return out
}

func (a *App) thumbPath(toolID, id string) string {
	cfg, _ := os.UserConfigDir()
	for _, t := range tools {
		if t.ID != toolID {
			continue
		}
		if strings.ContainsAny(id, `/\.`) {
			return ""
		}
		for _, n := range []string{"thumb.png", "thumb.jpg"} {
			p := filepath.Join(cfg, t.DataDir, "projects", id, n)
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return ""
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

func (a *App) routes(mux *http.ServeMux) {

	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		hist := append([]HistoryItem{}, a.history...)
		set, acct, notice := a.set, a.acct, a.notice
		a.notice = ""
		a.mu.Unlock()
		writeJSON(w, map[string]any{"tools": a.toolList(), "history": hist, "settings": set, "account": acct, "projects": a.projects(), "now": time.Now().Unix(), "notice": notice, "upd": a.updInfo(), "gpu": gpuOn()})
	})
	mux.HandleFunc("/api/gpu", func(w http.ResponseWriter, r *http.Request) {
		var b struct{ On bool }
		json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&b)
		if b.On {
			os.Remove(kit.GPUFlag())
		} else {
			os.MkdirAll(filepath.Dir(kit.GPUFlag()), 0o755)
			os.WriteFile(kit.GPUFlag(), []byte("nutzer"), 0o644)
		}
		writeJSON(w, map[string]bool{"on": gpuOn()})
	})
	mux.HandleFunc("/api/launch", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Files []string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<22)).Decode(&body)
		if err := a.launch(r.URL.Query().Get("id"), body.Files); err != nil {
			fail(w, 400, err.Error())
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/update", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("do") {
		case "check":
			writeJSON(w, update.Check(kit.Lang()))
			return
		case "download":
			update.Download()
		case "apply":
			if err := a.installNow(); err != nil { // Werkzeuge schließen, Hub kurz neu starten
				fail(w, 400, err.Error())
				return
			}
		}
		writeJSON(w, update.Get())
	})
	mux.HandleFunc("/api/install", func(w http.ResponseWriter, r *http.Request) {
		if err := a.install(r.URL.Query().Get("id")); err != nil {
			fail(w, 400, err.Error())
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/close", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		a.mu.Lock()
		if st, ok := a.open[id]; ok {
			delete(a.open, id)
			a.endHistory(id, st)
		}
		h := a.hubTools[id]
		a.mu.Unlock()
		if h != nil {
			go h.Release() // im Hintergrund: das Hauptmenü soll sofort wieder da sein
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	for id, h := range a.hubTools {
		mux.Handle("/t/"+id+"/", http.StripPrefix("/t/"+id, h.Handler()))
	}
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		var s Settings
		if json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&s) != nil {
			fail(w, 400, "Ungültige Einstellungen.")
			return
		}
		if s.HistoryMax < 10 || s.HistoryMax > 1000 {
			s.HistoryMax = 100
		}
		a.mu.Lock()
		a.set = s
		a.save("einstellungen.json", a.set)
		a.mu.Unlock()
		writeJSON(w, s)
	})
	mux.HandleFunc("/api/account", func(w http.ResponseWriter, r *http.Request) {
		var ac Account
		if json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&ac) != nil {
			fail(w, 400, "Ungültige Eingabe.")
			return
		}
		ac.Name = strings.TrimSpace(ac.Name)
		a.mu.Lock()
		defer a.mu.Unlock()
		if ac.Name == "" { // abmelden
			a.acct = nil
			os.Remove(filepath.Join(a.root, "konto.json"))
			writeJSON(w, map[string]any{"account": nil})
			return
		}
		a.acct = &ac
		a.save("konto.json", ac)
		writeJSON(w, map[string]any{"account": ac})
	})
	mux.HandleFunc("/api/history/clear", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		keep := []HistoryItem{}
		for _, h := range a.history {
			if h.Open {
				keep = append(keep, h)
			}
		}
		a.history = keep
		a.save("verlauf.json", a.history)
		a.mu.Unlock()
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/thumb", func(w http.ResponseWriter, r *http.Request) {
		p := a.thumbPath(r.URL.Query().Get("tool"), r.URL.Query().Get("id"))
		if p == "" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, p)
	})
	mux.HandleFunc("/api/open-data", func(w http.ResponseWriter, r *http.Request) {
		kit.OpenFolder(a.root)
		writeJSON(w, map[string]bool{"ok": true})
	})

}

func main() {
	if handleUninstall() || handleInstall() {
		return
	}
	k := kit.New("CreatorHub", "Creator Hub")
	k.W, k.H = 1280, 840
	app := newApp()
	go func() {
		var exes []string
		for _, t := range tools {
			if t.Kind == "app" && t.Exe != "" {
				exes = append(exes, t.Exe)
			}
		}
		refreshTools(append(exes, exeName(converterApp)))
		if app.hubTools["convert"].Installed() {
			ensureConverterApp()
		}
	}()
	go thumbLoop()
	go setup.EnsureStartMenu()
	// Nach einem Update einmal bestätigen, dass die neue Version läuft
	if vf := filepath.Join(k.Root, "version.txt"); true {
		if old, err := os.ReadFile(vf); err == nil && strings.TrimSpace(string(old)) != setup.Version && setup.Version != "" {
			app.notice = fmt.Sprintf(kit.T("Creator Hub wurde auf Version %s aktualisiert.", "Creator Hub was updated to version %s."), setup.Version)
		}
		os.WriteFile(vf, []byte(setup.Version), 0o644)
	}
	go setup.IntegrateAppImage() // Linux: AppImage ins Anwendungsmenü
	app.quit = k.Quit
	app.routes(k.Mux)
	app.updRoutes(k.Mux)
	go app.updLoop()
	go func() { time.Sleep(3 * time.Second); update.AutoCheck(kit.Lang()) }()
	// Fenster zu: Läuft noch etwas, bleibt der Hub unsichtbar im Hintergrund.
	k.OnClose = func() bool {
		app.mu.Lock()
		for id, st := range app.open {
			delete(app.open, id)
			app.endHistory(id, st)
		}
		app.mu.Unlock()
		if !app.busy() {
			app.updOnExit() // geplantes Update „beim Beenden“
			return true
		}
		return false
	}
	go func() {
		for range time.Tick(2 * time.Second) {
			if k.Hidden() && !app.busy() {
				app.updOnExit()
				k.Quit()
				return
			}
		}
	}()
	sub, _ := fs.Sub(webFS, "web")
	k.Run(sub)
}

func gpuOn() bool { _, err := os.Stat(kit.GPUFlag()); return err != nil }

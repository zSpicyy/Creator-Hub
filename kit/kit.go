// Paket kit ist der gemeinsame Unterbau aller Creator-Hub-Werkzeuge:
// Fenster, lokaler Server mit Zugriffsschutz, gemeinsames Design, Farben aus dem Hub und Drag & drop.
package kit

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed assets
var assets embed.FS

type App struct {
	Name   string // Ordnername für Daten, z. B. "Upscaler"
	Title  string // Fenstertitel
	W, H   int
	Root   string
	Mux    *http.ServeMux
	cookie string
	// OnClose entscheidet beim Schließen des Fensters: true = beenden, false = nur verstecken.
	OnClose func() bool
	// Ask wird vor dem Schließen gefragt: true = nicht schließen, stattdessen Kit._closeAsk() in der Seite aufrufen
	// (z. B. „Nicht gespeichert – trotzdem schließen?“). Die Seite beendet dann selbst über /kit/quit.
	Ask     func() bool
	eval    func(js string)
	askedAt int64 // wann zuletzt nachgefragt wurde (ms)
	acked   bool  // die Seite hat die Nachfrage angenommen
	hidden  bool
	quit    func()
	alive   func()
	show    func() // Fenster wieder nach vorne holen (macOS: zweiter Start)
	pinged  int64  // letzte Lebenszeichen der Seite (Unix ms)
}

// Eval führt JavaScript im Fenster aus (falls möglich).
func (a *App) Eval(js string) {
	if a.eval != nil {
		a.eval(js)
	}
}

// Hidden meldet, ob das Fenster gerade versteckt ist.
func (a *App) Hidden() bool { return a.hidden }

// Quit beendet das Programm (auch wenn das Fenster versteckt ist).
func (a *App) Quit() {
	KillHelpers()
	if a.quit != nil {
		a.quit()
		return
	}
	os.Exit(0)
}

var keysMu sync.Mutex

func New(name, title string) *App {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	a := &App{Name: name, Title: title, W: 1200, H: 820, Root: filepath.Join(d, name), Mux: http.NewServeMux()}
	os.MkdirAll(a.Root, 0o755)
	// Abstürze in eine Datei schreiben (Fensterprogramme haben keine Konsole)
	if f, err := os.OpenFile(filepath.Join(a.Root, "absturz.txt"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
		debug.SetCrashOutput(f, debug.CrashOptions{})
		f.Close()
	}
	a.cookie = "k" + strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' {
			return r
		}
		return -1
	}, name)
	return a
}

func RandID(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func JSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func Fail(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// Theme ist das, was alle Werkzeuge vom Hub übernehmen.
type Theme struct {
	Lang    string `json:"lang"`
	Theme   string `json:"theme"`
	Accent  string `json:"accent"`
	Density string `json:"density"`
}

var accents = map[string]string{"koralle": "#ff6b4a", "indigo": "#7c6cff", "blau": "#4c8dff", "türkis": "#25b8c9", "grün": "#3fbf7f", "gelb": "#e0b43a", "orange": "#f08a3c", "rot": "#e5584f", "pink": "#e5629f", "violett": "#9a78f0"}

func ReadTheme() Theme {
	t := Theme{Lang: "en", Theme: "light", Accent: "#ff6b4a", Density: "normal"}
	d, _ := os.UserConfigDir()
	b, err := os.ReadFile(filepath.Join(d, "CreatorHub", "einstellungen.json"))
	if err != nil {
		return t
	}
	var s struct{ Lang, Theme, Accent, Density string }
	if json.Unmarshal(b, &s) != nil {
		return t
	}
	if s.Theme != "" {
		t.Theme = s.Theme
	}
	if s.Lang == "de" {
		t.Lang = "de"
	}
	if s.Density != "" {
		t.Density = s.Density
	}
	if c, ok := accents[s.Accent]; ok {
		t.Accent = c
	} else if c, ok := ctpAccent(s.Accent, t.Theme); ok {
		t.Accent = c
	} else if len(s.Accent) == 7 && s.Accent[0] == '#' {
		t.Accent = s.Accent
	}
	return t
}

// PickPath öffnet den Windows-Dialog. mode: file | files | folder. filter z. B. "Bilder|*.png;*.jpg".
func PickPath(mode, filter string) ([]string, error) {
	out, err := pickPath(mode, filter)
	if err != nil {
		return nil, err
	}
	var paths []string
	for _, p := range strings.Split(out, "|") {
		if p = strings.TrimSpace(p); p != "" {
			paths = append(paths, p)
		}
	}
	return paths, nil
}

func OpenFolder(p string) {
	if st, err := os.Stat(p); err == nil && !st.IsDir() {
		p = filepath.Dir(p)
	}
	openFolder(p)
}

// Run startet Server und Fenster. web enthält index.html des Werkzeugs.
func (a *App) Run(web fs.FS) {
	// Nach einem Update: warten, bis die alte Version beendet ist.
	if pid, err := strconv.Atoi(os.Getenv("CREATORHUB_AFTER_PID")); err == nil && pid > 0 {
		os.Unsetenv("CREATORHUB_AFTER_PID")
		waitExit(pid, 20*time.Second)
	}
	if alreadyRunning(a.Name, a.Title) {
		return
	}
	a.Mux.Handle("/", http.FileServer(http.FS(web)))
	sub, _ := fs.Sub(assets, "assets")
	a.Mux.Handle("/kit/", http.StripPrefix("/kit/", http.FileServer(http.FS(sub))))
	a.Mux.HandleFunc("/kit/ready", func(w http.ResponseWriter, r *http.Request) {
		os.Remove(filepath.Join(a.Root, "grafik-test"))
		w.Write([]byte("{}"))
	})
	a.Mux.HandleFunc("/kit/closeack", func(w http.ResponseWriter, r *http.Request) {
		a.acked = true
		w.Write([]byte("{}"))
	})
	a.Mux.HandleFunc("/kit/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "POST", 405)
			return
		}
		w.Write([]byte("{}"))
		go func() { time.Sleep(150 * time.Millisecond); a.Quit() }()
	})
	a.Mux.HandleFunc("/kit/alive", func(w http.ResponseWriter, r *http.Request) {
		atomic.StoreInt64(&a.pinged, time.Now().UnixMilli())
		if a.alive != nil {
			a.alive()
		}
		w.WriteHeader(204)
	})
	// Tastenkürzel aller Werkzeuge an einer Stelle: GET ?app=… liefert die eigenen Belegungen, POST speichert sie
	a.Mux.HandleFunc("/kit/keys", func(w http.ResponseWriter, r *http.Request) {
		app := r.URL.Query().Get("app")
		cd, _ := os.UserConfigDir()
		f := filepath.Join(cd, "CreatorHub", "tastenkuerzel.json")
		keysMu.Lock()
		defer keysMu.Unlock()
		all := map[string]map[string][]string{}
		if b, err := os.ReadFile(f); err == nil {
			json.Unmarshal(b, &all)
		}
		if r.Method == http.MethodPost {
			var m map[string][]string
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&m); err != nil || app == "" {
				Fail(w, 400, "Ungültig.")
				return
			}
			if len(m) == 0 {
				delete(all, app)
			} else {
				all[app] = m
			}
			os.MkdirAll(filepath.Dir(f), 0o755)
			b, _ := json.MarshalIndent(all, "", " ")
			os.WriteFile(f, b, 0o644)
		}
		m := all[app]
		if m == nil {
			m = map[string][]string{}
		}
		JSON(w, m)
	})
	a.Mux.HandleFunc("/kit/theme", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		JSON(w, ReadTheme())
	})
	// Dateien, die der Hub an dieses Werkzeug übergibt (z. B. nach Drag & drop auf den Hub).
	a.Mux.HandleFunc("/kit/inbox", func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(a.Root, "inbox.json")
		var paths []string
		if b, err := os.ReadFile(p); err == nil {
			os.Remove(p)
			json.Unmarshal(b, &paths)
		}
		JSON(w, map[string]any{"paths": paths})
	})
	a.Mux.HandleFunc("/kit/pick", func(w http.ResponseWriter, r *http.Request) {
		p, err := PickPath(r.URL.Query().Get("mode"), r.URL.Query().Get("filter"))
		if err != nil {
			Fail(w, 500, err.Error())
			return
		}
		JSON(w, map[string]any{"paths": p})
	})
	a.Mux.HandleFunc("/kit/open-folder", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ Path string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq)
		OpenFolder(rq.Path)
		JSON(w, map[string]bool{"ok": true})
	})
	// Ersatzweg für Drag & drop außerhalb des App-Fensters: Datei wird gestreamt gespeichert, ohne Größengrenze.
	a.Mux.HandleFunc("/kit/upload", func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(r.URL.Query().Get("name"))
		if name == "." || name == "/" || name == "" {
			name = "datei"
		}
		dir := filepath.Join(a.Root, "abgelegt", RandID(4))
		os.MkdirAll(dir, 0o755)
		p := filepath.Join(dir, name)
		f, err := os.Create(p)
		if err != nil {
			Fail(w, 500, "Speichern fehlgeschlagen.")
			return
		}
		_, err = io.Copy(f, r.Body)
		f.Close()
		if err != nil {
			os.Remove(p)
			Fail(w, 500, "Übertragung abgebrochen.")
			return
		}
		JSON(w, map[string]string{"path": p})
	})

	port := os.Getenv("KIT_PORT")
	var ln net.Listener
	var err error
	if port == "" {
		// feste Adresse je Werkzeug, damit Einstellungen im Fenster (Ansicht, Bereiche, Modus) beim nächsten Start noch da sind
		h := uint32(2166136261)
		for _, c := range []byte(a.Name) {
			h = (h ^ uint32(c)) * 16777619
		}
		ln, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", 41000+int(h%3000)))
	}
	if ln == nil {
		ln, err = net.Listen("tcp", "127.0.0.1:"+port)
	}
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
	token := os.Getenv("KIT_TOKEN")
	if token == "" {
		token = RandID(16)
	}
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/kit/pinged" && r.URL.Query().Get("t") == token { // zweiter Start: lebt das Fenster?
			JSON(w, map[string]int64{"pinged": atomic.LoadInt64(&a.pinged)})
			return
		}
		if r.URL.Path == "/kit/show" && r.URL.Query().Get("t") == token { // zweiter Start: Fenster zeigen
			if a.show != nil {
				a.show()
			}
			w.WriteHeader(204)
			return
		}
		if c, err := r.Cookie(a.cookie); err == nil && c.Value == token {
			a.Mux.ServeHTTP(w, r)
			return
		}
		if r.URL.Query().Get("t") == token {
			http.SetCookie(w, &http.Cookie{Name: a.cookie, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}
		http.Error(w, "Nicht erlaubt", http.StatusForbidden)
	})
	go http.Serve(ln, h)
	runWindow(fmt.Sprintf("http://%s/?t=%s", ln.Addr(), token), a)
	KillHelpers() // Fenster zu: alle Hilfsprogramme (ffmpeg) mit beenden
}

var ErrNoDialog = errors.New("Das Auswahlfenster ließ sich nicht öffnen. Füge den Pfad bitte ins Feld ein.")

// SendTo legt Dateien in den Eingang eines anderen Werkzeugs (dataDir = dessen Ordnername).
func SendTo(dataDir string, paths []string) error {
	d, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(d, dataDir)
	os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, "inbox.json")
	var old []string
	if b, err := os.ReadFile(p); err == nil {
		json.Unmarshal(b, &old)
	}
	b, _ := json.Marshal(append(old, paths...))
	return os.WriteFile(p, b, 0o644)
}

// Lang liefert die eingestellte Sprache ("en" oder "de").
func Lang() string { return ReadTheme().Lang }

// ProgramDir ist der Ort für Programmdateien des Benutzers:
// Windows %LOCALAPPDATA%, Linux ~/.local/share.
func ProgramDir() string {
	if os.PathSeparator == '\\' {
		d, _ := os.UserCacheDir()
		return d
	}
	if runtime.GOOS == "darwin" { // ~/Library/Application Support
		d, _ := os.UserConfigDir()
		return d
	}
	if d := os.Getenv("XDG_DATA_HOME"); d != "" {
		return d
	}
	h, _ := os.UserHomeDir()
	return filepath.Join(h, ".local", "share")
}

// T wählt den Text passend zur eingestellten Sprache (für Meldungen außerhalb des Fensters).
func T(de, en string) string {
	if Lang() == "de" {
		return de
	}
	return en
}

// Hilfsprogramme (ffmpeg usw.) merken, damit sie beim Beenden des Programms mit beendet werden.
var (
	cmdMu   sync.Mutex
	cmdList = map[*exec.Cmd]bool{}
)

func trackCmd(c *exec.Cmd) {
	cmdMu.Lock()
	defer cmdMu.Unlock()
	for k := range cmdList { // fertige vergessen
		if k.ProcessState != nil {
			delete(cmdList, k)
		}
	}
	cmdList[c] = true
}

var atExit []func()

// AtExit merkt sich etwas, das beim Schließen des Werkzeugs passieren soll (z. B. die KI beenden).
func AtExit(f func()) { cmdMu.Lock(); atExit = append(atExit, f); cmdMu.Unlock() }

// KillHelpers beendet alle noch laufenden Hilfsprogramme.
func KillHelpers() {
	cmdMu.Lock()
	fs := atExit
	atExit = nil
	cmdMu.Unlock()
	for _, f := range fs {
		f()
	}
	cmdMu.Lock()
	defer cmdMu.Unlock()
	for c := range cmdList {
		if c.Process != nil && c.ProcessState == nil {
			c.Process.Kill()
		}
	}
	cmdList = map[*exec.Cmd]bool{}
}


// GPUFlag ist die gemeinsame Einstellung „Grafikbeschleunigung aus“ für alle Werkzeuge.
func GPUFlag() string {
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "CreatorHub", "grafik-aus")
}

// GPUOn: Grafikbeschleunigung ist an, außer der Nutzer hat sie abgeschaltet oder der letzte
// Start hat die Seite nie fertig angezeigt (dann automatisch aus, wie ein Sicherheitsmodus).
func (a *App) GPUOn() bool {
	if v := os.Getenv("KIT_GPU"); v != "" {
		return v == "1"
	}
	if _, err := os.Stat(GPUFlag()); err == nil {
		return false
	}
	probe := filepath.Join(a.Root, "grafik-test")
	if _, err := os.Stat(probe); err == nil {
		os.Remove(probe)
		os.MkdirAll(filepath.Dir(GPUFlag()), 0o755)
		os.WriteFile(GPUFlag(), []byte("auto"), 0o644)
		return false
	}
	os.WriteFile(probe, []byte(time.Now().Format(time.RFC3339)), 0o644)
	return true
}

// StartMax: Fenster starten bildschirmfüllend (maximiert). Der Installer schaltet das ab.
var StartMax = true

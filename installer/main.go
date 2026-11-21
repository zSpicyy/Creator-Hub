// Creator-Hub-Setup: installiert den Hub für den aktuellen Benutzer (ohne Adminrechte)
// und richtet danach automatisch die KI ein.
package main

import (
	"compress/gzip"
	"embed"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"kit"
	"kit/ai"
	"kit/ollama"
	"kit/setup"
)

//go:embed web
var webFS embed.FS

//go:embed payload/Creator-Hub.exe.gz
var hubGz []byte

type state struct {
	Phase   string        `json:"phase"` // start | copy | ai | done | error
	Text    string        `json:"text"`
	Done    float64       `json:"done"`
	Error   string        `json:"error"`
	AINote  string        `json:"aiNote"`
	Dir     string        `json:"dir"`
	Version string        `json:"version"`
	Old     int           `json:"old"`     // Projekte einer früheren Installation (nur bei Neuinstallation)
	AITools []ollama.User `json:"aiTools"` // Werkzeuge, die Ollama brauchen (Abfrage nach dem Kopieren)
	AISize  string        `json:"aiSize"`
	AINeed  string        `json:"aiNeed"`    // model | update | install
	AIVer   string        `json:"aiVersion"` // schon vorhandenes Ollama
	AIMin   string        `json:"aiMin"`
}

var aiAnswer = make(chan bool, 1)

var (
	mu sync.Mutex
	st = state{Phase: "start", Dir: setup.InstallDir(), Version: setup.Version, Old: oldCount()}
)

func set(f func(*state)) {
	mu.Lock()
	f(&st)
	logLine(st.Phase + " " + st.Text + " " + st.Error)
	mu.Unlock()
}

var logPath string

// Tag macht die Version für den Hub lesbar (beim Bauen: -X main.Tag=CHSETUPVER-1.2.3-END).
var Tag = ""

// logLine schreibt den Ablauf nach %TEMP%\CreatorHubSetup\setup-log.txt (zur Fehlersuche).
func logLine(t string) {
	if logPath == "" {
		return
	}
	if f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
		f.WriteString(time.Now().Format("15:04:05.000 ") + t + "\n")
		f.Close()
	}
}

func install(desktop bool) { installMode(desktop, true) }

func installMode(desktop, withAI bool) {
	err := func() error {
		set(func(s *state) { s.Phase, s.Text, s.Done = "copy", "Programm wird installiert", 0.05 })
		dir := setup.InstallDir()
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return errors.New("Der Programmordner lässt sich nicht anlegen.")
		}
		exe := filepath.Join(dir, setup.ExeName)
		zr, err := gzip.NewReader(bytesReader(hubGz))
		if err != nil {
			return err
		}
		tmp := exe + ".neu"
		f, err := os.Create(tmp)
		if err != nil {
			return err
		}
		n, err := io.Copy(f, zr)
		f.Close()
		if err != nil {
			os.Remove(tmp)
			return err
		}
		// Laufende (auch unsichtbar hängende) ältere Versionen beenden
		if withAI { // nicht beim Update aus dem Hub: dort ist der Installer ein Kind des Hubs
			logLine("alte Prozesse beenden")
			setup.StopRunning()
			logLine("alte Prozesse beendet")
		}
		// Läuft eine ältere Version noch? Dann ein paar Sekunden auf das Schließen warten.
		// Nie vorher löschen: os.Rename ersetzt die alte Datei in einem Schritt. Klappt das nicht
		// (läuft noch), bleibt die alte Version erhalten, statt dass der Ordner leer zurückbleibt.
		for i := 0; ; i++ {
			if err = os.Rename(tmp, exe); err == nil {
				break
			}
			if i == 20 {
				os.Remove(tmp)
				return errors.New("Creator Hub läuft noch. Schließe ihn und versuche es noch einmal.")
			}
			time.Sleep(500 * time.Millisecond)
		}
		set(func(s *state) { s.Text, s.Done = "Verknüpfungen werden angelegt", 0.15 })
		if err := setup.CreateShortcuts(exe, desktop); err != nil {
			return errors.New("Die Verknüpfungen ließen sich nicht anlegen.")
		}
		setup.RegisterUninstall(exe, uint32(n/1024))
		if !withAI {
			return nil
		}
		// KI gleich mit einrichten, ohne Rückfrage
		set(func(s *state) { s.Phase, s.Text, s.Done = "ai", "KI wird eingerichtet", 0.2 })
		ai.Install("upscale")
		for {
			time.Sleep(300 * time.Millisecond)
			a := ai.Get("upscale")
			set(func(s *state) {
				s.Done = 0.2 + a.Done*0.8
				if a.Step != "" {
					s.Text = a.Step
				}
			})
			if !a.Loading {
				if a.Error != "" {
					set(func(s *state) {
						s.AINote = "Die KI konnte gerade nicht geladen werden (" + a.Error + "). Sie wird beim ersten Öffnen des Upscalers nachgeladen."
					})
				}
				break
			}
		}
		// Lokale KI (Ollama) für Werkzeuge, die sie brauchen: nachfragen
		need := []ollama.User{}
		for _, u := range ollama.Users() {
			if !ollama.Installed(u.Model) {
				need = append(need, u)
			}
		}
		if len(need) == 0 {
			return nil
		}
		all := ollama.NeedAll() // zuerst prüfen, was auf dem PC schon da ist
		set(func(s *state) {
			s.Phase, s.AITools, s.AINeed, s.AIVer, s.AIMin = "askai", need, all.Need, all.Version, all.Min
			s.AISize = ollama.SizeFor(all.Need)
		})
		yes := <-aiAnswer
		ollama.Answer("*", yes)
		if !yes {
			return nil
		}
		set(func(s *state) { s.Phase, s.Text, s.Done = "ollama", "Lade KI-Programm …", 0 })
		done := make(chan bool)
		go func() {
			for _, u := range need {
				ollama.Setup(u.Model, false) // die KI startet später nur zusammen mit dem Werkzeug
				if ollama.P.Snapshot()["step"] == "error" {
					break
				}
			}
			close(done)
		}()
		steps := map[string]string{"download": "Lade KI-Programm …", "unpack": "Entpacke …", "start": "Starte KI …", "model": "Lade KI-Modell …", "ready": "Fertig"}
		for {
			select {
			case <-done:
				if e, _ := ollama.P.Snapshot()["error"].(string); e != "" {
					set(func(s *state) {
						s.AINote = "Die KI für " + need[0].Name + " ließ sich gerade nicht laden (" + e + "). Sie wird beim Öffnen des Werkzeugs noch einmal angeboten."
					})
					ollama.Answer("*", false)
				}
				return nil
			case <-time.After(300 * time.Millisecond):
				p := ollama.P.Snapshot()
				set(func(s *state) {
					st, _ := p["step"].(string)
					if steps[st] != "" {
						s.Text = steps[st]
					}
					s.Done, _ = p["pct"].(float64)
				})
			}
		}
	}()
	set(func(s *state) {
		if err != nil {
			s.Phase, s.Error = "error", err.Error()
			return
		}
		s.Phase, s.Done, s.Text = "done", 1, "Fertig"
	})
}

type br struct {
	b []byte
	i int
}

func (r *br) Read(p []byte) (int, error) {
	if r.i >= len(r.b) {
		return 0, io.EOF
	}
	n := copy(p, r.b[r.i:])
	r.i += n
	return n, nil
}
func bytesReader(b []byte) io.Reader { return &br{b: b} }

func main() {
	// Update aus dem Hub: ohne Fenster installieren und den Hub neu starten.
	if len(os.Args) > 1 && (os.Args[1] == "--update" || os.Args[1] == "--update-quiet") {
		if t := os.TempDir(); t != "" {
			os.MkdirAll(filepath.Join(t, "CreatorHubSetup"), 0o755)
			logPath = filepath.Join(t, "CreatorHubSetup", "setup-log.txt")
			logLine("Update " + setup.Version + " " + os.Args[1])
		}
		installMode(setup.HasDesktopShortcut(), false)
		if st.Phase == "error" {
			setup.Info(kit.T("Das Update ist fehlgeschlagen: ", "The update failed: ") + st.Error)
			return
		}
		if os.Args[1] == "--update-quiet" { // beim Beenden eingespielt: nicht wieder starten
			return
		}
		exe := filepath.Join(setup.InstallDir(), setup.ExeName)
		cmd := exec.Command(exe)
		cmd.Dir = filepath.Dir(exe)
		kit.StartApp(cmd)
		return
	}
	k := kit.New("CreatorHubSetup", "Creator Hub installieren")
	kit.StartMax = false
	k.W, k.H = 640, 520
	k.Root = filepath.Join(os.TempDir(), "CreatorHubSetup")
	os.MkdirAll(k.Root, 0o755)
	logPath = filepath.Join(k.Root, "setup-log.txt")
	logLine("Start " + setup.Version + " " + Tag)
	ai.SkipProbe = true
	polls := 0
	k.Mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		if polls++; polls%10 == 1 {
			logLine("Seite fragt Stand ab")
		}
		defer mu.Unlock()
		kit.JSON(w, st)
	})
	k.Mux.HandleFunc("/api/install", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ Desktop, KeepOld bool }
		json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&rq)
		mu.Lock()
		if st.Phase == "start" || st.Phase == "error" {
			st.Phase, st.Error = "copy", ""
			if st.Old > 0 && !rq.KeepOld {
				logLine("alte Projekte archiviert: " + setup.ArchiveOldData())
				st.Old = 0
			}
			go install(rq.Desktop)
		}
		mu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	k.Mux.HandleFunc("/api/ai", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ Yes bool }
		json.NewDecoder(io.LimitReader(r.Body, 256)).Decode(&rq)
		mu.Lock()
		ok := st.Phase == "askai"
		if ok {
			st.Phase = "ollama"
		}
		mu.Unlock()
		if ok {
			aiAnswer <- rq.Yes
		}
		kit.JSON(w, map[string]bool{"ok": true})
	})
	k.Mux.HandleFunc("/api/launch", func(w http.ResponseWriter, r *http.Request) {
		exe := filepath.Join(setup.InstallDir(), setup.ExeName)
		cmd := exec.Command(exe)
		cmd.Dir = filepath.Dir(exe)
		kit.StartApp(cmd)
		kit.JSON(w, map[string]bool{"ok": true})
		go func() { time.Sleep(400 * time.Millisecond); k.Quit() }()
	})
	sub, _ := fs.Sub(webFS, "web")
	k.Run(sub)
}

func oldCount() int {
	if !setup.Fresh() {
		return 0
	}
	return setup.OldProjects()
}

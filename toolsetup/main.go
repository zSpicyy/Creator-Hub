// Werkzeug-Setup: installiert ein einzelnes Creator-Hub-Werkzeug für den aktuellen Benutzer (ohne Adminrechte),
// legt Verknüpfungen an, trägt es unter „Apps“ zum Deinstallieren ein und richtet KI bzw. ffmpeg gleich mit ein.
// Welches Werkzeug, steht beim Bauen in den ldflags (siehe build-tools.sh); payload/ enthält Programm und Logo.
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
	"strings"
	"sync"
	"time"

	"kit"
	"kit/ai"
	"kit/ffmpeg"
	"kit/setup"
)

//go:embed web
var webFS embed.FS

//go:embed payload/tool.exe.gz
var toolGz []byte

//go:embed payload/logo.svg
var logo []byte

var (
	Tool    = "Freisteller"
	Title   = "Freisteller"
	TitleEN = "Background Remover"
	Color   = "#e0449a"
	Needs   = "" // "ai:cutout", "ffmpeg" oder leer
	Tag     = "" // CHTOOLSETUP-<Version>-END
)

type state struct {
	Phase   string  `json:"phase"` // start | copy | need | done | error
	Text    string  `json:"text"`
	Done    float64 `json:"done"`
	Error   string  `json:"error"`
	Note    string  `json:"note"`
	Dir     string  `json:"dir"`
	Version string  `json:"version"`
	Title   string  `json:"title"`
	Color   string  `json:"color"`
	Need    string  `json:"need"`
}

var (
	mu sync.Mutex
	st state
)

func set(f func(*state)) { mu.Lock(); f(&st); mu.Unlock() }
func title() string     { return kit.T(Title, TitleEN) }

func install(desktop bool) {
	err := func() error {
		set(func(s *state) { s.Phase, s.Text, s.Done = "copy", kit.T("Programm wird installiert", "Installing the program"), 0.05 })
		dir := setup.ToolInstallDir(Tool)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return errors.New(kit.T("Der Programmordner lässt sich nicht anlegen.", "Could not create the program folder."))
		}
		exe := filepath.Join(dir, Tool+".exe")
		zr, err := gzip.NewReader(&br{b: toolGz})
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
		setup.StopTool(Tool)
		for i := 0; ; i++ {
			if err = os.Rename(tmp, exe); err == nil {
				break
			}
			if i == 20 {
				os.Remove(tmp)
				return errors.New(title() + kit.T(" läuft noch. Schließe es und versuche es noch einmal.", " is still running. Close it and try again."))
			}
			time.Sleep(500 * time.Millisecond)
		}
		set(func(s *state) { s.Text, s.Done = kit.T("Verknüpfungen werden angelegt", "Creating shortcuts"), 0.12 })
		if err := setup.ToolInstallShortcuts(exe, title(), desktop); err != nil {
			return errors.New(kit.T("Die Verknüpfungen ließen sich nicht anlegen.", "Could not create the shortcuts."))
		}
		setup.RegisterToolUninstall(Tool, title(), exe, uint32(n/1024))
		// KI bzw. ffmpeg gleich mit einrichten
		switch {
		case strings.HasPrefix(Needs, "ai:"):
			model := strings.TrimPrefix(Needs, "ai:")
			set(func(s *state) { s.Phase, s.Text, s.Done = "need", kit.T("KI wird eingerichtet", "Setting up the AI"), 0.15 })
			ai.Install(model)
			for {
				time.Sleep(300 * time.Millisecond)
				a := ai.Get(model)
				set(func(s *state) { s.Done = 0.15 + a.Done*0.85 })
				if !a.Loading {
					if a.Error != "" && !ai.Ready(model) {
						set(func(s *state) {
							s.Note = kit.T("Die KI konnte gerade nicht geladen werden ("+a.Error+"). Sie wird beim ersten Start nachgeladen.", "The AI could not be downloaded right now ("+a.Error+"). It will be downloaded on first start.")
						})
					}
					break
				}
			}
		case Needs == "ffmpeg":
			e := ffmpeg.Shared()
			if !e.Ready() {
				set(func(s *state) { s.Phase, s.Text, s.Done = "need", kit.T("Video- und Tonmodul (ffmpeg) wird eingerichtet", "Setting up the video and audio module (ffmpeg)"), 0.15 })
				e.Install()
				time.Sleep(200 * time.Millisecond)
				for {
					l, d, er := e.State()
					set(func(s *state) { s.Done = 0.15 + d*0.85 })
					if !l {
						if er != "" && !e.Ready() {
							set(func(s *state) {
								s.Note = kit.T("ffmpeg konnte gerade nicht geladen werden ("+er+"). Es wird beim ersten Start nachgeladen.", "ffmpeg could not be downloaded right now ("+er+"). It will be downloaded on first start.")
							})
						}
						break
					}
					time.Sleep(300 * time.Millisecond)
				}
			}
		}
		return nil
	}()
	set(func(s *state) {
		if err != nil {
			s.Phase, s.Error = "error", err.Error()
			return
		}
		s.Phase, s.Done, s.Text = "done", 1, kit.T("Fertig", "Done")
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

func main() {
	st = state{Phase: "start", Dir: setup.ToolInstallDir(Tool), Version: setup.Version, Title: title(), Color: Color, Need: Needs}
	k := kit.New("CreatorHubSetup-"+Tool, title()+kit.T(" installieren", " setup"))
	kit.StartMax = false
	k.W, k.H = 640, 540
	k.Root = filepath.Join(os.TempDir(), "CreatorHubSetup-"+Tool)
	os.MkdirAll(k.Root, 0o755)
	ai.SkipProbe = true
	k.Mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		kit.JSON(w, st)
	})
	k.Mux.HandleFunc("/logo.svg", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Write(logo)
	})
	k.Mux.HandleFunc("/api/install", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ Desktop bool }
		json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&rq)
		mu.Lock()
		if st.Phase == "start" || st.Phase == "error" {
			st.Phase, st.Error = "copy", ""
			go install(rq.Desktop)
		}
		mu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	k.Mux.HandleFunc("/api/launch", func(w http.ResponseWriter, r *http.Request) {
		exe := filepath.Join(setup.ToolInstallDir(Tool), Tool+".exe")
		cmd := exec.Command(exe)
		cmd.Dir = filepath.Dir(exe)
		kit.StartApp(cmd)
		kit.JSON(w, map[string]bool{"ok": true})
		go func() { time.Sleep(400 * time.Millisecond); k.Quit() }()
	})
	sub, _ := fs.Sub(webFS, "web")
	k.Run(sub)
}

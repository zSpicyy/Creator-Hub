// Paket solo: alles, was ein Werkzeug braucht, wenn es ohne den Creator Hub läuft
// (einzeln von der Webseite geladen): Einrichtung von KI und ffmpeg mit eigenem Download-Fenster,
// eigene Updates über GitHub und dieselben Design- und Spracheinstellungen wie im Hub.
package solo

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"kit"
	"kit/ai"
	"kit/ffmpeg"
	"kit/setup"
	"kit/update"
)

// Bundled wird beim Bauen der Hub-Fassung gesetzt (-X kit/solo.Bundled=1). Dann kümmert sich der Hub
// um Einrichtung und Updates, und dieses Paket bleibt still.
var Bundled = ""

// Need ist etwas, das das Werkzeug zusätzlich herunterladen muss (KI-Modell, ffmpeg).
type Need struct {
	ID, Name, NameEN string
	Why, WhyEN       string // wofür es gebraucht wird
	MB               int
	Ready            func() bool
	Install          func()
	State            func() (loading bool, done float64, err string)
}

type Config struct {
	Tool    string // Dateiname der Downloads, z. B. "Freisteller"
	Title   string
	TitleEN string
	Logo    string // Name in /kit/logos, z. B. "cutout"
	Color   string // Farbe des Werkzeugs
	Needs   []Need
}

// Standalone meldet, ob das Werkzeug ohne den Hub läuft.
func Standalone() bool {
	if v := os.Getenv("KIT_STANDALONE"); v != "" {
		return v == "1"
	}
	return Bundled == ""
}

var (
	mu   sync.Mutex
	opts = map[string]bool{"auto": true}
)

func optFile(a *kit.App) string { return filepath.Join(a.Root, "updates.json") }

// Enable meldet die Wege unter /kit/solo… an. Ohne Wirkung in der Hub-Fassung.
func Enable(a *kit.App, c Config) {
	if !Standalone() {
		return
	}
	// Deinstallieren (aus den Windows-Einstellungen, siehe Werkzeug-Installer)
	if len(os.Args) > 1 && os.Args[1] == "--uninstall" {
		setup.UninstallTool(c.Tool, kit.T(c.Title, c.TitleEN))
		os.Exit(0)
	}
	update.Tool = c.Tool
	update.CleanupOld()
	if b, err := os.ReadFile(optFile(a)); err == nil {
		json.Unmarshal(b, &opts)
	}
	// alles Nötige gleich im Hintergrund laden
	for _, n := range c.Needs {
		if !n.Ready() {
			if l, _, _ := n.State(); !l {
				go n.Install()
			}
		}
	}
	// Updates: beim Start (kurz verzögert), dann alle 30 Minuten (nach Fehlern alle 5)
	go func() {
		time.Sleep(4 * time.Second)
		for {
			mu.Lock()
			auto := opts["auto"]
			mu.Unlock()
			if update.HasServer() && update.Due() {
				st := update.Check(kit.Lang())
				if auto && st.Available && !st.Loading && !st.Ready {
					update.Download() // still im Hintergrund vorbereiten; installiert wird erst auf Klick
				}
			}
			time.Sleep(time.Minute)
		}
	}()

	a.Mux.HandleFunc("/kit/solo", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		type ns struct {
			ID, Name, NameEN, Why, WhyEN string
			MB                           int
			Ready, Loading               bool
			Done                         float64
			Error                        string
		}
		var needs []ns
		for _, n := range c.Needs {
			l, d, e := n.State()
			needs = append(needs, ns{n.ID, n.Name, n.NameEN, n.Why, n.WhyEN, n.MB, n.Ready(), l, d, e})
		}
		mu.Lock()
		o := map[string]bool{"auto": opts["auto"]}
		mu.Unlock()
		kit.JSON(w, map[string]any{"on": true, "tool": c.Tool, "title": c.Title, "titleEN": c.TitleEN, "logo": c.Logo, "color": c.Color,
			"version": setup.Version, "needs": needs, "update": update.Get(), "server": update.HasServer(), "opts": o})
	})
	a.Mux.HandleFunc("/kit/solo/need", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		for _, n := range c.Needs {
			if n.ID == id && !n.Ready() {
				go n.Install()
			}
		}
		kit.JSON(w, map[string]bool{"ok": true})
	})
	a.Mux.HandleFunc("/kit/solo/update", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			kit.JSON(w, update.Get())
			return
		}
		switch r.URL.Query().Get("do") {
		case "check":
			kit.JSON(w, update.Check(kit.Lang()))
			return
		case "download":
			update.Download()
		case "apply":
			if err := update.Apply(a.Quit); err != nil {
				kit.Fail(w, 500, err.Error())
				return
			}
		}
		kit.JSON(w, update.Get())
	})
	a.Mux.HandleFunc("/kit/solo/opts", func(w http.ResponseWriter, r *http.Request) {
		var in map[string]bool
		json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
		mu.Lock()
		for k, v := range in {
			if k == "auto" {
				opts[k] = v
			}
		}
		b, _ := json.Marshal(opts)
		mu.Unlock()
		os.WriteFile(optFile(a), b, 0o644)
		kit.JSON(w, map[string]bool{"ok": true})
	})
	// Design und Sprache: dieselbe Datei wie der Hub (beide teilen sich die Einstellungen)
	a.Mux.HandleFunc("/kit/solo/settings", func(w http.ResponseWriter, r *http.Request) {
		d, _ := os.UserConfigDir()
		f := filepath.Join(d, "CreatorHub", "einstellungen.json")
		all := map[string]any{}
		if b, err := os.ReadFile(f); err == nil {
			json.Unmarshal(b, &all)
		}
		if r.Method == http.MethodPost {
			var in map[string]any
			json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
			if v, ok := in["gpu"].(bool); ok {
				if v {
					os.Remove(kit.GPUFlag())
				} else {
					os.MkdirAll(filepath.Dir(kit.GPUFlag()), 0o755)
					os.WriteFile(kit.GPUFlag(), []byte("nutzer"), 0o644)
				}
			}
			for _, k := range []string{"lang", "theme", "accent", "density", "customAccents", "nav"} {
				if v, ok := in[k]; ok {
					all[k] = v
				}
			}
			os.MkdirAll(filepath.Dir(f), 0o755)
			b, _ := json.MarshalIndent(all, "", " ")
			os.WriteFile(f, b, 0o644)
		}
		_, err := os.Stat(kit.GPUFlag())
		all["gpu"] = err != nil
		kit.JSON(w, all)
	})
}

// FFmpeg ist das gemeinsame ffmpeg (Video, Ton, Umwandeln).
func FFmpeg(why, whyEN string) Need {
	e := ffmpeg.Shared()
	return Need{ID: "ffmpeg", Name: "Video- und Tonmodul (ffmpeg)", NameEN: "Video and audio module (ffmpeg)", Why: why, WhyEN: whyEN, MB: ffmpeg.MB(),
		Ready: e.Ready, Install: func() { e.Install() }, State: e.State}
}

// AI ist ein KI-Modell samt ONNX Runtime.
func AI(model, why, whyEN string) Need {
	mb := 0
	if m, ok := ai.Models[model]; ok {
		mb = m.MB
	}
	if !ai.Ready(model) {
		mb += map[string]int{"windows": 72, "darwin": 55, "linux": 8}[runtime.GOOS] // Runtime, falls noch nicht da
	}
	return Need{ID: "ai-" + model, Name: "KI-Modell", NameEN: "AI model", Why: why, WhyEN: whyEN, MB: mb,
		Ready: func() bool { return ai.Ready(model) }, Install: func() { ai.Install(model) },
		State: func() (bool, float64, string) { s := ai.Get(model); return s.Loading, s.Done, s.Error }}
}

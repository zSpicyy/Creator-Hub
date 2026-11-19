//go:build linux

package kit

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Unter Linux öffnet die App ihre Oberfläche in einem echten App-Fenster mit WebKitGTK
// (window_gtk_linux.go). Fehlt WebKitGTK, nimmt sie ein Chromium-App-Fenster (Chromium, Chrome,
// Edge, Brave) und ohne solchen Browser den Standardbrowser.

func pickPath(mode, filter string) (string, error) {
	if p, err := exec.LookPath("zenity"); err == nil {
		args := []string{"--file-selection"}
		switch mode {
		case "folder":
			args = append(args, "--directory")
		case "files":
			args = append(args, "--multiple", "--separator=|")
		}
		if filter != "" && mode != "folder" {
			if i := strings.Index(filter, "|"); i > 0 {
				args = append(args, "--file-filter="+filter[:i]+" | "+strings.ReplaceAll(filter[i+1:], ";", " "))
			}
		}
		out, err := exec.Command(p, args...).Output()
		if err != nil {
			return "", nil // abgebrochen
		}
		return strings.TrimSpace(string(out)), nil
	}
	if p, err := exec.LookPath("kdialog"); err == nil {
		var args []string
		switch mode {
		case "folder":
			args = []string{"--getexistingdirectory", os.Getenv("HOME")}
		case "files":
			args = []string{"--getopenfilename", os.Getenv("HOME"), "--multiple", "--separate-output"}
		default:
			args = []string{"--getopenfilename", os.Getenv("HOME")}
		}
		out, err := exec.Command(p, args...).Output()
		if err != nil {
			return "", nil
		}
		var ps []string // eine Datei pro Zeile (Pfade dürfen Leerzeichen enthalten)
		for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			if l = strings.TrimSpace(l); l != "" {
				ps = append(ps, l)
			}
		}
		return strings.Join(ps, "|"), nil
	}
	return "", errors.New("Zum Auswählen fehlt zenity oder kdialog. Füge den Pfad bitte ins Feld ein oder ziehe die Datei ins Fenster.")
}

func openFolder(p string) {
	if p != "" {
		exec.Command("xdg-open", p).Start()
	}
}

// StartApp startet ein eigenständiges Werkzeug.
func StartApp(c *exec.Cmd) error { return c.Start() }

func HideCmd(c *exec.Cmd) { trackCmd(c) }

// Läuft die App schon? Dann deren Fenster zeigen. Hängt die alte Instanz oder ist sie eine ältere
// Version (z. B. von einem missglückten Start), wird sie beendet und die App startet neu.
func alreadyRunning(name, title string) bool {
	d, _ := os.UserConfigDir()
	b, err := os.ReadFile(filepath.Join(d, name, "instanz.json"))
	if err != nil {
		return false
	}
	var in struct {
		URL   string `json:"url"`
		PID   int    `json:"pid"`
		Stamp string `json:"stamp"`
	}
	if json.Unmarshal(b, &in) != nil || in.PID == 0 || in.PID == os.Getpid() || syscall.Kill(in.PID, 0) != nil {
		return false
	}
	host := strings.SplitN(strings.TrimPrefix(in.URL, "http://"), "/", 2)[0]
	c, err := net.DialTimeout("tcp", host, time.Second)
	if err != nil {
		return false
	}
	c.Close()
	if in.Stamp != exeStamp() {
		fmt.Fprintf(os.Stderr, "Ältere %s-Instanz läuft noch (PID %d) – wird beendet.\n", title, in.PID)
		stopOld(in.PID)
		return false
	}
	cl := http.Client{Timeout: 3 * time.Second}
	asked := time.Now().UnixMilli()
	if r, err := cl.Get(strings.Replace(in.URL, "/?t=", "/kit/show?t=", 1)); err == nil {
		r.Body.Close()
	}
	// Meldet sich das Fenster der laufenden Instanz innerhalb von 25 s? (Auch ein Rückfall auf den Browser zählt.)
	for end := time.Now().Add(25 * time.Second); time.Now().Before(end); time.Sleep(time.Second) {
		r, err := cl.Get(strings.Replace(in.URL, "/?t=", "/kit/pinged?t=", 1))
		if err != nil {
			break
		}
		var p struct{ Pinged int64 }
		json.NewDecoder(r.Body).Decode(&p)
		r.Body.Close()
		if p.Pinged >= asked {
			fmt.Fprintf(os.Stderr, "%s läuft schon (PID %d) – Fenster geöffnet.\n", title, in.PID)
			return true
		}
	}
	fmt.Fprintf(os.Stderr, "%s läuft schon (PID %d), reagiert aber nicht – wird neu gestartet.\n", title, in.PID)
	stopOld(in.PID)
	return false
}

// stopOld beendet eine alte Instanz: erst freundlich, nach 3 s hart.
func stopOld(pid int) {
	exec.Command("pkill", "-TERM", "-P", strconv.Itoa(pid)).Run() // ihre Fensterprozesse
	syscall.Kill(pid, syscall.SIGTERM)
	for i := 0; i < 30 && syscall.Kill(pid, 0) == nil; i++ {
		time.Sleep(100 * time.Millisecond)
	}
	syscall.Kill(pid, syscall.SIGKILL)
	time.Sleep(300 * time.Millisecond)
}

var browsers = []string{"chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable", "brave-browser", "vivaldi"}

func openApp(url, profile string) {
	for _, b := range browsers {
		if p, err := exec.LookPath(b); err == nil {
			cmd := exec.Command(p, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check", "--class=CreatorHub", "--window-size=1280,840")
			cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
			if cmd.Start() == nil {
				go cmd.Wait()
				return
			}
		}
	}
	exec.Command("xdg-open", url).Start()
}

func runWindow(url string, a *App) {
	ping := struct {
		sync.Mutex
		last time.Time
	}{last: time.Now().Add(50 * time.Second)} // Zeit zum Öffnen des Browsers
	var lastPing time.Time // letzter echter Lebenszeichen-Aufruf der Seite
	a.alive = func() {
		ping.Lock()
		ping.last = time.Now()
		lastPing = ping.last
		ping.Unlock()
		a.hidden = false
	}
	done := make(chan struct{})
	var once sync.Once
	a.quit = func() { once.Do(func() { close(done) }) }
	ib, _ := json.Marshal(map[string]any{"url": url, "pid": os.Getpid(), "stamp": exeStamp()})
	os.WriteFile(filepath.Join(a.Root, "instanz.json"), ib, 0o600)
	defer os.Remove(filepath.Join(a.Root, "instanz.json"))
	// Erst das eigene App-Fenster (WebKitGTK, eigener Prozess), sonst Chromium-App-Fenster bzw. Browser.
	browser := func() {
		fmt.Fprintln(os.Stderr, "Öffne im Browser (App-Fenster nicht verfügbar, Details in fenster.log):", url)
		openApp(url, filepath.Join(a.Root, "browser"))
	}
	fmt.Fprintln(os.Stderr, a.Title, "läuft auf", strings.SplitN(url, "?", 2)[0])
	var show func()
	show = func() {
		if !openWindow(url, a, browser, func() {
			ping.Lock()
			ping.last = time.Time{} // Fenster zu: gleich reagieren, nicht erst nach 10 s
			ping.Unlock()
		}, func(since time.Time) bool {
			ping.Lock()
			defer ping.Unlock()
			return lastPing.After(since)
		}) {
			browser()
		}
	}
	a.show = show
	show()
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-done: // beendet (z. B. für ein Update): Fenster mit schließen
			closeWindows(filepath.Join(a.Root, "browser"))
			return
		case <-t.C:
			ping.Lock()
			gone := time.Since(ping.last) > 10*time.Second
			ping.Unlock()
			if gone && !a.hidden {
				// Fenster geschlossen
				if a.OnClose == nil || a.OnClose() {
					return
				}
				a.hidden = true
			}
		}
	}
}

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func waitExit(pid int, max time.Duration) {
	for end := time.Now().Add(max); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		if syscall.Kill(pid, 0) != nil {
			return
		}
		// beendet, aber vom Elternprozess noch nicht abgeräumt („Zombie“)
		if b, err := os.ReadFile("/proc/" + itoa(pid) + "/stat"); err == nil {
			if i := strings.LastIndexByte(string(b), ')'); i > 0 && i+2 < len(b) && b[i+2] == 'Z' {
				return
			}
		}
	}
}

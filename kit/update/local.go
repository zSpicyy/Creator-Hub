package update

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"time"

	"kit/setup"
)

// Lokale Updates: Liegt ein neuerer Creator-Hub-Setup.exe auf dem Desktop oder im Download-Ordner,
// wird er als Update angeboten. Der Installer trägt seine Version als Markierung in sich
// (beim Bauen gesetzt: -X main.Tag=CHSETUPVER-1.2.3-END).

var tagRe = regexp.MustCompile(`CHSETUPVER-([0-9]+(?:\.[0-9]+)+)-END`)

type seen struct {
	mod     time.Time
	size    int64
	version string
}

var localSeen = map[string]seen{}

func localCandidates() []string {
	home, _ := os.UserHomeDir()
	var out []string
	var dirs []string
	for _, d := range []string{"Desktop", "Schreibtisch", filepath.Join("OneDrive", "Desktop"), filepath.Join("OneDrive", "Schreibtisch")} {
		// auch im aufgeräumten Ordner „Creator Hub“ auf dem Desktop
		dirs = append(dirs, d, filepath.Join(d, "Creator Hub", "Windows"), filepath.Join(d, "Creator Hub", "Linux"))
	}
	dirs = append(dirs, "Downloads")
	for _, d := range dirs {
		if runtime.GOOS == "windows" {
			out = append(out, filepath.Join(home, d, "Creator-Hub-Setup.exe"))
			continue
		}
		if runtime.GOOS == "darwin" {
			continue // macOS: Updates kommen über GitHub
		}
		// Linux: AppImage (z. B. Creator-Hub-x86_64.AppImage), nicht das gerade laufende
		ms, _ := filepath.Glob(filepath.Join(home, d, "Creator-Hub*.AppImage"))
		for _, m := range ms {
			if m != os.Getenv("APPIMAGE") {
				out = append(out, m)
			}
		}
	}
	return out
}

// setupVersion liest die Version aus einer Setup-Datei (nur neu, wenn sie sich geändert hat).
func setupVersion(p string) string {
	fi, err := os.Stat(p)
	if err != nil || fi.IsDir() || fi.Size() > 400<<20 {
		return ""
	}
	if s, ok := localSeen[p]; ok && s.mod.Equal(fi.ModTime()) && s.size == fi.Size() {
		return s.version
	}
	b, err := os.ReadFile(p)
	v := ""
	if err == nil {
		// jede Fundstelle prüfen: nur die echte Markierung hat eine gültige Version dahinter
		for off := 0; ; {
			i := bytes.Index(b[off:], []byte("CHSETUPVER-"))
			if i < 0 {
				break
			}
			i += off
			end := i + 64
			if end > len(b) {
				end = len(b)
			}
			if m := tagRe.FindSubmatch(b[i:end]); m != nil {
				v = string(m[1])
			}
			off = i + 1
		}
	}
	localSeen[p] = seen{fi.ModTime(), fi.Size(), v}
	return v
}

// CheckLocal sucht ein neueres Setup auf diesem PC. Gibt true zurück, wenn eins gefunden wurde.
func CheckLocal() bool {
	mu.Lock()
	defer mu.Unlock()
	if st.Loading {
		return st.Available
	}
	best, bestV := "", ""
	for _, p := range localCandidates() {
		if v := setupVersion(p); v != "" && Newer(v, setup.Version) && (bestV == "" || Newer(v, bestV)) {
			best, bestV = p, v
		}
	}
	if best == "" {
		if st.Source == "local" { // Datei weg oder schon installiert
			st.Available, st.Ready, st.Latest, st.Source = false, false, "", ""
			file = ""
		}
		return false
	}
	if st.Source == "server" && st.Available && !Newer(bestV, st.Latest) {
		return true // Server bietet schon dasselbe oder Neueres
	}
	st.Available, st.Ready, st.Latest, st.Source, st.Done = true, true, bestV, "local", 1
	st.Error, st.NoServer = "", false
	file = best
	return true
}

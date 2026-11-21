//go:build linux

package setup

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"kit"
)

//go:embed icon.png
var iconPNG []byte

const (
	AppName = "Creator Hub"
	ExeName = "Creator-Hub"
)

func InstallDir() string { return filepath.Join(kit.ProgramDir(), "creator-hub") }

func home() string { h, _ := os.UserHomeDir(); return h }

func desktopDir() string {
	if out, err := exec.Command("xdg-user-dir", "DESKTOP").Output(); err == nil {
		if d := strings.TrimSpace(string(out)); d != "" && d != home() {
			return d
		}
	}
	return filepath.Join(home(), "Desktop")
}

func entryPaths() (menu, desk, icon string) {
	return filepath.Join(kit.ProgramDir(), "applications", "creator-hub.desktop"),
		filepath.Join(desktopDir(), "creator-hub.desktop"),
		filepath.Join(kit.ProgramDir(), "icons", "hicolor", "256x256", "apps", "creator-hub.png")
}

func entry(exe string) string {
	_, _, icon := entryPaths()
	// Symbol mit vollem Pfad: funktioniert in jeder Desktop-Umgebung, auch ohne Symbol-Zwischenspeicher
	return fmt.Sprintf("[Desktop Entry]\nType=Application\nName=%s\nComment=All the tools a content creator needs\nComment[de]=Alle Werkzeuge für Content Creator\nExec=\"%s\"\nIcon=%s\nTerminal=false\nCategories=AudioVideo;Graphics;Utility;\nStartupWMClass=CreatorHub\nStartupNotify=true\n", AppName, exe, icon)
}

// RegisterTool sorgt dafür, dass ein Werkzeugfenster sein eigenes Symbol im Dock/in der Taskleiste
// bekommt: Symbol neben das Programm legen und einen unsichtbaren Menüeintrag mit seiner Fensterklasse.
func RegisterTool(exe, name, title string, png []byte) {
	if len(png) == 0 {
		return
	}
	ic := strings.TrimSuffix(exe, filepath.Ext(exe)) + ".png"
	os.WriteFile(ic, png, 0o644)
	menu, _, _ := entryPaths()
	class := "CreatorHub-" + strings.ReplaceAll(name, " ", "")
	e := fmt.Sprintf("[Desktop Entry]\nType=Application\nName=%s\nExec=\"%s\"\nIcon=%s\nTerminal=false\nCategories=AudioVideo;Graphics;\nStartupWMClass=%s\n", title, exe, ic, class)
	p := filepath.Join(filepath.Dir(menu), "creator-hub-"+strings.ToLower(name)+".desktop")
	os.MkdirAll(filepath.Dir(p), 0o755)
	os.WriteFile(p, []byte(e), 0o755)
	// einmalig auf den Desktop (löscht der Nutzer sie, kommt sie nicht wieder)
	mark := strings.TrimSuffix(exe, filepath.Ext(exe)) + ".desktop-angelegt"
	if _, err := os.Stat(mark); err != nil {
		if dd := desktopDir(); dd != "" {
			d := filepath.Join(dd, "creator-hub-"+strings.ToLower(name)+".desktop")
			os.WriteFile(d, []byte(e), 0o755)
			exec.Command("gio", "set", d, "metadata::trusted", "true").Run()
		}
		os.WriteFile(mark, []byte("1"), 0o644)
	}
}

// CreateShortcuts legt den Eintrag im Anwendungsmenü und optional auf dem Desktop an.
func CreateShortcuts(exe string, desktop bool) error {
	menu, desk, icon := entryPaths()
	os.MkdirAll(filepath.Dir(icon), 0o755)
	if err := os.WriteFile(icon, iconPNG, 0o644); err != nil {
		return err
	}
	os.MkdirAll(filepath.Dir(menu), 0o755)
	if err := os.WriteFile(menu, []byte(entry(exe)), 0o755); err != nil {
		return err
	}
	if desktop {
		if _, err := os.Stat(filepath.Dir(desk)); err == nil {
			os.WriteFile(desk, []byte(entry(exe)), 0o755)
			exec.Command("gio", "set", desk, "metadata::trusted", "true").Run()
		}
	}
	exec.Command("update-desktop-database", filepath.Dir(menu)).Run()
	return nil
}

func RegisterUninstall(exe string, sizeKB uint32) error { return nil }

func HasDesktopShortcut() bool {
	_, desk, _ := entryPaths()
	_, err := os.Stat(desk)
	return err == nil
}

func Info(text string) {
	if p, err := exec.LookPath("zenity"); err == nil {
		exec.Command(p, "--info", "--title="+AppName, "--text="+text).Run()
		return
	}
	fmt.Println(text)
}

func ask(text string) bool {
	if p, err := exec.LookPath("zenity"); err == nil {
		return exec.Command(p, "--question", "--title="+AppName, "--text="+text).Run() == nil
	}
	fmt.Print(text + " [j/n] ")
	var a string
	fmt.Scanln(&a)
	a = strings.ToLower(strings.TrimSpace(a))
	return a == "j" || a == "y" || a == "ja" || a == "yes"
}

// Uninstall entfernt Programm, Menüeintrag, Werkzeuge und KI. Projekte und Einstellungen bleiben.
func Uninstall() {
	if !ask(kit.T("Creator Hub wirklich deinstallieren?\n\nDeine Projekte, Einstellungen und fertigen Dateien bleiben erhalten.", "Really uninstall Creator Hub?\n\nYour projects, settings and finished files are kept.")) {
		return
	}
	menu, desk, icon := entryPaths()
	if ls, _ := filepath.Glob(filepath.Join(filepath.Dir(menu), "creator-hub-*.desktop")); ls != nil {
		for _, l := range ls {
			os.Remove(l)
		}
	}
	if ls, _ := filepath.Glob(filepath.Join(desktopDir(), "creator-hub-*.desktop")); ls != nil {
		for _, l := range ls {
			os.Remove(l)
		}
	}
	os.Remove(menu)
	os.Remove(desk)
	os.Remove(icon)
	os.RemoveAll(filepath.Join(kit.ProgramDir(), "CreatorHub", "Werkzeuge"))
	cfg, _ := os.UserConfigDir()
	os.RemoveAll(filepath.Join(cfg, "CreatorHub", "KI"))
	os.RemoveAll(InstallDir())
	Info(kit.T("Creator Hub wurde deinstalliert.", "Creator Hub has been uninstalled."))
}

// StopRunning beendet laufende Teile von Creator Hub (nur unter Windows nötig).
func StopRunning() {}

// StopTools schließt die Werkzeuge (für ein Update): erst freundlich, dann hart.
func StopTools() {
	for _, sig := range []string{"-TERM", "-KILL"} {
		exec.Command("pkill", sig, "-x", "Videoschnitt").Run()
		exec.Command("pkill", sig, "-x", "MP3-Schneider").Run()
		exec.Command("pkill", sig, "-x", "StreamPilot").Run()
		exec.Command("pkill", sig, "-x", "Kanalwerk").Run()
		exec.Command("pkill", sig, "-x", "Sendeplan").Run()
		exec.Command("pkill", sig, "-x", "Bildbearbeitung").Run()
		exec.Command("pkill", sig, "-x", "Motion-Design").Run()
		if sig == "-TERM" {
			time.Sleep(2 * time.Second)
		}
	}
}

// IntegrateAppImage trägt das laufende AppImage ins Anwendungsmenü ein (und aktualisiert den Pfad,
// wenn die Datei verschoben wurde). Tut nichts, wenn nicht aus einem AppImage gestartet.
func IntegrateAppImage() {
	img := os.Getenv("APPIMAGE")
	if img == "" {
		return
	}
	menu, _, _ := entryPaths()
	// Hat Gear Lever (oder AppImageLauncher) die App schon eingetragen, keinen zweiten Eintrag anlegen.
	if es, _ := os.ReadDir(filepath.Dir(menu)); len(es) > 0 {
		for _, e := range es {
			if e.Name() == filepath.Base(menu) || !strings.HasSuffix(e.Name(), ".desktop") || strings.HasPrefix(e.Name(), "creator-hub-") {
				continue
			}
			if b, err := os.ReadFile(filepath.Join(filepath.Dir(menu), e.Name())); err == nil && strings.Contains(string(b), img) {
				os.Remove(menu) // eigenen, doppelten Eintrag entfernen
				return
			}
		}
	}
	if b, err := os.ReadFile(menu); err == nil && strings.Contains(string(b), "Exec=\""+img+"\"") && strings.Contains(string(b), "Icon=/") {
		return
	}
	CreateShortcuts(img, false)
}

func EnsureStartMenu() {}

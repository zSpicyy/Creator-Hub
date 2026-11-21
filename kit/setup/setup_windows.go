//go:build windows

// Paket setup enthält, was Installer und Deinstallation gemeinsam brauchen.
package setup

import (
	"kit"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	AppName = "Creator Hub"
	ExeName = "Creator-Hub.exe"

	uninstKey = `Software\Microsoft\Windows\CurrentVersion\Uninstall\CreatorHub`
)

func InstallDir() string {
	d, _ := os.UserCacheDir() // %LOCALAPPDATA%
	return filepath.Join(d, "Programs", AppName)
}

func shortcutPaths() []string {
	ad := os.Getenv("APPDATA")
	home, _ := os.UserHomeDir()
	desk := filepath.Join(home, "Desktop")
	if p, err := windows.KnownFolderPath(windows.FOLDERID_Desktop, 0); err == nil {
		desk = p
	}
	return []string{
		filepath.Join(ad, `Microsoft\Windows\Start Menu\Programs`, AppName+".lnk"),
		filepath.Join(desk, AppName+".lnk"),
	}
}

func ps(script string) error {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return cmd.Run()
}

func q(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// CreateShortcuts legt Startmenü- und (optional) Desktop-Verknüpfung an.
func CreateShortcuts(exe string, desktop bool) error {
	for i, p := range shortcutPaths() {
		if i == 1 && !desktop {
			continue
		}
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := makeLink(p, exe, filepath.Dir(exe), exe, "Alle Werkzeuge für Content Creator"); err != nil {
			return err
		}
	}
	return nil
}

// ToolShortcuts: eigene Verknüpfung eines Werkzeugs im Startmenü (Ordner „Creator Hub“, lässt sich
// an Start und Taskleiste anheften) und einmalig auf dem Desktop. Gelöschte Desktop-Verknüpfungen kommen
// bei Updates nicht wieder.
func ToolShortcuts(exe, title string) {
	ad := os.Getenv("APPDATA")
	// direkt unter „Programme“, nicht in einem Ordner „Creator Hub“: ein gleichnamiger Ordner
	// verdeckt im Startmenü sonst die Verknüpfung des Hubs selbst
	progs := filepath.Join(ad, `Microsoft\Windows\Start Menu\Programs`)
	os.RemoveAll(filepath.Join(progs, AppName)) // Ordner aus Version 1.1.41/1.1.42 entfernen
	start := filepath.Join(progs, title+".lnk")
	paths := []string{start}
	mark := strings.TrimSuffix(exe, ".exe") + ".desktop-angelegt"
	first := false
	if _, err := os.Stat(mark); err != nil {
		paths = append(paths, filepath.Join(filepath.Dir(shortcutPaths()[1]), title+".lnk"))
		first = true
	}
	for _, p := range paths {
		os.MkdirAll(filepath.Dir(p), 0o755)
		makeLink(p, exe, filepath.Dir(exe), exe, title+" – Creator Hub")
	}
	if first {
		os.WriteFile(mark, []byte("1"), 0o644)
	}
}

// Namen der Werkzeug-Verknüpfungen (beide Sprachen), zum Entfernen beim Deinstallieren
var toolLinks = []string{"Videoschnitt", "Video Editor", "MP3 Schneider", "MP3 Splitter", "Bildbearbeitung", "Image Editor", "Dateityp-Umwandler", "File Converter", "Motion Design", "Motion Design", "StreamPilot", "StreamPilot", "Kanalwerk", "Kanalwerk", "Sendeplan", "Sendeplan", "Social-Planer", "Social-Planer"}

func RegisterUninstall(exe string, sizeKB uint32) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, uninstKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	k.SetStringValue("DisplayName", AppName)
	k.SetStringValue("DisplayVersion", Version)
	k.SetStringValue("DisplayIcon", exe)
	k.SetStringValue("Publisher", AppName)
	k.SetStringValue("InstallLocation", filepath.Dir(exe))
	k.SetStringValue("UninstallString", `"`+exe+`" --uninstall`)
	k.SetDWordValue("NoModify", 1)
	k.SetDWordValue("NoRepair", 1)
	k.SetDWordValue("EstimatedSize", sizeKB)
	return nil
}

func ask(text string) bool {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(AppName)
	r, _ := windows.MessageBox(0, t, c, windows.MB_YESNO|windows.MB_ICONQUESTION)
	return r == 6 // IDYES
}

func Info(text string) {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(AppName)
	windows.MessageBox(0, t, c, windows.MB_OK|windows.MB_ICONINFORMATION)
}

// Uninstall entfernt Programm, Verknüpfungen, Werkzeuge und KI. Projekte und Einstellungen bleiben.
func Uninstall() {
	if !ask(kit.T("Creator Hub wirklich deinstallieren?\n\nDeine Projekte, Einstellungen und fertigen Dateien bleiben erhalten.", "Really uninstall Creator Hub?\n\nYour projects, settings and finished files are kept.")) {
		return
	}
	for _, p := range shortcutPaths() {
		os.Remove(p)
	}
	os.RemoveAll(filepath.Join(os.Getenv("APPDATA"), `Microsoft\Windows\Start Menu\Programs`, AppName))
	for _, n := range toolLinks {
		os.Remove(filepath.Join(filepath.Dir(shortcutPaths()[1]), n+".lnk"))
		os.Remove(filepath.Join(os.Getenv("APPDATA"), `Microsoft\Windows\Start Menu\Programs`, n+".lnk"))
	}
	registry.DeleteKey(registry.CURRENT_USER, uninstKey)
	os.RemoveAll(filepath.Join(kit.ProgramDir(), "CreatorHub", "Werkzeuge"))
	cfg, _ := os.UserConfigDir()
	os.RemoveAll(filepath.Join(cfg, "CreatorHub", "KI"))
	os.RemoveAll(filepath.Join(cfg, "Dateityp-Umwandler", "ffmpeg"))
	if ask(kit.T("Sollen auch alle Projekte und Einstellungen gelöscht werden?\n\nJa = alles weg, Creator Hub startet beim nächsten Installieren leer.\nNein = Projekte bleiben erhalten.", "Also delete all projects and settings?\n\nYes = everything is removed, Creator Hub starts empty next time.\nNo = projects are kept.")) {
		DeleteUserData()
	}
	Info(kit.T("Creator Hub wurde deinstalliert.", "Creator Hub has been uninstalled."))
	// Der Programmordner wird gelöscht, sobald dieses Programm beendet ist.
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	if strings.EqualFold(dir, InstallDir()) {
		cmd := exec.Command("cmd", "/c", "ping 127.0.0.1 -n 3 >nul & rmdir /s /q \""+dir+"\"")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000 | 0x01000000}
		if cmd.Start() != nil {
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
			cmd.Start()
		}
	}
}

var _ = unsafe.Pointer(nil)

// HasDesktopShortcut: Gab es schon eine Desktop-Verknüpfung? (Beim Update nicht neu anlegen, wenn gelöscht.)
func HasDesktopShortcut() bool {
	_, err := os.Stat(shortcutPaths()[1])
	return err == nil
}

// StopRunning beendet laufende Teile von Creator Hub (auch unsichtbar hängende ältere Versionen),
// damit der Installer die Dateien ersetzen kann. /T beendet auch ihre Hilfsprogramme (ffmpeg, Browserfenster).
func StopRunning() {
	for _, n := range []string{ExeName, "Videoschnitt.exe", "MP3-Schneider.exe", "Bildbearbeitung.exe", "Motion-Design.exe", "StreamPilot.exe", "Kanalwerk.exe", "Sendeplan.exe", "Social-Planer.exe"} {
		c := exec.Command("taskkill", "/F", "/T", "/IM", n)
		c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		c.Run()
	}
	// Übrig gebliebene Browser-Hintergrundprozesse unserer Fenster (WebView2) beenden, sonst bleiben neue Fenster weiß
	ps := `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match 'CreatorHub|Videoschnitt|MP3-Schneider|Bildbearbeitung|Motion-Design|MotionDesign|StreamPilot|Kanalwerk|Sendeplan|Social-Planer|Creator Hub' -and $_.CommandLine -notmatch 'CreatorHubSetup' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
	c := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", ps)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	c.Run()
}

// StopTools schließt die eigenständigen Werkzeuge (für ein Update): erst freundlich,
// damit sie speichern können, nach ein paar Sekunden hart samt ffmpeg.
func StopTools() {
	names := []string{"Videoschnitt.exe", "MP3-Schneider.exe", "Bildbearbeitung.exe", "Motion-Design.exe", "StreamPilot.exe", "Kanalwerk.exe", "Sendeplan.exe", "Social-Planer.exe"}
	run := func(args ...string) {
		c := exec.Command("taskkill", args...)
		c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		c.Run()
	}
	running := func() bool {
		c := exec.Command("tasklist", "/FO", "CSV", "/NH")
		c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		out, _ := c.Output()
		s := strings.ToLower(string(out))
		for _, n := range names {
			if strings.Contains(s, strings.ToLower(n)) {
				return true
			}
		}
		return false
	}
	if !running() {
		return
	}
	for _, n := range names {
		run("/IM", n)
	}
	for i := 0; i < 10 && running(); i++ {
		time.Sleep(400 * time.Millisecond)
	}
	for _, n := range names {
		run("/F", "/T", "/IM", n)
	}
}

// IntegrateAppImage gibt es nur unter Linux.
func IntegrateAppImage() {}

// RegisterTool gibt es nur unter Linux.
func RegisterTool(exe, name, title string, png []byte) {}

// EnsureStartMenu: Startmenü-Eintrag des Hubs wiederherstellen, falls er fehlt (z. B. nach einem
// Update, das ihn verdeckt oder entfernt hat). Nur wenn der Hub aus dem Programmordner läuft.
func EnsureStartMenu() {
	exe, err := os.Executable()
	if err != nil || !strings.EqualFold(filepath.Dir(exe), InstallDir()) {
		return
	}
	p := shortcutPaths()[0]
	if fi, err := os.Stat(filepath.Join(filepath.Dir(p), AppName)); err == nil && fi.IsDir() {
		os.RemoveAll(filepath.Join(filepath.Dir(p), AppName))
	}
	if _, err := os.Stat(p); err == nil {
		return
	}
	makeLink(p, exe, filepath.Dir(exe), exe, "Alle Werkzeuge für Content Creator")
}

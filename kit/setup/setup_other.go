//go:build !windows && !linux

package setup

import (
	"os/exec"
	"runtime"
	"time"
)

const (
	AppName = "Creator Hub"
	ExeName = "Creator-Hub"
)

func InstallDir() string                                { return "" }
func CreateShortcuts(exe string, desktop bool) error    { return nil }
func RegisterUninstall(exe string, sizeKB uint32) error { return nil }

// Info zeigt eine Meldung (macOS: Systemdialog).
func Info(text string) {
	if runtime.GOOS == "darwin" {
		exec.Command("/usr/bin/osascript", "-e", "on run argv", "-e", "display dialog (item 1 of argv) buttons {\"OK\"} default button 1 with title \"Creator Hub\"", "-e", "end run", text).Run()
	}
}
func Uninstall()               {}
func HasDesktopShortcut() bool { return false }

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

// IntegrateAppImage gibt es nur unter Linux.
func IntegrateAppImage() {}

// RegisterTool gibt es nur unter Linux.
func RegisterTool(exe, name, title string, png []byte) {}

func ToolShortcuts(exe, title string) {}

func EnsureStartMenu() {}

//go:build windows

package setup

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/sys/windows/registry"

	"kit"
)

// Einzelne Werkzeuge mit eigenem Installer (ohne Hub):
// %LOCALAPPDATA%\Programs\Creator Hub Werkzeuge\<Werkzeug>\<Werkzeug>.exe

func ToolInstallDir(tool string) string {
	d, _ := os.UserCacheDir()
	return filepath.Join(d, "Programs", "Creator Hub Werkzeuge", tool)
}

func toolKey(tool string) string { return `Software\Microsoft\Windows\CurrentVersion\Uninstall\CreatorHub-` + tool }

func toolLinkPaths(title string) []string {
	return []string{filepath.Join(os.Getenv("APPDATA"), `Microsoft\Windows\Start Menu\Programs`, title+".lnk"),
		filepath.Join(filepath.Dir(shortcutPaths()[1]), title+".lnk")}
}

// ToolInstallShortcuts legt Startmenü- und (optional) Desktop-Verknüpfung des Werkzeugs an.
func ToolInstallShortcuts(exe, title string, desktop bool) error {
	for i, p := range toolLinkPaths(title) {
		if i == 1 && !desktop {
			continue
		}
		os.MkdirAll(filepath.Dir(p), 0o755)
		if err := makeLink(p, exe, filepath.Dir(exe), exe, title+" – Creator Hub"); err != nil {
			return err
		}
	}
	return nil
}

// RegisterToolUninstall trägt das Werkzeug unter „Apps“ in den Windows-Einstellungen ein.
func RegisterToolUninstall(tool, title, exe string, sizeKB uint32) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, toolKey(tool), registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	k.SetStringValue("DisplayName", title+" (Creator Hub)")
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

// StopTool beendet ein laufendes Werkzeug (vor dem Überschreiben).
func StopTool(tool string) {
	c := exec.Command("taskkill", "/F", "/IM", tool+".exe")
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	c.Run()
}

// UninstallTool entfernt ein einzeln installiertes Werkzeug. KI und ffmpeg bleiben,
// weil der Hub und andere Werkzeuge sie mitbenutzen.
func UninstallTool(tool, title string) {
	if !ask(kit.T(title+" wirklich deinstallieren?\n\nDeine Projekte und fertigen Dateien bleiben erhalten.", "Really uninstall "+title+"?\n\nYour projects and finished files are kept.")) {
		return
	}
	for _, p := range toolLinkPaths(title) {
		os.Remove(p)
	}
	registry.DeleteKey(registry.CURRENT_USER, toolKey(tool))
	Info(kit.T(title+" wurde deinstalliert.", title+" has been uninstalled."))
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	if strings.EqualFold(dir, ToolInstallDir(tool)) {
		cmd := exec.Command("cmd", "/c", "ping 127.0.0.1 -n 3 >nul & rmdir /s /q \""+dir+"\"")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000 | 0x01000000}
		if cmd.Start() != nil {
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
			cmd.Start()
		}
	}
}

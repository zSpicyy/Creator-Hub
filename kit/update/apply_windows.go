//go:build windows

package update

import (
	"os/exec"
	"syscall"
)

// Unter Windows ist das Update der neue Installer. Er wartet, bis der Hub beendet ist,
// ersetzt ihn ohne Rückfrage und startet ihn neu.
func apply(setupExe string, restart bool) error {
	arg := "--update"
	if !restart {
		arg = "--update-quiet" // nur ersetzen, nicht neu starten
	}
	cmd := exec.Command(setupExe, arg)
	// eigener Job: der Installer muss das Ende des Hubs überleben
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x01000000}
	if err := cmd.Start(); err == nil {
		return nil
	}
	cmd.SysProcAttr = nil
	return cmd.Start()
}

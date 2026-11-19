//go:build windows

package update

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
)

// applyTool ersetzt ein einzelnes Werkzeug (die .exe selbst) und startet es neu.
// Eine laufende .exe lässt sich unter Windows umbenennen, aber nicht überschreiben:
// die alte wird zu „<Name>.exe.alt“ und beim nächsten Start gelöscht.
func applyTool(src string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	old := exe + ".alt"
	os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		return errors.New("Das Programm lässt sich nicht ersetzen. Liegt es in einem geschützten Ordner?")
	}
	in, err := os.Open(src)
	if err != nil {
		os.Rename(old, exe)
		return err
	}
	defer in.Close()
	out, err := os.Create(exe)
	if err == nil {
		_, err = io.Copy(out, in)
		out.Close()
	}
	if err != nil {
		os.Remove(exe)
		os.Rename(old, exe)
		return errors.New("Die neue Version ließ sich nicht speichern.")
	}
	cmd := exec.Command(exe)
	cmd.Dir = filepath.Dir(exe)
	cmd.Env = append(os.Environ(), "CREATORHUB_AFTER_PID="+strconv.Itoa(os.Getpid()))
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x01000000 | 0x00000200} // eigener Job, neue Prozessgruppe
	if err := cmd.Start(); err != nil {
		cmd.SysProcAttr = nil
		return cmd.Start()
	}
	return nil
}

// CleanupOld löscht die alte Version nach einem Update.
func CleanupOld() {
	if exe, err := os.Executable(); err == nil {
		exe, _ = filepath.EvalSymlinks(exe)
		os.Remove(exe + ".alt")
	}
}

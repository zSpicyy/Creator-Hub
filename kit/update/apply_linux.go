//go:build linux

package update

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// Unter Linux ist das Update ein .tar.gz mit dem neuen Programm. Die laufende Datei wird
// ersetzt (unter Linux geht das auch während sie läuft) und das Programm neu gestartet.
func apply(archive string, restart bool) error {
	if strings.HasSuffix(archive, ".AppImage") {
		return applyAppImage(archive, restart)
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return errors.New("Die Update-Datei ist beschädigt.")
	}
	tr := tar.NewReader(zr)
	found := false
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return errors.New("Die Update-Datei ist beschädigt.")
		}
		if h.Typeflag != tar.TypeReg || filepath.Base(h.Name) != filepath.Base(exe) || strings.Contains(h.Name, "..") {
			continue
		}
		tmp := exe + ".neu"
		out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			return errors.New("Das Programm lässt sich nicht ersetzen. Fehlen Schreibrechte?")
		}
		_, err = io.Copy(out, tr)
		out.Close()
		if err != nil {
			os.Remove(tmp)
			return err
		}
		if err := os.Rename(tmp, exe); err != nil {
			os.Remove(tmp)
			return errors.New("Das Programm lässt sich nicht ersetzen. Fehlen Schreibrechte?")
		}
		found = true
	}
	if !found {
		return errors.New("Im Update fehlt das Programm.")
	}
	cmd := exec.Command(exe)
	cmd.Env = append(os.Environ(), "CREATORHUB_AFTER_PID="+strconv.Itoa(os.Getpid())) // neue Version wartet, bis diese beendet ist
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

// applyAppImage ersetzt das laufende AppImage durch das neue und startet es (falls gewünscht) neu.
func applyAppImage(src string, restart bool) error {
	dst := os.Getenv("APPIMAGE")
	if dst == "" {
		dst = src // nicht aus einem AppImage gestartet: einfach das neue starten
	} else if dst != src {
		in, err := os.Open(src)
		if err != nil {
			return err
		}
		defer in.Close()
		tmp := dst + ".neu"
		out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			return errors.New("Das AppImage lässt sich nicht ersetzen. Fehlen Schreibrechte?")
		}
		_, err = io.Copy(out, in)
		out.Close()
		if err != nil {
			os.Remove(tmp)
			return err
		}
		if err := os.Rename(tmp, dst); err != nil {
			os.Remove(tmp)
			return errors.New("Das AppImage lässt sich nicht ersetzen. Fehlen Schreibrechte?")
		}
	}
	os.Chmod(dst, 0o755)
	if !restart {
		return nil
	}
	cmd := exec.Command(dst)
	cmd.Env = append(os.Environ(), "CREATORHUB_AFTER_PID="+strconv.Itoa(os.Getpid()))
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

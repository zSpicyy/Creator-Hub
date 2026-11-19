//go:build !windows

package main

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"kit"
)

func pickPath(mode string) (string, error) {
	filter := "MP3|*.mp3"
	if mode == "folder" {
		filter = ""
	}
	p, err := kit.PickPath(mode, filter)
	if err != nil || len(p) == 0 {
		return "", err
	}
	return p[0], nil
}

// moveToTrash legt Dateien in den Papierkorb (freedesktop.org-Standard), damit man sie wiederherstellen kann.
func moveToTrash(paths []string) error {
	if runtime.GOOS == "darwin" { // macOS: Papierkorb im Finder
		return macTrash(paths)
	}
	if g, err := exec.LookPath("gio"); err == nil {
		args := append([]string{"trash"}, paths...)
		if exec.Command(g, args...).Run() == nil {
			return nil
		}
	}
	base := filepath.Join(kit.ProgramDir(), "Trash")
	os.MkdirAll(filepath.Join(base, "files"), 0o700)
	os.MkdirAll(filepath.Join(base, "info"), 0o700)
	for _, p := range paths {
		abs, _ := filepath.Abs(p)
		name := filepath.Base(abs)
		dst := filepath.Join(base, "files", name)
		for i := 2; ; i++ {
			if _, err := os.Stat(dst); err != nil {
				break
			}
			name = fmt.Sprintf("%s.%d", filepath.Base(abs), i)
			dst = filepath.Join(base, "files", name)
		}
		info := fmt.Sprintf("[Trash Info]\nPath=%s\nDeletionDate=%s\n", (&url.URL{Path: abs}).EscapedPath(), time.Now().Format("2006-01-02T15:04:05"))
		if err := os.WriteFile(filepath.Join(base, "info", name+".trashinfo"), []byte(info), 0o600); err != nil {
			return err
		}
		if err := os.Rename(abs, dst); err != nil {
			os.Remove(filepath.Join(base, "info", name+".trashinfo"))
			if strings.Contains(err.Error(), "cross-device") { // anderes Laufwerk: Papierkorb nicht erreichbar
				return os.Remove(abs)
			}
			return err
		}
	}
	return nil
}

func openFolder(p string)                { kit.OpenFolder(p) }
func openURL(u string) {
	if runtime.GOOS == "darwin" {
		exec.Command("/usr/bin/open", u).Start()
		return
	}
	exec.Command("xdg-open", u).Start()
}

// macTrash legt Dateien über den Finder in den Papierkorb (dort „Zurücklegen“ möglich).
func macTrash(paths []string) error {
	for _, p := range paths {
		abs, _ := filepath.Abs(p)
		err := exec.Command("/usr/bin/osascript", "-e", "on run argv", "-e", "tell application \"Finder\" to delete (POSIX file (item 1 of argv) as alias)", "-e", "end run", abs).Run()
		if err != nil { // ohne Finder-Erlaubnis: selbst in ~/.Trash schieben
			home, _ := os.UserHomeDir()
			dst := filepath.Join(home, ".Trash", filepath.Base(abs))
			for i := 2; ; i++ {
				if _, e := os.Stat(dst); e != nil {
					break
				}
				dst = filepath.Join(home, ".Trash", fmt.Sprintf("%s %d%s", strings.TrimSuffix(filepath.Base(abs), filepath.Ext(abs)), i, filepath.Ext(abs)))
			}
			if e := os.Rename(abs, dst); e != nil {
				return e
			}
		}
	}
	return nil
}
func protect(b []byte) ([]byte, error)   { return b, nil } // Datei liegt nur für den Benutzer lesbar im Konfigurationsordner
func unprotect(b []byte) ([]byte, error) { return b, nil }

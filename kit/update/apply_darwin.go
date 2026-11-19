//go:build darwin

package update

import (
	"archive/zip"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Unter macOS ist das Update ein ZIP mit „Creator Hub.app“. Es wird neben die laufende App entpackt,
// dann wird die alte App in einem Schritt ersetzt und (falls gewünscht) neu gestartet.
func apply(zipPath string, restart bool) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	// …/Creator Hub.app/Contents/MacOS/Creator-Hub → …/Creator Hub.app
	app := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
	if !strings.HasSuffix(app, ".app") {
		return errors.New("Das Programm läuft nicht aus einer App. Bitte die neue Version von Hand installieren.")
	}
	parent := filepath.Dir(app)
	tmp, err := os.MkdirTemp(parent, ".creatorhub-update-")
	if err != nil {
		return errors.New("Der Programmordner ist schreibgeschützt. Bitte die App in den Ordner „Programme“ ziehen.")
	}
	if err := unzip(zipPath, tmp); err != nil {
		os.RemoveAll(tmp)
		return err
	}
	var newApp string
	es, _ := os.ReadDir(tmp)
	for _, e := range es {
		if e.IsDir() && strings.HasSuffix(e.Name(), ".app") {
			newApp = filepath.Join(tmp, e.Name())
		}
	}
	if newApp == "" {
		os.RemoveAll(tmp)
		return errors.New("Im Update fehlt die App.")
	}
	// Quarantäne-Kennzeichen entfernen, damit Gatekeeper das selbst geprüfte Update nicht blockiert
	exec.Command("xattr", "-dr", "com.apple.quarantine", newApp).Run()
	old := app + ".alt-" + strconv.FormatInt(time.Now().Unix(), 36)
	if err := os.Rename(app, old); err != nil {
		os.RemoveAll(tmp)
		return errors.New("Die alte Version lässt sich nicht ersetzen.")
	}
	if err := os.Rename(newApp, app); err != nil {
		os.Rename(old, app) // zurück
		os.RemoveAll(tmp)
		return errors.New("Die neue Version lässt sich nicht einsetzen.")
	}
	os.RemoveAll(tmp)
	go func() { time.Sleep(5 * time.Second); os.RemoveAll(old) }()
	if !restart {
		return nil
	}
	// neu starten, sobald diese Instanz beendet ist
	cmd := exec.Command("/bin/sh", "-c", "sleep 1; /usr/bin/open -n \"$0\"", app)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return cmd.Start()
}

func unzip(src, dst string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return errors.New("Das Update ist beschädigt.")
	}
	defer r.Close()
	root, _ := filepath.Abs(dst)
	for _, f := range r.File {
		p := filepath.Join(root, f.Name)
		if !strings.HasPrefix(p, root+string(os.PathSeparator)) {
			return errors.New("Das Update ist beschädigt.")
		}
		mode := f.Mode()
		switch {
		case f.FileInfo().IsDir():
			if err := os.MkdirAll(p, 0o755); err != nil {
				return err
			}
		case mode&os.ModeSymlink != 0:
			rc, err := f.Open()
			if err != nil {
				return err
			}
			t, _ := io.ReadAll(io.LimitReader(rc, 4096))
			rc.Close()
			os.MkdirAll(filepath.Dir(p), 0o755)
			if err := os.Symlink(string(t), p); err != nil {
				return err
			}
		default:
			os.MkdirAll(filepath.Dir(p), 0o755)
			rc, err := f.Open()
			if err != nil {
				return err
			}
			perm := mode.Perm()
			if perm == 0 {
				perm = 0o644
			}
			out, err := os.OpenFile(p, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, perm)
			if err != nil {
				rc.Close()
				return err
			}
			_, err = io.Copy(out, rc)
			rc.Close()
			out.Close()
			if err != nil {
				return err
			}
		}
	}
	return nil
}

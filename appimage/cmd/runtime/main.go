// Startprogramm des Creator-Hub-AppImages (AppImage Typ 2: ELF mit „AI\x02“ an Byte 8, dahinter SquashFS).
// Statt das Abbild per FUSE einzuhängen, wird es einmal in den Cache entpackt und von dort gestartet.
// So läuft es auch ohne libfuse2. Unterstützt: --appimage-extract, --appimage-offset, --appimage-version.
package main

import (
	"appimage/sqfs"
	"debug/elf"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Tag trägt die Version (für die Update-Erkennung im Hub): -X main.Tag=CHSETUPVER-1.2.3-END
var Tag = ""

// Name steht in Fehlermeldungen (einzelne Werkzeuge: -X main.Name=Upscaler).
var Name = "Creator Hub"

func offset(self string) (int64, error) {
	f, err := elf.Open(self)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	end := int64(f.FileHeader.Entry) * 0
	for _, p := range f.Progs {
		if e := int64(p.Off + p.Filesz); e > end {
			end = e
		}
	}
	for _, s := range f.Sections {
		if s.Type != elf.SHT_NOBITS {
			if e := int64(s.Offset + s.FileSize); e > end {
				end = e
			}
		}
	}
	// Abschnittstabelle selbst
	r, _ := os.Open(self)
	defer r.Close()
	h := make([]byte, 64)
	r.ReadAt(h, 0)
	shoff := int64(le64(h[40:]))
	shentsize, shnum := int64(le16(h[58:])), int64(le16(h[60:]))
	if e := shoff + shentsize*shnum; e > end {
		end = e
	}
	return end, nil
}

func le64(b []byte) uint64 { return uint64(le32(b)) | uint64(le32(b[4:]))<<32 }
func le32(b []byte) uint32 {
	return uint32(b[0]) | uint32(b[1])<<8 | uint32(b[2])<<16 | uint32(b[3])<<24
}
func le16(b []byte) uint16 { return uint16(b[0]) | uint16(b[1])<<8 }

func die(msg string) {
	fmt.Fprintln(os.Stderr, Name+": "+msg)
	notify(Name + ": " + msg)
	os.Exit(1)
}

func lookPath(n string) (string, error) {
	for _, d := range filepath.SplitList(os.Getenv("PATH")) {
		p := filepath.Join(d, n)
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Mode()&0o111 != 0 {
			return p, nil
		}
	}
	return "", os.ErrNotExist
}

func main() {
	self, err := os.Executable()
	if err != nil {
		die(err.Error())
	}
	self, _ = filepath.EvalSymlinks(self)
	off, err := offset(self)
	if err != nil {
		die("Die Datei ist beschädigt (" + err.Error() + ").")
	}
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--appimage-offset":
			fmt.Println(off)
			return
		case "--appimage-version":
			fmt.Println(Tag)
			return
		}
	}
	f, err := os.Open(self)
	if err != nil {
		die(err.Error())
	}
	s, err := sqfs.Open(f, off)
	if err != nil {
		die("Die Datei ist beschädigt (" + err.Error() + ").")
	}
	if len(os.Args) > 1 && os.Args[1] == "--appimage-extract" {
		if err := s.Extract("squashfs-root"); err != nil {
			die(err.Error())
		}
		fmt.Println("squashfs-root")
		return
	}
	// Cache: ~/.cache/creator-hub/appimage/<Größe-Zeit>
	cache, _ := os.UserCacheDir()
	if cache == "" {
		cache = os.TempDir()
	}
	key := strconv.FormatUint(s.BytesUsed, 36) + "-" + strconv.FormatUint(uint64(s.Mtime), 36)
	base := filepath.Join(cache, "creator-hub", "appimage")
	dir := filepath.Join(base, key)
	if _, err := os.Stat(filepath.Join(dir, ".fertig")); err != nil {
		os.MkdirAll(base, 0o755)
		tmp, err := os.MkdirTemp(base, ".entpacken-")
		if err != nil {
			die(err.Error())
		}
		if err := s.Extract(tmp); err != nil {
			os.RemoveAll(tmp)
			die("Entpacken fehlgeschlagen: " + err.Error())
		}
		os.WriteFile(filepath.Join(tmp, ".fertig"), nil, 0o644)
		if err := os.Rename(tmp, dir); err != nil {
			os.RemoveAll(tmp) // ein anderer Start war schneller
		}
		// alte Versionen wegräumen
		if es, _ := os.ReadDir(base); len(es) > 0 {
			for _, e := range es {
				if e.Name() != key && e.IsDir() && e.Name()[0] != '.' {
					os.RemoveAll(filepath.Join(base, e.Name()))
				}
			}
		}
	}
	f.Close()
	env := append(os.Environ(), "APPIMAGE="+self, "APPDIR="+dir, "ARGV0="+os.Args[0], "OWD="+mustWd())
	app := filepath.Join(dir, "AppRun")
	// AppImage-eigene Optionen (z. B. --appimage-extract-and-run von Gear Lever) nicht an die App weitergeben
	var args []string
	for _, x := range os.Args[1:] {
		if !strings.HasPrefix(x, "--appimage-") {
			args = append(args, x)
		}
	}
	// App als Kindprozess starten und alles mitschreiben (~/.cache/creator-hub/start.log),
	// damit auch Fehler ganz am Anfang sichtbar werden.
	logPath := filepath.Join(cache, "creator-hub", "start.log")
	if st, err := os.Stat(logPath); err == nil && st.Size() > 1<<20 {
		os.Remove(logPath) // nicht endlos wachsen lassen
	}
	lf, _ := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if lf != nil {
		fmt.Fprintln(lf, "----")
	}
	logw := func(s string) {
		if lf != nil {
			fmt.Fprintln(lf, time.Now().Format("15:04:05.000"), "["+strconv.Itoa(os.Getpid())+"]", s)
		}
	}
	logw("AppImage " + Tag + " startet: " + app)
	logw("DISPLAY=" + os.Getenv("DISPLAY") + " WAYLAND_DISPLAY=" + os.Getenv("WAYLAND_DISPLAY") + " Desktop=" + os.Getenv("XDG_CURRENT_DESKTOP"))
	cmd := exec.Command(app, args...)
	cmd.Env = env
	cmd.Stdin = os.Stdin
	var out io.Writer = os.Stdout
	var errw io.Writer = os.Stderr
	if lf != nil {
		out, errw = io.MultiWriter(os.Stdout, lf), io.MultiWriter(os.Stderr, lf)
	}
	cmd.Stdout, cmd.Stderr = out, errw
	start := time.Now()
	if err := cmd.Start(); err != nil {
		logw("Start fehlgeschlagen: " + err.Error())
		notify(Name + " konnte nicht starten: " + err.Error() + "\nDetails: " + logPath)
		die("Start fehlgeschlagen: " + err.Error())
	}
	// Signale (z. B. Strg+C, Abmelden) an die App weiterreichen
	sig := make(chan os.Signal, 4)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	go func() {
		for s := range sig {
			cmd.Process.Signal(s)
		}
	}()
	err = cmd.Wait()
	code, signaled := 0, false
	if err != nil {
		code = 1
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
			if ws, ok := ee.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
				signaled = ws.Signal() == syscall.SIGTERM || ws.Signal() == syscall.SIGKILL || ws.Signal() == syscall.SIGINT
				logw("App durch Signal beendet: " + ws.Signal().String())
			}
		}
	}
	logw(fmt.Sprintf("App beendet nach %.1f s, Code %d", time.Since(start).Seconds(), code))
	if lf != nil {
		lf.Close()
	}
	if code != 0 && !signaled && time.Since(start) < 30*time.Second { // absichtlich beendet: keine Meldung
		notify(Name + " wurde unerwartet beendet (Code " + strconv.Itoa(code) + ").\nDetails: " + logPath)
	}
	os.Exit(code)
}

// notify zeigt eine Desktop-Benachrichtigung (GNOME, KDE …), ohne zusätzliche Programme vorauszusetzen.
func notify(msg string) {
	if p, err := lookPath("notify-send"); err == nil {
		exec.Command(p, "-a", Name, Name, msg).Run()
		return
	}
	if p, err := lookPath("gdbus"); err == nil {
		exec.Command(p, "call", "--session", "--dest", "org.freedesktop.Notifications", "--object-path", "/org/freedesktop/Notifications",
			"--method", "org.freedesktop.Notifications.Notify", Name, "0", "", Name, msg, "[]", "{}", "10000").Run()
		return
	}
	if p, err := lookPath("zenity"); err == nil {
		exec.Command(p, "--error", "--title="+Name, "--text="+msg).Run()
	}
}

func mustWd() string { d, _ := os.Getwd(); return d }

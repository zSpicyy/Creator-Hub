package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Die Umwandlung übernimmt ffmpeg. Es wird beim ersten Start von gyan.dev geladen und gegen die
// veröffentlichte SHA-256-Prüfsumme geprüft, damit das Programm klein bleibt.
const (
	engineURL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
	engineSum = engineURL + ".sha256"
)

type Engine struct {
	mu       sync.Mutex
	dir      string
	Loading  bool
	Done     float64
	Error    string
	Sizes    string
}

func exeName(n string) string {
	if runtime.GOOS == "windows" {
		return n + ".exe"
	}
	return n
}

func (e *Engine) find(name string) string {
	cands := []string{}
	if p := os.Getenv("UMWANDLER_FFMPEG_DIR"); p != "" {
		cands = append(cands, filepath.Join(p, exeName(name)))
	}
	if ex, err := os.Executable(); err == nil {
		cands = append(cands, filepath.Join(filepath.Dir(ex), exeName(name)), filepath.Join(filepath.Dir(ex), "ffmpeg", exeName(name)))
	}
	cands = append(cands, filepath.Join(e.dir, exeName(name)))
	for _, c := range cands {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	return ""
}

func (e *Engine) Ready() bool { return e.find("ffmpeg") != "" && e.find("ffprobe") != "" }

func (e *Engine) Install() error {
	e.mu.Lock()
	if e.Loading {
		e.mu.Unlock()
		return nil
	}
	e.Loading, e.Done, e.Error = true, 0, ""
	e.mu.Unlock()
	go func() {
		err := e.install()
		e.mu.Lock()
		e.Loading = false
		if err != nil {
			e.Error = err.Error()
		} else {
			e.Done = 1
		}
		e.mu.Unlock()
	}()
	return nil
}

func (e *Engine) progress(d float64) {
	e.mu.Lock()
	e.Done = d
	e.mu.Unlock()
}

func (e *Engine) install() error {
	if err := os.MkdirAll(e.dir, 0o755); err != nil {
		return err
	}
	client := &http.Client{Timeout: 0}
	// 1. erwartete Prüfsumme holen
	resp, err := client.Get(engineSum)
	if err != nil {
		return errors.New("Keine Verbindung zum Download-Server. Prüfe dein Internet.")
	}
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	resp.Body.Close()
	want := strings.ToLower(strings.TrimSpace(string(b)))
	if i := strings.IndexAny(want, " \t\r\n"); i > 0 {
		want = want[:i]
	}
	if resp.StatusCode != 200 || len(want) != 64 {
		return errors.New("Die Prüfsumme des Downloads ließ sich nicht abrufen.")
	}
	// 2. Archiv laden
	tmp := filepath.Join(e.dir, "download.zip.tmp")
	defer os.Remove(tmp)
	r2, err := client.Get(engineURL)
	if err != nil {
		return errors.New("Der Download ist fehlgeschlagen.")
	}
	defer r2.Body.Close()
	if r2.StatusCode != 200 {
		return fmt.Errorf("Der Server antwortete mit Fehler %d.", r2.StatusCode)
	}
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	h := sha256.New()
	buf := make([]byte, 1<<20)
	var got int64
	last := time.Now()
	for {
		n, rerr := r2.Body.Read(buf)
		if n > 0 {
			f.Write(buf[:n])
			h.Write(buf[:n])
			got += int64(n)
			if r2.ContentLength > 0 && time.Since(last) > 200*time.Millisecond {
				e.progress(float64(got) / float64(r2.ContentLength) * 0.9)
				last = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return errors.New("Der Download wurde unterbrochen. Versuche es noch einmal.")
		}
	}
	f.Close()
	if hex.EncodeToString(h.Sum(nil)) != want {
		return errors.New("Die Prüfsumme stimmt nicht. Die Datei wurde nicht installiert.")
	}
	// 3. ffmpeg und ffprobe entpacken
	zr, err := zip.OpenReader(tmp)
	if err != nil {
		return err
	}
	defer zr.Close()
	found := 0
	for _, zf := range zr.File {
		base := filepath.Base(zf.Name)
		if base != "ffmpeg.exe" && base != "ffprobe.exe" {
			continue
		}
		if !strings.Contains(zf.Name, "/bin/") {
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			return err
		}
		dst := filepath.Join(e.dir, base)
		out, err := os.Create(dst + ".tmp")
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		rc.Close()
		out.Close()
		if err != nil {
			os.Remove(dst + ".tmp")
			return err
		}
		if err := os.Rename(dst+".tmp", dst); err != nil {
			return err
		}
		found++
	}
	if found < 2 {
		return errors.New("Im Download fehlen ffmpeg oder ffprobe.")
	}
	return nil
}

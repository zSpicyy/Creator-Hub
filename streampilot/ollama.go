package main

// Lokale KI für den Sortierer: Ollama wird bei Bedarf automatisch heruntergeladen, gestartet
// und das Modell geladen. Niemand muss etwas von Hand installieren.

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/json"
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

	"kit"
)

const defaultModel = "qwen2.5:3b" // klein (ca. 2 GB) und gut genug für Genre und Stimmung

type AISetup struct {
	mu      sync.Mutex
	Running bool    `json:"running"`
	Step    string  `json:"step"` // download | unpack | start | model | ready | error
	Done    int64   `json:"done"`
	Total   int64   `json:"total"`
	Error   string  `json:"error"`
	Model   string  `json:"model"`
	Pct     float64 `json:"pct"`
}

var ai = &AISetup{}

func (a *AISetup) set(step string, done, total int64) {
	a.mu.Lock()
	a.Step, a.Done, a.Total = step, done, total
	if total > 0 {
		a.Pct = float64(done) / float64(total)
	} else {
		a.Pct = 0
	}
	a.mu.Unlock()
}

func (a *AISetup) Snapshot() map[string]any {
	a.mu.Lock()
	defer a.mu.Unlock()
	b, _ := json.Marshal(a)
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	return m
}

func aiModel() string {
	if m := strings.TrimSpace(gStr("aiModel")); m != "" {
		return m
	}
	return defaultModel
}

func ollamaUp() bool {
	c := &http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(ollamaURL + "/api/version")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func hasModel(m string) bool {
	for _, x := range ollamaModels() {
		if x == m || strings.TrimSuffix(x, ":latest") == m {
			return true
		}
	}
	return false
}

// aiReady: Server läuft und das Modell ist da.
func aiReady() bool { return ollamaUp() && hasModel(aiModel()) }

func ollamaDir() string { return dataPath("ki") }

// ollamaBin sucht ein vorhandenes Ollama (selbst geladen oder schon installiert).
func ollamaBin() string {
	exe := "ollama"
	if runtime.GOOS == "windows" {
		exe = "ollama.exe"
	}
	cands := []string{filepath.Join(ollamaDir(), exe), filepath.Join(ollamaDir(), "bin", exe),
		filepath.Join(ollamaDir(), "Ollama.app", "Contents", "Resources", "ollama")}
	if runtime.GOOS == "windows" {
		cands = append(cands, filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe"))
	}
	if runtime.GOOS == "darwin" {
		cands = append(cands, "/Applications/Ollama.app/Contents/Resources/ollama", "/usr/local/bin/ollama", "/opt/homebrew/bin/ollama")
	}
	for _, c := range cands {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	if p, err := exec.LookPath("ollama"); err == nil {
		return p
	}
	return ""
}

func ollamaPackage() (string, string) {
	switch runtime.GOOS {
	case "windows":
		return "https://ollama.com/download/ollama-windows-amd64.zip", "zip"
	case "darwin":
		return "https://ollama.com/download/Ollama-darwin.zip", "zip"
	}
	if runtime.GOARCH == "arm64" {
		return "https://ollama.com/download/ollama-linux-arm64.tgz", "tgz"
	}
	return "https://ollama.com/download/ollama-linux-amd64.tgz", "tgz"
}

var serveCmd *exec.Cmd

// startOllama startet den KI-Dienst im Hintergrund (endet mit StreamPilot).
func startOllama(bin string) error {
	if ollamaUp() {
		return nil
	}
	_ = os.MkdirAll(filepath.Join(ollamaDir(), "models"), 0o755)
	cmd := exec.Command(bin, "serve")
	cmd.Env = append(os.Environ(), "OLLAMA_HOST=127.0.0.1:11434")
	// eigene Modelle nur, wenn Ollama von StreamPilot selbst stammt (ein installiertes Ollama behält seine)
	if strings.HasPrefix(bin, ollamaDir()) {
		cmd.Env = append(cmd.Env, "OLLAMA_MODELS="+filepath.Join(ollamaDir(), "models"))
	}
	kit.HideCmd(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	serveCmd = cmd
	for i := 0; i < 60; i++ {
		if ollamaUp() {
			return nil
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("%s", tr("Die KI startet nicht. Starte StreamPilot neu und versuch es nochmal.", "The AI does not start. Restart StreamPilot and try again."))
}

// setupAI lädt Ollama und das Modell, falls nötig. Läuft im Hintergrund, Fortschritt in ai.
func setupAI() {
	ai.mu.Lock()
	if ai.Running {
		ai.mu.Unlock()
		return
	}
	ai.Running, ai.Error, ai.Model = true, "", aiModel()
	ai.mu.Unlock()
	defer func() { ai.mu.Lock(); ai.Running = false; ai.mu.Unlock() }()
	fail := func(err error) {
		ai.mu.Lock()
		ai.Step, ai.Error = "error", err.Error()
		ai.mu.Unlock()
	}
	if !ollamaUp() {
		bin := ollamaBin()
		if bin == "" {
			if err := downloadOllama(); err != nil {
				fail(err)
				return
			}
			bin = ollamaBin()
			if bin == "" {
				fail(fmt.Errorf("%s", tr("Ollama ließ sich nicht einrichten.", "Ollama could not be set up.")))
				return
			}
		}
		ai.set("start", 0, 0)
		if err := startOllama(bin); err != nil {
			fail(err)
			return
		}
	}
	if !hasModel(aiModel()) {
		if err := pullModel(aiModel()); err != nil {
			fail(err)
			return
		}
	}
	ai.set("ready", 1, 1)
}

func downloadOllama() error {
	url, kind := ollamaPackage()
	_ = os.MkdirAll(ollamaDir(), 0o755)
	tmp := filepath.Join(ollamaDir(), "download.tmp")
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("%s (%v)", tr("Download der KI fehlgeschlagen. Prüfe deine Internetverbindung.", "Downloading the AI failed. Check your internet connection."), err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("Download %d", resp.StatusCode)
	}
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	total := resp.ContentLength
	var done int64
	buf := make([]byte, 1<<20)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				return werr
			}
			done += int64(n)
			ai.set("download", done, total)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return rerr
		}
	}
	f.Close()
	ai.set("unpack", 0, 0)
	defer os.Remove(tmp)
	if kind == "zip" {
		return unzipTo(tmp, ollamaDir())
	}
	return untgzTo(tmp, ollamaDir())
}

func safeJoin(dir, name string) (string, error) {
	p := filepath.Join(dir, name)
	if !strings.HasPrefix(p, filepath.Clean(dir)+string(os.PathSeparator)) {
		return "", fmt.Errorf("bad path %q", name)
	}
	return p, nil
}

func unzipTo(file, dir string) error {
	z, err := zip.OpenReader(file)
	if err != nil {
		return err
	}
	defer z.Close()
	for _, f := range z.File {
		p, err := safeJoin(dir, f.Name)
		if err != nil {
			return err
		}
		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(p, 0o755)
			continue
		}
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if f.Mode()&os.ModeSymlink != 0 {
			rc, _ := f.Open()
			t, _ := io.ReadAll(rc)
			rc.Close()
			_ = os.Symlink(string(t), p)
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode()|0o600)
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
	return nil
}

func untgzTo(file, dir string) error {
	f, err := os.Open(file)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(bufio.NewReader(f))
	if err != nil {
		return err
	}
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		p, err := safeJoin(dir, h.Name)
		if err != nil {
			return err
		}
		switch h.Typeflag {
		case tar.TypeDir:
			_ = os.MkdirAll(p, 0o755)
		case tar.TypeSymlink:
			_ = os.MkdirAll(filepath.Dir(p), 0o755)
			_ = os.Symlink(h.Linkname, p)
		case tar.TypeReg:
			_ = os.MkdirAll(filepath.Dir(p), 0o755)
			out, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(h.Mode)|0o600)
			if err != nil {
				return err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return err
			}
			out.Close()
		}
	}
}

// pullModel lädt das Modell über Ollama und meldet den Fortschritt.
func pullModel(m string) error {
	body, _ := json.Marshal(map[string]any{"model": m, "stream": true})
	resp, err := (&http.Client{}).Post(ollamaURL+"/api/pull", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		var st map[string]any
		if json.Unmarshal(sc.Bytes(), &st) != nil {
			continue
		}
		if e := str(st, "error", ""); e != "" {
			return fmt.Errorf("%s %s", tr("Das KI-Modell ließ sich nicht laden:", "The AI model could not be downloaded:"), e)
		}
		ai.set("model", int64(num(st, "completed", 0)), int64(num(st, "total", 0)))
		if str(st, "status", "") == "success" {
			return nil
		}
	}
	if !hasModel(m) {
		return fmt.Errorf("%s", tr("Das KI-Modell ist nicht vollständig angekommen. Versuch es nochmal.", "The AI model did not download completely. Try again."))
	}
	return nil
}

// ensureAIStarted: beim Öffnen des Sortierers ein vorhandenes Ollama still starten.
func ensureAIStarted() {
	if ollamaUp() {
		return
	}
	if bin := ollamaBin(); bin != "" {
		_ = startOllama(bin)
	}
}

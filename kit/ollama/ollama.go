// Paket ollama richtet die lokale KI (Ollama) für alle Werkzeuge ein, die sie brauchen.
// Sie liegt einmal im gemeinsamen Ordner (<Konfiguration>/CreatorHub/KI/ollama), wird nur nach
// Zustimmung geladen, läuft nur solange ein Werkzeug sie benutzt und endet mit ihm.
package ollama

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
	"strconv"
	"strings"
	"sync"
	"time"

	"kit"
)

const URL = "http://127.0.0.1:11434"

// User ist ein Werkzeug, das die KI braucht.
type User struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Purpose string `json:"purpose"`
	Model   string `json:"model"`
}

// Users: alle Werkzeuge mit KI-Bedarf (für den Hub und die Abfrage beim ersten Start).
func Users() []User {
	return []User{
		{ID: "streampilot", Name: "StreamPilot", Model: "qwen2.5:3b",
			Purpose: kit.T("Der Playlist-Sortierer erkennt damit Genre und Stimmung deiner Songs und sortiert sie in neue Playlists.", "The playlist sorter uses it to recognise the genre and mood of your songs and sort them into new playlists.")},
	}
}

func UserByID(id string) *User {
	for _, u := range Users() {
		if u.ID == id {
			return &u
		}
	}
	return nil
}

// SizeText: ungefährer Download (Ollama plus Modell).
func SizeText() string { return kit.T("etwa 3 GB", "about 3 GB") }

func Dir() string {
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "CreatorHub", "KI", "ollama")
}

// ---------------------------------------------------------------- Zustimmung

type state struct {
	Declined map[string]bool `json:"declined"` // Werkzeug -> „Nicht jetzt“ gewählt
	Asked    map[string]bool `json:"asked"`
	Models   []string        `json:"models"` // fertig geladene Modelle
}

var stMu sync.Mutex

func load() state {
	s := state{Declined: map[string]bool{}, Asked: map[string]bool{}}
	if b, err := os.ReadFile(filepath.Join(Dir(), "status.json")); err == nil {
		json.Unmarshal(b, &s)
	}
	if s.Declined == nil {
		s.Declined = map[string]bool{}
	}
	if s.Asked == nil {
		s.Asked = map[string]bool{}
	}
	return s
}

func save(s state) {
	os.MkdirAll(Dir(), 0o755)
	b, _ := json.MarshalIndent(s, "", " ")
	os.WriteFile(filepath.Join(Dir(), "status.json"), b, 0o644)
}

// Asked: Wurde für dieses Werkzeug schon gefragt (ja oder nein)?
func Asked(tool string) bool { stMu.Lock(); defer stMu.Unlock(); return load().Asked[tool] }

// Answer merkt sich die Antwort auf die Abfrage. tool "*" gilt für alle (Abfrage im Hub).
func Answer(tool string, yes bool) {
	stMu.Lock()
	defer stMu.Unlock()
	s := load()
	ids := []string{tool}
	if tool == "*" {
		ids = nil
		for _, u := range Users() {
			ids = append(ids, u.ID)
		}
	}
	for _, id := range ids {
		s.Asked[id] = true
		s.Declined[id] = !yes
	}
	save(s)
}

func markModel(m string) {
	stMu.Lock()
	defer stMu.Unlock()
	s := load()
	for _, x := range s.Models {
		if x == m {
			return
		}
	}
	s.Models = append(s.Models, m)
	save(s)
}

// Installed: Ollama und das Modell sind fertig da (ohne die KI dafür zu starten).
func Installed(model string) bool {
	if Bin() == "" {
		return false
	}
	stMu.Lock()
	s := load()
	stMu.Unlock()
	for _, x := range s.Models {
		if x == model {
			return true
		}
	}
	return Up() && HasModel(model)
}

// ---------------------------------------------------------------- Programm finden und starten

func exe() string {
	if runtime.GOOS == "windows" {
		return "ollama.exe"
	}
	return "ollama"
}

// Bin sucht Ollama: zuerst die eigene Kopie, dann ein schon installiertes.
func Bin() string {
	d := Dir()
	cands := []string{filepath.Join(d, exe()), filepath.Join(d, "bin", exe()), filepath.Join(d, "Ollama.app", "Contents", "Resources", "ollama")}
	// alte Kopie von StreamPilot 1.1.79 übernehmen
	if cfg, err := os.UserConfigDir(); err == nil {
		old := filepath.Join(cfg, "StreamPilot", "ki")
		if _, err := os.Stat(old); err == nil {
			if _, err := os.Stat(d); err != nil {
				os.MkdirAll(filepath.Dir(d), 0o755)
				os.Rename(old, d)
			}
		}
	}
	switch runtime.GOOS {
	case "windows":
		cands = append(cands, filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Ollama", "ollama.exe"))
	case "darwin":
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

func Up() bool {
	c := &http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(URL + "/api/version")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func Models() []string {
	c := &http.Client{Timeout: 3 * time.Second}
	resp, err := c.Get(URL + "/api/tags")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	var t struct {
		Models []struct{ Name string } `json:"models"`
	}
	json.NewDecoder(resp.Body).Decode(&t)
	out := []string{}
	for _, m := range t.Models {
		out = append(out, m.Name)
	}
	return out
}

func HasModel(m string) bool {
	for _, x := range Models() {
		if x == m || strings.TrimSuffix(x, ":latest") == m {
			return true
		}
	}
	return false
}

// Ready: KI läuft und das Modell ist geladen.
func Ready(model string) bool { return Up() && HasModel(model) }

var (
	runMu  sync.Mutex
	ownCmd *exec.Cmd
)

func pidFile() string { return filepath.Join(Dir(), "laeuft.txt") }

// cleanupOrphan beendet eine KI, deren Werkzeug abgestürzt ist (sie wäre sonst weitergelaufen).
func cleanupOrphan() {
	b, err := os.ReadFile(pidFile())
	if err != nil {
		return
	}
	f := strings.Fields(string(b))
	if len(f) != 2 {
		os.Remove(pidFile())
		return
	}
	owner, _ := strconv.Atoi(f[0])
	pid, _ := strconv.Atoi(f[1])
	if owner > 0 && !alive(owner) && pid > 0 {
		killTree(pid)
		for i := 0; i < 20 && Up(); i++ {
			time.Sleep(250 * time.Millisecond)
		}
	}
	if owner > 0 && !alive(owner) {
		os.Remove(pidFile())
	}
}

// Start startet die KI für dieses Werkzeug. Sie endet automatisch, wenn das Werkzeug schließt.
func Start() error {
	runMu.Lock()
	defer runMu.Unlock()
	cleanupOrphan()
	if Up() {
		return nil // läuft schon (für ein anderes Werkzeug oder ein selbst installiertes Ollama)
	}
	bin := Bin()
	if bin == "" {
		return fmt.Errorf("%s", kit.T("Die KI ist noch nicht installiert.", "The AI is not installed yet."))
	}
	os.MkdirAll(filepath.Join(Dir(), "models"), 0o755)
	cmd := exec.Command(bin, "serve")
	cmd.Env = append(os.Environ(), "OLLAMA_HOST=127.0.0.1:11434", "OLLAMA_KEEP_ALIVE=5m")
	if strings.HasPrefix(bin, Dir()) {
		cmd.Env = append(cmd.Env, "OLLAMA_MODELS="+filepath.Join(Dir(), "models"))
	}
	kit.HideCmd(cmd)
	ownGroup(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	ownCmd = cmd
	os.WriteFile(pidFile(), []byte(fmt.Sprintf("%d %d", os.Getpid(), cmd.Process.Pid)), 0o644)
	go cmd.Wait()
	kit.AtExit(Stop)
	for i := 0; i < 60; i++ {
		if Up() {
			return nil
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("%s", kit.T("Die KI startet nicht. Starte das Werkzeug neu und versuch es nochmal.", "The AI does not start. Restart the tool and try again."))
}

// Stop beendet die KI, falls dieses Programm sie gestartet hat (samt ihren Rechenprozessen).
func Stop() {
	runMu.Lock()
	defer runMu.Unlock()
	if ownCmd != nil && ownCmd.Process != nil {
		killTree(ownCmd.Process.Pid)
		os.Remove(pidFile())
	}
	ownCmd = nil
}

// ---------------------------------------------------------------- Einrichten

type Progress struct {
	mu      sync.Mutex
	Running bool    `json:"running"`
	Step    string  `json:"step"` // download | unpack | start | model | ready | error
	Done    int64   `json:"done"`
	Total   int64   `json:"total"`
	Pct     float64 `json:"pct"`
	Error   string  `json:"error"`
	Model   string  `json:"model"`
}

// P ist der Fortschritt der Einrichtung in diesem Programm.
var P = &Progress{}

func (a *Progress) set(step string, done, total int64) {
	a.mu.Lock()
	a.Step, a.Done, a.Total = step, done, total
	a.Pct = 0
	if total > 0 {
		a.Pct = float64(done) / float64(total)
	}
	a.mu.Unlock()
}

func (a *Progress) Snapshot() map[string]any {
	a.mu.Lock()
	defer a.mu.Unlock()
	b, _ := json.Marshal(a)
	m := map[string]any{}
	json.Unmarshal(b, &m)
	return m
}

// Setup lädt Ollama und das Modell (falls nötig). keep=false beendet die KI danach wieder
// (Einrichtung im Hub, der die KI selbst nicht braucht).
func Setup(model string, keep bool) {
	P.mu.Lock()
	if P.Running {
		P.mu.Unlock()
		return
	}
	P.Running, P.Error, P.Model, P.Step = true, "", model, "download"
	P.mu.Unlock()
	defer func() { P.mu.Lock(); P.Running = false; P.mu.Unlock() }()
	fail := func(err error) { P.mu.Lock(); P.Step, P.Error = "error", err.Error(); P.mu.Unlock() }
	if Bin() == "" {
		if err := download(); err != nil {
			fail(err)
			return
		}
		if Bin() == "" {
			fail(fmt.Errorf("%s", kit.T("Die KI ließ sich nicht einrichten.", "The AI could not be set up.")))
			return
		}
	}
	P.set("start", 0, 0)
	if err := Start(); err != nil {
		fail(err)
		return
	}
	if !HasModel(model) {
		if err := pull(model); err != nil {
			fail(err)
			return
		}
	}
	markModel(model)
	if !keep {
		Stop()
	}
	P.set("ready", 1, 1)
}

func pkg() (string, string) {
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

func download() error {
	url, kind := pkg()
	os.MkdirAll(Dir(), 0o755)
	tmp := filepath.Join(Dir(), "download.tmp")
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("%s (%v)", kit.T("Download der KI fehlgeschlagen. Prüfe deine Internetverbindung.", "Downloading the AI failed. Check your internet connection."), err)
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
			P.set("download", done, total)
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
	defer os.Remove(tmp)
	P.set("unpack", 0, 0)
	if kind == "zip" {
		return unzipTo(tmp, Dir())
	}
	return untgzTo(tmp, Dir())
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
			os.MkdirAll(p, 0o755)
			continue
		}
		os.MkdirAll(filepath.Dir(p), 0o755)
		rc, err := f.Open()
		if err != nil {
			return err
		}
		if f.Mode()&os.ModeSymlink != 0 {
			t, _ := io.ReadAll(rc)
			rc.Close()
			os.Symlink(string(t), p)
			continue
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
			os.MkdirAll(p, 0o755)
		case tar.TypeSymlink:
			os.MkdirAll(filepath.Dir(p), 0o755)
			os.Symlink(h.Linkname, p)
		case tar.TypeReg:
			os.MkdirAll(filepath.Dir(p), 0o755)
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

func pull(m string) error {
	body, _ := json.Marshal(map[string]any{"model": m, "stream": true})
	resp, err := http.Post(URL+"/api/pull", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		var st struct {
			Status    string
			Error     string
			Completed int64
			Total     int64
		}
		if json.Unmarshal(sc.Bytes(), &st) != nil {
			continue
		}
		if st.Error != "" {
			return fmt.Errorf("%s %s", kit.T("Das KI-Modell ließ sich nicht laden:", "The AI model could not be downloaded:"), st.Error)
		}
		P.set("model", st.Completed, st.Total)
		if st.Status == "success" {
			return nil
		}
	}
	if !HasModel(m) {
		return fmt.Errorf("%s", kit.T("Das KI-Modell ist nicht vollständig angekommen. Versuch es nochmal.", "The AI model did not download completely. Try again."))
	}
	return nil
}

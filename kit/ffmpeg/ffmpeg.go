package ffmpeg

import (
	"archive/zip"
	"compress/gzip"
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

// Engine ist das gemeinsame ffmpeg aller Werkzeuge (%APPDATA%\CreatorHub\ffmpeg).
type Engine struct {
	mu      sync.Mutex
	dir     string
	Loading bool
	Done    float64
	Error   string
}

var shared = func() *Engine {
	d, _ := os.UserConfigDir()
	return &Engine{dir: filepath.Join(d, "CreatorHub", "ffmpeg")}
}()

// Shared liefert das eine ffmpeg für alle Werkzeuge.
func Shared() *Engine { return shared }

// State für die Oberfläche.
func (e *Engine) State() (loading bool, done float64, err string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.Loading, e.Done, e.Error
}

func (e *Engine) FFmpeg() string  { return e.find("ffmpeg") }
func (e *Engine) FFprobe() string { return e.find("ffprobe") }

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
	if d, err := os.UserConfigDir(); err == nil { // ältere Version des Umwandlers
		cands = append(cands, filepath.Join(d, "Dateityp-Umwandler", "ffmpeg", exeName(name)))
	}
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
	if runtime.GOOS != "windows" {
		return e.installUnix()
	}
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

// macOS und Linux: fertige ffmpeg-/ffprobe-Programme (ffmpeg-static, GitHub), gegen fest
// hinterlegte SHA-256-Prüfsummen geprüft.
type unixFile struct {
	Name, Sum string
	Size      int64
}

const unixBase = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/"

var unixFiles = map[string][2]unixFile{
	"linux-amd64": {{"ffmpeg-linux-x64", "17c1ae10b52ac499180679fe6ba77e17642390c4eedb0f1e3b0ac045da55128f", 28928723},
		{"ffprobe-linux-x64", "88ca6818d82a70e87de2bb6166026ad411528c72eda0e4e11ed25d185116ee17", 28861806}},
	"darwin-arm64": {{"ffmpeg-darwin-arm64", "6be74d6f449889c2e87a75873894f8520cad56c08ac76f2a628d85b0519daaca", 19253088},
		{"ffprobe-darwin-arm64", "a4db76bafdb8529312e138fb55aaf143cad21b6d672e2634c9dd07ae83c6a310", 19216948}},
	"darwin-amd64": {{"ffmpeg-darwin-x64", "a12354fce7eb62361473bbe10d53a1893695babd35869ec8e92e5dfea8d0440b", 25067704},
		{"ffprobe-darwin-x64", "b75d816c5658bd417a2a05e174957963e2f9f85be3eb731b2a04467545a665dc", 25015394}},
}

// MB ist die ungefähre Downloadgröße für dieses System (für die Anzeige).
func MB() int {
	if runtime.GOOS == "windows" {
		return 100
	}
	fs, ok := unixFiles[runtime.GOOS+"-"+runtime.GOARCH]
	if !ok {
		return 0
	}
	return int((fs[0].Size + fs[1].Size) / 1e6)
}

func (e *Engine) installUnix() error {
	fs, ok := unixFiles[runtime.GOOS+"-"+runtime.GOARCH]
	if !ok {
		return errors.New("Für dieses System gibt es kein fertiges ffmpeg. Installiere es bitte über die Paketverwaltung.")
	}
	if err := os.MkdirAll(e.dir, 0o755); err != nil {
		return err
	}
	total := fs[0].Size + fs[1].Size
	var before int64
	client := &http.Client{Timeout: 0}
	for _, f := range fs {
		tmp := filepath.Join(e.dir, f.Name+".gz.tmp")
		err := func() error {
			resp, err := client.Get(unixBase + f.Name + ".gz")
			if err != nil {
				return errors.New("Keine Verbindung zum Download-Server. Prüfe dein Internet.")
			}
			defer resp.Body.Close()
			if resp.StatusCode != 200 {
				return fmt.Errorf("Der Server antwortete mit Fehler %d.", resp.StatusCode)
			}
			out, err := os.Create(tmp)
			if err != nil {
				return err
			}
			h := sha256.New()
			buf := make([]byte, 1<<20)
			var got int64
			last := time.Now()
			for {
				n, rerr := resp.Body.Read(buf)
				if n > 0 {
					out.Write(buf[:n])
					h.Write(buf[:n])
					got += int64(n)
					if time.Since(last) > 200*time.Millisecond {
						e.progress(float64(before+got) / float64(total) * 0.95)
						last = time.Now()
					}
				}
				if rerr == io.EOF {
					break
				}
				if rerr != nil {
					out.Close()
					return errors.New("Der Download wurde unterbrochen. Versuche es noch einmal.")
				}
			}
			out.Close()
			if got != f.Size || hex.EncodeToString(h.Sum(nil)) != f.Sum {
				return errors.New("Die Prüfsumme stimmt nicht. Die Datei wurde nicht installiert.")
			}
			before += got
			// entpacken
			in, err := os.Open(tmp)
			if err != nil {
				return err
			}
			defer in.Close()
			zr, err := gzip.NewReader(in)
			if err != nil {
				return errors.New("Der Download ist beschädigt.")
			}
			name := "ffmpeg"
			if strings.HasPrefix(f.Name, "ffprobe") {
				name = "ffprobe"
			}
			dst := filepath.Join(e.dir, name)
			w, err := os.OpenFile(dst+".tmp", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
			if err != nil {
				return err
			}
			_, err = io.Copy(w, zr)
			w.Close()
			if err != nil {
				os.Remove(dst + ".tmp")
				return errors.New("Der Download ist beschädigt.")
			}
			return os.Rename(dst+".tmp", dst)
		}()
		os.Remove(tmp)
		if err != nil {
			return err
		}
	}
	if runtime.GOOS == "darwin" {
		exec.Command("xattr", "-d", "com.apple.quarantine", filepath.Join(e.dir, "ffmpeg"), filepath.Join(e.dir, "ffprobe")).Run()
	}
	return nil
}

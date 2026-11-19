// Paket update prüft auf neue Versionen, lädt sie, prüft Signatur und Prüfsumme und spielt sie ein.
//
// Die Update-Datei (latest.json) liegt auf deiner Website. Sie ist mit deinem privaten Schlüssel
// signiert; die App kennt nur den öffentlichen Schlüssel und nimmt nichts an, was nicht von dir stammt.
package update

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"kit/setup"
)

// ManifestURL ist die Adresse von latest.json. Sie wird beim Bauen gesetzt:
//
//	go build -ldflags "-X kit/update.ManifestURL=https://deine-seite.de/creatorhub/latest.json"
//
// Für Tests kann sie mit der Umgebungsvariable CREATORHUB_UPDATE_URL ersetzt werden.
var ManifestURL = ""

// PublicKey prüft die Signatur von latest.json (Ed25519, hex).
var PublicKey = "12499b8fbc049a6704c8796bdb8071d45b350e875bd8ea695def56b0c53a2c9c"

// Signed ist latest.json: der eigentliche Inhalt (Payload, base64) und seine Signatur.
type Signed struct {
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}

type File struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type Manifest struct {
	Version string                     `json:"version"`
	Date    string                     `json:"date"`
	Notes   map[string]string          `json:"notes"`           // "en", "de"
	Files   map[string]File            `json:"files"`           // "windows-amd64", "linux-amd64"
	Tools   map[string]map[string]File `json:"tools,omitempty"` // einzelne Werkzeuge: Name -> System -> Datei
}

// Tool ist gesetzt, wenn ein einzelnes Werkzeug ohne den Hub läuft (z. B. "Freisteller").
// Dann gilt für Updates dessen eigene Datei aus latest.json statt der des Hubs.
var Tool = ""

func (m *Manifest) file() (File, bool) {
	if Tool != "" {
		f, ok := m.Tools[Tool][platform()]
		return f, ok
	}
	f, ok := m.Files[platform()]
	return f, ok
}

type Status struct {
	Current   string  `json:"current"`
	Latest    string  `json:"latest"`
	Available bool    `json:"available"`
	Notes     string  `json:"notes"`
	Checking  bool    `json:"checking"`
	Loading   bool    `json:"loading"`
	Done      float64 `json:"done"`
	Error     string  `json:"error"`
	NoServer  bool    `json:"noServer"`
	Ready     bool    `json:"ready"` // heruntergeladen und geprüft, kann eingespielt werden
	Checked   int64   `json:"checked"`
	Source    string  `json:"source"` // "server" oder "local" (Setup auf dem Desktop/in Downloads)
}

var (
	mu       sync.Mutex
	st       = Status{Current: setup.Version}
	manifest *Manifest
	file     string // heruntergeladene, geprüfte Datei
	client   = &http.Client{Timeout: 0}
)

// GitHubRepo ist „Besitzer/Projekt“ auf GitHub (beim Bauen: -X kit/update.GitHubRepo=name/creator-hub).
// Dann kommt latest.json immer aus der neuesten Veröffentlichung (Releases) dieses Projekts:
// https://github.com/<GitHubRepo>/releases/latest/download/latest.json
var GitHubRepo = ""

func url() string {
	if u := os.Getenv("CREATORHUB_UPDATE_URL"); u != "" {
		return u
	}
	if ManifestURL != "" {
		return ManifestURL
	}
	if GitHubRepo != "" {
		return "https://github.com/" + strings.Trim(GitHubRepo, "/") + "/releases/latest/download/latest.json"
	}
	return ""
}

// HasServer meldet, ob eine Update-Quelle im Netz eingestellt ist.
func HasServer() bool { return url() != "" }

func platform() string { return runtime.GOOS + "-" + runtime.GOARCH }

func Get() Status { mu.Lock(); defer mu.Unlock(); return st }

// Newer vergleicht Versionen wie 1.2.10 > 1.2.9.
func Newer(a, b string) bool {
	pa, pb := strings.Split(strings.TrimPrefix(a, "v"), "."), strings.Split(strings.TrimPrefix(b, "v"), ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x > y
		}
	}
	return false
}

// Verify prüft Signatur und liest den Inhalt.
func Verify(raw []byte, pubHex string) (*Manifest, error) {
	var s Signed
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, errors.New("Die Update-Datei ist beschädigt.")
	}
	payload, err := base64.StdEncoding.DecodeString(s.Payload)
	if err != nil {
		return nil, errors.New("Die Update-Datei ist beschädigt.")
	}
	sig, err := base64.StdEncoding.DecodeString(s.Signature)
	pub, err2 := hex.DecodeString(pubHex)
	if err != nil || err2 != nil || len(pub) != ed25519.PublicKeySize || !ed25519.Verify(pub, payload, sig) {
		return nil, errors.New("Die Update-Datei ist nicht echt. Sie wurde nicht installiert.")
	}
	var m Manifest
	if err := json.Unmarshal(payload, &m); err != nil {
		return nil, errors.New("Die Update-Datei ist beschädigt.")
	}
	return &m, nil
}

// Check fragt die Website nach einer neuen Version.
func Check(lang string) Status {
	u := url()
	mu.Lock()
	if u == "" {
		mu.Unlock()
		CheckLocal()
		mu.Lock()
		if st.Source != "local" {
			st.NoServer, st.Error = true, ""
		}
		st.Checked = time.Now().Unix()
		out := st
		mu.Unlock()
		return out
	}
	if st.Loading { // Download läuft: nicht dazwischenfunken
		out := st
		mu.Unlock()
		return out
	}
	st.Checking, st.Error, st.NoServer = true, "", false
	mu.Unlock()
	err := func() error {
		if GitHubRepo != "" && os.Getenv("CREATORHUB_UPDATE_URL") == "" && ManifestURL == "" {
			// direkt die neueste Veröffentlichung erfragen: umgeht den Zwischenspeicher von „latest“
			if tag := latestTag(); tag != "" {
				u = "https://github.com/" + strings.Trim(GitHubRepo, "/") + "/releases/download/" + tag + "/latest.json"
			}
		}
		sep := "?"
		if strings.Contains(u, "?") {
			sep = "&"
		}
		req, _ := http.NewRequest("GET", u+sep+"t="+strconv.FormatInt(time.Now().Unix(), 10), nil)
		req.Header.Set("User-Agent", "CreatorHub/"+setup.Version)
		req.Header.Set("Cache-Control", "no-cache")
		resp, err := client.Do(req)
		if err != nil {
			return errors.New("Keine Verbindung zum Update-Server.")
		}
		defer resp.Body.Close()
		if resp.StatusCode == 404 && GitHubRepo != "" {
			return nil // auf GitHub gibt es noch keine Veröffentlichung
		}
		if resp.StatusCode != 200 {
			return fmt.Errorf("Der Server antwortete mit Fehler %d.", resp.StatusCode)
		}
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		m, err := Verify(raw, PublicKey)
		if err != nil {
			return err
		}
		mu.Lock()
		if st.Ready && st.Latest != "" && Newer(m.Version, st.Latest) {
			st.Ready, st.Done, file = false, 0, "" // schon geladenes Update ist überholt: neues holen
		}
		manifest = m
		st.Latest = m.Version
		_, hasFile := m.file()
		st.Available = hasFile && Newer(m.Version, setup.Version)
		if st.Available {
			st.Source = "server"
		}
		st.Notes = m.Notes[lang]
		if st.Notes == "" {
			st.Notes = m.Notes["en"]
		}
		mu.Unlock()
		return nil
	}()
	mu.Lock()
	st.Checking, st.Checked = false, time.Now().Unix()
	if err != nil {
		st.Error = err.Error()
	}
	out := st
	mu.Unlock()
	return out
}

// AutoCheck prüft beim Start einmal, aber nur, wenn noch niemand geprüft oder geladen hat.
func AutoCheck(lang string) {
	mu.Lock()
	busy := st.Checked != 0 || st.Checking || st.Loading || st.Ready
	mu.Unlock()
	if !busy {
		Check(lang)
	}
}

// Download lädt die neue Version und prüft Prüfsumme und Größe.
func Download() {
	mu.Lock()
	if st.Loading || manifest == nil || !st.Available {
		mu.Unlock()
		return
	}
	f, _ := manifest.file()
	st.Loading, st.Error, st.Done, st.Ready = true, "", 0, false
	mu.Unlock()
	go func() {
		path, err := fetch(f)
		mu.Lock()
		st.Loading = false
		if err != nil {
			st.Error = err.Error()
		} else {
			file, st.Ready, st.Done = path, true, 1
		}
		mu.Unlock()
	}()
}

func fetch(f File) (string, error) {
	if !strings.HasPrefix(f.URL, "https://") && os.Getenv("CREATORHUB_UPDATE_URL") == "" {
		return "", errors.New("Updates werden nur über HTTPS geladen.")
	}
	dir := filepath.Join(os.TempDir(), "CreatorHubUpdate")
	os.MkdirAll(dir, 0o755)
	name := filepath.Base(strings.Split(f.URL, "?")[0])
	if name == "" || name == "." || name == "/" {
		name = "update"
	}
	dst := filepath.Join(dir, name)
	req, _ := http.NewRequest("GET", f.URL, nil)
	req.Header.Set("User-Agent", "CreatorHub/"+setup.Version)
	resp, err := client.Do(req)
	if err != nil {
		return "", errors.New("Keine Verbindung zum Update-Server.")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Der Server antwortete mit Fehler %d.", resp.StatusCode)
	}
	out, err := os.Create(dst + ".tmp")
	if err != nil {
		return "", err
	}
	h := sha256.New()
	buf := make([]byte, 1<<20)
	var got int64
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			out.Write(buf[:n])
			h.Write(buf[:n])
			got += int64(n)
			if f.Size > 0 {
				mu.Lock()
				st.Done = float64(got) / float64(f.Size)
				mu.Unlock()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			out.Close()
			os.Remove(dst + ".tmp")
			return "", errors.New("Der Download wurde unterbrochen.")
		}
	}
	out.Close()
	if (f.Size > 0 && got != f.Size) || !strings.EqualFold(hex.EncodeToString(h.Sum(nil)), f.SHA256) {
		os.Remove(dst + ".tmp")
		return "", errors.New("Die Update-Datei ist nicht echt. Sie wurde nicht installiert.")
	}
	os.Remove(dst)
	if err := os.Rename(dst+".tmp", dst); err != nil {
		return "", err
	}
	return dst, nil
}

// Apply spielt die geladene Version ein. Danach muss sich die App beenden (quit).
func Apply(quit func()) error {
	mu.Lock()
	p, ready := file, st.Ready
	mu.Unlock()
	if !ready {
		return errors.New("Es ist noch kein Update geladen.")
	}
	if Tool != "" {
		if err := applyTool(p); err != nil {
			return err
		}
	} else if err := apply(p, true); err != nil {
		return err
	}
	go func() { time.Sleep(300 * time.Millisecond); quit() }()
	return nil
}

// ApplyOnExit spielt die geladene Version ein, sobald die App sich gerade beendet; ohne Neustart.
func ApplyOnExit() error {
	mu.Lock()
	p, ready := file, st.Ready
	mu.Unlock()
	if !ready {
		return errors.New("Es ist noch kein Update geladen.")
	}
	if Tool != "" {
		return errors.New("Einzelne Werkzeuge werden direkt aktualisiert.")
	}
	return apply(p, false)
}

// latestTag fragt GitHub nach dem Namen der neuesten Veröffentlichung (z. B. v1.1.65).
func latestTag() string {
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/"+strings.Trim(GitHubRepo, "/")+"/releases/latest", nil)
	req.Header.Set("User-Agent", "CreatorHub/"+setup.Version)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return ""
	}
	var r struct {
		Tag string `json:"tag_name"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&r) != nil {
		return ""
	}
	return r.Tag
}

// Due meldet, ob wieder nachgesehen werden soll: alle 30 Minuten, nach einem Fehler schon nach 5 Minuten.
func Due() bool {
	s := Get()
	if s.Checking || s.Loading {
		return false
	}
	wait := 30 * time.Minute
	if s.Error != "" {
		wait = 5 * time.Minute
	}
	return time.Since(time.Unix(s.Checked, 0)) > wait
}

// Paket ai lädt einmalig die ONNX Runtime und KI-Modelle in einen gemeinsamen Ordner,
// den alle Werkzeuge benutzen (%APPDATA%\CreatorHub\KI).
package ai

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"kit/ort"
)

type Model struct {
	ID     string
	Name   string
	URL    string
	SHA256 string // leer: Modell wird nur auf Ladbarkeit geprüft (ONNX-Modelle sind Daten, kein Programmcode)
	Zip    bool
	MB     int
	// Parts: Modell besteht aus mehreren Teilmodellen (z. B. Whisper: Encoder und Decoder)
	Parts []string
	// Extra: zusätzliche Dateien (z. B. Wörterbuch), landen in modelle/<ID>/
	Extra []Extra
}

type Extra struct{ URL, Name, SHA256 string }

var Models = map[string]Model{
	// Real-ESRGAN General x4v3 (SRVGGNetCompact), BSD-3-Clause. Prüfsumme vom Herausgeber der ONNX-Datei.
	"upscale": {ID: "upscale", Name: "Real-ESRGAN", MB: 5,
		URL:    "https://huggingface.co/techycoder/realesrgan-general-x4v3/resolve/main/realesr-general-x4v3-dn50.onnx",
		SHA256: "152a44621a7906878d0a580c0347e8bcce78bafeb949af99383fba13e81f253a"},
	// Ausweichquelle: Qualcomm AI Hub (feste Eingabe 128 × 128)
	"upscale-qc": {ID: "upscale-qc", Name: "Real-ESRGAN (Qualcomm)", MB: 5, Zip: true,
		URL: "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/real_esrgan_general_x4v3/releases/v0.65.0/real_esrgan_general_x4v3-onnx-float.zip"},
	// IS-Net „general use“ (Freisteller für beliebige Motive), Apache-2.0. Quelle: Veröffentlichung des rembg-Projekts.
	"cutout": {ID: "cutout", Name: "IS-Net", MB: 171,
		URL:    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
		SHA256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a"},
	// MODNet (Porträt-Freistellung ohne Greenscreen), Apache-2.0
	"matte": {ID: "matte", Name: "MODNet", MB: 26,
		URL: "https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx"},
	// Whisper base (Spracherkennung, 99 Sprachen), MIT. Quantisiert für schnelles Rechnen auf dem Prozessor.
	"whisper-enc": {ID: "whisper-enc", Name: "Whisper Encoder", MB: 23,
		URL: "https://huggingface.co/Xenova/whisper-base/resolve/main/onnx/encoder_model_quantized.onnx"},
	"whisper-dec": {ID: "whisper-dec", Name: "Whisper Decoder", MB: 54,
		URL:    "https://huggingface.co/Xenova/whisper-base/resolve/main/onnx/decoder_model_quantized.onnx",
		SHA256: "96fc8b98013e0f9461159a7b0d57922e170b15767db8afef1ea7880f1deef33b"},
	"whisper": {ID: "whisper", Name: "Whisper", MB: 78, Parts: []string{"whisper-enc", "whisper-dec"},
		Extra: []Extra{{URL: "https://huggingface.co/Xenova/whisper-base/resolve/main/vocab.json", Name: "vocab.json"}}},
}

// File liefert den Pfad einer Zusatzdatei eines Modells ("" wenn sie fehlt).
func File(model, name string) string {
	p := filepath.Join(Dir(), "modelle", model, name)
	if _, err := os.Stat(p); err != nil {
		return ""
	}
	return p
}

func Dir() string {
	d, _ := os.UserConfigDir()
	return filepath.Join(d, "CreatorHub", "KI")
}

func runtimePath() string { return filepath.Join(Dir(), "runtime", libName()) }

func libName() string {
	if runtime.GOOS == "windows" {
		return "onnxruntime.dll"
	}
	if runtime.GOOS == "darwin" {
		return "libonnxruntime.dylib"
	}
	return "libonnxruntime.so"
}

func modelPath(id string) string {
	dir := filepath.Join(Dir(), "modelle", id)
	es, _ := os.ReadDir(dir)
	for _, e := range es {
		if strings.HasSuffix(strings.ToLower(e.Name()), ".onnx") {
			return filepath.Join(dir, e.Name())
		}
	}
	return ""
}

// Status für die Oberfläche.
type Status struct {
	Ready   bool    `json:"ready"`
	Loading bool    `json:"loading"`
	Done    float64 `json:"done"`
	Step    string  `json:"step"`
	Error   string  `json:"error"`
}

var (
	mu    sync.Mutex
	state = map[string]*Status{}
)

func libOverride() string { return os.Getenv("CREATORHUB_ORT") }

// Ready meldet, ob Laufzeit und Modell vorhanden sind.
func Ready(model string) bool {
	lib := libOverride()
	if lib == "" {
		lib = runtimePath()
	}
	if _, err := os.Stat(lib); err != nil {
		return false
	}
	if m := Models[model]; len(m.Parts) > 0 || len(m.Extra) > 0 {
		for _, p := range m.Parts {
			if findModel(p) == "" {
				return false
			}
		}
		for _, e := range m.Extra {
			if File(model, e.Name) == "" {
				return false
			}
		}
		if len(m.Parts) > 0 {
			return true
		}
	}
	return findModel(model) != ""
}

func findModel(model string) string {
	if p := modelPath(model); p != "" {
		return p
	}
	if model == "upscale" {
		return modelPath("upscale-qc")
	}
	return ""
}

func Get(model string) Status {
	mu.Lock()
	defer mu.Unlock()
	s := state[model]
	if s == nil {
		s = &Status{}
		state[model] = s
	}
	out := *s
	out.Ready = !s.Loading && Ready(model)
	return out
}

func set(model string, f func(s *Status)) {
	mu.Lock()
	defer mu.Unlock()
	s := state[model]
	if s == nil {
		s = &Status{}
		state[model] = s
	}
	f(s)
}

// Install lädt im Hintergrund, was fehlt.
func Install(model string) {
	mu.Lock()
	s := state[model]
	if s == nil {
		s = &Status{}
		state[model] = s
	}
	if s.Loading {
		mu.Unlock()
		return
	}
	s.Loading, s.Error, s.Done = true, "", 0
	mu.Unlock()
	go func() {
		err := install(model)
		set(model, func(s *Status) {
			s.Loading = false
			if err != nil {
				s.Error = err.Error()
			} else {
				s.Done, s.Step = 1, ""
			}
		})
	}()
}

func install(model string) error {
	if libOverride() == "" {
		if _, err := os.Stat(runtimePath()); err != nil {
			set(model, func(s *Status) { s.Step = "KI-Laufzeit wird geladen" })
			if err := installRuntime(func(d float64) { set(model, func(s *Status) { s.Done = d * 0.8 }) }); err != nil {
				return err
			}
		}
	}
	if m := Models[model]; len(m.Parts) > 0 {
		set(model, func(s *Status) { s.Step = "KI-Modell wird geladen" })
		n := float64(len(m.Parts) + len(m.Extra))
		for i, p := range m.Parts {
			if findModel(p) != "" {
				continue
			}
			k := float64(i)
			if err := installModel(Models[p], func(d float64) { set(model, func(s *Status) { s.Done = 0.8 + (k+d)/n*0.2 }) }); err != nil {
				return err
			}
		}
		for _, e := range m.Extra {
			if File(model, e.Name) != "" {
				continue
			}
			dir := filepath.Join(Dir(), "modelle", model)
			os.MkdirAll(dir, 0o755)
			tmp := filepath.Join(dir, e.Name+".tmp")
			sum, err := download(e.URL, tmp, func(float64) {})
			if err == nil && e.SHA256 != "" && sum != e.SHA256 {
				err = errors.New("Die Prüfsumme stimmt nicht. Nichts wurde installiert.")
			}
			if err != nil {
				os.Remove(tmp)
				return err
			}
			if err := os.Rename(tmp, filepath.Join(dir, e.Name)); err != nil {
				return err
			}
		}
		if SkipProbe {
			return nil
		}
		for _, p := range m.Parts {
			if _, err := Session(p); err != nil {
				return err
			}
		}
		return nil
	}
	if findModel(model) == "" {
		set(model, func(s *Status) { s.Step = "KI-Modell wird geladen" })
		prog := func(d float64) { set(model, func(s *Status) { s.Done = 0.8 + d*0.2 }) }
		err := installModel(Models[model], prog)
		if err != nil && model == "upscale" {
			if err2 := installModel(Models["upscale-qc"], prog); err2 == nil {
				err = nil
			}
		}
		if err != nil {
			return err
		}
	}
	// Probelauf: lässt sich alles laden? (nicht im Installer: dort nur herunterladen)
	if SkipProbe {
		return nil
	}
	if _, err := Session(model); err != nil {
		return err
	}
	return nil
}

var client = &http.Client{Timeout: 0}

// SkipProbe: KI nur herunterladen, nicht testweise in diesen Prozess laden.
var SkipProbe bool

// download speichert url nach dst und gibt die SHA-256 zurück.
func download(url, dst string, prog func(float64)) (string, error) {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "CreatorHub")
	resp, err := client.Do(req)
	if err != nil {
		return "", errors.New("Keine Verbindung. Prüfe dein Internet.")
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Der Server antwortete mit Fehler %d.", resp.StatusCode)
	}
	os.MkdirAll(filepath.Dir(dst), 0o755)
	f, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	buf := make([]byte, 1<<20)
	var got int64
	last := time.Now()
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				return "", werr
			}
			h.Write(buf[:n])
			got += int64(n)
			if prog != nil && resp.ContentLength > 0 && time.Since(last) > 150*time.Millisecond {
				prog(float64(got) / float64(resp.ContentLength))
				last = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return "", errors.New("Der Download wurde unterbrochen.")
		}
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

var ortAsset = map[string]*regexp.Regexp{
	"windows": regexp.MustCompile(`^onnxruntime-win-x64-\d+\.\d+\.\d+\.zip$`),
	"linux":   regexp.MustCompile(`^onnxruntime-linux-x64-\d+\.\d+\.\d+\.tgz$`),
	"darwin":  regexp.MustCompile(`^onnxruntime-osx-universal2-\d+\.\d+\.\d+\.tgz$`),
}

var ortFallback = map[string]string{
	"windows": "https://github.com/microsoft/onnxruntime/releases/download/v1.22.0/onnxruntime-win-x64-1.22.0.zip",
	"linux":   "https://github.com/microsoft/onnxruntime/releases/download/v1.22.0/onnxruntime-linux-x64-1.22.0.tgz",
	"darwin":  "https://github.com/microsoft/onnxruntime/releases/download/v1.22.0/onnxruntime-osx-universal2-1.22.0.tgz",
}

func installRuntime(prog func(float64)) error {
	re, ok := ortAsset[runtime.GOOS]
	if !ok || (runtime.GOARCH != "amd64" && runtime.GOOS != "darwin") {
		return errors.New("Für dieses System gibt es die KI-Laufzeit nicht.")
	}
	url, want := ortFallback[runtime.GOOS], ""
	// Neueste Version und ihre Prüfsumme von GitHub erfragen
	if req, err := http.NewRequest("GET", "https://api.github.com/repos/microsoft/onnxruntime/releases/latest", nil); err == nil {
		req.Header.Set("User-Agent", "CreatorHub")
		req.Header.Set("Accept", "application/vnd.github+json")
		if resp, err := client.Do(req); err == nil {
			var rel struct {
				Assets []struct {
					Name   string `json:"name"`
					URL    string `json:"browser_download_url"`
					Digest string `json:"digest"`
				} `json:"assets"`
			}
			if json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&rel) == nil {
				for _, a := range rel.Assets {
					if re.MatchString(a.Name) {
						url, want = a.URL, strings.TrimPrefix(a.Digest, "sha256:")
					}
				}
			}
			resp.Body.Close()
		}
	}
	tmp := filepath.Join(Dir(), "runtime.download.tmp")
	defer os.Remove(tmp)
	sum, err := download(url, tmp, prog)
	if err != nil {
		return err
	}
	if want != "" && sum != want {
		return errors.New("Die Prüfsumme der KI-Laufzeit stimmt nicht. Nichts wurde installiert.")
	}
	dir := filepath.Join(Dir(), "runtime")
	os.MkdirAll(dir, 0o755)
	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		if err := extractTgzLib(tmp, dir); err != nil {
			os.RemoveAll(dir)
			return err
		}
		return nil
	}
	zr, err := zip.OpenReader(tmp)
	if err != nil {
		return err
	}
	defer zr.Close()
	found := false
	for _, f := range zr.File {
		b := filepath.Base(f.Name)
		if !strings.Contains(f.Name, "/lib/") || !strings.HasSuffix(strings.ToLower(b), ".dll") {
			continue
		}
		if err := extract(f, filepath.Join(dir, b)); err != nil {
			return err
		}
		if strings.EqualFold(b, "onnxruntime.dll") {
			found = true
		}
	}
	if !found {
		os.RemoveAll(dir)
		return errors.New("Im Download fehlt onnxruntime.dll.")
	}
	if err := verifySigned(filepath.Join(dir, "onnxruntime.dll")); err != nil {
		os.RemoveAll(dir)
		return err
	}
	return nil
}

// extractTgzLib holt libonnxruntime.so aus dem Linux-Archiv.
func extractTgzLib(archive, dir string) error {
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	tr := tar.NewReader(zr)
	found := false
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		b := filepath.Base(h.Name)
		lib := libName() // libonnxruntime.so oder .dylib (die echte Datei; Verknüpfungen werden übersprungen)
		ext := strings.TrimPrefix(filepath.Ext(lib), ".")
		if h.Typeflag != tar.TypeReg || !strings.Contains(h.Name, "/lib/") || !strings.HasPrefix(b, "libonnxruntime") || !strings.Contains(b, "."+ext) || strings.Contains(b, "providers") {
			continue
		}
		out, err := os.OpenFile(filepath.Join(dir, lib+".tmp"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			return err
		}
		_, err = io.Copy(out, tr)
		out.Close()
		if err != nil {
			return err
		}
		if err := os.Rename(filepath.Join(dir, lib+".tmp"), filepath.Join(dir, lib)); err != nil {
			return err
		}
		found = true
	}
	if !found {
		return errors.New("Im Download fehlt " + libName() + ".")
	}
	return nil
}

func extract(f *zip.File, dst string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.Create(dst + ".tmp")
	if err != nil {
		return err
	}
	_, err = io.Copy(out, rc)
	out.Close()
	if err != nil {
		os.Remove(dst + ".tmp")
		return err
	}
	return os.Rename(dst+".tmp", dst)
}

func installModel(m Model, prog func(float64)) error {
	if m.URL == "" {
		return errors.New("Unbekanntes Modell.")
	}
	dir := filepath.Join(Dir(), "modelle", m.ID)
	os.MkdirAll(dir, 0o755)
	tmp := filepath.Join(dir, "download.tmp")
	defer os.Remove(tmp)
	sum, err := download(m.URL, tmp, prog)
	if err != nil {
		return err
	}
	if m.SHA256 != "" && sum != m.SHA256 {
		return errors.New("Die Prüfsumme des KI-Modells stimmt nicht. Nichts wurde installiert.")
	}
	if !m.Zip {
		return os.Rename(tmp, filepath.Join(dir, filepath.Base(m.URL)))
	}
	zr, err := zip.OpenReader(tmp)
	if err != nil {
		return err
	}
	defer zr.Close()
	for _, f := range zr.File {
		if f.FileInfo().IsDir() {
			continue
		}
		b := filepath.Base(f.Name)
		lb := strings.ToLower(b)
		if strings.HasSuffix(lb, ".onnx") || strings.HasSuffix(lb, ".data") || strings.HasSuffix(lb, ".bin") {
			if err := extract(f, filepath.Join(dir, b)); err != nil {
				return err
			}
		}
	}
	if modelPath(m.ID) == "" {
		return errors.New("Im Download fehlt das Modell.")
	}
	return nil
}

var (
	smu      sync.Mutex
	sessions = map[string]*ort.Session{}
)

// Session öffnet das Modell (einmal pro Programmlauf).
func Session(model string) (*ort.Session, error) {
	smu.Lock()
	defer smu.Unlock()
	delete(closing, model) // wird wieder gebraucht: nicht mehr entladen
	if s := sessions[model]; s != nil {
		return s, nil
	}
	lib := libOverride()
	if lib == "" {
		lib = runtimePath()
	}
	if err := ort.Init(lib); err != nil {
		return nil, err
	}
	p := findModel(model)
	if p == "" {
		return nil, errors.New("Das KI-Modell fehlt.")
	}
	s, err := ort.Open(p, 0)
	if err != nil {
		return nil, err
	}
	sessions[model] = s
	return s, nil
}

// Close entlädt ein Modell wieder (z. B. wenn das Werkzeug geschlossen wird).
// Acquire gibt die Sitzung zurück und merkt sich, dass sie gerade benutzt wird.
// Solange sie benutzt wird, entlädt Close sie nicht (sonst stürzt das Programm mitten in der Rechnung ab).
// Nach der Arbeit Done aufrufen.
func Acquire(model string) (*ort.Session, error) {
	s, err := Session(model)
	if err != nil {
		return nil, err
	}
	smu.Lock()
	users[model]++
	smu.Unlock()
	return s, nil
}

// Done meldet, dass eine mit Acquire geholte Sitzung nicht mehr gebraucht wird.
func Done(model string) {
	smu.Lock()
	defer smu.Unlock()
	if users[model] > 0 {
		users[model]--
	}
	if users[model] == 0 && closing[model] {
		delete(closing, model)
		if s := sessions[model]; s != nil {
			s.Close()
			delete(sessions, model)
		}
	}
}

var users, closing = map[string]int{}, map[string]bool{}

func Close(model string) {
	smu.Lock()
	defer smu.Unlock()
	if users[model] > 0 {
		closing[model] = true // wird entladen, sobald die laufende Rechnung fertig ist
		return
	}
	if s := sessions[model]; s != nil {
		s.Close()
		delete(sessions, model)
	}
}

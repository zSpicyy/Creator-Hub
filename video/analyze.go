package main

// Tonanalyse: Stille finden (zum automatischen Herausschneiden) und Beats (für Marker).

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"kit"
)

var silRe = regexp.MustCompile(`silence_(start|end): (-?[0-9.]+)`)

func (a *App) mediaFor(r *http.Request) *Media {
	q := r.URL.Query()
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.projects[q.Get("id")]
	if p == nil {
		return nil
	}
	return a.mediaOf(p, q.Get("m"))
}

func (a *App) analyzeRoutes(mux *http.ServeMux) {
	// Stille: Liste [Start, Ende] in Sekunden der Quelldatei
	mux.HandleFunc("/api/silence", func(w http.ResponseWriter, r *http.Request) {
		m := a.mediaFor(r)
		if m == nil {
			kit.Fail(w, 404, "Datei nicht gefunden.")
			return
		}
		if !a.eng.Ready() {
			kit.Fail(w, 400, "Dafür wird ffmpeg gebraucht. Richte es zuerst ein.")
			return
		}
		db, _ := strconv.ParseFloat(r.URL.Query().Get("db"), 64)
		if db == 0 {
			db = -35
		}
		dur, _ := strconv.ParseFloat(r.URL.Query().Get("d"), 64)
		if dur <= 0 {
			dur = 0.5
		}
		c := a.cmd("-hide_banner", "-nostdin", "-i", m.Path, "-vn", "-af", "silencedetect=noise="+strconv.FormatFloat(db, 'f', 1, 64)+"dB:d="+strconv.FormatFloat(dur, 'f', 2, 64), "-f", "null", "-")
		errp, _ := c.StderrPipe()
		if err := c.Start(); err != nil {
			kit.Fail(w, 500, "Die Analyse ließ sich nicht starten.")
			return
		}
		var out [][2]float64
		start := -1.0
		sc := bufio.NewScanner(errp)
		for sc.Scan() {
			for _, mm := range silRe.FindAllStringSubmatch(sc.Text(), -1) {
				v, _ := strconv.ParseFloat(mm[2], 64)
				if mm[1] == "start" {
					start = math.Max(0, v)
				} else if start >= 0 {
					out = append(out, [2]float64{start, v})
					start = -1
				}
			}
		}
		c.Wait()
		if start >= 0 && m.Dur > start {
			out = append(out, [2]float64{start, m.Dur})
		}
		kit.JSON(w, map[string]any{"silence": out})
	})
	// Beats: Zeitpunkte deutlicher Lautstärke-Anstiege (Onsets), ausgedünnt auf ein gleichmäßiges Raster
	mux.HandleFunc("/api/beats", func(w http.ResponseWriter, r *http.Request) {
		m := a.mediaFor(r)
		if m == nil {
			kit.Fail(w, 404, "Datei nicht gefunden.")
			return
		}
		if !a.eng.Ready() {
			kit.Fail(w, 400, "Dafür wird ffmpeg gebraucht. Richte es zuerst ein.")
			return
		}
		const sr = 11025
		c := a.cmd("-hide_banner", "-nostdin", "-i", m.Path, "-vn", "-ac", "1", "-ar", strconv.Itoa(sr), "-f", "s16le", "-")
		outp, _ := c.StdoutPipe()
		if err := c.Start(); err != nil {
			kit.Fail(w, 500, "Die Analyse ließ sich nicht starten.")
			return
		}
		const hop = 256
		var energy []float64
		buf := make([]byte, hop*2)
		br := bufio.NewReaderSize(outp, 1<<16)
		for {
			if _, err := io.ReadFull(br, buf); err != nil {
				break
			}
			var e float64
			for i := 0; i < hop; i++ {
				v := float64(int16(binary.LittleEndian.Uint16(buf[i*2:]))) / 32768
				e += v * v
			}
			energy = append(energy, math.Sqrt(e/hop))
		}
		c.Wait()
		// Anstieg der Energie (Flux), gleitender Mittelwert als Schwelle
		n := len(energy)
		flux := make([]float64, n)
		for i := 1; i < n; i++ {
			flux[i] = math.Max(0, energy[i]-energy[i-1])
		}
		var beats []float64
		win := 43 // ~1 s
		minGap := 10
		last := -minGap
		for i := 1; i < n-1; i++ {
			lo, hi := max(0, i-win), min(n, i+win)
			var mean float64
			for j := lo; j < hi; j++ {
				mean += flux[j]
			}
			mean /= float64(hi - lo)
			if flux[i] > mean*1.8+0.004 && flux[i] >= flux[i-1] && flux[i] >= flux[i+1] && i-last >= minGap {
				beats = append(beats, float64(i*hop)/sr)
				last = i
			}
		}
		kit.JSON(w, map[string]any{"beats": beats})
	})
	// Untertitel (SRT) speichern
	mux.HandleFunc("/api/srt/save", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Dir, Name, Content string }
		if err := readBody(r, &in); err != nil || !filepath.IsAbs(in.Dir) {
			kit.Fail(w, 400, "Ungültiger Speicherort.")
			return
		}
		name := strings.Map(func(r rune) rune {
			if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
				return '_'
			}
			return r
		}, strings.TrimSpace(in.Name))
		if name == "" {
			name = "Untertitel"
		}
		p := filepath.Join(in.Dir, name+".srt")
		for i := 2; ; i++ {
			if _, err := os.Stat(p); err != nil {
				break
			}
			p = filepath.Join(in.Dir, name+" ("+strconv.Itoa(i)+").srt")
		}
		if err := os.WriteFile(p, []byte(in.Content), 0o644); err != nil {
			kit.Fail(w, 500, "Speichern fehlgeschlagen.")
			return
		}
		kit.JSON(w, map[string]string{"path": p})
	})
	// Text- oder LUT-Datei lesen (SRT laden, LUT-Vorschau)
	mux.HandleFunc("/api/textfile", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("path")
		ext := strings.ToLower(filepath.Ext(p))
		if !filepath.IsAbs(p) || (ext != ".srt" && ext != ".cube" && ext != ".vtt") {
			kit.Fail(w, 400, "Dieses Dateiformat wird nicht unterstützt.")
			return
		}
		b, err := os.ReadFile(p)
		if err != nil || len(b) > 32<<20 {
			kit.Fail(w, 404, "Datei nicht gefunden.")
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Write(b)
	})
}

func readBody(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 16<<20)).Decode(v)
}

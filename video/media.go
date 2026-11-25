package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
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

var (
	audioExt = set("mp3 wav flac m4a aac ogg oga opus wma aiff aif mka")
	videoExt = set("mp4 mkv webm mov avi wmv flv mpg mpeg m4v 3gp ts mts m2ts vob ogv")
	imageExt = set("png jpg jpeg webp bmp gif tif tiff")
	// Diese Formate spielt die Vorschau direkt ab, ohne Umwandlung.
	directAudio = set("mp3 wav ogg oga m4a aac flac opus")
	directImage = set("png jpg jpeg webp gif bmp")
)

func set(s string) map[string]bool {
	m := map[string]bool{}
	for _, v := range strings.Fields(s) {
		m[v] = true
	}
	return m
}

func ext(p string) string { return strings.ToLower(strings.TrimPrefix(filepath.Ext(p), ".")) }

func (a *App) cmd(args ...string) *exec.Cmd {
	c := exec.Command(a.eng.FFmpeg(), args...)
	kit.HideCmd(c)
	lowPrio(c)
	return c
}

// probe liest Dauer, Größe, Bildrate und ob Ton vorhanden ist.
func (a *App) probe(m *Media) error {
	c := exec.Command(a.eng.FFprobe(), "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,duration", "-of", "json", m.Path)
	kit.HideCmd(c)
	b, err := c.Output()
	if err != nil {
		return errors.New("Diese Datei kann ich nicht lesen.")
	}
	var j struct {
		Streams []struct {
			Type string `json:"codec_type"`
			Name string `json:"codec_name"`
			Pix  string `json:"pix_fmt"`
			W    int    `json:"width"`
			H    int    `json:"height"`
			FR   string `json:"avg_frame_rate"`
		} `json:"streams"`
		Format struct {
			Dur string `json:"duration"`
		} `json:"format"`
	}
	json.Unmarshal(b, &j)
	m.Dur, _ = strconv.ParseFloat(j.Format.Dur, 64)
	hasV := false
	for _, s := range j.Streams {
		switch s.Type {
		case "video":
			if !hasV && s.W > 0 {
				hasV, m.W, m.H, m.VCodec, m.PixFmt = true, s.W, s.H, s.Name, s.Pix
				if p := strings.Split(s.FR, "/"); len(p) == 2 {
					n, _ := strconv.ParseFloat(p[0], 64)
					d, _ := strconv.ParseFloat(p[1], 64)
					if d > 0 {
						m.FPS = n / d
					}
				}
			}
		case "audio":
			if !m.HasAudio {
				m.ACodec = s.Name
			}
			m.HasAudio = true
		}
	}
	e := ext(m.Path)
	switch {
	case imageExt[e] || (hasV && m.Dur < 0.1 && !m.HasAudio):
		m.Kind, m.Dur = "image", 5
	case hasV:
		m.Kind = "video"
	case m.HasAudio:
		m.Kind = "audio"
	default:
		return errors.New("In dieser Datei ist weder Bild noch Ton.")
	}
	if m.Kind != "image" && m.Dur <= 0 {
		return errors.New("Die Länge der Datei ist unbekannt.")
	}
	return nil
}

func (a *App) importFiles(id string, paths []string) ([]*Media, error) {
	if !a.eng.Ready() { // noch nicht eingerichtet: jetzt laden und abwarten
		a.eng.Install()
		for i := 0; i < 1800; i++ {
			if l, _, _ := a.eng.State(); !l {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}
		if !a.eng.Ready() {
			_, _, e := a.eng.State()
			if e == "" {
				e = "ffmpeg konnte nicht eingerichtet werden."
			}
			return nil, errors.New("Zum Schneiden fehlt noch ffmpeg: " + e)
		}
	}
	a.mu.Lock()
	p := a.projects[id]
	a.mu.Unlock()
	if p == nil {
		return nil, errors.New("Projekt nicht gefunden.")
	}
	var out []*Media
	var errs []string
	for _, path := range paths {
		path = strings.Trim(strings.TrimSpace(path), `"`)
		st, err := os.Stat(path)
		if err != nil || st.IsDir() {
			errs = append(errs, filepath.Base(path)+": nicht gefunden")
			continue
		}
		a.mu.Lock()
		var dup *Media
		for _, m := range p.Media {
			if m.Path == path {
				dup = m
			}
		}
		a.mu.Unlock()
		if dup != nil {
			out = append(out, dup)
			continue
		}
		m := &Media{ID: kit.RandID(4), Path: path, Name: filepath.Base(path), Size: st.Size()}
		if err := a.probe(m); err != nil {
			errs = append(errs, m.Name+": "+err.Error())
			continue
		}
		a.mu.Lock()
		p.Media = append(p.Media, m)
		a.save(p)
		a.mu.Unlock()
		a.prepare(p, m)
		out = append(out, m)
	}
	if len(out) == 0 && len(errs) > 0 {
		return nil, errors.New(strings.Join(errs, "; "))
	}
	return out, nil
}

type job struct {
	p *Project
	m *Media
}

// prepare stellt Vorschau-Datei, Bilderstreifen und Wellenform in die Warteschlange.
func (a *App) prepare(p *Project, m *Media) {
	if _, err := os.Stat(m.Path); err != nil {
		a.mu.Lock()
		m.Missing = true
		a.mu.Unlock()
		return
	}
	a.mu.Lock()
	m.Missing = false
	// alles, was noch nicht fertig ist (auch nach einem Neustart mitten in der Vorbereitung), wieder einreihen
	need := m.Proxy != "ok"
	if need && m.Proxy != "direct" {
		m.Proxy = "wait"
	}
	a.mu.Unlock()
	if need {
		a.jobs <- job{p, m}
	}
}

func (a *App) mdir(p *Project, m *Media) string { return filepath.Join(a.dir(p.ID), "media", m.ID) }

func (a *App) worker() {
	for j := range a.jobs {
		p, m := j.p, j.m
		a.mu.Lock()
		m.Proxy = "work"
		a.mu.Unlock()
		dir := a.mdir(p, m)
		os.MkdirAll(dir, 0o755)
		var err error
		switch m.Kind {
		case "video":
			// wie Premiere Pro: das Original sofort nutzbar machen, die Vorschau-Kopie entsteht nebenbei
			a.makeDirect(p, m, dir)
			var wg sync.WaitGroup
			wg.Add(1)
			go func() {
				defer wg.Done()
				a.thumbs(m, dir)
				if m.HasAudio {
					a.wave(m, dir)
				}
				a.mu.Lock()
				a.save(p)
				a.mu.Unlock()
			}()
			err = a.proxy(m, dir)
			wg.Wait()
		case "audio":
			a.wave(m, dir)
			if !directAudio[ext(m.Path)] {
				err = a.run(m, []string{"-i", m.Path, "-vn", "-c:a", "aac", "-b:a", "160k"}, filepath.Join(dir, "play.m4a"))
			}
			a.mu.Lock()
			m.Proxy = "ok"
			a.mu.Unlock()
		case "image":
			if !directImage[ext(m.Path)] {
				err = a.run(m, []string{"-i", m.Path, "-frames:v", "1"}, filepath.Join(dir, "play.png"))
			}
			a.run(m, []string{"-i", m.Path, "-frames:v", "1", "-vf", "scale=160:-2", "-q:v", "5"}, filepath.Join(dir, "t0.jpg"))
			a.mu.Lock()
			m.Thumbs, m.Step = 1, 1
			a.mu.Unlock()
		}
		a.mu.Lock()
		if err != nil {
			m.Proxy, m.Error = "error", err.Error()
		} else {
			m.Proxy = "ok"
		}
		if err != nil && m.direct() {
			m.Proxy, m.Error = "direct", "" // Kopie ging nicht, das Original spielt aber direkt
		}
		m.ProxyPct = 1
		a.save(p)
		a.mu.Unlock()
		a.projectThumb(p)
	}
}

// run führt ffmpeg aus und meldet den Fortschritt an m.
func (a *App) run(m *Media, args []string, out string) error {
	tmp := out + ".tmp" + filepath.Ext(out)
	full := append([]string{"-hide_banner", "-nostdin", "-y"}, args...)
	full = append(full, "-progress", "pipe:1", "-nostats", tmp)
	c := a.cmd(full...)
	stdout, _ := c.StdoutPipe()
	var errb strings.Builder
	c.Stderr = &limitWriter{b: &errb, max: 4000}
	if err := c.Start(); err != nil {
		return err
	}
	sc := bufio.NewScanner(stdout)
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), "out_time_us="); ok && m.Dur > 0 {
			us, _ := strconv.ParseFloat(v, 64)
			a.mu.Lock()
			m.ProxyPct = math.Min(0.99, us/1e6/m.Dur)
			a.mu.Unlock()
		}
	}
	if err := c.Wait(); err != nil {
		os.Remove(tmp)
		l := strings.Split(strings.TrimSpace(errb.String()), "\n")
		return errors.New("Vorbereitung fehlgeschlagen: " + l[len(l)-1])
	}
	return os.Rename(tmp, out)
}

type limitWriter struct {
	b   *strings.Builder
	max int
}

func (l *limitWriter) Write(p []byte) (int, error) {
	if l.b.Len() > l.max {
		s := l.b.String()
		l.b.Reset()
		l.b.WriteString(s[len(s)-l.max/2:])
	}
	return l.b.Write(p)
}

// webPlayable: Formate, die die Vorschau (Chromium) ohne Umrechnen abspielt.
var (
	webVideo = set("h264 vp8 vp9 av1")
	webAudio = set("aac mp3 opus vorbis flac")
	webBox   = set("mp4 m4v mov webm")
)

func (m *Media) webPlayable() bool {
	if !webVideo[m.VCodec] || (m.PixFmt != "" && m.PixFmt != "yuv420p" && m.PixFmt != "yuvj420p") {
		return false
	}
	return !m.HasAudio || webAudio[m.ACodec]
}

// direct: Das Original (oder eine umverpackte Fassung) spielt schon, bevor die Kopie fertig ist.
func (m *Media) direct() bool { return m.Kind == "video" && m.webPlayable() }

// makeDirect: abspielbare Videos sofort freigeben. Steckt das Video in einem anderen Behälter
// (z. B. MKV von OBS), wird es nur umverpackt – das dauert Sekunden statt Minuten.
func (a *App) makeDirect(p *Project, m *Media, dir string) {
	if !m.direct() {
		return
	}
	if !webBox[ext(m.Path)] {
		out := filepath.Join(dir, "direct.mp4")
		if _, err := os.Stat(out); err != nil {
			args := []string{"-i", m.Path, "-map", "0:v:0", "-c:v", "copy"}
			if m.HasAudio {
				args = append(args, "-map", "0:a:0", "-c:a", "copy")
			}
			if a.run(m, append(args, "-movflags", "+faststart"), out) != nil {
				return
			}
		}
	}
	a.mu.Lock()
	m.Proxy, m.ProxyPct = "direct", 0
	a.save(p)
	a.mu.Unlock()
}

// proxy: kleine H.264-Kopie mit vielen Schlüsselbildern, damit die Vorschau flüssig springt.
func (a *App) proxy(m *Media, dir string) error {
	// schnell: über die Grafikkarte dekodieren (wenn möglich), höchstens 30 Bilder/s, flinke Kodierung
	vf := "scale=-2:'min(540,ih)':flags=fast_bilinear,format=yuv420p"
	if m.FPS > 31 {
		vf = "fps=30," + vf
	}
	mk := func(enc []string) []string {
		args := append([]string{"-i", m.Path, "-map", "0:v:0", "-vf", vf}, enc...)
		args = append(args, "-g", "12", "-keyint_min", "12")
		if m.HasAudio {
			args = append(args, "-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2")
		}
		return append(args, "-movflags", "+faststart")
	}
	out := filepath.Join(dir, "play.mp4")
	sw := mk([]string{"-c:v", "libx264", "-preset", "superfast", "-crf", "26"})
	// Grafikkarte zum Lesen und Schreiben: entlastet den Prozessor beim Einlesen langer Videos stark
	if enc := a.detectHW(); enc != "" {
		if err := a.run(m, append(hwDecode(), mk(encArgs(enc, "low", 960, 540, 30))...), out); err == nil {
			return nil
		}
	}
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		if err := a.run(m, append(hwDecode(), sw...), out); err == nil {
			return nil
		}
	}
	return a.run(m, sw, out)
}

// thumbs: bis zu 120 kleine Bilder für den Bilderstreifen in der Zeitleiste.
func (a *App) thumbs(m *Media, dir string) {
	n := int(math.Min(120, math.Max(1, m.Dur/2)))
	step := m.Dur / float64(n)
	// nur Schlüsselbilder dekodieren: bei langen Videos um ein Vielfaches schneller
	count := func() int {
		got := 0
		for i := 1; i <= n; i++ {
			if _, err := os.Stat(filepath.Join(dir, fmt.Sprintf("t%d.jpg", i))); err == nil {
				got = i
			}
		}
		return got
	}
	vf := fmt.Sprintf("fps=1/%.4f,scale=-2:72:flags=fast_bilinear", step)
	a.cmd("-hide_banner", "-nostdin", "-y", "-skip_frame", "nokey", "-i", m.Path, "-vf", vf, "-q:v", "6", "-frames:v", strconv.Itoa(n), filepath.Join(dir, "t%d.jpg")).Run()
	got := count()
	if got < n/2 { // Datei ohne brauchbare Schlüsselbilder: normal dekodieren
		a.cmd("-hide_banner", "-nostdin", "-y", "-i", m.Path, "-vf", vf, "-q:v", "6", "-frames:v", strconv.Itoa(n), filepath.Join(dir, "t%d.jpg")).Run()
		got = count()
	}
	a.mu.Lock()
	m.Thumbs, m.Step = got, step
	a.mu.Unlock()
}

// wave: 50 Spitzenwerte pro Sekunde für die Wellenform.
func (a *App) wave(m *Media, dir string) {
	c := a.cmd("-hide_banner", "-nostdin", "-i", m.Path, "-vn", "-ac", "1", "-ar", "4000", "-f", "s16le", "-")
	out, _ := c.StdoutPipe()
	if c.Start() != nil {
		return
	}
	r := bufio.NewReaderSize(out, 1<<16)
	var peaks []byte
	buf := make([]byte, 160) // 80 Samples = 20 ms
	for {
		_, err := io.ReadFull(r, buf)
		if err != nil {
			break
		}
		var mx float64
		for i := 0; i < len(buf); i += 2 {
			v := math.Abs(float64(int16(binary.LittleEndian.Uint16(buf[i:]))))
			if v > mx {
				mx = v
			}
		}
		peaks = append(peaks, byte(math.Min(255, math.Sqrt(mx/32768)*255)))
	}
	c.Wait()
	if len(peaks) > 0 && os.WriteFile(filepath.Join(dir, "wave.bin"), peaks, 0o644) == nil {
		a.mu.Lock()
		m.Wave = true
		a.mu.Unlock()
	}
}

// projectThumb: Vorschaubild für die Projektübersicht (erstes Video oder Bild).
var thumbMu sync.Mutex

func (a *App) projectThumb(p *Project) {
	thumbMu.Lock()
	defer thumbMu.Unlock()
	a.mu.Lock()
	// Bevorzugt die erste Videodatei (Zeitleiste vor Medienliste), sonst das erste Bild.
	var src string
	var dur float64
	pick := func(m *Media, kind string) {
		if src == "" && m != nil && m.Kind == kind {
			src, dur = m.Path, m.Dur
		}
	}
	for _, kind := range []string{"video", "image"} {
		for _, t := range p.Tracks {
			for _, c := range t.Clips {
				pick(a.mediaOf(p, c.MediaID), kind)
			}
		}
		for _, m := range p.Media {
			pick(m, kind)
		}
	}
	a.mu.Unlock()
	if src == "" {
		return
	}
	out := filepath.Join(a.dir(p.ID), "thumb.jpg")
	mark := filepath.Join(a.dir(p.ID), "thumb.src")
	if b, err := os.ReadFile(mark); err == nil && string(b) == src {
		if _, err := os.Stat(out); err == nil {
			return // schon ein Vorschaubild aus dieser Datei: nicht bei jedem Import neu würfeln
		}
	}
	// zufälliges Bild aus der Mitte des Videos (10 % bis 90 %)
	at := 0.0
	if dur > 1 {
		at = dur * (0.1 + 0.8*rand.Float64())
	}
	a.cmd("-hide_banner", "-nostdin", "-y", "-ss", strconv.FormatFloat(at, 'f', 2, 64), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out).Run()
	os.WriteFile(mark, []byte(src), 0o644)
	if _, err := os.Stat(out); err != nil {
		a.cmd("-hide_banner", "-nostdin", "-y", "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", filepath.Join(a.dir(p.ID), "thumb.jpg")).Run()
	}
}

func (a *App) serveFile(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	a.mu.Lock()
	p := a.projects[q.Get("id")]
	var m *Media
	if p != nil {
		m = a.mediaOf(p, q.Get("m"))
	}
	a.mu.Unlock()
	if m == nil {
		http.NotFound(w, r)
		return
	}
	dir := a.mdir(p, m)
	w.Header().Set("Cache-Control", "max-age=3600")
	switch q.Get("k") {
	case "thumb":
		n, _ := strconv.Atoi(q.Get("n"))
		if m.Kind == "image" {
			n = 0
		}
		http.ServeFile(w, r, filepath.Join(dir, fmt.Sprintf("t%d.jpg", n)))
	case "wave":
		http.ServeFile(w, r, filepath.Join(dir, "wave.bin"))
	default:
		for _, f := range []string{"play.mp4", "play.m4a", "play.png"} {
			if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
				http.ServeFile(w, r, filepath.Join(dir, f))
				return
			}
		}
		if m.Proxy == "direct" {
			if _, err := os.Stat(filepath.Join(dir, "direct.mp4")); err == nil {
				http.ServeFile(w, r, filepath.Join(dir, "direct.mp4"))
			} else {
				http.ServeFile(w, r, m.Path)
			}
			return
		}
		if (m.Kind == "audio" && directAudio[ext(m.Path)]) || (m.Kind == "image" && directImage[ext(m.Path)]) {
			http.ServeFile(w, r, m.Path)
			return
		}
		http.Error(w, "noch nicht bereit", 404)
	}
}

// snapshot: Standbild aus dem Original an einer Stelle (für den Standbild-Knopf im Player).
func (a *App) snapshot(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	a.mu.Lock()
	p := a.projects[q.Get("id")]
	var m *Media
	if p != nil {
		m = a.mediaOf(p, q.Get("m"))
	}
	a.mu.Unlock()
	if m == nil {
		kit.Fail(w, 404, "Datei nicht gefunden.")
		return
	}
	t, _ := strconv.ParseFloat(q.Get("t"), 64)
	dir := filepath.Dir(m.Path)
	base := strings.TrimSuffix(m.Name, filepath.Ext(m.Name))
	out := filepath.Join(dir, fmt.Sprintf("%s Standbild %s.png", base, time.Now().Format("150405")))
	if err := a.cmd("-hide_banner", "-nostdin", "-y", "-ss", fmt.Sprintf("%.3f", t), "-i", m.Path, "-frames:v", "1", out).Run(); err != nil {
		kit.Fail(w, 500, "Das Standbild ließ sich nicht speichern.")
		return
	}
	ms, err := a.importFiles(p.ID, []string{out})
	if err != nil {
		kit.Fail(w, 500, err.Error())
		return
	}
	kit.JSON(w, ms)
}

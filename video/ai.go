package main

// KI-Funktionen (laufen offline auf dem eigenen Rechner, Modelle werden einmalig geladen):
//   - Hintergrund entfernen ohne Greenscreen (MODNet): rechnet für ein Video eine Graustufen-Maske,
//     die beim Abspielen und beim Export als Transparenz dient.
//   - Automatische Untertitel aus Sprache (Whisper base).

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"kit"
	"kit/ai"
	"kit/ort"
)

type aiJob struct {
	Running bool     `json:"running"`
	Done    float64  `json:"done"`
	Step    string   `json:"step"`
	Error   string   `json:"error"`
	Out     string   `json:"out,omitempty"`
	Subs    []subCue `json:"subs,omitempty"`
	Lang    string   `json:"lang,omitempty"`
	stop    bool
}

type subCue struct {
	S    float64 `json:"s"`
	E    float64 `json:"e"`
	Text string  `json:"text"`
}

var (
	aiMu   sync.Mutex
	aiJobs = map[string]*aiJob{}
)

func aiGet(key string) *aiJob {
	aiMu.Lock()
	defer aiMu.Unlock()
	return aiJobs[key]
}

func (a *App) aiRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ai/state", func(w http.ResponseWriter, r *http.Request) {
		m := r.URL.Query().Get("m")
		if _, ok := ai.Models[m]; !ok {
			kit.Fail(w, 400, "Unbekanntes Modell.")
			return
		}
		kit.JSON(w, ai.Get(m))
	})
	mux.HandleFunc("/api/ai/install", func(w http.ResponseWriter, r *http.Request) {
		m := r.URL.Query().Get("m")
		if _, ok := ai.Models[m]; !ok {
			kit.Fail(w, 400, "Unbekanntes Modell.")
			return
		}
		ai.Install(m)
		kit.JSON(w, ai.Get(m))
	})
	mux.HandleFunc("/api/ai/job", func(w http.ResponseWriter, r *http.Request) {
		aiMu.Lock()
		defer aiMu.Unlock()
		j := aiJobs[r.URL.Query().Get("key")]
		if j == nil {
			kit.JSON(w, aiJob{})
			return
		}
		kit.JSON(w, j)
	})
	mux.HandleFunc("/api/ai/cancel", func(w http.ResponseWriter, r *http.Request) {
		aiMu.Lock()
		if j := aiJobs[r.URL.Query().Get("key")]; j != nil {
			j.stop = true
		}
		aiMu.Unlock()
		kit.JSON(w, map[string]bool{"ok": true})
	})
	// /api/ai/file?id=…&m=…: fertige KI-Maske für die Vorschau
	mux.HandleFunc("/api/ai/file", func(w http.ResponseWriter, r *http.Request) {
		id, mid := r.URL.Query().Get("id"), r.URL.Query().Get("m")
		if strings.ContainsAny(id+mid, `/\.`) || id == "" || mid == "" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(a.dir(id), "mattes", mid+".mp4"))
	})
	// /api/ai/matte {id, m}: Maske für ein Video rechnen. Fortschritt: /api/ai/job?key=matte-<id>-<m>
	mux.HandleFunc("/api/ai/matte", func(w http.ResponseWriter, r *http.Request) {
		var rq struct{ ID, M string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq)
		m, dir, err := a.aiMedia(rq.ID, rq.M)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		if m.Kind != "video" && m.Kind != "image" {
			kit.Fail(w, 400, "Das geht nur mit Videos und Bildern.")
			return
		}
		if !ai.Ready("matte") {
			kit.Fail(w, 400, "Das KI-Modell fehlt noch.")
			return
		}
		key := "matte-" + rq.ID + "-" + rq.M
		out := filepath.Join(dir, "mattes", m.ID+".mp4")
		if st, err := os.Stat(out); err == nil && st.Size() > 0 {
			kit.JSON(w, map[string]any{"key": key, "out": out, "ready": true})
			return
		}
		if !a.startAI(key) {
			kit.Fail(w, 400, "Das läuft schon.")
			return
		}
		go a.finishAI(key, func(j *aiJob) error { return a.runMatte(j, m, out) }, func(j *aiJob) { j.Out = out })
		kit.JSON(w, map[string]any{"key": key})
	})
	// /api/ai/subs {id, m, in, out, lang}: Sprache in Text umwandeln. Ergebnis in Quellzeit.
	mux.HandleFunc("/api/ai/subs", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			ID, M, Lang string
			In, Out     float64
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq)
		m, _, err := a.aiMedia(rq.ID, rq.M)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		if m.Kind != "video" && m.Kind != "audio" {
			kit.Fail(w, 400, "Das geht nur mit Video- oder Ton-Clips.")
			return
		}
		if !ai.Ready("whisper") {
			kit.Fail(w, 400, "Das KI-Modell fehlt noch.")
			return
		}
		key := "subs-" + rq.ID + "-" + rq.M
		if !a.startAI(key) {
			kit.Fail(w, 400, "Das läuft schon.")
			return
		}
		var subs []subCue
		var lang string
		go a.finishAI(key, func(j *aiJob) error {
			var err error
			subs, lang, err = a.runWhisper(j, m, rq.In, rq.Out, rq.Lang)
			return err
		}, func(j *aiJob) { j.Subs, j.Lang = subs, lang })
		kit.JSON(w, map[string]any{"key": key})
	})
}

func (a *App) aiMedia(id, mid string) (*Media, string, error) {
	if !a.eng.Ready() {
		return nil, "", errors.New("Dafür fehlt noch ffmpeg. Richte es zuerst ein.")
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.projects[id]
	if p == nil {
		return nil, "", errors.New("Projekt nicht gefunden.")
	}
	m := a.mediaOf(p, mid)
	if m == nil {
		return nil, "", errors.New("Medium nicht gefunden.")
	}
	cp := *m
	return &cp, a.dir(id), nil
}

func (a *App) startAI(key string) bool {
	aiMu.Lock()
	defer aiMu.Unlock()
	if j := aiJobs[key]; j != nil && j.Running {
		return false
	}
	aiJobs[key] = &aiJob{Running: true}
	return true
}

func (a *App) finishAI(key string, run func(*aiJob) error, ok func(*aiJob)) {
	j := aiGet(key)
	err := run(j)
	aiMu.Lock()
	defer aiMu.Unlock()
	j.Running = false
	if j.stop {
		j.Error = "Abgebrochen"
		return
	}
	if err != nil {
		j.Error = err.Error()
		return
	}
	j.Done = 1
	ok(j)
}

func (j *aiJob) prog(d float64, step string) bool {
	aiMu.Lock()
	defer aiMu.Unlock()
	j.Done = d
	if step != "" {
		j.Step = step
	}
	return j.stop
}

// ---------- Hintergrund entfernen (MODNet) ----------

func (a *App) runMatte(j *aiJob, m *Media, out string) error {
	s, err := ai.Acquire("matte")
	if err != nil {
		return err
	}
	defer ai.Done("matte")
	// Rechengröße: kurze Seite 512, beide Seiten durch 32 teilbar
	W, H := m.W, m.H
	if W <= 0 || H <= 0 {
		return errors.New("Die Größe des Videos ist unbekannt.")
	}
	var aw, ah int
	if W >= H {
		ah = 512
		aw = int(math.Round(512*float64(W)/float64(H)/32)) * 32
	} else {
		aw = 512
		ah = int(math.Round(512*float64(H)/float64(W)/32)) * 32
	}
	fps := m.FPS
	if fps <= 0 || m.Kind == "image" {
		fps = 30
	}
	os.MkdirAll(filepath.Dir(out), 0o755)
	tmp := strings.TrimSuffix(out, ".mp4") + ".tmp.mp4"
	defer os.Remove(tmp)
	dec := a.cmd("-v", "error", "-i", m.Path, "-vf", fmt.Sprintf("scale=%d:%d:flags=bilinear,format=rgb24", aw, ah), "-fps_mode", "passthrough", "-f", "rawvideo", "-")
	if m.Kind == "image" {
		dec = a.cmd("-v", "error", "-i", m.Path, "-frames:v", "1", "-vf", fmt.Sprintf("scale=%d:%d:flags=bilinear,format=rgb24", aw, ah), "-f", "rawvideo", "-")
	}
	enc := a.cmd("-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "gray", "-s", fmt.Sprintf("%dx%d", aw, ah), "-r", f3(fps), "-i", "-",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp)
	rd, err := dec.StdoutPipe()
	if err != nil {
		return err
	}
	wr, err := enc.StdinPipe()
	if err != nil {
		return err
	}
	var encErr strings.Builder
	enc.Stderr = &limitWriter{b: &encErr, max: 4000}
	if err := enc.Start(); err != nil {
		return err
	}
	if err := dec.Start(); err != nil {
		wr.Close()
		enc.Wait()
		return err
	}
	total := math.Max(1, m.Dur*fps)
	frame := make([]byte, aw*ah*3)
	in := make([]float32, 3*aw*ah)
	px := make([]byte, aw*ah)
	prev := make([]float32, aw*ah)
	br := bufio.NewReaderSize(rd, len(frame))
	n := 0
	var runErr error
	for {
		if _, err := io.ReadFull(br, frame); err != nil {
			break
		}
		plane := aw * ah
		for i := 0; i < plane; i++ {
			in[i] = float32(frame[i*3])/127.5 - 1
			in[plane+i] = float32(frame[i*3+1])/127.5 - 1
			in[2*plane+i] = float32(frame[i*3+2])/127.5 - 1
		}
		res, _, err := s.Run(in, []int64{1, 3, int64(ah), int64(aw)})
		if err != nil {
			runErr = err
			break
		}
		if len(res) < plane {
			runErr = errors.New("Das KI-Modell liefert ein unerwartetes Ergebnis.")
			break
		}
		for i := 0; i < plane; i++ {
			v := res[i]
			if n > 0 { // leicht glätten gegen Flackern
				v = v*0.75 + prev[i]*0.25
			}
			prev[i] = v
			px[i] = byte(math.Max(0, math.Min(255, float64(v)*255+0.5)))
		}
		if _, err := wr.Write(px); err != nil {
			runErr = errors.New("Die Maske ließ sich nicht speichern: " + encErr.String())
			break
		}
		n++
		if j.prog(math.Min(0.99, float64(n)/total), "Hintergrund wird erkannt") {
			runErr = errors.New("stop")
			break
		}
	}
	if runErr != nil && dec.Process != nil {
		dec.Process.Kill()
	}
	dec.Wait()
	wr.Close()
	if err := enc.Wait(); err != nil && runErr == nil {
		runErr = errors.New("Die Maske ließ sich nicht speichern: " + encErr.String())
	}
	if runErr != nil {
		return runErr
	}
	if n == 0 {
		return errors.New("Das Video ließ sich nicht lesen.")
	}
	return os.Rename(tmp, out)
}

// ---------- Untertitel aus Sprache (Whisper) ----------

const (
	wSR      = 16000
	wNFFT    = 400
	wHop     = 160
	wMels    = 80
	wFrames  = 3000
	tEOT     = 50257
	tSOT     = 50258
	tLang0   = 50259
	tTrans   = 50359
	tNoTS    = 50363
	wMaxToks = 200
)

var whisperLangs = strings.Fields("en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su")

// readPCM liest den Ton als 16 kHz Mono float32.
func (a *App) readPCM(path string, in, out float64) ([]float32, error) {
	args := []string{"-v", "error"}
	if in > 0 {
		args = append(args, "-ss", f3(in))
	}
	if out > in {
		args = append(args, "-t", f3(out-in))
	}
	args = append(args, "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-")
	c := a.cmd(args...)
	b, err := c.Output()
	if err != nil && len(b) == 0 {
		return nil, errors.New("Der Ton ließ sich nicht lesen.")
	}
	pcm := make([]float32, len(b)/4)
	for i := range pcm {
		pcm[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
	}
	return pcm, nil
}

// speechChunks: Abschnitte mit Sprache (in Samples), höchstens maxLen Sekunden lang
func speechChunks(pcm []float32, maxLen float64) [][2]int {
	const fl = 320 // 20 ms
	nf := len(pcm) / fl
	if nf == 0 {
		return nil
	}
	db := make([]float64, nf)
	for i := 0; i < nf; i++ {
		var s float64
		for _, v := range pcm[i*fl : (i+1)*fl] {
			s += float64(v) * float64(v)
		}
		db[i] = 10 * math.Log10(s/fl+1e-12)
	}
	sorted := append([]float64(nil), db...)
	sort.Float64s(sorted)
	floor := sorted[nf/10]
	peak := sorted[nf*98/100]
	th := math.Max(floor+8, peak-35)
	th = math.Max(th, -55)
	var segs [][2]int
	in := false
	st := 0
	for i := 0; i < nf; i++ {
		if db[i] > th && !in {
			in, st = true, i
		} else if db[i] <= th && in {
			in = false
			segs = append(segs, [2]int{st, i})
		}
	}
	if in {
		segs = append(segs, [2]int{st, nf})
	}
	// kurze Pausen zusammenfassen, Mini-Geräusche weglassen
	var merged [][2]int
	for _, s := range segs {
		if len(merged) > 0 && s[0]-merged[len(merged)-1][1] < 20 { // < 0,4 s
			merged[len(merged)-1][1] = s[1]
			continue
		}
		merged = append(merged, s)
	}
	var out [][2]int
	maxF := int(maxLen * 50)
	for _, s := range merged {
		if s[1]-s[0] < 10 {
			continue
		}
		a, b := max(0, s[0]-10), min(nf, s[1]+10)
		for b-a > maxF { // zu lang: an der leisesten Stelle im letzten Drittel teilen
			lo, best := a+maxF*2/3, a+maxF
			for k := a + maxF*2/3; k < a+maxF; k++ {
				if db[k] < db[lo] {
					lo = k
				}
			}
			best = lo
			out = append(out, [2]int{a * fl, best * fl})
			a = best
		}
		out = append(out, [2]int{a * fl, b * fl})
	}
	return out
}

var (
	melOnce sync.Once
	melW    [][]float64 // [80][201]
	hannW   []float64
	cosT    []float64
	sinT    []float64
)

func melInit() {
	hz2mel := func(f float64) float64 {
		if f < 1000 {
			return 3 * f / 200
		}
		return 15 + 27*math.Log(f/1000)/math.Log(6.4)
	}
	mel2hz := func(m float64) float64 {
		if m < 15 {
			return 200 * m / 3
		}
		return 1000 * math.Exp(math.Log(6.4)*(m-15)/27)
	}
	nb := wNFFT/2 + 1
	pts := make([]float64, wMels+2)
	lo, hi := hz2mel(0), hz2mel(8000)
	for i := range pts {
		pts[i] = mel2hz(lo + (hi-lo)*float64(i)/float64(wMels+1))
	}
	melW = make([][]float64, wMels)
	for i := 0; i < wMels; i++ {
		melW[i] = make([]float64, nb)
		en := 2 / (pts[i+2] - pts[i])
		for k := 0; k < nb; k++ {
			f := float64(k) * 8000 / float64(nb-1)
			l := (f - pts[i]) / (pts[i+1] - pts[i])
			u := (pts[i+2] - f) / (pts[i+2] - pts[i+1])
			melW[i][k] = math.Max(0, math.Min(l, u)) * en
		}
	}
	hannW = make([]float64, wNFFT)
	for n := range hannW {
		hannW[n] = 0.5 - 0.5*math.Cos(2*math.Pi*float64(n)/wNFFT)
	}
	cosT = make([]float64, wNFFT)
	sinT = make([]float64, wNFFT)
	for n := 0; n < wNFFT; n++ {
		cosT[n] = math.Cos(2 * math.Pi * float64(n) / wNFFT)
		sinT[n] = math.Sin(2 * math.Pi * float64(n) / wNFFT)
	}
}

// logMel: Whisper-Eingabe [80][3000] aus höchstens 30 s Ton
func logMel(pcm []float32) []float32 {
	melOnce.Do(melInit)
	const N = wSR * 30
	x := make([]float64, N+wNFFT)
	for i := 0; i < N && i < len(pcm); i++ {
		x[i+wNFFT/2] = float64(pcm[i])
	}
	// Spiegeln am Rand (wie torch.stft center=True, reflect)
	for i := 1; i <= wNFFT/2; i++ {
		x[wNFFT/2-i] = x[wNFFT/2+i]
		x[wNFFT/2+N-1+i] = x[wNFFT/2+N-1-i]
	}
	nb := wNFFT/2 + 1
	out := make([]float32, wMels*wFrames)
	fr := make([]float64, wNFFT)
	pw := make([]float64, nb)
	maxV := -1e9
	vals := make([]float64, wMels*wFrames)
	// nur Bereiche mit Ton rechnen, Rest ist Stille (Null)
	active := (len(pcm) + wHop - 1) / wHop
	for t := 0; t < wFrames; t++ {
		if t <= active+2 {
			for n := 0; n < wNFFT; n++ {
				fr[n] = x[t*wHop+n] * hannW[n]
			}
			for k := 0; k < nb; k++ {
				var re, im float64
				idx := 0
				for n := 0; n < wNFFT; n++ {
					re += fr[n] * cosT[idx]
					im -= fr[n] * sinT[idx]
					idx += k
					if idx >= wNFFT {
						idx -= wNFFT
					}
				}
				pw[k] = re*re + im*im
			}
		} else {
			for k := range pw {
				pw[k] = 0
			}
		}
		for m := 0; m < wMels; m++ {
			var s float64
			for k, w := range melW[m] {
				if w != 0 {
					s += w * pw[k]
				}
			}
			v := math.Log10(math.Max(s, 1e-10))
			vals[m*wFrames+t] = v
			if v > maxV {
				maxV = v
			}
		}
	}
	for i, v := range vals {
		out[i] = float32((math.Max(v, maxV-8) + 4) / 4)
	}
	return out
}

type wTok struct {
	dec map[int]string
	b   map[rune]byte
}

func loadVocab(path string) (*wTok, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var v map[string]int
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, errors.New("Das Wörterbuch der Spracherkennung ist beschädigt.")
	}
	t := &wTok{dec: map[int]string{}, b: map[rune]byte{}}
	for s, id := range v {
		t.dec[id] = s
	}
	// GPT-2: Zuordnung Byte -> sichtbares Zeichen umkehren
	var bs []int
	for c := '!'; c <= '~'; c++ {
		bs = append(bs, int(c))
	}
	for c := '¡'; c <= '¬'; c++ {
		bs = append(bs, int(c))
	}
	for c := '®'; c <= 'ÿ'; c++ {
		bs = append(bs, int(c))
	}
	cs := append([]int(nil), bs...)
	in := map[int]bool{}
	for _, b := range bs {
		in[b] = true
	}
	n := 0
	for b := 0; b < 256; b++ {
		if !in[b] {
			bs = append(bs, b)
			cs = append(cs, 256+n)
			n++
		}
	}
	for i, b := range bs {
		t.b[rune(cs[i])] = byte(b)
	}
	return t, nil
}

func (t *wTok) text(ids []int) string {
	var buf []byte
	for _, id := range ids {
		if id >= tEOT {
			continue
		}
		for _, r := range t.dec[id] {
			if b, ok := t.b[r]; ok {
				buf = append(buf, b)
			}
		}
	}
	s := string(buf)
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "")
	}
	return strings.TrimSpace(s)
}

func argmax(v []float32, from, to int) int {
	b := from
	for i := from + 1; i < to; i++ {
		if v[i] > v[b] {
			b = i
		}
	}
	return b
}

func (a *App) runWhisper(j *aiJob, m *Media, in, out float64, lang string) ([]subCue, string, error) {
	j.prog(0.01, "Ton wird gelesen")
	pcm, err := a.readPCM(m.Path, in, out)
	if err != nil {
		return nil, "", err
	}
	if len(pcm) < wSR/4 {
		return nil, "", errors.New("Der Clip ist zu kurz.")
	}
	vp := ai.File("whisper", "vocab.json")
	tok, err := loadVocab(vp)
	if err != nil {
		return nil, "", err
	}
	enc, err := ai.Acquire("whisper-enc")
	if err != nil {
		return nil, "", err
	}
	defer ai.Done("whisper-enc")
	dec, err := ai.Acquire("whisper-dec")
	if err != nil {
		return nil, "", err
	}
	defer ai.Done("whisper-dec")
	chunks := speechChunks(pcm, 12)
	if len(chunks) == 0 {
		return nil, "", errors.New("Im Clip wurde keine Sprache gefunden.")
	}
	langTok := -1
	for i, l := range whisperLangs {
		if l == lang {
			langTok = tLang0 + i
		}
	}
	var cues []subCue
	for ci, ch := range chunks {
		if j.prog(0.03+0.95*float64(ci)/float64(len(chunks)), "Sprache wird erkannt") {
			return nil, "", errors.New("stop")
		}
		feat := logMel(pcm[ch[0]:ch[1]])
		hs, hd, err := enc.RunMulti(map[string]ort.Tensor{"input_features": {Data: feat, Shape: []int64{1, wMels, wFrames}}}, "")
		if err != nil {
			return nil, "", fmt.Errorf("Spracherkennung: %v", err)
		}
		run := func(ids []int64) ([]float32, error) {
			lg, dims, err := dec.RunMulti(map[string]ort.Tensor{"input_ids": {Data: ids, Shape: []int64{1, int64(len(ids))}}, "encoder_hidden_states": {Data: hs, Shape: hd}}, "logits")
			if err != nil {
				return nil, err
			}
			V := int(dims[len(dims)-1])
			return lg[len(lg)-V:], nil
		}
		if langTok < 0 { // Sprache selbst erkennen (einmal)
			lg, err := run([]int64{tSOT})
			if err != nil {
				return nil, "", fmt.Errorf("Spracherkennung: %v", err)
			}
			langTok = argmax(lg, tLang0, tLang0+len(whisperLangs))
		}
		ids := []int64{tSOT, int64(langTok), tTrans, tNoTS}
		var outIDs []int
		for step := 0; step < wMaxToks; step++ {
			lg, err := run(ids)
			if err != nil {
				return nil, "", fmt.Errorf("Spracherkennung: %v", err)
			}
			if step == 0 { // kein leerer Anfang
				lg[tEOT] = -1e9
				lg[220] = -1e9
			}
			nt := argmax(lg, 0, tEOT+1)
			if nt == tEOT {
				break
			}
			outIDs = append(outIDs, nt)
			ids = append(ids, int64(nt))
			// Wiederholungsschleifen abbrechen
			if k := len(outIDs); k >= 24 {
				rep := true
				for q := 0; q < 8; q++ {
					if outIDs[k-1-q] != outIDs[k-9-q] || outIDs[k-1-q] != outIDs[k-17-q] {
						rep = false
						break
					}
				}
				if rep {
					outIDs = outIDs[:k-16]
					break
				}
			}
		}
		txt := tok.text(outIDs)
		if txt == "" || strings.Trim(txt, ".… ") == "" {
			continue
		}
		s0, s1 := in+float64(ch[0])/wSR, in+float64(ch[1])/wSR
		cues = append(cues, splitCue(s0, s1, txt)...)
	}
	l := ""
	if langTok >= tLang0 && langTok-tLang0 < len(whisperLangs) {
		l = whisperLangs[langTok-tLang0]
	}
	if len(cues) == 0 {
		return nil, l, errors.New("Im Clip wurde keine Sprache erkannt.")
	}
	return cues, l, nil
}

// splitCue teilt langen Text in gut lesbare Untertitel (höchstens etwa 2 × 42 Zeichen)
func splitCue(s, e float64, txt string) []subCue {
	words := strings.Fields(txt)
	var parts []string
	cur := ""
	for _, w := range words {
		if cur != "" && utf8.RuneCountInString(cur)+1+utf8.RuneCountInString(w) > 80 {
			parts = append(parts, cur)
			cur = w
			continue
		}
		if cur == "" {
			cur = w
		} else {
			cur += " " + w
		}
		if strings.HasSuffix(w, ".") || strings.HasSuffix(w, "?") || strings.HasSuffix(w, "!") {
			if utf8.RuneCountInString(cur) > 30 {
				parts = append(parts, cur)
				cur = ""
			}
		}
	}
	if cur != "" {
		parts = append(parts, cur)
	}
	total := 0
	for _, p := range parts {
		total += utf8.RuneCountInString(p)
	}
	var out []subCue
	t := s
	for _, p := range parts {
		d := (e - s) * float64(utf8.RuneCountInString(p)) / float64(max(1, total))
		out = append(out, subCue{S: t, E: t + d, Text: wrap2(p)})
		t += d
	}
	return out
}

// wrap2 bricht einen Untertitel in höchstens zwei ähnlich lange Zeilen um
func wrap2(s string) string {
	if utf8.RuneCountInString(s) <= 42 {
		return s
	}
	w := strings.Fields(s)
	best, bi := 1e9, 1
	for i := 1; i < len(w); i++ {
		a := utf8.RuneCountInString(strings.Join(w[:i], " "))
		b := utf8.RuneCountInString(strings.Join(w[i:], " "))
		if d := math.Abs(float64(a - b)); d < best {
			best, bi = d, i
		}
	}
	return strings.Join(w[:bi], " ") + "\n" + strings.Join(w[bi:], " ")
}

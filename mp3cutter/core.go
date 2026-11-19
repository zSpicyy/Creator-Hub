package main

// Kern der App: MP3-Frames lesen, Datei stückweise analysieren, Schnitte finden, ohne Neukodierung schneiden.
// Die Quelldatei wird nie komplett geladen; nur ein Lesepuffer und wenige Blöcke pro CPU-Kern liegen im Speicher.

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"math/cmplx"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"

	"github.com/hajimehoshi/go-mp3"
)

const (
	chunkFrames   = 1152 // etwa 30 Sekunden pro Analyseblock
	prerollFrames = 8    // Vorlauf, weil MP3-Frames Daten aus Vorgängern nutzen
	featLen       = 14   // 12 Tonklassen, Klangfarbe, Lautstärke
)

type frameHdr struct {
	size, samples, rate, bitrate, channels int
}

var brV1 = [16]int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0}
var brV2 = [16]int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0}
var srT = [3]int{44100, 48000, 32000}

func parseHdr(b []byte) (frameHdr, bool) {
	var h frameHdr
	if len(b) < 4 || b[0] != 0xFF || b[1]&0xE0 != 0xE0 {
		return h, false
	}
	ver := (b[1] >> 3) & 3
	if ver == 1 || (b[1]>>1)&3 != 1 { // nur Layer III
		return h, false
	}
	bi, si := b[2]>>4, (b[2]>>2)&3
	if bi == 0 || bi == 15 || si == 3 {
		return h, false
	}
	pad := int((b[2] >> 1) & 1)
	h.rate = srT[si]
	if ver == 3 {
		h.bitrate = brV1[bi]
		h.samples = 1152
		h.size = 144000*h.bitrate/h.rate + pad
	} else {
		h.bitrate = brV2[bi]
		h.samples = 576
		if ver == 2 {
			h.rate /= 2
		} else {
			h.rate /= 4
		}
		h.size = 72000*h.bitrate/h.rate + pad
	}
	h.channels = 2
	if b[3]>>6 == 3 {
		h.channels = 1
	}
	return h, h.size > 4
}

// audioStart überspringt ID3v2-Tag, findet den ersten echten Frame und ein eventuelles Xing/Info-Kopffeld.
func audioStart(f io.ReaderAt, size int64) (int64, frameHdr, error) {
	var off int64
	head := make([]byte, 10)
	if _, err := f.ReadAt(head, 0); err == nil && string(head[:3]) == "ID3" {
		off = 10 + int64(head[6]&0x7f)<<21 + int64(head[7]&0x7f)<<14 + int64(head[8]&0x7f)<<7 + int64(head[9]&0x7f)
	}
	buf := make([]byte, 4<<20)
	n, _ := f.ReadAt(buf, off)
	buf = buf[:n]
	for i := 0; i+4 <= len(buf); i++ {
		h, ok := parseHdr(buf[i:])
		if !ok || i+h.size+4 > len(buf) {
			continue
		}
		h2, ok2 := parseHdr(buf[i+h.size:])
		if !ok2 || h2.rate != h.rate {
			continue
		}
		end := i + 200
		if end > len(buf) {
			end = len(buf)
		}
		if bytes.Contains(buf[i:end], []byte("Xing")) || bytes.Contains(buf[i:end], []byte("Info")) {
			return off + int64(i+h.size), h2, nil
		}
		return off + int64(i), h, nil
	}
	return 0, frameHdr{}, errors.New("In dieser Datei wurde kein MP3-Ton gefunden. Bitte wähle eine MP3-Datei.")
}

type FileInfo struct {
	Size     int64   `json:"size"`
	Modified int64   `json:"modified"`
	Bitrate  int     `json:"bitrate"`
	Rate     int     `json:"rate"`
	Channels int     `json:"channels"`
	Estimate float64 `json:"estimate"` // grobe Dauer in Sekunden
}

func quickLook(path string) (FileInfo, error) {
	var fi FileInfo
	f, err := os.Open(path)
	if err != nil {
		return fi, fmt.Errorf("Die Datei lässt sich nicht öffnen: %v", err)
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return fi, err
	}
	start, h, err := audioStart(f, st.Size())
	if err != nil {
		return fi, err
	}
	// Bitrate aus Stichproben über die ganze Datei schätzen, damit auch riesige VBR-Dateien sofort eine Dauer zeigen.
	sum, cnt := 0, 0
	buf := make([]byte, 64<<10)
	for s := 0; s < 16; s++ {
		pos := start + (st.Size()-start)*int64(s)/16
		n, _ := f.ReadAt(buf, pos)
		for i := 0; i+4 < n; {
			if hh, ok := parseHdr(buf[i:]); ok && i+hh.size+4 < n {
				if _, ok2 := parseHdr(buf[i+hh.size:]); ok2 {
					sum += hh.bitrate
					cnt++
					i += hh.size
					continue
				}
			}
			i++
		}
	}
	br := h.bitrate
	if cnt > 0 {
		br = sum / cnt
	}
	fi = FileInfo{Size: st.Size(), Modified: st.ModTime().Unix(), Bitrate: br, Rate: h.rate, Channels: h.channels}
	fi.Estimate = float64(st.Size()-start) * 8 / float64(br*1000)
	return fi, nil
}

// ---------- Analyse ----------

type chunkRec struct {
	Byte, End int64
	Pre       int64 // Startbyte inklusive Vorlauf
	PreFrames int32
	Frames    int32
	T0, T1    float64
	Rate      int32
	Rms       []uint8
	Feat      []float32
	Fp        []uint16
}

type Analysis struct {
	Start  int64
	Chunks []chunkRec // Rms/Feat liegen im Speicher zusammengefasst unten
	Rms    []uint8    // (dB+100)*2 alle 100 ms
	Feat   []float32  // featLen Werte pro Sekunde
	Fp     []uint16   // Klang-Fingerabdruck alle 100 ms
	Dur    float64
	Errors int
}

func db(v uint8) float64 { return float64(v)/2 - 100 }

type progressFn func(doneBytes, totalBytes int64, seconds float64)

// analyze liest die Datei blockweise. featPath speichert fertige Blöcke, damit eine Analyse nach Abbruch weiterläuft.
func analyze(path, featPath string, stop <-chan struct{}, prog progressFn) (*Analysis, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, _ := f.Stat()
	start, _, err := audioStart(f, st.Size())
	if err != nil {
		return nil, err
	}
	a := &Analysis{Start: start}
	nextByte := start
	var t float64
	if old, err := loadFeat(featPath, st.Size(), st.ModTime().Unix()); err == nil && len(old.Fp) == len(old.Rms) {
		a = old
		if n := len(a.Chunks); n > 0 {
			// Ein halb geschriebener letzter Eintrag darf beim Weitermachen nicht in der Datei bleiben.
			if err := rewriteFeat(featPath, st.Size(), st.ModTime().Unix(), a); err != nil {
				return nil, err
			}
			nextByte = a.Chunks[n-1].End
			t = a.Chunks[n-1].T1
		}
	}
	out, err := appendFeat(featPath, st.Size(), st.ModTime().Unix(), len(a.Chunks) > 0)
	if err != nil {
		return nil, err
	}
	defer out.Close()

	workers := runtime.NumCPU()
	if analysisCores > 0 && analysisCores < workers {
		workers = analysisCores
	}
	jobs := make(chan *chunkRec, workers)
	type slot struct {
		c   *chunkRec
		err error
	}
	order := make(chan chan slot, workers*2)
	var wg sync.WaitGroup
	results := map[*chunkRec]chan slot{}
	var mu sync.Mutex
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				e := analyzeChunk(f, c)
				mu.Lock()
				ch := results[c]
				delete(results, c)
				mu.Unlock()
				ch <- slot{c, e}
			}
		}()
	}
	cancelled := false
	go func() { // Frames der Reihe nach abgehen und Blöcke verteilen
		defer close(order)
		defer close(jobs)
		rd := bufio.NewReaderSize(io.NewSectionReader(f, nextByte, st.Size()-nextByte), 1<<20)
		pos := nextByte
		// Vorlauf für einen fortgesetzten Lauf: etwas vorher anfangen ist bei fehlenden Offsets nicht nötig,
		// die ersten Millisekunden eines Blocks zählen nur für die Messung.
		var hist []int64
		c := &chunkRec{Byte: pos, Pre: pos, T0: t}
		hb := make([]byte, 4)
		for {
			select {
			case <-stop:
				return
			default:
			}
			peek, perr := rd.Peek(4)
			if perr != nil {
				break
			}
			copy(hb, peek)
			h, ok := parseHdr(hb)
			if !ok {
				if _, e := rd.Discard(1); e != nil {
					break
				}
				pos++
				continue
			}
			if c.Frames == 0 {
				c.Byte = pos
				c.Rate = int32(h.rate)
				c.Pre = pos
				c.PreFrames = 0
				if len(hist) > 0 {
					c.Pre = hist[0]
					c.PreFrames = int32(len(hist))
				}
			}
			hist = append(hist, pos)
			if len(hist) > prerollFrames {
				hist = hist[1:]
			}
			if _, e := rd.Discard(h.size); e != nil {
				break
			}
			pos += int64(h.size)
			c.Frames++
			t += float64(h.samples) / float64(h.rate)
			if c.Frames >= chunkFrames {
				c.End, c.T1 = pos, t
				dispatch(c, jobs, order, results, &mu, stop)
				c = &chunkRec{Byte: pos, Pre: pos, T0: t}
			}
		}
		if c.Frames > 0 {
			c.End, c.T1 = pos, t
			dispatch(c, jobs, order, results, &mu, stop)
		}
	}()
	var firstErr error
	for ch := range order {
		s := <-ch
		if s.err != nil {
			a.Errors++
		}
		if e := writeChunk(out, s.c); e != nil && firstErr == nil {
			firstErr = fmt.Errorf("Der Zwischenstand lässt sich nicht speichern: %v", e)
		}
		a.Rms = append(a.Rms, s.c.Rms...)
		a.Feat = append(a.Feat, s.c.Feat...)
		a.Fp = append(a.Fp, s.c.Fp...)
		s.c.Rms, s.c.Feat, s.c.Fp = nil, nil, nil
		a.Chunks = append(a.Chunks, *s.c)
		a.Dur = s.c.T1
		if prog != nil {
			prog(s.c.End, st.Size(), a.Dur)
		}
	}
	wg.Wait()
	select {
	case <-stop:
		cancelled = true
	default:
	}
	if firstErr != nil {
		return nil, firstErr
	}
	if cancelled {
		return nil, errCancelled
	}
	if len(a.Chunks) == 0 {
		return nil, errors.New("In dieser Datei wurde kein abspielbarer MP3-Ton gefunden.")
	}
	return a, nil
}

var analysisCores int // 0 = alle Kerne

var errCancelled = errors.New("abgebrochen")

func dispatch[S any](c *chunkRec, jobs chan *chunkRec, order chan chan S, results map[*chunkRec]chan S, mu *sync.Mutex, stop <-chan struct{}) {
	ch := make(chan S, 1)
	mu.Lock()
	results[c] = ch
	mu.Unlock()
	select {
	case order <- ch:
	case <-stop:
		return
	}
	jobs <- c
}

func analyzeChunk(f io.ReaderAt, c *chunkRec) (err error) {
	nRms := int(math.Round(c.T1*10)) - int(math.Round(c.T0*10))
	nFeat := int(math.Round(c.T1)) - int(math.Round(c.T0))
	if nRms < 0 {
		nRms = 0
	}
	if nFeat < 0 {
		nFeat = 0
	}
	c.Rms = make([]uint8, nRms)
	c.Feat = make([]float32, nFeat*featLen)
	c.Fp = make([]uint16, nRms)
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("Dekodierfehler: %v", r)
		}
	}()
	dec, e := mp3.NewDecoder(io.NewSectionReader(f, c.Pre, c.End-c.Pre))
	if e != nil {
		return e
	}
	skip := int(c.PreFrames) * sampleBytes(c.Rate)
	if skip > 0 {
		if _, e := io.CopyN(io.Discard, dec, int64(skip)); e != nil {
			return e
		}
	}
	pcm, e := io.ReadAll(dec)
	if e != nil && len(pcm) == 0 {
		return e
	}
	measure(pcm, int(dec.SampleRate()), c)
	return nil
}

func sampleBytes(rate int32) int {
	if rate >= 32000 {
		return 1152 * 4
	}
	return 576 * 4
}

var (
	fftWin  []float64
	fftOnce sync.Once
)

const fftN = 2048

// measure berechnet Lautstärke im 100-ms-Raster und je Sekunde Tonklassen, Klangfarbe und Pegel.
func measure(pcm []byte, rate int, c *chunkRec) {
	fftOnce.Do(func() {
		fftWin = make([]float64, fftN)
		for i := range fftWin {
			fftWin[i] = 0.5 - 0.5*math.Cos(2*math.Pi*float64(i)/fftN)
		}
	})
	n := len(pcm) / 4
	if n == 0 {
		return
	}
	mono := make([]float32, n)
	for i := 0; i < n; i++ {
		l := int16(binary.LittleEndian.Uint16(pcm[i*4:]))
		r := int16(binary.LittleEndian.Uint16(pcm[i*4+2:]))
		mono[i] = (float32(l) + float32(r)) / 65536
	}
	for i := range c.Rms {
		a, b := i*n/len(c.Rms), (i+1)*n/len(c.Rms)
		var s float64
		for _, v := range mono[a:b] {
			s += float64(v * v)
		}
		d := -100.0
		if b > a && s > 0 {
			d = 10 * math.Log10(s/float64(b-a))
		}
		c.Rms[i] = uint8(math.Max(0, math.Min(200, (d+100)*2)))
	}
	nFeat := len(c.Feat) / featLen
	// auf rund 11 kHz herunterrechnen
	dec := rate / 11025
	if dec < 1 {
		dec = 1
	}
	low := make([]float64, n/dec)
	for i := range low {
		var s float32
		for j := 0; j < dec; j++ {
			s += mono[i*dec+j]
		}
		low[i] = float64(s) / float64(dec)
	}
	lowRate := float64(rate) / float64(dec)
	if len(c.Fp) > 0 {
		fp := fingerprint(low, lowRate)
		copy(c.Fp, fp)
	}
	buf := make([]complex128, fftN)
	for sec := 0; sec < nFeat; sec++ {
		a, b := sec*len(low)/nFeat, (sec+1)*len(low)/nFeat
		out := c.Feat[sec*featLen : (sec+1)*featLen]
		var energy, cn, cd float64
		blocks := 0
		for p := a; p+fftN <= b; p += fftN {
			for i := 0; i < fftN; i++ {
				buf[i] = complex(low[p+i]*fftWin[i], 0)
			}
			fft(buf)
			for k := 6; k < fftN/2; k++ {
				fr := float64(k) * lowRate / fftN
				if fr < 100 || fr > 4000 {
					continue
				}
				m := cmplx.Abs(buf[k])
				cn += fr * m
				cd += m
				if fr <= 2000 {
					pc := math.Mod(12*math.Log2(fr/440)+69+1200, 12)
					out[int(pc+0.5)%12] += float32(m * m)
				}
			}
			blocks++
		}
		for _, v := range low[a:b] {
			energy += v * v
		}
		if cd > 0 {
			out[12] = float32(cn / cd)
		}
		out[13] = float32(10 * math.Log10(energy/float64(b-a+1)+1e-10))
		_ = blocks
	}
}

func fft(a []complex128) {
	n := len(a)
	for i, j := 1, 0; i < n; i++ {
		bit := n >> 1
		for ; j&bit != 0; bit >>= 1 {
			j ^= bit
		}
		j ^= bit
		if i < j {
			a[i], a[j] = a[j], a[i]
		}
	}
	for l := 2; l <= n; l <<= 1 {
		w := cmplx.Rect(1, -2*math.Pi/float64(l))
		for i := 0; i < n; i += l {
			u := complex(1, 0)
			for j := 0; j < l/2; j++ {
				x, y := a[i+j], a[i+j+l/2]*u
				a[i+j], a[i+j+l/2] = x+y, x-y
				u *= w
			}
		}
	}
}

// ---------- Zwischenstand auf der Platte ----------

const featMagic = "MP3SF2"

func appendFeat(path string, size, mtime int64, keep bool) (*os.File, error) {
	if keep {
		return os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	}
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	f.WriteString(featMagic)
	binary.Write(f, binary.LittleEndian, size)
	binary.Write(f, binary.LittleEndian, mtime)
	return f, nil
}

func writeChunk(w io.Writer, c *chunkRec) error {
	var b bytes.Buffer
	for _, v := range []any{c.Byte, c.End, c.Pre, c.PreFrames, c.Frames, c.T0, c.T1, c.Rate, int32(len(c.Rms)), int32(len(c.Feat))} {
		binary.Write(&b, binary.LittleEndian, v)
	}
	b.Write(c.Rms)
	binary.Write(&b, binary.LittleEndian, c.Feat)
	binary.Write(&b, binary.LittleEndian, c.Fp)
	_, err := w.Write(b.Bytes())
	return err
}

func loadFeat(path string, size, mtime int64) (*Analysis, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := bufio.NewReaderSize(f, 1<<20)
	m := make([]byte, len(featMagic))
	if _, err := io.ReadFull(r, m); err != nil || (string(m) != featMagic && string(m) != "MP3SF1") {
		return nil, errors.New("alt")
	}
	v2 := string(m) == featMagic
	var s, t int64
	binary.Read(r, binary.LittleEndian, &s)
	binary.Read(r, binary.LittleEndian, &t)
	if s != size || t != mtime {
		return nil, errors.New("Quelldatei geändert")
	}
	a := &Analysis{}
	for {
		var c chunkRec
		var nr, nf int32
		ok := true
		for _, v := range []any{&c.Byte, &c.End, &c.Pre, &c.PreFrames, &c.Frames, &c.T0, &c.T1, &c.Rate, &nr, &nf} {
			if binary.Read(r, binary.LittleEndian, v) != nil {
				ok = false
				break
			}
		}
		if !ok {
			break
		}
		rms := make([]uint8, nr)
		feat := make([]float32, nf)
		if _, e := io.ReadFull(r, rms); e != nil {
			break
		}
		if binary.Read(r, binary.LittleEndian, feat) != nil {
			break
		}
		fpc := make([]uint16, 0)
		if v2 {
			fpc = make([]uint16, nr)
			if binary.Read(r, binary.LittleEndian, fpc) != nil {
				break
			}
		}
		a.Fp = append(a.Fp, fpc...)
		a.Rms = append(a.Rms, rms...)
		a.Feat = append(a.Feat, feat...)
		a.Chunks = append(a.Chunks, c)
		a.Dur = c.T1
	}
	if len(a.Chunks) > 0 {
		a.Start = a.Chunks[0].Byte
	}
	return a, nil
}

func rewriteFeat(path string, size, mtime int64, a *Analysis) error {
	f, err := appendFeat(path+".tmp", size, mtime, false)
	if err != nil {
		return err
	}
	ri, fi := 0, 0
	bw := bufio.NewWriterSize(f, 1<<20)
	for i := range a.Chunks {
		c := a.Chunks[i]
		nr := int(math.Round(c.T1*10)) - int(math.Round(c.T0*10))
		nf := (int(math.Round(c.T1)) - int(math.Round(c.T0))) * featLen
		c.Rms, c.Feat = a.Rms[ri:ri+nr], a.Feat[fi:fi+nf]
		c.Fp = a.Fp[ri : ri+nr]
		ri, fi = ri+nr, fi+nf
		if err := writeChunk(bw, &c); err != nil {
			f.Close()
			return err
		}
	}
	bw.Flush()
	f.Close()
	return os.Rename(path+".tmp", path)
}

// ---------- Schnitte finden ----------

type Kind struct {
	ID, Name, Prefix string
	MinLen           float64
	PauseCentre      float64
	PauseWeight      float64
	NoveltyWeight    float64
	FadeWeight       float64
}

var kinds = map[string]Kind{
	"song":    {"song", "Songs, die ich singe", "Song", 45, 2.5, 0.75, 0.6, 0.3},
	"music":   {"music", "Musik mit Instrumenten", "Track", 45, 2.0, 0.8, 0.6, 0.3},
	"take":    {"take", "Aufnahme-Takes", "Take", 3, 1.2, 1, 0, 0},
	"talk":    {"talk", "Gespräch oder Podcast", "Thema", 30, 3.0, 1, 0.15, 0},
	"chapter": {"chapter", "Hörbuch oder Vortrag", "Kapitel", 120, 2.5, 1, 0, 0},
	"stream":  {"stream", "Stream oder Video-Ton", "Clip", 10, 4.0, 1, 0.2, 0},
}

type DetectOpts struct {
	Kind     Kind
	MinLen   float64
	Expected int  // 0 = selbst entscheiden
	NoPause  bool // Grenzen auch ohne Pause suchen
	Tracks   []Track
}

type Cut struct {
	T        float64 `json:"t"`
	Score    float64 `json:"score"`
	Reason   string  `json:"reason"`
	Accepted bool    `json:"accepted"`
	Manual   bool    `json:"manual,omitempty"`
	Alt      float64 `json:"alt,omitempty"` // andere starke Stelle in der Nähe
}

const (
	acceptScore = 0.45
)

func clamp01(v float64) float64 { return math.Max(0, math.Min(1, v)) }

func percentile(rms []uint8, p float64) float64 {
	var hist [256]int
	for _, v := range rms {
		hist[v]++
	}
	target, sum := int(float64(len(rms))*p), 0
	for i, c := range hist {
		sum += c
		if sum > target {
			return db(uint8(i))
		}
	}
	return 0
}

func meanDB(rms []uint8, a, b int) float64 {
	if a < 0 {
		a = 0
	}
	if b > len(rms) {
		b = len(rms)
	}
	if b <= a {
		return -100
	}
	s := 0.0
	for _, v := range rms[a:b] {
		s += db(v)
	}
	return s / float64(b-a)
}

var keyMajor = [12]float64{6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88}
var keyMinor = [12]float64{6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17}

// keyVector sagt für alle 24 Tonarten, wie gut die gesungenen Töne dazu passen.
func keyVector(c []float64) [24]float64 {
	var out [24]float64
	mean := 0.0
	for _, v := range c {
		mean += v / 12
	}
	for root := 0; root < 12; root++ {
		for i := 0; i < 12; i++ {
			x := c[(root+i)%12] - mean
			out[root] += x * (keyMajor[i] - 3.48)
			out[root+12] += x * (keyMinor[i] - 3.71)
		}
	}
	return out
}

func noveltyRaw(feat []float32, voicedFloor float64) []float64 {
	n := len(feat) / featLen
	out := make([]float64, n)
	const win = 20
	if n < 2*8 {
		return out
	}
	// laufende Summen: jede Sekunde kostet nur ein paar Rechenschritte, auch bei sehr langen Dateien
	pre := make([]float64, (n+1)*(featLen))
	cnt := make([]float64, n+1)
	for i := 0; i < n; i++ {
		v := feat[i*featLen : (i+1)*featLen]
		sum := 0.0
		for k := 0; k < 12; k++ {
			sum += float64(v[k])
		}
		voiced := float64(v[13]) > voicedFloor && sum > 0
		for k := 0; k < featLen; k++ {
			x := 0.0
			if voiced {
				if k < 12 {
					x = float64(v[k]) / sum
				} else if k == 12 {
					x = float64(v[12])
				} else {
					x = float64(v[13])
				}
			}
			pre[(i+1)*featLen+k] = pre[i*featLen+k] + x
		}
		cnt[i+1] = cnt[i]
		if voiced {
			cnt[i+1]++
		}
	}
	mean := func(a, b int, m *[featLen]float64) bool {
		c := cnt[b] - cnt[a]
		if c < 5 {
			return false
		}
		for k := 0; k < featLen; k++ {
			m[k] = (pre[b*featLen+k] - pre[a*featLen+k]) / c
		}
		return true
	}
	var l, r [featLen]float64
	for t := 8; t < n-8; t++ {
		a, b := t-win, t+win
		if a < 0 {
			a = 0
		}
		if b > n {
			b = n
		}
		if !mean(a, t, &l) || !mean(t, b, &r) {
			continue
		}
		// Tonarten vergleichen statt einzelner Töne: eine Melodie, die innerhalb derselben Tonart wandert, zählt nicht als Wechsel.
		kl, kr := keyVector(l[:12]), keyVector(r[:12])
		var dot, la, ra float64
		for k := range kl {
			dot += kl[k] * kr[k]
			la += kl[k] * kl[k]
			ra += kr[k] * kr[k]
		}
		d := 0.0
		if la > 0 && ra > 0 {
			d = 1 - dot/math.Sqrt(la*ra)
		}
		d += 0.15*math.Abs(l[12]-r[12])/math.Max(300, (l[12]+r[12])/2) + 0.004*math.Abs(l[13]-r[13])
		out[t] = d
	}
	return out
}

func novelty(feat []float32, voicedFloor float64) []float64 {
	out := noveltyRaw(feat, voicedFloor)
	// Fester Maßstab: Ähnliche Tonarten bleiben unter 0,7; ein echter Tonartwechsel liegt über 1,1.
	for i, v := range out {
		out[i] = clamp01((v - 0.7) / 0.6)
	}
	return out
}

// refineBoundary vergleicht kurze Fenster um t herum und liefert die Sekunde mit dem größten Wechsel der Tonklassen.
func refineBoundary(feat []float32, t int) int {
	n := len(feat) / featLen
	const w = 6
	mean := func(a, b int) [12]float64 {
		var m [12]float64
		for i := a; i < b; i++ {
			if i < 0 || i >= n {
				continue
			}
			v := feat[i*featLen : i*featLen+12]
			s := 0.0
			for _, x := range v {
				s += float64(x)
			}
			if s > 0 {
				for k, x := range v {
					m[k] += float64(x) / s
				}
			}
		}
		return m
	}
	best, bd := t, -1.0
	for c := t - 8; c <= t+8; c++ {
		l, r := mean(c-w, c), mean(c, c+w)
		var dot, la, ra float64
		for k := range l {
			dot += l[k] * r[k]
			la += l[k] * l[k]
			ra += r[k] * r[k]
		}
		if la == 0 || ra == 0 {
			continue
		}
		if d := 1 - dot/math.Sqrt(la*ra); d > bd {
			bd, best = d, c
		}
	}
	return best
}

// snapToDip sucht um die Sekunde c die Stelle, an der es über 1,5 s am leisesten ist. So landet der Schnitt
// hinter einem Ausklang und nicht mittendrin; kurze Atempausen wiegen in diesem breiten Fenster wenig.
func snapToDip(rms []uint8, c int) int {
	best, bv := c, 1e9
	for i := (c - 8) * 10; i <= (c+12)*10; i += 2 {
		if i < 0 || i+15 > len(rms) {
			continue
		}
		v := meanDB(rms, i, i+15) + 1.5*math.Abs(float64(i)/10-float64(c))
		if v < bv {
			bv, best = v, (i+7)/10
		}
	}
	return best
}

// Track ist ein Eintrag aus der Spotify-Playlist oder der eingefügten Titelliste.
type Track struct {
	Title   string  `json:"title"`
	Artist  string  `json:"artist"`
	Dur     float64 `json:"dur"` // Sekunden, 0 = unbekannt
	ID      string  `json:"id,omitempty"`
	Preview string  `json:"preview,omitempty"`
	Anchor  float64 `json:"anchor,omitempty"` // Fundstelle der Hörprobe in der Aufnahme
	Score   float64 `json:"score,omitempty"`
}

type dip struct {
	t     float64 // Schnittpunkt
	score float64
	width float64
	why   string
	real  bool // echte Stille oder tiefe Pause
}

func kommazahl(v float64) string { return strings.Replace(fmt.Sprintf("%.1f", v), ".", ",", 1) }

// findDips sucht alle Stellen, an denen ein Teil enden könnte.
// Wichtig: Maßstab ist das Grundrauschen der Aufnahme, nicht der Durchschnitt.
// Leise Songanfänge und Ausklänge gelten deshalb nie als Pause, geschnitten wird erst am Ende der echten Stille.
func findDips(a *Analysis, k Kind, nov []float64) []dip {
	rms := a.Rms
	floor := percentile(rms, 0.01)
	// Echte digitale Stille: Mindestens ein Promille der Aufnahme ist praktisch stumm.
	silent := 0
	for _, v := range rms {
		if db(v) <= -90 {
			silent++
		}
	}
	digital := float64(silent)/float64(len(rms)) >= 0.001
	thr := floor + 6
	if digital {
		thr = -85
	}
	var out []dip
	fade := func(p int) float64 {
		return clamp01((meanDB(rms, p-200, p-80) - meanDB(rms, p-40, p)) / 12)
	}
	near := func(t float64) float64 {
		m := 0.0
		for i := int(t) - 4; i <= int(t)+4; i++ {
			if i >= 0 && i < len(nov) && nov[i] > m {
				m = nov[i]
			}
		}
		return m
	}
	boost := func(base, t float64, p int) float64 {
		return 1 - (1-base)*(1-k.NoveltyWeight*near(t))*(1-k.FadeWeight*fade(p))
	}
	add := func(x, y int, deep bool) {
		w := float64(y-x) / 10
		if x <= 2 || y >= len(rms)-2 {
			return // Stille am Anfang oder Ende der Aufnahme ist keine Grenze
		}
		// direkt vor dem nächsten Einsatz schneiden: die Stille und jeder Ausklang bleiben beim vorherigen Teil
		t := float64(y)/10 - math.Min(0.05, w/2)
		var base float64
		why := kommazahl(w) + " s Stille"
		switch {
		case deep && digital:
			base = 0.78 + 0.2*clamp01(w/2)
		case deep:
			// Atempausen sind kurz: Unter der typischen Pausenlänge zählt eine Stelle kaum.
			base = 0.1 + 0.85*(1-math.Exp(-math.Ln2*math.Pow(w/k.PauseCentre, 2)))
		default:
			base = 0.15 + 0.3*clamp01(w/k.PauseCentre)
			why = kommazahl(w) + " s fast Stille"
		}
		score := boost(base, t, x)
		if !deep && digital {
			score = math.Min(score, 0.44) // Diese Aufnahme trennt Teile sonst durch echte Stille.
		}
		if f := fade(x); f > 0.4 && k.FadeWeight > 0 {
			why += " nach einem Ausklang"
		}
		out = append(out, dip{t: t, score: score, width: w, why: why, real: true})
	}
	// Stufe 1: echte Stille
	runs := func(test func(i int) bool, minLen, gap int, deep bool) {
		in, last := -1, -1
		for i := range rms {
			if test(i) {
				if in < 0 {
					if last >= 0 && i-last <= gap {
						in = last // kurze Unterbrechung überbrücken
					} else {
						in = i
					}
				}
			} else if in >= 0 {
				if i-in >= minLen {
					add(in, i, deep)
					last = -1
				} else {
					last = in
				}
				in = -1
			}
		}
	}
	runs(func(i int) bool { return db(rms[i]) <= thr }, 2, 3, true)
	// Stufe 2: tiefe Löcher im Pegel, gemessen an der Umgebung. Sie finden das leise Ende von Songs ohne echte Stille.
	window := 150
	level := make([]float64, len(rms))
	for i := 0; i < len(rms); i += 50 {
		lo, hi := max(0, i-window), min(len(rms), i+window)
		v := percentile(rms[lo:hi], 0.7)
		for j := i; j < min(i+50, len(rms)); j++ {
			level[j] = v
		}
	}
	strong := append([]dip(nil), out...)
	runs(func(i int) bool { return db(rms[i]) < level[i]-28 && db(rms[i]) > thr }, 4, 2, false)
	// schwache Stellen in der Nähe echter Stille weglassen
	var res []dip
	for _, d := range out {
		dup := false
		if d.score < 0.5 {
			for _, s := range strong {
				if math.Abs(s.t-d.t) < 8 {
					dup = true
					break
				}
			}
		}
		if !dup {
			res = append(res, d)
		}
	}
	sort.Slice(res, func(i, j int) bool { return res[i].t < res[j].t })
	return res
}

func detect(a *Analysis, o DetectOpts) []Cut {
	if len(a.Rms) == 0 {
		return nil
	}
	k := o.Kind
	rms := a.Rms
	loud := percentile(rms, 0.6)
	nov := novelty(a.Feat, loud-25)
	cands := findDips(a, k, nov)
	if o.NoPause && k.NoveltyWeight > 0.3 {
		for t := 15; t < len(nov)-15; t++ {
			if nov[t] < 0.3 {
				continue
			}
			top := true
			for j := t - 12; j <= t+12; j++ {
				if j != t && j >= 0 && j < len(nov) && (nov[j] > nov[t] || (nov[j] == nov[t] && j < t)) {
					top = false
					break
				}
			}
			if !top {
				continue
			}
			c := snapToDip(rms, refineBoundary(a.Feat, t))
			best, bv := c*10, 1e9
			for i := c*10 - 10; i < c*10+10 && i+3 < len(rms); i++ {
				if i < 0 {
					continue
				}
				if v := meanDB(rms, i, i+3); v <= bv {
					bv, best = v, i
				}
			}
			tt := float64(best+1) / 10
			dup := false
			for _, d := range cands {
				if math.Abs(d.t-tt) < 6 {
					dup = true
					break
				}
			}
			if !dup {
				cands = append(cands, dip{t: tt, score: k.NoveltyWeight * nov[t] * 0.9, why: "Tonart wechselt ohne Pause"})
			}
		}
		sort.Slice(cands, func(i, j int) bool { return cands[i].t < cands[j].t })
	}
	minLen := o.MinLen
	if minLen <= 0 {
		minLen = k.MinLen
	}
	n := o.Expected
	if n <= 0 {
		n = len(o.Tracks)
	}
	if len(o.Tracks) != n { // eigene Anzahl gewählt: Titel gelten nur noch für die Namen
		o.Tracks = nil
	}
	var picked []dip
	var trackFit []float64
	switch {
	case n > 1:
		picked, trackFit = chooseWithTail(cands, a.Dur, n, o.Tracks, minLen)
	case n == 1:
	default:
		sorted := append([]dip(nil), cands...)
		sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].score > sorted[j].score })
		take := func(real bool) {
			for _, c := range sorted {
				if c.real != real || c.score < acceptScore || c.t < minLen || a.Dur-c.t < minLen {
					continue
				}
				ok := true
				for _, p := range picked {
					if math.Abs(p.t-c.t) < minLen {
						ok = false
						break
					}
				}
				if !real && ok && len(picked) >= 3 {
					// Ein Tonartwechsel allein zählt nur, wenn der Teil sonst auffällig lang wäre.
					ls := partLengths(picked, a.Dur)
					sort.Float64s(ls)
					lo, hi := 0.0, a.Dur
					for _, p := range picked {
						if p.t < c.t && p.t > lo {
							lo = p.t
						}
						if p.t > c.t && p.t < hi {
							hi = p.t
						}
					}
					ok = hi-lo > 1.6*ls[len(ls)/2]
				}
				if ok {
					picked = append(picked, c)
				}
			}
		}
		take(true)
		take(false)
		sort.Slice(picked, func(i, j int) bool { return picked[i].t < picked[j].t })
	}
	// Übergänge ohne Pause: Wenn der vorherige Schnitt sitzt, ergibt die Songlänge die genaue Grenze.
	if trackFit != nil {
		prev := 0.0
		for i := range picked {
			if !picked[i].real && i < len(o.Tracks) && o.Tracks[i].Dur > 0 {
				if t := prev + o.Tracks[i].Dur; math.Abs(t-picked[i].t) <= 3 {
					picked[i].t = t
				}
			}
			prev = picked[i].t
		}
	}
	out := make([]Cut, 0, len(picked))
	for i, p := range picked {
		c := Cut{T: p.t, Score: p.score, Reason: p.why, Accepted: true}
		if trackFit != nil && i < len(trackFit) && trackFit[i] > 6 {
			c.Score = math.Min(c.Score, 0.5)
			c.Reason += ", Länge weicht vom Playlist-Titel ab"
		}
		// gleich starke Stille in der Nähe, die nicht gewählt wurde: Stelle zum Anhören markieren
		for _, r := range cands {
			if trackFit != nil && i < len(trackFit) && trackFit[i] <= 6 {
				break // Die Länge passt zum Playlist-Titel, also gibt es keinen Zweifel.
			}
			if r.real && r.score >= 0.6 && r.score >= p.score-0.1 && r.t != p.t && math.Abs(r.t-p.t) < minLen && math.Abs(r.t-p.t) > 6 {
				taken := false
				for _, q := range picked {
					if q.t == r.t {
						taken = true
						break
					}
				}
				if !taken {
					c.Alt = r.t
					break
				}
			}
		}
		out = append(out, c)
	}
	return out
}

func partLengths(p []dip, dur float64) []float64 {
	t := []float64{0}
	for _, x := range p {
		t = append(t, x.t)
	}
	sort.Float64s(t)
	t = append(t, dur)
	out := make([]float64, 0, len(t))
	for i := 1; i < len(t); i++ {
		out = append(out, t[i]-t[i-1])
	}
	return out
}

// chooseWithTail behandelt Aufnahmen, die länger sind als die Playlist: Die Titel werden von vorn zugeordnet,
// der Rest am Ende wird an echter Stille in weitere Teile ohne Titel geschnitten.
func chooseWithTail(cands []dip, dur float64, n int, tracks []Track, minLen float64) ([]dip, []float64) {
	sum := 0.0
	for _, t := range tracks {
		if t.Dur <= 0 {
			sum = -1
			break
		}
		sum += t.Dur
	}
	tail := dur - sum - float64(n)*3
	if len(tracks) != n || sum <= 0 || tail < math.Max(minLen, 30) {
		return chooseExact(cands, dur, n, tracks, minLen)
	}
	ext := append(append([]Track(nil), tracks...), Track{Dur: tail})
	res, fit := chooseExact(cands, dur, n+1, ext, minLen)
	if fit == nil || len(res) != n { // Längen passen nicht: bei der gewünschten Anzahl bleiben
		return chooseExact(cands, dur, n, tracks, minLen)
	}
	last := res[n-1].t
	for _, c := range cands {
		if c.real && c.score >= acceptScore && c.t-last >= minLen && dur-c.t >= minLen {
			res = append(res, c)
			last = c.t
		}
	}
	return res, fit
}

// chooseExact wählt genau n-1 Schnitte. Mit Playlist-Längen müssen die Teile außerdem zu den Titeln passen.
func chooseExact(cands []dip, dur float64, n int, tracks []Track, minLen float64) ([]dip, []float64) {
	haveDur := 0
	var sum float64
	for _, t := range tracks {
		if t.Dur > 0 {
			haveDur++
			sum += t.Dur
		}
	}
	useDur := len(tracks) > 0 && haveDur == len(tracks)
	// Zwischen zwei gefundenen Songs ohne echte Stille: jede Sekunde ist eine mögliche Grenze.
	if useDur {
		for j := 0; j+1 < len(tracks); j++ {
			if tracks[j].Anchor <= 0 || tracks[j+1].Anchor <= 0 {
				continue
			}
			a, b := tracks[j].Anchor+28, tracks[j+1].Anchor+2
			clear := true
			for _, c := range cands {
				if c.real && c.score >= 0.5 && c.t > a && c.t < b {
					clear = false
					break
				}
			}
			if clear {
				for t := math.Floor(a); t < b; t++ {
					cands = append(cands, dip{t: t, score: 0.005, why: "Song erkannt, Übergang ohne Pause"})
				}
			}
		}
		sort.Slice(cands, func(i, j int) bool { return cands[i].t < cands[j].t })
	}
	if useDur {
		// Falls keine Stille in der Nähe ist: geschätzte Position als letzter Ausweg
		scale := dur / sum
		var cum float64
		for _, t := range tracks[:len(tracks)-1] {
			cum += t.Dur * scale
			clear := true
			for _, c := range cands {
				if math.Abs(c.t-cum) < 25 {
					clear = false
					break
				}
			}
			if clear {
				cands = append(cands, dip{t: cum, score: 0.01, why: "kein hörbarer Übergang, Position aus der Playlist berechnet"})
			}
		}
		sort.Slice(cands, func(i, j int) bool { return cands[i].t < cands[j].t })
	}
	run := func(lambda float64) ([]dip, []float64, float64) {
		C := len(cands)
		const neg = -1e18
		lenCost := func(j int, L float64) float64 {
			if !useDur {
				if L < minLen {
					return 50
				}
				return 0
			}
			if L < minLen {
				return 50
			}
			e := math.Abs(L - tracks[j].Dur)
			return lambda * math.Min((e/5)*(e/5), 25)
		}
		// Ein gefundener Titel muss vollständig in seinem Teil liegen.
		anchorCost := func(j int, a, b float64) float64 {
			if j >= len(tracks) || tracks[j].Anchor <= 0 {
				return 0
			}
			if tracks[j].Anchor < a-2 || tracks[j].Anchor+28 > b+2 {
				return 60
			}
			return 0
		}
		// best[j][i]: Teil j endet an Kandidat i
		best := make([][]float64, n)
		from := make([][]int32, n)
		for j := range best {
			best[j] = make([]float64, C)
			from[j] = make([]int32, C)
			for i := range best[j] {
				best[j][i] = neg
			}
		}
		for i, c := range cands {
			best[0][i] = c.score - lenCost(0, c.t) - anchorCost(0, 0, c.t)
			from[0][i] = -1
		}
		for j := 1; j < n-1; j++ {
			for i := j; i < C; i++ {
				for p := i - 1; p >= j-1; p-- {
					L := cands[i].t - cands[p].t
					if useDur && L > tracks[j].Dur+120 {
						break
					}
					if best[j-1][p] == neg {
						continue
					}
					v := best[j-1][p] + cands[i].score - lenCost(j, L) - anchorCost(j, cands[p].t, cands[i].t)
					if v > best[j][i] {
						best[j][i], from[j][i] = v, int32(p)
					}
				}
			}
		}
		if n-2 >= len(best) || n < 2 {
			return nil, nil, neg
		}
		bi, bv := -1, neg
		for i := range cands {
			if best[n-2][i] == neg {
				continue
			}
			v := best[n-2][i] - lenCost(n-1, dur-cands[i].t) - anchorCost(n-1, cands[i].t, dur)
			if v > bv {
				bv, bi = v, i
			}
		}
		if bi < 0 {
			return nil, nil, neg
		}
		idx := make([]int, n-1)
		for j, i := n-2, bi; j >= 0; j-- {
			idx[j] = i
			i = int(from[j][i])
		}
		res := make([]dip, n-1)
		fit := make([]float64, n-1)
		prev := 0.0
		for j, i := range idx {
			res[j] = cands[i]
			if useDur {
				fit[j] = math.Abs(cands[i].t - prev - tracks[j].Dur)
			}
			prev = cands[i].t
		}
		return res, fit, bv
	}
	if len(cands) < n-1 {
		// zu wenige Stellen gefunden: alle nehmen, die es gibt
		return cands, nil
	}
	if n*len(cands) > 40_000_000 { // sehr große Dateien: stärkste Stellen statt voller Tabelle
		sorted := append([]dip(nil), cands...)
		sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].score > sorted[j].score })
		res := []dip{}
		for _, c := range sorted {
			ok := len(res) < n-1
			for _, r := range res {
				if math.Abs(r.t-c.t) < minLen {
					ok = false
					break
				}
			}
			if ok {
				res = append(res, c)
			}
		}
		sort.Slice(res, func(i, j int) bool { return res[i].t < res[j].t })
		return res, nil
	}
	lambda := 0.0
	if useDur {
		lambda = 0.25
	}
	res, fit, _ := run(lambda)
	if useDur {
		e := append([]float64(nil), fit...)
		sort.Float64s(e)
		if len(e) > 0 && e[len(e)/2] > 15 { // Längen passen insgesamt nicht: nur Anzahl und Namen verwenden
			useDur = false
			res, fit, _ = run(0)
			fit = nil
		}
	}
	if !useDur {
		fit = nil
	}
	return res, fit
}

// ---------- Feinschnitt ----------

// frameAt liefert Byte und Zeit des Frames, der die Zeit t enthält.
func frameAt(f io.ReaderAt, a *Analysis, t float64) (int64, float64, error) {
	i := sort.Search(len(a.Chunks), func(i int) bool { return a.Chunks[i].T1 > t })
	if i >= len(a.Chunks) {
		c := a.Chunks[len(a.Chunks)-1]
		return c.End, c.T1, nil
	}
	c := a.Chunks[i]
	pos, cur := c.Byte, c.T0
	if t <= c.T0 {
		return pos, cur, nil
	}
	hb := make([]byte, 4)
	for pos < c.End {
		if _, err := f.ReadAt(hb, pos); err != nil {
			return pos, cur, err
		}
		h, ok := parseHdr(hb)
		if !ok {
			pos++
			continue
		}
		next := cur + float64(h.samples)/float64(h.rate)
		if next > t {
			return pos, cur, nil
		}
		cur = next
		pos += int64(h.size)
	}
	return pos, cur, nil
}

// refineCut misst um einen Schnitt herum im 5-ms-Raster und legt ihn kurz vor den echten Einsatz des nächsten Songs.
// So bleibt die Stille beim vorherigen Song, und vom neuen Song fehlt nichts.
func refineCut(f io.ReaderAt, a *Analysis, t float64) float64 {
	from, to := t-1.5, t+1.5
	if from < 0 {
		from = 0
	}
	pa, t0, err := frameAt(f, a, from)
	if err != nil {
		return t
	}
	pb, _, err := frameAt(f, a, to)
	if err != nil || pb <= pa {
		return t
	}
	dec, err := mp3.NewDecoder(io.NewSectionReader(f, pa, pb-pa))
	if err != nil {
		return t
	}
	pcm, _ := io.ReadAll(dec)
	rate := dec.SampleRate()
	step := rate / 200
	n := len(pcm) / 4 / step
	if n < 40 {
		return t
	}
	lv := make([]float64, n)
	low := 0.0
	for i := range lv {
		sum := 0.0
		for j := i * step; j < (i+1)*step; j++ {
			l := float64(int16(binary.LittleEndian.Uint16(pcm[j*4:]))) / 32768
			r := float64(int16(binary.LittleEndian.Uint16(pcm[j*4+2:]))) / 32768
			sum += (l + r) * (l + r) / 4
		}
		lv[i] = 10 * math.Log10(sum/float64(step)+1e-11)
		if i >= 20 && (i == 20 || lv[i] < low) { // die ersten 100 ms können vom Dekoder-Vorlauf stammen
			low = lv[i]
		}
	}
	thr := math.Min(low+10, -55)
	if low < -85 {
		thr = -72
	}
	idx := int((t - t0) * 200)
	if idx < 20 {
		idx = 20
	}
	if idx >= n {
		idx = n - 1
	}
	quiet := func(i int) bool { return lv[i] < thr }
	// nächste stille Stelle suchen, höchstens 0,75 s entfernt
	q := -1
	for d := 0; d <= 150; d++ {
		if idx-d >= 20 && quiet(idx-d) {
			q = idx - d
			break
		}
		if idx+d < n && quiet(idx+d) {
			q = idx + d
			break
		}
	}
	if q < 0 {
		return t // keine Stille in der Nähe: Schnitt bleibt
	}
	on := q
	for on+2 < n && (quiet(on) || quiet(on+1) && quiet(on+2)) {
		on++
	}
	start := q
	for start > 20 && quiet(start-1) {
		start--
	}
	gap := float64(on-start) / 200
	lead := math.Min(0.12, gap/2)
	return t0 + float64(on)/200 - lead
}

// refineCuts wendet den Feinschnitt auf alle automatisch gesetzten Schnitte an.
func refineCuts(path string, a *Analysis, cuts []Cut) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	for i := range cuts {
		if !cuts[i].Manual {
			cuts[i].T = refineCut(f, a, cuts[i].T)
		}
	}
}

// lengthHeader baut einen stillen Kopf-Frame mit Frame-Zahl, Bytezahl und Sprungtabelle.
// Player kennen damit die genaue Länge und können auch bei wechselnder Bitrate richtig vorspulen.
func lengthHeader(f io.ReaderAt, start, end int64) ([]byte, error) {
	hb := make([]byte, 4)
	if _, err := f.ReadAt(hb, start); err != nil {
		return nil, err
	}
	first, ok := parseHdr(hb)
	if !ok {
		return nil, errors.New("kein Frame am Anfang")
	}
	h := []byte{0xFF, hb[1] | 1, hb[2] & 0x0C, hb[3]}
	mpeg1 := first.samples == 1152
	var off int
	if mpeg1 {
		h[2] |= 9 << 4 // 128 kbit/s
		off = 36
		if first.channels == 1 {
			off = 21
		}
	} else {
		h[2] |= 8 << 4 // 64 kbit/s
		off = 21
		if first.channels == 1 {
			off = 13
		}
	}
	fh, _ := parseHdr(h)
	offsets := []int64{}
	rd := bufio.NewReaderSize(io.NewSectionReader(f, start, end-start), 1<<18)
	pos, frames := start, 0
	for pos+4 <= end {
		p, err := rd.Peek(4)
		if err != nil {
			break
		}
		x, ok := parseHdr(p)
		if !ok {
			rd.Discard(1)
			pos++
			continue
		}
		offsets = append(offsets, pos)
		frames++
		if _, err := rd.Discard(x.size); err != nil {
			break
		}
		pos += int64(x.size)
	}
	total := end - start + int64(fh.size)
	out := make([]byte, fh.size)
	copy(out, h)
	w := out[off:]
	copy(w, "Xing")
	binary.BigEndian.PutUint32(w[4:], 7) // Frames, Bytes, Tabelle
	binary.BigEndian.PutUint32(w[8:], uint32(frames+1))
	binary.BigEndian.PutUint32(w[12:], uint32(total))
	for i := 0; i < 100 && frames > 0; i++ {
		b := offsets[i*frames/100] - start + int64(fh.size)
		v := b * 256 / total
		if v > 255 {
			v = 255
		}
		w[16+i] = byte(v)
	}
	return out, nil
}

// ---------- Schneiden ----------

// byteAt liefert den Anfang des Frames, der zur Zeit t gehört.
func byteAt(f io.ReaderAt, a *Analysis, t float64) (int64, error) {
	i := sort.Search(len(a.Chunks), func(i int) bool { return a.Chunks[i].T1 > t })
	if i >= len(a.Chunks) {
		return a.Chunks[len(a.Chunks)-1].End, nil
	}
	c := a.Chunks[i]
	if t <= c.T0 {
		return c.Byte, nil
	}
	pos, cur := c.Byte, c.T0
	hb := make([]byte, 4)
	for pos < c.End {
		if _, err := f.ReadAt(hb, pos); err != nil {
			return pos, err
		}
		h, ok := parseHdr(hb)
		if !ok {
			pos++
			continue
		}
		next := cur + float64(h.samples)/float64(h.rate)
		if next > t {
			return pos, nil
		}
		cur = next
		pos += int64(h.size)
	}
	return pos, nil
}

func partRanges(f io.ReaderAt, a *Analysis, cuts []float64) ([][2]int64, error) {
	sort.Float64s(cuts)
	first := a.Start
	if len(a.Chunks) > 0 {
		first = a.Chunks[0].Byte
	}
	last := a.Chunks[len(a.Chunks)-1].End
	out := [][2]int64{}
	prev := first
	for _, t := range cuts {
		b, err := byteAt(f, a, t)
		if err != nil {
			return nil, err
		}
		if b > prev {
			out = append(out, [2]int64{prev, b})
			prev = b
		}
	}
	return append(out, [2]int64{prev, last}), nil
}

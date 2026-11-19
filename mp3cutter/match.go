package main

// Songs in der Aufnahme wiederfinden: Jede Spotify-Hörprobe wird als Tonfolge über die ganze Aufnahme geschoben.
// Die Hörproben werden nur verglichen und nicht gespeichert.

import (
	"encoding/binary"
	"errors"
	"io"
	"math"
	"math/bits"
	"net/http"
	"net/url"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/hajimehoshi/go-mp3"
)

const fpWin = 1024

var (
	fpHann []float64
	fpOnce sync.Once
)

// fingerprint berechnet alle 100 ms 15 Bit: In welchen benachbarten Tonbereichen wird es lauter oder leiser?
// Das ist robust gegen andere MP3-Qualität und Lautstärke, passt aber nur auf genau dieselbe Aufnahme.
func fingerprint(low []float64, rate float64) []uint16 {
	fpOnce.Do(func() {
		fpHann = make([]float64, fpWin)
		for i := range fpHann {
			fpHann[i] = 0.5 - 0.5*math.Cos(2*math.Pi*float64(i)/fpWin)
		}
	})
	hop := int(rate / 10)
	if hop < 1 || len(low) < fpWin {
		return nil
	}
	n := len(low) / hop
	out := make([]uint16, n)
	const bands = 16
	edges := make([]int, bands+1)
	for b := range edges {
		f := 200 * math.Pow(4000.0/200, float64(b)/bands)
		edges[b] = int(f * fpWin / rate)
	}
	buf := make([]complex128, fpWin)
	var prev [bands]float64
	for t := 0; t < n; t++ {
		s := t * hop
		var e [bands]float64
		if s+fpWin <= len(low) {
			for i := 0; i < fpWin; i++ {
				buf[i] = complex(low[s+i]*fpHann[i], 0)
			}
			fft(buf)
			for b := 0; b < bands; b++ {
				sum := 1e-12
				for k := edges[b]; k < edges[b+1]; k++ {
					re, im := real(buf[k]), imag(buf[k])
					sum += re*re + im*im
				}
				e[b] = math.Log(sum)
			}
		}
		var v uint16
		for b := 0; b+1 < bands; b++ {
			if (e[b]-e[b+1])-(prev[b]-prev[b+1]) > 0 {
				v |= 1 << b
			}
		}
		out[t] = v
		prev = e
	}
	return out
}

// previewVariants berechnet den Fingerabdruck der Hörprobe viermal, jeweils um 25 ms versetzt, passend zum 100-ms-Raster.
func previewVariants(r io.Reader) ([][]uint16, error) {
	dec, err := mp3.NewDecoder(r)
	if err != nil {
		return nil, err
	}
	pcm, err := io.ReadAll(dec)
	if err != nil && len(pcm) == 0 {
		return nil, err
	}
	rate := int(dec.SampleRate())
	d := rate / 11025
	if d < 1 {
		d = 1
	}
	n := len(pcm) / 4 / d
	if n < 11025*5 {
		return nil, errors.New("Hörprobe zu kurz")
	}
	low := make([]float64, n)
	for i := range low {
		s := 0.0
		for j := 0; j < d; j++ {
			p := (i*d + j) * 4
			l := int16(binary.LittleEndian.Uint16(pcm[p:]))
			r := int16(binary.LittleEndian.Uint16(pcm[p+2:]))
			s += (float64(l) + float64(r)) / 65536
		}
		low[i] = s / float64(d)
	}
	lr := float64(rate) / float64(d)
	out := [][]uint16{}
	for v := 0; v < 4; v++ {
		o := int(lr * 0.025 * float64(v))
		out = append(out, fingerprint(low[o:], lr))
	}
	return out, nil
}

// locate schiebt die Hörprobe über die Aufnahme. Ergebnis: Stelle in Sekunden und Anteil falscher Bits (0,5 = Zufall).
func locate(rec []uint16, vars [][]uint16) (at, ber float64) {
	best, bestAt := math.MaxInt32, 0
	bestN := 1
	for _, p := range vars {
		if len(p) < 50 || len(rec) <= len(p) {
			continue
		}
		start := 2 // die erste Differenz hat keinen Vorgänger
		for o := 0; o+len(p) <= len(rec); o++ {
			d, n := 0, 0
			for i := start; i < len(p); i += 3 {
				d += bits.OnesCount16(rec[o+i] ^ p[i])
				n += 15
				if d*bestN > best*n+2000*bestN { // aussichtslos: früh aufhören
					break
				}
			}
			if d*bestN < best*n {
				best, bestN, bestAt = d, n, o
			}
		}
	}
	if best == math.MaxInt32 {
		return 0, 0.5
	}
	return float64(bestAt) / 10, float64(best) / float64(bestN)
}

const maxMatchBER = 0.37

type previewFetch func(t Track) (io.ReadCloser, error)

func httpPreview(t Track) (io.ReadCloser, error) {
	u, err := url.Parse(t.Preview)
	if err != nil || u.Scheme != "https" || !strings.HasSuffix(u.Host, ".scdn.co") {
		return nil, errors.New("keine Spotify-Hörprobe")
	}
	c := http.Client{Timeout: 25 * time.Second}
	resp, err := c.Get(t.Preview)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return nil, errors.New("Hörprobe nicht verfügbar")
	}
	return resp.Body, nil
}

// matchTracks trägt bei allen Titeln die Fundstelle ein.
func matchTracks(a *Analysis, tracks []Track, fetch previewFetch) (found int) {
	if len(a.Fp) == 0 || len(a.Fp) > 4_000_000 {
		return 0 // ältere Analyse oder extrem lange Aufnahme
	}
	var wg sync.WaitGroup
	sem := make(chan struct{}, max(2, runtime.NumCPU()/2))
	for i := range tracks {
		tracks[i].Anchor, tracks[i].Score = 0, 0
		if tracks[i].Preview == "" {
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			r, err := fetch(tracks[i])
			if err != nil {
				return
			}
			defer r.Close()
			vars, err := previewVariants(io.LimitReader(r, 8<<20))
			if err != nil {
				return
			}
			at, ber := locate(a.Fp, vars)
			tracks[i].Score = 1 - ber
			if ber <= maxMatchBER {
				tracks[i].Anchor = at + 0.001
			}
		}(i)
	}
	wg.Wait()
	for _, t := range tracks {
		if t.Anchor > 0 {
			found++
		}
	}
	return found
}

// orderByAnchors sortiert die Titel nach ihrer Fundstelle. Titel ohne Fund bleiben hinter ihrem Vorgänger aus der Liste.
func orderByAnchors(tracks []Track) []Track {
	type item struct {
		t   Track
		key float64
		pos int
	}
	items := make([]item, len(tracks))
	last := 0.0
	for i, t := range tracks {
		k := last + 0.0001
		if t.Anchor > 0 {
			k = t.Anchor
			last = k
		} else {
			last = k
		}
		items[i] = item{t, k, i}
	}
	sort.SliceStable(items, func(a, b int) bool { return items[a].key < items[b].key })
	out := make([]Track, len(items))
	for i, it := range items {
		out[i] = it.t
	}
	return out
}

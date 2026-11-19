package upscale

import (
	"bufio"
	"errors"
	"compress/zlib"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"math"
	"runtime"
	"sync"
)

// Skaliert in Streifen: Das Ergebnis liegt nie ganz im Speicher. Dadurch gibt es keine Obergrenze
// für die Ausgabegröße, nur die Quelle muss in den Arbeitsspeicher passen.

var errTooBigJPEG = errors.New("JPEG erlaubt höchstens 65535 Pixel pro Seite. Wähle PNG für größere Ergebnisse.")

type tap struct {
	start int
	w     []float32
}

// RowSource liefert Zeilen als NRGBA-Bytes. Row muss gleichzeitig aufrufbar sein.
type RowSource interface {
	Size() (int, int)
	Row(y int) []uint8
}

type nrgbaSource struct{ img *image.NRGBA }

func (n nrgbaSource) Size() (int, int) { return n.img.Bounds().Dx(), n.img.Bounds().Dy() }
func (n nrgbaSource) Row(y int) []uint8 {
	w := n.img.Bounds().Dx()
	return n.img.Pix[y*n.img.Stride : y*n.img.Stride+w*4]
}

func lanczos3(x float64) float64 {
	x = math.Abs(x)
	if x < 1e-9 {
		return 1
	}
	if x >= 3 {
		return 0
	}
	px := math.Pi * x
	return 3 * math.Sin(px) * math.Sin(px/3) / (px * px)
}

func makeTaps(outN, srcN int, scale float64) []tap {
	t := make([]tap, outN)
	support, stretch := 3.0, 1.0
	if scale < 1 { // verkleinern: Filter verbreitern, sonst flimmert es
		stretch = 1 / scale
		support *= stretch
	}
	n := int(math.Ceil(support))*2 + 1
	for o := range t {
		c := (float64(o)+0.5)/scale - 0.5
		f := int(math.Floor(c)) - n/2 + 1
		w := make([]float64, n)
		var sum float64
		for k := 0; k < n; k++ {
			w[k] = lanczos3((c - float64(f+k)) / stretch)
			sum += w[k]
		}
		t[o].start = f
		t[o].w = make([]float32, n)
		for k := 0; k < n; k++ {
			t[o].w[k] = float32(w[k] / sum)
		}
	}
	return t
}

func clampi(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

type Scaler struct {
	src            RowSource
	srcW, srcH     int
	OutW, OutH     int
	hx, vy         []tap
	sharp          float32
	strip          int
	y0             int // erste Zeile des Zwischenspeichers
	buf            []uint8
	opaque         bool
	Progress       func(done float64)
}

func NewScaler(src *image.NRGBA, factor float64, sharp float64) *Scaler {
	s := NewScalerFrom(nrgbaSource{src}, factor, sharp, false)
	s.opaque = isOpaque(src)
	return s
}

func isOpaque(src *image.NRGBA) bool {
	for i := 3; i < len(src.Pix); i += 4 {
		if src.Pix[i] != 255 {
			return false
		}
	}
	return true
}

func NewScalerFrom(src RowSource, factor float64, sharp float64, opaque bool) *Scaler {
	w, h := src.Size()
	s := &Scaler{src: src, srcW: w, srcH: h, sharp: float32(sharp), opaque: opaque}
	s.OutW = max(1, int(math.Round(float64(w)*factor)))
	s.OutH = max(1, int(math.Round(float64(h)*factor)))
	s.hx = makeTaps(s.OutW, w, float64(s.OutW)/float64(w))
	s.vy = makeTaps(s.OutH, h, float64(s.OutH)/float64(h))
	s.strip = clampi(8_000_000/(s.OutW*4), 8, 64)
	s.y0 = -1
	return s
}

func (s *Scaler) hrow(y int) []float32 {
	w := s.srcW
	y = clampi(y, 0, s.srcH-1)
	out := make([]float32, s.OutW*4)
	row := s.src.Row(y)
	pm := make([]float32, w*4)
	for x := 0; x < w; x++ {
		a := float32(row[x*4+3]) / 255
		pm[x*4] = float32(row[x*4]) * a
		pm[x*4+1] = float32(row[x*4+1]) * a
		pm[x*4+2] = float32(row[x*4+2]) * a
		pm[x*4+3] = float32(row[x*4+3])
	}
	for o := 0; o < s.OutW; o++ {
		t := &s.hx[o]
		var r, g, bl, a float32
		for k, wt := range t.w {
			i := clampi(t.start+k, 0, w-1) * 4
			r += pm[i] * wt
			g += pm[i+1] * wt
			bl += pm[i+2] * wt
			a += pm[i+3] * wt
		}
		out[o*4], out[o*4+1], out[o*4+2], out[o*4+3] = r, g, bl, a
	}
	return out
}

// fill berechnet die Zeilen y0 bis y0+n-1 des Ergebnisses.
func (s *Scaler) fill(y0 int) {
	n := s.strip
	if y0+n > s.OutH {
		n = s.OutH - y0
	}
	lo, hi := s.OutH, -1
	for y := y0 - 1; y <= y0+n; y++ {
		t := s.vy[clampi(y, 0, s.OutH-1)]
		if t.start < lo {
			lo = t.start
		}
		if t.start+len(t.w)-1 > hi {
			hi = t.start + len(t.w) - 1
		}
	}
	srcH := s.srcH
	lo, hi = clampi(lo, 0, srcH-1), clampi(hi, 0, srcH-1)
	// horizontale Zeilen parallel berechnen
	rows := make([][]float32, hi-lo+1)
	var wg sync.WaitGroup
	sem := make(chan struct{}, runtime.NumCPU())
	for y := lo; y <= hi; y++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(y int) {
			defer wg.Done()
			rows[y-lo] = s.hrow(y)
			<-sem
		}(y)
	}
	wg.Wait()
	// vertikal: n+2 Zeilen (je eine Reserve oben und unten für die Schärfung)
	W := s.OutW
	tmp := make([][]float32, n+2)
	for i := range tmp {
		tmp[i] = make([]float32, W*4)
	}
	for i := 0; i < n+2; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int) {
			defer wg.Done()
			t := s.vy[clampi(y0-1+i, 0, s.OutH-1)]
			dst := tmp[i]
			for k, wt := range t.w {
				r := rows[clampi(t.start+k, lo, hi)-lo]
				for x := 0; x < W*4; x++ {
					dst[x] += r[x] * wt
				}
			}
			<-sem
		}(i)
	}
	wg.Wait()
	if len(s.buf) < n*W*4 {
		s.buf = make([]uint8, s.strip*W*4)
	}
	for j := 0; j < n; j++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(j int) {
			defer wg.Done()
			a, c, b := tmp[j], tmp[j+1], tmp[j+2]
			out := s.buf[j*W*4 : (j+1)*W*4]
			for x := 0; x < W; x++ {
				xl, xr := clampi(x-1, 0, W-1)*4, clampi(x+1, 0, W-1)*4
				al := c[x*4+3]
				var v [3]float32
				for ch := 0; ch < 3; ch++ {
					cc := c[x*4+ch]
					if s.sharp > 0 {
						blur := (a[xl+ch] + 2*a[x*4+ch] + a[xr+ch] + 2*c[xl+ch] + 4*cc + 2*c[xr+ch] + b[xl+ch] + 2*b[x*4+ch] + b[xr+ch]) / 16
						cc += s.sharp * (cc - blur)
					}
					v[ch] = cc
				}
				if al < 0 {
					al = 0
				}
				if al > 255 {
					al = 255
				}
				if al > 0.5 {
					k := 255 / al
					for ch := 0; ch < 3; ch++ {
						v[ch] *= k
					}
				}
				for ch := 0; ch < 3; ch++ {
					p := v[ch]
					if p < 0 {
						p = 0
					} else if p > 255 {
						p = 255
					}
					out[x*4+ch] = uint8(p + 0.5)
				}
				out[x*4+3] = uint8(al + 0.5)
			}
			<-sem
		}(j)
	}
	wg.Wait()
	s.y0 = y0
	if s.Progress != nil {
		s.Progress(float64(y0+n) / float64(s.OutH))
	}
}

func (s *Scaler) Size() (int, int) { return s.OutW, s.OutH }
func (s *Scaler) Opaque() bool      { return s.opaque }
func (s *Scaler) Row(y int) []uint8 { return s.row(y) }

func (s *Scaler) row(y int) []uint8 {
	if s.y0 < 0 || y < s.y0 || y >= s.y0+s.strip {
		s.fill(y / s.strip * s.strip)
	}
	i := (y - s.y0) * s.OutW * 4
	return s.buf[i : i+s.OutW*4]
}

// Bildschnittstelle für den JPEG-Encoder (liest zeilenweise von oben nach unten).
func (s *Scaler) ColorModel() color.Model { return color.NRGBAModel }
func (s *Scaler) Bounds() image.Rectangle { return image.Rect(0, 0, s.OutW, s.OutH) }
func (s *Scaler) At(x, y int) color.Color {
	r := s.row(y)[x*4:]
	return color.NRGBA{r[0], r[1], r[2], r[3]}
}

// RowImage ist alles, was Zeile für Zeile von oben nach unten ein Bild liefert.
type RowImage interface {
	Size() (int, int)
	Row(y int) []uint8
	Opaque() bool
}

func WriteJPEG(ri RowImage, w io.Writer, q int) error {
	W, H := ri.Size()
	if W > 65500 || H > 65500 {
		return errTooBigJPEG
	}
	return jpeg.Encode(w, &opaqueView{ri}, &jpeg.Options{Quality: q})
}

// opaqueView blendet Transparenz auf Weiß, weil JPEG keinen Alphakanal kennt.
type opaqueView struct{ s RowImage }

func (o *opaqueView) ColorModel() color.Model { return color.RGBAModel }
func (o *opaqueView) Bounds() image.Rectangle { w, h := o.s.Size(); return image.Rect(0, 0, w, h) }
func (o *opaqueView) At(x, y int) color.Color {
	p := o.s.Row(y)[x*4:]
	a := uint32(p[3])
	f := func(c uint8) uint8 { return uint8((uint32(c)*a + 255*(255-a)) / 255) }
	return color.RGBA{f(p[0]), f(p[1]), f(p[2]), 255}
}

type chunkWriter struct {
	w   io.Writer
	buf []byte
}

func writeChunk(w io.Writer, typ string, data []byte) error {
	var h [8]byte
	binary.BigEndian.PutUint32(h[:4], uint32(len(data)))
	copy(h[4:], typ)
	if _, err := w.Write(h[:]); err != nil {
		return err
	}
	if _, err := w.Write(data); err != nil {
		return err
	}
	c := crc32.NewIEEE()
	c.Write(h[4:])
	c.Write(data)
	var t [4]byte
	binary.BigEndian.PutUint32(t[:], c.Sum32())
	_, err := w.Write(t[:])
	return err
}

func (c *chunkWriter) Write(p []byte) (int, error) {
	c.buf = append(c.buf, p...)
	for len(c.buf) >= 1<<20 {
		if err := writeChunk(c.w, "IDAT", c.buf[:1<<20]); err != nil {
			return 0, err
		}
		c.buf = c.buf[1<<20:]
	}
	return len(p), nil
}

// WritePNG schreibt Zeile für Zeile, ohne das Ergebnis im Speicher zu halten.
func WritePNG(ri RowImage, w io.Writer) error {
	W, H := ri.Size()
	opaque := ri.Opaque()
	bw := bufio.NewWriterSize(w, 1<<20)
	bw.Write([]byte("\x89PNG\r\n\x1a\n"))
	var ih [13]byte
	binary.BigEndian.PutUint32(ih[0:], uint32(W))
	binary.BigEndian.PutUint32(ih[4:], uint32(H))
	ih[8] = 8
	if opaque {
		ih[9] = 2 // RGB
	} else {
		ih[9] = 6 // RGBA
	}
	if err := writeChunk(bw, "IHDR", ih[:]); err != nil {
		return err
	}
	cw := &chunkWriter{w: bw}
	zw, _ := zlib.NewWriterLevel(cw, 3)
	var line []byte
	bpp := 4
	if opaque {
		bpp = 3
	}
	line = make([]byte, 1+W*bpp)
	for y := 0; y < H; y++ {
		r := ri.Row(y)
		if opaque {
			for x := 0; x < W; x++ {
				line[1+x*3], line[2+x*3], line[3+x*3] = r[x*4], r[x*4+1], r[x*4+2]
			}
		} else {
			copy(line[1:], r)
		}
		if _, err := zw.Write(line); err != nil {
			return err
		}
	}
	if err := zw.Close(); err != nil {
		return err
	}
	if len(cw.buf) > 0 {
		if err := writeChunk(bw, "IDAT", cw.buf); err != nil {
			return err
		}
	}
	if err := writeChunk(bw, "IEND", nil); err != nil {
		return err
	}
	return bw.Flush()
}

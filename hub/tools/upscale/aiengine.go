package upscale

import (
	"errors"
	"image"
	"math"
	"os"

	"kit/ort"
)

// aiRows vergrößert mit dem KI-Modell um genau ×4. Es rechnet in Kacheln mit Überlappung
// und liefert das Ergebnis Zeile für Zeile, ein Band nach dem anderen.
type aiRows struct {
	src      *image.NRGBA
	w, h     int
	sess     *ort.Session
	F, T, P  int // Kachelgröße am Modell, nutzbarer Kern, Rand
	nhwc     bool
	opaque   bool
	band     []uint8
	bandY    int // erste Ausgabezeile im Band
	bandH    int
	in       []float32
	err      error
	Progress func(float64)
}

func newAIRows(src *image.NRGBA, sess *ort.Session) (*aiRows, error) {
	if len(sess.In) == 0 || len(sess.Out) == 0 {
		return nil, errors.New("Das KI-Modell hat keine passenden Ein- und Ausgänge.")
	}
	a := &aiRows{src: src, w: src.Bounds().Dx(), h: src.Bounds().Dy(), sess: sess, bandY: -1, opaque: isOpaque(src)}
	d := sess.In[0].Dims
	if len(d) != 4 {
		return nil, errors.New("Unerwartete Form des KI-Modells.")
	}
	a.P = 12
	a.F = 224
	switch {
	case d[1] == 3 && d[2] > 0: // NCHW mit fester Größe
		a.F = int(d[2])
	case d[3] == 3 && d[1] > 0: // NHWC mit fester Größe
		a.F, a.nhwc = int(d[1]), true
	case d[3] == 3:
		a.nhwc = true
	}
	if a.F <= 2*a.P+16 {
		a.P = a.F / 8
	}
	a.T = a.F - 2*a.P
	a.in = make([]float32, 3*a.F*a.F)
	return a, nil
}

func (a *aiRows) Size() (int, int) { return a.w * 4, a.h * 4 }
func (a *aiRows) Opaque() bool      { return a.opaque }

func (a *aiRows) Row(y int) []uint8 {
	W := a.w * 4
	if a.bandY < 0 || y < a.bandY || y >= a.bandY+a.bandH {
		a.compute(y / (4 * a.T))
	}
	i := (y - a.bandY) * W * 4
	return a.band[i : i+W*4]
}

func (a *aiRows) compute(bi int) {
	W := a.w * 4
	y0 := bi * a.T
	th := min(a.T, a.h-y0)
	a.bandY, a.bandH = y0*4, th*4
	if len(a.band) < a.bandH*W*4 {
		a.band = make([]uint8, 4*a.T*W*4)
	}
	if a.err != nil {
		return
	}
	F, P := a.F, a.P
	for x0 := 0; x0 < a.w; x0 += a.T {
		tw := min(a.T, a.w-x0)
		// Kachel füllen, am Rand wird die letzte Zeile/Spalte wiederholt
		for iy := 0; iy < F; iy++ {
			sy := clampi(y0-P+iy, 0, a.h-1)
			row := a.src.Pix[sy*a.src.Stride:]
			for ix := 0; ix < F; ix++ {
				sx := clampi(x0-P+ix, 0, a.w-1) * 4
				r, g, b := float32(row[sx])/255, float32(row[sx+1])/255, float32(row[sx+2])/255
				if a.nhwc {
					o := (iy*F + ix) * 3
					a.in[o], a.in[o+1], a.in[o+2] = r, g, b
				} else {
					o := iy*F + ix
					a.in[o], a.in[F*F+o], a.in[2*F*F+o] = r, g, b
				}
			}
		}
		shape := []int64{1, 3, int64(F), int64(F)}
		if a.nhwc {
			shape = []int64{1, int64(F), int64(F), 3}
		}
		out, dims, err := a.sess.Run(a.in, shape)
		if err != nil {
			a.err = err
			return
		}
		var OF int
		nhwcOut := len(dims) == 4 && dims[3] == 3
		if nhwcOut {
			OF = int(dims[2])
		} else if len(dims) == 4 {
			OF = int(dims[3])
		}
		if OF != 4*F {
			a.err = errors.New("Das KI-Modell vergrößert nicht um ×4.")
			return
		}
		plane := OF * OF
		for oy := 0; oy < th*4; oy++ {
			dst := a.band[oy*W*4:]
			for ox := 0; ox < tw*4; ox++ {
				sy, sx := 4*P+oy, 4*P+ox
				var r, g, b float32
				if nhwcOut {
					o := (sy*OF + sx) * 3
					r, g, b = out[o], out[o+1], out[o+2]
				} else {
					o := sy*OF + sx
					r, g, b = out[o], out[plane+o], out[2*plane+o]
				}
				d := ((x0*4 + ox) * 4)
				dst[d], dst[d+1], dst[d+2] = to8(r), to8(g), to8(b)
				dst[d+3] = 255
			}
		}
	}
	if !a.opaque { // Transparenz weich mitvergrößern
		for oy := 0; oy < th*4; oy++ {
			fy := (float64(a.bandY+oy)+0.5)/4 - 0.5
			y1 := int(math.Floor(fy))
			wy := fy - float64(y1)
			ya, yb := clampi(y1, 0, a.h-1), clampi(y1+1, 0, a.h-1)
			dst := a.band[oy*W*4:]
			for ox := 0; ox < W; ox++ {
				fx := (float64(ox)+0.5)/4 - 0.5
				x1 := int(math.Floor(fx))
				wx := fx - float64(x1)
				xa, xb := clampi(x1, 0, a.w-1), clampi(x1+1, 0, a.w-1)
				al := func(x, y int) float64 { return float64(a.src.Pix[y*a.src.Stride+x*4+3]) }
				v := (al(xa, ya)*(1-wx)+al(xb, ya)*wx)*(1-wy) + (al(xa, yb)*(1-wx)+al(xb, yb)*wx)*wy
				dst[ox*4+3] = uint8(v + 0.5)
			}
		}
	}
	if a.Progress != nil {
		a.Progress(float64(y0+th) / float64(a.h))
	}
}

func to8(v float32) uint8 {
	if v <= 0 {
		return 0
	}
	if v >= 1 {
		return 255
	}
	return uint8(v*255 + 0.5)
}

// toImage sammelt ein Zeilenbild im Speicher (nur für kleine Vorschauen).
func toImage(ri RowImage) *image.NRGBA {
	w, h := ri.Size()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		copy(img.Pix[y*img.Stride:], ri.Row(y))
	}
	return img
}

// fileRows liest ein zwischengespeichertes Rohbild (NRGBA) von der Platte.
type fileRows struct {
	f    *os.File
	w, h int
}

func (f *fileRows) Size() (int, int) { return f.w, f.h }
func (f *fileRows) Row(y int) []uint8 {
	b := make([]uint8, f.w*4)
	f.f.ReadAt(b, int64(y)*int64(f.w)*4)
	return b
}

// spool schreibt ein Zeilenbild als Rohdaten in eine temporäre Datei.
func spool(ri RowImage, path string) (*fileRows, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	w, h := ri.Size()
	buf := make([]byte, 0, 8<<20)
	for y := 0; y < h; y++ {
		buf = append(buf, ri.Row(y)...)
		if len(buf) > 7<<20 || y == h-1 {
			if _, err := f.Write(buf); err != nil {
				f.Close()
				os.Remove(path)
				return nil, err
			}
			buf = buf[:0]
		}
	}
	return &fileRows{f: f, w: w, h: h}, nil
}

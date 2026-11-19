package cutout

import (
	"errors"
	"image"
	"math"
	"runtime"
	"sync"

	"kit/ort"
)

// Freistellen in vier Schritten:
//  1. Die KI (IS-Net) sucht das Motiv im ganzen Bild.
//  2. Ist das Motiv klein, rechnet die KI ein zweites Mal nur auf dem Ausschnitt – das gibt viel feinere Kanten.
//  3. Ein kantentreuer Filter (Guided Filter) passt den Rand der Maske an das echte Bild an (Haare, Fell).
//  4. Beim Ergebnis werden die Farben am Rand vom alten Hintergrund befreit (kein heller oder farbiger Saum).

const netSize = 1024

// plane ist ein Bild als float32, ch Kanäle ineinander.
type plane struct {
	w, h, ch int
	p        []float32
}

func newPlane(w, h, ch int) *plane { return &plane{w, h, ch, make([]float32, w*h*ch)} }

// par teilt die Zeilen 0..n auf alle Prozessorkerne auf.
func par(n int, f func(y0, y1 int)) {
	k := min(runtime.NumCPU(), 16)
	if k < 2 || n < 64 {
		f(0, n)
		return
	}
	var wg sync.WaitGroup
	for i := 0; i < k; i++ {
		y0, y1 := n*i/k, n*(i+1)/k
		if y0 == y1 {
			continue
		}
		wg.Add(1)
		go func() { defer wg.Done(); f(y0, y1) }()
	}
	wg.Wait()
}

// rgbPlane: NRGBA -> float 0..1 (RGB). Durchsichtige Stellen werden weiß hinterlegt.
func rgbPlane(img *image.NRGBA) *plane {
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	o := newPlane(w, h, 3)
	par(h, func(y0, y1 int) {
		for y := y0; y < y1; y++ {
			s := img.Pix[y*img.Stride:]
			d := o.p[y*w*3:]
			for x := 0; x < w; x++ {
				a := float32(s[x*4+3]) / 255
				for c := 0; c < 3; c++ {
					d[x*3+c] = (float32(s[x*4+c])*a + 255*(1-a)) / 255
				}
			}
		}
	})
	return o
}

// resize: beim Verkleinern Flächenmittel, beim Vergrößern bilinear. Ausschnitt (x0,y0,sw,sh) der Quelle -> dw × dh.
func resize(s *plane, x0, y0, sw, sh, dw, dh int) *plane {
	o := newPlane(dw, dh, s.ch)
	ch := s.ch
	fx, fy := float64(sw)/float64(dw), float64(sh)/float64(dh)
	par(dh, func(a, b int) {
		acc := make([]float64, ch)
		for y := a; y < b; y++ {
			for x := 0; x < dw; x++ {
				d := o.p[(y*dw+x)*ch:]
				if fx > 1 || fy > 1 { // Fläche mitteln
					xa, xb := int(float64(x)*fx), int(math.Ceil(float64(x+1)*fx))
					ya, yb := int(float64(y)*fy), int(math.Ceil(float64(y+1)*fy))
					xb, yb = min(max(xb, xa+1), sw), min(max(yb, ya+1), sh)
					for c := range acc {
						acc[c] = 0
					}
					for yy := ya; yy < yb; yy++ {
						row := s.p[((y0+yy)*s.w+x0+xa)*ch:]
						for xx := 0; xx < (xb-xa)*ch; xx += ch {
							for c := 0; c < ch; c++ {
								acc[c] += float64(row[xx+c])
							}
						}
					}
					n := float64((xb - xa) * (yb - ya))
					for c := 0; c < ch; c++ {
						d[c] = float32(acc[c] / n)
					}
					continue
				}
				sx := (float64(x)+.5)*fx - .5
				sy := (float64(y)+.5)*fy - .5
				ix, iy := int(math.Floor(sx)), int(math.Floor(sy))
				tx, ty := float32(sx-float64(ix)), float32(sy-float64(iy))
				xa, xb := min(max(ix, 0), sw-1), min(max(ix+1, 0), sw-1)
				ya, yb := min(max(iy, 0), sh-1), min(max(iy+1, 0), sh-1)
				p00 := s.p[((y0+ya)*s.w+x0+xa)*ch:]
				p10 := s.p[((y0+ya)*s.w+x0+xb)*ch:]
				p01 := s.p[((y0+yb)*s.w+x0+xa)*ch:]
				p11 := s.p[((y0+yb)*s.w+x0+xb)*ch:]
				for c := 0; c < ch; c++ {
					d[c] = (p00[c]*(1-tx)+p10[c]*tx)*(1-ty) + (p01[c]*(1-tx)+p11[c]*tx)*ty
				}
			}
		}
	})
	return o
}

// box: Mittelwert über ein Quadrat mit Radius r (Rand gespiegelt gehalten), in zwei Durchgängen.
func box(s *plane, r int) *plane {
	if r < 1 {
		c := *s
		c.p = append([]float32(nil), s.p...)
		return &c
	}
	w, h, ch := s.w, s.h, s.ch
	t := newPlane(w, h, ch)
	n := float32(2*r + 1)
	par(h, func(a, b int) {
		for y := a; y < b; y++ {
			row := s.p[y*w*ch : (y+1)*w*ch]
			out := t.p[y*w*ch:]
			for c := 0; c < ch; c++ {
				var sum float32
				for i := -r; i <= r; i++ {
					sum += row[min(max(i, 0), w-1)*ch+c]
				}
				for x := 0; x < w; x++ {
					out[x*ch+c] = sum / n
					sum += row[min(x+r+1, w-1)*ch+c] - row[max(x-r, 0)*ch+c]
				}
			}
		}
	})
	o := newPlane(w, h, ch)
	par(w, func(a, b int) {
		for x := a; x < b; x++ {
			for c := 0; c < ch; c++ {
				var sum float32
				for i := -r; i <= r; i++ {
					sum += t.p[(min(max(i, 0), h-1)*w+x)*ch+c]
				}
				for y := 0; y < h; y++ {
					o.p[(y*w+x)*ch+c] = sum / n
					sum += t.p[(min(y+r+1, h-1)*w+x)*ch+c] - t.p[(max(y-r, 0)*w+x)*ch+c]
				}
			}
		}
	})
	return o
}

// runNet lässt die KI auf einem Ausschnitt rechnen und liefert die Maske in Größe netSize².
func runNet(sess *ort.Session, img *plane, x0, y0, w, h int) ([]float32, error) {
	in := resize(img, x0, y0, w, h, netSize, netSize)
	n := netSize * netSize
	data := make([]float32, 3*n)
	for i := 0; i < n; i++ { // NCHW, Werte -0,5..0,5
		data[i] = in.p[i*3] - .5
		data[n+i] = in.p[i*3+1] - .5
		data[2*n+i] = in.p[i*3+2] - .5
	}
	out, _, err := sess.Run(data, []int64{1, 3, netSize, netSize})
	if err != nil {
		return nil, err
	}
	if len(out) < n {
		return nil, errors.New("Die KI hat ein unerwartetes Ergebnis geliefert.")
	}
	out = out[:n]
	lo, hi := float32(math.MaxFloat32), float32(-math.MaxFloat32)
	for _, v := range out {
		lo, hi = min(lo, v), max(hi, v)
	}
	if hi-lo < 1e-6 {
		hi = lo + 1
	}
	for i, v := range out {
		out[i] = (v - lo) / (hi - lo)
	}
	return out, nil
}

// bbox: Rechteck um alles, was die Maske als Motiv sieht (mit Rand).
func bbox(m *plane, th float32) (x0, y0, x1, y1 int, ok bool) {
	x0, y0, x1, y1 = m.w, m.h, -1, -1
	for y := 0; y < m.h; y++ {
		for x := 0; x < m.w; x++ {
			if m.p[y*m.w+x] > th {
				x0, x1 = min(x0, x), max(x1, x)
				y0, y1 = min(y0, y), max(y1, y)
			}
		}
	}
	if x1 < 0 {
		return 0, 0, 0, 0, false
	}
	mx, my := (x1-x0)*8/100+8, (y1-y0)*8/100+8
	return max(0, x0-mx), max(0, y0-my), min(m.w, x1+1+mx), min(m.h, y1+1+my), true
}

// matte berechnet die Maske (0..1) für das Bild. progress meldet 0..1.
func matte(sess *ort.Session, img *plane, progress func(float64)) (*plane, error) {
	w, h := img.w, img.h
	m1, err := runNet(sess, img, 0, 0, w, h)
	if err != nil {
		return nil, err
	}
	progress(.45)
	m := resize(&plane{netSize, netSize, 1, m1}, 0, 0, netSize, netSize, w, h)
	if x0, y0, x1, y1, ok := bbox(m, .15); ok && (x1-x0)*(y1-y0) < w*h*72/100 && x1-x0 > 24 && y1-y0 > 24 {
		m2, err := runNet(sess, img, x0, y0, x1-x0, y1-y0)
		if err != nil {
			return nil, err
		}
		fine := resize(&plane{netSize, netSize, 1, m2}, 0, 0, netSize, netSize, x1-x0, y1-y0)
		o := newPlane(w, h, 1)
		for y := y0; y < y1; y++ {
			for x := x0; x < x1; x++ {
				if m.p[y*w+x] > .02 { // außerhalb des ersten Fundes kommt nichts Neues dazu
					o.p[y*w+x] = fine.p[(y-y0)*(x1-x0)+x-x0]
				}
			}
		}
		// Feine Kanten aus dem zweiten Durchgang; was der erste sicher als Motiv erkannt hat, bleibt aber erhalten
		// (sonst gehen bei Szenen mit mehreren Dingen ganze Teile verloren).
		for i, v := range m.p {
			t := min(max((v-.75)/.2, 0), 1)
			o.p[i] = max(o.p[i], v*t*t*(3-2*t))
		}
		m = o
	}
	progress(.85)
	m = refine(img, m)
	progress(1)
	return m, nil
}

// region rechnet die KI nur auf einem Rechteck und liefert dessen Maske in voller Auflösung des Rechtecks.
func region(sess *ort.Session, img *plane, x0, y0, x1, y1 int) (*plane, error) {
	m2, err := runNet(sess, img, x0, y0, x1-x0, y1-y0)
	if err != nil {
		return nil, err
	}
	full := newPlane(img.w, img.h, 1)
	fine := resize(&plane{netSize, netSize, 1, m2}, 0, 0, netSize, netSize, x1-x0, y1-y0)
	for y := y0; y < y1; y++ {
		copy(full.p[y*img.w+x0:y*img.w+x1], fine.p[(y-y0)*(x1-x0):(y-y0+1)*(x1-x0)])
	}
	full = refine(img, full)
	o := newPlane(x1-x0, y1-y0, 1)
	for y := y0; y < y1; y++ {
		copy(o.p[(y-y0)*(x1-x0):], full.p[y*img.w+x0:y*img.w+x1])
	}
	return o, nil
}

// refine: farbiger Guided Filter (He u. a.). Nur im Übergangsbereich der Maske wird das Ergebnis übernommen,
// damit Flächen im Motiv und im Hintergrund sauber 1 bzw. 0 bleiben.
func refine(I, p *plane) *plane {
	w, h := I.w, I.h
	n := w * h
	r := max(3, max(w, h)/300)
	const eps = 1e-4
	mI := box(I, r)
	mp := box(p, r)
	Ip := newPlane(w, h, 3)
	II := newPlane(w, h, 6) // rr, rg, rb, gg, gb, bb
	par(h, func(a, b int) {
		for i := a * w; i < b*w; i++ {
			rr, g, bl, pv := I.p[i*3], I.p[i*3+1], I.p[i*3+2], p.p[i]
			Ip.p[i*3], Ip.p[i*3+1], Ip.p[i*3+2] = rr*pv, g*pv, bl*pv
			II.p[i*6], II.p[i*6+1], II.p[i*6+2] = rr*rr, rr*g, rr*bl
			II.p[i*6+3], II.p[i*6+4], II.p[i*6+5] = g*g, g*bl, bl*bl
		}
	})
	mIp := box(Ip, r)
	mII := box(II, r)
	A := newPlane(w, h, 3)
	B := newPlane(w, h, 1)
	par(h, func(a, b int) {
		for i := a * w; i < b*w; i++ {
			mr, mg, mb := float64(mI.p[i*3]), float64(mI.p[i*3+1]), float64(mI.p[i*3+2])
			pm := float64(mp.p[i])
			cr, cg, cb := float64(mIp.p[i*3])-mr*pm, float64(mIp.p[i*3+1])-mg*pm, float64(mIp.p[i*3+2])-mb*pm
			a11 := float64(mII.p[i*6]) - mr*mr + eps
			a12 := float64(mII.p[i*6+1]) - mr*mg
			a13 := float64(mII.p[i*6+2]) - mr*mb
			a22 := float64(mII.p[i*6+3]) - mg*mg + eps
			a23 := float64(mII.p[i*6+4]) - mg*mb
			a33 := float64(mII.p[i*6+5]) - mb*mb + eps
			// Inverse der symmetrischen 3×3-Matrix
			i11, i12, i13 := a22*a33-a23*a23, a13*a23-a12*a33, a12*a23-a13*a22
			i22, i23, i33 := a11*a33-a13*a13, a12*a13-a11*a23, a11*a22-a12*a12
			det := a11*i11 + a12*i12 + a13*i13
			if math.Abs(det) < 1e-18 {
				B.p[i] = float32(pm)
				continue
			}
			ar := (i11*cr + i12*cg + i13*cb) / det
			ag := (i12*cr + i22*cg + i23*cb) / det
			ab := (i13*cr + i23*cg + i33*cb) / det
			A.p[i*3], A.p[i*3+1], A.p[i*3+2] = float32(ar), float32(ag), float32(ab)
			B.p[i] = float32(pm - ar*mr - ag*mg - ab*mb)
		}
	})
	mA := box(A, r)
	mB := box(B, r)
	// Übergangsbereich etwas aufweiten
	band := newPlane(w, h, 1)
	for i := 0; i < n; i++ {
		if p.p[i] > .03 && p.p[i] < .97 {
			band.p[i] = 1
		}
	}
	band = box(band, r)
	o := newPlane(w, h, 1)
	par(h, func(a, b int) {
		for i := a * w; i < b*w; i++ {
			v := p.p[i]
			if band.p[i] > 0 {
				q := mA.p[i*3]*I.p[i*3] + mA.p[i*3+1]*I.p[i*3+1] + mA.p[i*3+2]*I.p[i*3+2] + mB.p[i]
				v = min(max(q, 0), 1)
			}
			// ganz leichte Schleier und fast volle Deckung bereinigen
			if v < .02 {
				v = 0
			} else if v > .98 {
				v = 1
			}
			o.p[i] = v
		}
	})
	return o
}

// foreground schätzt die echte Farbe des Motivs am Rand (ohne durchscheinenden alten Hintergrund).
// Verfahren: zweistufige „Blur Fusion“ (Forte u. a.), erst grob, dann fein.
func foreground(I, a *plane) *plane {
	w, h := I.w, I.h
	F := &plane{w, h, 3, append([]float32(nil), I.p...)}
	Bg := &plane{w, h, 3, append([]float32(nil), I.p...)}
	for _, r := range []int{max(12, max(w, h)/22), max(2, max(w, h)/260)} {
		ba := box(a, r)
		Fa := newPlane(w, h, 3)
		Ba := newPlane(w, h, 3)
		for i := 0; i < w*h; i++ {
			al := a.p[i]
			for c := 0; c < 3; c++ {
				Fa.p[i*3+c] = F.p[i*3+c] * al
				Ba.p[i*3+c] = Bg.p[i*3+c] * (1 - al)
			}
		}
		bF := box(Fa, r)
		bB := box(Ba, r)
		par(h, func(y0, y1 int) {
			for i := y0 * w; i < y1*w; i++ {
				al, m := a.p[i], ba.p[i]
				for c := 0; c < 3; c++ {
					f := bF.p[i*3+c] / (m + 1e-5)
					b := bB.p[i*3+c] / (1 - m + 1e-5)
					v := f + al*(I.p[i*3+c]-al*f-(1-al)*b)
					F.p[i*3+c] = min(max(v, 0), 1)
					Bg.p[i*3+c] = b
				}
			}
		})
	}
	// im sicheren Inneren bleibt das Original unangetastet
	for i := 0; i < w*h; i++ {
		if a.p[i] >= .995 {
			F.p[i*3], F.p[i*3+1], F.p[i*3+2] = I.p[i*3], I.p[i*3+1], I.p[i*3+2]
		}
	}
	return F
}

func to8(v float32) uint8 {
	if v <= 0 {
		return 0
	}
	if v >= 1 {
		return 255
	}
	return uint8(v*255 + .5)
}

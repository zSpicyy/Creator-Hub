package main

// KI in der Bildbearbeitung (offline, Modelle teilen sich alle Werkzeuge):
//   - Freistellen: Maske für Personen/Hauptmotiv (MODNet) → als Ebenenmaske, nicht zerstörend
//   - KI-Vergrößern: Real-ESRGAN ×4 (dasselbe Modell wie der Upscaler)

import (
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"math"
	"net/http"

	"kit"
	"kit/ai"
)

func (a *App) aiRoutes(mux *http.ServeMux) {
	ok := func(m string) bool { return m == "matte" || m == "upscale" }
	mux.HandleFunc("/api/ai/state", func(w http.ResponseWriter, r *http.Request) {
		m := r.URL.Query().Get("m")
		if !ok(m) {
			kit.Fail(w, 400, "Unbekanntes Modell.")
			return
		}
		kit.JSON(w, ai.Get(m))
	})
	mux.HandleFunc("/api/ai/install", func(w http.ResponseWriter, r *http.Request) {
		m := r.URL.Query().Get("m")
		if !ok(m) {
			kit.Fail(w, 400, "Unbekanntes Modell.")
			return
		}
		ai.Install(m)
		kit.JSON(w, ai.Get(m))
	})
	// POST PNG → PNG (Graustufen-Maske gleicher Größe, weiß = Motiv)
	mux.HandleFunc("/api/ai/matte", func(w http.ResponseWriter, r *http.Request) {
		src, err := png.Decode(io.LimitReader(r.Body, 400<<20))
		if err != nil {
			kit.Fail(w, 400, "Das Bild ließ sich nicht lesen.")
			return
		}
		m, err := matte(src)
		if err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		w.Header().Set("Content-Type", "image/png")
		(&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(w, m)
	})
	// POST PNG → PNG (×4)
	mux.HandleFunc("/api/ai/upscale", func(w http.ResponseWriter, r *http.Request) {
		src, err := png.Decode(io.LimitReader(r.Body, 400<<20))
		if err != nil {
			kit.Fail(w, 400, "Das Bild ließ sich nicht lesen.")
			return
		}
		b := src.Bounds()
		if b.Dx()*b.Dy() > 6_000_000 {
			kit.Fail(w, 400, "Das Bild ist für die KI-Vergrößerung zu groß (höchstens 6 Megapixel).")
			return
		}
		out, err := upscale4(src)
		if err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		w.Header().Set("Content-Type", "image/png")
		(&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(w, out)
	})
}

func toNRGBA(src image.Image) *image.NRGBA {
	if n, ok := src.(*image.NRGBA); ok && n.Rect.Min == (image.Point{}) {
		return n
	}
	b := src.Bounds()
	n := image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			n.Set(x, y, src.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return n
}

// bilinear liest einen Kanal (0..2) an einer Stelle mit Bruchteilen
func sampleRGB(s *image.NRGBA, fx, fy float64) (float32, float32, float32) {
	W, H := s.Rect.Dx(), s.Rect.Dy()
	x0, y0 := int(math.Floor(fx)), int(math.Floor(fy))
	wx, wy := fx-float64(x0), fy-float64(y0)
	cl := func(v, n int) int { return max(0, min(n-1, v)) }
	xa, xb, ya, yb := cl(x0, W), cl(x0+1, W), cl(y0, H), cl(y0+1, H)
	var out [3]float32
	for c := 0; c < 3; c++ {
		p := func(x, y int) float64 { return float64(s.Pix[y*s.Stride+x*4+c]) }
		out[c] = float32((p(xa, ya)*(1-wx)+p(xb, ya)*wx)*(1-wy) + (p(xa, yb)*(1-wx)+p(xb, yb)*wx)*wy)
	}
	return out[0], out[1], out[2]
}

func matte(src image.Image) (*image.Gray, error) {
	if !ai.Ready("matte") {
		return nil, errors.New("Das KI-Modell fehlt noch.")
	}
	s, err := ai.Acquire("matte")
	if err != nil {
		return nil, err
	}
	defer ai.Done("matte")
	n := toNRGBA(src)
	W, H := n.Rect.Dx(), n.Rect.Dy()
	if W < 2 || H < 2 {
		return nil, errors.New("Das Bild ist zu klein.")
	}
	var aw, ah int
	if W >= H {
		ah = 512
		aw = max(32, int(math.Round(512*float64(W)/float64(H)/32))*32)
	} else {
		aw = 512
		ah = max(32, int(math.Round(512*float64(H)/float64(W)/32))*32)
	}
	aw, ah = min(aw, 2048), min(ah, 2048)
	plane := aw * ah
	in := make([]float32, 3*plane)
	for y := 0; y < ah; y++ {
		fy := (float64(y)+0.5)*float64(H)/float64(ah) - 0.5
		for x := 0; x < aw; x++ {
			fx := (float64(x)+0.5)*float64(W)/float64(aw) - 0.5
			r, g, b := sampleRGB(n, fx, fy)
			i := y*aw + x
			in[i], in[plane+i], in[2*plane+i] = r/127.5-1, g/127.5-1, b/127.5-1
		}
	}
	res, _, err := s.Run(in, []int64{1, 3, int64(ah), int64(aw)})
	if err != nil {
		return nil, err
	}
	if len(res) < plane {
		return nil, errors.New("Das KI-Modell liefert ein unerwartetes Ergebnis.")
	}
	out := image.NewGray(image.Rect(0, 0, W, H))
	for y := 0; y < H; y++ {
		fy := (float64(y)+0.5)*float64(ah)/float64(H) - 0.5
		y0 := max(0, min(ah-1, int(math.Floor(fy))))
		y1 := min(ah-1, y0+1)
		wy := math.Max(0, math.Min(1, fy-float64(y0)))
		for x := 0; x < W; x++ {
			fx := (float64(x)+0.5)*float64(aw)/float64(W) - 0.5
			x0 := max(0, min(aw-1, int(math.Floor(fx))))
			x1 := min(aw-1, x0+1)
			wx := math.Max(0, math.Min(1, fx-float64(x0)))
			v := (float64(res[y0*aw+x0])*(1-wx)+float64(res[y0*aw+x1])*wx)*(1-wy) + (float64(res[y1*aw+x0])*(1-wx)+float64(res[y1*aw+x1])*wx)*wy
			// Transparente Stellen des Originals bleiben transparent
			v *= float64(n.Pix[y*n.Stride+x*4+3]) / 255
			out.Pix[y*out.Stride+x] = uint8(math.Max(0, math.Min(255, v*255+0.5)))
		}
	}
	return out, nil
}

// upscale4: KI-Vergrößerung ×4 in Kacheln mit Rand (keine sichtbaren Nähte)
func upscale4(src image.Image) (*image.NRGBA, error) {
	if !ai.Ready("upscale") {
		return nil, errors.New("Das KI-Modell fehlt noch.")
	}
	s, err := ai.Acquire("upscale")
	if err != nil {
		return nil, err
	}
	defer ai.Done("upscale")
	n := toNRGBA(src)
	W, H := n.Rect.Dx(), n.Rect.Dy()
	if len(s.In) == 0 || len(s.In[0].Dims) != 4 {
		return nil, errors.New("Unerwartete Form des KI-Modells.")
	}
	d := s.In[0].Dims
	F, P, nhwc := 192, 12, false
	switch {
	case d[1] == 3 && d[2] > 0:
		F = int(d[2])
	case d[3] == 3 && d[1] > 0:
		F, nhwc = int(d[1]), true
	case d[3] == 3:
		nhwc = true
	}
	if F <= 2*P+16 {
		P = F / 8
	}
	T := F - 2*P
	out := image.NewNRGBA(image.Rect(0, 0, W*4, H*4))
	in := make([]float32, 3*F*F)
	cl := func(v, n int) int { return max(0, min(n-1, v)) }
	to8 := func(v float32) uint8 { return uint8(math.Max(0, math.Min(255, float64(v)*255+0.5))) }
	for y0 := 0; y0 < H; y0 += T {
		th := min(T, H-y0)
		for x0 := 0; x0 < W; x0 += T {
			tw := min(T, W-x0)
			for iy := 0; iy < F; iy++ {
				sy := cl(y0-P+iy, H)
				for ix := 0; ix < F; ix++ {
					sx := cl(x0-P+ix, W)
					o := sy*n.Stride + sx*4
					r, g, b := float32(n.Pix[o])/255, float32(n.Pix[o+1])/255, float32(n.Pix[o+2])/255
					if nhwc {
						k := (iy*F + ix) * 3
						in[k], in[k+1], in[k+2] = r, g, b
					} else {
						k := iy*F + ix
						in[k], in[F*F+k], in[2*F*F+k] = r, g, b
					}
				}
			}
			shape := []int64{1, 3, int64(F), int64(F)}
			if nhwc {
				shape = []int64{1, int64(F), int64(F), 3}
			}
			res, dims, err := s.Run(in, shape)
			if err != nil {
				return nil, err
			}
			outNHWC := len(dims) == 4 && dims[3] == 3
			OF := 0
			if outNHWC {
				OF = int(dims[2])
			} else if len(dims) == 4 {
				OF = int(dims[3])
			}
			if OF != 4*F {
				return nil, errors.New("Das KI-Modell vergrößert nicht um ×4.")
			}
			pl := OF * OF
			for oy := 0; oy < th*4; oy++ {
				for ox := 0; ox < tw*4; ox++ {
					sy, sx := 4*P+oy, 4*P+ox
					var r, g, b float32
					if outNHWC {
						k := (sy*OF + sx) * 3
						r, g, b = res[k], res[k+1], res[k+2]
					} else {
						k := sy*OF + sx
						r, g, b = res[k], res[pl+k], res[2*pl+k]
					}
					X, Y := x0*4+ox, y0*4+oy
					// Transparenz weich mitvergrößern
					fx, fy := (float64(X)+0.5)/4-0.5, (float64(Y)+0.5)/4-0.5
					ax0, ay0 := int(math.Floor(fx)), int(math.Floor(fy))
					wx, wy := fx-float64(ax0), fy-float64(ay0)
					al := func(x, y int) float64 { return float64(n.Pix[cl(y, H)*n.Stride+cl(x, W)*4+3]) }
					av := (al(ax0, ay0)*(1-wx)+al(ax0+1, ay0)*wx)*(1-wy) + (al(ax0, ay0+1)*(1-wx)+al(ax0+1, ay0+1)*wx)*wy
					out.SetNRGBA(X, Y, color.NRGBA{to8(r), to8(g), to8(b), uint8(av + 0.5)})
				}
			}
		}
	}
	return out, nil
}

package main

import (
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

// waveThumb malt ein Vorschaubild der Aufnahme für die Projektübersicht im Hub:
// Lautstärkeverlauf in den Farben des MP3 Schneiders, Schnitte als helle Linien.
func waveThumb(an *Analysis, cuts []Cut, path string) {
	if an == nil || len(an.Rms) == 0 {
		return
	}
	const W, H = 480, 270
	img := image.NewRGBA(image.Rect(0, 0, W, H))
	top := color.RGBA{0x2a, 0x16, 0x12, 255}
	bot := color.RGBA{0x14, 0x0c, 0x0b, 255}
	for y := 0; y < H; y++ {
		t := float64(y) / H
		c := color.RGBA{lerp8(top.R, bot.R, t), lerp8(top.G, bot.G, t), lerp8(top.B, bot.B, t), 255}
		for x := 0; x < W; x++ {
			img.SetRGBA(x, y, c)
		}
	}
	// Spitzenwert je Spalte
	n := len(an.Rms)
	mid := H / 2
	for x := 0; x < W; x++ {
		a, b := x*n/W, (x+1)*n/W
		if b <= a {
			b = a + 1
		}
		mx := -100.0
		for i := a; i < b && i < n; i++ {
			mx = math.Max(mx, db(an.Rms[i]))
		}
		v := math.Max(0, math.Min(1, (mx+60)/60)) // -60 dB … 0 dB
		h := int(v * float64(H) * 0.42)
		for y := mid - h; y <= mid+h; y++ {
			t := math.Abs(float64(y-mid)) / float64(H/2)
			// orange zur Mitte, rot nach außen
			c := color.RGBA{0xff, lerp8(0x9a, 0x43, t*1.6), lerp8(0x3d, 0x2f, t*1.6), 255}
			img.SetRGBA(x, y, c)
		}
	}
	if an.Dur > 0 {
		for _, c := range cuts {
			if !c.Accepted {
				continue
			}
			x := int(c.T / an.Dur * W)
			for y := 18; y < H-18; y++ {
				for dx := 0; dx < 2; dx++ {
					if x+dx >= 0 && x+dx < W && (y/6)%2 == 0 {
						img.SetRGBA(x+dx, y, color.RGBA{0xff, 0xe1, 0x4d, 255})
					}
				}
			}
		}
	}
	f, err := os.Create(path + ".tmp")
	if err != nil {
		return
	}
	err = png.Encode(f, img)
	f.Close()
	if err == nil {
		os.Rename(path+".tmp", path)
	} else {
		os.Remove(path + ".tmp")
	}
}

func lerp8(a, b uint8, t float64) uint8 {
	if t > 1 {
		t = 1
	}
	return uint8(float64(a) + (float64(b)-float64(a))*t)
}

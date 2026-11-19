package main

import (
	"encoding/json"
	"kit"
	"kit/ffmpeg"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

// videoThumbs erzeugt fehlende Vorschaubilder für Videoschnitt-Projekte, auch ohne dass der
// Videoschnitt geöffnet wird: zufälliges Bild aus der ersten Videodatei (sonst erstes Bild).
var thumbTried = map[string]bool{}

func videoThumbs() {
	ff := ffmpeg.Shared().FFmpeg()
	if ff == "" {
		return
	}
	cfg, _ := os.UserConfigDir()
	dir := filepath.Join(cfg, "Videoschnitt", "projects")
	es, _ := os.ReadDir(dir)
	for _, e := range es {
		pdir := filepath.Join(dir, e.Name())
		if _, err := os.Stat(filepath.Join(pdir, "thumb.jpg")); err == nil {
			continue
		}
		b, err := os.ReadFile(filepath.Join(pdir, "project.json"))
		if err != nil {
			continue
		}
		var p struct {
			Media []struct {
				ID, Path, Kind string
				Dur            float64
			} `json:"media"`
			Tracks []struct {
				Clips []struct {
					MediaID string `json:"mediaId"`
				} `json:"clips"`
			} `json:"tracks"`
		}
		if json.Unmarshal(b, &p) != nil {
			continue
		}
		src, dur := "", 0.0
		for _, kind := range []string{"video", "image"} {
			for _, m := range p.Media {
				if src == "" && m.Kind == kind {
					if _, err := os.Stat(m.Path); err == nil {
						src, dur = m.Path, m.Dur
					}
				}
			}
		}
		if src == "" || thumbTried[pdir+"|"+src] {
			continue
		}
		thumbTried[pdir+"|"+src] = true
		at := 0.0
		if dur > 1 {
			at = dur * (0.1 + 0.8*rand.Float64())
		}
		out := filepath.Join(pdir, "thumb.jpg")
		c := exec.Command(ff, "-hide_banner", "-nostdin", "-y", "-ss", strconv.FormatFloat(at, 'f', 2, 64), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", out)
		kit.HideCmd(c)
		c.Run()
		if _, err := os.Stat(out); err == nil {
			os.WriteFile(filepath.Join(pdir, "thumb.src"), []byte(src), 0o644)
		}
	}
}

func thumbLoop() {
	time.Sleep(2 * time.Second)
	for {
		videoThumbs()
		time.Sleep(time.Minute)
	}
}

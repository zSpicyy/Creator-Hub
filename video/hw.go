package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"sync"
	"time"

	"kit"
)

// Schneller rendern: Grafikkarte (NVIDIA, Intel, AMD, Apple) zum Kodieren und Dekodieren nutzen,
// sonst schnellere x264-Einstellungen. ffmpeg läuft mit niedriger Priorität, damit der PC bedienbar bleibt.

var (
	hwOnce sync.Once
	hwEnc  string // z. B. h264_nvenc, leer = keine nutzbare Grafikkarte
	hwMu   sync.Mutex
	hwDone bool
)

// hwStatus: Name der Grafikkarte fürs Rendern (leer = keine), und ob die Prüfung fertig ist.
func hwStatus() (string, bool) {
	hwMu.Lock()
	defer hwMu.Unlock()
	return hwName(hwEnc), hwDone
}

// detectHW prüft einmal, welcher Hardware-Encoder auf diesem PC wirklich funktioniert.
func (a *App) detectHW() string {
	hwOnce.Do(func() {
		defer func() { hwMu.Lock(); hwDone = true; hwMu.Unlock() }()
		var cands []string
		switch runtime.GOOS {
		case "windows":
			cands = []string{"h264_nvenc", "h264_qsv", "h264_amf"}
		case "darwin":
			cands = []string{"h264_videotoolbox"}
		default:
			cands = []string{"h264_nvenc", "h264_qsv"}
		}
		ff := a.eng.FFmpeg()
		if ff == "" {
			return
		}
		if f := os.Getenv("VS_FORCE_HW"); f != "" { // nur zum Testen der Ersatzlösung
			hwMu.Lock()
			hwEnc = f
			hwMu.Unlock()
			return
		}
		for _, enc := range cands {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			args := []string{"-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=30:d=0.5", "-pix_fmt", "yuv420p"}
			args = append(args, encArgs(enc, "rec", 1280, 720, 30)...)
			args = append(args, "-f", "null", "-")
			c := exec.CommandContext(ctx, ff, args...)
			kit.HideCmd(c)
			err := c.Run()
			cancel()
			if err == nil {
				hwMu.Lock()
				hwEnc = enc
				hwMu.Unlock()
				return
			}
		}
	})
	hwMu.Lock()
	defer hwMu.Unlock()
	return hwEnc
}

// hwName: verständlicher Name für die Oberfläche.
func hwName(enc string) string {
	switch enc {
	case "h264_nvenc":
		return "NVIDIA-Grafikkarte"
	case "h264_qsv":
		return "Intel-Grafik (Quick Sync)"
	case "h264_amf":
		return "AMD-Grafikkarte"
	case "h264_videotoolbox":
		return "Apple-Grafik"
	}
	return ""
}

// encArgs: Einstellungen für den Video-Encoder je Qualitätsstufe (high | rec | low).
func encArgs(enc, q string, w, h int, fps float64) []string {
	pick := func(hi, rec, lo string) string {
		switch q {
		case "high":
			return hi
		case "low":
			return lo
		}
		return rec
	}
	switch enc {
	case "h264_nvenc":
		return []string{"-c:v", "h264_nvenc", "-preset", pick("p6", "p5", "p3"), "-tune", "hq", "-rc", "vbr", "-cq", pick("19", "23", "28"), "-b:v", "0", "-bf", "2", "-spatial-aq", "1"}
	case "h264_qsv":
		return []string{"-c:v", "h264_qsv", "-preset", pick("slow", "medium", "veryfast"), "-global_quality", pick("19", "23", "28")}
	case "h264_amf":
		return []string{"-c:v", "h264_amf", "-quality", pick("quality", "balanced", "speed"), "-rc", "cqp", "-qp_i", pick("18", "22", "27"), "-qp_p", pick("20", "24", "29"), "-qp_b", pick("22", "26", "31")}
	case "h264_videotoolbox":
		// Bitrate aus Bildgröße und Bildrate (Bits pro Pixel)
		bpp := map[string]float64{"high": 0.14, "rec": 0.09, "low": 0.05}[q]
		if bpp == 0 {
			bpp = 0.09
		}
		br := int(math.Max(1500, float64(w*h)*math.Max(fps, 24)*bpp/1000))
		return []string{"-c:v", "h264_videotoolbox", "-b:v", strconv.Itoa(br) + "k", "-maxrate", strconv.Itoa(br*3/2) + "k", "-bufsize", strconv.Itoa(br*2) + "k"}
	}
	// Software (x264): deutlich schnellere Voreinstellungen als vorher, fast gleiche Qualität
	return []string{"-c:v", "libx264", "-preset", pick("medium", "faster", "veryfast"), "-crf", pick("18", "21", "25")}
}

// hwDecode: Dekodieren über die Grafikkarte, wenn möglich (ffmpeg fällt sonst selbst auf die CPU zurück).
func hwDecode() []string {
	return []string{"-hwaccel", "auto"}
}

// gentleThreads: „PC schonen“ – nur etwa die Hälfte der Kerne benutzen.
func gentleThreads() string {
	return fmt.Sprint(max(1, runtime.NumCPU()/2))
}

// swapToSoftware ersetzt in fertigen ffmpeg-Argumenten Hardware-Encoder und -Dekodierung durch Software.
func swapToSoftware(args []string, q string) []string {
	out := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		if args[i] == "-hwaccel" && i+1 < len(args) {
			i++
			continue
		}
		if args[i] == "-c:v" && i+1 < len(args) && isHW(args[i+1]) {
			// alle Encoder-Optionen bis zum nächsten bekannten allgemeinen Schalter überspringen
			j := i + 2
			for j < len(args) && args[j] != "-r" && args[j] != "-c:a" && args[j] != "-movflags" && args[j] != "-threads" {
				j++
			}
			out = append(out, encArgs("", q, 0, 0, 0)...)
			i = j - 1
			continue
		}
		out = append(out, args[i])
	}
	return out
}

func isHW(enc string) bool {
	switch enc {
	case "h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox":
		return true
	}
	return false
}

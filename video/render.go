package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"kit"
)

// Übergänge: Name in ffmpeg (xfade) und Anzeigename. Die Oberfläche zeigt sie in Gruppen.
type TransDef struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Group string `json:"group"`
}

var transitions = []TransDef{
	{"fade", "Überblenden", "Blenden"}, {"fadeblack", "Über Schwarz", "Blenden"}, {"fadewhite", "Über Weiß", "Blenden"}, {"dissolve", "Auflösen", "Blenden"}, {"hblur", "Unscharf überblenden", "Blenden"}, {"fadegrays", "Über Grau", "Blenden"},
	{"wipeleft", "Wischen nach links", "Wischen"}, {"wiperight", "Wischen nach rechts", "Wischen"}, {"wipeup", "Wischen nach oben", "Wischen"}, {"wipedown", "Wischen nach unten", "Wischen"},
	{"smoothleft", "Weich nach links", "Wischen"}, {"smoothright", "Weich nach rechts", "Wischen"}, {"smoothup", "Weich nach oben", "Wischen"}, {"smoothdown", "Weich nach unten", "Wischen"},
	{"diagtl", "Diagonal oben links", "Wischen"}, {"diagtr", "Diagonal oben rechts", "Wischen"}, {"diagbl", "Diagonal unten links", "Wischen"}, {"diagbr", "Diagonal unten rechts", "Wischen"},
	{"slideleft", "Schieben nach links", "Schieben"}, {"slideright", "Schieben nach rechts", "Schieben"}, {"slideup", "Schieben nach oben", "Schieben"}, {"slidedown", "Schieben nach unten", "Schieben"},
	{"squeezeh", "Quetschen waagerecht", "Schieben"}, {"squeezev", "Quetschen senkrecht", "Schieben"}, {"zoomin", "Hineinzoomen", "Schieben"},
	{"circleopen", "Kreis öffnen", "Formen"}, {"circleclose", "Kreis schließen", "Formen"}, {"circlecrop", "Kreisblende", "Formen"}, {"rectcrop", "Rechteckblende", "Formen"}, {"radial", "Uhrzeiger", "Formen"},
	{"vertopen", "Tür öffnen senkrecht", "Formen"}, {"vertclose", "Tür schließen senkrecht", "Formen"}, {"horzopen", "Tür öffnen waagerecht", "Formen"}, {"horzclose", "Tür schließen waagerecht", "Formen"},
	{"hlslice", "Streifen nach links", "Formen"}, {"hrslice", "Streifen nach rechts", "Formen"}, {"vuslice", "Streifen nach oben", "Formen"}, {"vdslice", "Streifen nach unten", "Formen"},
	{"pixelize", "Verpixeln", "Effekte"}, {"distance", "Verzerren", "Effekte"},
	{"m-zoomin", "Zoom hinein", "Bewegung"}, {"m-zoomout", "Zoom heraus", "Bewegung"}, {"m-spin", "Drehen", "Bewegung"}, {"m-spinl", "Drehen links", "Bewegung"},
	{"m-shake", "Wackeln", "Bewegung"}, {"m-glitch", "Glitch", "Bewegung"}, {"m-flash", "Blitz-Zoom", "Bewegung"}, {"m-spinzoom", "Wirbel", "Bewegung"},
	{"m-crosszoom", "Kreuz-Zoom", "Bewegung"}, {"m-speedblur", "Tempo-Unschärfe", "Bewegung"}, {"m-whipl", "Reißschwenk links", "Bewegung"}, {"m-whipr", "Reißschwenk rechts", "Bewegung"},
	{"m-light", "Lichtleck", "Licht"}, {"m-burn", "Filmbrand", "Licht"}, {"m-flare", "Lichtblitz", "Licht"},
	{"fadefast", "Schnell überblenden", "Blenden"}, {"fadeslow", "Langsam überblenden", "Blenden"},
	{"wipetl", "Wischen oben links", "Wischen"}, {"wipetr", "Wischen oben rechts", "Wischen"}, {"wipebl", "Wischen unten links", "Wischen"}, {"wipebr", "Wischen unten rechts", "Wischen"},
	{"coverleft", "Hereinschieben von rechts", "Schieben"}, {"coverright", "Hereinschieben von links", "Schieben"}, {"coverup", "Hereinschieben von unten", "Schieben"}, {"coverdown", "Hereinschieben von oben", "Schieben"},
	{"revealleft", "Aufdecken nach links", "Schieben"}, {"revealright", "Aufdecken nach rechts", "Schieben"}, {"revealup", "Aufdecken nach oben", "Schieben"}, {"revealdown", "Aufdecken nach unten", "Schieben"},
	{"hlwind", "Wind nach links", "Effekte"}, {"hrwind", "Wind nach rechts", "Effekte"}, {"vuwind", "Wind nach oben", "Effekte"}, {"vdwind", "Wind nach unten", "Effekte"},
}

// Effekte: ffmpeg-Filter für den Export, CSS-Filter für die Vorschau.
type EffectDef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	FF   string `json:"-"`
	CSS  string `json:"css"`
}

var effects = []EffectDef{
	{"bw", "Schwarzweiß", "hue=s=0", "grayscale(1)"},
	{"sepia", "Sepia", "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131", "sepia(1)"},
	{"vintage", "Vintage", "colorchannelmixer=.6:.35:.05:0:.25:.6:.15:0:.2:.35:.45,eq=contrast=0.9:saturation=0.8,vignette=PI/5", "sepia(.55) contrast(.9) saturate(.8)"},
	{"warm", "Warm", "colorbalance=rs=.12:gs=.03:bs=-.12", "sepia(.25) saturate(1.2)"},
	{"cool", "Kühl", "colorbalance=rs=-.1:gs=0:bs=.12", "hue-rotate(-12deg) saturate(1.1)"},
	{"vivid", "Lebendig", "eq=saturation=1.6:contrast=1.08", "saturate(1.6) contrast(1.08)"},
	{"faded", "Verblasst", "eq=contrast=0.8:brightness=0.05:saturation=0.7", "contrast(.8) brightness(1.05) saturate(.7)"},
	{"drama", "Dramatisch", "eq=contrast=1.35:saturation=0.85:brightness=-0.03", "contrast(1.35) saturate(.85) brightness(.97)"},
	{"invert", "Negativ", "negate", "invert(1)"},
	{"blur", "Weichzeichner", "gblur=sigma=10", "blur(5px)"},
	{"sharpen", "Schärfen", "unsharp=5:5:1.3", "contrast(1.06)"},
	{"vignette", "Vignette", "vignette=PI/4", "vignette"},
	{"pixel", "Verpixeln", "scale=iw/16:ih/16,scale=iw*16:ih*16:flags=neighbor", "pixel"},
	{"grain", "Filmkorn", "noise=alls=22:allf=t", "grain"},
	{"hue", "Farbverschiebung", "hue=h=90", "hue-rotate(90deg)"},
	{"night", "Nacht", "eq=brightness=-0.08:saturation=0.6,colorbalance=rs=-.08:bs=.15", "brightness(.85) saturate(.6) hue-rotate(12deg)"},
	{"gold", "Gold", "colorbalance=rs=.2:gs=.08:bs=-.2,eq=saturation=1.2", "sepia(.4) saturate(1.5)"},
	{"cinema", "Kino", "eq=contrast=1.15:saturation=0.9,colorbalance=rs=.05:bs=.08", "contrast(1.15) saturate(.9)"},
	{"pop", "Pop", "eq=saturation=2.2:contrast=1.2", "saturate(2.2) contrast(1.2)"},
	// Effekte (nach Filmora-Namen selbst gebaut)
	{"mirror", "Spiegel", "", "@mirror"},
	{"kaleido", "Kaleidoskop", "", "@kaleido"},
	{"mirrorv", "Spiegel senkrecht", "", "@mirrorv"},
	{"rgbshift", "RGB-Verschiebung", "format=rgba,rgbashift=rh=-7:bh=7", "@rgbshift"},
	{"vhs", "VHS", "format=rgba,rgbashift=rh=-5:bh=5,noise=alls=18:allf=t,eq=saturation=1.25:contrast=1.08,drawgrid=w=iw:h=4:t=1:c=black@0.22", "@vhs|saturate(1.25) contrast(1.08)"},
	{"oldfilm", "Alter Film", "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=24:allf=t,vignette=PI/4,eq=brightness='0.04*sin(t*23)':eval=frame", "@oldfilm|sepia(1)"},
	{"nightvision", "Nachtsicht", "hue=s=0,colorchannelmixer=.25:.35:.1:0:.5:.9:.2:0:.1:.15:.05,noise=alls=22:allf=t,vignette=PI/3.2", "@night|grayscale(1) sepia(1) hue-rotate(65deg) saturate(2.5) brightness(1.05)"},
	{"thermal", "Wärmebild", "format=yuv420p,pseudocolor=preset=turbo", "@thermal"},
	{"sketch", "Skizze", "edgedetect=low=0.08:high=0.22,negate", "@sketch"},
	{"poster", "Poster", "format=rgba,lutrgb=r='trunc(val/64)*64+32':g='trunc(val/64)*64+32':b='trunc(val/64)*64+32'", "@poster"},
	{"glow", "Weiches Leuchten", "gblur=sigma=2,eq=brightness=0.06:contrast=1.05:saturation=1.12", "blur(1px) brightness(1.1) saturate(1.12)"},
	{"shake", "Wackelkamera", "crop=iw*0.94:ih*0.94:x='(iw-ow)/2*(1+0.8*sin(t*13))':y='(ih-oh)/2*(1+0.8*cos(t*11))',scale={w}:{h}", "@shake"},
	{"pulse", "Zoom-Puls", "zoompan=z='1+0.07*pow(abs(sin(it*PI*2)),4)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps={fps}", "@pulse"},
	// Filter (Farblooks)
	{"teal", "Teal & Orange", "colorbalance=rs=-.12:gs=.02:bs=.16:rh=.16:gh=.04:bh=-.14,eq=contrast=1.1:saturation=1.15", "contrast(1.1) saturate(1.2) sepia(.15) hue-rotate(-8deg)"},
	{"seventies", "70er", "colorbalance=rs=.12:gs=.04:bs=-.1,eq=contrast=0.88:saturation=0.8:brightness=0.03", "sepia(.35) contrast(.88) saturate(.85) brightness(1.03)"},
	{"polaroid", "Sofortbild", "eq=contrast=0.9:brightness=0.05:saturation=0.85,colorbalance=rs=.05:bs=-.06,vignette=PI/5", "contrast(.9) brightness(1.05) saturate(.85) sepia(.15)"},
	{"moody", "Moody", "eq=contrast=1.2:saturation=0.7:brightness=-0.05,colorbalance=bs=.08", "contrast(1.2) saturate(.7) brightness(.95) hue-rotate(5deg)"},
	{"pastel", "Pastell", "eq=contrast=0.8:saturation=0.75:brightness=0.08", "contrast(.8) saturate(.75) brightness(1.08)"},
	{"cyber", "Cyberpunk", "colorbalance=rs=.2:gs=-.2:bs=.3,eq=saturation=1.4:contrast=1.1", "hue-rotate(-30deg) saturate(1.6) contrast(1.1)"},
	{"summer", "Sommer", "colorbalance=rs=.1:gs=.04:bs=-.08,eq=saturation=1.3:brightness=0.03", "sepia(.2) saturate(1.4) brightness(1.03)"},
	{"winter", "Winter", "colorbalance=rs=-.08:bs=.12,eq=saturation=0.75:brightness=0.05", "hue-rotate(-10deg) saturate(.75) brightness(1.06)"},
	{"autumn", "Herbst", "hue=h=-8,colorbalance=rs=.15:gs=.05:bs=-.15,eq=saturation=1.2", "sepia(.4) saturate(1.3) hue-rotate(-8deg)"},
	{"noir", "Noir", "hue=s=0,eq=contrast=1.5:brightness=-0.03", "grayscale(1) contrast(1.5) brightness(.97)"},
	{"bleach", "Bleach Bypass", "eq=saturation=0.4:contrast=1.3", "saturate(.4) contrast(1.3)"},
	{"cross", "Cross-Process", "colorbalance=rs=.1:gs=.05:bs=-.2,eq=saturation=1.3:contrast=1.1", "sepia(.3) saturate(1.5) contrast(1.1) hue-rotate(10deg)"},
}

var fontFiles = map[string][2]string{
	"Arial": {"arial.ttf", "arialbd.ttf"}, "Arial Black": {"ariblk.ttf", "ariblk.ttf"}, "Segoe UI": {"segoeui.ttf", "segoeuib.ttf"},
	"Impact": {"impact.ttf", "impact.ttf"}, "Georgia": {"georgia.ttf", "georgiab.ttf"}, "Comic Sans MS": {"comic.ttf", "comicbd.ttf"},
	"Consolas": {"consola.ttf", "consolab.ttf"}, "Bahnschrift": {"bahnschrift.ttf", "bahnschrift.ttf"}, "Verdana": {"verdana.ttf", "verdanab.ttf"},
	"Times New Roman": {"times.ttf", "timesbd.ttf"}, "Trebuchet MS": {"trebuc.ttf", "trebucbd.ttf"},
}

func fontPath(name string, bold bool) string {
	i := 0
	if bold {
		i = 1
	}
	if runtime.GOOS == "windows" {
		f, ok := fontFiles[name]
		if !ok {
			f = fontFiles["Arial"]
		}
		p := filepath.Join(os.Getenv("WINDIR"), "Fonts", f[i])
		if _, err := os.Stat(p); err == nil {
			return p
		}
		return filepath.Join(os.Getenv("WINDIR"), "Fonts", "arial.ttf")
	}
	for _, p := range []string{"/usr/share/fonts/truetype/dejavu/DejaVuSans" + map[bool]string{true: "-Bold", false: ""}[bold] + ".ttf"} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func fontNames() []string {
	var out []string
	for n := range fontFiles {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// writeMask berechnet die Übergangsmaske Bild für Bild (Graustufen, klein, wird später hochskaliert).
func writeMask(path string, c *Custom, W, H int, fps, d float64) (int, int, error) {
	mw := min(W, 480)
	mh := max(2, int(math.Round(float64(H)*float64(mw)/float64(W)/2))*2)
	n := max(1, int(math.Round(d*fps)))
	f, err := os.Create(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	bw := bufio.NewWriterSize(f, 1<<20)
	soft := math.Max(0.01, math.Min(1, c.Soft))
	a := c.Angle * math.Pi / 180
	co, si := math.Cos(a), math.Sin(a)
	cnt := math.Max(1, math.Round(c.Count))
	aspect := float64(H) / float64(W)
	maxR := math.Hypot(0.5, 0.5*aspect)
	m := make([]float64, mw*mh)
	for y := 0; y < mh; y++ {
		for x := 0; x < mw; x++ {
			u, v := (float64(x)+0.5)/float64(mw), (float64(y)+0.5)/float64(mh)
			lin := ((u-0.5)*co+(v-0.5)*si)/(math.Abs(co)+math.Abs(si)) + 0.5
			var val float64
			switch c.Shape {
			case "circle":
				val = math.Hypot(u-0.5, (v-0.5)*aspect) / maxR
			case "diamond":
				val = math.Abs(u-0.5) + math.Abs(v-0.5)
			case "blinds":
				val = lin*cnt - math.Floor(lin*cnt)
			case "checker":
				val = math.Mod(math.Floor(u*cnt)+math.Floor(v*cnt), 2)*0.5 + lin*0.5
			case "clock":
				r := (math.Atan2(v-0.5, u-0.5) + math.Pi + a) / (2 * math.Pi)
				val = r - math.Floor(r)
			default:
				val = lin
			}
			if c.Invert {
				val = 1 - val
			}
			m[y*mw+x] = val
		}
	}
	row := make([]byte, mw*mh)
	for k := 0; k < n; k++ {
		t := (float64(k) + 0.5) / float64(n)
		for i, val := range m {
			row[i] = byte(math.Max(0, math.Min(1, (t*(1+soft)-val)/soft)) * 255)
		}
		if _, err := bw.Write(row); err != nil {
			return 0, 0, err
		}
	}
	return mw, mh, bw.Flush()
}

// customExpr baut die Formel für einen selbst entworfenen Übergang (xfade transition=custom).
// P läuft bei xfade von 1 nach 0; A ist das alte, B das neue Bild.
func customExpr(c *Custom) string {
	soft := math.Max(0.01, math.Min(1, c.Soft))
	a := c.Angle * math.Pi / 180
	co, si := math.Cos(a), math.Sin(a)
	n := math.Max(1, math.Round(c.Count))
	lin := fmt.Sprintf("(((X/W-0.5)*%.5f+(Y/H-0.5)*%.5f)/%.5f+0.5)", co, si, math.Abs(co)+math.Abs(si))
	var m string
	switch c.Shape {
	case "circle":
		m = "(hypot(X/W-0.5,(Y/H-0.5)*H/W)/hypot(0.5,0.5*H/W))"
	case "diamond":
		m = "((abs(X/W-0.5)+abs(Y/H-0.5)))"
	case "blinds":
		m = fmt.Sprintf("(%s*%.0f-floor(%s*%.0f))", lin, n, lin, n)
	case "checker":
		m = fmt.Sprintf("(mod(floor(X/W*%.0f)+floor(Y/H*%.0f),2)*0.5+%s*0.5)", n, n, lin)
	case "clock":
		m = fmt.Sprintf("((atan2(Y/H-0.5,X/W-0.5)+PI+%.5f)/(2*PI)-floor((atan2(Y/H-0.5,X/W-0.5)+PI+%.5f)/(2*PI)))", a, a)
	default:
		m = lin
	}
	if c.Invert {
		m = "(1-" + m + ")"
	}
	// k = Anteil des neuen Bildes an dieser Stelle
	k := fmt.Sprintf("clip(((1-P)*(1+%.4f)-%s)/%.4f,0,1)", soft, m, soft)
	return fmt.Sprintf("A*(1-%s)+B*%s", k, k)
}

type Export struct {
	Name    string            `json:"name"`
	Dir     string            `json:"dir"`
	Format  string            `json:"format"`          // mp4 | mov | mkv | webm | avi | gif | mp3 | wav
	Res     int               `json:"res"`             // Höhe, 0 = wie Projekt
	FPS     float64           `json:"fps"`             // 0 = wie Projekt
	Quality string            `json:"quality"`         // high | rec | low
	Start   float64           `json:"start,omitempty"` // Bereich: nur von Start bis End exportieren
	End     float64           `json:"end,omitempty"`
	Loud    bool              `json:"loud,omitempty"` // Lautheit angleichen
	LUFS    float64           `json:"lufs,omitempty"` // Ziel-Lautheit (Standard −14 LUFS)
	ln      map[string]string // Messwerte des ersten Durchgangs (zweistufiges Angleichen)
	stab    map[string]string // Bewegungsdaten je Clip für vid.stab (zweistufiges Stabilisieren)
	GPU     *bool             `json:"gpu,omitempty"`    // Grafikkarte nutzen (Standard: an)
	Gentle  bool              `json:"gentle,omitempty"` // PC schonen: nur die Hälfte der Kerne
}

type RenderJob struct {
	Running bool    `json:"running"`
	Done    float64 `json:"done"`
	ETA     int     `json:"eta"`
	Error   string  `json:"error"`
	Finish  bool    `json:"finish"`
	Out     string  `json:"out"`
	Size    int64   `json:"size"`
	Engine  string  `json:"engine"` // womit gerendert wird
	Note    string  `json:"note,omitempty"`
	mu      sync.Mutex
	cmd     *exec.Cmd
	stop    bool
}

func (j *RenderJob) cancel() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.stop = true
	if j.cmd != nil && j.cmd.Process != nil {
		j.cmd.Process.Kill()
	}
}

func esc(p string) string {
	p = strings.ReplaceAll(p, `\`, "/")
	p = strings.ReplaceAll(p, ":", `\:`)
	p = strings.ReplaceAll(p, "'", `\'`)
	return "'" + p + "'"
}

func ffColor(c string, alpha float64) string {
	c = strings.TrimPrefix(strings.TrimSpace(c), "#")
	if len(c) != 6 {
		c = "ffffff"
	}
	return fmt.Sprintf("0x%s@%.3f", c, alpha)
}

func f3(v float64) string { return strconv.FormatFloat(v, 'f', 4, 64) }

// fit: Größe, mit der ein Bild mit w×h in die Leinwand W×H passt (ohne Abschneiden), mal scale.
func fit(w, h, W, H int, scale float64) (int, int) {
	if w <= 0 || h <= 0 {
		return W, H
	}
	k := math.Min(float64(W)/float64(w), float64(H)/float64(h)) * scale
	fw, fh := int(math.Round(float64(w)*k/2))*2, int(math.Round(float64(h)*k/2))*2
	return max(2, fw), max(2, fh)
}

type graph struct {
	inputs  []string
	filters []string
	n       int
	tmp     []string
	hwdec   bool   // Videos über die Grafikkarte dekodieren
	enc     string // Hardware-Encoder oder leer
}

func (g *graph) label() string { g.n++; return fmt.Sprintf("s%d", g.n) }
func (g *graph) add(f string)  { g.filters = append(g.filters, f) }
func (g *graph) input(args ...string) int {
	g.inputs = append(g.inputs, args...)
	n := 0
	for _, a := range g.inputs {
		if a == "-i" {
			n++
		}
	}
	return n - 1
}

func atempo(speed float64) string {
	var parts []string
	for speed > 2.0 {
		parts = append(parts, "atempo=2.0")
		speed /= 2
	}
	for speed < 0.5 {
		parts = append(parts, "atempo=0.5")
		speed /= 0.5
	}
	if math.Abs(speed-1) > 1e-3 {
		parts = append(parts, "atempo="+f3(speed))
	}
	return strings.Join(parts, ",")
}

func effectFF(id string) string {
	for _, e := range effects {
		if e.ID == id {
			return e.FF
		}
	}
	return ""
}

// build erzeugt den kompletten ffmpeg-Aufruf aus der Zeitleiste.
func (a *App) build(p *Project, ex *Export, out string, tmpdir string) ([]string, float64, error) {
	defer func() { kfLinear = false }()
	W, H, FPS := p.W, p.H, p.FPS
	if ex.Res > 0 && ex.Res < p.H && ex.Format != "gif" {
		// kleiner exportieren: gleich in der Zielgröße zusammensetzen statt in voller Größe rechnen und am Ende verkleinern
		H = ex.Res / 2 * 2
		W = int(math.Round(float64(p.W)*float64(H)/float64(p.H)/2)) * 2
	}
	if ex.FPS > 0 {
		FPS = ex.FPS
	}
	total := duration(p)
	if total < 0.05 {
		return nil, 0, errors.New("Die Zeitleiste ist leer.")
	}
	g := &graph{}
	audioOnly := ex.Format == "mp3" || ex.Format == "wav"
	if ex.GPU == nil || *ex.GPU {
		if ex.Format == "mp4" || ex.Format == "mov" || ex.Format == "mkv" {
			g.enc = a.detectHW()
		}
		g.hwdec = !audioOnly && (runtime.GOOS == "windows" || runtime.GOOS == "darwin" || g.enc != "")
	}
	noAudio := ex.Format == "gif" || ex.Format == "png" || ex.Format == "jpg"
	seq := ex.Format == "png" || ex.Format == "jpg"
	if !audioOnly {
		g.add(fmt.Sprintf("color=c=black:s=%dx%d:r=%s:d=%s[base0]", W, H, f3(FPS), f3(total)))
	}
	base := "base0"
	var audios, ducks []string

	// Spuren von unten nach oben übereinanderlegen
	for ti := len(p.Tracks) - 1; ti >= 0; ti-- {
		t := p.Tracks[ti]
		clips := append([]*Clip{}, t.Clips...)
		sort.Slice(clips, func(i, j int) bool { return clips[i].Start < clips[j].Start })
		type built struct {
			c     *Clip
			label string
			len   float64
		}
		var chain []built
		flush := func() {
			if len(chain) == 0 || audioOnly {
				chain = nil
				return
			}
			acc := chain[0].label
			start := chain[0].c.Start
			accEnd := chain[0].c.Start + chain[0].len
			for _, b := range chain[1:] {
				d := accEnd - b.c.Start
				d = math.Min(d, math.Min(b.len, chain[0].len))
				tr := b.c.TransIn
				typ := "fade"
				if tr != nil && tr.Type != "" {
					typ = tr.Type
				}
				lab := g.label()
				if strings.HasPrefix(typ, "custom") && tr.Custom != nil {
					// Eigener Übergang: Maske vorab berechnen, dann neues Bild mit der Maske über das alte legen.
					off := b.c.Start - start
					mf := filepath.Join(tmpdir, fmt.Sprintf("maske%d.raw", g.n))
					mw, mh, err := writeMask(mf, tr.Custom, W, H, FPS, d)
					if err != nil {
						continue
					}
					mi := g.input("-f", "rawvideo", "-pix_fmt", "gray", "-s", fmt.Sprintf("%dx%d", mw, mh), "-r", f3(FPS), "-i", mf)
					ap, mk, b1, b2, ba, ma, bm, bs := g.label(), g.label(), g.label(), g.label(), g.label(), g.label(), g.label(), g.label()
					g.add(fmt.Sprintf("[%s]tpad=stop_mode=clone:stop_duration=%s[%s]", acc, f3(b.len), ap))
					g.add(fmt.Sprintf("[%d:v]scale=%d:%d:flags=bilinear,format=gray,setpts=PTS-STARTPTS,tpad=stop_mode=add:stop_duration=%s:color=white[%s]", mi, W, H, f3(b.len), mk))
					g.add(fmt.Sprintf("[%s]split[%s][%s]", b.label, b1, b2))
					g.add(fmt.Sprintf("[%s]alphaextract[%s]", b1, ba))
					g.add(fmt.Sprintf("[%s][%s]blend=all_mode=multiply,format=gray[%s]", ba, mk, ma))
					g.add(fmt.Sprintf("[%s][%s]alphamerge[%s]", b2, ma, bm))
					g.add(fmt.Sprintf("[%s]setpts=PTS-STARTPTS+%s/TB[%s]", bm, f3(off), bs))
					g.add(fmt.Sprintf("[%s][%s]overlay=eof_action=pass:format=auto,trim=duration=%s,format=yuva420p[%s]", ap, bs, f3(off+b.len), lab))
				} else if fa, fb, xf, ok := motion(typ, b.c.Start-start, d, W, H, FPS); ok {
					// Bewegungsübergang: Ende des alten und Anfang des neuen Clips bewegen, dann überblenden
					pa, pb := g.label(), g.label()
					g.add(fmt.Sprintf("[%s]%s,format=yuva420p[%s]", acc, fa, pa))
					g.add(fmt.Sprintf("[%s]%s,format=yuva420p[%s]", b.label, fb, pb))
					g.add(fmt.Sprintf("[%s][%s]xfade=transition=%s:duration=%s:offset=%s[%s]", pa, pb, xf, f3(d), f3(b.c.Start-start), lab))
				} else {
					g.add(fmt.Sprintf("[%s][%s]xfade=transition=%s:duration=%s:offset=%s[%s]", acc, b.label, typ, f3(d), f3(b.c.Start-start), lab))
				}
				acc = lab
				accEnd = math.Max(accEnd, b.c.Start+b.len)
			}
			mode := ""
			for _, b := range chain {
				if m := blendModes[b.c.Blend]; m != "" {
					mode = m
				}
			}
			nb := g.label()
			if mode == "" {
				sh := g.label()
				g.add(fmt.Sprintf("[%s]setpts=PTS-STARTPTS+%s/TB[%s]", acc, f3(start), sh))
				g.add(fmt.Sprintf("[%s][%s]overlay=eof_action=pass:format=auto[%s]", base, sh, nb))
			} else {
				// Mischmodus: Ebene über die ganze Länge strecken, mit dem Hintergrund mischen und nur dort zeigen, wo die Ebene sichtbar ist
				l1, l2, b1, b2, bg, lg, bl, la, bla := g.label(), g.label(), g.label(), g.label(), g.label(), g.label(), g.label(), g.label(), g.label()
				g.add(fmt.Sprintf("[%s]setpts=PTS-STARTPTS,tpad=start_duration=%s:start_mode=add:color=black@0,tpad=stop_duration=%s:stop_mode=add:color=black@0,trim=duration=%s,format=yuva420p,split[%s][%s]", acc, f3(start), f3(total), f3(total), l1, l2))
				g.add(fmt.Sprintf("[%s]split[%s][%s]", base, b1, b2))
				g.add(fmt.Sprintf("[%s]format=gbrp[%s]", b1, bg))
				g.add(fmt.Sprintf("[%s]format=gbrp[%s]", l1, lg))
				g.add(fmt.Sprintf("[%s][%s]blend=all_mode=%s,format=yuv420p[%s]", bg, lg, mode, bl))
				g.add(fmt.Sprintf("[%s]alphaextract[%s]", l2, la))
				g.add(fmt.Sprintf("[%s][%s]alphamerge[%s]", bl, la, bla))
				g.add(fmt.Sprintf("[%s][%s]overlay=eof_action=pass:format=auto[%s]", b2, bla, nb))
			}
			base = nb
			chain = nil
		}
		var prevEnd float64 = -1
		for ci, c := range clips {
			L := c.Length()
			kfLinear = c.KfLin
			if L <= 0.01 {
				continue
			}
			var m *Media
			if c.Type == "media" {
				m = a.mediaOf(p, c.MediaID)
				if m == nil {
					continue
				}
				if _, err := os.Stat(m.Path); err != nil {
					return nil, 0, fmt.Errorf("Die Datei %s fehlt.", m.Name)
				}
			}
			sp := c.Speed
			if sp <= 0 {
				sp = 1
			}
			idx := -1
			if m != nil {
				switch m.Kind {
				case "image":
					idx = g.input("-loop", "1", "-framerate", f3(FPS), "-t", f3(L), "-i", m.Path)
				case "video":
					in := []string{"-ss", f3(c.In), "-t", f3(c.Out - c.In), "-i", m.Path}
					if g.hwdec && !audioOnly && t.Kind == "video" && !t.Hidden {
						in = append(hwDecode(), in...)
					}
					idx = g.input(in...)
				default:
					idx = g.input("-ss", f3(c.In), "-t", f3(c.Out-c.In), "-i", m.Path)
				}
			}
			// Ton
			if m != nil && !noAudio && (m.Kind == "audio" || m.HasAudio) && !t.Mute && !c.Mute && c.Volume > 0.001 {
				af := []string{"asetpts=PTS-STARTPTS"}
				if c.Reverse {
					af = append(af, "areverse")
				}
				if c.Denoise {
					af = append(af, "afftdn=nf=-25")
				}
				if math.Abs(c.Pitch) > 0.01 {
					k := math.Pow(2, c.Pitch/12)
					af = append(af, "aresample=48000", "asetrate="+f3(48000*k), "aresample=48000", atempo(1/k))
				}
				if at := atempo(sp); at != "" {
					af = append(af, at)
				}
				if c.EqLow != 0 {
					af = append(af, "bass=g="+f3(c.EqLow)+":f=120")
				}
				if c.EqMid != 0 {
					af = append(af, "equalizer=f=1200:t=q:w=1:g="+f3(c.EqMid))
				}
				if c.EqHigh != 0 {
					af = append(af, "treble=g="+f3(c.EqHigh)+":f=6000")
				}
				if v := voiceFF(c.Voice); v != "" {
					af = append(af, v)
				}
				af = append(af, audioFxFF(c.Audio)...)
				if k := c.Kf["volume"]; len(k) > 0 {
					af = append(af, "volume='"+kfExpr(k, "t")+"':eval=frame")
				} else if math.Abs(c.Volume-1) > 1e-3 {
					af = append(af, "volume="+f3(c.Volume))
				}
				if t.Vol > 0 && math.Abs(t.Vol-1) > 1e-3 {
					af = append(af, "volume="+f3(t.Vol))
				}
				if c.FadeIn > 0 {
					af = append(af, "afade=t=in:d="+f3(c.FadeIn))
				}
				if c.FadeOut > 0 {
					af = append(af, fmt.Sprintf("afade=t=out:st=%s:d=%s", f3(math.Max(0, L-c.FadeOut)), f3(c.FadeOut)))
				}
				ms := int(math.Round(c.Start * 1000))
				af = append(af, fmt.Sprintf("atrim=duration=%s,adelay=%d|%d,aformat=sample_rates=48000:channel_layouts=stereo", f3(L), ms, ms))
				lab := g.label()
				g.add(fmt.Sprintf("[%d:a]%s[%s]", idx, strings.Join(af, ","), lab))
				if c.Duck {
					ducks = append(ducks, lab)
				} else {
					audios = append(audios, lab)
				}
			}
			if t.Kind != "video" || t.Hidden || audioOnly || (m != nil && m.Kind == "audio") {
				continue
			}
			// Bild vorbereiten: auf die Leinwand setzen, Farben, Effekt, Deckkraft, Drehung
			lab := g.label()
			op := c.Opacity
			if op <= 0 && c.Opacity == 0 {
				op = 1
			}
			var vf []string
			canvas := fmt.Sprintf("color=c=black@0:s=%dx%d:r=%s:d=%s,format=yuva420p", W, H, f3(FPS), f3(L))
			switch c.Type {
			case "media":
				rev := ""
				if c.Reverse && m.Kind == "video" {
					rev = "reverse,"
				}
				stabF := ""
				if trf := ex.stab[c.ID]; c.Stab && m.Kind == "video" && trf != "" {
					// zweite Stufe: Bewegung ausgleichen (vor Tempo und Umkehren, damit die Bilder zu den Messdaten passen)
					stabF = "vidstabtransform=input=" + ffPath(trf) + ":smoothing=20:optzoom=1:interpol=bicubic,unsharp=5:5:0.6:3:3:0.3,"
				}
				if c.Smooth && sp < 0.99 && m.Kind == "video" {
					vf = append(vf, fmt.Sprintf("[%d:v]%s%ssetpts=(PTS-STARTPTS)/%s,minterpolate=fps=%s:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1", idx, stabF, rev, f3(sp), f3(FPS)))
				} else {
					vf = append(vf, fmt.Sprintf("[%d:v]%s%ssetpts=(PTS-STARTPTS)/%s,fps=%s", idx, stabF, rev, f3(sp), f3(FPS)))
				}
				if c.Stab && m.Kind == "video" && stabF == "" {
					vf = append(vf, "deshake")
				}
				mw, mh := m.W, m.H
				if c.CropL+c.CropT+c.CropR+c.CropB > 0.001 {
					kw, kh := math.Max(0.05, 1-c.CropL-c.CropR), math.Max(0.05, 1-c.CropT-c.CropB)
					vf = append(vf, fmt.Sprintf("crop=iw*%s:ih*%s:iw*%s:ih*%s", f3(kw), f3(kh), f3(c.CropL), f3(c.CropT)))
					mw, mh = int(math.Max(2, float64(m.W)*kw)), int(math.Max(2, float64(m.H)*kh))
				}
				sc := c.Scale
				if sc <= 0 {
					sc = 1
				}
				ks := c.Kf["scale"]
				if len(ks) > 0 {
					sc = 1
				}
				fw, fh := fit(mw, mh, W, H, sc)
				if c.FlipH {
					vf = append(vf, "hflip")
				}
				if c.FlipV {
					vf = append(vf, "vflip")
				}
				vf = append(vf, fmt.Sprintf("scale=%d:%d,setsar=1", fw, fh))
				if c.Matte != "" && (m.Kind == "video" || m.Kind == "image") {
					if _, err := os.Stat(c.Matte); err == nil {
						// KI-Maske: gleiche Stelle, gleiches Tempo, gleicher Ausschnitt wie das Bild
						crop := ""
						if c.CropL+c.CropT+c.CropR+c.CropB > 0.001 {
							kw, kh := math.Max(0.05, 1-c.CropL-c.CropR), math.Max(0.05, 1-c.CropT-c.CropB)
							crop = fmt.Sprintf("crop=iw*%s:ih*%s:iw*%s:ih*%s,", f3(kw), f3(kh), f3(c.CropL), f3(c.CropT))
						}
						if c.FlipH {
							crop += "hflip,"
						}
						if c.FlipV {
							crop += "vflip,"
						}
						var mi int
						tm := ""
						if m.Kind == "image" {
							mi = g.input("-loop", "1", "-framerate", f3(FPS), "-t", f3(L), "-i", c.Matte)
						} else {
							mi = g.input("-ss", f3(c.In), "-t", f3(c.Out-c.In), "-i", c.Matte)
							tm = fmt.Sprintf("%ssetpts=(PTS-STARTPTS)/%s,fps=%s,", rev, f3(sp), f3(FPS))
						}
						a1, a2 := g.label(), g.label()
						vf = append(vf, fmt.Sprintf("format=yuva420p[%s];[%d:v]%s%sscale=%d:%d,setsar=1,format=gray[%s];[%s][%s]alphamerge", a1, mi, tm, crop, fw, fh, a2, a1, a2))
					}
				}
				if c.Effect == "mirror" || c.Effect == "kaleido" || c.Effect == "mirrorv" {
					// Spiegeln mit geteiltem Bild: linke (obere) Hälfte und ihr Spiegelbild nebeneinander
					h := func(stack, cut, flip string) string {
						a, b, x, y := g.label(), g.label(), g.label(), g.label()
						return fmt.Sprintf("split[%s][%s];[%s]%s[%s];[%s]%s,%s[%s];[%s][%s]%s", a, b, a, cut, x, b, cut, flip, y, x, y, stack)
					}
					vf = append(vf, fmt.Sprintf("scale=%d:%d", fw/4*4, fh/4*4))
					if c.Effect != "mirrorv" {
						vf = append(vf, h("hstack", "crop=iw/2:ih:0:0", "hflip"))
					}
					if c.Effect != "mirror" {
						vf = append(vf, h("vstack", "crop=iw:ih/2:0:0", "vflip"))
					}
				} else if e := effectFF(c.Effect); e != "" {
					vf = append(vf, strings.NewReplacer("{w}", strconv.Itoa(fw), "{h}", strconv.Itoa(fh), "{fps}", f3(FPS)).Replace(e))
				}
				if c.Key != "" {
					sim := c.KeySim
					if sim <= 0 {
						sim = 0.3
					}
					vf = append(vf, fmt.Sprintf("format=rgba,colorkey=0x%s:%s:%s", strings.TrimPrefix(c.Key, "#"), f3(sim), f3(math.Max(0.01, c.KeyEdge))))
					if c.Spill > 0.01 {
						// Farbsaum (grüner/blauer Schimmer an Kanten) entfernen
						kind := "green"
						if r, g, b, ok := hexRGB(c.Key); ok && b > g && b > r {
							kind = "blue"
						}
						vf = append(vf, fmt.Sprintf("despill=type=%s:mix=%s:expand=%s", kind, f3(0.5+0.5*math.Min(1, c.Spill)), f3(0.3*math.Min(1, c.Spill))))
					}
				}
				if c.Enhance {
					vf = append(vf, "eq=contrast=1.08:saturation=1.18,unsharp=3:3:0.4")
				}
				if c.Temp != 0 {
					vf = append(vf, fmt.Sprintf("colortemperature=temperature=%d", int(6500-c.Temp*3500)))
				}
				if c.Tint != 0 {
					vf = append(vf, fmt.Sprintf("colorbalance=gm=%s", f3(-c.Tint*0.4)))
				}
				if c.Expo != 0 {
					vf = append(vf, "exposure=exposure="+f3(c.Expo*2))
				}
				if c.Vig > 0 {
					vf = append(vf, "vignette=a="+f3(c.Vig*math.Pi/2*0.75))
				}
				if c.Bright != 0 || c.Contrast != 0 || c.Sat != 0 {
					vf = append(vf, fmt.Sprintf("eq=brightness=%s:contrast=%s:saturation=%s", f3(c.Bright*0.5), f3(1+c.Contrast), f3(1+c.Sat)))
				}
				if math.Abs(c.Hue) > 0.5 {
					vf = append(vf, "hue=h="+f3(c.Hue))
				}
				if wf := wheelsFF(c.Wheels); wf != "" {
					vf = append(vf, wf)
				}
				if cv := curvesFF(c.Curves); cv != "" {
					vf = append(vf, cv)
				}
				if c.Lut != "" {
					if _, err := os.Stat(c.Lut); err == nil {
						vf = append(vf, "lut3d=file="+ffPath(c.Lut))
					}
				}
				if c.Region != nil && c.Region.W > 0.005 && c.Region.H > 0.005 {
					vf = append(vf, regionFF(g, c.Region, fw, fh))
				}
				vf = append(vf, "format=yuva420p")
				if c.Mask != nil && c.Mask.W > 0.005 && c.Mask.H > 0.005 {
					mp := filepath.Join(tmpdir, fmt.Sprintf("maske-%s.png", c.ID))
					if err := writeClipMask(mp, c.Mask, fw, fh); err == nil {
						mi := g.input("-loop", "1", "-framerate", f3(FPS), "-t", f3(L), "-i", mp)
						a1, a2, al, mk, al2 := g.label(), g.label(), g.label(), g.label(), g.label()
						vf = append(vf, fmt.Sprintf("split[%s][%s];[%s]alphaextract[%s];[%d:v]format=gray,scale=%d:%d,setsar=1[%s];[%s][%s]blend=all_mode=multiply[%s];[%s][%s]alphamerge", a1, a2, a2, al, mi, fw, fh, mk, al, mk, al2, a1, al2))
					}
				}
				// Deckkraft zuerst (geq braucht gleich große Bilder), dann zeitabhängige Größe
				if ko := c.Kf["opacity"]; len(ko) > 0 {
					vf = append(vf, g.alphaKf(fw, fh, FPS, L, kfExpr(ko, "T")))
				} else if op < 0.999 {
					vf = append(vf, "colorchannelmixer=aa="+f3(op))
				}
				maxS := 1.0
				if len(ks) > 0 {
					for _, k := range ks {
						maxS = math.Max(maxS, k[1])
					}
					e := kfExpr(ks, "t")
					MW, MH := int(math.Ceil(float64(fw)*maxS/2))*2, int(math.Ceil(float64(fh)*maxS/2))*2
					s0, s1 := g.label(), g.label()
					// wechselnde Größe sofort auf eine feste Fläche setzen, damit die folgenden Filter gleich große Bilder bekommen
					vf = append(vf, fmt.Sprintf("scale=w='max(2,trunc(%d*(%s)/2)*2)':h='max(2,trunc(%d*(%s)/2)*2)':eval=frame[%s];color=c=black@0:s=%dx%d:r=%s:d=%s,format=yuva420p[%s];[%s][%s]overlay=x='(W-w)/2':y='(H-h)/2':eval=frame:format=auto:eof_action=pass,format=yuva420p",
						fw, e, fh, e, s1, MW, MH, f3(FPS), f3(L), s0, s0, s1))
					fw, fh = MW, MH
					maxS = 1
				}
				kx, ky, kr := c.Kf["x"], c.Kf["y"], c.Kf["rot"]
				if len(ks) > 0 || len(kx) > 0 || len(ky) > 0 || len(kr) > 0 {
					// animiert: Drehung und Lage als Formeln, die Ebene darf ihre Größe ändern
					if len(kr) > 0 || c.Rot != 0 {
						re := f3(c.Rot * math.Pi / 180)
						if len(kr) > 0 {
							re = "(" + kfExpr(kr, "t") + ")*PI/180"
						}
						D := int(math.Ceil(math.Hypot(float64(fw), float64(fh))*maxS/2)) * 2
						vf = append(vf, fmt.Sprintf("rotate='%s':c=none:ow=%d:oh=%d", re, D, D))
					}
					xe, ye := f3(c.X), f3(c.Y)
					if len(kx) > 0 {
						xe = kfExpr(kx, "t")
					}
					if len(ky) > 0 {
						ye = kfExpr(ky, "t")
					}
					cl, il := g.label(), g.label()
					g.add(strings.Join(vf, ",") + "[" + il + "]")
					g.add(canvas + "[" + cl + "]")
					g.add(fmt.Sprintf("[%s][%s]overlay=x='(W-w)/2+(%s)*W':y='(H-h)/2+(%s)*H':eval=frame:eof_action=pass:format=auto,trim=duration=%s,setpts=PTS-STARTPTS[%s]", cl, il, xe, ye, f3(L), lab))
					break
				}
				rw, rh := float64(fw), float64(fh)
				if c.Rot != 0 {
					r := c.Rot * math.Pi / 180
					vf = append(vf, fmt.Sprintf("rotate=%s:c=none:ow=rotw(%s):oh=roth(%s)", f3(r), f3(r), f3(r)))
					rw = math.Abs(float64(fw)*math.Cos(r)) + math.Abs(float64(fh)*math.Sin(r))
					rh = math.Abs(float64(fw)*math.Sin(r)) + math.Abs(float64(fh)*math.Cos(r))
				}
				x := (float64(W)-rw)/2 + c.X*float64(W)
				y := (float64(H)-rh)/2 + c.Y*float64(H)
				// Schnellweg: Bild füllt die Leinwand ganz und ist deckend – ohne durchsichtige Fläche und ohne Mischen.
				// Das spart pro Bild zwei Vollbild-Überlagerungen mit Transparenz (bei langen Videos sehr viel Zeit).
				nextTrans := ci+1 < len(clips) && clips[ci+1].TransIn != nil && clips[ci+1].TransIn.Dur > 0 && c.Start+L-clips[ci+1].Start > 0.04
				ownTrans := c.TransIn != nil && c.TransIn.Dur > 0 && prevEnd-c.Start > 0.04
				fa := -1
				for i := len(vf) - 1; i >= 0; i-- {
					if vf[i] == "format=yuva420p" {
						fa = i
						break
					}
				}
				if fa >= 0 && c.Rot == 0 && fw == W && fh == H && math.Round(x) == 0 && math.Round(y) == 0 && op >= 0.999 && len(c.Kf["opacity"]) == 0 &&
					c.Mask == nil && c.Key == "" && c.Matte == "" && blendModes[c.Blend] == "" && !strings.HasPrefix(c.Effect, "mirror") && !nextTrans && !ownTrans {
					vf[fa] = "format=yuv420p"
					g.add(strings.Join(vf, ",") + fmt.Sprintf(",trim=duration=%s,setpts=PTS-STARTPTS[%s]", f3(L), lab))
					break
				}
				cl, il := g.label(), g.label()
				g.add(strings.Join(vf, ",") + "[" + il + "]")
				g.add(canvas + "[" + cl + "]")
				g.add(fmt.Sprintf("[%s][%s]overlay=x=%d:y=%d:eof_action=pass:format=auto,trim=duration=%s,setpts=PTS-STARTPTS[%s]", cl, il, int(math.Round(x)), int(math.Round(y)), f3(L), lab))
			case "color":
				if ko := c.Kf["opacity"]; len(ko) > 0 {
					g.add(fmt.Sprintf("color=c=%s:s=%dx%d:r=%s:d=%s,format=yuva420p,%s[%s]", ffColor(c.Color, 1), W, H, f3(FPS), f3(L), g.alphaKf(W, H, FPS, L, kfExpr(ko, "T")), lab))
				} else {
					g.add(fmt.Sprintf("color=c=%s:s=%dx%d:r=%s:d=%s,format=yuva420p[%s]", ffColor(c.Color, op), W, H, f3(FPS), f3(L), lab))
				}
			case "text":
				tx := c.Text
				if tx == nil {
					continue
				}
				tf := filepath.Join(tmpdir, fmt.Sprintf("text%d.txt", g.n))
				os.WriteFile(tf, []byte(tx.Content), 0o644)
				fs := math.Max(6, tx.Size*float64(H))
				an := textAnim(c.Anim, L)
				fsE := f3(fs)
				if an.s != "" {
					fsE = "'" + f3(fs) + "*(" + an.s + ")'"
				}
				dt := []string{"fontsize=" + fsE, "fontcolor=" + ffColor(tx.Color, op)}
				if fp := fontPath(tx.Font, tx.Bold); fp != "" {
					dt = append(dt, "fontfile="+esc(fp))
				}
				if tx.Box != "" {
					dt = append(dt, "box=1", "boxcolor="+ffColor(tx.Box, 0.85*op), "boxborderw="+strconv.Itoa(int(fs*0.35)))
				}
				if tx.Outline > 0 {
					dt = append(dt, "borderw="+strconv.Itoa(int(math.Max(1, tx.Outline*fs*0.08))), "bordercolor="+ffColor(tx.OColor, op))
				}
				if tx.Shadow {
					dt = append(dt, "shadowcolor="+ffColor("000000", 0.6*op), "shadowx="+strconv.Itoa(int(math.Max(2, fs*0.05))), "shadowy="+strconv.Itoa(int(math.Max(2, fs*0.05))))
				}
				al := "1"
				if ko := c.Kf["opacity"]; len(ko) > 0 {
					al = "max(0,min(1," + kfExpr(ko, "t") + "))"
				}
				if an.a != "" {
					al = "(" + al + ")*(" + an.a + ")"
				}
				if al != "1" {
					dt = append(dt, "alpha='"+al+"'")
				}
				xe, ye := f3(c.X*float64(W)), f3(c.Y*float64(H))
				if k := c.Kf["x"]; len(k) > 0 {
					xe = fmt.Sprintf("(%s)*%d", kfExpr(k, "t"), W)
				}
				if k := c.Kf["y"]; len(k) > 0 {
					ye = fmt.Sprintf("(%s)*%d", kfExpr(k, "t"), H)
				}
				if an.dx != "" {
					xe = fmt.Sprintf("%s+(%s)*%d", xe, an.dx, W)
				}
				if an.dy != "" {
					ye = fmt.Sprintf("%s+(%s)*%d", ye, an.dy, H)
				}
				// Schreibmaschine: für jede Stufe ein eigener Text, der nur in seinem Zeitfenster sichtbar ist
				texts := func(base []string) string {
					if an.typeD <= 0 {
						return "drawtext=" + strings.Join(append([]string{"textfile=" + esc(tf)}, base...), ":")
					}
					rs := []rune(tx.Content)
					steps := len(rs)
					if steps > 120 {
						steps = 120
					}
					if steps < 1 {
						steps = 1
					}
					var out []string
					for k := 1; k <= steps; k++ {
						n := int(math.Ceil(float64(len(rs)) * float64(k) / float64(steps)))
						f := filepath.Join(tmpdir, fmt.Sprintf("text%d_%d.txt", g.n, k))
						os.WriteFile(f, []byte(string(rs[:n])), 0o644)
						a0, a1 := an.typeD*float64(k-1)/float64(steps), an.typeD*float64(k)/float64(steps)
						en := fmt.Sprintf("enable='between(t,%s,%s)'", f3(a0), f3(a1-0.0005))
						if k == steps {
							en = fmt.Sprintf("enable='gte(t,%s)'", f3(a0))
						}
						out = append(out, "drawtext="+strings.Join(append([]string{"textfile=" + esc(f), en}, base...), ":"))
					}
					return strings.Join(out, ",")
				}
				kr := c.Kf["rot"]
				if c.Rot == 0 && len(kr) == 0 {
					dt = append(dt, "x='(w-text_w)/2+"+xe+"'", "y='(h-text_h)/2+"+ye+"'", "line_spacing="+strconv.Itoa(int(fs*0.15)))
					g.add(fmt.Sprintf("color=c=black@0:s=%dx%d:r=%s:d=%s,format=rgba,%s,format=yuva420p[%s]", W, H, f3(FPS), f3(L), texts(dt), lab))
					break
				}
				// gedrehter Text: mittig auf eine große Fläche schreiben, drehen und an die Stelle setzen
				D := int(math.Ceil(math.Hypot(float64(W), float64(H))/2)) * 2
				re := f3(c.Rot * math.Pi / 180)
				if len(kr) > 0 {
					re = "(" + kfExpr(kr, "t") + ")*PI/180"
				}
				dt = append(dt, "x=(w-text_w)/2", "y=(h-text_h)/2", "line_spacing="+strconv.Itoa(int(fs*0.15)))
				il, cl := g.label(), g.label()
				g.add(fmt.Sprintf("color=c=black@0:s=%dx%d:r=%s:d=%s,format=rgba,%s,rotate='%s':c=none,format=yuva420p[%s]", D, D, f3(FPS), f3(L), texts(dt), re, il))
				g.add(canvas + "[" + cl + "]")
				g.add(fmt.Sprintf("[%s][%s]overlay=x='%d+%s':y='%d+%s':eval=frame:format=auto,trim=duration=%s,setpts=PTS-STARTPTS[%s]", cl, il, (W-D)/2, xe, (H-D)/2, ye, f3(L), lab))
			default:
				continue
			}
			// zur Kette mit dem vorigen Clip, wenn ein Übergang dazwischen liegt
			if len(chain) > 0 && c.TransIn != nil && c.TransIn.Dur > 0 && prevEnd-c.Start > 0.04 {
				chain = append(chain, built{c, lab, L})
			} else {
				flush()
				chain = []built{{c, lab, L}}
			}
			prevEnd = c.Start + L
		}
		flush()
	}

	// Ton mischen. Musik mit "Ducking" wird leiser, sobald der übrige Ton (Sprache) laut ist.
	alab := "aout"
	if len(ducks) > 0 && !noAudio {
		var din strings.Builder
		for _, l := range ducks {
			din.WriteString("[" + l + "]")
		}
		music := g.label()
		if len(ducks) > 1 {
			g.add(fmt.Sprintf("%samix=inputs=%d:duration=longest:normalize=0[%s]", din.String(), len(ducks), music))
		} else {
			g.add(fmt.Sprintf("[%s]anull[%s]", ducks[0], music))
		}
		if len(audios) == 0 {
			audios = append(audios, music)
		} else {
			var vin strings.Builder
			for _, l := range audios {
				vin.WriteString("[" + l + "]")
			}
			voice, v1, v2, ducked := g.label(), g.label(), g.label(), g.label()
			if len(audios) > 1 {
				g.add(fmt.Sprintf("%samix=inputs=%d:duration=longest:normalize=0[%s]", vin.String(), len(audios), voice))
			} else {
				g.add(fmt.Sprintf("[%s]anull[%s]", audios[0], voice))
			}
			g.add(fmt.Sprintf("[%s]asplit[%s][%s]", voice, v1, v2))
			g.add(fmt.Sprintf("[%s][%s]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[%s]", music, v1, ducked))
			audios = []string{v2, ducked}
		}
	}
	if noAudio {
		// GIF hat keinen Ton
	} else if len(audios) == 0 {
		g.add(fmt.Sprintf("anullsrc=r=48000:cl=stereo,atrim=duration=%s[aout]", f3(total)))
	} else if len(audios) == 1 {
		g.add(fmt.Sprintf("[%s]apad,atrim=duration=%s[aout]", audios[0], f3(total)))
	} else {
		var in strings.Builder
		for _, l := range audios {
			in.WriteString("[" + l + "]")
		}
		g.add(fmt.Sprintf("%samix=inputs=%d:duration=longest:normalize=0,atrim=duration=%s[aout]", in.String(), len(audios), f3(total)))
	}
	if ex.Loud && !noAudio && len(audios) > 0 {
		// Lautheit angleichen wie bei YouTube, TikTok und Co. (-14 LUFS, Spitzen höchstens -1 dB)
		lufs := ex.LUFS
		if lufs > -5 || lufs < -40 {
			lufs = -14
		}
		lra := 11.0
		if lufs <= -20 {
			lra = 15 // Fernsehen: mehr Dynamik erlaubt
		}
		extra := ""
		if m := ex.ln; m != nil && m["input_i"] != "" && m["input_i"] != "-inf" {
			// zweiter Durchgang: mit den gemessenen Werten genau auf das Ziel
			extra = fmt.Sprintf(":measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true",
				m["input_i"], m["input_tp"], m["input_lra"], m["input_thresh"], m["target_offset"])
		}
		g.add(fmt.Sprintf("[aout]loudnorm=I=%s:TP=-1:LRA=%s%s,aresample=48000[aloud]", f3(lufs), f3(lra), extra))
		alab = "aloud"
	}

	args := []string{"-hide_banner", "-nostdin", "-y"}
	args = append(args, g.inputs...)
	outH := p.H
	if ex.Res > 0 {
		outH = ex.Res
	}
	outW := int(math.Round(float64(p.W)*float64(outH)/float64(p.H)/2)) * 2
	final := fmt.Sprintf("[%s]scale=%d:%d:flags=lanczos,setsar=1", base, outW, outH)
	if outW == W && outH == H {
		final = fmt.Sprintf("[%s]setsar=1", base) // gleiche Größe: kein teures Umrechnen
	}
	q := ex.Quality
	pick := func(hi, rec, lo string) string {
		switch q {
		case "high":
			return hi
		case "low":
			return lo
		}
		return rec
	}
	switch ex.Format {
	case "png":
		final += ",format=rgb24"
	case "jpg":
		final += ",format=yuvj420p"
	case "gif":
		gw := min(outW, 720)
		final = fmt.Sprintf("[%s]fps=%s,scale=%d:-2:flags=lanczos,split[g1][g2];[g1]palettegen=stats_mode=diff[pal];[g2][pal]paletteuse=dither=sierra2_4a", base, f3(math.Min(FPS, 20)), gw)
	default:
		final += ",format=yuv420p"
	}
	if !audioOnly {
		g.add(final + "[vout]")
	}
	args = append(args, "-filter_complex", strings.Join(g.filters, ";"))
	if !audioOnly {
		args = append(args, "-map", "[vout]")
	}
	if !noAudio {
		args = append(args, "-map", "["+alab+"]")
	}
	switch ex.Format {
	case "mp4", "mov", "mkv":
		args = append(args, encArgs(g.enc, q, outW, outH, FPS)...)
		args = append(args, "-r", f3(FPS), "-c:a", "aac", "-b:a", pick("320k", "192k", "128k"))
		if ex.Format != "mkv" {
			args = append(args, "-movflags", "+faststart")
		}
	case "webm":
		args = append(args, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", pick("28", "32", "38"), "-row-mt", "1", "-r", f3(FPS), "-c:a", "libopus", "-b:a", "160k")
	case "avi":
		args = append(args, "-c:v", "mpeg4", "-q:v", pick("2", "4", "7"), "-r", f3(FPS), "-c:a", "libmp3lame", "-b:a", "192k")
	case "gif":
		args = append(args, "-loop", "0")
	case "mp3":
		args = append(args, "-c:a", "libmp3lame", "-b:a", pick("320k", "192k", "128k"))
	case "wav":
		args = append(args, "-c:a", "pcm_s16le")
	case "png":
		args = append(args, "-c:v", "png", "-r", f3(FPS))
	case "jpg":
		args = append(args, "-c:v", "mjpeg", "-q:v", pick("2", "3", "6"), "-r", f3(FPS))
	default:
		return nil, 0, errors.New("Unbekanntes Format.")
	}
	_ = seq
	if ex.Gentle {
		args = append(args, "-threads", gentleThreads())
		args = append([]string{"-filter_complex_threads", gentleThreads()}, args...)
	}
	if ex.End > ex.Start+0.04 && ex.Start < total {
		end := math.Min(ex.End, total)
		args = append(args, "-ss", f3(ex.Start), "-t", f3(end-ex.Start), "-progress", "pipe:1", "-nostats", out)
		return args, end - ex.Start, nil
	}
	args = append(args, "-t", f3(total), "-progress", "pipe:1", "-nostats", out)
	return args, total, nil
}

var exts = map[string]string{"mp4": ".mp4", "mov": ".mov", "mkv": ".mkv", "webm": ".webm", "avi": ".avi", "gif": ".gif", "mp3": ".mp3", "wav": ".wav", "png": ".png", "jpg": ".jpg"}

func (a *App) exportHandler(w http.ResponseWriter, r *http.Request) {
	var rq struct {
		ID     string
		Export Export
	}
	if json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq) != nil {
		kit.Fail(w, 400, "Ungültige Eingabe.")
		return
	}
	if !a.eng.Ready() {
		kit.Fail(w, 400, "Zum Exportieren fehlt noch ffmpeg. Richte es zuerst ein.")
		return
	}
	ex := rq.Export
	if _, ok := exts[ex.Format]; !ok {
		ex.Format = "mp4"
	}
	if st, err := os.Stat(ex.Dir); err != nil || !st.IsDir() {
		kit.Fail(w, 400, "Der Zielordner existiert nicht.")
		return
	}
	name := strings.Map(func(r rune) rune {
		if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
			return '_'
		}
		return r
	}, strings.TrimSpace(ex.Name))
	if name == "" {
		name = "Video"
	}
	a.mu.Lock()
	p := a.projects[rq.ID]
	if p == nil {
		a.mu.Unlock()
		kit.Fail(w, 404, "Projekt nicht gefunden.")
		return
	}
	if j := a.render[p.ID]; j != nil && j.Running {
		a.mu.Unlock()
		kit.Fail(w, 400, "Dieses Projekt wird gerade exportiert.")
		return
	}
	pe := ex
	p.Export = &pe
	a.save(p)
	b, _ := json.Marshal(p)
	a.mu.Unlock()
	var snap Project
	json.Unmarshal(b, &snap)
	out := filepath.Join(ex.Dir, name+exts[ex.Format])
	for i := 2; ; i++ {
		if _, err := os.Stat(out); err != nil {
			break
		}
		out = filepath.Join(ex.Dir, fmt.Sprintf("%s (%d)%s", name, i, exts[ex.Format]))
	}
	tmpdir, _ := os.MkdirTemp("", "videoschnitt")
	tmpOut := filepath.Join(filepath.Dir(out), ".videoschnitt-"+kit.RandID(3)+exts[ex.Format])
	if ex.Format == "png" || ex.Format == "jpg" {
		// Bildfolge: eigener Ordner, Dateien Name_00001.png …
		out = strings.TrimSuffix(out, exts[ex.Format])
		if err := os.MkdirAll(out, 0o755); err != nil {
			os.RemoveAll(tmpdir)
			kit.Fail(w, 400, "Der Ordner lässt sich nicht anlegen.")
			return
		}
		tmpOut = filepath.Join(out, name+"_%05d"+exts[ex.Format])
	}
	if ex.End > ex.Start+0.04 {
		trimWindow(&snap, ex.Start, ex.End) // nur der gewählte Bereich: Clips davor/danach gar nicht erst lesen
	}
	a.mu.Lock()
	args, total, err := a.build(&snap, &ex, tmpOut, tmpdir)
	a.mu.Unlock()
	if err != nil {
		os.RemoveAll(tmpdir)
		kit.Fail(w, 400, err.Error())
		return
	}
	j := &RenderJob{Running: true}
	a.mu.Lock()
	a.render[p.ID] = j
	a.mu.Unlock()
	go func() {
		// Stabilisieren: erste Stufe (Bewegung messen) für jeden Clip mit „Verwackeln ausgleichen“
		if m := a.prepStab(&snap, j, tmpdir); len(m) > 0 {
			ex.stab = m
			a.mu.Lock()
			if a2, t2, err := a.build(&snap, &ex, tmpOut, tmpdir); err == nil {
				args, total = a2, t2
			}
			a.mu.Unlock()
		}
		// Lautheit genau angleichen: zuerst den Ton messen, dann mit den Messwerten rendern
		if ex.Loud && ex.Format != "gif" && ex.Format != "png" && ex.Format != "jpg" {
			a.mu.Lock()
			j.Note = "Lautheit wird gemessen …"
			a.mu.Unlock()
			if m := a.measureLoudnorm(&snap, &ex, tmpdir); m != nil {
				ex.ln = m
				a.mu.Lock()
				if a2, t2, err := a.build(&snap, &ex, tmpOut, tmpdir); err == nil {
					args, total = a2, t2
				}
				a.mu.Unlock()
			}
			a.mu.Lock()
			j.Note = ""
			a.mu.Unlock()
		}
		a.runExport(j, args, total, tmpOut, out, tmpdir)
	}()
	kit.JSON(w, map[string]bool{"ok": true})
}

func (a *App) runExport(j *RenderJob, args []string, total float64, tmpOut, out, tmpdir string) {
	defer os.RemoveAll(tmpdir)
	// Mit Grafikkarte rendern; klappt das nicht (Treiber zu alt o. Ä.), automatisch mit der CPU noch einmal.
	var fb []string
	for i, x := range args {
		if (x == "-c:v" && i+1 < len(args) && isHW(args[i+1])) || x == "-hwaccel" {
			fb = swapToSoftware(args, quality(args))
			break
		}
	}
	a.mu.Lock()
	j.Engine = engineOf(args)
	a.mu.Unlock()
	if a.exportOnce(j, args, total, tmpOut, out, fb != nil) && fb != nil {
		a.mu.Lock()
		stopped := j.stop
		if !stopped {
			j.Running, j.Error, j.Done, j.ETA = true, "", 0, 0
			j.Engine, j.Note = "Prozessor (CPU)", "Die Grafikkarte ließ sich nicht nutzen – es wird mit dem Prozessor gerendert."
		}
		a.mu.Unlock()
		if !stopped {
			a.exportOnce(j, fb, total, tmpOut, out, false)
		}
	}
}

// exportOnce rendert einmal. Rückgabe true = fehlgeschlagen (nicht abgebrochen), ein zweiter Versuch ist sinnvoll.
func (a *App) exportOnce(j *RenderJob, args []string, total float64, tmpOut, out string, canRetry bool) (retry bool) {
	c := a.cmd(args...)
	stdout, _ := c.StdoutPipe()
	var errb strings.Builder
	c.Stderr = &limitWriter{b: &errb, max: 8000}
	j.mu.Lock()
	j.cmd = c
	j.mu.Unlock()
	start := time.Now()
	err := c.Start()
	if err == nil {
		sc := bufio.NewScanner(stdout)
		for sc.Scan() {
			if v, ok := strings.CutPrefix(sc.Text(), "out_time_us="); ok {
				us, _ := strconv.ParseFloat(v, 64)
				d := math.Min(0.99, us/1e6/total)
				a.mu.Lock()
				j.Done = d
				if d > 0.02 {
					el := time.Since(start).Seconds()
					j.ETA = int(el/d - el)
				}
				a.mu.Unlock()
			}
		}
		err = c.Wait()
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	j.Running = false
	if j.stop {
		os.Remove(tmpOut)
		j.Error = "Abgebrochen"
		return
	}
	if err != nil {
		os.Remove(tmpOut)
		msg := errb.String()
		if os.Getenv("VS_DEBUG") != "" {
			fmt.Fprintln(os.Stderr, strings.Join(args, " "), "\n", msg)
		}
		if canRetry && !strings.Contains(msg, "No space left") {
			j.Running = true // gleich zweiter Versuch mit der CPU
			return true
		}
		switch {
		case strings.Contains(msg, "No space left"):
			j.Error = "Auf dem Ziellaufwerk ist nicht genug Platz."
		default:
			l := strings.Split(strings.TrimSpace(msg), "\n")
			j.Error = "Der Export ist fehlgeschlagen: " + l[len(l)-1]
		}
		return
	}
	if strings.Contains(tmpOut, "%05d") {
		j.Done, j.Finish, j.Out = 1, true, out
		return
	}
	if err := os.Rename(tmpOut, out); err != nil {
		j.Error = "Die fertige Datei ließ sich nicht speichern."
		return
	}
	j.Done, j.Finish, j.Out = 1, true, out
	if st, err := os.Stat(out); err == nil {
		j.Size = st.Size()
	}
	return false
}

// motion liefert für Bewegungsübergänge die Filter für das alte (A) und neue (B) Bild und die Überblendart.
// T0 ist der Beginn des Übergangs in der Zeit von A, d seine Dauer.
func motion(typ string, T0, d float64, W, H int, fps float64) (string, string, string, bool) {
	pa := fmt.Sprintf("min(1,max(0,(t-%s)/%s))", f3(T0), f3(d))
	pai := fmt.Sprintf("min(1,max(0,(it-%s)/%s))", f3(T0), f3(d))
	pb := fmt.Sprintf("min(1,max(0,t/%s))", f3(d))
	pbi := fmt.Sprintf("min(1,max(0,it/%s))", f3(d))
	zoom := func(z string) string {
		return fmt.Sprintf("zoompan=z='%s':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=%dx%d:fps=%s", z, W, H, f3(fps))
	}
	shake := func(p string, amp float64, fr float64) string {
		return fmt.Sprintf("crop=w=iw*%s:h=ih*%s:x='(iw-ow)/2*(1+sin(t*%s)*sin(PI*%s))':y='(ih-oh)/2*(1+cos(t*%s)*sin(PI*%s))',scale=%d:%d", f3(1-amp), f3(1-amp), f3(fr), p, f3(fr*0.77), p, W, H)
	}
	blur := func(a, dd, sg float64) string {
		return fmt.Sprintf("gblur=sigma=%s:enable='between(t,%s,%s)'", f3(sg*float64(H)/1080), f3(a+dd*0.15), f3(a+dd*0.85))
	}
	rot := func(a string) string { return fmt.Sprintf("rotate='%s':c=none", a) }
	switch typ {
	case "m-zoomin":
		return zoom("1+1.2*pow(" + pai + ",2)"), zoom("1+0.6*pow(1-" + pbi + ",2)"), "fade", true
	case "m-zoomout":
		return zoom("1+0.3*" + pai), zoom("1+1.2*pow(1-" + pbi + ",2)"), "fade", true
	case "m-spin":
		return rot("PI*pow(" + pa + ",2)"), rot("-PI*pow(1-" + pb + ",2)"), "fade", true
	case "m-spinl":
		return rot("-PI*pow(" + pa + ",2)"), rot("PI*pow(1-" + pb + ",2)"), "fade", true
	case "m-spinzoom":
		return zoom("1+1*pow("+pai+",2)") + "," + rot("PI*0.5*pow("+pa+",2)"), zoom("1+1*pow(1-"+pbi+",2)") + "," + rot("-PI*0.5*pow(1-"+pb+",2)"), "fade", true
	case "m-shake":
		return shake(pa, 0.1, 47), shake("(1-"+pb+")", 0.1, 47), "fade", true
	case "m-glitch":
		return shake(pa, 0.06, 140) + fmt.Sprintf(",hue=h='if(gt(%s,0),180*sin(t*90)*%s,0)'", pa, pa), shake("(1-"+pb+")", 0.06, 140) + fmt.Sprintf(",hue=h='180*sin(t*90)*(1-%s)'", pb), "pixelize", true
	case "m-crosszoom":
		return zoom("1+1.5*pow("+pai+",2)") + "," + blur(T0, d, 14), zoom("1+1.5*pow(1-"+pbi+",2)") + "," + blur(0, d, 14), "fade", true
	case "m-speedblur":
		return blur(T0, d, 22), blur(0, d, 22), "fade", true
	case "m-whipl":
		return blur(T0, d, 26), blur(0, d, 26), "slideleft", true
	case "m-whipr":
		return blur(T0, d, 26), blur(0, d, 26), "slideright", true
	case "m-light":
		return fmt.Sprintf("colorbalance=rs=.45:gs=.18:bs=-.25:enable='between(t,%s,%s)',exposure=exposure=1.2:enable='between(t,%s,%s)'", f3(T0+d*0.2), f3(T0+d), f3(T0+d*0.4), f3(T0+d)),
			fmt.Sprintf("colorbalance=rs=.45:gs=.18:bs=-.25:enable='between(t,0,%s)'", f3(d*0.7)), "fadewhite", true
	case "m-burn":
		return fmt.Sprintf("colorbalance=rs=.7:gs=.1:bs=-.5:enable='between(t,%s,%s)'", f3(T0+d*0.3), f3(T0+d)), fmt.Sprintf("colorbalance=rs=.7:gs=.1:bs=-.5:enable='between(t,0,%s)'", f3(d*0.6)), "fadeblack", true
	case "m-flare":
		return fmt.Sprintf("exposure=exposure=2:enable='between(t,%s,%s)'", f3(T0+d*0.35), f3(T0+d)), zoom("1+0.2*pow(1-" + pbi + ",2)"), "fadewhite", true
	case "m-flash":
		return zoom("1+0.5*pow(" + pai + ",2)"), zoom("1+0.5*pow(1-" + pbi + ",2)"), "fadewhite", true
	}
	return "", "", "", false
}

// kfExpr baut aus Keyframes eine ffmpeg-Formel (weich zwischen den Punkten, wie in der Vorschau).
// kfLinear: Schlüsselbilder des gerade gebauten Clips gleichmäßig statt weich verbinden (z. B. bei Bewegungsverfolgung)
var kfLinear bool

func kfExpr(k [][2]float64, tv string) string {
	if len(k) == 1 {
		return f3(k[0][1])
	}
	e := f3(k[len(k)-1][1])
	for i := len(k) - 1; i >= 1; i-- {
		a, b := k[i-1], k[i]
		d := math.Max(1e-4, b[0]-a[0])
		u := fmt.Sprintf("((%s-%s)/%s)", tv, f3(a[0]), f3(d))
		if kfLinear {
			e = fmt.Sprintf("if(lt(%s,%s),%s+(%s)*%s,%s)", tv, f3(b[0]), f3(a[1]), f3(b[1]-a[1]), u, e)
			continue
		}
		e = fmt.Sprintf("if(lt(%s,%s),%s+(%s)*%s*%s*(3-2*%s),%s)", tv, f3(b[0]), f3(a[1]), f3(b[1]-a[1]), u, u, u, e)
	}
	return fmt.Sprintf("if(lt(%s,%s),%s,%s)", tv, f3(k[0][0]), f3(k[0][1]), e)
}

// alphaKf multipliert die Deckkraft eines Bildes mit einem zeitabhängigen Wert (0..1).
// Statt jeden Bildpunkt zu rechnen, wird eine winzige Graufläche berechnet und hochskaliert.
func (g *graph) alphaKf(w, h int, fps, L float64, expr string) string {
	a, b, ca, m, ma := g.label(), g.label(), g.label(), g.label(), g.label()
	return fmt.Sprintf("format=yuva420p,split[%s][%s];[%s]alphaextract[%s];color=c=black:s=16x16:r=%s:d=%s,format=gray,geq=lum='255*max(0,min(1,%s))',scale=%d:%d[%s];[%s][%s]blend=all_mode=multiply[%s];[%s][%s]alphamerge",
		a, b, b, ca, f3(fps), f3(L), expr, w, h, m, ca, m, ma, a, ma)
}

type textAnimExpr struct {
	dx, dy, a, s string
	typeD        float64
}

// textAnim baut die Formeln für Ein- und Ausgangsanimationen eines Textes (gleich wie in der Vorschau).
func textAnim(an *Anim, L float64) textAnimExpr {
	var r textAnimExpr
	if an == nil {
		return r
	}
	d := an.D
	if d <= 0 {
		d = 0.5
	}
	d = math.Min(d, L/2)
	eIn := fmt.Sprintf("(pow(min(1,max(0,t/%s)),2)*(3-2*min(1,max(0,t/%s))))", f3(d), f3(d))
	eOut := fmt.Sprintf("(pow(min(1,max(0,(%s-t)/%s)),2)*(3-2*min(1,max(0,(%s-t)/%s))))", f3(L), f3(d), f3(L), f3(d))
	var dx, dy, a, s []string
	add := func(kind, e string, out bool) {
		v := "0.25"
		if out {
			v = "-0.25"
		}
		switch kind {
		case "fade":
			a = append(a, e)
		case "slide-l":
			dx = append(dx, "-0.5*(1-"+e+")")
			a = append(a, e)
		case "slide-r":
			dx = append(dx, "0.5*(1-"+e+")")
			a = append(a, e)
		case "slide-u":
			dy = append(dy, v+"*(1-"+e+")")
			a = append(a, e)
		case "slide-d":
			dy = append(dy, "-"+v+"*(1-"+e+")")
			a = append(a, e)
		case "pop":
			s = append(s, "max(0.05,0.2+0.8*"+e+"+0.12*sin(PI*"+e+"))")
			a = append(a, "min(1,2*"+e+")")
		}
	}
	if an.In == "type" {
		r.typeD = math.Min(L*0.8, math.Max(d, 0.6))
	} else {
		add(an.In, eIn, false)
	}
	add(an.Out, eOut, true)
	j := func(x []string, op string) string { return strings.Join(x, op) }
	r.dx, r.dy, r.a, r.s = j(dx, "+"), j(dy, "+"), j(a, "*"), j(s, "*")
	return r
}

// Mischmodi wie in Filmora (Name in der Oberfläche -> ffmpeg blend)
var blendModes = map[string]string{"darken": "darken", "multiply": "multiply", "burn": "burn", "lighten": "lighten", "screen": "screen", "dodge": "dodge",
	"overlay": "overlay", "softlight": "softlight", "hardlight": "hardlight", "difference": "difference", "exclusion": "exclusion", "add": "addition"}

// voiceFF: Stimme verändern (Filter für ffmpeg)
func voiceFF(v string) string {
	switch v {
	case "chipmunk":
		return "aresample=48000,asetrate=" + f3(48000*1.5) + ",aresample=48000," + atempo(1/1.5)
	case "deep":
		return "aresample=48000,asetrate=" + f3(48000*0.75) + ",aresample=48000," + atempo(1/0.75)
	case "robot":
		return "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"
	case "echo":
		return "aecho=0.8:0.88:60:0.4"
	case "hall":
		return "aecho=0.8:0.9:400|800:0.35|0.25"
	case "phone":
		return "highpass=f=300,lowpass=f=3400"
	case "radio":
		return "highpass=f=180,lowpass=f=5000,acompressor=threshold=0.1:ratio=6"
	case "whisper":
		return "afftfilt=real='hypot(re,im)*cos((random(0)*2-1)*2*3.14)':imag='hypot(re,im)*sin((random(1)*2-1)*2*3.14)':win_size=128:overlap=0.8"
	}
	return ""
}

// curvesFF: Kurven als ffmpeg-Filter
func curvesFF(c *Curves) string {
	if c == nil {
		return ""
	}
	pts := func(a [][2]float64) string {
		if len(a) < 2 || (len(a) == 2 && a[0] == [2]float64{0, 0} && a[1] == [2]float64{1, 1}) {
			return ""
		}
		var b []string
		for _, p := range a {
			b = append(b, f3(math.Max(0, math.Min(1, p[0])))+"/"+f3(math.Max(0, math.Min(1, p[1]))))
		}
		return strings.Join(b, " ")
	}
	var parts []string
	for _, x := range []struct {
		k string
		a [][2]float64
	}{{"master", c.V}, {"red", c.R}, {"green", c.G}, {"blue", c.B}} {
		if v := pts(x.a); v != "" {
			parts = append(parts, x.k+"='"+v+"'")
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return "curves=" + strings.Join(parts, ":")
}

// ffPath: Dateipfad für Filteroptionen (Doppelpunkte und Backslashes maskieren)
func ffPath(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	p = strings.ReplaceAll(p, ":", "\\:")
	p = strings.ReplaceAll(p, "'", "\\'")
	return "'" + p + "'"
}

// regionFF: Bereich im Clipbild verpixeln oder unscharf machen
func regionFF(g *graph, r *Region, fw, fh int) string {
	w := int(math.Max(4, r.W*float64(fw))) / 2 * 2
	h := int(math.Max(4, r.H*float64(fh))) / 2 * 2
	x := int(math.Max(0, math.Min(float64(fw-w), (r.X-r.W/2)*float64(fw))))
	y := int(math.Max(0, math.Min(float64(fh-h), (r.Y-r.H/2)*float64(fh))))
	a, b, c := g.label(), g.label(), g.label()
	amt := math.Max(0.05, math.Min(1, r.Amt))
	var fx string
	if r.Mode == "pixel" {
		n := int(math.Max(2, amt*40))
		fx = fmt.Sprintf("scale=max(1\\,iw/%d):max(1\\,ih/%d),scale=%d:%d:flags=neighbor", n, n, w, h)
	} else {
		rad := int(math.Max(1, math.Min(float64(min(w, h))/4-1, amt*float64(min(w, h))/3)))
		fx = fmt.Sprintf("boxblur=%d:2", rad)
	}
	if len(r.Path) > 1 {
		// verfolgter Bereich: Lage als Formel über die Zeit
		xe := clampExpr(pathExpr(r.Path, 1, float64(fw), -float64(w)/2), float64(fw-w))
		ye := clampExpr(pathExpr(r.Path, 2, float64(fh), -float64(h)/2), float64(fh-h))
		return fmt.Sprintf("split[%s][%s];[%s]crop=%d:%d:x='%s':y='%s',%s[%s];[%s][%s]overlay=x='%s':y='%s':eval=frame", a, b, b, w, h, xe, ye, fx, c, a, c, xe, ye)
	}
	return fmt.Sprintf("split[%s][%s];[%s]crop=%d:%d:%d:%d,%s[%s];[%s][%s]overlay=%d:%d", a, b, b, w, h, x, y, fx, c, a, c, x, y)
}

// pathExpr: stückweise lineare Formel aus Punkten [t, x, y] (Spalte col), flach als Summe (keine tiefe Verschachtelung)
func pathExpr(p [][3]float64, col int, scale, off float64) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("lt(t,%s)*%s", f3(p[0][0]), f3(p[0][col]*scale+off)))
	for i := 1; i < len(p); i++ {
		a, b := p[i-1], p[i]
		d := math.Max(1e-4, b[0]-a[0])
		va, vb := a[col]*scale+off, b[col]*scale+off
		sb.WriteString(fmt.Sprintf("+gte(t,%s)*lt(t,%s)*(%s+(t-%s)*%s)", f3(a[0]), f3(b[0]), f3(va), f3(a[0]), f4((vb-va)/d)))
	}
	l := p[len(p)-1]
	sb.WriteString(fmt.Sprintf("+gte(t,%s)*%s", f3(l[0]), f3(l[col]*scale+off)))
	return sb.String()
}

func clampExpr(e string, max float64) string {
	return fmt.Sprintf("clip(%s,0,%s)", e, f3(math.Max(0, max)))
}

func f4(v float64) string { return strconv.FormatFloat(v, 'f', 5, 64) }

// writeClipMask: Maske als Graustufenbild (weiß = sichtbar) mit weicher Kante
func writeClipMask(path string, m *Mask, w, h int) error {
	img := image.NewGray(image.Rect(0, 0, w, h))
	cx, cy := m.X*float64(w), m.Y*float64(h)
	rx, ry := math.Max(1, m.W*float64(w)/2), math.Max(1, m.H*float64(h)/2)
	f := math.Max(0.001, m.Feather) * math.Min(rx, ry) * 2
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dx, dy := float64(x)+0.5-cx, float64(y)+0.5-cy
			var d float64 // Abstand zum Rand (negativ = innen), in Pixeln
			if m.Shape == "ellipse" {
				k := math.Hypot(dx/rx, dy/ry)
				d = (k - 1) * math.Min(rx, ry)
			} else {
				d = math.Max(math.Abs(dx)-rx, math.Abs(dy)-ry)
			}
			v := math.Max(0, math.Min(1, 0.5-d/f))
			if m.Feather <= 0.0005 {
				if d <= 0 {
					v = 1
				} else {
					v = 0
				}
			}
			if m.Invert {
				v = 1 - v
			}
			img.SetGray(x, y, color.Gray{Y: uint8(v * 255)})
		}
	}
	fh, err := os.Create(path)
	if err != nil {
		return err
	}
	defer fh.Close()
	return png.Encode(fh, img)
}

// engineOf: womit gerendert wird (für die Anzeige im Export).
func engineOf(args []string) string {
	for i, x := range args {
		if x == "-c:v" && i+1 < len(args) {
			if n := hwName(args[i+1]); n != "" {
				return n
			}
			return "Prozessor (CPU)"
		}
	}
	return ""
}

// quality liest die Qualitätsstufe aus den x264-/Encoder-Einstellungen zurück (für den CPU-Ersatz).
func quality(args []string) string {
	for i, x := range args {
		if (x == "-cq" || x == "-global_quality") && i+1 < len(args) {
			switch args[i+1] {
			case "19":
				return "high"
			case "28":
				return "low"
			}
			return "rec"
		}
		if x == "-quality" && i+1 < len(args) {
			return map[string]string{"quality": "high", "speed": "low"}[args[i+1]] + map[bool]string{true: "rec"}[args[i+1] == "balanced"]
		}
	}
	return "rec"
}

// trimWindow entfernt Clips außerhalb des Export-Bereichs und kürzt einfache Clips am Anfang,
// damit beim Export eines Teils nicht das ganze Video davor dekodiert werden muss.
func trimWindow(p *Project, s, e float64) {
	for _, t := range p.Tracks {
		var keep []*Clip
		for _, c := range t.Clips {
			L := c.Length()
			if c.Start+L <= s+0.001 || c.Start >= e-0.001 {
				continue
			}
			d := s - c.Start
			if d > 0.05 && len(c.Kf) == 0 && c.Anim == nil && c.TransIn == nil && !c.Reverse && d >= c.FadeIn {
				sp := c.Speed
				if sp <= 0 {
					sp = 1
				}
				switch {
				case c.Type == "media" && c.Out > c.In:
					c.In += d * sp
					c.Start = s
					c.FadeIn = 0
				case c.Type != "media" || c.Out <= c.In:
					if c.Dur > d {
						c.Dur -= d
						c.Start = s
						c.FadeIn = 0
					}
				}
			}
			keep = append(keep, c)
		}
		t.Clips = keep
	}
}

// wheelsFF: Farbräder als Tabelle je Farbkanal – dieselbe Formel wie in der Vorschau (color.js):
// v = x·Gain + Lift·(1−x), dann v^Gamma, dann + Offset.
func wheelsFF(w *Wheels) string {
	if w == nil {
		return ""
	}
	zero := true
	for i := 0; i < 4; i++ {
		if w.Lift[i] != 0 || w.Gamma[i] != 0 || w.Gain[i] != 0 || w.Offset[i] != 0 {
			zero = false
		}
	}
	if zero {
		return ""
	}
	ch := func(i int) string {
		L := 0.25 * (w.Lift[3] + w.Lift[i])
		G := 1 + 0.5*(w.Gain[3]+w.Gain[i])
		Gm := math.Exp(-0.7 * (w.Gamma[3] + w.Gamma[i]))
		O := 0.25 * (w.Offset[3] + w.Offset[i])
		return fmt.Sprintf("'clip(255*(pow(clip(val/255*%s+%s*(1-val/255),0,1),%s)+%s),0,255)'", f4(G), f4(L), f4(Gm), f4(O))
	}
	return "lutrgb=r=" + ch(0) + ":g=" + ch(1) + ":b=" + ch(2)
}

// audioFxFF: Tonbearbeitung je Clip wie in Fairlight (Reihenfolge wie im Kanalzug: Filter, Gate, De-Esser, Kompressor, Gain, Limiter).
func audioFxFF(x *AudioFx) []string {
	if x == nil {
		return nil
	}
	var af []string
	if x.HPF >= 20 {
		af = append(af, fmt.Sprintf("highpass=f=%d:p=2", int(x.HPF)))
	}
	if x.LPF >= 1000 && x.LPF < 20000 {
		af = append(af, fmt.Sprintf("lowpass=f=%d:p=2", int(x.LPF)))
	}
	if x.Gate < -1 {
		thr := math.Pow(10, x.Gate/20)
		af = append(af, fmt.Sprintf("agate=threshold=%s:ratio=4:attack=5:release=120:range=0.06", f4(thr)))
	}
	if x.DeEss > 0.01 {
		af = append(af, fmt.Sprintf("deesser=i=%s:m=0.5:f=0.5:s=o", f3(math.Min(1, x.DeEss))))
	}
	if x.Comp > 0.01 {
		k := math.Min(1, x.Comp)
		thr := math.Pow(10, (-10-20*k)/20) // −10 … −30 dB
		ratio := 2 + 6*k
		makeup := math.Pow(10, (6*k)/20)
		af = append(af, fmt.Sprintf("acompressor=threshold=%s:ratio=%s:attack=10:release=150:makeup=%s:knee=4", f4(thr), f3(ratio), f3(makeup)))
	}
	if math.Abs(x.Gain) > 0.05 {
		af = append(af, fmt.Sprintf("volume=%sdB", f3(x.Gain)))
	}
	if x.Limit {
		af = append(af, "alimiter=limit=0.891:attack=5:release=50:level=false")
	}
	return af
}

// loudnessHandler misst die Lautheit der ganzen Zeitleiste (wie die Lautheitsanzeige in Fairlight).
func (a *App) loudnessHandler(w http.ResponseWriter, r *http.Request) {
	if !a.eng.Ready() {
		kit.Fail(w, 400, "Zum Messen fehlt noch ffmpeg. Richte es zuerst ein.")
		return
	}
	a.mu.Lock()
	p := a.projects[r.URL.Query().Get("id")]
	if p == nil {
		a.mu.Unlock()
		kit.Fail(w, 404, "Projekt nicht gefunden.")
		return
	}
	b, _ := json.Marshal(p)
	a.mu.Unlock()
	var snap Project
	json.Unmarshal(b, &snap)
	tmpdir, err := os.MkdirTemp("", "videoschnitt-lufs-")
	if err != nil {
		kit.Fail(w, 500, err.Error())
		return
	}
	defer os.RemoveAll(tmpdir)
	out := filepath.Join(tmpdir, "mix.wav")
	ex := Export{Format: "wav"}
	a.mu.Lock()
	args, _, err := a.build(&snap, &ex, out, tmpdir)
	a.mu.Unlock()
	if err != nil {
		kit.Fail(w, 400, err.Error())
		return
	}
	if o, err := a.cmd(args...).CombinedOutput(); err != nil {
		kit.Fail(w, 500, "Der Ton ließ sich nicht berechnen: "+lastLine(string(o)))
		return
	}
	o, _ := a.cmd("-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-").CombinedOutput()
	s := string(o)
	if i := strings.LastIndex(s, "Summary:"); i >= 0 {
		s = s[i:]
	}
	num := func(re string) float64 {
		m := regexp.MustCompile(re).FindStringSubmatch(s)
		if m == nil {
			return 0
		}
		v, _ := strconv.ParseFloat(m[1], 64)
		return v
	}
	kit.JSON(w, map[string]float64{
		"i":    num(`I:\s+(-?[\d.]+) LUFS`),
		"lra":  num(`LRA:\s+(-?[\d.]+) LU`),
		"peak": num(`Peak:\s+(-?[\d.]+) dBFS`),
	})
}

func lastLine(s string) string {
	l := strings.Split(strings.TrimSpace(s), "\n")
	return l[len(l)-1]
}

// measureLoudnorm rendert nur den Ton und misst ihn mit loudnorm (erster von zwei Durchgängen).
func (a *App) measureLoudnorm(p *Project, ex *Export, tmpdir string) map[string]string {
	wav := filepath.Join(tmpdir, "lautheit.wav")
	e2 := Export{Format: "wav", Start: ex.Start, End: ex.End}
	a.mu.Lock()
	args, _, err := a.build(p, &e2, wav, tmpdir)
	a.mu.Unlock()
	if err != nil {
		return nil
	}
	if err := a.cmd(args...).Run(); err != nil {
		return nil
	}
	defer os.Remove(wav)
	lufs := ex.LUFS
	if lufs > -5 || lufs < -40 {
		lufs = -14
	}
	lra := 11.0
	if lufs <= -20 {
		lra = 15
	}
	o, _ := a.cmd("-hide_banner", "-nostats", "-i", wav, "-af", fmt.Sprintf("loudnorm=I=%s:TP=-1:LRA=%s:print_format=json", f3(lufs), f3(lra)), "-f", "null", "-").CombinedOutput()
	s := string(o)
	i, k := strings.LastIndex(s, "{"), strings.LastIndex(s, "}")
	if i < 0 || k < i {
		return nil
	}
	m := map[string]string{}
	if json.Unmarshal([]byte(s[i:k+1]), &m) != nil {
		return nil
	}
	return m
}

func hexRGB(h string) (r, g, b int, ok bool) {
	h = strings.TrimPrefix(h, "#")
	if len(h) != 6 {
		return 0, 0, 0, false
	}
	v, err := strconv.ParseUint(h, 16, 32)
	if err != nil {
		return 0, 0, 0, false
	}
	return int(v >> 16 & 255), int(v >> 8 & 255), int(v & 255), true
}

var vidstabOK *bool

// hasVidstab prüft einmal, ob das installierte ffmpeg vid.stab kann.
func (a *App) hasVidstab() bool {
	if vidstabOK != nil {
		return *vidstabOK
	}
	o, _ := a.cmd("-hide_banner", "-filters").Output()
	ok := strings.Contains(string(o), "vidstabdetect")
	vidstabOK = &ok
	return ok
}

// prepStab misst für jeden zu stabilisierenden Clip die Kamerabewegung (vid.stab, erste Stufe).
func (a *App) prepStab(p *Project, j *RenderJob, tmpdir string) map[string]string {
	var list []*Clip
	for _, t := range p.Tracks {
		for _, c := range t.Clips {
			if c.Stab && c.Type == "media" {
				list = append(list, c)
			}
		}
	}
	if len(list) == 0 || !a.hasVidstab() {
		return nil
	}
	out := map[string]string{}
	for n, c := range list {
		var m *Media
		for _, x := range p.Media {
			if x.ID == c.MediaID {
				m = x
			}
		}
		if m == nil || m.Kind != "video" || c.Out <= c.In {
			continue
		}
		a.mu.Lock()
		stopped := j.stop
		j.Note = fmt.Sprintf("Bewegung wird gemessen (%d von %d) …", n+1, len(list))
		a.mu.Unlock()
		if stopped {
			return nil
		}
		trf := filepath.Join(tmpdir, "stab-"+c.ID+".trf")
		cmd := a.cmd("-hide_banner", "-nostdin", "-ss", f3(c.In), "-t", f3(c.Out-c.In), "-i", m.Path, "-an",
			"-vf", "vidstabdetect=shakiness=6:accuracy=12:result="+ffPath(trf), "-f", "null", "-")
		if err := cmd.Run(); err == nil {
			if st, err := os.Stat(trf); err == nil && st.Size() > 0 {
				out[c.ID] = trf
			}
		}
	}
	a.mu.Lock()
	j.Note = ""
	a.mu.Unlock()
	return out
}

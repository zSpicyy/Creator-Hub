package upscale

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"kit"
	"kit/ai"
	"kit/ort"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

type Project struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Created int64   `json:"created"`
	Updated int64   `json:"updated"`
	Detail  string  `json:"detail"`
	Source  string  `json:"source"`
	W       int     `json:"w"`
	H       int     `json:"h"`
	Factor  float64 `json:"factor"`
	Sharp   float64 `json:"sharp"`
	Format  string  `json:"format"`
	Quality int     `json:"quality"`
	OutDir  string  `json:"outDir"`
	Result  string  `json:"result"`
	ResultW int     `json:"resultW"`
	ResultH int     `json:"resultH"`
	Bytes   int64   `json:"bytes"`
	AI      bool    `json:"ai"`
}

type Job struct {
	Running bool    `json:"running"`
	Done    float64 `json:"done"`
	Error   string  `json:"error"`
	Finish  bool    `json:"finish"`
	Started int64   `json:"-"`
	ETA     int     `json:"eta"`
}

type App struct {
	cmu      sync.Mutex
	cID      string
	cImg     *image.NRGBA
	mu       sync.Mutex
	root     string
	projects map[string]*Project
	jobs     map[string]*Job
}

func dataRoot() string {
	d, err := os.UserConfigDir()
	if err != nil {
		d = "."
	}
	return filepath.Join(d, "Upscaler")
}

func (a *App) dir(id string) string { return filepath.Join(a.root, "projects", id) }

func (a *App) save(p *Project) {
	os.MkdirAll(a.dir(p.ID), 0o755)
	b, _ := json.MarshalIndent(p, "", "  ")
	tmp := filepath.Join(a.dir(p.ID), "project.json.tmp")
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, filepath.Join(a.dir(p.ID), "project.json"))
	}
}

func newApp() *App {
	a := &App{root: dataRoot(), projects: map[string]*Project{}, jobs: map[string]*Job{}}
	os.MkdirAll(filepath.Join(a.root, "projects"), 0o755)
	entries, _ := os.ReadDir(filepath.Join(a.root, "projects"))
	for _, e := range entries {
		b, err := os.ReadFile(filepath.Join(a.root, "projects", e.Name(), "project.json"))
		var p Project
		if err == nil && json.Unmarshal(b, &p) == nil && p.ID != "" {
			a.projects[p.ID] = &p
		}
	}
	return a
}

// decode liest ein Bild und liefert es als NRGBA. Gedreht wird nach der EXIF-Angabe der Kamera.
func decode(path string) (*image.NRGBA, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, errors.New("Die Datei lässt sich nicht öffnen.")
	}
	defer f.Close()
	img, format, err := image.Decode(f)
	if err != nil {
		return nil, errors.New("Dieses Bildformat kann ich noch nicht lesen. Unterstützt: PNG, JPG, GIF.")
	}
	var n *image.NRGBA
	if v, ok := img.(*image.NRGBA); ok {
		n = v
	} else {
		b := img.Bounds()
		n = image.NewNRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
		draw.Draw(n, n.Bounds(), img, b.Min, draw.Src)
	}
	if format == "jpeg" {
		if o := exifOrientation(path); o > 1 {
			n = orient(n, o)
		}
	}
	_ = gif.Decode
	return n, nil
}

func exifOrientation(path string) int {
	f, err := os.Open(path)
	if err != nil {
		return 1
	}
	defer f.Close()
	buf := make([]byte, 65536)
	n, _ := io.ReadFull(f, buf)
	b := buf[:n]
	if len(b) < 4 || b[0] != 0xFF || b[1] != 0xD8 {
		return 1
	}
	i := 2
	for i+4 < len(b) {
		if b[i] != 0xFF {
			return 1
		}
		m := b[i+1]
		l := int(b[i+2])<<8 | int(b[i+3])
		if m == 0xE1 && i+4+14 < len(b) && string(b[i+4:i+10]) == "Exif\x00\x00" {
			t := b[i+10:]
			le := t[0] == 'I'
			u16 := func(o int) int {
				if o+2 > len(t) {
					return 0
				}
				if le {
					return int(t[o]) | int(t[o+1])<<8
				}
				return int(t[o])<<8 | int(t[o+1])
			}
			u32 := func(o int) int {
				if o+4 > len(t) {
					return 0
				}
				if le {
					return int(t[o]) | int(t[o+1])<<8 | int(t[o+2])<<16 | int(t[o+3])<<24
				}
				return int(t[o])<<24 | int(t[o+1])<<16 | int(t[o+2])<<8 | int(t[o+3])
			}
			ifd := u32(4)
			cnt := u16(ifd)
			for k := 0; k < cnt && k < 64; k++ {
				e := ifd + 2 + k*12
				if u16(e) == 0x0112 {
					return u16(e + 8)
				}
			}
			return 1
		}
		if m == 0xDA {
			return 1
		}
		i += 2 + l
	}
	return 1
}

func orient(s *image.NRGBA, o int) *image.NRGBA {
	w, h := s.Bounds().Dx(), s.Bounds().Dy()
	nw, nh := w, h
	if o >= 5 {
		nw, nh = h, w
	}
	d := image.NewNRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch o {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			default:
				dx, dy = x, y
			}
			copy(d.Pix[dy*d.Stride+dx*4:dy*d.Stride+dx*4+4], s.Pix[y*s.Stride+x*4:y*s.Stride+x*4+4])
		}
	}
	return d
}

// fit verkleinert per Flächenmittelwert, für Vorschau und Projektbild.
func fit(s *image.NRGBA, maxSide int) *image.NRGBA {
	w, h := s.Bounds().Dx(), s.Bounds().Dy()
	if w <= maxSide && h <= maxSide {
		return s
	}
	k := float64(maxSide) / float64(max(w, h))
	nw, nh := max(1, int(float64(w)*k)), max(1, int(float64(h)*k))
	d := image.NewNRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		y0, y1 := y*h/nh, max((y+1)*h/nh, y*h/nh+1)
		for x := 0; x < nw; x++ {
			x0, x1 := x*w/nw, max((x+1)*w/nw, x*w/nw+1)
			var r, g, b, al, c float64
			for yy := y0; yy < y1; yy++ {
				for xx := x0; xx < x1; xx++ {
					p := s.Pix[yy*s.Stride+xx*4:]
					a := float64(p[3])
					r += float64(p[0]) * a
					g += float64(p[1]) * a
					b += float64(p[2]) * a
					al += a
					c++
				}
			}
			o := d.Pix[y*d.Stride+x*4:]
			if al > 0 {
				o[0], o[1], o[2] = uint8(r/al), uint8(g/al), uint8(b/al)
			}
			o[3] = uint8(al / c)
		}
	}
	return d
}

func writeSmall(path string, img *image.NRGBA, pngOut bool) {
	f, err := os.Create(path)
	if err != nil {
		return
	}
	defer f.Close()
	if pngOut {
		png.Encode(f, img)
		return
	}
	bg := image.NewRGBA(img.Bounds())
	draw.Draw(bg, bg.Bounds(), image.NewUniform(image.White), image.Point{}, draw.Src)
	draw.Draw(bg, bg.Bounds(), img, image.Point{}, draw.Over)
	jpeg.Encode(f, bg, &jpeg.Options{Quality: 82})
}

func (a *App) openImage(path string) (*Project, error) {
	path = strings.Trim(strings.TrimSpace(path), `"`)
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return nil, errors.New("Diese Datei gibt es nicht.")
	}
	img, err := decode(path)
	if err != nil {
		return nil, err
	}
	p := &Project{ID: kit.RandID(6), Name: strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)), Created: time.Now().Unix(), Updated: time.Now().Unix(),
		Source: path, W: img.Bounds().Dx(), H: img.Bounds().Dy(), Factor: 4, Sharp: 0.6, Format: "png", Quality: 95, OutDir: filepath.Dir(path)}
	p.Detail = fmt.Sprintf("%d × %d Pixel", p.W, p.H)
	os.MkdirAll(a.dir(p.ID), 0o755)
	writeSmall(filepath.Join(a.dir(p.ID), "preview.png"), fit(img, 1800), true)
	writeSmall(filepath.Join(a.dir(p.ID), "thumb.jpg"), fit(img, 320), false)
	a.mu.Lock()
	a.projects[p.ID] = p
	a.save(p)
	a.mu.Unlock()
	return p, nil
}

func uniquePath(dir, name, ext string) string {
	p := filepath.Join(dir, name+ext)
	for i := 2; ; i++ {
		if _, err := os.Stat(p); err != nil {
			return p
		}
		p = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", name, i, ext))
	}
}

type RenderReq struct {
	ID      string  `json:"id"`
	Factor  float64 `json:"factor"`
	Sharp   float64 `json:"sharp"`
	Format  string  `json:"format"`
	Quality int     `json:"quality"`
	OutDir  string  `json:"outDir"`
	AI      bool    `json:"ai"`
}

func (a *App) render(rq RenderReq) error {
	a.mu.Lock()
	p := a.projects[rq.ID]
	if p == nil {
		a.mu.Unlock()
		return errors.New("Projekt nicht gefunden.")
	}
	if j := a.jobs[p.ID]; j != nil && j.Running {
		a.mu.Unlock()
		return errors.New("Es läuft schon eine Berechnung.")
	}
	if rq.Factor < 1.1 || rq.Factor > 64 {
		a.mu.Unlock()
		return errors.New("Der Faktor muss zwischen 1,1 und 64 liegen.")
	}
	// Format folgt dem Original: JPG bleibt JPG, alles andere wird PNG
	if rq.Format == "" {
		if e := strings.ToLower(filepath.Ext(p.Source)); e == ".jpg" || e == ".jpeg" {
			rq.Format = "jpg"
		}
	}
	if rq.Format != "jpg" {
		rq.Format = "png"
	}
	rq.AI = true // Der Upscaler arbeitet immer mit KI
	if !ai.Ready("upscale") {
		a.mu.Unlock()
		return errors.New("Die KI ist noch nicht eingerichtet.")
	}
	if rq.Quality < 40 || rq.Quality > 100 {
		rq.Quality = 95
	}
	if rq.OutDir == "" {
		rq.OutDir = filepath.Dir(p.Source)
	}
	if st, err := os.Stat(rq.OutDir); err != nil || !st.IsDir() {
		a.mu.Unlock()
		return errors.New("Der Zielordner existiert nicht.")
	}
	p.Factor, p.Sharp, p.Format, p.Quality, p.OutDir, p.AI = rq.Factor, rq.Sharp, rq.Format, rq.Quality, rq.OutDir, rq.AI
	job := &Job{Running: true, Started: time.Now().Unix()}
	a.jobs[p.ID] = job
	snap := *p
	a.mu.Unlock()

	go func() {
		err := a.doRender(&snap, job)
		a.mu.Lock()
		defer a.mu.Unlock()
		job.Running = false
		if err != nil {
			job.Error = err.Error()
			return
		}
		job.Done, job.Finish = 1, true
		p.Result, p.ResultW, p.ResultH, p.Bytes, p.Updated = snap.Result, snap.ResultW, snap.ResultH, snap.Bytes, time.Now().Unix()
		p.Detail = fmt.Sprintf("%d × %d → %d × %d", p.W, p.H, p.ResultW, p.ResultH)
		a.save(p)
	}()
	return nil
}

func (a *App) doRender(p *Project, job *Job) error {
	src, err := decode(p.Source)
	if err != nil {
		return err
	}
	ext := ".png"
	if p.Format == "jpg" {
		ext = ".jpg"
	}
	name := fmt.Sprintf("%s_x%s", p.Name, strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", p.Factor), "0"), "."))
	out := uniquePath(p.OutDir, name, ext)
	tmp := out + ".upscaler-tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return errors.New("Die Zieldatei lässt sich nicht anlegen. Ist der Ordner beschreibbar?")
	}
	started := time.Now()
	progress := func(d float64) {
		a.mu.Lock()
		job.Done = d * 0.98
		if d > 0.02 {
			el := time.Since(started).Seconds()
			job.ETA = int(el/d - el)
		}
		a.mu.Unlock()
	}
	var ri RowImage
	var cleanup func()
	if p.AI {
		ri, cleanup, err = a.aiPipeline(src, p.Factor, out, progress)
		if err != nil {
			f.Close()
			os.Remove(tmp)
			return err
		}
	} else {
		sc := NewScaler(src, p.Factor, p.Sharp)
		sc.Progress = progress
		ri = sc
	}
	if p.Format == "jpg" {
		err = WriteJPEG(ri, f, p.Quality)
	} else {
		err = WritePNG(ri, f)
	}
	if cleanup != nil {
		cleanup()
	}
	if ar, ok := ri.(*aiRows); ok && ar.err != nil && err == nil {
		err = ar.err
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp)
		if strings.Contains(err.Error(), "no space") || strings.Contains(err.Error(), "Speicherplatz") || strings.Contains(err.Error(), "disk is full") {
			return errors.New("Auf dem Ziellaufwerk ist nicht genug Platz.")
		}
		return err
	}
	if err := os.Rename(tmp, out); err != nil {
		os.Remove(tmp)
		return err
	}
	st, _ := os.Stat(out)
	p.Result = out
	p.ResultW, p.ResultH = ri.Size()
	if st != nil {
		p.Bytes = st.Size()
	}
	return nil
}

// aiPipeline: KI vergrößert ×4, danach wird bei Bedarf sauber auf den gewünschten Faktor gebracht.
func (a *App) aiPipeline(src *image.NRGBA, factor float64, out string, progress func(float64)) (RowImage, func(), error) {
	sess, err := ai.Session("upscale")
	if err != nil {
		return nil, nil, err
	}
	if factor > 4.5 {
		// Mehr als 4-fach: die KI rechnet zweimal (erst auf das Doppelte, dann ×4). Das wird deutlich
		// schärfer, als ein 4-fach-Ergebnis nur weich weiter zu vergrößern.
		mid, err := aiDouble(src, sess, out+".ki-tmp0", func(d float64) { progress(d * 0.2) })
		if err != nil {
			return nil, nil, err
		}
		src = mid
		factor /= 2
		inner := progress
		progress = func(d float64) { inner(0.2 + d*0.8) }
	}
	ar, err := newAIRows(src, sess)
	if err != nil {
		return nil, nil, err
	}
	if math.Abs(factor-4) < 1e-6 {
		ar.Progress = progress
		return ar, nil, nil
	}
	ar.Progress = func(d float64) { progress(d * 0.85) }
	raw := out + ".ki-tmp"
	fr, err := spool(ar, raw)
	if err != nil {
		return nil, nil, err
	}
	if ar.err != nil {
		fr.f.Close()
		os.Remove(raw)
		return nil, nil, ar.err
	}
	sc := NewScalerFrom(fr, factor/4, 0, ar.opaque)
	sc.Progress = func(d float64) { progress(0.85 + d*0.15) }
	return sc, func() { fr.f.Close(); os.Remove(raw) }, nil
}

// sample rechnet einen kleinen Ausschnitt mit den gewählten Einstellungen, damit man sie vor dem Rendern beurteilen kann.
func (a *App) sample(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id := q.Get("id")
	a.mu.Lock()
	p := a.projects[id]
	a.mu.Unlock()
	if p == nil {
		http.NotFound(w, r)
		return
	}
	a.cmu.Lock()
	if a.cID != id {
		img, err := decode(p.Source)
		if err != nil {
			a.cmu.Unlock()
			kit.Fail(w, 400, err.Error())
			return
		}
		a.cID, a.cImg = id, img
	}
	src := a.cImg
	a.cmu.Unlock()
	var fx, fy, factor, sharp float64
	fmt.Sscanf(q.Get("x"), "%g", &fx)
	fmt.Sscanf(q.Get("y"), "%g", &fy)
	fmt.Sscanf(q.Get("f"), "%g", &factor)
	fmt.Sscanf(q.Get("s"), "%g", &sharp)
	if factor < 1.1 {
		factor = 1.1
	}
	if factor > 64 {
		factor = 64
	}
	// Ganzes Bild: die Vorschau zeigt alles (große Bilder dafür verkleinert, das fertige Bild rechnet in voller Größe)
	if q.Get("whole") == "1" {
		sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
		if m := max(sw, sh); m > 900 {
			src = toImage(NewScalerFrom(nrgbaSource{src}, 900/float64(m), 0, false))
		}
		fx, fy = 0.5, 0.5
		q.Set("bw", fmt.Sprint(float64(src.Bounds().Dx())*factor+factor))
		q.Set("bh", fmt.Sprint(float64(src.Bounds().Dy())*factor+factor))
	}
	bw, bh := 360.0, 280.0
	fmt.Sscanf(q.Get("bw"), "%g", &bw)
	fmt.Sscanf(q.Get("bh"), "%g", &bh)
	if q.Get("whole") != "1" {
		bw, bh = math.Min(math.Max(bw, 100), 2000), math.Min(math.Max(bh, 100), 1400)
	}
	cw, ch := max(8, int(bw/factor)+1), max(8, int(bh/factor)+1)
	cw, ch = min(cw, src.Bounds().Dx()), min(ch, src.Bounds().Dy())
	x0 := clampi(int(fx*float64(src.Bounds().Dx()))-cw/2, 0, src.Bounds().Dx()-cw)
	y0 := clampi(int(fy*float64(src.Bounds().Dy()))-ch/2, 0, src.Bounds().Dy()-ch)
	crop := src.SubImage(image.Rect(x0, y0, x0+cw, y0+ch)).(*image.NRGBA)
	c2 := image.NewNRGBA(image.Rect(0, 0, cw, ch))
	for y := 0; y < ch; y++ {
		copy(c2.Pix[y*c2.Stride:y*c2.Stride+cw*4], crop.Pix[y*crop.Stride:y*crop.Stride+cw*4])
	}
	w.Header().Set("Content-Type", "image/png")
	if q.Get("raw") == "1" {
		png.Encode(w, c2)
		return
	}
	if q.Get("ai") == "1" && ai.Ready("upscale") {
		sess, err := ai.Acquire("upscale")
		if err == nil {
			defer ai.Done("upscale")
			// mit Rand rechnen, damit der Ausschnitt an den Kanten genauso aussieht wie im fertigen Bild
			const pad = 16
			sw, sh := src.Bounds().Dx(), src.Bounds().Dy()
			px0, py0 := max(0, x0-pad), max(0, y0-pad)
			px1, py1 := min(sw, x0+cw+pad), min(sh, y0+ch+pad)
			big := image.NewNRGBA(image.Rect(0, 0, px1-px0, py1-py0))
			for y := py0; y < py1; y++ {
				copy(big.Pix[(y-py0)*big.Stride:(y-py0)*big.Stride+(px1-px0)*4], src.Pix[y*src.Stride+px0*4:y*src.Stride+px1*4])
			}
			var ar *aiRows
			if ar, err = newAIRows(big, sess); err == nil {
				full := toImage(ar)
				if ar.err == nil {
					ox, oy := (x0-px0)*4, (y0-py0)*4
					img := image.NewNRGBA(image.Rect(0, 0, cw*4, ch*4))
					for y := 0; y < ch*4; y++ {
						copy(img.Pix[y*img.Stride:y*img.Stride+cw*16], full.Pix[(oy+y)*full.Stride+ox*4:(oy+y)*full.Stride+ox*4+cw*16])
					}
					if factor > 4.5 { // wie beim fertigen Bild: zweiter KI-Durchgang
						half := toImage(NewScalerFrom(nrgbaSource{img}, 0.5, 0, ar.opaque))
						ar2, err2 := newAIRows(half, sess)
						if err2 == nil {
							img8 := toImage(ar2)
							if ar2.err == nil {
								if math.Abs(factor-8) < 1e-6 {
									WritePNG(nrgbaImage{img8, ar.opaque}, w)
								} else {
									WritePNG(NewScalerFrom(nrgbaSource{img8}, factor/8, 0, ar.opaque), w)
								}
								return
							}
						}
					}
					if math.Abs(factor-4) < 1e-6 {
						WritePNG(nrgbaImage{img, ar.opaque}, w)
					} else {
						WritePNG(NewScalerFrom(nrgbaSource{img}, factor/4, 0, ar.opaque), w)
					}
					return
				}
				err = ar.err
			}
		}
		kit.Fail(w, 500, err.Error())
		return
	}
	WritePNG(NewScaler(c2, factor, sharp), w)
}

func (a *App) routes(mux *http.ServeMux) {

	mux.HandleFunc("/api/projects", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		out := []*Project{}
		for _, p := range a.projects {
			out = append(out, p)
		}
		a.mu.Unlock()
		sort.Slice(out, func(i, j int) bool { return out[i].Updated > out[j].Updated })
		kit.JSON(w, out)
	})
	mux.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			Path string `json:"path"`
		}
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq)
		p, err := a.openImage(rq.Path)
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, p)
	})
	mux.HandleFunc("/api/img", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if strings.ContainsAny(id, `/\.`) {
			http.NotFound(w, r)
			return
		}
		n := "preview.png"
		if r.URL.Query().Get("k") == "thumb" {
			n = "thumb.jpg"
		}
		http.ServeFile(w, r, filepath.Join(a.dir(id), n))
	})
	mux.HandleFunc("/api/sample", a.sample)
	mux.HandleFunc("/api/ai", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			ai.Install("upscale")
		}
		kit.JSON(w, ai.Get("upscale"))
	})
	mux.HandleFunc("/api/render", func(w http.ResponseWriter, r *http.Request) {
		var rq RenderReq
		if json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&rq) != nil {
			kit.Fail(w, 400, "Ungültige Eingabe.")
			return
		}
		if err := a.render(rq); err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/job", func(w http.ResponseWriter, r *http.Request) {
		a.mu.Lock()
		defer a.mu.Unlock()
		j := a.jobs[r.URL.Query().Get("id")]
		if j == nil {
			kit.JSON(w, &Job{})
			return
		}
		kit.JSON(w, j)
	})
	mux.HandleFunc("/api/delete", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if strings.ContainsAny(id, `/\.`) || id == "" {
			kit.Fail(w, 400, "Ungültig.")
			return
		}
		a.mu.Lock()
		delete(a.projects, id)
		delete(a.jobs, id)
		a.mu.Unlock()
		os.RemoveAll(a.dir(id))
		kit.JSON(w, map[string]bool{"ok": true})
	})

}

type nrgbaImage struct {
	img    *image.NRGBA
	opaque bool
}

func (n nrgbaImage) Size() (int, int)  { return n.img.Bounds().Dx(), n.img.Bounds().Dy() }
func (n nrgbaImage) Row(y int) []uint8 { return nrgbaSource{n.img}.Row(y) }
func (n nrgbaImage) Opaque() bool      { return n.opaque }

// Decode und Fit stehen auch anderen Werkzeugen im Hub zur Verfügung (z. B. dem Freisteller).
func Decode(path string) (*image.NRGBA, error)     { return decode(path) }
func Fit(s *image.NRGBA, maxSide int) *image.NRGBA { return fit(s, maxSide) }

// aiDouble vergrößert mit der KI auf das Doppelte (KI ×4, dann sauber halbiert) und hält das Ergebnis im Speicher.
// Das ×4-Zwischenbild liegt dabei in einer Datei, damit auch große Bilder wenig Arbeitsspeicher brauchen.
func aiDouble(src *image.NRGBA, sess *ort.Session, tmp string, progress func(float64)) (*image.NRGBA, error) {
	ar, err := newAIRows(src, sess)
	if err != nil {
		return nil, err
	}
	ar.Progress = progress
	fr, err := spool(ar, tmp)
	if err != nil {
		return nil, err
	}
	defer func() { fr.f.Close(); os.Remove(tmp) }()
	if ar.err != nil {
		return nil, ar.err
	}
	return toImage(NewScalerFrom(fr, 0.5, 0, ar.opaque)), nil
}

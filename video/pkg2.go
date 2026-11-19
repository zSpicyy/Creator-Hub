package main

// Paket 2: verschachtelte Clips (vorgerechnet) und Aufnahmen (Bildschirm, Webcam, Mikrofon) speichern.

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"kit"
)

func (a *App) pkg2Routes(mux *http.ServeMux) {
	// /api/nest: ausgewählte Clips als eigenes Video vorrechnen. Fortschritt über /api/export/job.
	mux.HandleFunc("/api/nest", func(w http.ResponseWriter, r *http.Request) {
		var rq struct {
			ID    string
			Clips []string
		}
		if json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&rq) != nil || len(rq.Clips) == 0 {
			kit.Fail(w, 400, "Ungültige Eingabe.")
			return
		}
		if !a.eng.Ready() {
			kit.Fail(w, 400, "Dafür fehlt noch ffmpeg. Richte es zuerst ein.")
			return
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
		b, _ := json.Marshal(p)
		a.mu.Unlock()
		var snap Project
		json.Unmarshal(b, &snap)
		keep := map[string]bool{}
		for _, id := range rq.Clips {
			keep[id] = true
		}
		t0, t1 := math.Inf(1), 0.0
		for _, tr := range snap.Tracks {
			var cs []*Clip
			for _, c := range tr.Clips {
				if keep[c.ID] {
					cs = append(cs, c)
					t0 = math.Min(t0, c.Start)
					t1 = math.Max(t1, c.Start+c.Length())
				}
			}
			tr.Clips = cs
			tr.Hidden, tr.Mute = false, false
		}
		if math.IsInf(t0, 1) || t1-t0 < 0.05 {
			kit.Fail(w, 400, "Die Clips wurden nicht gefunden.")
			return
		}
		for _, tr := range snap.Tracks {
			for _, c := range tr.Clips {
				c.Start -= t0
			}
		}
		snap.Markers = nil
		dir := filepath.Join(a.dir(p.ID), "nested")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		out := filepath.Join(dir, "Verschachtelt-"+kit.RandID(4)+".mp4")
		tmpOut := strings.TrimSuffix(out, ".mp4") + ".tmp.mp4"
		ex := Export{Name: "nest", Dir: dir, Format: "mp4", Quality: "high"}
		tmpdir, _ := os.MkdirTemp("", "videoschnitt")
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
		go a.runExport(j, args, total, tmpOut, out, tmpdir)
		kit.JSON(w, map[string]any{"out": out, "start": t0, "dur": t1 - t0})
	})

	// /api/upload?id=…&name=…: eine Aufnahme aus der App speichern und als Medium importieren
	mux.HandleFunc("/api/upload", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		a.mu.Lock()
		p := a.projects[id]
		a.mu.Unlock()
		if p == nil {
			kit.Fail(w, 404, "Projekt nicht gefunden.")
			return
		}
		ext := strings.ToLower(filepath.Ext(r.URL.Query().Get("name")))
		if ext != ".webm" && ext != ".mp4" && ext != ".ogg" && ext != ".wav" && ext != ".m4a" && ext != ".mkv" {
			ext = ".webm"
		}
		dir := filepath.Join(a.dir(id), "recordings")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		kind := r.URL.Query().Get("kind")
		label := map[string]string{"screen": "Bildschirm", "cam": "Webcam", "mic": "Mikrofon"}[kind]
		if label == "" {
			label = "Aufnahme"
		}
		path := filepath.Join(dir, fmt.Sprintf("%s-%s%s", label, kit.RandID(3), ext))
		f, err := os.Create(path)
		if err != nil {
			kit.Fail(w, 500, err.Error())
			return
		}
		_, err = io.Copy(f, io.LimitReader(r.Body, 8<<30))
		f.Close()
		if err != nil {
			os.Remove(path)
			kit.Fail(w, 500, "Die Aufnahme ließ sich nicht speichern.")
			return
		}
		// Aufnahmen aus dem Browser haben keine Dauer im Kopf: einmal neu verpacken
		if a.eng.Ready() {
			fixed := strings.TrimSuffix(path, ext) + ".fix" + ext
			if a.cmd("-y", "-v", "error", "-i", path, "-c", "copy", fixed).Run() == nil {
				os.Rename(fixed, path)
			} else {
				os.Remove(fixed)
			}
		}
		ms, err := a.importFiles(id, []string{path})
		if err != nil {
			kit.Fail(w, 400, err.Error())
			return
		}
		kit.JSON(w, ms)
	})
}

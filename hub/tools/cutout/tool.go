package cutout

import (
	"io/fs"
	"net/http"

	"kit/ai"
)

// Tool ist der Freisteller als Baustein im Hub.
type Tool struct{ a *App }

func New() *Tool { return &Tool{a: newApp()} }

func (t *Tool) Handler() http.Handler {
	mux := http.NewServeMux()
	sub, _ := fs.Sub(webFS, "web")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	t.a.routes(mux)
	return mux
}

func (t *Tool) Busy() bool {
	t.a.mu.Lock()
	defer t.a.mu.Unlock()
	return t.a.busy > 0
}

func (t *Tool) Installed() bool { return ai.Ready(model) }
func (t *Tool) Install()        { ai.Install(model) }
func (t *Tool) State() (bool, float64, string) {
	s := ai.Get(model)
	return s.Loading, s.Done, s.Error
}

// Release gibt den Arbeitsspeicher der KI frei, wenn das Werkzeug geschlossen wird.
func (t *Tool) Release() {
	if !t.Busy() {
		ai.Close(model)
	}
}

// Web und Mount: für die eigenständige App „Freisteller“ (eigenes Fenster, läuft ohne den Hub).
func Web() fs.FS { sub, _ := fs.Sub(webFS, "web"); return sub }

func (t *Tool) Mount(mux *http.ServeMux) { t.a.routes(mux) }

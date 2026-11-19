package convert

import (
	"io/fs"
	"net/http"
)

// Tool ist der Dateityp-Umwandler als Baustein im Hub.
type Tool struct{ a *App }

func New() *Tool { return &Tool{a: newApp()} }

func (t *Tool) Handler() http.Handler {
	mux := http.NewServeMux()
	sub, _ := fs.Sub(webFS, "web")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	t.a.routes(mux)
	return mux
}

// Busy meldet, ob gerade umgewandelt wird.
func (t *Tool) Busy() bool {
	t.a.mu.Lock()
	defer t.a.mu.Unlock()
	for _, b := range t.a.batches {
		if b.Running {
			return true
		}
	}
	return false
}

func (t *Tool) Installed() bool { return t.a.eng.Ready() }
func (t *Tool) Install()        { t.a.eng.Install() }
func (t *Tool) State() (bool, float64, string) { return t.a.eng.State() }
func (t *Tool) Release() {}

// Web und Mount: für die eigenständige App „Dateityp-Umwandler“ (eigenes Fenster, eigene Verknüpfung).
func Web() fs.FS { sub, _ := fs.Sub(webFS, "web"); return sub }

func (t *Tool) Mount(mux *http.ServeMux) { t.a.routes(mux) }

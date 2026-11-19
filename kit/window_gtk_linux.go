//go:build linux

package kit

// Linux: echtes App-Fenster mit WebKitGTK (dieselbe Web-Engine wie GNOME Web), wird zur Laufzeit
// geladen. Fehlt WebKitGTK, öffnet sich wie bisher ein Chromium-App-Fenster bzw. der Browser.

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/ebitengine/purego"
)

// GTK muss auf dem Haupt-Thread laufen.
func init() { runtime.LockOSThread() }

type gtkLib struct {
	initCheck       func(argc, argv uintptr) bool
	windowNew       func(kind int) uintptr
	setTitle        func(w uintptr, t string)
	setDefaultSize  func(w uintptr, width, height int)
	setPosition     func(w uintptr, pos int)
	setIconFromFile func(w uintptr, file string, err uintptr) bool
	containerAdd    func(c, child uintptr)
	showAll         func(w uintptr)
	hide            func(w uintptr)
	present         func(w uintptr)
	maximize        func(w uintptr)
	main            func()
	mainQuit        func()
	signalConnect   func(inst uintptr, sig string, cb, data, destroy uintptr, flags int) uint64
	idleAdd         func(cb, data uintptr) uint32
	setPrgname      func(name string)
	setAppName      func(name string)
	webViewNew      func() uintptr
	loadURI         func(v uintptr, uri string)
	evalJS41        func(v uintptr, js string, length int, world, source, cancel, cb, data uintptr)
	runJS40         func(v uintptr, js string, cancel, cb, data uintptr)
	tryClose        func(v uintptr)
	destroyWidget   func(w uintptr)
}

func loadGTK() (*gtkLib, error) {
	open := func(names ...string) (uintptr, error) {
		var last error
		for _, n := range names {
			h, err := purego.Dlopen(n, purego.RTLD_NOW|purego.RTLD_GLOBAL)
			if err == nil {
				return h, nil
			}
			last = err
		}
		return 0, last
	}
	gtk, err := open("libgtk-3.so.0")
	if err != nil {
		return nil, err
	}
	gobj, err := open("libgobject-2.0.so.0")
	if err != nil {
		return nil, err
	}
	glib, err := open("libglib-2.0.so.0")
	if err != nil {
		return nil, err
	}
	wk, err := open("libwebkit2gtk-4.1.so.0", "libwebkit2gtk-4.0.so.37")
	if err != nil {
		return nil, err
	}
	g := &gtkLib{}
	reg := func(fptr any, h uintptr, name string) (err error) {
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("%s fehlt", name)
			}
		}()
		purego.RegisterLibFunc(fptr, h, name)
		return nil
	}
	for _, f := range []struct {
		p any
		h uintptr
		n string
	}{
		{&g.initCheck, gtk, "gtk_init_check"}, {&g.windowNew, gtk, "gtk_window_new"}, {&g.setTitle, gtk, "gtk_window_set_title"},
		{&g.setDefaultSize, gtk, "gtk_window_set_default_size"}, {&g.setPosition, gtk, "gtk_window_set_position"},
		{&g.setIconFromFile, gtk, "gtk_window_set_icon_from_file"}, {&g.containerAdd, gtk, "gtk_container_add"},
		{&g.showAll, gtk, "gtk_widget_show_all"}, {&g.hide, gtk, "gtk_widget_hide"}, {&g.present, gtk, "gtk_window_present"}, {&g.maximize, gtk, "gtk_window_maximize"},
		{&g.main, gtk, "gtk_main"}, {&g.mainQuit, gtk, "gtk_main_quit"},
		{&g.signalConnect, gobj, "g_signal_connect_data"}, {&g.idleAdd, glib, "g_idle_add"},
		{&g.setPrgname, glib, "g_set_prgname"}, {&g.setAppName, glib, "g_set_application_name"},
		{&g.webViewNew, wk, "webkit_web_view_new"}, {&g.loadURI, wk, "webkit_web_view_load_uri"},
		{&g.tryClose, wk, "webkit_web_view_try_close"}, {&g.destroyWidget, gtk, "gtk_widget_destroy"},
	} {
		if err := reg(f.p, f.h, f.n); err != nil {
			return nil, err
		}
	}
	// JavaScript ausführen: WebKitGTK 4.1 und 4.0 heißen unterschiedlich
	if reg(&g.evalJS41, wk, "webkit_web_view_evaluate_javascript") != nil {
		g.evalJS41 = nil
		if err := reg(&g.runJS40, wk, "webkit_web_view_run_javascript"); err != nil {
			return nil, err
		}
	}
	return g, nil
}

// fixSignals: WebKitGTKs JavaScript-Engine richtet eigene Signal-Handler ohne SA_ONSTACK ein.
// Go bricht dann beim nächsten Signal mit „non-Go code set up signal handler without SA_ONSTACK flag“ ab.
// Wie bei Wails: allen fremden Handlern das Flag nachträglich geben.
var sigaction func(sig int, act, old unsafe.Pointer) int

func fixSignals() {
	if sigaction == nil {
		h, err := purego.Dlopen("libc.so.6", purego.RTLD_NOW|purego.RTLD_GLOBAL)
		if err != nil {
			return
		}
		purego.RegisterLibFunc(&sigaction, h, "sigaction")
	}
	const saOnStack = 0x08000000
	var buf [256]byte // struct sigaction (glibc, x86_64/arm64): Handler 0, Maske 8..135, Flags 136
	for sig := 1; sig < 32; sig++ {
		if sig == 9 || sig == 19 { // SIGKILL, SIGSTOP
			continue
		}
		buf = [256]byte{}
		if sigaction(sig, nil, unsafe.Pointer(&buf[0])) != 0 {
			continue
		}
		handler := *(*uintptr)(unsafe.Pointer(&buf[0]))
		flags := (*int32)(unsafe.Pointer(&buf[136]))
		if handler > 1 && *flags&saOnStack == 0 { // nicht SIG_DFL/SIG_IGN
			*flags |= saOnStack
			sigaction(sig, unsafe.Pointer(&buf[0]), nil)
		}
	}
}

var (
	gtkQ  []func()
	gtkMu sync.Mutex
	gtkCB uintptr
)

// gtkOnMain führt f im GTK-Haupt-Thread aus.
func gtkOnMain(g *gtkLib, f func()) {
	gtkMu.Lock()
	gtkQ = append(gtkQ, f)
	gtkMu.Unlock()
	g.idleAdd(gtkCB, 0)
}

// Das App-Fenster läuft als eigener kleiner Prozess („Programm --kit-window“). Stürzt WebKitGTK ab,
// bleibt die eigentliche App (Server, Projekte, Werkzeuge) davon unberührt und öffnet stattdessen den
// Browser. Der Fensterprozess ist wie ein Browserfenster: er zeigt nur die Seite an.
func init() {
	url := os.Getenv("KIT_WINDOW_URL")
	if url == "" {
		return
	}
	os.Unsetenv("KIT_WINDOW_URL")
	os.Exit(gtkStandalone(url, os.Getenv("KIT_WINDOW_TITLE"), os.Getenv("KIT_WINDOW_NAME")))
}

// Rückgabe: 0 = vom Benutzer geschlossen, 3 = WebKitGTK fehlt (dann Browser), sonst Fehler.
func gtkStandalone(url, title, name string) int {
	if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
		return 3
	}
	g, err := loadGTK()
	if err != nil {
		fmt.Fprintln(os.Stderr, "WebKitGTK:", err)
		return 3
	}
	if os.Getenv("WEBKIT_DISABLE_DMABUF_RENDERER") == "" {
		os.Setenv("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
	}
	g.setPrgname(wmClass(name))
	g.setAppName(title)
	if !g.initCheck(0, 0) {
		return 3
	}
	gtkCB = purego.NewCallback(func(data uintptr) uintptr {
		gtkMu.Lock()
		q := gtkQ
		gtkQ = nil
		gtkMu.Unlock()
		for _, f := range q {
			f()
		}
		return 0
	})
	win := g.windowNew(0)
	g.setTitle(win, title)
	g.setDefaultSize(win, 1280, 840)
	g.setPosition(win, 1) // Mitte
	if ic := iconPath(); ic != "" {
		g.setIconFromFile(win, ic, 0)
	}
	web := g.webViewNew()
	fixSignals()
	g.containerAdd(win, web)
	closing := false
	// Fenster schließen: erst die Seite fragen (beforeunload, z. B. „nicht gespeichert“).
	// Bestätigt sie, meldet WebKit „close“, dann wirklich schließen.
	del := purego.NewCallback(func(w, ev, data uintptr) uintptr {
		if closing {
			return 0
		}
		g.tryClose(web)
		return 1
	})
	onClose := purego.NewCallback(func(v, data uintptr) uintptr {
		closing = true
		g.destroyWidget(win)
		return 0
	})
	destroy := purego.NewCallback(func(w, data uintptr) uintptr { g.mainQuit(); return 0 })
	g.signalConnect(win, "delete-event", del, 0, 0, 0)
	g.signalConnect(web, "close", onClose, 0, 0, 0)
	g.signalConnect(win, "destroy", destroy, 0, 0, 0)
	g.loadURI(web, url)
	fixSignals()
	if StartMax {
		g.maximize(win)
	}
	g.showAll(win)
	g.present(win)
	go func() {
		for _, d := range []time.Duration{500 * time.Millisecond, 2 * time.Second, 5 * time.Second} {
			time.Sleep(d)
			gtkOnMain(g, fixSignals)
		}
	}()
	g.main()
	return 0
}

// openWindow startet den Fensterprozess. false: geht nicht (dann Chromium/Browser).
// Stürzt er gleich am Anfang ab, wird crashed aufgerufen.
func openWindow(url string, a *App, crashed, closed func(), loaded func(since time.Time) bool) bool {
	if os.Getenv("KIT_BROWSER") == "1" || (os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "") {
		return false
	}
	mark := filepath.Join(a.Root, "fenster-abgestuerzt")
	if b, err := os.ReadFile(mark); err == nil {
		if string(b) == exeStamp() {
			return false
		}
		os.Remove(mark) // neue Version: wieder versuchen
	}
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	cmd := exec.Command(exe)
	cmd.Env = append(os.Environ(), "KIT_WINDOW_URL="+url, "KIT_WINDOW_TITLE="+a.Title, "KIT_WINDOW_NAME="+a.Name)
	defer func() { // merken, damit das Fenster beim Beenden (z. B. Update) mit geschlossen wird
		winMu.Lock()
		winCmds = append(winCmds, cmd)
		winMu.Unlock()
	}()
	logf, _ := os.Create(filepath.Join(a.Root, "fenster.log"))
	cmd.Stdout, cmd.Stderr = logf, logf
	if err := cmd.Start(); err != nil {
		return false
	}
	fmt.Fprintln(os.Stderr, "App-Fenster gestartet (PID", cmd.Process.Pid, ")")
	start := time.Now()
	var wmu sync.Mutex
	handled := false
	once := func(f func()) {
		wmu.Lock()
		defer wmu.Unlock()
		if !handled {
			handled = true
			f()
		}
	}
	// Wächter: Lädt die Seite nicht innerhalb von 20 s, hängt das Fenster. Dann beenden und den Browser nehmen.
	go func() {
		time.Sleep(20 * time.Second)
		if !loaded(start) {
			once(func() {
				fmt.Fprintln(os.Stderr, "App-Fenster reagiert nicht – Browser wird geöffnet")
				cmd.Process.Kill()
				os.WriteFile(mark, []byte(exeStamp()), 0o644)
				crashed()
			})
		}
	}()
	go func() {
		err := cmd.Wait()
		if logf != nil {
			logf.Close()
		}
		code := 0
		if err != nil {
			code = 1
			if ee, ok := err.(*exec.ExitError); ok {
				code = ee.ExitCode()
			}
		}
		once(func() {
			switch {
			case code == 0:
				closed()
			case code == 3: // kein WebKitGTK
				crashed()
			default:
				fmt.Fprintln(os.Stderr, "App-Fenster beendet mit Code", code)
				if time.Since(start) < 60*time.Second {
					os.WriteFile(mark, []byte(exeStamp()), 0o644) // künftig gleich den Browser nehmen
				}
				crashed()
			}
		})
	}()
	return true
}

// wmClass: der Hub heißt „CreatorHub“ (wie im Menüeintrag), Werkzeuge nach ihrem Ordnernamen.
func wmClass(name string) string {
	if name == "CreatorHub" || name == "" {
		return "CreatorHub"
	}
	return "CreatorHub-" + strings.ReplaceAll(name, " ", "")
}

// iconPath sucht das Symbol: im AppImage (creator-hub.png) oder neben dem Werkzeug (<Name>.png).
func iconPath() string {
	exe, _ := os.Executable()
	cands := []string{strings.TrimSuffix(exe, filepath.Ext(exe)) + ".png"}
	if d := os.Getenv("APPDIR"); d != "" {
		cands = append(cands, filepath.Join(d, "creator-hub.png"))
	}
	cands = append(cands, filepath.Join(filepath.Dir(filepath.Dir(exe)), "creator-hub.png"))
	for _, c := range cands {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

// exeStamp kennzeichnet die laufende Programmversion (Größe und Zeit der Programmdatei).
func exeStamp() string {
	exe, _ := os.Executable()
	st, err := os.Stat(exe)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%d-%d", st.Size(), st.ModTime().Unix())
}

var (
	winMu   sync.Mutex
	winCmds []*exec.Cmd
)

// closeWindows schließt beim Beenden der App ihre Fenster mit: die eigenen Fensterprozesse und
// Chromium-App-Fenster mit dem App-eigenen Profil (der normale Browser bleibt unberührt).
func closeWindows(profile string) {
	winMu.Lock()
	cs := winCmds
	winCmds = nil
	winMu.Unlock()
	for _, c := range cs {
		if c.Process != nil {
			c.Process.Signal(syscall.SIGTERM)
		}
	}
	if profile != "" {
		exec.Command("pkill", "-TERM", "-f", "--user-data-dir="+profile).Run()
	}
}

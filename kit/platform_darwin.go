//go:build darwin

package kit

// macOS: echtes App-Fenster mit WKWebView (wie Safari), ohne C-Compiler gebaut. purego ruft die
// Cocoa- und WebKit-Funktionen direkt auf. Klappt das wider Erwarten nicht, öffnet sich die Seite
// im Standardbrowser, damit die App trotzdem benutzbar bleibt.

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
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
	"github.com/ebitengine/purego/objc"
)

// Cocoa muss auf dem Haupt-Thread laufen. Aus dem Finder gestartete Apps kennen außerdem die
// Homebrew-Ordner nicht; dort liegt aber ffmpeg.
func init() {
	runtime.LockOSThread()
	path := os.Getenv("PATH")
	for _, d := range []string{"/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"} {
		if !strings.Contains(":"+path+":", ":"+d+":") {
			path += ":" + d
		}
	}
	os.Setenv("PATH", path)
}

type nsPoint struct{ X, Y float64 }
type nsSize struct{ W, H float64 }
type nsRect struct {
	Origin nsPoint
	Size   nsSize
}

var sel = objc.RegisterName

func cls(name string) objc.ID { return objc.ID(objc.GetClass(name)) }

func nsStr(s string) objc.ID {
	return cls("NSString").Send(sel("stringWithUTF8String:"), s)
}

func goStr(id objc.ID) string {
	if id == 0 {
		return ""
	}
	p := objc.Send[uintptr](id, sel("UTF8String"))
	if p == 0 {
		return ""
	}
	var b []byte
	for i := uintptr(0); ; i++ {
		c := *(*byte)(unsafe.Pointer(p + i))
		if c == 0 {
			break
		}
		b = append(b, c)
	}
	return string(b)
}

// callBlock ruft einen Objective-C-Block auf (Abschlussfunktionen von WebKit).
func callBlock(block uintptr, args ...uintptr) {
	if block == 0 {
		return
	}
	invoke := *(*uintptr)(unsafe.Pointer(block + 16)) // isa, flags+reserved, invoke
	purego.SyscallN(invoke, append([]uintptr{block}, args...)...)
}

var (
	mainQ   []func()
	mainMu  sync.Mutex
	mainObj objc.ID
)

// onMain führt f auf dem Haupt-Thread aus.
func onMain(f func()) {
	mainMu.Lock()
	mainQ = append(mainQ, f)
	o := mainObj
	mainMu.Unlock()
	if o != 0 {
		o.Send(sel("performSelectorOnMainThread:withObject:waitUntilDone:"), sel("chRun:"), objc.ID(0), false)
	}
}

func runMainQueue() {
	mainMu.Lock()
	q := mainQ
	mainQ = nil
	mainMu.Unlock()
	for _, f := range q {
		f()
	}
}

func runWindow(url string, a *App) {
	writeInstance(url, a)
	defer os.Remove(filepath.Join(a.Root, "instanz.json"))
	ok := func() (ok bool) {
		defer func() {
			if r := recover(); r != nil {
				os.WriteFile(filepath.Join(a.Root, "fenster-fehler.txt"), []byte(fmt.Sprint(r)), 0o644)
				ok = false
			}
		}()
		return cocoaWindow(url, a)
	}()
	if !ok {
		browserFallback(url, a)
	}
}

func cocoaWindow(url string, a *App) bool {
	if _, err := purego.Dlopen("/System/Library/Frameworks/WebKit.framework/WebKit", purego.RTLD_GLOBAL|purego.RTLD_NOW); err != nil {
		return false
	}
	if _, err := purego.Dlopen("/System/Library/Frameworks/AppKit.framework/AppKit", purego.RTLD_GLOBAL|purego.RTLD_NOW); err != nil {
		return false
	}
	if objc.GetClass("WKWebView") == 0 || objc.GetClass("NSApplication") == 0 {
		return false
	}
	app := cls("NSApplication").Send(sel("sharedApplication"))
	app.Send(sel("setActivationPolicy:"), 0) // normale App mit Dock-Symbol

	var win, web objc.ID
	allow := false
	finished := false
	stop := func() {
		if finished {
			return
		}
		finished = true
		app.Send(sel("stop:"), objc.ID(0))
		// stop: greift erst beim nächsten Ereignis: eins nachschieben
		ev := cls("NSEvent").Send(sel("otherEventWithType:location:modifierFlags:timestamp:windowNumber:context:subtype:data1:data2:"),
			15, nsPoint{}, 0, float64(0), 0, objc.ID(0), int16(0), 0, 0)
		app.Send(sel("postEvent:atStart:"), ev, true)
	}
	show := func() {
		win.Send(sel("makeKeyAndOrderFront:"), objc.ID(0))
		app.Send(sel("activateIgnoringOtherApps:"), true)
		a.hidden = false
	}
	evalJS := func(js string) {
		if web != 0 {
			web.Send(sel("evaluateJavaScript:completionHandler:"), nsStr(js), objc.ID(0))
		}
	}
	// Schließen: dieselbe Logik wie unter Windows (Nachfrage bei Ungespeichertem, Verstecken, Beenden)
	shouldClose := func() bool {
		if allow {
			return true
		}
		if a.Ask != nil && !(a.askedAt != 0 && !a.acked && time.Now().UnixMilli()-a.askedAt > 1200) && a.Ask() {
			a.askedAt, a.acked = time.Now().UnixMilli(), false
			evalJS("(function(){var K=window.Kit||(typeof Kit!=='undefined'?Kit:null);if(K&&K._closeAsk){fetch('/kit/closeack',{method:'POST'});K._closeAsk()}})()")
			return false
		}
		if a.OnClose != nil && !a.OnClose() {
			win.Send(sel("orderOut:"), objc.ID(0))
			a.hidden = true
			return false
		}
		return true
	}

	// Protokolle nur, wenn zur Laufzeit vorhanden (für die Methodenaufrufe sind sie nicht nötig)
	var protos []*objc.Protocol
	for _, n := range []string{"NSWindowDelegate", "NSApplicationDelegate", "WKUIDelegate"} {
		if p := objc.GetProtocol(n); p != nil {
			protos = append(protos, p)
		}
	}
	delegate, err := objc.RegisterClass("CHDelegate", objc.GetClass("NSObject"), protos, nil,
		[]objc.MethodDef{
			{Cmd: sel("chRun:"), Fn: func(self objc.ID, _ objc.SEL, _ objc.ID) { runMainQueue() }},
			{Cmd: sel("windowShouldClose:"), Fn: func(self objc.ID, _ objc.SEL, _ objc.ID) bool {
				if shouldClose() {
					stop()
					return true
				}
				return false
			}},
			{Cmd: sel("chQuit:"), Fn: func(self objc.ID, _ objc.SEL, _ objc.ID) {
				win.Send(sel("performClose:"), objc.ID(0))
			}},
			// Klick aufs Dock-Symbol, während das Fenster versteckt ist
			{Cmd: sel("applicationShouldHandleReopen:hasVisibleWindows:"), Fn: func(self objc.ID, _ objc.SEL, _ objc.ID, _ bool) bool {
				show()
				return true
			}},
			// „Beenden“ aus dem Dock: wie Fenster schließen
			{Cmd: sel("applicationShouldTerminate:"), Fn: func(self objc.ID, _ objc.SEL, _ objc.ID) uint {
				if allow {
					return 1
				}
				if shouldClose() {
					stop()
				}
				return 0
			}},
			// alert() und confirm() aus der Seite als echte macOS-Dialoge
			{Cmd: sel("webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:"),
				Fn: func(self objc.ID, _ objc.SEL, _ objc.ID, msg objc.ID, _ objc.ID, done uintptr) {
					dialog(goStr(msg), false)
					callBlock(done)
				}},
			{Cmd: sel("webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:"),
				Fn: func(self objc.ID, _ objc.SEL, _ objc.ID, msg objc.ID, _ objc.ID, done uintptr) {
					r := uintptr(0)
					if dialog(goStr(msg), true) {
						r = 1
					}
					callBlock(done, r)
				}},
		})
	if err != nil {
		return false
	}
	del := objc.ID(delegate).Send(sel("new"))
	mainMu.Lock()
	mainObj = del
	mainMu.Unlock()
	app.Send(sel("setDelegate:"), del)
	buildMenu(app, del, a.Title)

	style := 1 | 2 | 4 | 8 // Titel, Schließen, Verkleinern, Größe ändern
	frame := nsRect{Size: nsSize{float64(a.W), float64(a.H)}}
	win = cls("NSWindow").Send(sel("alloc")).Send(sel("initWithContentRect:styleMask:backing:defer:"), frame, style, 2, false)
	if win == 0 {
		return false
	}
	win.Send(sel("setTitle:"), nsStr(a.Title))
	win.Send(sel("setReleasedWhenClosed:"), false)
	win.Send(sel("setMinSize:"), nsSize{760, 520})
	win.Send(sel("center"))
	win.Send(sel("setFrameAutosaveName:"), nsStr("CreatorHub-"+a.Name))
	if StartMax && !objc.Send[bool](win, sel("isZoomed")) {
		win.Send(sel("zoom:"), objc.ID(0)) // bildschirmfüllend (wie der grüne Knopf mit Wahltaste)
	}
	win.Send(sel("setDelegate:"), del)

	conf := cls("WKWebViewConfiguration").Send(sel("new"))
	web = cls("WKWebView").Send(sel("alloc")).Send(sel("initWithFrame:configuration:"), frame, conf)
	if web == 0 {
		return false
	}
	web.Send(sel("setUIDelegate:"), del)
	web.Send(sel("setAutoresizingMask:"), 2|16) // Breite und Höhe mitwachsen
	win.Send(sel("setContentView:"), web)
	req := cls("NSURLRequest").Send(sel("requestWithURL:"), cls("NSURL").Send(sel("URLWithString:"), nsStr(url)))
	web.Send(sel("loadRequest:"), req)

	setDockIcon(app)
	a.quit = func() { onMain(func() { allow = true; win.Send(sel("orderOut:"), objc.ID(0)); stop() }) }
	a.eval = func(js string) { onMain(func() { evalJS(js) }) }
	a.show = func() { onMain(show) }

	show()
	app.Send(sel("run"))
	return true
}

// buildMenu legt die Menüleiste an: App-Menü (Ausblenden, Beenden) und Bearbeiten (Kopieren, Einfügen …).
// Ohne Bearbeiten-Menü funktionieren Cmd+C/V in Textfeldern nicht. Die Seite bekommt die Tasten zuerst.
func buildMenu(app, del objc.ID, title string) {
	item := func(menu objc.ID, t string, action string, key string, mods uint) objc.ID {
		it := cls("NSMenuItem").Send(sel("alloc")).Send(sel("initWithTitle:action:keyEquivalent:"), nsStr(t), sel(action), nsStr(key))
		if mods != 0 {
			it.Send(sel("setKeyEquivalentModifierMask:"), mods)
		}
		menu.Send(sel("addItem:"), it)
		return it
	}
	const cmd, shift, alt = 1 << 20, 1 << 17, 1 << 19
	bar := cls("NSMenu").Send(sel("new"))
	appMenu := cls("NSMenu").Send(sel("new"))
	item(appMenu, T("Über ", "About ")+title, "orderFrontStandardAboutPanel:", "", 0)
	appMenu.Send(sel("addItem:"), cls("NSMenuItem").Send(sel("separatorItem")))
	item(appMenu, T(title+" ausblenden", "Hide "+title), "hide:", "h", 0)
	item(appMenu, T("Andere ausblenden", "Hide Others"), "hideOtherApplications:", "h", cmd|alt)
	appMenu.Send(sel("addItem:"), cls("NSMenuItem").Send(sel("separatorItem")))
	q := item(appMenu, T(title+" beenden", "Quit "+title), "chQuit:", "q", 0)
	q.Send(sel("setTarget:"), del)
	top := cls("NSMenuItem").Send(sel("new"))
	top.Send(sel("setSubmenu:"), appMenu)
	bar.Send(sel("addItem:"), top)

	edit := cls("NSMenu").Send(sel("alloc")).Send(sel("initWithTitle:"), nsStr(T("Bearbeiten", "Edit")))
	item(edit, T("Widerrufen", "Undo"), "undo:", "z", 0)
	item(edit, T("Wiederholen", "Redo"), "redo:", "z", cmd|shift)
	edit.Send(sel("addItem:"), cls("NSMenuItem").Send(sel("separatorItem")))
	item(edit, T("Ausschneiden", "Cut"), "cut:", "x", 0)
	item(edit, T("Kopieren", "Copy"), "copy:", "c", 0)
	item(edit, T("Einsetzen", "Paste"), "paste:", "v", 0)
	item(edit, T("Alles auswählen", "Select All"), "selectAll:", "a", 0)
	et := cls("NSMenuItem").Send(sel("new"))
	et.Send(sel("setSubmenu:"), edit)
	bar.Send(sel("addItem:"), et)

	winMenu := cls("NSMenu").Send(sel("alloc")).Send(sel("initWithTitle:"), nsStr(T("Fenster", "Window")))
	item(winMenu, T("Im Dock ablegen", "Minimize"), "performMiniaturize:", "m", 0)
	item(winMenu, T("Zoomen", "Zoom"), "performZoom:", "", 0)
	item(winMenu, T("Schließen", "Close"), "performClose:", "w", 0)
	wt := cls("NSMenuItem").Send(sel("new"))
	wt.Send(sel("setSubmenu:"), winMenu)
	bar.Send(sel("addItem:"), wt)
	app.Send(sel("setMainMenu:"), bar)
	app.Send(sel("setWindowsMenu:"), winMenu)
}

// setDockIcon: Werkzeuge, die nicht als eigene App gebündelt sind, bekommen ihr Symbol von hier.
func setDockIcon(app objc.ID) {
	exe, _ := os.Executable()
	for _, p := range []string{
		filepath.Join(filepath.Dir(filepath.Dir(exe)), "Resources", "icon.icns"),
		strings.TrimSuffix(exe, filepath.Ext(exe)) + ".png",
	} {
		if _, err := os.Stat(p); err == nil {
			img := cls("NSImage").Send(sel("alloc")).Send(sel("initWithContentsOfFile:"), nsStr(p))
			if img != 0 {
				app.Send(sel("setApplicationIconImage:"), img)
			}
			return
		}
	}
}

// dialog zeigt eine macOS-Meldung. withCancel: OK/Abbrechen, Rückgabe true bei OK.
func dialog(msg string, withCancel bool) bool {
	al := cls("NSAlert").Send(sel("new"))
	al.Send(sel("setMessageText:"), nsStr(msg))
	al.Send(sel("addButtonWithTitle:"), nsStr("OK"))
	if withCancel {
		al.Send(sel("addButtonWithTitle:"), nsStr(T("Abbrechen", "Cancel")))
	}
	return objc.Send[int](al, sel("runModal")) == 1000 // NSAlertFirstButtonReturn
}

// browserFallback: die Seite im Standardbrowser öffnen und laufen lassen, bis sie geschlossen wird.
func browserFallback(url string, a *App) {
	exec.Command("/usr/bin/open", url).Start()
	ping := struct {
		sync.Mutex
		last time.Time
	}{last: time.Now().Add(60 * time.Second)}
	a.alive = func() { ping.Lock(); ping.last = time.Now(); ping.Unlock(); a.hidden = false }
	done := make(chan struct{})
	var once sync.Once
	a.quit = func() { once.Do(func() { close(done) }) }
	a.show = func() { exec.Command("/usr/bin/open", url).Start() }
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-done:
			return
		case <-t.C:
			ping.Lock()
			gone := time.Since(ping.last) > 10*time.Second
			ping.Unlock()
			if gone && !a.hidden {
				if a.OnClose == nil || a.OnClose() {
					return
				}
				a.hidden = true
			}
		}
	}
}

func writeInstance(url string, a *App) {
	b, _ := json.Marshal(map[string]any{"url": url, "pid": os.Getpid()})
	os.WriteFile(filepath.Join(a.Root, "instanz.json"), b, 0o600)
}

// Läuft die App schon? Dann deren Fenster nach vorne holen.
func alreadyRunning(name, title string) bool {
	d, _ := os.UserConfigDir()
	b, err := os.ReadFile(filepath.Join(d, name, "instanz.json"))
	if err != nil {
		return false
	}
	var in struct {
		URL string `json:"url"`
		PID int    `json:"pid"`
	}
	if json.Unmarshal(b, &in) != nil || in.PID == 0 || syscall.Kill(in.PID, 0) != nil {
		return false
	}
	u := strings.Replace(in.URL, "/?t=", "/kit/show?t=", 1)
	host := strings.SplitN(strings.TrimPrefix(in.URL, "http://"), "/", 2)[0]
	if c, err := net.DialTimeout("tcp", host, time.Second); err != nil {
		return false
	} else {
		c.Close()
	}
	cl := http.Client{Timeout: 3 * time.Second}
	if r, err := cl.Get(u); err == nil {
		r.Body.Close()
	}
	return true
}

func openFolder(p string) {
	if p != "" {
		exec.Command("/usr/bin/open", p).Start()
	}
}

// StartApp startet ein eigenständiges Werkzeug.
func StartApp(c *exec.Cmd) error { return c.Start() }

func HideCmd(c *exec.Cmd) { trackCmd(c) }

// pickPath: Datei-/Ordnerauswahl über die Standardauswahl von macOS (AppleScript).
func pickPath(mode, filter string) (string, error) {
	var types []string
	if i := strings.Index(filter, "|"); i >= 0 {
		for _, p := range strings.Split(filter[i+1:], ";") {
			p = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(p), "*."))
			if p != "" && p != "*" && !strings.ContainsAny(p, `"\`) {
				types = append(types, `"`+p+`"`)
			}
		}
	}
	var script string
	switch mode {
	case "folder":
		script = `POSIX path of (choose folder)`
	default:
		of := ""
		if len(types) > 0 {
			of = " of type {" + strings.Join(types, ",") + "}"
		}
		if mode == "files" {
			script = `set fs to (choose file` + of + ` with multiple selections allowed)
set out to ""
repeat with f in fs
set out to out & POSIX path of f & "|"
end repeat
return out`
		} else {
			script = `POSIX path of (choose file` + of + `)`
		}
	}
	out, err := exec.Command("/usr/bin/osascript", "-e", script).Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok && strings.Contains(string(ee.Stderr), "-128") {
			return "", nil // abgebrochen
		}
		return "", ErrNoDialog
	}
	return strings.TrimSpace(string(out)), nil
}

func waitExit(pid int, max time.Duration) {
	for end := time.Now().Add(max); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		if syscall.Kill(pid, 0) != nil {
			return
		}
	}
}

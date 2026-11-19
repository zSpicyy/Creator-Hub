//go:build windows

package kit

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
)

const psHead = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName System.Windows.Forms;` +
	`$o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;WindowState='Minimized'};`

func psQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

func pickPath(mode, filter string) (string, error) {
	var script string
	if mode == "folder" {
		script = psHead + `$d=New-Object System.Windows.Forms.FolderBrowserDialog;$d.ShowNewFolderButton=$true;if($d.ShowDialog($o) -eq 'OK'){$d.SelectedPath}`
	} else {
		if filter == "" {
			filter = "Alle Dateien|*.*"
		} else {
			filter += "|Alle Dateien|*.*"
		}
		multi := "$false"
		if mode == "files" {
			multi = "$true"
		}
		script = psHead + `$d=New-Object System.Windows.Forms.OpenFileDialog;$d.Multiselect=` + multi + `;$d.Filter=` + psQuote(filter) + `;if($d.ShowDialog($o) -eq 'OK'){$d.FileNames -join '|'}`
	}
	cmd := exec.Command("powershell", "-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return "", ErrNoDialog
	}
	return strings.TrimSpace(strings.TrimPrefix(string(out), "\xef\xbb\xbf")), nil
}

func openFolder(p string) {
	if p != "" {
		StartApp(exec.Command("explorer", p))
	}
}

// StartApp startet ein eigenständiges Werkzeug so, dass es den Hub überlebt (eigener Job statt dem des Hubs).
func StartApp(c *exec.Cmd) error { return c.Start() }

func HideCmd(c *exec.Cmd) {
	trackCmd(c)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}

func alreadyRunning(name, title string) bool {
	mn, _ := windows.UTF16PtrFromString("Local\\CreatorHub_" + name)
	_, err := windows.CreateMutex(nil, false, mn)
	if err == windows.ERROR_ALREADY_EXISTS {
		t, _ := windows.UTF16PtrFromString(title)
		u := windows.NewLazySystemDLL("user32.dll")
		hwnd, _, _ := u.NewProc("FindWindowW").Call(0, uintptr(unsafe.Pointer(t)))
		if hwnd != 0 {
			u.NewProc("ShowWindow").Call(hwnd, 9)
			u.NewProc("SetForegroundWindow").Call(hwnd)
		}
		return true
	}
	return false
}

func runWindow(url string, a *App) {
	// Weniger Hintergrunddienste = weniger Arbeitsspeicher. Grafikbeschleunigung ist an (flüssig, scharf);
	// wurde sie abgeschaltet oder ist der letzte Start hängen geblieben, läuft das Fenster ohne.
	args := "--disable-background-networking --disable-component-update --no-first-run --disable-features=Translate,msSmartScreenProtection,AutofillServerCommunication,msEdgeShoppingUI"
	if !a.GPUOn() {
		args += " --disable-gpu --disable-gpu-compositing"
	}
	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args)
	// Fenstergröße in echten Bildschirmpunkten (bei 125 %/150 % Skalierung entsprechend größer)
	sc := float64(dpiForSystem()) / 96
	W, H := int(float64(a.W)*sc), int(float64(a.H)*sc)
	if sw, sh := screenWork(); sw > 0 {
		W, H = min(W, sw-40), min(H, sh-40)
	}
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus:     true,
		DataPath:      filepath.Join(a.Root, "fenster3"), // neuer Ordner: nicht an hängende Hintergrundprozesse alter Versionen andocken
		WindowOptions: webview2.WindowOptions{Title: a.Title, Width: uint(W), Height: uint(H), Center: true},
	})
	if w == nil {
		StartApp(exec.Command("rundll32", "url.dll,FileProtocolHandler", url))
		select {}
	}
	defer w.Destroy()
	hwnd := uintptr(w.Window())
	u := windows.NewLazySystemDLL("user32.dll")
	setLong, callProc, showWin := u.NewProc("SetWindowLongPtrW"), u.NewProc("CallWindowProcW"), u.NewProc("ShowWindow")
	if StartMax {
		showWin.Call(hwnd, 3) // SW_MAXIMIZE: bildschirmfüllend starten
	}
	var old uintptr
	allow := false
	cb := windows.NewCallback(func(h, msg, wp, lp uintptr) uintptr {
		const wmClose, wmShowWindow, wmDpiChanged = 0x0010, 0x0018, 0x02E0
		if msg == wmDpiChanged && lp != 0 {
			// Fenster auf einen Bildschirm mit anderer Skalierung gezogen: Windows schlägt die neue Größe vor
			r := (*[4]int32)(unsafe.Pointer(lp))
			u.NewProc("SetWindowPos").Call(h, 0, uintptr(r[0]), uintptr(r[1]), uintptr(r[2]-r[0]), uintptr(r[3]-r[1]), 0x0014)
			return 0
		}
		// Ungespeichertes: die Seite fragt nach. Antwortet sie nicht (kein /kit/closeack), schließt der nächste Klick.
		if msg == wmClose && !allow && a.Ask != nil && !(a.askedAt != 0 && !a.acked && time.Now().UnixMilli()-a.askedAt > 1200) && a.Ask() {
			a.askedAt, a.acked = time.Now().UnixMilli(), false
			w.Dispatch(func() {
				w.Eval("(function(){var K=window.Kit||(typeof Kit!=='undefined'?Kit:null);if(K&&K._closeAsk){fetch('/kit/closeack',{method:'POST'});K._closeAsk()}})()")
			})
			return 0
		}
		if msg == wmClose && !allow && a.OnClose != nil && !a.OnClose() {
			showWin.Call(h, 0) // SW_HIDE
			a.hidden = true
			return 0
		}
		if msg == wmShowWindow && wp != 0 {
			a.hidden = false
		}
		r, _, _ := callProc.Call(old, h, msg, wp, lp)
		return r
	})
	gwlpWndProc := -4
	old, _, _ = setLong.Call(hwnd, uintptr(gwlpWndProc), cb)
	a.quit = func() { allow = true; w.Dispatch(func() { w.Terminate() }) }
	a.eval = func(js string) { w.Dispatch(func() { w.Eval(js) }) }
	edge.OnFiles = func(tag string, paths []string) {
		b, _ := json.Marshal(paths)
		t, _ := json.Marshal(tag)
		w.Dispatch(func() { w.Eval("window.Kit&&Kit._drop(" + string(b) + "," + string(t) + ")") })
	}
	w.Navigate(url)
	w.Run()
}

func waitExit(pid int, max time.Duration) {
	h, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		return
	}
	defer windows.CloseHandle(h)
	windows.WaitForSingleObject(h, uint32(max/time.Millisecond))
}


// Scharfe Darstellung bei Windows-Skalierung (Laptops mit 125 %, 150 %, 200 %): ohne diese Angabe
// rechnet Windows das ganze Fenster als Bild hoch – alles wirkt verschwommen und pixelig.
func init() {
	u := windows.NewLazySystemDLL("user32.dll")
	if p := u.NewProc("SetProcessDpiAwarenessContext"); p.Find() == nil {
		if r, _, _ := p.Call(uintptr(^uintptr(3))); r != 0 { // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
			return
		}
	}
	if p := windows.NewLazySystemDLL("shcore.dll").NewProc("SetProcessDpiAwareness"); p.Find() == nil {
		if r, _, _ := p.Call(2); r == 0 {
			return
		}
	}
	u.NewProc("SetProcessDPIAware").Call()
}

func dpiForSystem() int {
	p := windows.NewLazySystemDLL("user32.dll").NewProc("GetDpiForSystem")
	if p.Find() == nil {
		if r, _, _ := p.Call(); r >= 96 {
			return int(r)
		}
	}
	return 96
}

func screenWork() (int, int) {
	var r [4]int32
	p := windows.NewLazySystemDLL("user32.dll").NewProc("SystemParametersInfoW")
	if ok, _, _ := p.Call(0x0030, 0, uintptr(unsafe.Pointer(&r)), 0); ok == 0 { // SPI_GETWORKAREA
		return 0, 0
	}
	return int(r[2] - r[0]), int(r[3] - r[1])
}

//go:build linux

package kit

import (
	"testing"
	"time"

	"github.com/ebitengine/purego"
)

// Prüft den GTK-Teil des Linux-Fensters (ohne WebKit): Fenster, Schließen-Signal, Haupt-Thread-Aufrufe.
func TestGTKBasics(t *testing.T) {
	gtk, err := purego.Dlopen("libgtk-3.so.0", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		t.Skip(err)
	}
	gobj, _ := purego.Dlopen("libgobject-2.0.so.0", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	glib, _ := purego.Dlopen("libglib-2.0.so.0", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	g := &gtkLib{}
	purego.RegisterLibFunc(&g.initCheck, gtk, "gtk_init_check")
	purego.RegisterLibFunc(&g.windowNew, gtk, "gtk_window_new")
	purego.RegisterLibFunc(&g.setTitle, gtk, "gtk_window_set_title")
	purego.RegisterLibFunc(&g.showAll, gtk, "gtk_widget_show_all")
	purego.RegisterLibFunc(&g.hide, gtk, "gtk_widget_hide")
	purego.RegisterLibFunc(&g.present, gtk, "gtk_window_present")
	purego.RegisterLibFunc(&g.main, gtk, "gtk_main")
	purego.RegisterLibFunc(&g.mainQuit, gtk, "gtk_main_quit")
	purego.RegisterLibFunc(&g.setIconFromFile, gtk, "gtk_window_set_icon_from_file")
	purego.RegisterLibFunc(&g.signalConnect, gobj, "g_signal_connect_data")
	purego.RegisterLibFunc(&g.idleAdd, glib, "g_idle_add")
	purego.RegisterLibFunc(&g.setPrgname, glib, "g_set_prgname")
	var winClose func(w uintptr)
	purego.RegisterLibFunc(&winClose, gtk, "gtk_window_close")
	g.setPrgname("CreatorHub")
	if !g.initCheck(0, 0) {
		t.Fatal("gtk_init_check")
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
	g.setTitle(win, "Test äöü")
	if !g.setIconFromFile(win, "/home/claude/macos/icons/hub-256.png", 0) {
		t.Error("Symbol ließ sich nicht setzen")
	}
	asked := 0
	del := purego.NewCallback(func(w, ev, data uintptr) uintptr {
		asked++
		if asked == 1 {
			return 1 // erstes Mal: Schließen verhindern (wie bei „nicht gespeichert“)
		}
		return 0
	})
	destroyed := false
	destroy := purego.NewCallback(func(w, data uintptr) uintptr { destroyed = true; g.mainQuit(); return 0 })
	g.signalConnect(win, "delete-event", del, 0, 0, 0)
	g.signalConnect(win, "destroy", destroy, 0, 0, 0)
	g.showAll(win)
	go func() {
		time.Sleep(300 * time.Millisecond)
		gtkOnMain(g, func() { winClose(win) }) // 1. Versuch: wird abgelehnt
		time.Sleep(300 * time.Millisecond)
		gtkOnMain(g, func() { g.hide(win); g.showAll(win); g.present(win) })
		time.Sleep(300 * time.Millisecond)
		gtkOnMain(g, func() { winClose(win) }) // 2. Versuch: schließt
	}()
	done := make(chan bool)
	go func() { time.Sleep(5 * time.Second); close(done) }()
	g.main()
	if asked != 2 || !destroyed {
		t.Fatalf("asked=%d destroyed=%v", asked, destroyed)
	}
}

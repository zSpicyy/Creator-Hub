// Dateityp-Umwandler als eigenständige App: dieselbe Oberfläche wie im Hub, aber mit eigenem
// Fenster, eigenem Symbol und eigener Verknüpfung (Desktop, Startmenü, Taskleiste).
package main

import (
	"kit"
	"kit/solo"

	"hub/tools/convert"
)

func main() {
	t := convert.New()
	a := kit.New("Dateityp-Umwandler", kit.T("Dateityp-Umwandler", "File Converter"))
	a.W, a.H = 1100, 760
	t.Mount(a.Mux)
	if !t.Installed() {
		go t.Install()
	}
	solo.Enable(a, solo.Config{Tool: "Dateityp-Umwandler", Title: "Dateityp-Umwandler", TitleEN: "File Converter", Logo: "convert", Color: "#1fc4b8", Needs: []solo.Need{solo.FFmpeg("Damit Videos, Musik und Bilder umgewandelt werden können.", "So videos, music and images can be converted.")}})
	a.Run(convert.Web())
}

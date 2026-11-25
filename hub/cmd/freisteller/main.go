// Freisteller als eigenständige App: dieselbe Oberfläche wie im Hub, aber mit eigenem Fenster
// und eigenem Symbol. Läuft ohne den Hub; die KI wird beim ersten Start geladen.
package main

import (
	"kit"
	"kit/solo"

	"hub/tools/cutout"
)

func main() {
	t := cutout.New()
	a := kit.New("Freisteller", kit.T("Hintergrund-Entferner", "Background Remover"))
	a.W, a.H = 1280, 820
	t.Mount(a.Mux)
	if !t.Installed() {
		go t.Install()
	}
	solo.Enable(a, solo.Config{Tool: "Freisteller", Title: "Hintergrund-Entferner", TitleEN: "Background Remover", Logo: "cutout", Color: "#e0449a", Needs: []solo.Need{solo.AI("cutout", "Die KI, die den Hintergrund erkennt und entfernt. Wird einmal geladen, danach läuft alles ohne Internet.", "The AI that detects and removes the background. Downloaded once, after that everything works offline.")}})
	a.Run(cutout.Web())
}

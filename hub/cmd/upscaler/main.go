// Upscaler als eigenständige App: dieselbe Oberfläche wie im Hub, aber mit eigenem Fenster
// und eigenem Symbol. Läuft ohne den Hub; die KI wird beim ersten Start geladen.
package main

import (
	"kit"
	"kit/solo"

	"hub/tools/upscale"
)

func main() {
	t := upscale.New()
	a := kit.New("Upscaler", kit.T("Upscaler", "Upscaler"))
	a.W, a.H = 1100, 780
	t.Mount(a.Mux)
	if !t.Installed() {
		go t.Install()
	}
	solo.Enable(a, solo.Config{Tool: "Upscaler", Title: "Upscaler", TitleEN: "Upscaler", Logo: "upscale", Color: "#33c97c", Needs: []solo.Need{solo.AI("upscale", "Die KI, die deine Bilder vergrößert und schärft. Wird einmal geladen, danach läuft alles ohne Internet.", "The AI that enlarges and sharpens your images. Downloaded once, after that everything works offline.")}})
	a.Run(upscale.Web())
}

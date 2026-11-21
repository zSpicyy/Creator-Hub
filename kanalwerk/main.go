// Kanalwerk: Uploads planen (YouTube, TikTok, Facebook, Instagram), Statistiken aller Netzwerke, beste Zeiten, Kanal-Vergleich,
// Link-Seite, Monatsbericht und automatische Ankündigungen. Werkzeug des Creator Hub und Einzel-App.
package main

import (
	"embed"
	"io/fs"

	"kit"
	"kit/solo"
)

//go:embed web
var webFS embed.FS

func isDE() bool { return kit.Lang() != "en" }

func tr(de, en string) string {
	if isDE() {
		return de
	}
	return en
}

func main() {
	a := kit.New("Kanalwerk", "Kanalwerk")
	a.W, a.H = 1360, 880
	dataDir = a.Root
	loadData()
	routes(a.Mux)
	go uploadLoop()
	go announceLoop()
	go statsLoop()
	solo.Enable(a, solo.Config{Tool: "Kanalwerk", Title: "Kanalwerk", TitleEN: "Kanalwerk", Logo: "kanalwerk", Color: "#ff6b4a"})
	web, _ := fs.Sub(webFS, "web")
	a.Run(web)
}

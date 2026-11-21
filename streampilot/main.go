// StreamPilot: Songwünsche, Vorlesen (TTS), Alerts und Chat-Befehle für Twitch-Streamer.
// Läuft als eigenständiges Werkzeug des Creator Hub (eigenes Fenster, eigene Verknüpfung) und
// genauso als Einzel-App von der Webseite. Logins und Einstellungen liegen in
// <Konfigurationsordner>/StreamPilot und bleiben bei Updates erhalten.
package main

import (
	"embed"
	"io/fs"
	"os"
	"time"

	"kit"
	"kit/solo"
)

//go:embed web
var webFS embed.FS

func main() {
	// Vorlesen soll ohne Klick ins Fenster abspielen dürfen
	if os.Getenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") == "" {
		os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--autoplay-policy=no-user-gesture-required")
	}
	a := kit.New("StreamPilot", "StreamPilot")
	a.W, a.H = 1320, 860
	initDataDir(a.Root)
	cfg.Load()
	migrateOld()
	spotify.Load()
	botAuth.Load()
	streamerAuth.Load()
	routes(a.Mux)
	comRoutes(a.Mux)

	go func() {
		if spotify.Connected() && spotify.Name() == "" {
			if me, err := spotify.Call("GET", "/me", nil); err == nil {
				spotify.mu.Lock()
				spotify.tok.Name = str(me, "display_name", str(me, "id", ""))
				spotify.tok.UserID = str(me, "id", "")
				spotify.mu.Unlock()
				spotify.persist()
			}
		}
	}()
	if startMode() == "app" && (botAuth.Connected() || streamerAuth.Connected()) && twitchClientID() != "" {
		go func() { time.Sleep(500 * time.Millisecond); _ = StartBot() }()
	}
	go liveLoop()
	go ensureAIStarted() // KI läuft, solange StreamPilot offen ist
	solo.Enable(a, solo.Config{Tool: "StreamPilot", Title: "StreamPilot", TitleEN: "StreamPilot", Logo: "streampilot", Color: "#7c4dff"})
	web, _ := fs.Sub(webFS, "web")
	startOverlay(web)
	a.Run(web)
	StopBot()
}

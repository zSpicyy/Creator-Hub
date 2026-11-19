# StreamPilot (Werkzeug im Creator Hub)

Songwünsche, Vorlesen (TTS), Alerts und Chat-Befehle für Twitch-Streamer.
Eigenständiges Werkzeug wie MP3-Schneider: der Hub bringt es als Payload mit (`Kind: "app"`),
als Einzel-App läuft es mit `solo.Enable` (Zahnrad: Updates, Design, Sprache).

- `main.go` – Start über `kit` (Fenster, Design, Einzelinstanz, Updates über `kit/update`)
- `api.go` – Schnittstelle für `web/index.html`
- `bot.go` – Chat-Befehle, Songwünsche, VoteSkip, Alerts (Chat + EventSub)
- `twitch.go` – Login per Gerätecode, Chat (IRC/TLS), Follower-Check, EventSub
- `spotify.go` – Login (PKCE, Redirect http://127.0.0.1:8888/callback), Warteschlange
- `tts.go` – Warteschlange, Filter, natürliche Microsoft-Stimmen; abgespielt wird im Fenster
- `sorter.go` – Playlist-Sortierer (Beta, Ollama)
- `migrate.go` – übernimmt einmalig Logins/Einstellungen aus dem alten „Playlist-Sortierer“

Daten: `<Konfigurationsordner>/StreamPilot` (getrennt vom Programm, Updates loggen nicht aus).
Texte: eigene Wörterbücher DE/EN in `web/index.html`, Sprache kommt aus `/kit/theme`.

Eingetragen in: hub/main.go, hub/payload.go, hub/payload_darwin.go, hub/web/index.html (Farbe, Symbol),
hub/web/logos + kit/assets/logos (streampilot.svg), build-all.sh, appimage/build-linux.sh,
macos/build-mac.sh, build-tools.sh, macos/make-icons.py, macos/icons/StreamPilot*, kit/setup (Beenden beim Update),
kit/i18n/en.py, webseite/build2.py.

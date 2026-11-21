package main

// Wann der Bot startet: nur von Hand, sobald StreamPilot offen ist, oder wenn der Stream live geht.

import (
	"time"
)

func startMode() string {
	m := gStr("startMode")
	// ältere Einstellung „Bot automatisch starten“ übernehmen
	if cfg.Get("startMode") == nil {
		if v, ok := cfg.Get("autoStart").(bool); ok && v {
			return "app"
		}
	}
	switch m {
	case "app", "live":
		return m
	}
	return "manual"
}

var liveStarted bool // der Bot wurde durch „Live gehen“ gestartet

// liveLoop schaut jede Minute, ob der Stream läuft, und startet bzw. stoppt den Bot.
func liveLoop() {
	time.Sleep(10 * time.Second)
	for {
		if startMode() == "live" && streamerAuth.Connected() && twitchClientID() != "" {
			uid := streamerAuth.UserID()
			if uid != "" {
				if m, err := helix("GET", "/streams?user_id="+uid, nil); err == nil {
					live := len(asList(m["data"])) > 0
					botMu.Lock()
					running := bot != nil && bot.running
					botMu.Unlock()
					switch {
					case live && !running:
						if StartBot() == nil {
							liveStarted = true
							logEvent("ok", "%s", tr("Du bist live: Bot automatisch gestartet.", "You are live: bot started automatically."))
						}
					case !live && running && liveStarted && gBool("stopOffline"):
						StopBot()
						liveStarted = false
						logEvent("info", "%s", tr("Stream beendet: Bot automatisch gestoppt.", "Stream ended: bot stopped automatically."))
					}
				}
			}
		}
		time.Sleep(time.Minute)
	}
}

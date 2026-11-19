package main

import (
	"context"
	"encoding/json"
	"kit"
	"kit/setup"
	"kit/solo"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func body(r *http.Request) map[string]any {
	m := map[string]any{}
	_ = json.NewDecoder(r.Body).Decode(&m)
	return m
}

func generalSettings() map[string]any {
	out := map[string]any{}
	for k := range GeneralDefaults {
		out[k] = generalGet(k)
	}
	snap := cfg.Snapshot()
	for _, k := range []string{"spotifyClientId", "twitchClientId", "channel"} {
		out[k] = str(snap, k, "")
	}
	return out
}

func stateJSON() map[string]any {
	var cmds []map[string]any
	for _, c := range commands() {
		cmds = append(cmds, map[string]any{"key": c.Key, "names": c.Names, "prefix": c.Prefix, "level": c.Level, "on": c.On,
			"changed": c.Changed, "full": c.Full, "group": c.Group})
	}
	t := ttsCfg()
	delete(t, "sources")
	words := badWords()
	t["words"] = words
	_, wordsChanged := cfg.Section("tts")["words"]
	t["wordsChanged"] = wordsChanged
	var srcs []map[string]any
	storedSrc := sub(cfg.Section("tts"), "sources")
	for _, d := range TTSSources {
		s := ttsSource(d.Key)
		_, ch := storedSrc[d.Key]
		srcs = append(srcs, map[string]any{"key": d.Key, "on": s.On, "level": s.Level, "readName": s.ReadName, "voice": s.Voice, "changed": ch})
	}
	var alerts []map[string]any
	storedAl := cfg.Section("alerts")
	for _, d := range Alerts {
		a := alertCfg(d.Key)
		_, ch := storedAl[d.Key]
		alerts = append(alerts, map[string]any{"key": d.Key, "on": a.On, "text": a.Text, "min": a.Min, "voice": a.Voice, "changed": ch,
			"hasMsg": d.HasMsg, "vars": d.Vars, "hasMin": d.Key == "bits" || d.Key == "raid"})
	}
	return map[string]any{
		"version":  setup.Version,
		"settings": generalSettings(),
		"accounts": map[string]any{
			"spotify":  map[string]any{"connected": spotify.Connected(), "name": spotify.Name(), "playback": spotify.HasPlaybackScope(), "redirect": spotifyRedirect},
			"bot":      map[string]any{"connected": botAuth.Connected(), "login": botAuth.Login()},
			"streamer": map[string]any{"connected": streamerAuth.Connected(), "login": streamerAuth.Login(), "full": streamerAuth.Has("moderator:read:followers") && streamerAuth.Has("chat:edit") && streamerAuth.Has("channel:read:redemptions")},
		},
		"bot":      botStatus(),
		"commands": cmds,
		"replies":  cfg.Section("replies"),
		"tts":      t,
		"sources":  srcs,
		"alerts":   alerts,
		"alertsOn": boolean(storedAl, "enabled", false),
		"ttsQueue": tts.Len(),
		"lang":     kit.Lang(),
		"solo":     solo.Standalone(),
		"defaults": map[string]any{
			"repliesEN": DefaultRepliesEN, "repliesDE": DefaultRepliesDE, "edgeVoices": EdgeVoices,
		},
	}
}

var loginMu sync.Mutex
var loginState = map[string]map[string]any{}

func setLogin(which string, m map[string]any) {
	loginMu.Lock()
	loginState[which] = m
	loginMu.Unlock()
}

func routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, stateJSON()) })

	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		since, _ := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
		writeJSON(w, map[string]any{"events": eventsSince(since), "bot": botStatus(), "ttsQueue": tts.Len(), "loginState": func() any {
			loginMu.Lock()
			defer loginMu.Unlock()
			b, _ := json.Marshal(loginState)
			var m any
			_ = json.Unmarshal(b, &m)
			return m
		}()})
	})

	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		for k, v := range body(r) {
			if _, ok := GeneralDefaults[k]; ok || k == "spotifyClientId" || k == "twitchClientId" || k == "channel" {
				if s, ok := v.(string); ok && (k == "spotifyClientId" || k == "twitchClientId" || k == "channel") {
					v = strings.TrimSpace(s)
				}
				cfg.Set(k, v)
			}
		}
		writeJSON(w, stateJSON())
	})

	// ---- Befehle
	mux.HandleFunc("/api/command", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		key := str(b, "key", "")
		all := cfg.Section("commands")
		cur := sub(all, key)
		for _, f := range []string{"names", "level", "on", "prefix"} {
			if v, ok := b[f]; ok {
				cur[f] = v
			}
		}
		// Entspricht wieder dem Standard? Dann gilt er als unverändert.
		for _, d := range DefaultCommands {
			if d.Key == key && str(cur, "names", d.Names) == d.Names && int(num(cur, "level", float64(d.Level))) == d.Level &&
				boolean(cur, "on", d.On) == d.On && str(cur, "prefix", "") == "" {
				cur = nil
			}
		}
		if cur == nil {
			delete(all, key)
		} else {
			all[key] = cur
		}
		cfg.SetSection("commands", all)
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/command/reset", func(w http.ResponseWriter, r *http.Request) {
		key := str(body(r), "key", "")
		all := cfg.Section("commands")
		if key == "*" {
			all = map[string]any{}
		} else {
			delete(all, key)
		}
		cfg.SetSection("commands", all)
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/replies", func(w http.ResponseWriter, r *http.Request) {
		cfg.SetSection("replies", body(r))
		writeJSON(w, stateJSON())
	})

	// ---- TTS
	mux.HandleFunc("/api/tts", func(w http.ResponseWriter, r *http.Request) {
		t := cfg.Section("tts")
		for k, v := range body(r) {
			if _, ok := TTSDefaults[k]; ok || k == "words" {
				t[k] = v
			}
		}
		cfg.SetSection("tts", t)
		if !boolean(ttsCfg(), "enabled", false) {
			tts.Clear()
		}
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/tts/source", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		t := cfg.Section("tts")
		srcs := sub(t, "sources")
		key := str(b, "key", "")
		if boolean(b, "reset", false) {
			delete(srcs, key)
		} else {
			s := sub(srcs, key)
			s[str(b, "field", "")] = b["value"]
			srcs[key] = s
		}
		t["sources"] = srcs
		cfg.SetSection("tts", t)
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/tts/reset", func(w http.ResponseWriter, r *http.Request) {
		what := str(body(r), "what", "all")
		t := cfg.Section("tts")
		if what == "words" {
			delete(t, "words")
		} else {
			enabled := t["enabled"]
			t = map[string]any{}
			if enabled != nil {
				t["enabled"] = enabled
			}
		}
		cfg.SetSection("tts", t)
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/tts/next", func(w http.ResponseWriter, r *http.Request) {
		it := tts.Next()
		writeJSON(w, map[string]any{"item": it, "skip": tts.SkipSeq()})
	})
	mux.HandleFunc("/api/tts/skipseq", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"skip": tts.SkipSeq(), "queue": tts.Len()})
	})
	mux.HandleFunc("/api/tts/audio", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		data, err := EdgeSynth(str(b, "text", ""), str(b, "voice", "de-DE-KatjaNeural"), num(b, "rate", 0), num(b, "pitch", 0), num(b, "volume", 80))
		if err != nil {
			writeErr(w, 502, err.Error())
			return
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write(data)
	})
	mux.HandleFunc("/api/tts/skip", func(w http.ResponseWriter, r *http.Request) { tts.Skip(); writeJSON(w, map[string]any{}) })
	mux.HandleFunc("/api/tts/clear", func(w http.ResponseWriter, r *http.Request) { tts.Clear(); writeJSON(w, map[string]any{}) })
	mux.HandleFunc("/api/tts/test", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		text := CleanText(ttsCfg(), str(b, "text", ""), map[string]string{}, false)
		if text != "" {
			tts.Push(text, str(b, "voice", ""), 10)
		}
		writeJSON(w, map[string]any{"text": text})
	})

	// ---- Alerts
	mux.HandleFunc("/api/alerts", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		a := cfg.Section("alerts")
		if v, ok := b["enabled"]; ok {
			a["enabled"] = v
		}
		if key := str(b, "key", ""); key != "" {
			if boolean(b, "reset", false) {
				delete(a, key)
			} else {
				e := sub(a, key)
				e[str(b, "field", "")] = b["value"]
				a[key] = e
			}
		}
		if boolean(b, "resetAll", false) {
			a = map[string]any{"enabled": a["enabled"]}
		}
		cfg.SetSection("alerts", a)
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/alerts/test", func(w http.ResponseWriter, r *http.Request) {
		key := str(body(r), "key", "")
		a := alertCfg(key)
		demo := map[string]string{"user": "zSpicyyy", "message": "Great stream, keep it up!", "months": "12", "target": "Max", "count": "5", "bits": "500", "viewers": "42", "reward": "Hydrate"}
		if kit.Lang() == "de" {
			demo["message"] = "Mega Stream, weiter so!"
		}
		text := strings.Join(strings.Fields(fill(a.Text, demo)), " ")
		tts.Push(text, a.Voice, 10)
		writeJSON(w, map[string]any{"text": text})
	})

	// ---- Bot & Spotify
	mux.HandleFunc("/api/bot/start", func(w http.ResponseWriter, r *http.Request) {
		if err := StartBot(); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		writeJSON(w, botStatus())
	})
	mux.HandleFunc("/api/bot/stop", func(w http.ResponseWriter, r *http.Request) { StopBot(); writeJSON(w, botStatus()) })
	mux.HandleFunc("/api/spotify/skip", func(w http.ResponseWriter, r *http.Request) {
		if err := spotify.Next(); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		writeJSON(w, map[string]any{})
	})
	mux.HandleFunc("/api/spotify/login", func(w http.ResponseWriter, r *http.Request) {
		setLogin("spotify", map[string]any{"busy": true})
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()
			if err := spotify.Login(ctx); err != nil {
				setLogin("spotify", map[string]any{"error": err.Error()})
			} else {
				setLogin("spotify", map[string]any{"done": true})
				logEvent("ok", "Spotify connected (%s)", spotify.Name())
			}
		}()
		writeJSON(w, map[string]any{})
	})
	mux.HandleFunc("/api/spotify/logout", func(w http.ResponseWriter, r *http.Request) { spotify.Disconnect(); writeJSON(w, stateJSON()) })

	var stopLogin = map[string]chan struct{}{}
	mux.HandleFunc("/api/twitch/login", func(w http.ResponseWriter, r *http.Request) {
		which := str(body(r), "which", "streamer")
		if twitchClientID() == "" {
			writeErr(w, 400, "twitch_missing")
			return
		}
		auth, scopes := streamerAuth, streamerScopes
		if which == "bot" {
			auth, scopes = botAuth, botScopes
		}
		dc, err := auth.StartDevice(scopes)
		if err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		loginMu.Lock()
		if c, ok := stopLogin[which]; ok {
			close(c)
		}
		stop := make(chan struct{})
		stopLogin[which] = stop
		loginMu.Unlock()
		setLogin(which, map[string]any{"code": dc.UserCode, "uri": dc.URI})
		go func() {
			if err := auth.WaitDevice(dc, scopes, stop); err != nil {
				setLogin(which, map[string]any{"error": err.Error()})
				return
			}
			setLogin(which, map[string]any{"done": true})
			if which == "streamer" && cfg.Str("channel", "") == "" {
				cfg.Set("channel", auth.Login())
			}
			logEvent("ok", "Twitch %s connected (%s)", which, auth.Login())
			// Bot mit dem neuen Konto neu starten
			botMu.Lock()
			running := bot != nil
			botMu.Unlock()
			if running {
				StopBot()
			}
			if running || gBool("autoStart") {
				_ = StartBot()
			}
		}()
		writeJSON(w, map[string]any{"code": dc.UserCode, "uri": dc.URI})
	})
	mux.HandleFunc("/api/twitch/logout", func(w http.ResponseWriter, r *http.Request) {
		which := str(body(r), "which", "")
		if which == "bot" {
			botAuth.Disconnect()
		} else {
			streamerAuth.Disconnect()
		}
		botMu.Lock()
		running := bot != nil
		botMu.Unlock()
		if running {
			StopBot()
			_ = StartBot()
		}
		writeJSON(w, stateJSON())
	})
	mux.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		u := str(body(r), "url", "")
		if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://localhost") {
			openBrowser(u)
		}
		writeJSON(w, map[string]any{})
	})

	// ---- Playlist-Sortierer
	mux.HandleFunc("/api/sort/info", func(w http.ResponseWriter, r *http.Request) {
		out := map[string]any{"models": ollamaModels(), "job": sortJob.Snapshot(), "created": len(cfg.Section("sortCreated"))}
		if spotify.Connected() {
			if pl, err := myPlaylists(); err == nil {
				out["playlists"] = pl
			} else {
				out["error"] = err.Error()
			}
		}
		writeJSON(w, out)
	})
	mux.HandleFunc("/api/sort/job", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, sortJob.Snapshot()) })
	mux.HandleFunc("/api/sort/run", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		var ids []string
		for _, x := range asList(b["ids"]) {
			if s, ok := x.(string); ok {
				ids = append(ids, s)
			}
		}
		go runSort(ids, str(b, "model", ""))
		writeJSON(w, map[string]any{})
	})
	mux.HandleFunc("/api/sort/edit", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		i := int(num(b, "i", -1))
		sortJob.mu.Lock()
		if i >= 0 && i < len(sortJob.Songs) {
			if g := strings.TrimSpace(str(b, "genre", "")); g != "" {
				sortJob.Songs[i].Genre = g
			}
			if m := str(b, "mood", ""); m != "" {
				sortJob.Songs[i].Mood = m
			}
		}
		sortJob.mu.Unlock()
		writeJSON(w, sortJob.Snapshot())
	})
	mux.HandleFunc("/api/sort/apply", func(w http.ResponseWriter, r *http.Request) {
		b := body(r)
		sortJob.mu.Lock()
		songs := append([]SortSong{}, sortJob.Songs...)
		sortJob.mu.Unlock()
		groups := sortGroups(songs, boolean(b, "splitMood", true), boolean(b, "chillMix", true), int(num(b, "minSongs", 3)))
		n, err := applySort(groups, str(b, "prefix", ""))
		if err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		writeJSON(w, map[string]any{"added": n, "playlists": len(groups)})
	})
	mux.HandleFunc("/api/sort/forget", func(w http.ResponseWriter, r *http.Request) {
		cfg.SetSection("sortCreated", map[string]any{})
		writeJSON(w, map[string]any{})
	})
}

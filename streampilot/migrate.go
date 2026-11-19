package main

// Übernimmt einmalig Logins und Einstellungen aus dem alten „Playlist-Sortierer“ (Python),
// damit sich niemand neu einloggen muss.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

func readOld(dir, name string, v any) bool {
	b, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		return false
	}
	return json.Unmarshal(b, v) == nil
}

func findOldApp() string {
	home, _ := os.UserHomeDir()
	cands := []string{
		filepath.Join(home, "Downloads", "playlist-sortierer", "playlist-sortierer"),
		filepath.Join(home, "Downloads", "playlist-sortierer"),
		filepath.Join(home, "Desktop", "playlist-sortierer"),
	}
	for _, c := range cands {
		if _, err := os.Stat(filepath.Join(c, "config.json")); err == nil {
			return c
		}
	}
	return ""
}

func migrateOld() {
	if cfg.Bool("migrated", false) {
		return
	}
	defer cfg.Set("migrated", true)
	dir := findOldApp()
	if dir == "" {
		return
	}
	old := map[string]any{}
	if !readOld(dir, "config.json", &old) {
		return
	}
	set := func(k string, v any) {
		if v != nil {
			cfg.Set(k, v)
		}
	}
	set("spotifyClientId", old["client_id"])
	tw := sub(old, "twitch")
	set("twitchClientId", tw["client_id"])
	set("channel", tw["channel"])
	set("srLimit", tw["limit"])
	set("voteNeeded", tw["voteskip_needed"])
	set("maxMinutes", tw["max_minutes"])
	set("modsUnlimited", tw["mods_unlimited"])
	set("srOn", tw["sr_on"])
	set("blocked", tw["blocked"])
	set("cmdPrefix", old["cmd_prefix"])
	cfg.Set("chatLang", "de")

	ver := num(old, "cfg_version", 1)
	cmds := map[string]any{}
	for k, v := range sub(old, "commands") {
		m, _ := v.(map[string]any)
		if m == nil {
			continue
		}
		lvl := num(m, "level", 0)
		if ver < 2 && lvl >= 1 {
			lvl++
		}
		var names []string
		for _, n := range strings.Split(str(m, "names", ""), ",") {
			if c := cleanCmd(n); c != "" {
				names = append(names, c)
			}
		}
		cmds[k] = map[string]any{"names": strings.Join(names, ", "), "level": lvl, "on": boolean(m, "on", true), "prefix": str(m, "prefix", "")}
	}
	if len(cmds) > 0 {
		cfg.SetSection("commands", cmds)
	}
	if r := sub(old, "replies"); len(r) > 0 {
		cfg.SetSection("replies", r)
	}

	ot := sub(old, "tts")
	nt := map[string]any{}
	mapKeys := map[string]string{"enabled": "enabled", "rate": "rate", "pitch": "pitch", "volume": "volume", "reward_name": "rewardName",
		"name_format": "nameFormat", "max_chars": "maxChars", "max_queue": "maxQueue", "cooldown": "cooldown", "pause_ms": "pauseMs",
		"links": "links", "emotes": "emotes", "ignore_commands": "ignoreCommands", "collapse": "collapse", "ignored_users": "ignoredUsers",
		"filter_on": "filterOn", "block_whole": "blockWhole", "replacements": "replacements", "words": "words"}
	for a, b := range mapKeys {
		if v, ok := ot[a]; ok {
			nt[b] = v
		}
	}
	if strings.HasPrefix(str(ot, "engine", "Windows"), "Nat") {
		nt["voice"] = str(ot, "voice_edge", "de-DE-KatjaNeural")
	} else if v := str(ot, "voice_win", ""); v != "" {
		nt["voice"] = v
	}
	srcs := map[string]any{}
	for k, v := range sub(ot, "sources") {
		m, _ := v.(map[string]any)
		voice := str(m, "voice", "")
		if voice == "Standard" {
			voice = ""
		}
		srcs[k] = map[string]any{"on": boolean(m, "on", true), "level": num(m, "level", 0), "readName": boolean(m, "read_name", true), "voice": voice}
	}
	if len(srcs) > 0 {
		nt["sources"] = srcs
	}
	if len(nt) > 0 {
		cfg.SetSection("tts", nt)
	}
	oa := sub(old, "alerts")
	na := map[string]any{"enabled": boolean(oa, "enabled", false)}
	for k, v := range oa {
		if m, ok := v.(map[string]any); ok {
			voice := str(m, "voice", "")
			if voice == "Standard" {
				voice = ""
			}
			e := map[string]any{"voice": voice}
			for _, f := range []string{"on", "text", "min"} {
				if x, ok := m[f]; ok {
					e[f] = x
				}
			}
			na[k] = e
		}
	}
	cfg.SetSection("alerts", na)

	// Logins
	st := map[string]any{}
	if readOld(dir, "token.json", &st) && str(st, "refresh_token", "") != "" {
		t := SpotifyToken{Access: str(st, "access_token", ""), Refresh: str(st, "refresh_token", ""), Scope: str(st, "scope", ""), ExpiresAt: int64(num(st, "expires_at", 0))}
		_ = saveJSON("spotify.json", t)
	}
	for _, p := range [][2]string{{"twitch_bot.json", "twitch_bot.json"}, {"twitch_streamer.json", "twitch_streamer.json"}} {
		t := TwitchToken{}
		if readOld(dir, p[0], &t) && t.Refresh != "" {
			_ = saveJSON(p[1], t)
		}
	}
	created := map[string]any{}
	if readOld(dir, "erstellte_playlists.json", &created) && len(created) > 0 {
		cfg.SetSection("sortCreated", created)
	}
	logEvent("ok", "Settings and logins imported from the old app")
}

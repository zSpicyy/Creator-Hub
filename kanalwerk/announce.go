package main

// Ankündigungen: neues YouTube-Video und Stream-Start automatisch auf Discord und im Twitch-Chat melden.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func discordSend(hook, msg string) error {
	if !strings.HasPrefix(hook, "https://discord.com/api/webhooks/") && !strings.HasPrefix(hook, "https://discordapp.com/api/webhooks/") {
		return fmt.Errorf("%s", tr("Das ist keine Discord-Webhook-Adresse.", "That is not a Discord webhook URL."))
	}
	b, _ := json.Marshal(map[string]any{"content": msg, "allowed_mentions": map[string]any{"parse": []string{}}})
	resp, err := httpc.Post(hook, "application/json", bytes.NewReader(b))
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("Discord %d", resp.StatusCode)
	}
	return nil
}

func fill(tpl string, kv map[string]string) string {
	for k, v := range kv {
		tpl = strings.ReplaceAll(tpl, "{"+k+"}", v)
	}
	return tpl
}

// latestVideo holt das neueste öffentliche Video.
func latestVideo() (id, title string, err error) {
	pl := view().YT.UploadsPL
	if pl == "" {
		return "", "", fmt.Errorf("no uploads playlist")
	}
	p, err := ytGet("/playlistItems", url.Values{"part": {"contentDetails"}, "playlistId": {pl}, "maxResults": {"5"}})
	if err != nil {
		return "", "", err
	}
	var ids []string
	for _, it := range list(p["items"]) {
		ids = append(ids, s(obj(it["contentDetails"])["videoId"]))
	}
	if len(ids) == 0 {
		return "", "", nil
	}
	v, err := ytGet("/videos", url.Values{"part": {"snippet,status"}, "id": {strings.Join(ids, ",")}})
	if err != nil {
		return "", "", err
	}
	var best int64
	for _, it := range list(v["items"]) {
		if s(obj(it["status"])["privacyStatus"]) != "public" {
			continue
		}
		t, _ := time.Parse(time.RFC3339, s(obj(it["snippet"])["publishedAt"]))
		if t.Unix() > best {
			best, id, title = t.Unix(), s(it["id"]), s(obj(it["snippet"])["title"])
		}
	}
	return id, title, nil
}

func announceVideo(id, title string, test bool) []string {
	d := view()
	msg := fill(d.Ann.VideoMsg, map[string]string{"title": title, "url": "https://youtu.be/" + id, "channel": d.YT.ChannelName})
	var errs []string
	if d.Ann.VideoDiscord && d.Ann.Discord != "" {
		if err := discordSend(d.Ann.Discord, msg); err != nil {
			errs = append(errs, "Discord: "+err.Error())
		}
	}
	if d.Ann.VideoTwitch && d.TW.Access != "" {
		if err := twSay(msg); err != nil {
			errs = append(errs, "Twitch: "+err.Error())
		}
	}
	pre := ""
	if test {
		pre = "Test: "
	}
	if len(errs) > 0 {
		annLog(pre + tr("Video-Meldung mit Fehlern: ", "Video announcement with errors: ") + strings.Join(errs, "; "))
	} else {
		annLog(pre + tr("Video gemeldet: ", "Video announced: ") + title)
	}
	return errs
}

func announceLive(title, game string, test bool) []string {
	d := view()
	msg := fill(d.Ann.LiveMsg, map[string]string{"title": title, "game": game, "url": "https://twitch.tv/" + d.TW.Login, "channel": d.TW.Name})
	var errs []string
	if d.Ann.Discord == "" {
		errs = append(errs, tr("Keine Discord-Webhook-Adresse eingetragen.", "No Discord webhook URL entered."))
	} else if err := discordSend(d.Ann.Discord, msg); err != nil {
		errs = append(errs, "Discord: "+err.Error())
	}
	pre := ""
	if test {
		pre = "Test: "
	}
	if len(errs) > 0 {
		annLog(pre + tr("Live-Meldung mit Fehlern: ", "Live announcement with errors: ") + strings.Join(errs, "; "))
	} else {
		annLog(pre + tr("Live gemeldet: ", "Live announced: ") + title)
	}
	return errs
}

// announceLoop prüft alle 5 Minuten, solange Kanalwerk offen ist.
func announceLoop() {
	time.Sleep(20 * time.Second)
	for {
		d := view()
		if d.Ann.VideoOn && (d.YT.Refresh != "" || d.YT.Access != "") {
			if id, title, err := latestVideo(); err == nil && id != "" && id != d.Ann.LastVideo {
				first := d.Ann.LastVideo == ""
				edit(func(x *Data) { x.Ann.LastVideo = id })
				// beim ersten Mal nur merken, nicht melden (sonst käme das alte Video)
				if !first {
					announceVideo(id, title, false)
				}
			}
		}
		if d.Ann.LiveOn && d.TW.UserID != "" {
			if m, err := helix("GET", "/streams?user_id="+d.TW.UserID, nil); err == nil {
				l := list(m["data"])
				live := len(l) > 0
				if live && !d.Ann.WasLive {
					announceLive(s(l[0]["title"]), s(l[0]["game_name"]), false)
				}
				if live != d.Ann.WasLive {
					edit(func(x *Data) { x.Ann.WasLive = live })
				}
			}
		}
		time.Sleep(5 * time.Minute)
	}
}

// statsLoop aktualisiert die Zahlen alle 6 Stunden.
func statsLoop() {
	time.Sleep(8 * time.Second)
	for {
		d := view()
		if time.Since(time.Unix(d.Fetched, 0)) > 6*time.Hour && (d.YT.Refresh != "" || d.TW.Access != "") {
			refreshAll()
		}
		time.Sleep(30 * time.Minute)
	}
}

var _ = http.StatusOK

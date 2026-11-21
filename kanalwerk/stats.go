package main

// Statistiken: YouTube und Twitch abrufen, tägliche Stände merken, beste Zeiten berechnen, Kanäle vergleichen.

import (
	"fmt"
	"math"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

var refreshMu sync.Mutex

func refreshAll() map[string]string {
	refreshMu.Lock()
	defer refreshMu.Unlock()
	errs := map[string]string{}
	d := view()
	if d.YT.Refresh != "" || d.YT.Access != "" {
		if err := refreshYouTube(); err != nil {
			errs["yt"] = err.Error()
		}
	}
	if d.TW.Access != "" {
		if err := refreshTwitch(); err != nil {
			errs["tw"] = err.Error()
		}
	}
	if d.Meta.Token != "" {
		if err := refreshMeta(); err != nil {
			errs["meta"] = err.Error()
		}
	}
	if d.TT.Access != "" {
		if err := refreshTikTok(); err != nil {
			errs["tt"] = err.Error()
		}
	}
	refreshRivals()
	takeSnap()
	edit(func(d *Data) { d.Fetched = time.Now().Unix() })
	return errs
}

func refreshYouTube() error {
	if err := ytLoadChannel(); err != nil {
		return err
	}
	m, err := ytGet("/channels", url.Values{"part": {"statistics"}, "mine": {"true"}})
	if err != nil {
		return err
	}
	if it := list(m["items"]); len(it) > 0 {
		st := obj(it[0]["statistics"])
		edit(func(d *Data) {
			d.Stats["ytSubs"] = int64(num(st["subscriberCount"]))
			d.Stats["ytViews"] = int64(num(st["viewCount"]))
			d.Stats["ytVideos"] = int64(num(st["videoCount"]))
		})
	}
	// letzte 50 Videos mit Zahlen
	pl := view().YT.UploadsPL
	if pl != "" {
		p, err := ytGet("/playlistItems", url.Values{"part": {"contentDetails"}, "playlistId": {pl}, "maxResults": {"50"}})
		if err == nil {
			var ids []string
			for _, it := range list(p["items"]) {
				ids = append(ids, s(obj(it["contentDetails"])["videoId"]))
			}
			if len(ids) > 0 {
				v, err := ytGet("/videos", url.Values{"part": {"snippet,statistics,status,contentDetails"}, "id": {strings.Join(ids, ",")}})
				if err == nil {
					var vs []Video
					for _, it := range list(v["items"]) {
						sn, st, ss := obj(it["snippet"]), obj(it["statistics"]), obj(it["status"])
						pub, _ := time.Parse(time.RFC3339, s(sn["publishedAt"]))
						var at int64
						if t, e := time.Parse(time.RFC3339, s(ss["publishAt"])); e == nil {
							at = t.Unix()
						}
						vs = append(vs, Video{ID: s(it["id"]), Title: s(sn["title"]), Thumb: s(obj(obj(sn["thumbnails"])["medium"])["url"]), Published: pub.Unix(), PublishAt: at,
							Privacy: s(ss["privacyStatus"]), Views: int64(num(st["viewCount"])), Likes: int64(num(st["likeCount"])), Comments: int64(num(st["commentCount"])), Duration: s(obj(it["contentDetails"])["duration"])})
					}
					edit(func(d *Data) { d.Videos = vs })
				}
			}
		}
	}
	// Tageswerte der letzten 90 Tage (YouTube Analytics)
	end := time.Now().AddDate(0, 0, -1)
	a, err := ytAnalytics(url.Values{"ids": {"channel==MINE"}, "startDate": {end.AddDate(0, 0, -89).Format("2006-01-02")}, "endDate": {end.Format("2006-01-02")},
		"metrics": {"views,estimatedMinutesWatched,subscribersGained,subscribersLost"}, "dimensions": {"day"}, "sort": {"day"}})
	if err != nil {
		return fmt.Errorf("%s %v", tr("Analytics:", "Analytics:"), err)
	}
	var days []DayStat
	if rows, ok := a["rows"].([]any); ok {
		for _, r := range rows {
			c, _ := r.([]any)
			if len(c) < 5 {
				continue
			}
			days = append(days, DayStat{Day: s(c[0]), Views: int64(num(c[1])), Minutes: int64(num(c[2])), SubsIn: int64(num(c[3])), SubsOut: int64(num(c[4]))})
		}
	}
	edit(func(d *Data) { d.Days = days })
	return nil
}

func refreshTwitch() error {
	d := view()
	if d.TW.UserID == "" {
		if err := twLoadUser(); err != nil {
			return err
		}
		d = view()
	}
	f, err := helix("GET", "/channels/followers?broadcaster_id="+d.TW.UserID, nil)
	if err != nil {
		return err
	}
	edit(func(x *Data) { x.Stats["twFollowers"] = int64(num(f["total"])) })
	v, err := helix("GET", "/videos?user_id="+d.TW.UserID+"&type=archive&first=40", nil)
	if err == nil {
		var vods []VOD
		for _, it := range list(v["data"]) {
			t, _ := time.Parse(time.RFC3339, s(it["created_at"]))
			th := strings.NewReplacer("%{width}", "320", "%{height}", "180").Replace(s(it["thumbnail_url"]))
			vods = append(vods, VOD{ID: s(it["id"]), Title: s(it["title"]), Created: t.Unix(), Views: int64(num(it["view_count"])), Dur: s(it["duration"]), Thumb: th})
		}
		edit(func(x *Data) { x.VODs = vods })
	}
	return nil
}

// takeSnap merkt sich einmal am Tag die Gesamtzahlen (für Wachstumskurven).
func takeSnap() {
	edit(func(d *Data) {
		sn := Snap{Day: today(), YTSubs: d.Stats["ytSubs"], YTViews: d.Stats["ytViews"], YTVideos: d.Stats["ytVideos"], TWFollowers: d.Stats["twFollowers"],
			IGFollowers: d.Stats["igFollowers"], FBFollowers: d.Stats["fbFollowers"], TTFollowers: d.Stats["ttFollowers"]}
		if n := len(d.Snaps); n > 0 && d.Snaps[n-1].Day == sn.Day {
			d.Snaps[n-1] = sn
		} else {
			d.Snaps = append(d.Snaps, sn)
		}
		if len(d.Snaps) > 800 {
			d.Snaps = d.Snaps[len(d.Snaps)-800:]
		}
	})
}

// ---------------------------------------------------------------- Beste Zeiten

type Heat struct {
	Grid  [7][24]float64 `json:"grid"`  // 0..1, Montag = 0
	Count [7][24]int     `json:"count"` // wie viele Videos in dem Feld
	Top   []string       `json:"top"`
	N     int            `json:"n"`
}

// bestTimes bewertet jede Veröffentlichung: Aufrufe pro Tag seit dem Erscheinen,
// im Verhältnis zum Median des Kanals. Felder ohne eigene Daten bekommen Werte der Nachbarstunden.
func bestTimes(items []struct {
	At    int64
	Views int64
}) Heat {
	h := Heat{Top: []string{}} // nie null, sonst stürzt die Bericht-Seite ab
	if len(items) == 0 {
		return h
	}
	now := time.Now()
	var rates []float64
	for _, it := range items {
		days := math.Max(1, now.Sub(time.Unix(it.At, 0)).Hours()/24)
		rates = append(rates, float64(it.Views)/math.Sqrt(days))
	}
	med := median(rates)
	if med <= 0 {
		med = 1
	}
	var sum [7][24]float64
	for i, it := range items {
		t := time.Unix(it.At, 0).Local()
		wd := (int(t.Weekday()) + 6) % 7
		sum[wd][t.Hour()] += rates[i] / med
		h.Count[wd][t.Hour()]++
		h.N++
	}
	// weich zeichnen: jede Stunde zählt auch für ±2 Stunden mit
	var raw [7][24]float64
	maxv := 0.0
	for d := 0; d < 7; d++ {
		for hr := 0; hr < 24; hr++ {
			var v, w float64
			for k := -2; k <= 2; k++ {
				hh := (hr + k + 24) % 24
				if c := h.Count[d][hh]; c > 0 {
					wt := 1 / (1 + math.Abs(float64(k)))
					v += wt * sum[d][hh] / float64(c)
					w += wt
				}
			}
			if w > 0 {
				raw[d][hr] = v / w
			}
			maxv = math.Max(maxv, raw[d][hr])
		}
	}
	type cell struct {
		d, h int
		v    float64
	}
	var cells []cell
	for d := 0; d < 7; d++ {
		for hr := 0; hr < 24; hr++ {
			if maxv > 0 {
				h.Grid[d][hr] = raw[d][hr] / maxv
			}
			if h.Count[d][hr] > 0 {
				cells = append(cells, cell{d, hr, sum[d][hr] / float64(h.Count[d][hr])})
			}
		}
	}
	sort.Slice(cells, func(i, j int) bool { return cells[i].v > cells[j].v })
	names := strings.Split(tr("Montag,Dienstag,Mittwoch,Donnerstag,Freitag,Samstag,Sonntag", "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday"), ",")
	for i := 0; i < len(cells) && i < 3; i++ {
		h.Top = append(h.Top, fmt.Sprintf(tr("%s, %d–%d Uhr", "%s, %d:00–%d:00"), names[cells[i].d], cells[i].h, (cells[i].h+1)%24))
	}
	return h
}

func median(a []float64) float64 {
	if len(a) == 0 {
		return 0
	}
	b := append([]float64{}, a...)
	sort.Float64s(b)
	return b[len(b)/2]
}

func heatYT(d Data) Heat {
	var it []struct {
		At    int64
		Views int64
	}
	for _, v := range d.Videos {
		if v.Privacy == "public" && v.Published > 0 && time.Since(time.Unix(v.Published, 0)) > 48*time.Hour {
			it = append(it, struct {
				At    int64
				Views int64
			}{v.Published, v.Views})
		}
	}
	return bestTimes(it)
}

// heatPosts: beste Zeiten aus Instagram-, Facebook- oder TikTok-Beiträgen (bewertet nach Likes + Kommentaren bzw. Aufrufen)
func heatPosts(d Data, net string) Heat {
	var it []struct {
		At    int64
		Views int64
	}
	for _, p := range d.Posts {
		if p.Net != net || p.At == 0 || time.Since(time.Unix(p.At, 0)) < 24*time.Hour {
			continue
		}
		v := p.Views
		if net != "tt" || v == 0 {
			v = p.Likes + 3*p.Comments
		}
		it = append(it, struct {
			At    int64
			Views int64
		}{p.At, v})
	}
	return bestTimes(it)
}

func heatTW(d Data) Heat {
	var it []struct {
		At    int64
		Views int64
	}
	for _, v := range d.VODs {
		it = append(it, struct {
			At    int64
			Views int64
		}{v.Created, v.Views})
	}
	return bestTimes(it)
}

// ---------------------------------------------------------------- Kanal-Vergleich

func parseRival(kind, in string) string {
	in = strings.TrimSpace(in)
	in = strings.TrimSuffix(in, "/")
	if i := strings.LastIndex(in, "/"); i >= 0 {
		in = in[i+1:]
	}
	if kind == "tw" || kind == "ig" {
		return strings.ToLower(strings.TrimPrefix(in, "@"))
	}
	if strings.HasPrefix(in, "UC") && len(in) == 24 {
		return in
	}
	if !strings.HasPrefix(in, "@") {
		in = "@" + in
	}
	return in
}

func refreshRivals() {
	d := view()
	for _, r := range d.Rivals {
		var subs, views int64
		var name, avatar, ext, errS string
		switch r.Kind {
		case "yt":
			q := url.Values{"part": {"snippet,statistics"}}
			if strings.HasPrefix(r.Handle, "UC") {
				q.Set("id", r.Handle)
			} else {
				q.Set("forHandle", r.Handle)
			}
			m, err := ytGet("/channels", q)
			if err != nil {
				errS = err.Error()
				break
			}
			it := list(m["items"])
			if len(it) == 0 {
				errS = tr("Kanal nicht gefunden.", "Channel not found.")
				break
			}
			sn, st := obj(it[0]["snippet"]), obj(it[0]["statistics"])
			name, ext = s(sn["title"]), s(it[0]["id"])
			avatar = s(obj(obj(sn["thumbnails"])["default"])["url"])
			subs, views = int64(num(st["subscriberCount"])), int64(num(st["viewCount"]))
		case "ig":
			p := metaPage(view())
			if p.IGID == "" {
				errS = tr("Für Instagram-Vergleiche muss dein Instagram verbunden sein.", "Instagram comparisons need your Instagram connected.")
				break
			}
			m, err := graph("GET", "/"+p.IGID, p.Token, url.Values{"fields": {"business_discovery.username(" + strings.TrimPrefix(r.Handle, "@") + "){username,name,profile_picture_url,followers_count,media_count}"}})
			if err != nil {
				errS = err.Error()
				break
			}
			bd := obj(m["business_discovery"])
			name, avatar, ext = firstOf(bd["name"], bd["username"]), s(bd["profile_picture_url"]), s(bd["username"])
			subs, views = int64(num(bd["followers_count"])), int64(num(bd["media_count"]))
		case "tw":
			m, err := helix("GET", "/users?login="+url.QueryEscape(r.Handle), nil)
			if err != nil {
				errS = err.Error()
				break
			}
			u := list(m["data"])
			if len(u) == 0 {
				errS = tr("Kanal nicht gefunden.", "Channel not found.")
				break
			}
			ext, name, avatar = s(u[0]["id"]), s(u[0]["display_name"]), s(u[0]["profile_image_url"])
			if f, err := helix("GET", "/channels/followers?broadcaster_id="+ext, nil); err == nil {
				subs = int64(num(f["total"]))
			}
		}
		id := r.ID
		edit(func(d *Data) {
			for i := range d.Rivals {
				x := &d.Rivals[i]
				if x.ID != id {
					continue
				}
				x.Error = errS
				if errS != "" {
					return
				}
				x.Name, x.Avatar, x.Ext = name, avatar, ext
				sn := RSnap{Day: today(), Subs: subs, Views: views}
				if n := len(x.Snaps); n > 0 && x.Snaps[n-1].Day == sn.Day {
					x.Snaps[n-1] = sn
				} else {
					x.Snaps = append(x.Snaps, sn)
				}
				if len(x.Snaps) > 400 {
					x.Snaps = x.Snaps[len(x.Snaps)-400:]
				}
			}
		})
	}
}

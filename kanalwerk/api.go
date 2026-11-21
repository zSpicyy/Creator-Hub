package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kit"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(400)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func body(r *http.Request, v any) error {
	return json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(v)
}

// state liefert alles fürs Fenster, ohne Zugangsschlüssel.
func state() map[string]any {
	d := view()
	ytLogin.Lock()
	ys := ytLogin.state
	ytLogin.Unlock()
	twLogin.Lock()
	tl := map[string]string{"code": twLogin.Code, "uri": twLogin.URI, "state": twLogin.State}
	twLogin.Unlock()
	yt := map[string]any{"clientId": d.YT.ClientID, "hasSecret": d.YT.Secret != "", "connected": d.YT.Refresh != "" || d.YT.Access != "",
		"channel": d.YT.ChannelName, "channelId": d.YT.ChannelID, "avatar": d.YT.Avatar, "login": ys}
	tw := map[string]any{"clientId": d.TW.ClientID, "connected": d.TW.Access != "", "login": d.TW.Login, "name": d.TW.Name, "avatar": d.TW.Avatar, "device": tl}
	mp := metaPage(d)
	var pages []map[string]string
	for _, p := range d.Meta.Pages {
		pages = append(pages, map[string]string{"id": p.ID, "name": p.Name, "ig": p.IGName})
	}
	meta := map[string]any{"appId": d.Meta.AppID, "hasSecret": d.Meta.Secret != "", "connected": d.Meta.Token != "", "name": d.Meta.Name, "pages": pages,
		"pageId": mp.ID, "page": mp.Name, "ig": mp.IGName, "igPic": mp.IGPic, "login": getLogin("meta"), "redirect": metaRedir}
	tt := map[string]any{"clientKey": d.TT.ClientKey, "hasSecret": d.TT.Secret != "", "connected": d.TT.Access != "", "name": d.TT.Name, "avatar": d.TT.Avatar, "login": getLogin("tt"), "redirect": ttRedir}
	return map[string]any{"meta": meta, "tt": tt, "posts": d.Posts, "heatIG": heatPosts(d, "ig"), "heatFB": heatPosts(d, "fb"), "heatTT": heatPosts(d, "tt"), "yt": yt, "tw": tw, "uploads": d.Uploads, "events": d.Events, "snaps": d.Snaps, "rivals": d.Rivals, "link": d.Link,
		"ann": d.Ann, "videos": d.Videos, "vods": d.VODs, "days": d.Days, "stats": d.Stats, "fetched": d.Fetched, "tourDone": d.TourDone,
		"heatYT": heatYT(d), "heatTW": heatTW(d), "lang": map[bool]string{true: "de", false: "en"}[isDE()]}
}

func uid() string { return kit.RandID(5) }

func routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, state()) })

	// Konten
	mux.HandleFunc("/api/yt/creds", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ClientID, Secret string }
		_ = body(r, &in)
		edit(func(d *Data) {
			d.YT.ClientID = strings.TrimSpace(in.ClientID)
			if in.Secret != "" {
				d.YT.Secret = strings.TrimSpace(in.Secret)
			}
		})
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/yt/login", func(w http.ResponseWriter, r *http.Request) {
		u, err := ytStartLogin()
		if err != nil {
			fail(w, err.Error())
			return
		}
		writeJSON(w, map[string]string{"url": u})
	})
	mux.HandleFunc("/api/yt/logout", func(w http.ResponseWriter, r *http.Request) {
		edit(func(d *Data) {
			cid, sec := d.YT.ClientID, d.YT.Secret
			d.YT = YTAuth{ClientID: cid, Secret: sec}
			d.Videos = []Video{}
			d.Days = []DayStat{}
		})
		ytLogin.Lock()
		ytLogin.state = ""
		ytLogin.Unlock()
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/tw/creds", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ClientID string }
		_ = body(r, &in)
		edit(func(d *Data) { d.TW.ClientID = strings.TrimSpace(in.ClientID) })
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/tw/login", func(w http.ResponseWriter, r *http.Request) {
		m, err := twStartLogin()
		if err != nil {
			fail(w, err.Error())
			return
		}
		writeJSON(w, m)
	})
	mux.HandleFunc("/api/tw/logout", func(w http.ResponseWriter, r *http.Request) {
		edit(func(d *Data) { cid := d.TW.ClientID; d.TW = TWAuth{ClientID: cid}; d.VODs = []VOD{} })
		twLogin.Lock()
		twLogin.State, twLogin.Code = "", ""
		twLogin.Unlock()
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/meta/creds", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ AppID, Secret string }
		_ = body(r, &in)
		edit(func(d *Data) {
			d.Meta.AppID = strings.TrimSpace(in.AppID)
			if in.Secret != "" {
				d.Meta.Secret = strings.TrimSpace(in.Secret)
			}
		})
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/meta/login", func(w http.ResponseWriter, r *http.Request) {
		if err := metaStartLogin(); err != nil {
			fail(w, err.Error())
			return
		}
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/meta/page", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ID string }
		_ = body(r, &in)
		edit(func(d *Data) { d.Meta.PageID = in.ID })
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/meta/logout", func(w http.ResponseWriter, r *http.Request) {
		edit(func(d *Data) {
			id, sec := d.Meta.AppID, d.Meta.Secret
			d.Meta = MetaAuth{AppID: id, Secret: sec, Pages: []MetaPage{}}
			keep := []Post{}
			for _, p := range d.Posts {
				if p.Net == "tt" {
					keep = append(keep, p)
				}
			}
			d.Posts = keep
		})
		setLogin("meta", "")
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/tt/creds", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ClientKey, Secret string }
		_ = body(r, &in)
		edit(func(d *Data) {
			d.TT.ClientKey = strings.TrimSpace(in.ClientKey)
			if in.Secret != "" {
				d.TT.Secret = strings.TrimSpace(in.Secret)
			}
		})
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/tt/login", func(w http.ResponseWriter, r *http.Request) {
		if err := ttStartLogin(); err != nil {
			fail(w, err.Error())
			return
		}
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/tt/logout", func(w http.ResponseWriter, r *http.Request) {
		edit(func(d *Data) {
			k, sec := d.TT.ClientKey, d.TT.Secret
			d.TT = TTAuth{ClientKey: k, Secret: sec}
			keep := []Post{}
			for _, p := range d.Posts {
				if p.Net != "tt" {
					keep = append(keep, p)
				}
			}
			d.Posts = keep
		})
		setLogin("tt", "")
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ URL string }
		_ = body(r, &in)
		if strings.HasPrefix(in.URL, "https://") {
			openBrowser(in.URL)
		}
		writeJSON(w, map[string]bool{"ok": true})
	})

	// Statistik
	mux.HandleFunc("/api/refresh", func(w http.ResponseWriter, r *http.Request) {
		errs := refreshAll()
		st := state()
		st["errors"] = errs
		writeJSON(w, st)
	})

	// Uploads
	mux.HandleFunc("/api/upload/add", func(w http.ResponseWriter, r *http.Request) {
		var u Upload
		if err := body(r, &u); err != nil {
			fail(w, "bad")
			return
		}
		if u.Privacy == "" {
			u.Privacy = "public"
		}
		if err := validUpload(u); err != nil {
			fail(w, err.Error())
			return
		}
		u.ID, u.Status, u.Created, u.Progress, u.Error, u.VideoID = uid(), "wait", time.Now().Unix(), 0, "", ""
		u.TState = map[string]TState{}
		for _, n := range targetsOf(u) {
			u.TState[n] = TState{Status: "wait"}
		}
		edit(func(d *Data) { d.Uploads = append(d.Uploads, u) })
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/upload/do", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ ID, Do string }
		_ = body(r, &in)
		edit(func(d *Data) {
			for i := range d.Uploads {
				u := &d.Uploads[i]
				if u.ID != in.ID {
					continue
				}
				switch in.Do {
				case "retry":
					if u.Status == "error" {
						u.Status, u.Error = "wait", ""
						for k, t := range u.TState {
							if t.Status == "error" {
								u.TState[k] = TState{Status: "wait"}
							}
						}
					}
				case "remove":
					if u.Status != "uploading" {
						d.Uploads = append(d.Uploads[:i], d.Uploads[i+1:]...)
					}
					return
				}
			}
		})
		writeJSON(w, state())
	})

	// Kalender
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Do string
			E  CalEvent
		}
		_ = body(r, &in)
		edit(func(d *Data) {
			switch in.Do {
			case "save":
				if strings.TrimSpace(in.E.Title) == "" {
					return
				}
				for i := range d.Events {
					if d.Events[i].ID == in.E.ID {
						d.Events[i] = in.E
						return
					}
				}
				in.E.ID = uid()
				d.Events = append(d.Events, in.E)
			case "delete":
				for i := range d.Events {
					if d.Events[i].ID == in.E.ID {
						d.Events = append(d.Events[:i], d.Events[i+1:]...)
						return
					}
				}
			}
		})
		writeJSON(w, state())
	})

	// Vergleich
	mux.HandleFunc("/api/rivals", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Do, Kind, Handle, ID string }
		_ = body(r, &in)
		switch in.Do {
		case "add":
			h := parseRival(in.Kind, in.Handle)
			if h == "" || h == "@" || (in.Kind != "yt" && in.Kind != "tw") {
				fail(w, tr("Gib einen Kanalnamen oder Link ein.", "Enter a channel name or link."))
				return
			}
			edit(func(d *Data) {
				d.Rivals = append(d.Rivals, Rival{ID: uid(), Kind: in.Kind, Handle: h, Name: h, Snaps: []RSnap{}})
			})
			refreshRivals()
		case "remove":
			edit(func(d *Data) {
				for i := range d.Rivals {
					if d.Rivals[i].ID == in.ID {
						d.Rivals = append(d.Rivals[:i], d.Rivals[i+1:]...)
						return
					}
				}
			})
		}
		writeJSON(w, state())
	})

	// Link-Seite
	mux.HandleFunc("/api/link", func(w http.ResponseWriter, r *http.Request) {
		var l LinkPage
		if err := body(r, &l); err != nil {
			fail(w, "bad")
			return
		}
		edit(func(d *Data) { d.Link = l })
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/link/export", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ HTML string }
		_ = body(r, &in)
		dir := ""
		if p, err := kit.PickPath("folder", ""); err == nil && len(p) > 0 {
			dir = p[0]
		} else {
			home, _ := os.UserHomeDir()
			dir = filepath.Join(home, "Downloads")
			_ = os.MkdirAll(dir, 0o755)
		}
		p := filepath.Join(dir, "link-seite.html")
		if err := os.WriteFile(p, []byte(in.HTML), 0o644); err != nil {
			fail(w, err.Error())
			return
		}
		kit.OpenFolder(p)
		writeJSON(w, map[string]string{"path": p})
	})

	// Ankündigungen
	mux.HandleFunc("/api/ann", func(w http.ResponseWriter, r *http.Request) {
		var a Announce
		if err := body(r, &a); err != nil {
			fail(w, "bad")
			return
		}
		edit(func(d *Data) {
			a.LastVideo, a.WasLive, a.Log = d.Ann.LastVideo, d.Ann.WasLive, d.Ann.Log
			a.Discord = strings.TrimSpace(a.Discord)
			d.Ann = a
		})
		writeJSON(w, state())
	})
	mux.HandleFunc("/api/ann/test", func(w http.ResponseWriter, r *http.Request) {
		var in struct{ Kind string }
		_ = body(r, &in)
		var errs []string
		if in.Kind == "live" {
			errs = announceLive(tr("Test-Stream", "Test stream"), "Minecraft", true)
		} else {
			id, title, err := latestVideo()
			if err != nil || id == "" {
				id, title = "dQw4w9WgXcQ", tr("Test-Video", "Test video")
			}
			errs = announceVideo(id, title, true)
		}
		st := state()
		st["errors"] = errs
		writeJSON(w, st)
	})

	mux.HandleFunc("/api/pick", func(w http.ResponseWriter, r *http.Request) {
		p, err := kit.PickPath("file", r.URL.Query().Get("filter"))
		if err != nil {
			fail(w, err.Error())
			return
		}
		writeJSON(w, map[string]any{"paths": p})
	})
	// lokale Bilder (Thumbnail-Vorschau)
	mux.HandleFunc("/api/img", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("p")
		ext := strings.ToLower(filepath.Ext(p))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, p)
	})
	mux.HandleFunc("/api/tour", func(w http.ResponseWriter, r *http.Request) {
		edit(func(d *Data) { d.TourDone = true })
		writeJSON(w, map[string]bool{"ok": true})
	})
}

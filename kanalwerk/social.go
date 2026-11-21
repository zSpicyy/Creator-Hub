package main

// Instagram, Facebook (über Meta Graph API) und TikTok: Anmeldung, Zahlen, Beiträge und Upload.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const graphV = "v21.0"

var (
	graphBase   = "https://graph.facebook.com/" + graphV
	graphVideo  = "https://graph-video.facebook.com/" + graphV
	ruploadBase = "https://rupload.facebook.com/ig-api-upload/" + graphV
	ttAPI       = "https://open.tiktokapis.com"
)

// feste lokale Rückleitungsadressen (müssen in den Developer-Apps eingetragen werden)
const (
	metaPort  = 17362
	ttPort    = 17363
	metaRedir = "http://localhost:17362/"
	ttRedir   = "http://localhost:17363/callback/"
)

const metaScopes = "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management"
const ttScopes = "user.info.basic,user.info.stats,video.list,video.upload,video.publish"

var loginMu sync.Mutex
var loginState = map[string]string{}

func setLogin(n, v string) {
	loginMu.Lock()
	loginState[n] = v
	loginMu.Unlock()
}

func getLogin(n string) string {
	loginMu.Lock()
	defer loginMu.Unlock()
	return loginState[n]
}

// loopLogin wartet auf der festen lokalen Adresse auf die Rückleitung nach der Anmeldung.
func loopLogin(net_ string, port int, path, state, authURL string, onCode func(q url.Values) error) error {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return fmt.Errorf("%s %d %s", tr("Die lokale Adresse für die Anmeldung (Port", "The local sign-in address (port"), port, tr(") ist belegt. Schließe andere Kanalwerk-Fenster.", ") is in use. Close other Kanalwerk windows."))
	}
	setLogin(net_, "waiting")
	srv := &http.Server{}
	srv.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != path {
			http.NotFound(w, r)
			return
		}
		q := r.URL.Query()
		res := "ok"
		if e := firstOf(q.Get("error_description"), q.Get("error_message"), q.Get("error")); e != "" {
			res = tr("Anmeldung abgebrochen: ", "Sign-in cancelled: ") + e
		} else if q.Get("state") != state {
			res = tr("Ungültige Rückmeldung.", "Invalid response.")
		} else if err := onCode(q); err != nil {
			res = err.Error()
		}
		setLogin(net_, res)
		msg := tr("Fertig! Du kannst dieses Fenster schließen und zu Kanalwerk zurückkehren.", "Done! You can close this window and go back to Kanalwerk.")
		if res != "ok" {
			msg = res
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><body style="font:18px system-ui;display:grid;place-items:center;height:90vh;background:#eef2f7;color:#14233b"><p>%s</p>`, htmlEsc(msg))
		go func() { time.Sleep(time.Second); srv.Close() }()
	})
	go srv.Serve(ln)
	go func() { time.Sleep(10 * time.Minute); srv.Close() }()
	openBrowser(authURL)
	return nil
}

// ---------------------------------------------------------------- Meta (Facebook-Seite + Instagram)

func metaPage(d Data) MetaPage {
	for _, p := range d.Meta.Pages {
		if p.ID == d.Meta.PageID {
			return p
		}
	}
	if len(d.Meta.Pages) > 0 {
		return d.Meta.Pages[0]
	}
	return MetaPage{}
}

func metaStartLogin() error {
	d := view()
	if strings.TrimSpace(d.Meta.AppID) == "" || strings.TrimSpace(d.Meta.Secret) == "" {
		return fmt.Errorf("%s", tr("Trag zuerst App-ID und App-Geheimcode ein.", "Enter the app ID and app secret first."))
	}
	state := randStr(12)
	q := url.Values{"client_id": {d.Meta.AppID}, "redirect_uri": {metaRedir}, "state": {state}, "scope": {metaScopes}, "response_type": {"code"}}
	return loopLogin("meta", metaPort, "/", state, "https://www.facebook.com/"+graphV+"/dialog/oauth?"+q.Encode(), func(q url.Values) error {
		d := view()
		m, err := graph("GET", "/oauth/access_token", "", url.Values{"client_id": {d.Meta.AppID}, "client_secret": {d.Meta.Secret}, "redirect_uri": {metaRedir}, "code": {q.Get("code")}})
		if err != nil {
			return err
		}
		// in einen langlebigen Schlüssel (ca. 60 Tage) tauschen
		long, err := graph("GET", "/oauth/access_token", "", url.Values{"grant_type": {"fb_exchange_token"}, "client_id": {d.Meta.AppID}, "client_secret": {d.Meta.Secret}, "fb_exchange_token": {s(m["access_token"])}})
		tok, exp := s(m["access_token"]), int64(num(m["expires_in"]))
		if err == nil {
			tok, exp = s(long["access_token"]), int64(num(long["expires_in"]))
		}
		if exp == 0 {
			exp = 60 * 86400
		}
		edit(func(d *Data) { d.Meta.Token, d.Meta.Expiry = tok, time.Now().Unix()+exp })
		return metaLoadPages()
	})
}

func metaLoadPages() error {
	tok := view().Meta.Token
	me, err := graph("GET", "/me", tok, url.Values{"fields": {"name"}})
	if err != nil {
		return err
	}
	acc, err := graph("GET", "/me/accounts", tok, url.Values{"fields": {"id,name,access_token,instagram_business_account{id,username,profile_picture_url}"}, "limit": {"50"}})
	if err != nil {
		return err
	}
	var pages []MetaPage
	for _, p := range list(acc["data"]) {
		ig := obj(p["instagram_business_account"])
		pages = append(pages, MetaPage{ID: s(p["id"]), Name: s(p["name"]), Token: s(p["access_token"]), IGID: s(ig["id"]), IGName: s(ig["username"]), IGPic: s(ig["profile_picture_url"])})
	}
	edit(func(d *Data) {
		d.Meta.Name = s(me["name"])
		d.Meta.Pages = pages
		found := false
		for _, p := range pages {
			if p.ID == d.Meta.PageID {
				found = true
			}
		}
		if !found && len(pages) > 0 {
			d.Meta.PageID = pages[0].ID
		}
	})
	if len(pages) == 0 {
		return fmt.Errorf("%s", tr("Angemeldet, aber keine Facebook-Seite gefunden. Instagram und Facebook brauchen eine Seite, mit der das Instagram-Konto (Business oder Creator) verknüpft ist.", "Signed in, but no Facebook Page found. Instagram and Facebook need a Page linked to the Instagram account (business or creator)."))
	}
	return nil
}

func graph(method, path, tok string, q url.Values) (map[string]any, error) {
	if q == nil {
		q = url.Values{}
	}
	if tok != "" {
		q.Set("access_token", tok)
	}
	var req *http.Request
	if method == "GET" || method == "DELETE" {
		req, _ = http.NewRequest(method, graphBase+path+"?"+q.Encode(), nil)
	} else {
		req, _ = http.NewRequest(method, graphBase+path, strings.NewReader(q.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	resp, err := httpc.Do(req)
	return graphJSON(resp, err)
}

func graphJSON(resp *http.Response, err error) (map[string]any, error) {
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	if resp.StatusCode >= 300 || m["error"] != nil {
		msg := s(obj(m["error"])["message"])
		if msg == "" {
			msg = strings.TrimSpace(string(b))
		}
		return nil, fmt.Errorf("Meta %d: %s", resp.StatusCode, msg)
	}
	return m, nil
}

func refreshMeta() error {
	d := view()
	if d.Meta.Token == "" {
		return nil
	}
	if err := metaLoadPages(); err != nil {
		return err
	}
	d = view()
	p := metaPage(d)
	var posts []Post
	if p.Token != "" {
		if m, err := graph("GET", "/"+p.ID, p.Token, url.Values{"fields": {"followers_count,fan_count"}}); err == nil {
			edit(func(x *Data) { x.Stats["fbFollowers"] = int64(num(firstNum(m["followers_count"], m["fan_count"]))) })
		}
		if m, err := graph("GET", "/"+p.ID+"/posts", p.Token, url.Values{"fields": {"message,created_time,permalink_url,full_picture,reactions.summary(total_count),comments.summary(total_count),shares"}, "limit": {"40"}}); err == nil {
			for _, it := range list(m["data"]) {
				t, _ := time.Parse("2006-01-02T15:04:05-0700", s(it["created_time"]))
				posts = append(posts, Post{Net: "fb", ID: s(it["id"]), Title: short80(s(it["message"])), Thumb: s(it["full_picture"]), At: t.Unix(),
					Likes: int64(num(obj(obj(it["reactions"])["summary"])["total_count"])), Comments: int64(num(obj(obj(it["comments"])["summary"])["total_count"])),
					Views: int64(num(obj(it["shares"])["count"])), URL: s(it["permalink_url"])})
			}
		}
	}
	if p.IGID != "" {
		tok := p.Token
		if m, err := graph("GET", "/"+p.IGID, tok, url.Values{"fields": {"username,followers_count,media_count,profile_picture_url"}}); err == nil {
			edit(func(x *Data) {
				x.Stats["igFollowers"] = int64(num(m["followers_count"]))
				x.Stats["igPosts"] = int64(num(m["media_count"]))
			})
		}
		if m, err := graph("GET", "/"+p.IGID+"/media", tok, url.Values{"fields": {"caption,media_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count"}, "limit": {"40"}}); err == nil {
			for _, it := range list(m["data"]) {
				t, _ := time.Parse("2006-01-02T15:04:05-0700", s(it["timestamp"]))
				th := s(it["thumbnail_url"])
				if th == "" && s(it["media_type"]) != "VIDEO" {
					th = s(it["media_url"])
				}
				posts = append(posts, Post{Net: "ig", ID: s(it["id"]), Title: short80(s(it["caption"])), Thumb: th, At: t.Unix(),
					Likes: int64(num(it["like_count"])), Comments: int64(num(it["comments_count"])), URL: s(it["permalink"])})
			}
		}
	}
	setPosts([]string{"fb", "ig"}, posts)
	return nil
}

func firstNum(v ...any) any {
	for _, x := range v {
		if x != nil {
			return x
		}
	}
	return 0.0
}

func short80(t string) string {
	t = strings.TrimSpace(strings.ReplaceAll(t, "\n", " "))
	if r := []rune(t); len(r) > 80 {
		return string(r[:79]) + "…"
	}
	return t
}

func setPosts(nets []string, posts []Post) {
	edit(func(d *Data) {
		keep := []Post{}
		for _, p := range d.Posts {
			drop := false
			for _, n := range nets {
				if p.Net == n {
					drop = true
				}
			}
			if !drop {
				keep = append(keep, p)
			}
		}
		d.Posts = append(keep, posts...)
	})
}

// fbUpload lädt ein Video auf die Facebook-Seite (fortsetzbar, in Stücken). Standard: unveröffentlicht.
func fbUpload(u Upload, prog func(float64)) (string, string, error) {
	p := metaPage(view())
	f, err := os.Open(u.File)
	if err != nil {
		return "", "", err
	}
	defer f.Close()
	st, _ := f.Stat()
	size := st.Size()
	start, err := graphJSON(httpc.PostForm(graphVideo+"/"+p.ID+"/videos", url.Values{"access_token": {p.Token}, "upload_phase": {"start"}, "file_size": {fmt.Sprint(size)}}))
	if err != nil {
		return "", "", err
	}
	sess := s(start["upload_session_id"])
	vid := s(start["video_id"])
	so, eo := int64(num(start["start_offset"])), int64(num(start["end_offset"]))
	for so < eo {
		chunk := make([]byte, eo-so)
		n, err := f.ReadAt(chunk, so)
		if err != nil && err != io.EOF {
			return "", "", err
		}
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		for k, v := range map[string]string{"access_token": p.Token, "upload_phase": "transfer", "upload_session_id": sess, "start_offset": fmt.Sprint(so)} {
			mw.WriteField(k, v)
		}
		fw, _ := mw.CreateFormFile("video_file_chunk", "chunk")
		fw.Write(chunk[:n])
		mw.Close()
		m, err := graphJSON(httpc.Post(graphVideo+"/"+p.ID+"/videos", mw.FormDataContentType(), &body))
		if err != nil {
			return "", "", err
		}
		so, eo = int64(num(m["start_offset"])), int64(num(m["end_offset"]))
		prog(float64(so) / float64(size))
	}
	fin := url.Values{"access_token": {p.Token}, "upload_phase": {"finish"}, "upload_session_id": {sess}, "title": {u.Title}, "description": {u.Desc}}
	note := tr("unveröffentlicht hochgeladen (nur in der Meta Business Suite sichtbar)", "uploaded unpublished (only visible in Meta Business Suite)")
	if u.FBPublish {
		fin.Set("published", "true")
		note = tr("veröffentlicht", "published")
		if u.PublishAt > time.Now().Unix()+10*60 {
			fin.Set("published", "false")
			fin.Set("scheduled_publish_time", fmt.Sprint(u.PublishAt))
			note = tr("geplant", "scheduled")
		}
	} else {
		fin.Set("published", "false")
	}
	if _, err := graphJSON(httpc.PostForm(graphVideo+"/"+p.ID+"/videos", fin)); err != nil {
		return "", "", err
	}
	return vid, note, nil
}

// igUpload lädt ein Reel zu Instagram. Ohne „veröffentlichen“ wird es nur vorbereitet und nicht gepostet,
// denn Instagram kennt keine privaten Beiträge.
func igUpload(u Upload, prog func(float64)) (string, string, error) {
	p := metaPage(view())
	cap := u.Title
	if u.Desc != "" {
		cap += "\n\n" + u.Desc
	}
	c, err := graph("POST", "/"+p.IGID+"/media", p.Token, url.Values{"media_type": {"REELS"}, "upload_type": {"resumable"}, "caption": {cap}, "share_to_feed": {"true"}})
	if err != nil {
		return "", "", err
	}
	cid := s(c["id"])
	b, err := os.ReadFile(u.File)
	if err != nil {
		return "", "", err
	}
	req, _ := http.NewRequest("POST", ruploadBase+"/"+cid, bytes.NewReader(b))
	req.Header.Set("Authorization", "OAuth "+p.Token)
	req.Header.Set("offset", "0")
	req.Header.Set("file_size", fmt.Sprint(len(b)))
	if _, err := graphJSON(httpc.Do(req)); err != nil {
		return "", "", err
	}
	prog(.7)
	// warten, bis Instagram das Video verarbeitet hat
	ready := false
	for i := 0; i < 60 && !ready; i++ {
		m, err := graph("GET", "/"+cid, p.Token, url.Values{"fields": {"status_code,status"}})
		if err != nil {
			return "", "", err
		}
		switch s(m["status_code"]) {
		case "FINISHED":
			ready = true
		case "ERROR", "EXPIRED":
			return "", "", fmt.Errorf("Instagram: %s", s(m["status"]))
		default:
			time.Sleep(5 * time.Second)
		}
	}
	if !ready {
		return "", "", fmt.Errorf("%s", tr("Instagram braucht zu lange für die Verarbeitung.", "Instagram is taking too long to process."))
	}
	prog(.9)
	if !u.IGPublish {
		return cid, tr("vorbereitet, nicht veröffentlicht", "prepared, not published"), nil
	}
	m, err := graph("POST", "/"+p.IGID+"/media_publish", p.Token, url.Values{"creation_id": {cid}})
	if err != nil {
		return "", "", err
	}
	return s(m["id"]), tr("veröffentlicht", "published"), nil
}

// ---------------------------------------------------------------- TikTok

func ttStartLogin() error {
	d := view()
	if strings.TrimSpace(d.TT.ClientKey) == "" || strings.TrimSpace(d.TT.Secret) == "" {
		return fmt.Errorf("%s", tr("Trag zuerst Client-Key und Client-Secret ein.", "Enter the client key and client secret first."))
	}
	verifier := randStr(48)
	sum := sha256.Sum256([]byte(verifier))
	state := randStr(12)
	q := url.Values{"client_key": {d.TT.ClientKey}, "scope": {ttScopes}, "response_type": {"code"}, "redirect_uri": {ttRedir}, "state": {state},
		"code_challenge": {hex.EncodeToString(sum[:])}, "code_challenge_method": {"S256"}}
	return loopLogin("tt", ttPort, "/callback/", state, "https://www.tiktok.com/v2/auth/authorize/?"+q.Encode(), func(q url.Values) error {
		d := view()
		m, err := ttToken(url.Values{"client_key": {d.TT.ClientKey}, "client_secret": {d.TT.Secret}, "code": {q.Get("code")}, "grant_type": {"authorization_code"}, "redirect_uri": {ttRedir}, "code_verifier": {verifier}})
		if err != nil {
			return err
		}
		ttSave(m)
		return ttLoadUser()
	})
}

func ttToken(form url.Values) (map[string]any, error) {
	resp, err := httpc.PostForm(ttAPI+"/v2/oauth/token/", form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	if resp.StatusCode >= 300 || s(m["access_token"]) == "" {
		return nil, fmt.Errorf("TikTok: %s", firstOf(m["error_description"], m["error"], resp.Status))
	}
	return m, nil
}

func ttSave(m map[string]any) {
	edit(func(d *Data) {
		d.TT.Access, d.TT.OpenID = s(m["access_token"]), s(m["open_id"])
		if r := s(m["refresh_token"]); r != "" {
			d.TT.Refresh = r
		}
		d.TT.Expiry = time.Now().Unix() + int64(num(m["expires_in"]))
	})
}

func ttAccess() (string, error) {
	d := view()
	if d.TT.Access == "" {
		return "", fmt.Errorf("%s", tr("TikTok ist nicht verbunden.", "TikTok is not connected."))
	}
	if time.Now().Unix() < d.TT.Expiry-60 {
		return d.TT.Access, nil
	}
	m, err := ttToken(url.Values{"client_key": {d.TT.ClientKey}, "client_secret": {d.TT.Secret}, "grant_type": {"refresh_token"}, "refresh_token": {d.TT.Refresh}})
	if err != nil {
		return "", err
	}
	ttSave(m)
	return s(m["access_token"]), nil
}

// ttCall ruft die TikTok-API mit JSON auf.
func ttCall(method, path string, body any) (map[string]any, error) {
	tok, err := ttAccess()
	if err != nil {
		return nil, err
	}
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, ttAPI+path, rd)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json; charset=UTF-8")
	resp, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	if e := obj(m["error"]); s(e["code"]) != "" && s(e["code"]) != "ok" {
		return nil, fmt.Errorf("TikTok: %s", firstOf(e["message"], e["code"]))
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("TikTok %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return obj(m["data"]), nil
}

func ttLoadUser() error {
	m, err := ttCall("GET", "/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,likes_count,video_count", nil)
	if err != nil {
		return err
	}
	u := obj(m["user"])
	edit(func(d *Data) {
		d.TT.Name, d.TT.Avatar = s(u["display_name"]), s(u["avatar_url"])
		d.Stats["ttFollowers"] = int64(num(u["follower_count"]))
		d.Stats["ttLikes"] = int64(num(u["likes_count"]))
		d.Stats["ttVideos"] = int64(num(u["video_count"]))
	})
	return nil
}

func refreshTikTok() error {
	if view().TT.Access == "" {
		return nil
	}
	if err := ttLoadUser(); err != nil {
		return err
	}
	m, err := ttCall("POST", "/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count", map[string]any{"max_count": 20})
	if err != nil {
		return err
	}
	var posts []Post
	for _, v := range list(m["videos"]) {
		t := firstOf(v["title"], v["video_description"])
		posts = append(posts, Post{Net: "tt", ID: s(v["id"]), Title: short80(t), Thumb: s(v["cover_image_url"]), At: int64(num(v["create_time"])),
			Views: int64(num(v["view_count"])), Likes: int64(num(v["like_count"])), Comments: int64(num(v["comment_count"])), URL: s(v["share_url"])})
	}
	setPosts([]string{"tt"}, posts)
	return nil
}

// ttUpload lädt ein Video zu TikTok. Standard ist „Nur ich“ (privat). Nicht geprüfte TikTok-Apps dürfen ohnehin nur privat posten.
func ttUpload(u Upload, prog func(float64)) (string, string, error) {
	info, err := ttCall("POST", "/v2/post/publish/creator_info/query/", map[string]any{})
	if err != nil {
		return "", "", err
	}
	priv := u.TTPrivacy
	if priv == "" {
		priv = "SELF_ONLY"
	}
	allowed := false
	opts, _ := info["privacy_level_options"].([]any)
	for _, x := range opts {
		if s(x) == priv {
			allowed = true
		}
	}
	if !allowed {
		return "", "", fmt.Errorf("%s %s", tr("TikTok erlaubt diese Sichtbarkeit für dein Konto gerade nicht:", "TikTok does not allow this visibility for your account right now:"), priv)
	}
	f, err := os.Open(u.File)
	if err != nil {
		return "", "", err
	}
	defer f.Close()
	st, _ := f.Stat()
	size := st.Size()
	// Stücke zwischen 5 und 64 MB, das letzte darf größer sein
	chunk := int64(10 << 20)
	if size < chunk {
		chunk = size
	}
	count := size / chunk
	title := u.Title
	if u.Tags != "" {
		for _, t := range strings.Split(u.Tags, ",") {
			if t = strings.TrimSpace(t); t != "" {
				title += " #" + strings.ReplaceAll(t, " ", "")
			}
		}
	}
	init, err := ttCall("POST", "/v2/post/publish/video/init/", map[string]any{
		"post_info":   map[string]any{"title": title, "privacy_level": priv, "disable_comment": false, "disable_duet": false, "disable_stitch": false},
		"source_info": map[string]any{"source": "FILE_UPLOAD", "video_size": size, "chunk_size": chunk, "total_chunk_count": count}})
	if err != nil {
		return "", "", err
	}
	up, pid := s(init["upload_url"]), s(init["publish_id"])
	for i := int64(0); i < count; i++ {
		a := i * chunk
		e := a + chunk - 1
		if i == count-1 {
			e = size - 1
		}
		buf := make([]byte, e-a+1)
		if _, err := f.ReadAt(buf, a); err != nil && err != io.EOF {
			return "", "", err
		}
		req, _ := http.NewRequest("PUT", up, bytes.NewReader(buf))
		req.Header.Set("Content-Type", "video/mp4")
		req.Header.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", a, e, size))
		resp, err := httpc.Do(req)
		if err != nil {
			return "", "", err
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return "", "", fmt.Errorf("TikTok Upload %d", resp.StatusCode)
		}
		prog(float64(e+1) / float64(size) * .9)
	}
	// warten, bis TikTok fertig ist
	for i := 0; i < 60; i++ {
		m, err := ttCall("POST", "/v2/post/publish/status/fetch/", map[string]any{"publish_id": pid})
		if err != nil {
			return "", "", err
		}
		switch s(m["status"]) {
		case "PUBLISH_COMPLETE":
			return pid, privName(priv), nil
		case "FAILED":
			return "", "", fmt.Errorf("TikTok: %s", s(m["fail_reason"]))
		}
		time.Sleep(5 * time.Second)
	}
	return pid, tr("hochgeladen, TikTok verarbeitet noch", "uploaded, TikTok is still processing"), nil
}

func privName(p string) string {
	switch p {
	case "SELF_ONLY":
		return tr("privat (nur ich)", "private (only me)")
	case "MUTUAL_FOLLOW_FRIENDS":
		return tr("nur Freunde", "friends only")
	case "FOLLOWER_OF_CREATOR":
		return tr("nur Follower", "followers only")
	}
	return tr("öffentlich", "public")
}

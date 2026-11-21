package main

// YouTube: Anmeldung (OAuth für Desktop-Apps mit PKCE und Loopback-Adresse), Daten- und Analytics-API.

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const ytScopes = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly"

var httpc = &http.Client{Timeout: 40 * time.Second}

var ytLogin struct {
	sync.Mutex
	state string // "", "waiting", "ok", Fehlertext
}

func randStr(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// ytStartLogin öffnet den Google-Anmeldedialog im Browser und wartet auf die Rückleitung.
func ytStartLogin() (string, error) {
	d := view()
	if strings.TrimSpace(d.YT.ClientID) == "" || strings.TrimSpace(d.YT.Secret) == "" {
		return "", fmt.Errorf("%s", tr("Trag zuerst Client-ID und Client-Schlüssel ein.", "Enter the client ID and client secret first."))
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	redirect := "http://" + ln.Addr().String()
	verifier := randStr(48)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	state := randStr(12)
	q := url.Values{"client_id": {d.YT.ClientID}, "redirect_uri": {redirect}, "response_type": {"code"}, "scope": {ytScopes},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "state": {state}, "access_type": {"offline"}, "prompt": {"consent"}}
	authURL := "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
	ytLogin.Lock()
	ytLogin.state = "waiting"
	ytLogin.Unlock()
	srv := &http.Server{}
	srv.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		res := "ok"
		if e := r.URL.Query().Get("error"); e != "" {
			res = tr("Anmeldung abgebrochen: ", "Sign-in cancelled: ") + e
		} else if r.URL.Query().Get("state") != state {
			res = tr("Ungültige Rückmeldung von Google.", "Invalid response from Google.")
		} else if err := ytExchange(r.URL.Query().Get("code"), verifier, redirect); err != nil {
			res = err.Error()
		}
		ytLogin.Lock()
		ytLogin.state = res
		ytLogin.Unlock()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		msg := tr("Fertig! Du kannst dieses Fenster schließen und zu Kanalwerk zurückkehren.", "Done! You can close this window and go back to Kanalwerk.")
		if res != "ok" {
			msg = res
		}
		fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><body style="font:18px system-ui;display:grid;place-items:center;height:90vh;background:#eef2f7;color:#14233b"><p>%s</p>`, htmlEsc(msg))
		go func() { time.Sleep(time.Second); srv.Close() }()
	})
	go srv.Serve(ln)
	go func() { time.Sleep(10 * time.Minute); srv.Close() }()
	openBrowser(authURL)
	return authURL, nil
}

func htmlEsc(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(s)
}

func ytToken(form url.Values) (map[string]any, error) {
	resp, err := httpc.PostForm("https://oauth2.googleapis.com/token", form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Google: %v %v", m["error"], m["error_description"])
	}
	return m, nil
}

func ytExchange(code, verifier, redirect string) error {
	d := view()
	m, err := ytToken(url.Values{"client_id": {d.YT.ClientID}, "client_secret": {d.YT.Secret}, "code": {code}, "code_verifier": {verifier},
		"grant_type": {"authorization_code"}, "redirect_uri": {redirect}})
	if err != nil {
		return err
	}
	edit(func(d *Data) {
		d.YT.Access = fmt.Sprint(m["access_token"])
		if r, ok := m["refresh_token"].(string); ok && r != "" {
			d.YT.Refresh = r
		}
		d.YT.Expiry = time.Now().Unix() + int64(num(m["expires_in"]))
	})
	return ytLoadChannel()
}

func ytLoadChannel() error {
	m, err := ytGet("/channels", url.Values{"part": {"snippet,statistics,contentDetails"}, "mine": {"true"}})
	if err != nil {
		return err
	}
	items := list(m["items"])
	if len(items) == 0 {
		return fmt.Errorf("%s", tr("Zu diesem Google-Konto gibt es keinen YouTube-Kanal.", "This Google account has no YouTube channel."))
	}
	c := items[0]
	edit(func(d *Data) {
		d.YT.ChannelID = s(c["id"])
		d.YT.ChannelName = s(obj(c["snippet"])["title"])
		d.YT.Avatar = s(obj(obj(obj(c["snippet"])["thumbnails"])["default"])["url"])
		d.YT.UploadsPL = s(obj(obj(c["contentDetails"])["relatedPlaylists"])["uploads"])
	})
	return nil
}

func ytAccess() (string, error) {
	d := view()
	if d.YT.Refresh == "" && d.YT.Access == "" {
		return "", fmt.Errorf("%s", tr("YouTube ist nicht verbunden.", "YouTube is not connected."))
	}
	if d.YT.Access != "" && time.Now().Unix() < d.YT.Expiry-60 {
		return d.YT.Access, nil
	}
	if d.YT.Refresh == "" {
		return "", fmt.Errorf("%s", tr("YouTube-Anmeldung abgelaufen. Bitte neu verbinden.", "YouTube sign-in expired. Please reconnect."))
	}
	m, err := ytToken(url.Values{"client_id": {d.YT.ClientID}, "client_secret": {d.YT.Secret}, "refresh_token": {d.YT.Refresh}, "grant_type": {"refresh_token"}})
	if err != nil {
		return "", err
	}
	tok := s(m["access_token"])
	edit(func(d *Data) { d.YT.Access = tok; d.YT.Expiry = time.Now().Unix() + int64(num(m["expires_in"])) })
	return tok, nil
}

func ytDo(method, full string, body io.Reader, ctype string, hdr map[string]string) (*http.Response, error) {
	tok, err := ytAccess()
	if err != nil {
		return nil, err
	}
	req, _ := http.NewRequest(method, full, body)
	req.Header.Set("Authorization", "Bearer "+tok)
	if ctype != "" {
		req.Header.Set("Content-Type", ctype)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	return httpc.Do(req)
}

func ytJSON(resp *http.Response, err error) (map[string]any, error) {
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	if resp.StatusCode >= 300 {
		msg := s(obj(m["error"])["message"])
		if msg == "" {
			msg = strings.TrimSpace(string(b))
		}
		return nil, fmt.Errorf("YouTube %d: %s", resp.StatusCode, msg)
	}
	return m, nil
}

func ytGet(path string, q url.Values) (map[string]any, error) {
	return ytJSON(ytDo("GET", "https://www.googleapis.com/youtube/v3"+path+"?"+q.Encode(), nil, "", nil))
}

func ytAnalytics(q url.Values) (map[string]any, error) {
	return ytJSON(ytDo("GET", "https://youtubeanalytics.googleapis.com/v2/reports?"+q.Encode(), nil, "", nil))
}

func ytPostJSON(full string, v any, hdr map[string]string) (*http.Response, error) {
	b, _ := json.Marshal(v)
	return ytDo("POST", full, bytes.NewReader(b), "application/json; charset=UTF-8", hdr)
}

// ---------------------------------------------------------------- kleine Helfer für JSON

func obj(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func list(v any) []map[string]any {
	var out []map[string]any
	if a, ok := v.([]any); ok {
		for _, x := range a {
			out = append(out, obj(x))
		}
	}
	return out
}

func s(v any) string {
	if v == nil {
		return ""
	}
	if x, ok := v.(string); ok {
		return x
	}
	return fmt.Sprint(v)
}

func num(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case string:
		var f float64
		fmt.Sscan(x, &f)
		return f
	}
	return 0
}

package main

// Twitch: Anmeldung per Gerätecode (ohne Weiterleitungsadresse), Helix-API.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const twScopes = "user:write:chat moderator:read:followers"

var twLogin struct {
	sync.Mutex
	Code, URI, State string
}

func twPost(form url.Values, path string) (map[string]any, error) {
	resp, err := httpc.PostForm("https://id.twitch.tv/oauth2/"+path, form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	if resp.StatusCode >= 300 {
		return m, fmt.Errorf("Twitch: %v", firstOf(m["message"], m["error"], resp.Status))
	}
	return m, nil
}

func firstOf(v ...any) string {
	for _, x := range v {
		if t := s(x); t != "" && t != "<nil>" {
			return t
		}
	}
	return ""
}

// twStartLogin holt einen Gerätecode und wartet im Hintergrund, bis der Nutzer ihn bestätigt.
func twStartLogin() (map[string]string, error) {
	d := view()
	cid := strings.TrimSpace(d.TW.ClientID)
	if cid == "" {
		return nil, fmt.Errorf("%s", tr("Trag zuerst die Client-ID ein.", "Enter the client ID first."))
	}
	m, err := twPost(url.Values{"client_id": {cid}, "scopes": {twScopes}}, "device")
	if err != nil {
		return nil, err
	}
	code, uri, dev := s(m["user_code"]), s(m["verification_uri"]), s(m["device_code"])
	interval := int(num(m["interval"]))
	if interval < 2 {
		interval = 5
	}
	twLogin.Lock()
	twLogin.Code, twLogin.URI, twLogin.State = code, uri, "waiting"
	twLogin.Unlock()
	openBrowser(uri)
	go func() {
		deadline := time.Now().Add(time.Duration(num(m["expires_in"])+5) * time.Second)
		for time.Now().Before(deadline) {
			time.Sleep(time.Duration(interval) * time.Second)
			t, err := twPost(url.Values{"client_id": {cid}, "scopes": {twScopes}, "device_code": {dev}, "grant_type": {"urn:ietf:params:oauth:grant-type:device_code"}}, "token")
			if err != nil {
				msg := s(t["message"])
				if strings.Contains(msg, "authorization_pending") {
					continue
				}
				if strings.Contains(msg, "slow_down") {
					interval += 2
					continue
				}
				twLogin.Lock()
				twLogin.State = err.Error()
				twLogin.Unlock()
				return
			}
			edit(func(d *Data) {
				d.TW.Access, d.TW.Refresh = s(t["access_token"]), s(t["refresh_token"])
				d.TW.Expiry = time.Now().Unix() + int64(num(t["expires_in"]))
			})
			res := "ok"
			if err := twLoadUser(); err != nil {
				res = err.Error()
			}
			twLogin.Lock()
			twLogin.State = res
			twLogin.Unlock()
			return
		}
		twLogin.Lock()
		twLogin.State = tr("Der Code ist abgelaufen. Bitte noch einmal verbinden.", "The code expired. Please connect again.")
		twLogin.Unlock()
	}()
	return map[string]string{"code": code, "uri": uri}, nil
}

func twLoadUser() error {
	m, err := helix("GET", "/users", nil)
	if err != nil {
		return err
	}
	u := list(m["data"])
	if len(u) == 0 {
		return fmt.Errorf("Twitch: kein Nutzer")
	}
	edit(func(d *Data) {
		d.TW.UserID, d.TW.Login, d.TW.Name, d.TW.Avatar = s(u[0]["id"]), s(u[0]["login"]), s(u[0]["display_name"]), s(u[0]["profile_image_url"])
	})
	return nil
}

func twAccess() (string, error) {
	d := view()
	if d.TW.Access == "" {
		return "", fmt.Errorf("%s", tr("Twitch ist nicht verbunden.", "Twitch is not connected."))
	}
	if time.Now().Unix() < d.TW.Expiry-60 {
		return d.TW.Access, nil
	}
	return twRefresh()
}

func twRefresh() (string, error) {
	d := view()
	if d.TW.Refresh == "" {
		return "", fmt.Errorf("%s", tr("Twitch-Anmeldung abgelaufen. Bitte neu verbinden.", "Twitch sign-in expired. Please reconnect."))
	}
	t, err := twPost(url.Values{"client_id": {d.TW.ClientID}, "grant_type": {"refresh_token"}, "refresh_token": {d.TW.Refresh}}, "token")
	if err != nil {
		return "", err
	}
	edit(func(d *Data) {
		d.TW.Access = s(t["access_token"])
		if r := s(t["refresh_token"]); r != "" {
			d.TW.Refresh = r
		}
		d.TW.Expiry = time.Now().Unix() + int64(num(t["expires_in"]))
	})
	return s(t["access_token"]), nil
}

func helix(method, path string, body any) (map[string]any, error) {
	for attempt := 0; attempt < 2; attempt++ {
		tok, err := twAccess()
		if err != nil {
			return nil, err
		}
		var rd io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, "https://api.twitch.tv/helix"+path, rd)
		req.Header.Set("Client-Id", view().TW.ClientID)
		req.Header.Set("Authorization", "Bearer "+tok)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := httpc.Do(req)
		if err != nil {
			return nil, err
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 401 && attempt == 0 {
			if _, err := twRefresh(); err != nil {
				return nil, err
			}
			continue
		}
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("Twitch %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
		}
		m := map[string]any{}
		_ = json.Unmarshal(b, &m)
		return m, nil
	}
	return nil, fmt.Errorf("Twitch: Anmeldung fehlgeschlagen")
}

// twSay schreibt eine Nachricht in den eigenen Chat.
func twSay(msg string) error {
	d := view()
	_, err := helix("POST", "/chat/messages", map[string]string{"broadcaster_id": d.TW.UserID, "sender_id": d.TW.UserID, "message": msg})
	return err
}

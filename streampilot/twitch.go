package main

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const botScopes = "chat:read chat:edit"
const streamerScopes = "chat:read chat:edit moderator:read:followers channel:read:redemptions moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:shoutouts"

// ---------------------------------------------------------------- Login (Gerätecode, ohne Client-Secret)

type TwitchToken struct {
	Access    string   `json:"access_token"`
	Refresh   string   `json:"refresh_token"`
	ExpiresIn float64  `json:"expires_in"`
	ExpiresAt int64    `json:"expires_at"`
	Scope     []string `json:"scope"`
	Login     string   `json:"login"`
	UserID    string   `json:"user_id"`
}

type TwitchAuth struct {
	mu   sync.Mutex
	file string
	tok  *TwitchToken
}

var botAuth = &TwitchAuth{file: "twitch_bot.json"}
var streamerAuth = &TwitchAuth{file: "twitch_streamer.json"}

func twitchClientID() string { return strings.TrimSpace(cfg.Str("twitchClientId", "")) }

func (a *TwitchAuth) Load() {
	t := &TwitchToken{}
	if loadJSON(a.file, t) && t.Refresh != "" {
		a.tok = t
	} else {
		a.tok = nil
	}
}

func (a *TwitchAuth) Connected() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.tok != nil && a.tok.Refresh != ""
}

func (a *TwitchAuth) Login() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.tok == nil {
		return ""
	}
	return a.tok.Login
}

func (a *TwitchAuth) UserID() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.tok == nil {
		return ""
	}
	return a.tok.UserID
}

func (a *TwitchAuth) Has(scope string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.tok == nil {
		return false
	}
	for _, s := range a.tok.Scope {
		if s == scope {
			return true
		}
	}
	return false
}

func (a *TwitchAuth) Disconnect() {
	a.mu.Lock()
	a.tok = nil
	a.mu.Unlock()
	_ = saveJSON(a.file, map[string]any{})
}

type DeviceCode struct {
	UserCode string `json:"user_code"`
	URI      string `json:"verification_uri"`
	device   string
	interval int
	expires  int
}

func (a *TwitchAuth) StartDevice(scopes string) (*DeviceCode, error) {
	b, st, err := postForm("https://id.twitch.tv/oauth2/device", url.Values{"client_id": {twitchClientID()}, "scopes": {scopes}})
	if err != nil {
		return nil, err
	}
	if st != 200 {
		return nil, fmt.Errorf("Twitch: %s", strings.TrimSpace(string(b)))
	}
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	return &DeviceCode{UserCode: str(m, "user_code", ""), URI: str(m, "verification_uri", ""), device: str(m, "device_code", ""),
		interval: int(num(m, "interval", 5)), expires: int(num(m, "expires_in", 1800))}, nil
}

func (a *TwitchAuth) WaitDevice(dc *DeviceCode, scopes string, stop <-chan struct{}) error {
	deadline := time.Now().Add(time.Duration(dc.expires) * time.Second)
	iv := time.Duration(dc.interval) * time.Second
	for time.Now().Before(deadline) {
		select {
		case <-stop:
			return errors.New("cancelled")
		case <-time.After(iv):
		}
		b, st, err := postForm("https://id.twitch.tv/oauth2/token", url.Values{"client_id": {twitchClientID()}, "scopes": {scopes},
			"device_code": {dc.device}, "grant_type": {"urn:ietf:params:oauth:grant-type:device_code"}})
		if err != nil {
			continue
		}
		if st != 200 {
			s := string(b)
			if strings.Contains(s, "authorization_pending") {
				continue
			}
			if strings.Contains(s, "slow_down") {
				iv += 2 * time.Second
				continue
			}
			return fmt.Errorf("Twitch: %s", s)
		}
		t := &TwitchToken{}
		_ = json.Unmarshal(b, t)
		t.ExpiresAt = time.Now().Unix() + int64(t.ExpiresIn) - 120
		a.mu.Lock()
		a.tok = t
		a.mu.Unlock()
		if err := a.validate(); err != nil {
			return err
		}
		a.persist()
		return nil
	}
	return errors.New("code expired")
}

func (a *TwitchAuth) validate() error {
	tok, err := a.Access()
	if err != nil {
		return err
	}
	req, _ := http.NewRequest("GET", "https://id.twitch.tv/oauth2/validate", nil)
	req.Header.Set("Authorization", "OAuth "+tok)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	a.mu.Lock()
	a.tok.Login = str(m, "login", a.tok.Login)
	a.tok.UserID = str(m, "user_id", a.tok.UserID)
	a.mu.Unlock()
	return nil
}

func (a *TwitchAuth) persist() {
	a.mu.Lock()
	if a.tok == nil {
		a.mu.Unlock()
		return
	}
	t := *a.tok
	a.mu.Unlock()
	_ = saveJSON(a.file, t)
}

func (a *TwitchAuth) refresh() error {
	a.mu.Lock()
	if a.tok == nil {
		a.mu.Unlock()
		return errors.New("not connected")
	}
	rt := a.tok.Refresh
	a.mu.Unlock()
	b, st, err := postForm("https://id.twitch.tv/oauth2/token", url.Values{"client_id": {twitchClientID()},
		"grant_type": {"refresh_token"}, "refresh_token": {rt}})
	if err != nil {
		return err
	}
	if st != 200 {
		return fmt.Errorf("Twitch refresh failed (%d)", st)
	}
	n := TwitchToken{}
	_ = json.Unmarshal(b, &n)
	a.mu.Lock()
	a.tok.Access = n.Access
	if n.Refresh != "" {
		a.tok.Refresh = n.Refresh
	}
	if len(n.Scope) > 0 {
		a.tok.Scope = n.Scope
	}
	a.tok.ExpiresAt = time.Now().Unix() + int64(n.ExpiresIn) - 120
	a.mu.Unlock()
	a.persist()
	return nil
}

func (a *TwitchAuth) Access() (string, error) {
	a.mu.Lock()
	if a.tok == nil {
		a.mu.Unlock()
		return "", errors.New("not connected")
	}
	ok := a.tok.Access != "" && time.Now().Unix() < a.tok.ExpiresAt
	a.mu.Unlock()
	if !ok {
		if err := a.refresh(); err != nil {
			return "", err
		}
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.tok.Access, nil
}

// ---------------------------------------------------------------- Helix (Follower-Check)

type FollowCache struct {
	mu sync.Mutex
	m  map[string]followHit
}
type followHit struct {
	ok bool
	at time.Time
}

var follows = &FollowCache{m: map[string]followHit{}}

func helix(method, path string, body any) (map[string]any, error) {
	for attempt := 0; attempt < 2; attempt++ {
		tok, err := streamerAuth.Access()
		if err != nil {
			return nil, err
		}
		var rd io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, "https://api.twitch.tv/helix"+path, rd)
		req.Header.Set("Client-Id", twitchClientID())
		req.Header.Set("Authorization", "Bearer "+tok)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == 401 && attempt == 0 {
			_ = streamerAuth.refresh()
			continue
		}
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("Twitch API %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
		}
		m := map[string]any{}
		_ = json.Unmarshal(b, &m)
		return m, nil
	}
	return nil, errors.New("Twitch API failed")
}

func isFollower(uid string) bool {
	bid := streamerAuth.UserID()
	if uid == "" || bid == "" {
		return false
	}
	if uid == bid {
		return true
	}
	follows.mu.Lock()
	h, ok := follows.m[uid]
	follows.mu.Unlock()
	if ok && (h.ok || time.Since(h.at) < 5*time.Minute) {
		return h.ok
	}
	if !streamerAuth.Has("moderator:read:followers") {
		return false
	}
	res, err := helix("GET", "/channels/followers?broadcaster_id="+bid+"&user_id="+uid, nil)
	isF := err == nil && len(asList(res["data"])) > 0
	follows.mu.Lock()
	follows.m[uid] = followHit{isF, time.Now()}
	follows.mu.Unlock()
	return isF
}

func asList(v any) []any {
	if l, ok := v.([]any); ok {
		return l
	}
	return nil
}

// ---------------------------------------------------------------- Chat (IRC über TLS)

type ChatMsg struct {
	Login, Display, Text string
	Badges               map[string]bool
	Tags                 map[string]string
}

type Chat struct {
	auth     *TwitchAuth
	channel  string
	onMsg    func(ChatMsg)
	onNotice func(map[string]string, string)
	mu       sync.Mutex
	conn     net.Conn
	running  bool
	last     time.Time
	sendMu   sync.Mutex
	Joined   bool
}

func (c *Chat) Start() {
	c.running = true
	go c.loop()
}

func (c *Chat) Stop() {
	c.running = false
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
	}
	c.mu.Unlock()
}

func (c *Chat) loop() {
	for c.running {
		err := c.session()
		c.Joined = false
		if !c.running {
			return
		}
		logEvent("warn", "Chat disconnected (%v) – reconnecting …", err)
		time.Sleep(5 * time.Second)
	}
}

func (c *Chat) raw(line string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return errors.New("offline")
	}
	_, err := c.conn.Write([]byte(line + "\r\n"))
	return err
}

func (c *Chat) Say(text string) {
	text = strings.ReplaceAll(text, "\n", " ")
	if len([]rune(text)) > 480 {
		text = string([]rune(text)[:480])
	}
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if w := 1100*time.Millisecond - time.Since(c.last); w > 0 {
		time.Sleep(w)
	}
	if err := c.raw("PRIVMSG #" + c.channel + " :" + text); err == nil {
		c.last = time.Now()
		logEvent("bot", "%s", text)
	}
}

func (c *Chat) session() error {
	tok, err := c.auth.Access()
	if err != nil {
		return err
	}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 20 * time.Second}, "tcp", "irc.chat.twitch.tv:6697", &tls.Config{ServerName: "irc.chat.twitch.tv"})
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
	defer conn.Close()
	_ = c.raw("PASS oauth:" + tok)
	_ = c.raw("NICK " + c.auth.Login())
	_ = c.raw("CAP REQ :twitch.tv/tags twitch.tv/commands")
	_ = c.raw("JOIN #" + c.channel)
	r := bufio.NewReaderSize(conn, 64*1024)
	for c.running {
		_ = conn.SetReadDeadline(time.Now().Add(7 * time.Minute))
		line, err := r.ReadString('\n')
		if err != nil {
			return err
		}
		if err := c.handle(strings.TrimRight(line, "\r\n")); err != nil {
			return err
		}
	}
	return nil
}

func ircUnescape(s string) string {
	r := strings.NewReplacer(`\s`, " ", `\:`, ";", `\\`, `\`, `\r`, "", `\n`, "")
	return r.Replace(s)
}

func (c *Chat) handle(line string) error {
	if strings.HasPrefix(line, "PING") {
		return c.raw("PONG" + line[4:])
	}
	tags := map[string]string{}
	if strings.HasPrefix(line, "@") {
		sp := strings.IndexByte(line, ' ')
		if sp < 0 {
			return nil
		}
		for _, kv := range strings.Split(line[1:sp], ";") {
			k, v, _ := strings.Cut(kv, "=")
			tags[k] = ircUnescape(v)
		}
		line = line[sp+1:]
	}
	if strings.Contains(line, "Login authentication failed") || strings.Contains(line, "Improperly formatted auth") {
		_ = c.auth.refresh()
		return errors.New("login refreshed")
	}
	parts := strings.SplitN(line, " ", 4)
	if len(parts) < 2 {
		return nil
	}
	switch parts[1] {
	case "366":
		c.Joined = true
		logEvent("ok", "Connected to #%s as %s", c.channel, c.auth.Login())
	case "RECONNECT":
		return errors.New("reconnect requested")
	case "PRIVMSG":
		if len(parts) < 4 {
			return nil
		}
		login := strings.SplitN(strings.TrimPrefix(parts[0], ":"), "!", 2)[0]
		text := strings.TrimPrefix(parts[3], ":")
		badges := map[string]bool{}
		for _, b := range strings.Split(tags["badges"], ",") {
			if b != "" {
				badges[strings.SplitN(b, "/", 2)[0]] = true
			}
		}
		if tags["mod"] == "1" {
			badges["moderator"] = true
		}
		disp := tags["display-name"]
		if disp == "" {
			disp = login
		}
		if c.onMsg != nil {
			go c.onMsg(ChatMsg{Login: login, Display: disp, Text: strings.TrimSpace(text), Badges: badges, Tags: tags})
		}
	case "USERNOTICE":
		text := ""
		if len(parts) >= 4 {
			text = strings.TrimPrefix(parts[3], ":")
		}
		if c.onNotice != nil {
			go c.onNotice(tags, strings.TrimSpace(text))
		}
	}
	return nil
}

func userLevel(b map[string]bool) int {
	switch {
	case b["broadcaster"]:
		return LvlStreamer
	case b["moderator"]:
		return LvlMod
	case b["vip"]:
		return LvlVIP
	case b["subscriber"], b["founder"]:
		return LvlSub
	}
	return LvlAll
}

func levelOK(required, base int, uid string) bool {
	if base >= required {
		return true
	}
	if required == LvlFollower && base == LvlAll {
		return isFollower(uid)
	}
	return false
}

// ---------------------------------------------------------------- EventSub (Follows, Kanalpunkte)

type EventSub struct {
	running bool
	conn    *WSConn
	onEvent func(typ string, ev map[string]any)
	mu      sync.Mutex
	OK      bool
}

func (e *EventSub) Start() {
	e.running = true
	go e.loop()
}

func (e *EventSub) Stop() {
	e.running = false
	e.mu.Lock()
	if e.conn != nil {
		e.conn.Close()
	}
	e.mu.Unlock()
}

func (e *EventSub) loop() {
	u, subscribe := "wss://eventsub.wss.twitch.tv/ws", true
	for e.running {
		nu, err := e.session(u, subscribe)
		e.OK = false
		if !e.running {
			return
		}
		if nu != "" {
			u, subscribe = nu, false
			continue
		}
		logEvent("warn", "Alerts disconnected (%v) – reconnecting …", err)
		u, subscribe = "wss://eventsub.wss.twitch.tv/ws", true
		time.Sleep(5 * time.Second)
	}
}

func (e *EventSub) session(u string, subscribe bool) (string, error) {
	c, err := wsDial(u, nil)
	if err != nil {
		return "", err
	}
	e.mu.Lock()
	e.conn = c
	e.mu.Unlock()
	defer c.Close()
	for e.running {
		c.SetReadDeadline(time.Now().Add(60 * time.Second))
		data, _, err := c.Read()
		if err != nil {
			return "", err
		}
		msg := map[string]any{}
		if json.Unmarshal(data, &msg) != nil {
			continue
		}
		mt := str(sub(msg, "metadata"), "message_type", "")
		pl := sub(msg, "payload")
		switch mt {
		case "session_welcome":
			if subscribe {
				e.subscribe(str(sub(pl, "session"), "id", ""))
				subscribe = false
			}
			e.OK = true
		case "session_reconnect":
			return str(sub(pl, "session"), "reconnect_url", ""), nil
		case "notification":
			if e.onEvent != nil {
				go e.onEvent(str(sub(pl, "subscription"), "type", ""), sub(pl, "event"))
			}
		}
	}
	return "", nil
}

func (e *EventSub) subscribe(session string) {
	bid := streamerAuth.UserID()
	type s struct {
		typ, ver string
		cond     map[string]string
		scope    string
	}
	list := []s{
		{"channel.follow", "2", map[string]string{"broadcaster_user_id": bid, "moderator_user_id": bid}, "moderator:read:followers"},
		{"channel.channel_points_custom_reward_redemption.add", "1", map[string]string{"broadcaster_user_id": bid}, "channel:read:redemptions"},
	}
	n := 0
	for _, x := range list {
		if !streamerAuth.Has(x.scope) {
			continue
		}
		_, err := helix("POST", "/eventsub/subscriptions", map[string]any{"type": x.typ, "version": x.ver, "condition": x.cond,
			"transport": map[string]string{"method": "websocket", "session_id": session}})
		if err != nil {
			logEvent("warn", "EventSub %s: %v", x.typ, err)
		} else {
			n++
		}
	}
	if n > 0 {
		logEvent("ok", "Follows & channel points connected")
	}
}

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"kit"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const prefixChars = "!/.?#$%&*+-~"

// ---------------------------------------------------------------- Ereignis-Protokoll (für die Live-Ansicht)

type Event struct {
	T    int64  `json:"t"`
	Kind string `json:"kind"`
	Text string `json:"text"`
}

var evMu sync.Mutex
var events []Event
var evSeq int64

func logEvent(kind, format string, a ...any) {
	evMu.Lock()
	defer evMu.Unlock()
	evSeq++
	events = append(events, Event{T: evSeq, Kind: kind, Text: fmt.Sprintf(format, a...)})
	if len(events) > 300 {
		events = events[len(events)-300:]
	}
}

func eventsSince(t int64) []Event {
	evMu.Lock()
	defer evMu.Unlock()
	var out []Event
	for _, e := range events {
		if e.T > t {
			out = append(out, e)
		}
	}
	return out
}

// ---------------------------------------------------------------- Befehle

type Cmd struct {
	Key, Names, Prefix, Group string
	Level                     int
	On, Changed               bool
	Full                      []string
}

func cleanCmd(s string) string {
	return strings.ToLower(strings.TrimLeft(strings.TrimSpace(s), prefixChars))
}

func commands() []Cmd {
	stored := cfg.Section("commands")
	global := gStr("cmdPrefix")
	if global == "" {
		global = "!"
	}
	var out []Cmd
	for _, d := range DefaultCommands {
		st := sub(stored, d.Key)
		var names []string
		for _, n := range strings.Split(str(st, "names", d.Names), ",") {
			if c := cleanCmd(n); c != "" {
				names = append(names, c)
			}
		}
		if len(names) == 0 {
			names = []string{cleanCmd(strings.Split(d.Names, ",")[0])}
		}
		own := str(st, "prefix", "")
		chars := own
		if chars == "" {
			chars = global
		}
		var full []string
		for _, n := range names {
			for _, ch := range chars {
				full = append(full, string(ch)+n)
			}
		}
		out = append(out, Cmd{Key: d.Key, Names: strings.Join(names, ", "), Prefix: own, Group: d.Group,
			Level: int(num(st, "level", float64(d.Level))), On: boolean(st, "on", d.On), Changed: len(st) > 0, Full: full})
	}
	return out
}

func firstCmd(key string) string {
	for _, c := range commands() {
		if c.Key == key && len(c.Full) > 0 {
			return c.Full[0]
		}
	}
	return "!" + key
}

func reply(key string, vars map[string]string) {
	b := bot
	if b == nil || b.chat == nil {
		return
	}
	tpl := str(cfg.Section("replies"), key, "")
	if tpl == "" {
		lang := gStr("chatLang")
		if lang == "" {
			lang = kit.Lang()
		}
		if lang == "de" {
			tpl = DefaultRepliesDE[key]
		} else {
			tpl = DefaultRepliesEN[key]
		}
	}
	if tpl == "" {
		return
	}
	b.chat.Say(fill(tpl, vars))
}

// ---------------------------------------------------------------- Bot

type Request struct {
	URI    string `json:"uri"`
	Song   string `json:"song"`
	Artist string `json:"artist"`
	Image  string `json:"image"`
	User   string `json:"user"`
	Login  string `json:"-"`
	Status string `json:"status"` // waiting | playing | done
	Skip   bool   `json:"skip"`
	Time   int64  `json:"-"`
}

type Bot struct {
	mu       sync.Mutex
	chat     *Chat
	events   *EventSub
	running  bool
	Requests []*Request
	Current  *Track
	Previous *Track
	reqBy    string
	votes    map[string]bool
	giftSkip map[string]int
	As       string
	Channel  string
}

var bot *Bot
var botMu sync.Mutex

func botStatus() map[string]any {
	botMu.Lock()
	b := bot
	botMu.Unlock()
	st := map[string]any{"running": false}
	if b == nil {
		return st
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	reqs := []*Request{}
	for _, r := range b.Requests {
		if r.Status != "done" || time.Now().Unix()-r.Time < 900 {
			reqs = append(reqs, r)
		}
	}
	st["running"] = b.running
	st["joined"] = b.chat != nil && b.chat.Joined
	st["alerts"] = b.events != nil && b.events.OK
	st["as"] = b.As
	st["channel"] = b.Channel
	st["requests"] = reqs
	st["current"] = b.Current
	st["requestedBy"] = b.reqBy
	st["votes"] = len(b.votes)
	return st
}

// StartBot: Chat-Konto = Bot-Account, sonst automatisch der Streamer-Account.
func StartBot() error {
	botMu.Lock()
	defer botMu.Unlock()
	if bot != nil && bot.running {
		return nil
	}
	if twitchClientID() == "" {
		return errors.New("twitch_missing")
	}
	auth := botAuth
	if !auth.Connected() {
		auth = streamerAuth
	}
	if !auth.Connected() {
		return errors.New("twitch_missing")
	}
	channel := strings.ToLower(strings.TrimPrefix(cfg.Str("channel", ""), "#"))
	if channel == "" {
		channel = streamerAuth.Login()
	}
	if channel == "" {
		channel = auth.Login()
	}
	b := &Bot{running: true, votes: map[string]bool{}, giftSkip: map[string]int{}, As: auth.Login(), Channel: channel}
	b.chat = &Chat{auth: auth, channel: channel, onMsg: b.onMessage, onNotice: b.onNotice}
	b.chat.Start()
	if streamerAuth.Connected() {
		go func() {
			_ = streamerAuth.validate()
			b.mu.Lock()
			if !b.running {
				b.mu.Unlock()
				return
			}
			b.events = &EventSub{onEvent: b.onEvent}
			b.mu.Unlock()
			b.events.Start()
		}()
	}
	go b.pollSpotify()
	go b.timerLoop()
	bot = b
	logEvent("ok", "Bot started")
	return nil
}

func StopBot() {
	botMu.Lock()
	b := bot
	bot = nil
	botMu.Unlock()
	if b == nil {
		return
	}
	b.mu.Lock()
	b.running = false
	b.mu.Unlock()
	b.chat.Stop()
	if b.events != nil {
		b.events.Stop()
	}
	logEvent("info", "Bot stopped")
}

func (b *Bot) pollSpotify() {
	for {
		b.mu.Lock()
		run := b.running
		b.mu.Unlock()
		if !run {
			return
		}
		if spotify.Connected() {
			cur, err := spotify.Current()
			if err == nil {
				b.mu.Lock()
				old := ""
				if b.Current != nil {
					old = b.Current.URI
				}
				nu := ""
				if cur != nil {
					nu = cur.URI
				}
				if nu != old {
					b.mu.Unlock()
					b.trackChanged(cur)
				} else {
					b.Current = cur
					b.mu.Unlock()
				}
			}
		}
		time.Sleep(3 * time.Second)
	}
}

func (b *Bot) trackChanged(cur *Track) {
	skip := false
	b.mu.Lock()
	if b.Current != nil {
		b.Previous = b.Current
	}
	for _, r := range b.Requests {
		if r.Status == "playing" {
			r.Status = "done"
		}
	}
	b.Current = cur
	b.reqBy = ""
	b.votes = map[string]bool{}
	if cur != nil {
		for _, r := range b.Requests {
			if r.Status == "waiting" && r.URI == cur.URI {
				r.Status = "playing"
				b.reqBy = r.User
				skip = r.Skip
				break
			}
		}
	}
	now := time.Now().Unix()
	keep := b.Requests[:0]
	for _, r := range b.Requests {
		if (r.Status == "done" && now-r.Time > 3600) || (r.Status == "waiting" && now-r.Time > 4*3600) {
			continue
		}
		keep = append(keep, r)
	}
	b.Requests = keep
	b.mu.Unlock()
	if skip {
		_ = spotify.Next()
	}
}

func (b *Bot) open(login string) []*Request {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []*Request
	for _, r := range b.Requests {
		if (r.Status == "waiting" || r.Status == "playing") && !r.Skip && (login == "" || r.Login == login) {
			out = append(out, r)
		}
	}
	return out
}

func (b *Bot) onMessage(m ChatMsg) {
	if m.Text == "" {
		return
	}
	word, arg, _ := strings.Cut(m.Text, " ")
	word = strings.ToLower(word)
	arg = strings.TrimSpace(arg)
	level := userLevel(m.Badges)
	uid := m.Tags["user-id"]
	ownMu.Lock()
	chatLines++
	ownMu.Unlock()
	// Chat-Schutz zuerst: bestrafte Nachrichten werden nicht weiterverarbeitet (auch nicht vorgelesen)
	if b.moderate(m, level) {
		return
	}
	for _, c := range commands() {
		for _, f := range c.Full {
			if f == word {
				if !c.On || !levelOK(c.Level, level, uid) {
					return
				}
				logEvent("chat", "%s: %s", m.Display, m.Text)
				b.run(c.Key, m, level, arg, word)
				return
			}
		}
	}
	if b.handleOwn(m, word, arg, level, uid) {
		return
	}
	if m.Tags["bits"] != "" {
		if tts.Alert("bits", map[string]string{"user": m.Display, "login": m.Login, "bits": m.Tags["bits"], "message": m.Text}, m.Tags) {
			return
		}
		// Bits-Alert aus oder unter dem Mindestbetrag: wie eine normale Chat-Nachricht behandeln
	}
	tts.Handle("chat", m.Login, m.Display, level, uid, m.Text, m.Tags, false)
}

var spotifyCmds = map[string]bool{"sr": true, "voteskip": true, "skip": true, "song": true, "lastsong": true, "volume": true, "wrongsong": true}

func (b *Bot) run(key string, m ChatMsg, level int, arg, cmd string) {
	u := m.Display
	v := func(kv ...string) map[string]string {
		out := map[string]string{"user": u, "cmd": cmd}
		for i := 0; i+1 < len(kv); i += 2 {
			out[kv[i]] = kv[i+1]
		}
		return out
	}
	if spotifyCmds[key] && !spotify.Connected() {
		reply("no_spotify", v())
		return
	}
	defer func() {
		if r := recover(); r != nil {
			reply("error", v("error", fmt.Sprint(r)))
		}
	}()
	handleErr := func(err error) {
		if err == nil {
			return
		}
		var se *SpotifyErr
		if errors.As(err, &se) && (se.Code == 404 || strings.Contains(se.Body, "NO_ACTIVE_DEVICE")) {
			reply("no_device", v())
			return
		}
		reply("error", v("error", err.Error()))
		logEvent("warn", "%s: %v", cmd, err)
	}
	switch key {
	case "sr":
		if !gBool("srOn") && level < LvlMod {
			reply("sr_off", v())
			return
		}
		for _, bl := range asList(generalGet("blocked")) {
			if s, _ := bl.(string); s == m.Login {
				reply("sr_blocked", v())
				return
			}
		}
		if arg == "" {
			reply("sr_usage", v())
			return
		}
		limit := int(gNum("srLimit"))
		if !(level >= LvlMod && gBool("modsUnlimited")) && len(b.open(m.Login)) >= limit {
			reply("sr_limit", v("limit", strconv.Itoa(limit)))
			return
		}
		tr, err := resolveRequest(arg)
		if err != nil {
			handleErr(err)
			return
		}
		if tr == nil {
			reply("sr_notfound", v())
			return
		}
		mx := gNum("maxMinutes")
		if mx > 0 && float64(tr.Duration) > mx*60000 && level < LvlMod {
			reply("sr_toolong", v("song", tr.Name, "max", strconv.Itoa(int(mx))))
			return
		}
		for _, r := range b.open("") {
			if r.URI == tr.URI && r.Status == "waiting" {
				reply("sr_duplicate", v("song", tr.Name))
				return
			}
		}
		if err := spotify.Queue(tr.URI); err != nil {
			handleErr(err)
			return
		}
		b.mu.Lock()
		b.Requests = append(b.Requests, &Request{URI: tr.URI, Song: tr.Name, Artist: tr.ArtistStr(), Image: tr.Image, User: u, Login: m.Login, Status: "waiting", Time: time.Now().Unix()})
		pos := 0
		for _, r := range b.Requests {
			if r.Status == "waiting" && !r.Skip {
				pos++
			}
		}
		b.mu.Unlock()
		reply("sr_added", v("song", tr.Name, "artist", tr.ArtistStr(), "pos", strconv.Itoa(pos)))
	case "voteskip":
		b.mu.Lock()
		cur := b.Current
		if cur == nil {
			b.mu.Unlock()
			reply("nothing", v())
			return
		}
		need := int(gNum("voteNeeded"))
		if need < 1 {
			need = 1
		}
		if b.votes[m.Login] {
			n := len(b.votes)
			b.mu.Unlock()
			reply("voteskip_already", v("votes", strconv.Itoa(n), "needed", strconv.Itoa(need)))
			return
		}
		b.votes[m.Login] = true
		n := len(b.votes)
		b.mu.Unlock()
		if n >= need {
			handleErr(spotify.Next())
			reply("voteskip_done", v("votes", strconv.Itoa(n), "needed", strconv.Itoa(need), "song", cur.Name))
		} else {
			reply("voteskip", v("votes", strconv.Itoa(n), "needed", strconv.Itoa(need)))
		}
	case "skip":
		name := "?"
		b.mu.Lock()
		if b.Current != nil {
			name = b.Current.Name
		}
		b.mu.Unlock()
		if err := spotify.Next(); err != nil {
			handleErr(err)
			return
		}
		reply("skip", v("song", name))
	case "song":
		b.mu.Lock()
		cur, by := b.Current, b.reqBy
		b.mu.Unlock()
		if cur == nil {
			reply("nothing", v())
			return
		}
		bys := ""
		if by != "" {
			if strings.HasPrefix(kit.Lang(), "de") {
				bys = " (gewünscht von @" + by + ")"
			} else {
				bys = " (requested by @" + by + ")"
			}
		}
		reply("song", v("song", cur.Name, "artist", cur.ArtistStr(), "by", bys))
	case "lastsong":
		b.mu.Lock()
		p := b.Previous
		b.mu.Unlock()
		if p == nil {
			reply("nothing", v())
			return
		}
		reply("lastsong", v("song", p.Name, "artist", p.ArtistStr()))
	case "queue":
		var waiting []*Request
		for _, r := range b.open("") {
			if r.Status == "waiting" {
				waiting = append(waiting, r)
			}
		}
		if len(waiting) == 0 {
			reply("queue_empty", v("cmd", firstCmd("sr")))
			return
		}
		var parts []string
		for i, r := range waiting {
			if i == 5 {
				parts = append(parts, fmt.Sprintf("+%d", len(waiting)-5))
				break
			}
			parts = append(parts, fmt.Sprintf("%d. %s – %s (@%s)", i+1, r.Song, r.Artist, r.User))
		}
		reply("queue", v("list", strings.Join(parts, " | "), "count", strconv.Itoa(len(waiting))))
	case "mysongs":
		mine := b.open(m.Login)
		if len(mine) == 0 {
			reply("mysongs_none", v())
			return
		}
		var parts []string
		for _, r := range mine {
			parts = append(parts, r.Song)
		}
		reply("mysongs", v("list", strings.Join(parts, " | ")))
	case "wrongsong":
		mine := b.open(m.Login)
		if len(mine) == 0 {
			reply("wrongsong_none", v())
			return
		}
		r := mine[len(mine)-1]
		b.mu.Lock()
		r.Skip = true
		playing := r.Status == "playing"
		b.mu.Unlock()
		if playing {
			handleErr(spotify.Next())
		}
		reply("wrongsong", v("song", r.Song))
	case "srhelp":
		var names []string
		for _, c := range commands() {
			if c.On && levelOK(c.Level, level, "") && len(c.Full) > 0 {
				names = append(names, c.Full[0])
			}
		}
		reply("srhelp", v("list", strings.Join(names, " ")))
	case "sron", "sroff":
		cfg.Set("srOn", key == "sron")
		reply(key, v("cmd", firstCmd("sr")))
	case "volume":
		n, err := strconv.Atoi(strings.Trim(arg, "% "))
		if err != nil {
			reply("volume_usage", v())
			return
		}
		n = max(0, min(100, n))
		if err := spotify.Volume(n); err != nil {
			handleErr(err)
			return
		}
		reply("volume", v("volume", strconv.Itoa(n)))
	case "srblock", "srunblock":
		target := strings.ToLower(strings.TrimPrefix(strings.Fields(arg + " ")[0], "@"))
		if strings.TrimSpace(arg) == "" {
			reply("target_usage", v())
			return
		}
		var list []any
		for _, x := range asList(generalGet("blocked")) {
			if s, _ := x.(string); s != target {
				list = append(list, s)
			}
		}
		if key == "srblock" {
			list = append(list, target)
			cfg.Set("blocked", list)
			reply("block", v("target", target))
		} else {
			cfg.Set("blocked", list)
			reply("unblock", v("target", target))
		}
	case "clearqueue":
		n := 0
		b.mu.Lock()
		for _, r := range b.Requests {
			if r.Status == "waiting" && !r.Skip {
				r.Skip = true
				n++
			}
		}
		b.mu.Unlock()
		reply("clearqueue", v("count", strconv.Itoa(n)))
	case "tts":
		c := ttsCfg()
		if !boolean(c, "enabled", false) || !ttsSource("command").On {
			reply("tts_disabled", v())
			return
		}
		if arg == "" {
			reply("tts_usage", v())
			return
		}
		if tts.Handle("command", m.Login, u, level, m.Tags["user-id"], m.Text, m.Tags, true) == "full" {
			reply("tts_full", v())
		}
	case "ttsskip":
		tts.Skip()
		reply("ttsskip", v())
	case "ttsclear":
		tts.Clear()
		reply("ttsclear", v())
	case "ttson", "ttsoff":
		t := cfg.Section("tts")
		t["enabled"] = key == "ttson"
		cfg.SetSection("tts", t)
		if key == "ttsoff" {
			tts.Clear()
		}
		reply(key, v())
	}
}

// Alerts aus dem Chat: Abos, Geschenke, Raids
func (b *Bot) onNotice(tags map[string]string, text string) {
	kind := tags["msg-id"]
	user := tags["display-name"]
	if user == "" {
		user = tags["login"]
	}
	vars := map[string]string{"user": user, "login": tags["login"]}
	switch kind {
	case "sub":
		vars["message"] = text
		tts.Alert("sub", vars, tags)
	case "resub":
		vars["message"] = text
		vars["months"] = tags["msg-param-cumulative-months"]
		tts.Alert("resub", vars, tags)
	case "submysterygift":
		n, _ := strconv.Atoi(tags["msg-param-mass-gift-count"])
		b.mu.Lock()
		b.giftSkip[tags["login"]] += n
		b.mu.Unlock()
		vars["count"] = strconv.Itoa(n)
		tts.Alert("giftbomb", vars, nil)
	case "subgift", "anonsubgift":
		b.mu.Lock()
		if b.giftSkip[tags["login"]] > 0 {
			b.giftSkip[tags["login"]]--
			b.mu.Unlock()
			return
		}
		b.mu.Unlock()
		vars["target"] = tags["msg-param-recipient-display-name"]
		tts.Alert("subgift", vars, nil)
	case "raid":
		if n := tags["msg-param-displayName"]; n != "" {
			vars["user"] = n
		}
		vars["viewers"] = tags["msg-param-viewerCount"]
		tts.Alert("raid", vars, nil)
	default:
		return
	}
	logEvent("alert", "%s – %s", kind, user)
}

// Alerts aus EventSub: Follows, Kanalpunkte
func (b *Bot) onEvent(typ string, ev map[string]any) {
	user := str(ev, "user_name", str(ev, "user_login", "?"))
	switch typ {
	case "channel.follow":
		follows.mu.Lock()
		follows.m[str(ev, "user_id", "")] = followHit{true, time.Now()}
		follows.mu.Unlock()
		logEvent("alert", "follow – %s", user)
		tts.Alert("follow", map[string]string{"user": user, "login": str(ev, "user_login", "")}, nil)
	case "channel.channel_points_custom_reward_redemption.add":
		reward := str(sub(ev, "reward"), "title", "")
		text := strings.TrimSpace(str(ev, "user_input", ""))
		want := strings.ToLower(strings.TrimSpace(str(ttsCfg(), "rewardName", "")))
		logEvent("alert", "points – %s → %s", user, reward)
		if text != "" && (want == "" || want == strings.ToLower(reward)) {
			lvl := LvlAll
			if str(ev, "user_id", "") == str(ev, "broadcaster_user_id", "-") {
				lvl = LvlStreamer
			}
			tts.Handle("points", str(ev, "user_login", ""), user, lvl, str(ev, "user_id", ""), text, map[string]string{}, false)
		} else {
			tts.Alert("points", map[string]string{"user": user, "login": str(ev, "user_login", ""), "reward": reward, "message": text}, nil)
		}
	}
}

// ---------------------------------------------------------------- Songwunsch: Name oder Link → Spotify-Track

var reSpTrack = regexp.MustCompile(`(?:open\.spotify\.com/(?:intl-[a-z]{2}/)?track/|spotify:track:)([A-Za-z0-9]{22})`)
var reJunk = regexp.MustCompile(`(?i)[\(\[](?:official|offizielles|lyric|lyrics|audio|video|music video|hd|4k|visualizer|clip|musikvideo|prod\.?)[^\)\]]*[\)\]]`)
var reOG = regexp.MustCompile(`(?i)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)`)
var reTitle = regexp.MustCompile(`(?i)<title>([^<]+)</title>`)

func cleanTitle(t string) string {
	t = html.UnescapeString(t)
	t = reJunk.ReplaceAllString(t, "")
	if i := strings.Index(t, "|"); i > 0 {
		t = t[:i]
	}
	return strings.Trim(strings.Join(strings.Fields(t), " "), " -–")
}

func getJSON(u string) map[string]any {
	c := &http.Client{Timeout: 12 * time.Second}
	resp, err := c.Get(u)
	if err != nil {
		return map[string]any{}
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	return m
}

func getPage(u string) (string, string) {
	c := &http.Client{Timeout: 12 * time.Second}
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
	resp, err := c.Do(req)
	if err != nil {
		return u, ""
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 400000))
	return resp.Request.URL.String(), string(b)
}

var reURLAny = regexp.MustCompile(`https?://\S+`)

func resolveRequest(text string) (*Track, error) {
	link := reURLAny.FindString(text)
	if link == "" {
		return spotify.Search(text)
	}
	if m := reSpTrack.FindStringSubmatch(link); m != nil {
		return spotify.Track(m[1])
	}
	pu, _ := url.Parse(link)
	host := ""
	if pu != nil {
		host = strings.ToLower(pu.Host)
	}
	if strings.Contains(host, "spotify.link") || strings.Contains(host, "page.link") || strings.Contains(host, "spoti.fi") {
		final, _ := getPage(link)
		if m := reSpTrack.FindStringSubmatch(final); m != nil {
			return spotify.Track(m[1])
		}
		link = final
		if pu, _ = url.Parse(final); pu != nil {
			host = strings.ToLower(pu.Host)
		}
	}
	q := ""
	switch {
	case strings.Contains(host, "youtu"):
		d := getJSON("https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape(link))
		title := cleanTitle(str(d, "title", ""))
		author := regexp.MustCompile(`(?i)\s*(- Topic|VEVO|Official)$`).ReplaceAllString(str(d, "author_name", ""), "")
		if strings.Contains(title, " - ") || strings.Contains(title, " – ") {
			q = title
		} else {
			q = author + " " + title
		}
	case strings.Contains(host, "soundcloud"):
		d := getJSON("https://soundcloud.com/oembed?format=json&url=" + url.QueryEscape(link))
		q = cleanTitle(strings.Replace(str(d, "title", ""), " by ", " ", 1))
	case strings.Contains(host, "deezer"):
		if m := regexp.MustCompile(`/track/(\d+)`).FindStringSubmatch(link); m != nil {
			d := getJSON("https://api.deezer.com/track/" + m[1])
			q = str(sub(d, "artist"), "name", "") + " " + str(d, "title", "")
		}
	case strings.Contains(host, "apple.com"):
		m := regexp.MustCompile(`[?&]i=(\d+)`).FindStringSubmatch(link)
		if m == nil {
			m = regexp.MustCompile(`/song/[^/]+/(\d+)`).FindStringSubmatch(link)
		}
		if m != nil {
			d := getJSON("https://itunes.apple.com/lookup?id=" + m[1])
			if l := asList(d["results"]); len(l) > 0 {
				r, _ := l[0].(map[string]any)
				q = str(r, "artistName", "") + " " + str(r, "trackName", "")
			}
		}
	}
	if strings.TrimSpace(q) == "" {
		_, page := getPage(link)
		if m := reOG.FindStringSubmatch(page); m != nil {
			q = cleanTitle(m[1])
		} else if m := reTitle.FindStringSubmatch(page); m != nil {
			q = cleanTitle(m[1])
		}
	}
	if strings.TrimSpace(q) == "" {
		return nil, nil
	}
	return spotify.Search(strings.TrimSpace(q))
}

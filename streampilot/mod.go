package main

// Chat-Schutz: Links, Großbuchstaben, Spam, Emotes, verbotene Wörter, Länge.
// Strafen stufenweise: erst löschen (+ Hinweis), bei Wiederholung innerhalb von 10 Minuten Timeout.

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
)

type ModRule struct {
	On     bool   `json:"on"`
	Action string `json:"action"` // "escalate" (löschen, dann Timeout) | "delete" | "timeout" | "ban"
}

type ModCfg struct {
	On        bool     `json:"on"`
	Links     ModRule  `json:"links"`
	Allow     []string `json:"allow"` // erlaubte Seiten
	PermitSec int      `json:"permitSec"`
	Caps      ModRule  `json:"caps"`
	CapsMin   int      `json:"capsMin"` // ab so vielen Buchstaben prüfen
	CapsPct   int      `json:"capsPct"`
	Spam      ModRule  `json:"spam"`
	RepeatMax int      `json:"repeatMax"` // gleiche Zeichen hintereinander
	Emotes    ModRule  `json:"emotes"`
	EmoteMax  int      `json:"emoteMax"`
	Words     ModRule  `json:"words"`
	WordList  []string `json:"wordList"`
	Length    ModRule  `json:"length"`
	LengthMax int      `json:"lengthMax"`
	SubsOK    bool     `json:"subsOk"` // Subs sind ausgenommen
	VIPsOK    bool     `json:"vipsOk"`
	Timeout   int      `json:"timeout"` // Sekunden
	Warn      bool     `json:"warn"`
	First     bool     `json:"first"` // Erst-Chatter begrüßen
	FirstMsg  string   `json:"firstMsg"`
}

func modDefault() ModCfg {
	return ModCfg{On: true, Links: ModRule{true, "escalate"}, Allow: []string{"twitch.tv", "clips.twitch.tv", "spotify.com", "youtube.com", "youtu.be"}, PermitSec: 60,
		Caps: ModRule{true, "delete"}, CapsMin: 12, CapsPct: 75, Spam: ModRule{true, "escalate"}, RepeatMax: 12, Emotes: ModRule{false, "delete"}, EmoteMax: 15,
		Words: ModRule{true, "timeout"}, Length: ModRule{false, "delete"}, LengthMax: 400, SubsOK: false, VIPsOK: true, Timeout: 600, Warn: true,
		First: true, FirstMsg: ""}
}

func modLoad() ModCfg {
	d := modDefault()
	if v := cfg.Get("mod"); v != nil {
		b, _ := json.Marshal(v)
		_ = json.Unmarshal(b, &d)
	}
	if d.PermitSec <= 0 {
		d.PermitSec = 60
	}
	if d.Timeout <= 0 {
		d.Timeout = 600
	}
	if d.Allow == nil {
		d.Allow = []string{}
	}
	if d.WordList == nil {
		d.WordList = []string{}
	}
	return d
}

func modSave(c ModCfg) {
	b, _ := json.Marshal(c)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	cfg.Set("mod", m)
}

type ModEntry struct {
	T      int64  `json:"t"`
	User   string `json:"user"`
	Rule   string `json:"rule"`
	Action string `json:"action"`
	Text   string `json:"text"`
}

var (
	modMu   sync.Mutex
	permits = map[string]time.Time{}
	strikes = map[string]time.Time{} // letzter Verstoß je Nutzer
	lastMsg = map[string]struct {
		text string
		at   time.Time
	}{}
	modLog []ModEntry
	reLink = regexp.MustCompile(`(?i)(?:https?://)?(?:[a-z0-9-]+\.)+(?:com|de|net|org|tv|gg|io|ly|me|co|xyz|ru|info|app|be|to|link|shop|live|uk|eu|at|ch|fr|it|nl|pl|es|us|cc|biz|site|online|store|club|top|click)(?:/[^\s]*)?`)
)

func permit(login string, sec int) {
	modMu.Lock()
	permits[strings.ToLower(login)] = time.Now().Add(time.Duration(sec) * time.Second)
	modMu.Unlock()
}

func modLogSnapshot() []ModEntry {
	modMu.Lock()
	defer modMu.Unlock()
	out := make([]ModEntry, len(modLog)) // nie null, damit die Seite eine leere Liste bekommt
	copy(out, modLog)
	return out
}

// checkMessage liefert den verletzten Regelnamen und die Regel – oder "".
func checkMessage(c ModCfg, m ChatMsg) (string, ModRule) {
	text := m.Text
	login := strings.ToLower(m.Login)
	if c.Words.On {
		low := strings.ToLower(text)
		for _, w := range c.WordList {
			w = strings.ToLower(strings.TrimSpace(w))
			if w != "" && strings.Contains(low, w) {
				return "words", c.Words
			}
		}
	}
	if c.Links.On {
		for _, l := range reLink.FindAllString(text, -1) {
			if allowedLink(l, c.Allow) {
				continue
			}
			modMu.Lock()
			until, ok := permits[login]
			if ok && time.Now().Before(until) {
				delete(permits, login) // Erlaubnis gilt für einen Link
				modMu.Unlock()
				continue
			}
			modMu.Unlock()
			return "links", c.Links
		}
	}
	if c.Length.On && c.LengthMax > 0 && len([]rune(text)) > c.LengthMax {
		return "length", c.Length
	}
	if c.Caps.On {
		letters, upper := 0, 0
		for _, r := range stripEmotes(text, m.Tags["emotes"]) {
			if unicode.IsLetter(r) {
				letters++
				if unicode.IsUpper(r) {
					upper++
				}
			}
		}
		if letters >= max(4, c.CapsMin) && upper*100 >= letters*max(10, c.CapsPct) {
			return "caps", c.Caps
		}
	}
	if c.Emotes.On && c.EmoteMax > 0 && countEmotes(m.Tags["emotes"]) > c.EmoteMax {
		return "emotes", c.Emotes
	}
	if c.Spam.On {
		if c.RepeatMax > 2 {
			run, prev := 0, rune(0)
			for _, r := range text {
				if r == prev && !unicode.IsSpace(r) {
					run++
					if run+1 >= c.RepeatMax {
						return "spam", c.Spam
					}
				} else {
					run = 0
				}
				prev = r
			}
		}
		modMu.Lock()
		lm := lastMsg[login]
		lastMsg[login] = struct {
			text string
			at   time.Time
		}{strings.ToLower(text), time.Now()}
		modMu.Unlock()
		if lm.text != "" && lm.text == strings.ToLower(text) && time.Since(lm.at) < 30*time.Second && len([]rune(text)) > 3 {
			return "spam", c.Spam
		}
	}
	return "", ModRule{}
}

func allowedLink(l string, allow []string) bool {
	h := strings.ToLower(l)
	h = strings.TrimPrefix(strings.TrimPrefix(h, "https://"), "http://")
	h = strings.SplitN(h, "/", 2)[0]
	h = strings.TrimPrefix(h, "www.")
	for _, a := range allow {
		a = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(a, "www.")))
		if a != "" && (h == a || strings.HasSuffix(h, "."+a)) {
			return true
		}
	}
	return false
}

func countEmotes(tag string) int {
	n := 0
	for _, part := range strings.Split(tag, "/") {
		if i := strings.Index(part, ":"); i >= 0 {
			n += len(strings.Split(part[i+1:], ","))
		}
	}
	return n
}

// stripEmotes entfernt Emotes (Twitch zählt in Zeichen), damit „KEKW“ nicht als Großschrift zählt.
func stripEmotes(text, tag string) string {
	if tag == "" {
		return text
	}
	r := []rune(text)
	drop := make([]bool, len(r))
	for _, part := range strings.Split(tag, "/") {
		i := strings.Index(part, ":")
		if i < 0 {
			continue
		}
		for _, rg := range strings.Split(part[i+1:], ",") {
			var a, z int
			if _, err := fmt.Sscanf(rg, "%d-%d", &a, &z); err == nil {
				for k := a; k <= z && k < len(r); k++ {
					if k >= 0 {
						drop[k] = true
					}
				}
			}
		}
	}
	var b strings.Builder
	for i, c := range r {
		if !drop[i] {
			b.WriteRune(c)
		}
	}
	return b.String()
}

var ruleNames = map[string][2]string{"links": {"Link", "link"}, "caps": {"Großbuchstaben", "caps"}, "spam": {"Spam", "spam"}, "emotes": {"zu viele Emotes", "too many emotes"},
	"words": {"verbotenes Wort", "banned word"}, "length": {"zu lang", "too long"}}

// moderate prüft eine Nachricht. true = Nachricht wurde bestraft und soll nicht weiterverarbeitet werden.
func (b *Bot) moderate(m ChatMsg, level int) bool {
	c := modLoad()
	if c.First && m.Tags["first-msg"] == "1" {
		msg := c.FirstMsg
		if msg == "" {
			msg = tr("Willkommen im Chat, @{user}! Schön, dass du da bist.", "Welcome to the chat, @{user}! Great to have you here.")
		}
		go b.chat.Say(strings.ReplaceAll(msg, "{user}", m.Display))
	}
	if !c.On || level >= LvlMod || (c.VIPsOK && level == LvlVIP) || (c.SubsOK && level >= LvlSub) {
		return false
	}
	rule, r := checkMessage(c, m)
	if rule == "" {
		return false
	}
	login := strings.ToLower(m.Login)
	action := r.Action
	if action == "" || action == "escalate" {
		modMu.Lock()
		prev, ok := strikes[login]
		modMu.Unlock()
		action = "delete"
		if ok && time.Since(prev) < 10*time.Minute {
			action = "timeout"
		}
	}
	modMu.Lock()
	strikes[login] = time.Now()
	modMu.Unlock()
	uid := m.Tags["user-id"]
	go func() {
		err := modAction(action, uid, m.Tags["id"], c.Timeout, ruleNames[rule][1])
		name := ruleNames[rule]
		label := tr(name[0], name[1])
		if err != nil {
			logEvent("err", "Chat-Schutz (%s) bei %s: %v", label, m.Display, err)
		} else {
			logEvent("info", "Chat-Schutz: %s – %s (%s)", m.Display, label, action)
		}
		modMu.Lock()
		modLog = append(modLog, ModEntry{T: time.Now().Unix(), User: m.Display, Rule: rule, Action: action, Text: m.Text})
		if len(modLog) > 200 {
			modLog = modLog[len(modLog)-200:]
		}
		modMu.Unlock()
		if c.Warn && err == nil && action != "ban" {
			warn := map[string]string{
				"links":  tr("@{user} bitte keine Links ohne Erlaubnis.", "@{user} please don't post links without permission."),
				"caps":   tr("@{user} bitte nicht so viel in Großbuchstaben schreiben.", "@{user} please don't use so many caps."),
				"spam":   tr("@{user} bitte nicht spammen.", "@{user} please don't spam."),
				"emotes": tr("@{user} bitte weniger Emotes auf einmal.", "@{user} please use fewer emotes at once."),
				"words":  tr("@{user} dieses Wort ist hier nicht erlaubt.", "@{user} that word isn't allowed here."),
				"length": tr("@{user} deine Nachricht war zu lang.", "@{user} your message was too long."),
			}[rule]
			if action == "timeout" {
				warn += fmt.Sprintf(tr(" (Timeout %s)", " (timeout %s)"), dur(c.Timeout))
			}
			b.chat.Say(strings.ReplaceAll(warn, "{user}", m.Display))
		}
	}()
	return true
}

func dur(sec int) string {
	if sec >= 3600 {
		return fmt.Sprintf("%d h", sec/3600)
	}
	if sec >= 60 {
		return fmt.Sprintf("%d min", sec/60)
	}
	return fmt.Sprintf("%d s", sec)
}

var modScopes = []string{"moderator:manage:chat_messages", "moderator:manage:banned_users"}

func hasModScopes() bool {
	for _, s := range modScopes {
		if !streamerAuth.Has(s) {
			return false
		}
	}
	return true
}

// modAction führt die Strafe über die Twitch-API aus (als Streamer).
func modAction(action, uid, msgID string, timeout int, reason string) error {
	if !hasModScopes() {
		return fmt.Errorf("%s", tr("dem Streamer-Konto fehlen Moderationsrechte – in „Konten“ neu verbinden", "the streamer account lacks moderation rights – reconnect it under “Accounts”"))
	}
	bid := streamerAuth.UserID()
	if ch := channelLogin(); ch != "" && !strings.EqualFold(ch, streamerAuth.Login()) {
		if id := userID(ch); id != "" {
			bid = id
		}
	}
	mid := streamerAuth.UserID()
	switch action {
	case "delete":
		if msgID == "" {
			return nil
		}
		_, err := helix("DELETE", "/moderation/chat?broadcaster_id="+bid+"&moderator_id="+mid+"&message_id="+msgID, nil)
		return err
	case "timeout", "ban":
		if uid == "" {
			return nil
		}
		data := map[string]any{"user_id": uid, "reason": "StreamPilot: " + reason}
		if action == "timeout" {
			data["duration"] = max(1, min(1209600, timeout))
		}
		_, err := helix("POST", "/moderation/bans?broadcaster_id="+bid+"&moderator_id="+mid, map[string]any{"data": data})
		return err
	}
	return nil
}

func channelLogin() string {
	if b := bot; b != nil {
		return b.Channel
	}
	return strings.ToLower(strings.TrimPrefix(cfg.Str("channel", ""), "#"))
}

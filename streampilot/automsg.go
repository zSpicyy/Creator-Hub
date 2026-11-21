package main

// Automatische Chat-Nachrichten: Dank bei Follows, Abos, Bits und Raids, Nachricht zum Stream-Start
// und Auto-Antworten auf Stichwörter im Chat.

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"
	"time"
)

type AutoEvent struct {
	On  bool   `json:"on"`
	Msg string `json:"msg"`
	Min int    `json:"min,omitempty"` // Bits / Raid-Zuschauer: erst ab dieser Menge
}

type AutoReply struct {
	ID       string `json:"id"`
	Words    string `json:"words"` // Komma getrennt
	Reply    string `json:"reply"`
	Cooldown int    `json:"cooldown"`
	On       bool   `json:"on"`
	Uses     int    `json:"uses"`
}

type AutoCfg struct {
	Events  map[string]AutoEvent `json:"events"` // follow sub resub subgift giftbomb raid bits start end
	RaidSO  bool                 `json:"raidSo"` // bei Raids automatisch Shoutout
	Replies []AutoReply          `json:"replies"`
	ReplyOn bool                 `json:"replyOn"`
}

var autoMu sync.Mutex

func autoDefault() AutoCfg {
	e := func(on bool, de, en string) AutoEvent { return AutoEvent{On: on, Msg: tr(de, en)} }
	return AutoCfg{
		Events: map[string]AutoEvent{
			"follow":   e(false, "Danke fürs Folgen, {user}!", "Thanks for the follow, {user}!"),
			"sub":      e(true, "Danke für dein Abo, {user}! Willkommen im Team.", "Thanks for subscribing, {user}! Welcome to the team."),
			"resub":    e(true, "{user} ist seit {months} Monaten dabei. Danke für die Treue!", "{user} has been subscribed for {months} months. Thanks for sticking around!"),
			"subgift":  e(true, "Danke, {user}, für das Abo an {target}!", "Thanks, {user}, for gifting a sub to {target}!"),
			"giftbomb": e(true, "{user} verschenkt {count} Abos! Vielen Dank!", "{user} is gifting {count} subs! Thank you so much!"),
			"raid":     {On: true, Msg: tr("Willkommen, Raider! Danke {user} für den Raid mit {viewers} Zuschauern.", "Welcome, raiders! Thanks {user} for the raid with {viewers} viewers."), Min: 1},
			"bits":     {On: true, Msg: tr("Danke für {bits} Bits, {user}!", "Thanks for {bits} bits, {user}!"), Min: 1},
			"start":    e(false, "Der Stream ist live! Heute: {title}", "The stream is live! Today: {title}"),
			"end":      e(false, "Danke fürs Zuschauen! Bis zum nächsten Mal.", "Thanks for watching! See you next time."),
		},
		RaidSO:  true,
		ReplyOn: true,
		Replies: []AutoReply{
			{ID: "discord", Words: "discord", Reply: tr("@{user} unseren Discord findest du mit !discord", "@{user} you can find our Discord with !discord"), Cooldown: 120, On: false},
			{ID: "mitspielen", Words: tr("mitspielen, kann ich mitspielen", "play with you, can i join"), Reply: tr("@{user} stell dich mit !mitspielen in die Warteschlange.", "@{user} join the queue with !join."), Cooldown: 120, On: false},
		},
	}
}

func autoLoad() AutoCfg {
	d := autoDefault()
	if v := cfg.Get("auto"); v != nil {
		b, _ := json.Marshal(v)
		var x AutoCfg
		if json.Unmarshal(b, &x) == nil {
			// neue Ereignisse behalten ihre Standardwerte
			for k, ev := range x.Events {
				d.Events[k] = ev
			}
			d.RaidSO, d.ReplyOn = x.RaidSO, x.ReplyOn
			if x.Replies != nil {
				d.Replies = x.Replies
			}
		}
	}
	return d
}

func autoSave(d AutoCfg) {
	b, _ := json.Marshal(d)
	var m any
	_ = json.Unmarshal(b, &m)
	cfg.Set("auto", m)
}

// autoEvent schickt die Dankesnachricht zu einem Ereignis in den Chat.
func autoEvent(kind string, vars map[string]string) {
	if !gBool("autoOn") || bot == nil || bot.chat == nil {
		return
	}
	d := autoLoad()
	ev, ok := d.Events[kind]
	if !ok || !ev.On || strings.TrimSpace(ev.Msg) == "" {
		return
	}
	if ev.Min > 0 {
		key := map[string]string{"bits": "bits", "raid": "viewers"}[kind]
		if key != "" && atoi(vars[key]) < ev.Min {
			return
		}
	}
	msg := ev.Msg
	for k, v := range vars {
		msg = strings.ReplaceAll(msg, "{"+k+"}", v)
	}
	msg = strings.ReplaceAll(msg, "{channel}", bot.Channel)
	go bot.chat.Say(msg)
	if kind == "raid" && d.RaidSO && vars["login"] != "" {
		go func() { time.Sleep(4 * time.Second); bot.shoutout(vars["login"], "") }()
	}
}

func atoi(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}

var replyLast = map[string]time.Time{}

// autoReply antwortet, wenn eine Nachricht ein Stichwort enthält. true = geantwortet.
func (b *Bot) autoReply(m ChatMsg) bool {
	if !gBool("replyOn") || b.chat == nil {
		return false
	}
	d := autoLoad()
	text := strings.ToLower(m.Text)
	for _, r := range d.Replies {
		if !r.On || strings.TrimSpace(r.Reply) == "" {
			continue
		}
		for _, w := range strings.Split(r.Words, ",") {
			w = strings.ToLower(strings.TrimSpace(w))
			if w == "" || !regexp.MustCompile(`(^|[^\pL\pN])`+regexp.QuoteMeta(w)+`($|[^\pL\pN])`).MatchString(text) {
				continue
			}
			autoMu.Lock()
			if time.Since(replyLast[r.ID]) < time.Duration(r.Cooldown)*time.Second {
				autoMu.Unlock()
				return false
			}
			replyLast[r.ID] = time.Now()
			autoMu.Unlock()
			b.chat.Say(b.ownFill(r.Reply, m, "", 0))
			id := r.ID
			go func() {
				autoMu.Lock()
				defer autoMu.Unlock()
				x := autoLoad()
				for i := range x.Replies {
					if x.Replies[i].ID == id {
						x.Replies[i].Uses++
					}
				}
				autoSave(x)
			}()
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- Läuft der Stream gerade?

var liveMu sync.Mutex
var liveAt time.Time
var liveVal bool

func isLive(login string) bool {
	liveMu.Lock()
	defer liveMu.Unlock()
	if time.Since(liveAt) < 2*time.Minute {
		return liveVal
	}
	liveAt = time.Now()
	liveVal = false
	if m, err := helix("GET", "/streams?user_login="+login, nil); err == nil {
		liveVal = len(asList(m["data"])) > 0
	}
	return liveVal
}

func setLive(v bool) {
	liveMu.Lock()
	liveVal, liveAt = v, time.Now()
	liveMu.Unlock()
}

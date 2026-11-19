package main

// Eigene Befehle, Zähler, Zitate, Shoutout und Timer-Nachrichten.

import (
	"encoding/json"
	"fmt"
	"kit"
	"math/rand"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type OwnCmd struct {
	ID       string `json:"id"`
	Names    string `json:"names"`    // z. B. "discord, dc"
	Response string `json:"response"` // mit Variablen wie {user} {count}
	Level    int    `json:"level"`
	Cooldown int    `json:"cooldown"` // Sekunden
	On       bool   `json:"on"`
	Uses     int    `json:"uses"`
}

type OwnTimer struct {
	ID      string `json:"id"`
	Msg     string `json:"msg"`
	Minutes int    `json:"minutes"` // frühestens alle X Minuten
	Lines   int    `json:"lines"`   // und erst nach mindestens Y Chat-Nachrichten
	On      bool   `json:"on"`
}

type Quote struct {
	N    int    `json:"n"`
	Text string `json:"text"`
	By   string `json:"by"`
	Date string `json:"date"`
}

type OwnData struct {
	Cmds     []OwnCmd        `json:"cmds"`
	Timers   []OwnTimer      `json:"timers"`
	Counters map[string]int  `json:"counters"`
	Quotes   []Quote         `json:"quotes"`
	Builtin  map[string]bool `json:"builtin"` // quote, addquote, delquote, so, permit
	SoMsg    string          `json:"soMsg"`
}

var ownMu sync.Mutex

func ownDefault() OwnData {
	return OwnData{Counters: map[string]int{}, Builtin: map[string]bool{"quote": true, "addquote": true, "delquote": true, "so": true, "permit": true},
		Cmds: []OwnCmd{
			{ID: "discord", Names: "discord, dc", Response: "Komm auf unseren Discord: https://discord.gg/DEINLINK", Level: LvlAll, Cooldown: 30, On: false},
			{ID: "tode", Names: "tode, deaths", Response: "{channel} ist schon {count}-mal gestorben.", Level: LvlAll, Cooldown: 5, On: false},
		}}
}

func ownLoad() OwnData {
	d := ownDefault()
	if v := cfg.Get("own"); v != nil {
		b, _ := json.Marshal(v)
		var x OwnData
		if json.Unmarshal(b, &x) == nil {
			d = x
		}
	}
	if d.Counters == nil {
		d.Counters = map[string]int{}
	}
	if d.Cmds == nil {
		d.Cmds = []OwnCmd{}
	}
	if d.Timers == nil {
		d.Timers = []OwnTimer{}
	}
	if d.Quotes == nil {
		d.Quotes = []Quote{}
	}
	if d.Builtin == nil {
		d.Builtin = ownDefault().Builtin
	}
	return d
}

func ownSave(d OwnData) {
	b, _ := json.Marshal(d)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	cfg.Set("own", m)
}

var (
	ownLast   = map[string]time.Time{} // Abklingzeit je Befehl
	chatLines int64                    // Chat-Nachrichten seit Bot-Start (für Timer)
	reRand    = regexp.MustCompile(`\{random:(-?\d+)-(-?\d+)\}`)
	reCounter = regexp.MustCompile(`\{counter:([\w-]+)\}`)
)

func isDE() bool {
	l := gStr("chatLang")
	if l == "" {
		l = kit.Lang()
	}
	return l == "de"
}

func tr(de, en string) string {
	if isDE() {
		return de
	}
	return en
}

// ownVars füllt die Variablen einer eigenen Antwort.
func (b *Bot) ownFill(tpl string, m ChatMsg, arg string, count int) string {
	to := strings.TrimPrefix(strings.Fields(arg + " x")[0], "@")
	if arg == "" {
		to = m.Display
	}
	s := strings.NewReplacer("{user}", m.Display, "{touser}", to, "{args}", arg, "{count}", strconv.Itoa(count), "{channel}", b.Channel).Replace(tpl)
	s = reRand.ReplaceAllStringFunc(s, func(x string) string {
		g := reRand.FindStringSubmatch(x)
		a, _ := strconv.Atoi(g[1])
		z, _ := strconv.Atoi(g[2])
		if z < a {
			a, z = z, a
		}
		return strconv.Itoa(a + rand.Intn(z-a+1))
	})
	if strings.Contains(s, "{counter:") {
		d := ownLoad()
		s = reCounter.ReplaceAllStringFunc(s, func(x string) string { return strconv.Itoa(d.Counters[reCounter.FindStringSubmatch(x)[1]]) })
	}
	if strings.Contains(s, "{uptime}") || strings.Contains(s, "{game}") || strings.Contains(s, "{title}") {
		up, game, title := streamInfo(b.Channel)
		s = strings.NewReplacer("{uptime}", up, "{game}", game, "{title}", title).Replace(s)
	}
	return s
}

// streamInfo: Laufzeit, Spiel und Titel des Streams (für {uptime}, {game}, {title}).
func streamInfo(login string) (uptime, game, title string) {
	uptime = tr("offline", "offline")
	if m, err := helix("GET", "/streams?user_login="+login, nil); err == nil {
		if l := asList(m["data"]); len(l) > 0 {
			s, _ := l[0].(map[string]any)
			if t, err := time.Parse(time.RFC3339, fmt.Sprint(s["started_at"])); err == nil {
				d := time.Since(t)
				uptime = fmt.Sprintf("%dh %02dm", int(d.Hours()), int(d.Minutes())%60)
			}
			game, title = fmt.Sprint(s["game_name"]), fmt.Sprint(s["title"])
			return
		}
	}
	if id := userID(login); id != "" {
		if m, err := helix("GET", "/channels?broadcaster_id="+id, nil); err == nil {
			if l := asList(m["data"]); len(l) > 0 {
				s, _ := l[0].(map[string]any)
				game, title = fmt.Sprint(s["game_name"]), fmt.Sprint(s["title"])
			}
		}
	}
	return
}

var idCache sync.Map

func userID(login string) string {
	login = strings.ToLower(strings.TrimPrefix(login, "@"))
	if v, ok := idCache.Load(login); ok {
		return v.(string)
	}
	m, err := helix("GET", "/users?login="+login, nil)
	if err != nil {
		return ""
	}
	if l := asList(m["data"]); len(l) > 0 {
		u, _ := l[0].(map[string]any)
		id := fmt.Sprint(u["id"])
		idCache.Store(login, id)
		return id
	}
	return ""
}

func prefixes() string {
	p := gStr("cmdPrefix")
	if p == "" {
		p = "!"
	}
	return p
}

// matchName prüft, ob das erste Wort ein Befehl aus der Namensliste ist.
func matchName(word, names string) bool {
	for _, ch := range prefixes() {
		for _, n := range strings.Split(names, ",") {
			n = cleanCmd(n)
			if n != "" && word == string(ch)+n {
				return true
			}
		}
	}
	return false
}

// handleOwn verarbeitet eigene Befehle und die eingebauten Extras. true = erledigt.
func (b *Bot) handleOwn(m ChatMsg, word, arg string, level int, uid string) bool {
	ownMu.Lock()
	d := ownLoad()
	ownMu.Unlock()
	mod := level >= LvlMod
	// eingebaute Extras (ganzer Bereich abschaltbar)
	extra := gBool("extraOn")
	switch {
	case !extra:
	case d.Builtin["quote"] && matchName(word, "quote, zitat"):
		if len(d.Quotes) == 0 {
			b.chat.Say(tr("Noch keine Zitate gespeichert.", "No quotes saved yet."))
			return true
		}
		q := d.Quotes[rand.Intn(len(d.Quotes))]
		if n, err := strconv.Atoi(strings.TrimPrefix(arg, "#")); err == nil {
			found := false
			for _, x := range d.Quotes {
				if x.N == n {
					q, found = x, true
				}
			}
			if !found {
				b.chat.Say(fmt.Sprintf(tr("Zitat #%d gibt es nicht.", "Quote #%d doesn't exist."), n))
				return true
			}
		}
		b.chat.Say(fmt.Sprintf("#%d: „%s“ – %s (%s)", q.N, q.Text, q.By, q.Date))
		return true
	case d.Builtin["addquote"] && mod && matchName(word, "addquote, zitatneu"):
		if arg == "" {
			b.chat.Say(tr("So geht's: !addquote Text des Zitats", "Usage: !addquote quote text"))
			return true
		}
		ownMu.Lock()
		d = ownLoad()
		n := 1
		for _, x := range d.Quotes {
			if x.N >= n {
				n = x.N + 1
			}
		}
		d.Quotes = append(d.Quotes, Quote{N: n, Text: arg, By: b.Channel, Date: time.Now().Format("02.01.2006")})
		ownSave(d)
		ownMu.Unlock()
		b.chat.Say(fmt.Sprintf(tr("Zitat #%d gespeichert.", "Quote #%d saved."), n))
		return true
	case d.Builtin["delquote"] && mod && matchName(word, "delquote, zitatweg"):
		n, err := strconv.Atoi(strings.TrimPrefix(arg, "#"))
		if err != nil {
			return true
		}
		ownMu.Lock()
		d = ownLoad()
		out := d.Quotes[:0]
		for _, x := range d.Quotes {
			if x.N != n {
				out = append(out, x)
			}
		}
		d.Quotes = out
		ownSave(d)
		ownMu.Unlock()
		b.chat.Say(fmt.Sprintf(tr("Zitat #%d gelöscht.", "Quote #%d deleted."), n))
		return true
	case d.Builtin["so"] && mod && matchName(word, "so, shoutout"):
		target := strings.TrimPrefix(strings.Fields(arg + " ")[0], "@")
		if target == "" {
			return true
		}
		go b.shoutout(target, d.SoMsg)
		return true
	case d.Builtin["permit"] && mod && matchName(word, "permit, erlauben"):
		target := strings.ToLower(strings.TrimPrefix(strings.Fields(arg + " ")[0], "@"))
		if target != "" {
			sec := modLoad().PermitSec
			permit(target, sec)
			b.chat.Say(fmt.Sprintf(tr("@%s darf jetzt %d Sekunden lang einen Link posten.", "@%s may post a link for %d seconds."), target, sec))
		}
		return true
	}
	// eigene Befehle (ganzer Bereich abschaltbar)
	if !gBool("ownOn") {
		return false
	}
	for i, c := range d.Cmds {
		if !c.On || !matchName(word, c.Names) {
			continue
		}
		if !levelOK(c.Level, level, uid) {
			return true
		}
		key := c.ID
		// Zähler ändern (nur Mods): !tode +  !tode -  !tode =5  !tode +3
		if mod && strings.Contains(c.Response, "{count}") && arg != "" {
			if v, ok := counterOp(d.Counters[key], arg); ok {
				ownMu.Lock()
				d = ownLoad()
				d.Counters[key] = v
				ownSave(d)
				ownMu.Unlock()
				b.chat.Say(b.ownFill(c.Response, m, "", v))
				return true
			}
		}
		if !mod && c.Cooldown > 0 {
			ownMu.Lock()
			last := ownLast[key]
			if time.Since(last) < time.Duration(c.Cooldown)*time.Second {
				ownMu.Unlock()
				return true
			}
			ownLast[key] = time.Now()
			ownMu.Unlock()
		}
		count := d.Counters[key] // ohne Mod-Rechte wird der Zähler nur gelesen
		ownMu.Lock()
		d = ownLoad()
		if i < len(d.Cmds) {
			d.Cmds[i].Uses++
		}
		ownSave(d)
		ownMu.Unlock()
		for _, line := range strings.Split(b.ownFill(c.Response, m, arg, count), "\n") {
			if strings.TrimSpace(line) != "" {
				b.chat.Say(line)
			}
		}
		logEvent("chat", "%s: %s", m.Display, m.Text)
		return true
	}
	return false
}

func counterOp(cur int, arg string) (int, bool) {
	a := strings.TrimSpace(arg)
	switch {
	case a == "+" || a == "++":
		return cur + 1, true
	case a == "-" || a == "--":
		return max(0, cur-1), true
	case strings.HasPrefix(a, "="):
		if v, err := strconv.Atoi(strings.TrimSpace(a[1:])); err == nil {
			return max(0, v), true
		}
	case strings.HasPrefix(a, "+") || strings.HasPrefix(a, "-"):
		if v, err := strconv.Atoi(a); err == nil {
			return max(0, cur+v), true
		}
	}
	return cur, false
}

// shoutout: Nachricht im Chat und – wenn erlaubt – Twitchs eigener Shoutout.
func (b *Bot) shoutout(login, tpl string) {
	_, game, _ := streamInfo(login)
	if game == "" {
		game = tr("etwas Spannendes", "something cool")
	}
	if tpl == "" {
		tpl = tr("Schaut unbedingt bei {name} vorbei: https://twitch.tv/{login} – zuletzt gestreamt: {game}", "Go check out {name}: https://twitch.tv/{login} – last streamed: {game}")
	}
	b.chat.Say(strings.NewReplacer("{name}", login, "{login}", strings.ToLower(login), "{game}", game).Replace(tpl))
	if streamerAuth.Has("moderator:manage:shoutouts") {
		if to, from := userID(login), streamerAuth.UserID(); to != "" && from != "" {
			_, _ = helix("POST", "/chat/shoutouts?from_broadcaster_id="+from+"&to_broadcaster_id="+to+"&moderator_id="+from, nil)
		}
	}
	logEvent("info", "Shoutout: %s", login)
}

// timerLoop schickt Timer-Nachrichten, solange der Bot läuft.
func (b *Bot) timerLoop() {
	lastAt := map[string]time.Time{}
	linesAt := map[string]int64{}
	start := time.Now()
	idx := 0
	for {
		time.Sleep(20 * time.Second)
		b.mu.Lock()
		run := b.running
		b.mu.Unlock()
		if !run {
			return
		}
		if b.chat == nil || !b.chat.Joined || !gBool("timerOn") {
			continue
		}
		ownMu.Lock()
		d := ownLoad()
		ownMu.Unlock()
		if len(d.Timers) == 0 {
			continue
		}
		// immer nur ein Timer pro Runde, reihum
		for k := 0; k < len(d.Timers); k++ {
			t := d.Timers[(idx+k)%len(d.Timers)]
			if !t.On || strings.TrimSpace(t.Msg) == "" {
				continue
			}
			mins := max(1, t.Minutes)
			last, ok := lastAt[t.ID]
			if !ok {
				last = start
			}
			ownMu.Lock()
			lines := chatLines
			ownMu.Unlock()
			if time.Since(last) < time.Duration(mins)*time.Minute || lines-linesAt[t.ID] < int64(t.Lines) {
				continue
			}
			lastAt[t.ID], linesAt[t.ID] = time.Now(), lines
			msg := b.ownFill(t.Msg, ChatMsg{Display: b.Channel}, "", 0)
			b.chat.Say(msg)
			logEvent("info", "Timer: %s", msg)
			idx = (idx + k + 1) % len(d.Timers)
			break
		}
	}
}

package main

// Gewinnspiele, Sounds, Ziel-Balken und Mitspieler-Warteschlange.
// Dazu ein kleiner Overlay-Server mit fester Adresse für OBS (Browserquelle).

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io/fs"
	"math"
	"math/rand"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"kit"
)

type GiveCfg struct {
	Keyword    string `json:"keyword"`    // z. B. "!join"
	SubLuck    int    `json:"subLuck"`    // Lose für Subs
	FollowOnly bool   `json:"followOnly"` // nur Follower
	OpenMsg    string `json:"openMsg"`
	WinMsg     string `json:"winMsg"`
	AutoMin    int    `json:"autoMin"` // automatisch ziehen nach X Minuten (0 = von Hand)
	Confirm    bool   `json:"confirm"` // „Ich bin hier“ bestätigen lassen (Hinweis im Chat)
}

type GiveEntry struct {
	Login   string `json:"login"`
	Display string `json:"display"`
	Tickets int    `json:"tickets"`
}

type GiveState struct {
	Open    bool        `json:"open"`
	Title   string      `json:"title"`
	Started int64       `json:"started"`
	Entries []GiveEntry `json:"entries"`
	Winners []string    `json:"winners"` // Verlauf
}

type Sound struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Cmd      string `json:"cmd"`    // Chat-Befehl ohne Präfix (leer = kein Befehl)
	Reward   string `json:"reward"` // Kanalpunkte-Belohnung (leer = keine)
	File     string `json:"file"`
	Volume   int    `json:"volume"`   // 0–100
	Cooldown int    `json:"cooldown"` // Sekunden für diesen Sound
	Level    int    `json:"level"`
	On       bool   `json:"on"`
	Uses     int    `json:"uses"`
}

type SoundCfg struct {
	PlayIn  string `json:"playIn"`  // "app" oder "obs"
	Global  int    `json:"global"`  // Sekunden zwischen zwei beliebigen Sounds
	Volume  int    `json:"volume"`  // Gesamtlautstärke 0–100
	ListCmd bool   `json:"listCmd"` // !sounds listet alle Befehle
}

type Goal struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"` // follow, sub, bits
	Title   string `json:"title"`
	Current int    `json:"current"`
	Target  int    `json:"target"`
	On      bool   `json:"on"`
	Color   string `json:"color"`
	Done    bool   `json:"done"` // Ziel-erreicht-Nachricht schon geschickt
}

type QueueCfg struct {
	Max      int    `json:"max"`
	SubFirst bool   `json:"subFirst"`
	JoinCmd  string `json:"joinCmd"`
	LeaveCmd string `json:"leaveCmd"`
	PosCmd   string `json:"posCmd"`
	ListCmd  string `json:"listCmd"`
	NextMsg  string `json:"nextMsg"`
	NeedName bool   `json:"needName"` // Spielername beim Beitreten verlangen
	OncePer  bool   `json:"oncePer"`  // wer schon dran war, kann nicht nochmal
}

type QEntry struct {
	Login   string `json:"login"`
	Display string `json:"display"`
	Note    string `json:"note"` // z. B. Spielername
	Sub     bool   `json:"sub"`
	T       int64  `json:"t"`
}

type QueueState struct {
	Open    bool     `json:"open"`
	List    []QEntry `json:"list"`
	Playing []QEntry `json:"playing"` // gerade dran
	Done    []string `json:"done"`    // waren schon dran (Login)
}

type Community struct {
	Give      GiveCfg    `json:"give"`
	GiveState GiveState  `json:"giveState"`
	Sounds    []Sound    `json:"sounds"`
	SoundCfg  SoundCfg   `json:"soundCfg"`
	Goals     []Goal     `json:"goals"`
	GoalMsg   bool       `json:"goalMsg"` // Chat-Nachricht, wenn ein Ziel erreicht ist
	Queue     QueueCfg   `json:"queue"`
	QueueSt   QueueState `json:"queueState"`
}

var comMu sync.Mutex

func comDefault() Community {
	de := isDE()
	pick := func(a, b string) string {
		if de {
			return a
		}
		return b
	}
	return Community{
		Give: GiveCfg{Keyword: "!join", SubLuck: 2, OpenMsg: pick("Gewinnspiel gestartet: {title}! Schreib {keyword} in den Chat, um mitzumachen.", "Giveaway started: {title}! Type {keyword} in chat to enter."),
			WinMsg: pick("Gewonnen hat @{user}! Herzlichen Glückwunsch zu {title}!", "The winner is @{user}! Congratulations on {title}!")},
		GiveState: GiveState{Entries: []GiveEntry{}, Winners: []string{}},
		Sounds: []Sound{
			{ID: "tusch", Name: "Tusch", Cmd: "tusch", File: "tusch.wav", Volume: 70, Cooldown: 60, Level: LvlAll, On: false},
			{ID: "fail", Name: "Fail", Cmd: "fail", File: "fail.wav", Volume: 70, Cooldown: 60, Level: LvlAll, On: false},
			{ID: "ding", Name: "Ding", Cmd: "ding", File: "ding.wav", Volume: 60, Cooldown: 30, Level: LvlAll, On: false},
			{ID: "trommel", Name: pick("Trommelwirbel", "Drumroll"), Cmd: "trommel", File: "trommel.wav", Volume: 70, Cooldown: 90, Level: LvlSub, On: false},
		},
		SoundCfg: SoundCfg{PlayIn: "app", Global: 10, Volume: 80, ListCmd: false},
		Goals: []Goal{
			{ID: "follow", Kind: "follow", Title: pick("Follower-Ziel", "Follower goal"), Target: 50, On: false, Color: "#7c4dff"},
			{ID: "sub", Kind: "sub", Title: pick("Sub-Ziel", "Sub goal"), Target: 10, On: false, Color: "#3ddc84"},
			{ID: "bits", Kind: "bits", Title: pick("Bits-Ziel", "Bits goal"), Target: 1000, On: false, Color: "#f0a33a"},
		},
		GoalMsg: false,
		Queue: QueueCfg{Max: 30, JoinCmd: "mitspielen, join", LeaveCmd: "raus, leave", PosCmd: "platz, position", ListCmd: "liste, queue",
			NextMsg: pick("@{user}, du bist dran! Komm rein{note}.", "@{user}, it's your turn! Join in{note}.")},
		QueueSt: QueueState{List: []QEntry{}, Playing: []QEntry{}, Done: []string{}},
	}
}

func comLoad() Community {
	d := comDefault()
	if v := cfg.Get("community"); v != nil {
		b, _ := json.Marshal(v)
		_ = json.Unmarshal(b, &d) // fehlende Felder behalten ihre Standardwerte
	}
	if d.GiveState.Entries == nil {
		d.GiveState.Entries = []GiveEntry{}
	}
	if d.GiveState.Winners == nil {
		d.GiveState.Winners = []string{}
	}
	if d.Sounds == nil {
		d.Sounds = []Sound{}
	}
	if d.Goals == nil {
		d.Goals = []Goal{}
	}
	if d.QueueSt.List == nil {
		d.QueueSt.List = []QEntry{}
	}
	if d.QueueSt.Playing == nil {
		d.QueueSt.Playing = []QEntry{}
	}
	if d.QueueSt.Done == nil {
		d.QueueSt.Done = []string{}
	}
	return d
}

func comSave(d Community) {
	b, _ := json.Marshal(d)
	var m any
	_ = json.Unmarshal(b, &m)
	cfg.Set("community", m)
}

// comEdit lädt, ändert und speichert unter Sperre; danach geht ein Update an Overlays und Fenster.
func comEdit(f func(d *Community)) Community {
	comMu.Lock()
	d := comLoad()
	f(&d)
	comSave(d)
	comMu.Unlock()
	live.send("state", nil)
	return d
}

// ---------------------------------------------------------------- Live-Kanal (Server-Sent Events)

type liveHub struct {
	mu   sync.Mutex
	subs map[chan string]bool
}

var live = &liveHub{subs: map[chan string]bool{}}

func (h *liveHub) send(kind string, data any) {
	b, _ := json.Marshal(map[string]any{"kind": kind, "data": data})
	h.mu.Lock()
	for c := range h.subs {
		select {
		case c <- string(b):
		default:
		}
	}
	h.mu.Unlock()
}

func (h *liveHub) serve(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no stream", 500)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	c := make(chan string, 16)
	h.mu.Lock()
	h.subs[c] = true
	h.mu.Unlock()
	defer func() { h.mu.Lock(); delete(h.subs, c); h.mu.Unlock() }()
	fmt.Fprint(w, ": ok\n\n")
	fl.Flush()
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case s := <-c:
			fmt.Fprintf(w, "data: %s\n\n", s)
			fl.Flush()
		case <-tick.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		}
	}
}

// ---------------------------------------------------------------- Sounds

var sndMu sync.Mutex
var sndLast = map[string]time.Time{}
var sndGlobal time.Time

func soundDir() string { return dataPath("sounds") }

// playSound prüft Pausen und schickt den Sound an Fenster bzw. OBS-Overlay.
func playSound(s Sound, sc SoundCfg, force bool) bool {
	sndMu.Lock()
	now := time.Now()
	if !force {
		if now.Sub(sndGlobal) < time.Duration(sc.Global)*time.Second || now.Sub(sndLast[s.ID]) < time.Duration(s.Cooldown)*time.Second {
			sndMu.Unlock()
			return false
		}
	}
	sndGlobal, sndLast[s.ID] = now, now
	sndMu.Unlock()
	vol := float64(s.Volume) * float64(sc.Volume) / 10000
	live.send("sound", map[string]any{"id": s.ID, "file": s.File, "vol": vol, "where": sc.PlayIn, "name": s.Name})
	logEvent("alert", "sound – %s", s.Name)
	return true
}

// Standard-Sounds werden beim ersten Start erzeugt (keine fremden Aufnahmen nötig).
func ensureSounds() {
	_ = os.MkdirAll(soundDir(), 0o755)
	gen := map[string]func() []float64{
		"ding.wav": func() []float64 { return synth(0.9, []tone{{0, 1318.5, .9, 4}, {0, 2637, .25, 6}}) },
		"tusch.wav": func() []float64 {
			return synth(1.6, []tone{{0, 523.3, .12, 0}, {.12, 523.3, .12, 0}, {.24, 523.3, .12, 0}, {.38, 659.3, 1.1, 1.6}, {.38, 784, 1.1, 1.6}, {.38, 1046.5, 1.1, 1.6}})
		},
		"fail.wav": func() []float64 {
			return synth(2.0, []tone{{0, 392, .38, .5}, {.42, 370, .38, .5}, {.84, 349.2, .38, .5}, {1.26, 329.6, .7, 1.2}})
		},
		"trommel.wav": func() []float64 { return drumroll(2.2) },
	}
	for name, f := range gen {
		p := filepath.Join(soundDir(), name)
		if _, err := os.Stat(p); err == nil {
			continue
		}
		_ = os.WriteFile(p, wav(f()), 0o644)
	}
}

type tone struct{ at, freq, dur, decay float64 }

func synth(total float64, ts []tone) []float64 {
	const sr = 44100
	out := make([]float64, int(total*sr))
	for _, t := range ts {
		st := int(t.at * sr)
		n := int(t.dur * sr)
		for i := 0; i < n && st+i < len(out); i++ {
			x := float64(i) / sr
			env := math.Min(1, x*200) * math.Exp(-x*t.decay)
			if t.decay == 0 {
				env = math.Min(1, x*200) * math.Min(1, (t.dur-x)*40)
			}
			// warmer Klang aus Grundton und zwei Obertönen
			v := math.Sin(2*math.Pi*t.freq*x) + .35*math.Sin(4*math.Pi*t.freq*x) + .15*math.Sin(6*math.Pi*t.freq*x)
			out[st+i] += .28 * env * v
		}
	}
	return out
}

func drumroll(total float64) []float64 {
	const sr = 44100
	out := make([]float64, int(total*sr))
	r := rand.New(rand.NewSource(3))
	for t := 0.0; t < total-.5; t += .045 {
		st := int(t * sr)
		amp := .25 + .35*t/total
		for i := 0; i < 1800 && st+i < len(out); i++ {
			x := float64(i) / sr
			out[st+i] += amp * (r.Float64()*2 - 1) * math.Exp(-x*60)
		}
	}
	// Schlussbecken
	st := int((total - .5) * sr)
	for i := 0; st+i < len(out); i++ {
		x := float64(i) / sr
		out[st+i] += .5 * (r.Float64()*2 - 1) * math.Exp(-x*5)
	}
	return out
}

func wav(s []float64) []byte {
	var b bytes.Buffer
	n := len(s)
	b.WriteString("RIFF")
	binary.Write(&b, binary.LittleEndian, uint32(36+n*2))
	b.WriteString("WAVEfmt ")
	binary.Write(&b, binary.LittleEndian, uint32(16))
	binary.Write(&b, binary.LittleEndian, uint16(1))
	binary.Write(&b, binary.LittleEndian, uint16(1))
	binary.Write(&b, binary.LittleEndian, uint32(44100))
	binary.Write(&b, binary.LittleEndian, uint32(88200))
	binary.Write(&b, binary.LittleEndian, uint16(2))
	binary.Write(&b, binary.LittleEndian, uint16(16))
	b.WriteString("data")
	binary.Write(&b, binary.LittleEndian, uint32(n*2))
	for _, v := range s {
		v = math.Max(-1, math.Min(1, v))
		binary.Write(&b, binary.LittleEndian, int16(v*32000))
	}
	return b.Bytes()
}

// ---------------------------------------------------------------- Ziele

func goalAdd(kind string, n int) {
	if n <= 0 || !gBool("goalOn") {
		return
	}
	var reached []Goal
	comEdit(func(d *Community) {
		for i := range d.Goals {
			g := &d.Goals[i]
			if !g.On || g.Kind != kind {
				continue
			}
			g.Current += n
			if g.Target > 0 && g.Current >= g.Target && !g.Done {
				g.Done = true
				if d.GoalMsg {
					reached = append(reached, *g)
				}
			}
		}
	})
	for _, g := range reached {
		live.send("goal", g)
		if bot != nil && bot.chat != nil {
			bot.chat.Say(fmt.Sprintf(tr("Ziel erreicht: %s (%d/%d)! Danke euch!", "Goal reached: %s (%d/%d)! Thank you!"), g.Title, g.Current, g.Target))
		}
	}
}

// ---------------------------------------------------------------- Chat-Befehle

func (b *Bot) handleCommunity(m ChatMsg, word, arg string, level int, uid string) bool {
	comMu.Lock()
	d := comLoad()
	comMu.Unlock()
	mod := level >= LvlMod
	say := func(s string) {
		if b.chat != nil {
			b.chat.Say(s)
		}
	}

	// Gewinnspiel
	if gBool("giveOn") {
		kw := strings.ToLower(strings.TrimSpace(d.Give.Keyword))
		if d.GiveState.Open && kw != "" && (word == kw || (!strings.ContainsAny(kw[:1], prefixChars) && strings.EqualFold(strings.TrimSpace(m.Text), kw))) {
			if level == LvlStreamer {
				return true
			}
			if d.Give.FollowOnly && level < LvlSub && !isFollower(uid) {
				return true
			}
			t := 1
			if level >= LvlSub && level != LvlMod && d.Give.SubLuck > 1 {
				t = d.Give.SubLuck
			}
			comEdit(func(c *Community) {
				for _, e := range c.GiveState.Entries {
					if e.Login == m.Login {
						return
					}
				}
				c.GiveState.Entries = append(c.GiveState.Entries, GiveEntry{m.Login, m.Display, t})
			})
			return true
		}
		if mod && matchName(word, "gewinnspiel, giveaway") {
			sub, rest, _ := strings.Cut(arg, " ")
			switch strings.ToLower(sub) {
			case "start":
				giveStart(rest)
			case "stop", "ende", "end":
				giveStop()
			case "ziehen", "draw", "roll":
				giveDraw()
			default:
				say(tr("Mods: !gewinnspiel start [Preis], !gewinnspiel ziehen, !gewinnspiel stop", "Mods: !giveaway start [prize], !giveaway draw, !giveaway stop"))
			}
			return true
		}
	}

	// Mitspieler-Warteschlange
	if gBool("queueOn") {
		q := d.Queue
		switch {
		case matchName(word, q.JoinCmd):
			if !d.QueueSt.Open {
				say(tr("Die Warteschlange ist gerade geschlossen.", "The queue is closed right now."))
				return true
			}
			note := strings.TrimSpace(arg)
			if q.NeedName && note == "" {
				say(fmt.Sprintf(tr("@%s, schreib deinen Spielernamen dazu, z. B. %s Steve123", "@%s, add your in-game name, e.g. %s Steve123"), m.Display, word))
				return true
			}
			msg := ""
			comEdit(func(c *Community) {
				for i, e := range c.QueueSt.List {
					if e.Login == m.Login {
						if note != "" {
							c.QueueSt.List[i].Note = note
						}
						msg = fmt.Sprintf(tr("@%s, du bist schon auf Platz %d.", "@%s, you are already in position %d."), m.Display, i+1)
						return
					}
				}
				for _, e := range c.QueueSt.Playing {
					if e.Login == m.Login {
						msg = fmt.Sprintf(tr("@%s, du spielst gerade schon mit.", "@%s, you are already playing."), m.Display)
						return
					}
				}
				if q.OncePer {
					for _, l := range c.QueueSt.Done {
						if l == m.Login {
							msg = fmt.Sprintf(tr("@%s, du warst heute schon dran.", "@%s, you already had your turn today."), m.Display)
							return
						}
					}
				}
				if q.Max > 0 && len(c.QueueSt.List) >= q.Max {
					msg = fmt.Sprintf(tr("@%s, die Warteschlange ist voll (%d).", "@%s, the queue is full (%d)."), m.Display, q.Max)
					return
				}
				e := QEntry{Login: m.Login, Display: m.Display, Note: note, Sub: level >= LvlSub, T: time.Now().Unix()}
				pos := len(c.QueueSt.List)
				if q.SubFirst && e.Sub {
					pos = 0
					for pos < len(c.QueueSt.List) && c.QueueSt.List[pos].Sub {
						pos++
					}
				}
				c.QueueSt.List = append(c.QueueSt.List, QEntry{})
				copy(c.QueueSt.List[pos+1:], c.QueueSt.List[pos:])
				c.QueueSt.List[pos] = e
				msg = fmt.Sprintf(tr("@%s ist auf Platz %d.", "@%s is in position %d."), m.Display, pos+1)
			})
			say(msg)
			return true
		case matchName(word, q.LeaveCmd):
			comEdit(func(c *Community) {
				out := c.QueueSt.List[:0]
				for _, e := range c.QueueSt.List {
					if e.Login != m.Login {
						out = append(out, e)
					}
				}
				c.QueueSt.List = out
			})
			return true
		case matchName(word, q.PosCmd):
			for i, e := range d.QueueSt.List {
				if e.Login == m.Login {
					say(fmt.Sprintf(tr("@%s, du bist auf Platz %d von %d.", "@%s, you are in position %d of %d."), m.Display, i+1, len(d.QueueSt.List)))
					return true
				}
			}
			say(fmt.Sprintf(tr("@%s, du stehst nicht in der Warteschlange.", "@%s, you are not in the queue."), m.Display))
			return true
		case matchName(word, q.ListCmd):
			if len(d.QueueSt.List) == 0 {
				say(tr("Die Warteschlange ist leer.", "The queue is empty."))
				return true
			}
			var names []string
			for i, e := range d.QueueSt.List {
				if i == 10 {
					names = append(names, fmt.Sprintf(tr("und %d weitere", "and %d more"), len(d.QueueSt.List)-10))
					break
				}
				names = append(names, fmt.Sprintf("%d. %s", i+1, e.Display))
			}
			say(tr("Warteschlange: ", "Queue: ") + strings.Join(names, ", "))
			return true
		case mod && matchName(word, "next, weiter"):
			n, _ := strconv.Atoi(arg)
			queueNext(n)
			return true
		case mod && matchName(word, "queueauf, queueopen"):
			queueOpen(true)
			return true
		case mod && matchName(word, "queuezu, queueclose"):
			queueOpen(false)
			return true
		}
	}

	// Sounds
	if gBool("soundOn") {
		if d.SoundCfg.ListCmd && matchName(word, "sounds") {
			var c []string
			for _, s := range d.Sounds {
				if s.On && s.Cmd != "" {
					c = append(c, string(prefixes()[0])+cleanCmd(s.Cmd))
				}
			}
			if len(c) > 0 {
				say(tr("Sounds: ", "Sounds: ") + strings.Join(c, " "))
			}
			return true
		}
		for _, s := range d.Sounds {
			if s.On && s.Cmd != "" && matchName(word, s.Cmd) {
				if levelOK(s.Level, level, uid) && playSound(s, d.SoundCfg, false) {
					id := s.ID
					go comEdit(func(c *Community) {
						for i := range c.Sounds {
							if c.Sounds[i].ID == id {
								c.Sounds[i].Uses++
							}
						}
					})
				}
				return true
			}
		}
	}

	// Ziele
	if gBool("goalOn") && matchName(word, "ziel, ziele, goal") {
		var parts []string
		for _, g := range d.Goals {
			if g.On {
				parts = append(parts, fmt.Sprintf("%s %d/%d", g.Title, g.Current, g.Target))
			}
		}
		if len(parts) > 0 {
			say(strings.Join(parts, " | "))
		}
		return true
	}
	return false
}

// soundForReward spielt den Sound zu einer Kanalpunkte-Belohnung. true = gefunden.
func soundForReward(reward string) bool {
	if !gBool("soundOn") || reward == "" {
		return false
	}
	comMu.Lock()
	d := comLoad()
	comMu.Unlock()
	for _, s := range d.Sounds {
		if s.On && s.Reward != "" && strings.EqualFold(strings.TrimSpace(s.Reward), strings.TrimSpace(reward)) {
			playSound(s, d.SoundCfg, true)
			return true
		}
	}
	return false
}

func fillGive(tpl string, g GiveCfg, title, user string) string {
	if title == "" {
		title = tr("das Gewinnspiel", "the giveaway")
	}
	return strings.NewReplacer("{title}", title, "{keyword}", g.Keyword, "{user}", user).Replace(tpl)
}

var giveTimer *time.Timer

func giveStart(title string) {
	d := comEdit(func(c *Community) {
		c.GiveState.Open = true
		c.GiveState.Title = strings.TrimSpace(title)
		c.GiveState.Started = time.Now().Unix()
		c.GiveState.Entries = []GiveEntry{}
	})
	if bot != nil && bot.chat != nil && d.Give.OpenMsg != "" {
		bot.chat.Say(fillGive(d.Give.OpenMsg, d.Give, d.GiveState.Title, ""))
	}
	if giveTimer != nil {
		giveTimer.Stop()
	}
	if d.Give.AutoMin > 0 {
		giveTimer = time.AfterFunc(time.Duration(d.Give.AutoMin)*time.Minute, func() { giveDraw() })
	}
	logEvent("alert", "giveaway – %s", d.GiveState.Title)
}

func giveStop() {
	comEdit(func(c *Community) { c.GiveState.Open = false })
	if giveTimer != nil {
		giveTimer.Stop()
	}
}

// giveDraw zieht einen Gewinner (gewichtet nach Losen) und nimmt ihn aus dem Topf.
func giveDraw() (string, error) {
	var win GiveEntry
	var d Community
	ok := false
	d = comEdit(func(c *Community) {
		total := 0
		for _, e := range c.GiveState.Entries {
			total += e.Tickets
		}
		if total == 0 {
			return
		}
		r := rand.Intn(total)
		for i, e := range c.GiveState.Entries {
			if r < e.Tickets {
				win = e
				c.GiveState.Entries = append(c.GiveState.Entries[:i], c.GiveState.Entries[i+1:]...)
				break
			}
			r -= e.Tickets
		}
		c.GiveState.Open = false
		c.GiveState.Winners = append([]string{win.Display + " – " + firstNonEmpty(c.GiveState.Title, "?") + " – " + time.Now().Format("02.01. 15:04")}, c.GiveState.Winners...)
		if len(c.GiveState.Winners) > 20 {
			c.GiveState.Winners = c.GiveState.Winners[:20]
		}
		ok = true
	})
	if !ok {
		return "", fmt.Errorf("%s", tr("Noch niemand macht mit.", "Nobody has entered yet."))
	}
	live.send("winner", map[string]any{"user": win.Display, "title": d.GiveState.Title, "names": giveNames(d)})
	if bot != nil && bot.chat != nil && d.Give.WinMsg != "" {
		bot.chat.Say(fillGive(d.Give.WinMsg, d.Give, d.GiveState.Title, win.Display))
	}
	logEvent("alert", "giveaway – %s", win.Display)
	return win.Display, nil
}

func giveNames(d Community) []string {
	n := []string{}
	for _, e := range d.GiveState.Entries {
		n = append(n, e.Display)
	}
	return n
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

func queueOpen(open bool) {
	comEdit(func(c *Community) { c.QueueSt.Open = open })
	if bot != nil && bot.chat != nil {
		d := comLoad()
		if open {
			bot.chat.Say(fmt.Sprintf(tr("Die Mitspieler-Warteschlange ist offen! Schreib %s%s, um dich anzustellen.", "The player queue is open! Type %s%s to join."), string(prefixes()[0]), cleanCmd(strings.Split(d.Queue.JoinCmd, ",")[0])))
		} else {
			bot.chat.Say(tr("Die Warteschlange ist jetzt geschlossen.", "The queue is closed now."))
		}
	}
}

// queueNext holt die nächsten n Leute aus der Warteschlange.
func queueNext(n int) []QEntry {
	if n <= 0 {
		n = 1
	}
	var got []QEntry
	d := comEdit(func(c *Community) {
		for _, e := range c.QueueSt.Playing {
			c.QueueSt.Done = append(c.QueueSt.Done, e.Login)
		}
		if n > len(c.QueueSt.List) {
			n = len(c.QueueSt.List)
		}
		got = append(got, c.QueueSt.List[:n]...)
		c.QueueSt.List = append([]QEntry{}, c.QueueSt.List[n:]...)
		c.QueueSt.Playing = got
	})
	if bot != nil && bot.chat != nil {
		if len(got) == 0 {
			bot.chat.Say(tr("Die Warteschlange ist leer.", "The queue is empty."))
		}
		for _, e := range got {
			note := ""
			if e.Note != "" {
				note = " (" + e.Note + ")"
			}
			bot.chat.Say(strings.NewReplacer("{user}", e.Display, "{note}", note).Replace(d.Queue.NextMsg))
		}
	}
	return got
}

// ---------------------------------------------------------------- API (im Fenster)

func comRoutes(mux *http.ServeMux) {
	ensureSounds()
	mux.HandleFunc("/api/live", live.serve)
	mux.HandleFunc("/api/com", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in Community
			if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
				http.Error(w, `{"error":"bad"}`, 400)
				return
			}
			comEdit(func(c *Community) {
				// Laufende Zustände (Teilnehmer, Warteschlange) kommen aus dem Chat; nur Einstellungen übernehmen
				in.GiveState, in.QueueSt = c.GiveState, c.QueueSt
				*c = in
			})
		}
		writeJSON(w, comInfo())
	})
	mux.HandleFunc("/api/com/do", func(w http.ResponseWriter, r *http.Request) {
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		var err error
		res := map[string]any{}
		switch str(m, "do", "") {
		case "giveStart":
			giveStart(str(m, "title", ""))
		case "giveStop":
			giveStop()
		case "giveDraw":
			res["winner"], err = giveDraw()
		case "giveClear":
			comEdit(func(c *Community) { c.GiveState.Entries = []GiveEntry{} })
		case "queueOpen":
			queueOpen(boolean(m, "open", true))
		case "queueNext":
			queueNext(int(num(m, "n", 1)))
		case "queueDel":
			l := str(m, "login", "")
			comEdit(func(c *Community) {
				out := []QEntry{}
				for _, e := range c.QueueSt.List {
					if e.Login != l {
						out = append(out, e)
					}
				}
				c.QueueSt.List = out
			})
		case "queueUp":
			l := str(m, "login", "")
			comEdit(func(c *Community) {
				for i, e := range c.QueueSt.List {
					if e.Login == l && i > 0 {
						c.QueueSt.List[i-1], c.QueueSt.List[i] = c.QueueSt.List[i], c.QueueSt.List[i-1]
						break
					}
				}
			})
		case "queueClear":
			comEdit(func(c *Community) {
				c.QueueSt.List = []QEntry{}
				c.QueueSt.Playing = []QEntry{}
				c.QueueSt.Done = []string{}
			})
		case "soundPlay":
			d := comLoad()
			for _, s := range d.Sounds {
				if s.ID == str(m, "id", "") {
					playSound(s, d.SoundCfg, true)
				}
			}
		case "goalSet":
			id := str(m, "id", "")
			comEdit(func(c *Community) {
				for i := range c.Goals {
					if c.Goals[i].ID == id {
						c.Goals[i].Current = int(num(m, "current", 0))
						c.Goals[i].Done = c.Goals[i].Target > 0 && c.Goals[i].Current >= c.Goals[i].Target
					}
				}
			})
		}
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), 400)
			return
		}
		res["com"] = comInfo()
		writeJSON(w, res)
	})
	// Eigene Sounddatei hochladen (als Base64 aus dem Fenster)
	mux.HandleFunc("/api/com/upload", func(w http.ResponseWriter, r *http.Request) {
		var m map[string]any
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 20<<20)).Decode(&m)
		name := filepath.Base(str(m, "name", "sound.mp3"))
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".mp3" && ext != ".wav" && ext != ".ogg" && ext != ".m4a" {
			http.Error(w, `{"error":"Nur MP3, WAV, OGG oder M4A"}`, 400)
			return
		}
		data := str(m, "data", "")
		if i := strings.Index(data, ","); i >= 0 {
			data = data[i+1:]
		}
		b, err := base64.StdEncoding.DecodeString(data)
		if err != nil || len(b) == 0 {
			http.Error(w, `{"error":"Datei leer"}`, 400)
			return
		}
		file := kit.RandID(6) + ext
		_ = os.MkdirAll(soundDir(), 0o755)
		if err := os.WriteFile(filepath.Join(soundDir(), file), b, 0o644); err != nil {
			http.Error(w, `{"error":"Speichern fehlgeschlagen"}`, 500)
			return
		}
		writeJSON(w, map[string]any{"file": file})
	})
	mux.HandleFunc("/api/com/snd/", sndServe)
}

func sndServe(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	if name == "." || name == "/" || strings.HasPrefix(name, ".") {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(soundDir(), name))
}

func comInfo() map[string]any {
	comMu.Lock()
	d := comLoad()
	comMu.Unlock()
	return map[string]any{"com": d, "overlay": overlayBase()}
}

// ---------------------------------------------------------------- Overlay-Server für OBS

var overlayAddr string

func overlayKey() string {
	k := cfg.Str("overlayKey", "")
	if k == "" {
		k = kit.RandID(10)
		cfg.Set("overlayKey", k)
	}
	return k
}

func overlayBase() string {
	if overlayAddr == "" {
		return ""
	}
	return "http://" + overlayAddr + "/o/" + overlayKey() + "/"
}

// startOverlay öffnet eine feste lokale Adresse, die man in OBS als Browserquelle einträgt.
func startOverlay(web fs.FS) {
	key := overlayKey()
	mux := http.NewServeMux()
	pre := "/o/" + key + "/"
	mux.HandleFunc(pre, func(w http.ResponseWriter, r *http.Request) {
		rest := strings.TrimPrefix(r.URL.Path, pre)
		switch {
		case rest == "" || rest == "index.html":
			b, _ := fs.ReadFile(web, "overlay.html")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(b)
		case rest == "live":
			live.serve(w, r)
		case rest == "state":
			comMu.Lock()
			d := comLoad()
			comMu.Unlock()
			writeJSON(w, map[string]any{"goals": d.Goals, "give": d.GiveState, "giveCfg": d.Give, "queue": d.QueueSt, "lang": map[bool]string{true: "de", false: "en"}[isDE()],
				"on": map[string]bool{"give": gBool("giveOn"), "queue": gBool("queueOn"), "sound": gBool("soundOn"), "goal": gBool("goalOn")}})
		case strings.HasPrefix(rest, "snd/"):
			sndServe(w, r)
		default:
			http.NotFound(w, r)
		}
	})
	for p := 17345; p < 17355; p++ {
		ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(p))
		if err == nil {
			overlayAddr = ln.Addr().String()
			go http.Serve(ln, mux)
			return
		}
	}
}

package main

// TTS: Warteschlange, Filter und die natürlichen Edge-Stimmen.
// Abgespielt wird im App-Fenster (Windows-Stimmen über speechSynthesis, natürliche Stimmen als MP3).

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type TTSItem struct {
	ID    int64   `json:"id"`
	Text  string  `json:"text"`
	Voice string  `json:"voice"`
	Rate  float64 `json:"rate"`
	Pitch float64 `json:"pitch"`
	Vol   float64 `json:"volume"`
	Pause float64 `json:"pause"`
}

type TTSQueue struct {
	mu       sync.Mutex
	items    []TTSItem
	next     int64
	wake     chan struct{}
	skipSeq  int64
	lastUser map[string]time.Time
	Playing  *TTSItem
	audio    map[int64][]byte
}

var tts = &TTSQueue{wake: make(chan struct{}, 1), lastUser: map[string]time.Time{}, audio: map[int64][]byte{}}

func ttsCfg() map[string]any {
	m := cfg.Section("tts")
	for k, v := range TTSDefaults {
		if _, ok := m[k]; !ok {
			m[k] = v
		}
	}
	return m
}

type srcCfg struct {
	On       bool
	Level    int
	ReadName bool
	Voice    string
}

func ttsSource(key string) srcCfg {
	stored := sub(sub(cfg.Section("tts"), "sources"), key)
	for _, d := range TTSSources {
		if d.Key == key {
			return srcCfg{boolean(stored, "on", d.On), int(num(stored, "level", float64(d.Level))),
				boolean(stored, "readName", d.ReadName), str(stored, "voice", d.Voice)}
		}
	}
	return srcCfg{}
}

func (q *TTSQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}

func (q *TTSQueue) Push(text, voice string, extra int) bool {
	c := ttsCfg()
	if voice == "" {
		voice = str(c, "voice", "")
	}
	q.mu.Lock()
	if len(q.items) >= int(num(c, "maxQueue", 15))+extra {
		q.mu.Unlock()
		return false
	}
	q.next++
	q.items = append(q.items, TTSItem{ID: q.next, Text: text, Voice: voice, Rate: num(c, "rate", 0), Pitch: num(c, "pitch", 0),
		Vol: num(c, "volume", 80), Pause: num(c, "pauseMs", 400)})
	q.mu.Unlock()
	select {
	case q.wake <- struct{}{}:
	default:
	}
	return true
}

// Next wartet bis zu 20 s auf die nächste Nachricht (Long-Polling vom App-Fenster).
// Bricht die Anfrage ab (Fenster neu geladen/geschlossen), bevor sie raus ist, geht keine Nachricht verloren.
func (q *TTSQueue) Next(done <-chan struct{}) *TTSItem {
	deadline := time.After(20 * time.Second)
	for {
		q.mu.Lock()
		if len(q.items) > 0 {
			it := q.items[0]
			q.items = q.items[1:]
			q.Playing = &it
			q.mu.Unlock()
			return &it
		}
		q.Playing = nil
		q.mu.Unlock()
		select {
		case <-q.wake:
		case <-deadline:
			return nil
		case <-done:
			return nil
		}
	}
}

// Requeue legt eine nicht abgespielte Nachricht wieder vorne in die Warteschlange.
func (q *TTSQueue) Requeue(it TTSItem) {
	q.mu.Lock()
	q.items = append([]TTSItem{it}, q.items...)
	if q.Playing != nil && q.Playing.ID == it.ID {
		q.Playing = nil
	}
	q.mu.Unlock()
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

func (q *TTSQueue) Skip() {
	q.mu.Lock()
	q.skipSeq++
	q.mu.Unlock()
}

func (q *TTSQueue) Clear() {
	q.mu.Lock()
	q.items = nil
	q.skipSeq++
	q.mu.Unlock()
}

func (q *TTSQueue) SkipSeq() int64 {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.skipSeq
}

// ---------------------------------------------------------------- Nachrichten annehmen

func ignoredUsers(c map[string]any) map[string]bool {
	out := map[string]bool{}
	for _, u := range strings.Split(str(c, "ignoredUsers", ""), ",") {
		u = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(u)), "@")
		if u != "" {
			out[u] = true
		}
	}
	return out
}

// Handle: source = chat | command | points. Rückgabe: ok | full | off | ""
func (q *TTSQueue) Handle(source, login, display string, level int, uid, text string, tags map[string]string, stripFirst bool) string {
	c := ttsCfg()
	if !boolean(c, "enabled", false) {
		return "off"
	}
	s := ttsSource(source)
	if !s.On {
		return "off"
	}
	if ignoredUsers(c)[strings.ToLower(login)] {
		return ""
	}
	if !levelOK(s.Level, level, uid) {
		return ""
	}
	if source == "chat" && boolean(c, "ignoreCommands", true) && text != "" && strings.ContainsRune(prefixChars, []rune(text)[0]) {
		return ""
	}
	cd := num(c, "cooldown", 0)
	q.mu.Lock()
	last := q.lastUser[login]
	q.mu.Unlock()
	if cd > 0 && source != "points" && level < LvlMod && time.Since(last) < time.Duration(cd)*time.Second {
		return ""
	}
	clean := CleanText(c, text, tags, stripFirst)
	if clean == "" {
		return ""
	}
	q.mu.Lock()
	q.lastUser[login] = time.Now()
	q.mu.Unlock()
	if s.ReadName {
		clean = fill(str(c, "nameFormat", "{user}: {text}"), map[string]string{"user": display, "text": clean})
	}
	logEvent("tts", "%s", clean)
	if q.Push(clean, s.Voice, 0) {
		return "ok"
	}
	return "full"
}

// Alert: liest standardmäßig nur die Nachricht des Zuschauers vor.
func (q *TTSQueue) Alert(kind string, vars map[string]string, tags map[string]string) bool {
	a := alertCfg(kind)
	if !a.On || !boolean(cfg.Section("alerts"), "enabled", false) {
		return false
	}
	c := ttsCfg()
	if ignoredUsers(c)[strings.ToLower(vars["login"])] {
		return false
	}
	amount := vars["bits"]
	if amount == "" {
		amount = vars["viewers"]
	}
	if a.Min > 0 {
		if n, _ := strconv.Atoi(amount); n < a.Min {
			return false
		}
	}
	if m, ok := vars["message"]; ok {
		vars["message"] = CleanText(c, m, tags, false)
		if strings.Contains(a.Text, "{message}") && vars["message"] == "" {
			return false
		}
	}
	text := strings.Join(strings.Fields(fill(a.Text, vars)), " ")
	if text != "" {
		logEvent("alert", "%s: %s", kind, text)
		return q.Push(text, a.Voice, 10)
	}
	return false
}

type alertC struct {
	On    bool
	Text  string
	Min   int
	Voice string
}

func alertCfg(kind string) alertC {
	st := sub(cfg.Section("alerts"), kind)
	for _, d := range Alerts {
		if d.Key == kind {
			return alertC{boolean(st, "on", d.On), str(st, "text", d.Text), int(num(st, "min", float64(d.Min))), str(st, "voice", d.Voice)}
		}
	}
	return alertC{}
}

func fill(tpl string, vars map[string]string) string {
	return regexp.MustCompile(`\{(\w+)\}`).ReplaceAllStringFunc(tpl, func(m string) string {
		return vars[m[1:len(m)-1]]
	})
}

// ---------------------------------------------------------------- Filter

var (
	reURL     = regexp.MustCompile(`https?://\S+`)
	reMention = regexp.MustCompile(`@(\w+)`)
	reCheer   = regexp.MustCompile(`\b[A-Za-z]+\d+\b`)
	reSpaces  = regexp.MustCompile(`\s+`)
	reWord    = regexp.MustCompile(`\pL|\pN`)
)

func collapseRepeats(s string) string {
	// gleiche Zeichen: max. 3 hintereinander
	var b strings.Builder
	var prev rune
	n := 0
	for _, r := range s {
		if r == prev {
			n++
		} else {
			prev, n = r, 1
		}
		if n <= 3 {
			b.WriteRune(r)
		}
	}
	s = b.String()
	// gleiche kurze Silben (hahahaha) und Wörter (lol lol lol): max. 3 bzw. 2
	for size := 2; size <= 4; size++ {
		rs := []rune(s)
		var out []rune
		for i := 0; i < len(rs); {
			if i+size*4 <= len(rs) {
				unit := string(rs[i : i+size])
				if reWord.MatchString(unit) {
					j := i
					cnt := 0
					for j+size <= len(rs) && strings.EqualFold(string(rs[j:j+size]), unit) {
						j += size
						cnt++
					}
					if cnt >= 4 {
						for k := 0; k < 3; k++ {
							out = append(out, []rune(unit)...)
						}
						i = j
						continue
					}
				}
			}
			out = append(out, rs[i])
			i++
		}
		s = string(out)
	}
	words := strings.Fields(s)
	var keep []string
	for i, w := range words {
		if i >= 2 && strings.EqualFold(w, words[i-1]) && strings.EqualFold(w, words[i-2]) {
			continue
		}
		keep = append(keep, w)
	}
	return strings.Join(keep, " ")
}

func badWords() []map[string]any {
	t := cfg.Section("tts")
	if l, ok := t["words"].([]any); ok {
		var out []map[string]any
		for _, x := range l {
			if m, ok := x.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	var out []map[string]any
	for _, w := range DefaultBadWords {
		out = append(out, map[string]any{"w": w, "on": true})
	}
	return out
}

func CleanText(c map[string]any, text string, tags map[string]string, stripFirst bool) string {
	if boolean(c, "emotes", true) && tags["emotes"] != "" {
		type rg struct{ a, b int }
		var rs []rg
		for _, part := range strings.Split(tags["emotes"], "/") {
			_, pos, _ := strings.Cut(part, ":")
			for _, r := range strings.Split(pos, ",") {
				a, b, ok := strings.Cut(r, "-")
				if ok {
					ai, _ := strconv.Atoi(a)
					bi, _ := strconv.Atoi(b)
					rs = append(rs, rg{ai, bi})
				}
			}
		}
		sort.Slice(rs, func(i, j int) bool { return rs[i].a > rs[j].a })
		runes := []rune(text)
		for _, r := range rs {
			if r.a >= 0 && r.b < len(runes) && r.a <= r.b {
				runes = append(append(append([]rune{}, runes[:r.a]...), ' '), runes[r.b+1:]...)
			}
		}
		text = string(runes)
	}
	if stripFirst {
		_, rest, _ := strings.Cut(strings.TrimSpace(text), " ")
		text = rest
	}
	if tags["bits"] != "" {
		text = reCheer.ReplaceAllString(text, " ")
	}
	if boolean(c, "links", true) {
		text = reURL.ReplaceAllString(text, " Link ")
	} else {
		text = reURL.ReplaceAllString(text, " ")
	}
	text = reMention.ReplaceAllString(text, "$1")
	if boolean(c, "collapse", true) {
		text = collapseRepeats(text)
	}
	for _, pair := range strings.Split(str(c, "replacements", ""), ",") {
		a, b, ok := strings.Cut(pair, "=")
		a = strings.TrimSpace(a)
		if !ok || a == "" {
			continue
		}
		re, err := regexp.Compile(`(?i)(^|[^\pL\pN])` + regexp.QuoteMeta(a) + `($|[^\pL\pN])`)
		if err == nil {
			text = re.ReplaceAllString(text, "${1}"+strings.TrimSpace(b)+"${2}")
		}
	}
	if boolean(c, "filterOn", true) {
		for _, e := range badWords() {
			w := strings.TrimSpace(str(e, "w", ""))
			if w == "" || !boolean(e, "on", true) {
				continue
			}
			pat := `(?i)` + regexp.QuoteMeta(w)
			if len([]rune(w)) <= 4 { // kurze Wörter nur allein, sonst trifft es harmlose Wörter
				pat = `(?i)(^|[^\pL\pN])` + regexp.QuoteMeta(w) + `($|[^\pL\pN])`
			}
			re := regexp.MustCompile(pat)
			if re.MatchString(text) {
				if boolean(c, "blockWhole", false) {
					return ""
				}
				if len([]rune(w)) <= 4 {
					text = re.ReplaceAllString(text, "${1}piep${2}")
				} else {
					text = re.ReplaceAllString(text, "piep")
				}
			}
		}
	}
	text = strings.TrimSpace(reSpaces.ReplaceAllString(text, " "))
	mx := int(num(c, "maxChars", 200))
	if r := []rune(text); mx > 0 && len(r) > mx {
		cut := string(r[:mx])
		if i := strings.LastIndex(cut, " "); i > mx/2 {
			cut = cut[:i]
		}
		text = cut + " …"
	}
	if !reWord.MatchString(text) {
		return ""
	}
	return text
}

// ---------------------------------------------------------------- Natürliche Stimmen (Microsoft Edge, kostenlos)

const edgeTrusted = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
const edgeChromium = "143.0.3650.75"

// edgeSkew gleicht eine falsch gehende PC-Uhr aus (Microsoft lehnt sonst mit 403 ab).
var edgeSkew int64

func edgeVoiceName(short string) string {
	p := strings.SplitN(short, "-", 3)
	if len(p) < 3 {
		return short
	}
	return fmt.Sprintf("Microsoft Server Speech Text to Speech Voice (%s-%s, %s)", p[0], p[1], p[2])
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// EdgeSynth holt die Sprachausgabe; bei 403 (PC-Uhr geht falsch) oder einem Verbindungsfehler ein zweiter Versuch.
func EdgeSynth(text, voice string, rate, pitch, volume float64) ([]byte, error) {
	b, err := edgeSynth(text, voice, rate, pitch, volume)
	if err != nil {
		var se *wsStatusErr
		if errors.As(err, &se) && se.Code == 403 && se.Date != "" {
			if st, e := http.ParseTime(se.Date); e == nil {
				edgeSkew = st.Unix() - time.Now().Unix()
			}
		}
		time.Sleep(300 * time.Millisecond)
		b, err = edgeSynth(text, voice, rate, pitch, volume)
	}
	return b, err
}

func edgeSynth(text, voice string, rate, pitch, volume float64) ([]byte, error) {
	t := time.Now().Unix() + edgeSkew + 11644473600
	t -= t % 300
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d%s", t*10000000, edgeTrusted)))
	gec := strings.ToUpper(hex.EncodeToString(sum[:]))
	u := "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" + edgeTrusted +
		"&Sec-MS-GEC=" + gec + "&Sec-MS-GEC-Version=1-" + edgeChromium + "&ConnectionId=" + randHex(16)
	major := strings.SplitN(edgeChromium, ".", 2)[0]
	c, err := wsDial(u, map[string]string{
		"Pragma": "no-cache", "Cache-Control": "no-cache",
		"Origin":          "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
		"User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + major + ".0.0.0 Safari/537.36 Edg/" + major + ".0.0.0",
		"Accept-Language": "en-US,en;q=0.9",
		"Cookie":          "muid=" + strings.ToUpper(randHex(16)) + ";",
	})
	if err != nil {
		return nil, err
	}
	defer c.Close()
	ts := time.Now().UTC().Format("Mon Jan 02 2006 15:04:05 GMT+0000 (Coordinated Universal Time)")
	if err := c.WriteText("X-Timestamp:" + ts + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
		`{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}` + "\r\n"); err != nil {
		return nil, err
	}
	ssml := fmt.Sprintf(`<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='%s'><prosody pitch='%+dHz' rate='%+d%%' volume='%+d%%'>%s</prosody></voice></speak>`,
		edgeVoiceName(voice), int(pitch*5), int(rate*10), 0, html.EscapeString(text))
	if err := c.WriteText("X-RequestId:" + randHex(16) + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + ts + "Z\r\nPath:ssml\r\n\r\n" + ssml); err != nil {
		return nil, err
	}
	var audio []byte
	c.SetReadDeadline(time.Now().Add(30 * time.Second))
	for {
		data, isText, err := c.Read()
		if err != nil {
			if len(audio) > 0 {
				return audio, nil
			}
			return nil, err
		}
		if isText {
			if strings.Contains(string(data), "Path:turn.end") {
				break
			}
			continue
		}
		if len(data) < 2 {
			continue
		}
		hl := int(binary.BigEndian.Uint16(data[:2]))
		if 2+hl > len(data) {
			continue
		}
		if strings.Contains(string(data[2:2+hl]), "Path:audio") {
			audio = append(audio, data[2+hl:]...)
		}
	}
	if len(audio) < 200 {
		return nil, errors.New("no audio")
	}
	return audio, nil
}

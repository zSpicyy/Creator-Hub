package main

// Standardwerte. Alles, was der Nutzer ändert, wird nur als Abweichung gespeichert –
// der rote ↺-Pfeil löscht die Abweichung und der Standard gilt wieder.

const (
	LvlAll = iota
	LvlFollower
	LvlSub
	LvlVIP
	LvlMod
	LvlStreamer
)

type CmdDef struct {
	Key   string `json:"key"`
	Names string `json:"names"`
	Level int    `json:"level"`
	On    bool   `json:"on"`
	Group string `json:"group"` // music | tts | mod
}

var DefaultCommands = []CmdDef{
	{"sr", "sr, songrequest", LvlAll, true, "music"},
	{"song", "song, np, currentsong", LvlAll, true, "music"},
	{"queue", "queue, q", LvlAll, true, "music"},
	{"wrongsong", "wrongsong", LvlAll, true, "music"},
	{"voteskip", "voteskip", LvlAll, true, "music"},
	{"skip", "skip", LvlMod, true, "music"},
	{"lastsong", "lastsong", LvlAll, false, "music"},
	{"mysongs", "mysongs", LvlAll, false, "music"},
	{"srhelp", "srhelp", LvlAll, false, "music"},
	{"sron", "sron", LvlMod, false, "mod"},
	{"sroff", "sroff", LvlMod, false, "mod"},
	{"volume", "volume", LvlMod, false, "mod"},
	{"srblock", "srblock", LvlMod, false, "mod"},
	{"srunblock", "srunblock", LvlMod, false, "mod"},
	{"clearqueue", "clearqueue", LvlMod, false, "mod"},
	{"tts", "tts", LvlAll, true, "tts"},
	{"ttsskip", "ttsskip", LvlMod, true, "tts"},
	{"ttsclear", "ttsclear", LvlMod, false, "tts"},
	{"ttson", "ttson", LvlMod, false, "tts"},
	{"ttsoff", "ttsoff", LvlMod, false, "tts"},
}

var DefaultRepliesEN = map[string]string{
	"sr_added":         "@{user} added “{song}” by {artist} (#{pos} in queue).",
	"sr_notfound":      "@{user} couldn't find that song on Spotify.",
	"sr_limit":         "@{user} you already have {limit} song(s) in the queue.",
	"sr_duplicate":     "@{user} “{song}” is already in the queue.",
	"sr_toolong":       "@{user} “{song}” is too long (max {max} min).",
	"sr_off":           "@{user} song requests are off right now.",
	"sr_usage":         "@{user} usage: {cmd} song name or link",
	"sr_blocked":       "@{user} you can't request songs right now.",
	"no_device":        "@{user} Spotify isn't playing right now.",
	"no_spotify":       "@{user} Spotify isn't connected.",
	"voteskip":         "@{user} voted to skip: {votes}/{needed}",
	"voteskip_done":    "{votes}/{needed} – skipping “{song}”.",
	"voteskip_already": "@{user} you already voted ({votes}/{needed}).",
	"skip":             "@{user} skipped “{song}”.",
	"song":             "Now playing: “{song}” by {artist}{by}",
	"nothing":          "Nothing is playing right now.",
	"lastsong":         "Previous song: “{song}” by {artist}",
	"queue":            "Queue ({count}): {list}",
	"queue_empty":      "The queue is empty. Request a song with {cmd}!",
	"mysongs":          "@{user} your requests: {list}",
	"mysongs_none":     "@{user} you have no open requests.",
	"wrongsong":        "@{user} “{song}” will be skipped when it comes up.",
	"wrongsong_none":   "@{user} you have no song in the queue.",
	"srhelp":           "Commands: {list}",
	"sron":             "Song requests are on! Use {cmd}",
	"sroff":            "Song requests are off.",
	"volume":           "Volume: {volume}%",
	"volume_usage":     "@{user} usage: {cmd} 0-100",
	"block":            "@{target} can no longer request songs.",
	"unblock":          "@{target} can request songs again.",
	"target_usage":     "@{user} usage: {cmd} name",
	"clearqueue":       "Skipping all open requests ({count}).",
	"error":            "@{user} something went wrong: {error}",
	"tts_disabled":     "@{user} TTS is off right now.",
	"tts_usage":        "@{user} usage: {cmd} text",
	"tts_full":         "@{user} the TTS queue is full, try again in a moment.",
	"ttsskip":          "TTS skipped.",
	"ttsclear":         "TTS queue cleared.",
	"ttson":            "TTS is on.",
	"ttsoff":           "TTS is off.",
}

var DefaultRepliesDE = map[string]string{
	"sr_added":         "@{user} „{song}“ von {artist} ist in der Warteschlange (Platz {pos}).",
	"sr_notfound":      "@{user} dazu habe ich keinen Song auf Spotify gefunden.",
	"sr_limit":         "@{user} du hast schon {limit} Song(s) in der Warteschlange.",
	"sr_duplicate":     "@{user} „{song}“ ist schon in der Warteschlange.",
	"sr_toolong":       "@{user} „{song}“ ist zu lang (max. {max} Min.).",
	"sr_off":           "@{user} Songwünsche sind gerade aus.",
	"sr_usage":         "@{user} so geht's: {cmd} Songname oder Link",
	"sr_blocked":       "@{user} du darfst gerade keine Songs wünschen.",
	"no_device":        "@{user} Spotify spielt gerade nichts ab.",
	"no_spotify":       "@{user} Spotify ist nicht verbunden.",
	"voteskip":         "@{user} hat für Skip gestimmt: {votes}/{needed}",
	"voteskip_done":    "{votes}/{needed} – „{song}“ wird übersprungen.",
	"voteskip_already": "@{user} du hast schon abgestimmt ({votes}/{needed}).",
	"skip":             "@{user} hat „{song}“ übersprungen.",
	"song":             "Gerade läuft: „{song}“ von {artist}{by}",
	"nothing":          "Gerade läuft nichts.",
	"lastsong":         "Davor lief: „{song}“ von {artist}",
	"queue":            "Warteschlange ({count}): {list}",
	"queue_empty":      "Die Warteschlange ist leer. Wünsch dir was mit {cmd}!",
	"mysongs":          "@{user} deine Wünsche: {list}",
	"mysongs_none":     "@{user} du hast keine offenen Wünsche.",
	"wrongsong":        "@{user} „{song}“ wird übersprungen, wenn er drankommt.",
	"wrongsong_none":   "@{user} du hast keinen Song in der Warteschlange.",
	"srhelp":           "Befehle: {list}",
	"sron":             "Songwünsche sind an! Mit {cmd}",
	"sroff":            "Songwünsche sind aus.",
	"volume":           "Lautstärke: {volume} %",
	"volume_usage":     "@{user} so geht's: {cmd} 0-100",
	"block":            "@{target} darf keine Songs mehr wünschen.",
	"unblock":          "@{target} darf wieder Songs wünschen.",
	"target_usage":     "@{user} so geht's: {cmd} Name",
	"clearqueue":       "Alle offenen Wünsche ({count}) werden übersprungen.",
	"error":            "@{user} da ist etwas schiefgelaufen: {error}",
	"tts_disabled":     "@{user} TTS ist gerade aus.",
	"tts_usage":        "@{user} so geht's: {cmd} Text",
	"tts_full":         "@{user} die TTS-Warteschlange ist voll, versuch es gleich nochmal.",
	"ttsskip":          "TTS übersprungen.",
	"ttsclear":         "TTS-Warteschlange geleert.",
	"ttson":            "TTS ist an.",
	"ttsoff":           "TTS ist aus.",
}

// TTS-Grundeinstellungen
var TTSDefaults = map[string]any{
	"enabled":        false,
	"voice":          "de-DE-KatjaNeural", // Neural = natürliche Stimme, sonst Windows-Stimme
	"rate":           0.0,                 // -10..10
	"pitch":          0.0,                 // -10..10
	"volume":         80.0,                // 0..100
	"rewardName":     "",
	"nameFormat":     "{user}: {text}",
	"maxChars":       200.0,
	"maxQueue":       15.0,
	"cooldown":       0.0,
	"pauseMs":        400.0,
	"links":          true,
	"emotes":         true,
	"ignoreCommands": true,
	"collapse":       true,
	"ignoredUsers":   "nightbot, streamelements, streamlabs, moobot, fossabot, wizebot, soundalerts",
	"filterOn":       true,
	"blockWhole":     false,
	"replacements":   "gg=good game, afk=a f k, brb=be right back",
}

type SourceDef struct {
	Key      string `json:"key"`
	On       bool   `json:"on"`
	Level    int    `json:"level"`
	ReadName bool   `json:"readName"`
	Voice    string `json:"voice"`
}

var TTSSources = []SourceDef{
	{"chat", false, LvlAll, true, ""},
	{"command", true, LvlAll, true, ""},
	{"points", true, LvlAll, true, ""},
}

// Alerts: Standard = nur das vorlesen, was der Zuschauer selbst dazugeschrieben hat.
type AlertDef struct {
	Key    string `json:"key"`
	On     bool   `json:"on"`
	Text   string `json:"text"`
	Min    int    `json:"min"`
	Voice  string `json:"voice"`
	HasMsg bool   `json:"hasMsg"`
	Vars   string `json:"vars"`
}

var Alerts = []AlertDef{
	{"bits", true, "{message}", 1, "", true, "{user} {bits} {message}"},
	{"sub", true, "{message}", 0, "", true, "{user} {message}"},
	{"resub", true, "{message}", 0, "", true, "{user} {months} {message}"},
	{"points", false, "{message}", 0, "", true, "{user} {reward} {message}"},
	{"follow", false, "{user}", 0, "", false, "{user}"},
	{"subgift", false, "{user} → {target}", 0, "", false, "{user} {target}"},
	{"giftbomb", false, "{user}: {count}", 0, "", false, "{user} {count}"},
	{"raid", false, "{user}: {viewers}", 1, "", false, "{user} {viewers}"},
}

var DefaultBadWords = []string{"hurensohn", "wichser", "fotze", "missgeburt", "spast", "schwuchtel",
	"nigger", "neger", "kanake", "heil hitler", "sieg heil", "kys", "faggot", "retard"}

var EdgeVoices = []string{
	"de-DE-KatjaNeural", "de-DE-ConradNeural", "de-DE-AmalaNeural", "de-DE-KillianNeural",
	"de-DE-SeraphinaMultilingualNeural", "de-DE-FlorianMultilingualNeural",
	"de-AT-IngridNeural", "de-AT-JonasNeural", "de-CH-LeniNeural", "de-CH-JanNeural",
	"en-US-AriaNeural", "en-US-GuyNeural", "en-US-JennyNeural", "en-US-AndrewMultilingualNeural",
	"en-US-AvaMultilingualNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural",
}

var GeneralDefaults = map[string]any{
	"cmdPrefix":     "!",
	"autoStart":     true,
	"chatLang":      "",
	"srOn":          true,
	"srFeat":        true,
	"cmdOn":         true,
	"ownOn":         true,
	"timerOn":       true,
	"extraOn":       true,
	"srLimit":       2.0,
	"voteNeeded":    5.0,
	"maxMinutes":    8.0,
	"modsUnlimited": true,
	"blocked":       []any{},
}

func generalGet(k string) any {
	if v := cfg.Get(k); v != nil {
		return v
	}
	return GeneralDefaults[k]
}

func gStr(k string) string {
	if v, ok := generalGet(k).(string); ok {
		return v
	}
	return ""
}

func gNum(k string) float64 {
	if v, ok := generalGet(k).(float64); ok {
		return v
	}
	return 0
}

func gBool(k string) bool {
	if v, ok := generalGet(k).(bool); ok {
		return v
	}
	return false
}

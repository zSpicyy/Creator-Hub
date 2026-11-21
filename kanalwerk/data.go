package main

// Alle Daten von Kanalwerk liegen in einer Datei (daten.json) im eigenen Konfigurationsordner
// und bleiben bei Updates erhalten.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type YTAuth struct {
	ClientID    string `json:"clientId"`
	Secret      string `json:"secret"`
	Access      string `json:"access"`
	Refresh     string `json:"refresh"`
	Expiry      int64  `json:"expiry"`
	ChannelID   string `json:"channelId"`
	ChannelName string `json:"channelName"`
	Avatar      string `json:"avatar"`
	UploadsPL   string `json:"uploadsPl"`
}

type TWAuth struct {
	ClientID string `json:"clientId"`
	Access   string `json:"access"`
	Refresh  string `json:"refresh"`
	Expiry   int64  `json:"expiry"`
	UserID   string `json:"userId"`
	Login    string `json:"login"`
	Name     string `json:"name"`
	Avatar   string `json:"avatar"`
}

type Upload struct {
	ID        string  `json:"id"`
	File      string  `json:"file"`
	Thumb     string  `json:"thumb"`
	Title     string  `json:"title"`
	Desc      string  `json:"desc"`
	Tags      string  `json:"tags"`
	Category  string  `json:"category"`
	Privacy   string  `json:"privacy"`   // public | unlisted | private
	PublishAt int64   `json:"publishAt"` // Unix-Sekunden; 0 = sofort
	Kids      bool    `json:"kids"`
	Status    string  `json:"status"` // wait | uploading | done | error
	Progress  float64 `json:"progress"`
	Error     string  `json:"error"`
	VideoID   string  `json:"videoId"`
	Created   int64   `json:"created"`
}

type CalEvent struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Kind  string `json:"kind"` // stream | video | idea | other
	At    int64  `json:"at"`
	Note  string `json:"note"`
}

type Snap struct {
	Day         string `json:"day"`
	YTSubs      int64  `json:"ytSubs"`
	YTViews     int64  `json:"ytViews"`
	YTVideos    int64  `json:"ytVideos"`
	TWFollowers int64  `json:"twFollowers"`
}

type RSnap struct {
	Day   string `json:"day"`
	Subs  int64  `json:"subs"`
	Views int64  `json:"views"`
}

type Rival struct {
	ID     string  `json:"id"`
	Kind   string  `json:"kind"` // yt | tw
	Handle string  `json:"handle"`
	Name   string  `json:"name"`
	Avatar string  `json:"avatar"`
	Ext    string  `json:"ext"` // Kanal- bzw. Nutzer-ID
	Error  string  `json:"error"`
	Snaps  []RSnap `json:"snaps"`
}

type LinkBtn struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

type LinkPage struct {
	Name    string    `json:"name"`
	Bio     string    `json:"bio"`
	Avatar  string    `json:"avatar"`
	Theme   string    `json:"theme"`
	Buttons []LinkBtn `json:"buttons"`
}

type Announce struct {
	VideoOn      bool     `json:"videoOn"`
	VideoDiscord bool     `json:"videoDiscord"`
	VideoTwitch  bool     `json:"videoTwitch"`
	VideoMsg     string   `json:"videoMsg"`
	LiveOn       bool     `json:"liveOn"`
	LiveMsg      string   `json:"liveMsg"`
	Discord      string   `json:"discord"`
	LastVideo    string   `json:"lastVideo"`
	WasLive      bool     `json:"wasLive"`
	Log          []string `json:"log"`
}

type Video struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Thumb     string `json:"thumb"`
	Published int64  `json:"published"`
	PublishAt int64  `json:"publishAt"` // geplant (privat bis dahin)
	Privacy   string `json:"privacy"`
	Views     int64  `json:"views"`
	Likes     int64  `json:"likes"`
	Comments  int64  `json:"comments"`
	Duration  string `json:"duration"`
}

type VOD struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Created int64  `json:"created"`
	Views   int64  `json:"views"`
	Dur     string `json:"dur"`
	Thumb   string `json:"thumb"`
}

type DayStat struct {
	Day     string `json:"day"`
	Views   int64  `json:"views"`
	Minutes int64  `json:"minutes"`
	SubsIn  int64  `json:"subsIn"`
	SubsOut int64  `json:"subsOut"`
}

type Data struct {
	YT       YTAuth           `json:"yt"`
	TW       TWAuth           `json:"tw"`
	Uploads  []Upload         `json:"uploads"`
	Events   []CalEvent       `json:"events"`
	Snaps    []Snap           `json:"snaps"`
	Rivals   []Rival          `json:"rivals"`
	Link     LinkPage         `json:"link"`
	Ann      Announce         `json:"ann"`
	Videos   []Video          `json:"videos"`
	VODs     []VOD            `json:"vods"`
	Days     []DayStat        `json:"days"`
	Stats    map[string]int64 `json:"stats"` // aktuelle Zahlen
	Fetched  int64            `json:"fetched"`
	TourDone bool             `json:"tourDone"`
}

var (
	dmu     sync.Mutex
	D       = &Data{}
	dataDir string
)

func defaults(d *Data) {
	de := isDE()
	pick := func(a, b string) string {
		if de {
			return a
		}
		return b
	}
	if d.Ann.VideoMsg == "" {
		d.Ann.VideoMsg = pick("Neues Video ist online: {title} {url}", "New video is out: {title} {url}")
	}
	if d.Ann.LiveMsg == "" {
		d.Ann.LiveMsg = pick("Ich bin jetzt live: {title} ({game}) {url}", "I'm live now: {title} ({game}) {url}")
	}
	if d.Link.Theme == "" {
		d.Link.Theme = "sunset"
	}
	if d.Link.Buttons == nil {
		d.Link.Buttons = []LinkBtn{{"YouTube", "https://youtube.com/"}, {"Twitch", "https://twitch.tv/"}, {"Discord", "https://discord.gg/"}}
	}
	for _, p := range []*[]Upload{&d.Uploads} {
		if *p == nil {
			*p = []Upload{}
		}
	}
	if d.Events == nil {
		d.Events = []CalEvent{}
	}
	if d.Snaps == nil {
		d.Snaps = []Snap{}
	}
	if d.Rivals == nil {
		d.Rivals = []Rival{}
	}
	if d.Videos == nil {
		d.Videos = []Video{}
	}
	if d.VODs == nil {
		d.VODs = []VOD{}
	}
	if d.Days == nil {
		d.Days = []DayStat{}
	}
	if d.Stats == nil {
		d.Stats = map[string]int64{}
	}
	if d.Ann.Log == nil {
		d.Ann.Log = []string{}
	}
}

func loadData() {
	dmu.Lock()
	defer dmu.Unlock()
	b, err := os.ReadFile(filepath.Join(dataDir, "daten.json"))
	if err == nil {
		_ = json.Unmarshal(b, D)
	}
	defaults(D)
}

// edit ändert die Daten unter Sperre und speichert sie danach.
func edit(f func(d *Data)) {
	dmu.Lock()
	f(D)
	b, _ := json.MarshalIndent(D, "", " ")
	dmu.Unlock()
	tmp := filepath.Join(dataDir, "daten.json.tmp")
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, filepath.Join(dataDir, "daten.json"))
	}
}

// view gibt eine Kopie der Daten zurück.
func view() Data {
	dmu.Lock()
	defer dmu.Unlock()
	b, _ := json.Marshal(D)
	var c Data
	_ = json.Unmarshal(b, &c)
	defaults(&c)
	return c
}

func today() string { return time.Now().Format("2006-01-02") }

func annLog(s string) {
	edit(func(d *Data) {
		d.Ann.Log = append([]string{time.Now().Format("02.01. 15:04") + " – " + s}, d.Ann.Log...)
		if len(d.Ann.Log) > 40 {
			d.Ann.Log = d.Ann.Log[:40]
		}
	})
}

package main

// Titel laden: Spotify-Link (öffentliche Playlist oder Album), kopierte Song-Links oder eine eingefügte Liste.

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	reList  = regexp.MustCompile(`(?:open\.spotify\.com/(?:intl-[a-z]+/)?|spotify:)(playlist|album)[/:]([A-Za-z0-9]{22})`)
	reTrack = regexp.MustCompile(`(?:open\.spotify\.com/(?:intl-[a-z]+/)?track/|spotify:track:)([A-Za-z0-9]{22})`)
	reData  = regexp.MustCompile(`(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>`)
	reTime  = regexp.MustCompile(`(?:^|[\s\t(\[])(\d{1,2}):(\d{2})(?::(\d{2}))?[)\]]?\s*$`)
	reNum   = regexp.MustCompile(`^\s*\d{1,4}[.):\s-]+\s*`)
)

type embedEntity struct {
	Title    string  `json:"title"`
	Name     string  `json:"name"`
	Subtitle string  `json:"subtitle"`
	Duration float64 `json:"duration"`
	ID       string  `json:"id"`
	Audio    struct {
		URL string `json:"url"`
	} `json:"audioPreview"`
	Artists []struct {
		Name string `json:"name"`
	} `json:"artists"`
	TrackList []struct {
		Title    string  `json:"title"`
		Subtitle string  `json:"subtitle"`
		Duration float64 `json:"duration"`
		URI      string  `json:"uri"`
		Audio    struct {
			URL string `json:"url"`
		} `json:"audioPreview"`
	} `json:"trackList"`
}

func parseEmbed(html string) (*embedEntity, error) {
	m := reData.FindStringSubmatch(html)
	if m == nil {
		return nil, errors.New("Spotify hat eine unerwartete Seite geliefert.")
	}
	var d struct {
		Props struct {
			PageProps struct {
				Status int `json:"status"`
				State  struct {
					Data struct {
						Entity *embedEntity `json:"entity"`
					} `json:"data"`
				} `json:"state"`
			} `json:"pageProps"`
		} `json:"props"`
	}
	if err := json.Unmarshal([]byte(m[1]), &d); err != nil {
		return nil, errors.New("Die Antwort von Spotify ließ sich nicht lesen.")
	}
	if d.Props.PageProps.Status == 404 || d.Props.PageProps.State.Data.Entity == nil {
		return nil, errNotFound
	}
	return d.Props.PageProps.State.Data.Entity, nil
}

var errNotFound = errors.New("Spotify zeigt diese Playlist nicht an, meistens weil sie privat ist. Mach sie kurz öffentlich, oder markiere in der Spotify-App alle Titel (Strg+A), kopiere sie (Strg+C) und füge sie hier ein.")

func fetchEmbed(kind, id string) (*embedEntity, error) {
	req, _ := http.NewRequest("GET", "https://open.spotify.com/embed/"+kind+"/"+id, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
	req.Header.Set("Accept-Language", "de")
	client := http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.New("Spotify ist gerade nicht erreichbar. Prüfe deine Internetverbindung.")
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, errNotFound
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	return parseEmbed(string(body))
}

func parseTextList(text string) []Track {
	var out []Track
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.ReplaceAll(line, "\r", ""))
		if line == "" {
			continue
		}
		t := Track{}
		if m := reTime.FindStringSubmatchIndex(line); m != nil {
			g := reTime.FindStringSubmatch(line)
			a, _ := strconv.Atoi(g[1])
			b, _ := strconv.Atoi(g[2])
			if g[3] != "" {
				c, _ := strconv.Atoi(g[3])
				t.Dur = float64(a*3600 + b*60 + c)
			} else {
				t.Dur = float64(a*60 + b)
			}
			line = strings.TrimRight(line[:m[0]], " \t-–|")
		}
		line = reNum.ReplaceAllString(line, "")
		if p := strings.Split(line, "\t"); len(p) >= 2 {
			t.Title, t.Artist = strings.TrimSpace(p[0]), strings.TrimSpace(p[1])
		} else {
			t.Title = strings.TrimSpace(line)
		}
		if t.Title != "" {
			out = append(out, t)
		}
	}
	return out
}

func loadTracks(input string) ([]Track, string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, "", errors.New("Füge einen Spotify-Link oder eine Titelliste ein.")
	}
	ids := reTrack.FindAllStringSubmatch(input, -1)
	if len(ids) > 0 {
		out := make([]Track, len(ids))
		errs := make([]error, len(ids))
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)
		for i, m := range ids {
			wg.Add(1)
			go func(i int, id string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				e, err := fetchEmbed("track", id)
				if err != nil {
					errs[i] = err
					return
				}
				title := e.Title
				if title == "" {
					title = e.Name
				}
				names := []string{}
				for _, a := range e.Artists {
					names = append(names, a.Name)
				}
				out[i] = Track{Title: title, Artist: strings.Join(names, ", "), Dur: e.Duration / 1000, ID: id, Preview: e.Audio.URL}
			}(i, m[1])
		}
		wg.Wait()
		for i, err := range errs {
			if err != nil {
				return nil, "", fmt.Errorf("Titel %d ließ sich nicht laden: %v", i+1, err)
			}
		}
		return out, "", nil
	}
	if m := reList.FindStringSubmatch(input); m != nil {
		e, err := fetchEmbed(m[1], m[2])
		if err != nil {
			return nil, "", err
		}
		out := make([]Track, 0, len(e.TrackList))
		for _, t := range e.TrackList {
			out = append(out, Track{Title: t.Title, Artist: t.Subtitle, Dur: t.Duration / 1000, ID: strings.TrimPrefix(t.URI, "spotify:track:"), Preview: t.Audio.URL})
		}
		if len(out) == 0 {
			return nil, "", errors.New("Diese Playlist ist leer.")
		}
		name := e.Name
		if name == "" {
			name = e.Title
		}
		return out, name, nil
	}
	out := parseTextList(input)
	if len(out) == 0 {
		return nil, "", errors.New("In deiner Eingabe wurden keine Titel gefunden.")
	}
	return out, "", nil
}

// id3Tag baut ein ID3v2.3-Etikett, damit Player Titel, Künstler und Nummer anzeigen.
func id3Tag(t Track, nr int) []byte {
	frame := func(id, val string) []byte {
		if val == "" {
			return nil
		}
		b := []byte{1, 0xFF, 0xFE}
		for _, r := range val {
			if r > 0xFFFF {
				r = '?'
			}
			b = append(b, byte(r), byte(r>>8))
		}
		n := len(b)
		return append([]byte{id[0], id[1], id[2], id[3], byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n), 0, 0}, b...)
	}
	var body []byte
	body = append(body, frame("TIT2", t.Title)...)
	body = append(body, frame("TPE1", t.Artist)...)
	body = append(body, frame("TRCK", strconv.Itoa(nr))...)
	n := len(body)
	head := []byte{'I', 'D', '3', 3, 0, 0, byte(n >> 21 & 0x7f), byte(n >> 14 & 0x7f), byte(n >> 7 & 0x7f), byte(n & 0x7f)}
	return append(head, body...)
}

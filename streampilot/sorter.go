package main

// Playlist-Sortierer (Beta): ordnet Songs per lokaler KI (Ollama) nach Genre und Stimmung
// und legt dafür Playlists an bzw. befüllt bereits erstellte weiter.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

const ollamaURL = "http://127.0.0.1:11434"

type SortSong struct {
	URI     string   `json:"uri"`
	Name    string   `json:"name"`
	Artists []string `json:"artists"`
	Genre   string   `json:"genre"`
	Mood    string   `json:"mood"`
	genres  []string
	album   string
	aids    []string
}

type SortJob struct {
	mu      sync.Mutex
	Running bool       `json:"running"`
	Step    string     `json:"step"`
	Done    int        `json:"done"`
	Total   int        `json:"total"`
	Error   string     `json:"error"`
	Songs   []SortSong `json:"songs"`
}

var sortJob = &SortJob{}

func (j *SortJob) set(step string, done, total int) {
	j.mu.Lock()
	j.Step, j.Done, j.Total = step, done, total
	j.mu.Unlock()
}

func (j *SortJob) Snapshot() map[string]any {
	j.mu.Lock()
	defer j.mu.Unlock()
	b, _ := json.Marshal(j)
	m := map[string]any{}
	_ = json.Unmarshal(b, &m)
	return m
}

func ollamaModels() []string {
	c := &http.Client{Timeout: 3 * time.Second}
	resp, err := c.Get(ollamaURL + "/api/tags")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	var out []string
	for _, x := range asList(m["models"]) {
		if mm, ok := x.(map[string]any); ok {
			out = append(out, str(mm, "name", ""))
		}
	}
	return out
}

func myPlaylists() ([]map[string]any, error) {
	me := ""
	if spotify.tok != nil {
		me = spotify.tok.UserID
	}
	created := map[string]bool{}
	for _, v := range cfg.Section("sortCreated") {
		if m, ok := v.(map[string]any); ok {
			created[str(m, "id", "")] = true
		}
	}
	var out []map[string]any
	u := "/me/playlists?limit=50"
	for u != "" {
		m, err := spotify.Call("GET", u, nil)
		if err != nil {
			return nil, err
		}
		for _, x := range asList(m["items"]) {
			p, _ := x.(map[string]any)
			if p == nil || created[str(p, "id", "")] {
				continue
			}
			if str(sub(p, "owner"), "id", "") == me || boolean(p, "collaborative", false) {
				n := 0.0
				if it, ok := p["items"].(map[string]any); ok {
					n = num(it, "total", 0)
				} else {
					n = num(sub(p, "tracks"), "total", 0)
				}
				out = append(out, map[string]any{"id": str(p, "id", ""), "name": str(p, "name", ""), "count": n})
			}
		}
		u, _ = m["next"].(string)
	}
	return out, nil
}

func playlistTracks(id string) ([]*Track, error) {
	var out []*Track
	u := "/playlists/" + id + "/items?limit=50"
	for u != "" {
		m, err := spotify.Call("GET", u, nil)
		if err != nil {
			return nil, err
		}
		for _, x := range asList(m["items"]) {
			e, _ := x.(map[string]any)
			t := sub(e, "item")
			if len(t) == 0 {
				t = sub(e, "track")
			}
			if str(t, "type", "track") != "track" || boolean(t, "is_local", false) {
				continue
			}
			if tr := trackFrom(t); tr != nil {
				out = append(out, tr)
			}
		}
		u, _ = m["next"].(string)
	}
	return out, nil
}

func ollamaClassify(model string, songs []SortSong, known []string) map[int][2]string {
	var lines []string
	for i, s := range songs {
		g := "none"
		if len(s.genres) > 0 {
			g = strings.Join(s.genres[:min(6, len(s.genres))], ", ")
		}
		lines = append(lines, fmt.Sprintf(`%d. "%s" by %s (album: %s; Spotify artist genres: %s)`, i, s.Name, strings.Join(s.Artists, ", "), s.album, g))
	}
	kn := "none yet"
	if len(known) > 0 {
		kn = strings.Join(known, ", ")
	}
	prompt := `You are a music expert. Assign every song ONE main genre and ONE mood.
Rules:
- Main genre: a broad, well-known genre (e.g. Deutschrap, Hip-Hop, Pop, Deutschpop, Rock, Metal, EDM, House, Techno, Lo-Fi, R&B, Schlager, Indie, Soundtrack, Reggaeton, Phonk, Emo Rap, Country, Jazz). No tiny sub-genres. Reuse one of these existing genres if it fits (exact spelling): ` + kn + `
- Mood: "Chill" (calm, slow, melancholic – e.g. most Lil Peep, Juice WRLD, Lo-Fi, ballads), "Medium", or "Upbeat" (fast, energetic, party, workout).
Songs:
` + strings.Join(lines, "\n") + `
Answer ONLY with JSON: {"songs":[{"nr":0,"genre":"Pop","mood":"Chill"}]}`
	body, _ := json.Marshal(map[string]any{"model": model, "stream": false, "format": "json", "options": map[string]any{"temperature": 0.2},
		"messages": []map[string]string{{"role": "user", "content": prompt}}})
	c := &http.Client{Timeout: 10 * time.Minute}
	resp, err := c.Post(ollamaURL+"/api/chat", "application/json", bytes.NewReader(body))
	out := map[int][2]string{}
	if err != nil {
		return out
	}
	defer resp.Body.Close()
	m := map[string]any{}
	_ = json.NewDecoder(resp.Body).Decode(&m)
	parsed := map[string]any{}
	_ = json.Unmarshal([]byte(str(sub(m, "message"), "content", "{}")), &parsed)
	lower := map[string]string{}
	for _, k := range known {
		lower[strings.ToLower(k)] = k
	}
	for _, x := range asList(parsed["songs"]) {
		e, _ := x.(map[string]any)
		nr := int(num(e, "nr", -1))
		g := strings.TrimSpace(str(e, "genre", ""))
		if g == "" {
			g = "Other"
		}
		if k, ok := lower[strings.ToLower(g)]; ok {
			g = k
		}
		mood := str(e, "mood", "Medium")
		switch strings.ToLower(mood) {
		case "chill":
			mood = "Chill"
		case "upbeat", "flott":
			mood = "Upbeat"
		default:
			mood = "Medium"
		}
		if nr >= 0 {
			out[nr] = [2]string{g, mood}
		}
	}
	return out
}

func runSort(ids []string, model string) {
	j := sortJob
	j.mu.Lock()
	j.Running, j.Error, j.Songs = true, "", nil
	j.mu.Unlock()
	defer func() {
		j.mu.Lock()
		j.Running = false
		j.mu.Unlock()
	}()
	fail := func(e string) { j.mu.Lock(); j.Error = e; j.mu.Unlock() }
	seen := map[string]bool{}
	var songs []SortSong
	for i, id := range ids {
		j.set("load", i, len(ids))
		tr, err := playlistTracks(id)
		if err != nil {
			fail(err.Error())
			return
		}
		for _, t := range tr {
			if !seen[t.URI] {
				seen[t.URI] = true
				songs = append(songs, SortSong{URI: t.URI, Name: t.Name, Artists: t.Artists, album: t.Album, aids: t.ArtistIDs})
			}
		}
	}
	if len(songs) == 0 {
		fail("empty")
		return
	}
	cache := map[string][]string{}
	loadJSON("artist_genres.json", &cache)
	var aids []string
	for _, s := range songs {
		for i, a := range s.aids {
			if i < 2 {
				if _, ok := cache[a]; !ok {
					aids = append(aids, a)
					cache[a] = nil
				}
			}
		}
	}
	for i, a := range aids {
		j.set("genres", i, len(aids))
		if m, err := spotify.Call("GET", "/artists/"+a, nil); err == nil {
			var g []string
			for _, x := range asList(m["genres"]) {
				if s, ok := x.(string); ok {
					g = append(g, s)
				}
			}
			cache[a] = g
		}
	}
	_ = saveJSON("artist_genres.json", cache)
	for i := range songs {
		for k, a := range songs[i].aids {
			if k < 2 {
				songs[i].genres = append(songs[i].genres, cache[a]...)
			}
		}
	}
	knownSet := map[string]bool{}
	for k := range cfg.Section("sortCreated") {
		g := strings.Split(k, " – ")[0]
		if g != "Other" && g != "Chill Mix" {
			knownSet[g] = true
		}
	}
	for start := 0; start < len(songs); start += 20 {
		end := min(start+20, len(songs))
		j.set("ai", start, len(songs))
		var known []string
		for k := range knownSet {
			known = append(known, k)
		}
		sort.Strings(known)
		res := ollamaClassify(model, songs[start:end], known)
		for i := start; i < end; i++ {
			r, ok := res[i-start]
			if !ok {
				r = [2]string{"Other", "Medium"}
			}
			songs[i].Genre, songs[i].Mood = r[0], r[1]
			knownSet[r[0]] = true
		}
	}
	j.set("done", len(songs), len(songs))
	j.mu.Lock()
	j.Songs = songs
	j.mu.Unlock()
}

// Gruppen bilden (gleiche Logik wie in der Vorschau im Fenster)
// mode: "genre" (nur Genre), "mood" (nur Stimmung) oder "both" (Genre und Stimmung)
func sortGroups(songs []SortSong, mode string, chillMix bool, minSongs int) map[string][]string {
	created := cfg.Section("sortCreated")
	g := map[string][]string{}
	for _, s := range songs {
		k := s.Genre
		switch mode {
		case "both":
			k = s.Genre + " – " + s.Mood
		case "mood":
			k = moodName(s.Mood)
		}
		g[k] = append(g[k], s.URI)
	}
	out := map[string][]string{}
	var rest []string
	for k, v := range g {
		if _, ok := created[k]; ok || len(v) >= minSongs {
			out[k] = v
		} else {
			rest = append(rest, v...)
		}
	}
	if len(rest) > 0 {
		out["Other"] = append(out["Other"], rest...)
	}
	if chillMix {
		for _, s := range songs {
			if s.Mood == "Chill" {
				out["Chill Mix"] = append(out["Chill Mix"], s.URI)
			}
		}
	}
	return out
}

func moodName(m string) string {
	switch m {
	case "Chill":
		return tr("Chill", "Chill")
	case "Upbeat":
		return tr("Flott", "Upbeat")
	}
	return tr("Mittel", "Medium")
}

func applySort(groups map[string][]string, prefix string) (int, error) {
	created := cfg.Section("sortCreated")
	existing := map[string]bool{}
	if pls, err := spotifyAllPlaylistIDs(); err == nil {
		existing = pls
	}
	added := 0
	for key, uris := range groups {
		entry := sub(created, key)
		id := str(entry, "id", "")
		if id != "" && existing[id] {
			have := map[string]bool{}
			if tr, err := playlistTracks(id); err == nil {
				for _, t := range tr {
					have[t.URI] = true
				}
			}
			var nu []string
			for _, u := range uris {
				if !have[u] {
					nu = append(nu, u)
				}
			}
			if err := addItems(id, nu); err != nil {
				return added, err
			}
			added += len(nu)
			continue
		}
		name := prefix + key
		m, err := spotify.Call("POST", "/me/playlists", map[string]any{"name": name, "public": false, "description": "Sorted with StreamPilot"})
		if err != nil {
			return added, err
		}
		id = str(m, "id", "")
		if err := addItems(id, uris); err != nil {
			return added, err
		}
		created[key] = map[string]any{"id": id, "name": name}
		cfg.SetSection("sortCreated", created)
		added += len(uris)
	}
	return added, nil
}

func addItems(id string, uris []string) error {
	for i := 0; i < len(uris); i += 100 {
		if _, err := spotify.Call("POST", "/playlists/"+id+"/items", map[string]any{"uris": uris[i:min(i+100, len(uris))]}); err != nil {
			return err
		}
	}
	return nil
}

func spotifyAllPlaylistIDs() (map[string]bool, error) {
	out := map[string]bool{}
	u := "/me/playlists?limit=50"
	for u != "" {
		m, err := spotify.Call("GET", u, nil)
		if err != nil {
			return nil, err
		}
		for _, x := range asList(m["items"]) {
			if p, ok := x.(map[string]any); ok {
				out[str(p, "id", "")] = true
			}
		}
		u, _ = m["next"].(string)
	}
	return out, nil
}

package main

// Spotify-Konto verknüpfen. Anmeldung läuft über Spotifys eigene Seite im Browser (PKCE, ohne geheimen Schlüssel).
// Die App sieht nie das Passwort. Der Zugang wird geschützt gespeichert und liest nur Playlists.

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	spotifyCallbackPort = "43821"
	spotifyRedirect     = "http://127.0.0.1:" + spotifyCallbackPort + "/callback"
	spotifyScopes       = "playlist-read-private playlist-read-collaborative"
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

var (
	spotifyAccounts = envOr("MP3SCHNEIDER_SPOTIFY_ACCOUNTS", "https://accounts.spotify.com")
	spotifyAPI      = envOr("MP3SCHNEIDER_SPOTIFY_API", "https://api.spotify.com/v1")
)

type spotifyToken struct {
	Access  string    `json:"access"`
	Refresh string    `json:"refresh"`
	Expires time.Time `json:"expires"`
	Name    string    `json:"name"`
}

type Spotify struct {
	mu       sync.Mutex
	path     string
	clientID func() string
	tok      *spotifyToken
	pending  bool
	lastErr  string
}

func newSpotify(root string, clientID func() string) *Spotify {
	s := &Spotify{path: filepath.Join(root, "spotify.dat"), clientID: clientID}
	if b, err := os.ReadFile(s.path); err == nil {
		if plain, err := unprotect(b); err == nil {
			var t spotifyToken
			if json.Unmarshal(plain, &t) == nil && t.Refresh != "" {
				s.tok = &t
			}
		}
	}
	return s
}

func (s *Spotify) store() {
	if s.tok == nil {
		os.Remove(s.path)
		return
	}
	b, _ := json.Marshal(s.tok)
	if enc, err := protect(b); err == nil {
		os.WriteFile(s.path, enc, 0o600)
	}
}

func (s *Spotify) status() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	name := ""
	if s.tok != nil {
		name = s.tok.Name
	}
	return map[string]any{"connected": s.tok != nil, "name": name, "pending": s.pending, "error": s.lastErr, "redirect": spotifyRedirect}
}

func (s *Spotify) disconnect() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tok = nil
	s.lastErr = ""
	s.store()
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

// connect öffnet Spotifys Anmeldeseite und wartet im Hintergrund auf die Rückmeldung.
func (s *Spotify) connect() error {
	cid := strings.TrimSpace(s.clientID())
	if cid == "" {
		return errors.New("Trag zuerst deine Client-ID ein.")
	}
	s.mu.Lock()
	if s.pending {
		s.mu.Unlock()
		return errors.New("Die Anmeldung läuft schon. Schau in deinem Browser nach.")
	}
	ln, err := net.Listen("tcp", "127.0.0.1:"+spotifyCallbackPort)
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("Port %s ist belegt. Schließe das Programm, das ihn nutzt, und versuch es noch einmal.", spotifyCallbackPort)
	}
	s.pending, s.lastErr = true, ""
	s.mu.Unlock()

	rv, st := make([]byte, 48), make([]byte, 24)
	rand.Read(rv)
	rand.Read(st)
	verifier, state := b64(rv), b64(st)
	sum := sha256.Sum256([]byte(verifier))
	q := url.Values{"client_id": {cid}, "response_type": {"code"}, "redirect_uri": {spotifyRedirect}, "scope": {spotifyScopes},
		"state": {state}, "code_challenge_method": {"S256"}, "code_challenge": {b64(sum[:])}}

	done := make(chan string, 1)
	srv := &http.Server{ReadHeaderTimeout: 10 * time.Second}
	srv.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" {
			http.NotFound(w, r)
			return
		}
		msg, fail := "", ""
		switch {
		case r.URL.Query().Get("state") != state:
			fail = "Die Antwort von Spotify passte nicht zu dieser Anmeldung."
		case r.URL.Query().Get("error") != "":
			fail = "Du hast die Anmeldung abgebrochen."
		default:
			if err := s.exchange(cid, url.Values{"grant_type": {"authorization_code"}, "code": {r.URL.Query().Get("code")}, "redirect_uri": {spotifyRedirect}, "code_verifier": {verifier}}); err != nil {
				fail = err.Error()
			} else {
				msg = "Dein Spotify-Konto ist verknüpft. Du kannst dieses Fenster schließen."
			}
		}
		if fail != "" {
			msg = fail
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><title>MP3 Schneider</title><body style="font:18px system-ui;background:#0f1642;color:#f6f1e4;padding:48px"><p>%s</p>`, msg)
		done <- fail
	})
	go srv.Serve(ln)
	openURL(spotifyAccounts + "/authorize?" + q.Encode())
	go func() {
		fail := ""
		select {
		case fail = <-done:
		case <-time.After(5 * time.Minute):
			fail = "Die Anmeldung hat zu lange gedauert. Versuch es noch einmal."
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
		s.mu.Lock()
		s.pending, s.lastErr = false, fail
		s.mu.Unlock()
	}()
	return nil
}

func (s *Spotify) exchange(cid string, form url.Values) error {
	form.Set("client_id", cid)
	resp, err := http.Post(spotifyAccounts+"/api/token", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return errors.New("Spotify ist gerade nicht erreichbar.")
	}
	defer resp.Body.Close()
	var d struct {
		Access  string `json:"access_token"`
		Refresh string `json:"refresh_token"`
		Expires int    `json:"expires_in"`
		Error   string `json:"error"`
		Desc    string `json:"error_description"`
	}
	json.NewDecoder(resp.Body).Decode(&d)
	if resp.StatusCode != 200 || d.Access == "" {
		if strings.Contains(d.Desc, "redirect") {
			return errors.New("Die Redirect-URI im Spotify-Dashboard stimmt nicht. Kopiere sie noch einmal aus den Einstellungen.")
		}
		return errors.New("Spotify hat die Anmeldung abgelehnt. Prüfe deine Client-ID.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	t := &spotifyToken{Access: d.Access, Refresh: d.Refresh, Expires: time.Now().Add(time.Duration(d.Expires-30) * time.Second)}
	if s.tok != nil {
		t.Name = s.tok.Name
		if t.Refresh == "" {
			t.Refresh = s.tok.Refresh
		}
	}
	s.tok = t
	if t.Name == "" {
		var me struct {
			Name string `json:"display_name"`
			ID   string `json:"id"`
		}
		s.mu.Unlock()
		err := s.apiGet("/me", &me)
		s.mu.Lock()
		if err == nil && s.tok != nil {
			s.tok.Name = me.Name
			if s.tok.Name == "" {
				s.tok.Name = me.ID
			}
		}
	}
	s.store()
	return nil
}

func (s *Spotify) access() (string, error) {
	s.mu.Lock()
	t := s.tok
	s.mu.Unlock()
	if t == nil {
		return "", errors.New("Dein Spotify-Konto ist nicht verknüpft.")
	}
	if time.Now().Before(t.Expires) {
		return t.Access, nil
	}
	if err := s.exchange(s.clientID(), url.Values{"grant_type": {"refresh_token"}, "refresh_token": {t.Refresh}}); err != nil {
		return "", errors.New("Die Verknüpfung mit Spotify ist abgelaufen. Verbinde dein Konto in den Einstellungen neu.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tok.Access, nil
}

type httpStatusError struct{ code int }

func (e httpStatusError) Error() string {
	return "Spotify antwortet mit Fehler " + strconv.Itoa(e.code)
}

func (s *Spotify) apiGet(path string, out any) error {
	for try := 0; ; try++ {
		tok, err := s.access()
		if err != nil {
			return err
		}
		u := path
		if !strings.HasPrefix(u, "http") {
			u = spotifyAPI + path
		}
		req, _ := http.NewRequest("GET", u, nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		client := http.Client{Timeout: 25 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return errors.New("Spotify ist gerade nicht erreichbar. Prüfe deine Internetverbindung.")
		}
		if resp.StatusCode == 429 && try < 3 {
			wait, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
			resp.Body.Close()
			time.Sleep(time.Duration(min(max(wait, 1), 20)) * time.Second)
			continue
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return httpStatusError{resp.StatusCode}
		}
		var buf bytes.Buffer
		buf.ReadFrom(resp.Body)
		return json.Unmarshal(buf.Bytes(), out)
	}
}

type PlaylistInfo struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Owner string `json:"owner"`
	Total int    `json:"total"`
	Mine  bool   `json:"mine"`
}

func (s *Spotify) playlists() ([]PlaylistInfo, error) {
	var me struct {
		ID string `json:"id"`
	}
	if err := s.apiGet("/me", &me); err != nil {
		return nil, err
	}
	out := []PlaylistInfo{}
	next := "/me/playlists?limit=50"
	for next != "" {
		var page struct {
			Items []*struct {
				ID    string `json:"id"`
				Name  string `json:"name"`
				Owner struct {
					ID   string `json:"id"`
					Name string `json:"display_name"`
				} `json:"owner"`
				Items *struct {
					Total int `json:"total"`
				} `json:"items"`
				Tracks *struct {
					Total int `json:"total"`
				} `json:"tracks"`
			} `json:"items"`
			Next string `json:"next"`
		}
		if err := s.apiGet(next, &page); err != nil {
			return nil, err
		}
		for _, p := range page.Items {
			if p == nil {
				continue
			}
			i := PlaylistInfo{ID: p.ID, Name: p.Name, Owner: p.Owner.Name, Mine: p.Owner.ID == me.ID}
			if p.Items != nil {
				i.Total = p.Items.Total
			} else if p.Tracks != nil {
				i.Total = p.Tracks.Total
			}
			out = append(out, i)
		}
		next = page.Next
	}
	return out, nil
}

// playlistTracks lädt alle Titel. Fremde Playlists gibt Spotify über das Konto nicht heraus: Dann wird die öffentliche Ansicht genutzt.
func (s *Spotify) playlistTracks(id string) ([]Track, error) {
	if !validSpotifyID(id) {
		return nil, errors.New("Das ist keine gültige Playlist.")
	}
	out := []Track{}
	next := "/playlists/" + id + "/items?limit=50"
	for next != "" {
		var page struct {
			Items []struct {
				Item *struct {
					Type     string  `json:"type"`
					ID       string  `json:"id"`
					Name     string  `json:"name"`
					Duration float64 `json:"duration_ms"`
					Artists  []struct {
						Name string `json:"name"`
					} `json:"artists"`
				} `json:"item"`
			} `json:"items"`
			Next string `json:"next"`
		}
		if err := s.apiGet(next, &page); err != nil {
			var he httpStatusError
			if errors.As(err, &he) && he.code == 403 {
				e, err := fetchEmbed("playlist", id)
				if err != nil {
					return nil, errors.New("Diese Playlist gehört jemand anderem und ist nicht öffentlich sichtbar.")
				}
				out = out[:0]
				for _, t := range e.TrackList {
					out = append(out, Track{Title: t.Title, Artist: t.Subtitle, Dur: t.Duration / 1000, ID: strings.TrimPrefix(t.URI, "spotify:track:"), Preview: t.Audio.URL})
				}
				return out, nil
			}
			return nil, err
		}
		for _, it := range page.Items {
			if it.Item == nil || it.Item.Name == "" {
				continue
			}
			names := []string{}
			for _, a := range it.Item.Artists {
				names = append(names, a.Name)
			}
			out = append(out, Track{Title: it.Item.Name, Artist: strings.Join(names, ", "), Dur: it.Item.Duration / 1000, ID: it.Item.ID})
		}
		next = page.Next
	}
	if len(out) == 0 {
		return nil, errors.New("Diese Playlist ist leer.")
	}
	addPreviews(out)
	return out, nil
}

// addPreviews holt für Titel aus dem Konto die Adresse der Hörprobe. Die Konto-Schnittstelle liefert sie nicht mit.
func addPreviews(tr []Track) {
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for i := range tr {
		if tr[i].Preview != "" || !validSpotifyID(tr[i].ID) {
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if e, err := fetchEmbed("track", tr[i].ID); err == nil {
				tr[i].Preview = e.Audio.URL
			}
		}(i)
	}
	wg.Wait()
}

func validSpotifyID(id string) bool {
	if len(id) != 22 {
		return false
	}
	for _, r := range id {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
			return false
		}
	}
	return true
}

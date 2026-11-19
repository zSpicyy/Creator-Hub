package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const spotifyRedirect = "http://127.0.0.1:8888/callback"
const spotifyScopes = "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public " +
	"user-modify-playback-state user-read-playback-state user-read-currently-playing"

type SpotifyToken struct {
	Access    string  `json:"access_token"`
	Refresh   string  `json:"refresh_token"`
	ExpiresIn float64 `json:"expires_in"`
	ExpiresAt int64   `json:"expires_at"`
	Scope     string  `json:"scope"`
	Name      string  `json:"name"`
	UserID    string  `json:"user_id"`
}

type Spotify struct {
	mu  sync.Mutex
	tok *SpotifyToken
}

var spotify = &Spotify{}

type SpotifyErr struct {
	Code int
	Body string
}

func (e *SpotifyErr) Error() string { return fmt.Sprintf("Spotify %d", e.Code) }

func (s *Spotify) Load() {
	t := &SpotifyToken{}
	if loadJSON("spotify.json", t) && t.Refresh != "" {
		s.tok = t
	}
}

func (s *Spotify) Connected() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tok != nil && s.tok.Refresh != ""
}

func (s *Spotify) Name() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tok == nil {
		return ""
	}
	return s.tok.Name
}

func (s *Spotify) Disconnect() {
	s.mu.Lock()
	s.tok = nil
	s.mu.Unlock()
	_ = saveJSON("spotify.json", map[string]any{})
}

func clientID() string { return strings.TrimSpace(cfg.Str("spotifyClientId", "")) }

func postForm(u string, form url.Values) ([]byte, int, error) {
	req, _ := http.NewRequest("POST", u, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return b, resp.StatusCode, nil
}

// Login per PKCE: Browser öffnet sich, Spotify leitet auf 127.0.0.1:8888 zurück.
func (s *Spotify) Login(ctx context.Context) error {
	cid := clientID()
	if cid == "" {
		return errors.New("missing client id")
	}
	vb := make([]byte, 48)
	_, _ = rand.Read(vb)
	verifier := base64.RawURLEncoding.EncodeToString(vb)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	sb := make([]byte, 12)
	_, _ = rand.Read(sb)
	state := base64.RawURLEncoding.EncodeToString(sb)

	ln, err := net.Listen("tcp", "127.0.0.1:8888")
	if err != nil {
		return errors.New("port 8888 is busy")
	}
	codeCh := make(chan string, 1)
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if q.Get("state") == state && q.Get("code") != "" {
			fmt.Fprint(w, doneHTML("Spotify"))
			codeCh <- q.Get("code")
		} else {
			fmt.Fprint(w, "<p>Login failed.</p>")
			codeCh <- ""
		}
	})}
	go srv.Serve(ln)
	defer srv.Close()

	q := url.Values{"client_id": {cid}, "response_type": {"code"}, "redirect_uri": {spotifyRedirect},
		"scope": {spotifyScopes}, "state": {state}, "code_challenge_method": {"S256"}, "code_challenge": {challenge}}
	openBrowser("https://accounts.spotify.com/authorize?" + q.Encode())

	var code string
	select {
	case code = <-codeCh:
	case <-time.After(4 * time.Minute):
	case <-ctx.Done():
	}
	if code == "" {
		return errors.New("login cancelled")
	}
	b, st, err := postForm("https://accounts.spotify.com/api/token", url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {spotifyRedirect},
		"client_id": {cid}, "code_verifier": {verifier}})
	if err != nil {
		return err
	}
	if st != 200 {
		return fmt.Errorf("token error %d", st)
	}
	t := &SpotifyToken{}
	if err := json.Unmarshal(b, t); err != nil {
		return err
	}
	t.ExpiresAt = time.Now().Unix() + int64(t.ExpiresIn) - 60
	s.mu.Lock()
	s.tok = t
	s.mu.Unlock()
	if me, err := s.Call("GET", "/me", nil); err == nil {
		s.mu.Lock()
		s.tok.Name = str(me, "display_name", str(me, "id", ""))
		s.tok.UserID = str(me, "id", "")
		s.mu.Unlock()
	}
	s.persist()
	return nil
}

func (s *Spotify) persist() {
	s.mu.Lock()
	t := *s.tok
	s.mu.Unlock()
	_ = saveJSON("spotify.json", t)
}

func (s *Spotify) access() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.tok == nil {
		return "", errors.New("not connected")
	}
	if time.Now().Unix() < s.tok.ExpiresAt && s.tok.Access != "" {
		return s.tok.Access, nil
	}
	b, st, err := postForm("https://accounts.spotify.com/api/token", url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {s.tok.Refresh}, "client_id": {clientID()}})
	if err != nil {
		return "", err
	}
	if st != 200 {
		return "", fmt.Errorf("refresh failed (%d)", st)
	}
	n := SpotifyToken{}
	_ = json.Unmarshal(b, &n)
	s.tok.Access = n.Access
	if n.Refresh != "" {
		s.tok.Refresh = n.Refresh
	}
	if n.Scope != "" {
		s.tok.Scope = n.Scope
	}
	s.tok.ExpiresAt = time.Now().Unix() + int64(n.ExpiresIn) - 60
	t := *s.tok
	go saveJSON("spotify.json", t)
	return s.tok.Access, nil
}

func (s *Spotify) HasPlaybackScope() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.tok != nil && strings.Contains(s.tok.Scope, "user-modify-playback-state")
}

// Call: JSON-Anfrage an die Web-API. Leere Antworten liefern eine leere Map.
func (s *Spotify) Call(method, path string, body any) (map[string]any, error) {
	u := path
	if !strings.HasPrefix(u, "http") {
		u = "https://api.spotify.com/v1" + path
	}
	for attempt := 0; attempt < 5; attempt++ {
		tok, err := s.access()
		if err != nil {
			return nil, err
		}
		var rd io.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		}
		req, _ := http.NewRequest(method, u, rd)
		req.Header.Set("Authorization", "Bearer "+tok)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		switch {
		case resp.StatusCode == 429:
			wait, _ := strconv.Atoi(resp.Header.Get("Retry-After"))
			if wait <= 0 {
				wait = 3
			}
			time.Sleep(time.Duration(min(wait, 30)) * time.Second)
			continue
		case resp.StatusCode == 401:
			s.mu.Lock()
			if s.tok != nil {
				s.tok.ExpiresAt = 0
			}
			s.mu.Unlock()
			continue
		case resp.StatusCode >= 300:
			return nil, &SpotifyErr{resp.StatusCode, string(b)}
		}
		out := map[string]any{}
		if len(b) > 0 {
			_ = json.Unmarshal(b, &out)
		}
		return out, nil
	}
	return nil, errors.New("spotify: too many retries")
}

type Track struct {
	URI       string   `json:"uri"`
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Artists   []string `json:"artists"`
	ArtistIDs []string `json:"artistIds"`
	Album     string   `json:"album"`
	Image     string   `json:"image"`
	Duration  int      `json:"duration"`
	Progress  int      `json:"progress"`
	Playing   bool     `json:"playing"`
}

func trackFrom(m map[string]any) *Track {
	if m == nil || str(m, "uri", "") == "" {
		return nil
	}
	t := &Track{URI: str(m, "uri", ""), ID: str(m, "id", ""), Name: str(m, "name", "?"), Duration: int(num(m, "duration_ms", 0))}
	if arr, ok := m["artists"].([]any); ok {
		for _, a := range arr {
			if am, ok := a.(map[string]any); ok {
				t.Artists = append(t.Artists, str(am, "name", "?"))
				if id := str(am, "id", ""); id != "" {
					t.ArtistIDs = append(t.ArtistIDs, id)
				}
			}
		}
	}
	al := sub(m, "album")
	t.Album = str(al, "name", "")
	if imgs, ok := al["images"].([]any); ok && len(imgs) > 0 {
		t.Image = str(imgs[len(imgs)/2].(map[string]any), "url", "")
	}
	return t
}

func (t *Track) ArtistStr() string {
	if len(t.Artists) > 2 {
		return strings.Join(t.Artists[:2], ", ")
	}
	return strings.Join(t.Artists, ", ")
}

func (s *Spotify) Current() (*Track, error) {
	m, err := s.Call("GET", "/me/player/currently-playing", nil)
	if err != nil {
		return nil, err
	}
	it := sub(m, "item")
	if str(it, "type", "") != "track" {
		return nil, nil
	}
	t := trackFrom(it)
	if t != nil {
		t.Progress = int(num(m, "progress_ms", 0))
		t.Playing = boolean(m, "is_playing", false)
	}
	return t, nil
}

func (s *Spotify) Track(id string) (*Track, error) {
	m, err := s.Call("GET", "/tracks/"+id, nil)
	if err != nil {
		return nil, err
	}
	return trackFrom(m), nil
}

func (s *Spotify) Search(q string) (*Track, error) {
	if len(q) > 200 {
		q = q[:200]
	}
	m, err := s.Call("GET", "/search?"+url.Values{"q": {q}, "type": {"track"}, "limit": {"5"}}.Encode(), nil)
	if err != nil {
		return nil, err
	}
	if items, ok := sub(m, "tracks")["items"].([]any); ok && len(items) > 0 {
		if im, ok := items[0].(map[string]any); ok {
			return trackFrom(im), nil
		}
	}
	return nil, nil
}

func (s *Spotify) Queue(uri string) error {
	_, err := s.Call("POST", "/me/player/queue?"+url.Values{"uri": {uri}}.Encode(), nil)
	return err
}

func (s *Spotify) Next() error {
	_, err := s.Call("POST", "/me/player/next", nil)
	return err
}

func (s *Spotify) Volume(p int) error {
	_, err := s.Call("PUT", "/me/player/volume?volume_percent="+strconv.Itoa(p), nil)
	return err
}

func doneHTML(what string) string {
	return `<!doctype html><meta charset="utf-8"><title>StreamPilot</title><body style="background:#0c0c0e;color:#f2f2f5;font:16px 'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:42px">✓</div><h2 style="margin:8px 0">` + what + ` connected</h2><p style="color:#8d8d98">You can close this tab and return to StreamPilot.</p></div>`
}

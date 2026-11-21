package main

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestUploadResumable(t *testing.T) {
	dataDir = t.TempDir()
	loadData()
	edit(func(d *Data) { d.YT.Access = "tok"; d.YT.Expiry = time.Now().Unix() + 3600 })
	video := make([]byte, 20<<20+123)
	for i := range video {
		video[i] = byte(i)
	}
	vf := filepath.Join(dataDir, "v.mp4")
	os.WriteFile(vf, video, 0o644)
	var got []byte
	var meta string
	fails := 1
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(401)
			return
		}
		switch {
		case r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/videos"):
			b, _ := io.ReadAll(r.Body)
			meta = string(b)
			w.Header().Set("Location", srv.URL+"/session")
			w.WriteHeader(200)
		case r.Method == "PUT":
			b, _ := io.ReadAll(r.Body)
			if fails > 0 { // ein Serverfehler mittendrin
				fails--
				w.WriteHeader(503)
				return
			}
			got = append(got, b...)
			if len(got) < len(video) {
				w.Header().Set("Range", fmt.Sprintf("bytes=0-%d", len(got)-1))
				w.WriteHeader(308)
				return
			}
			w.Write([]byte(`{"id":"abc123"}`))
		case strings.HasPrefix(r.URL.Path, "/thumbnails"):
			w.Write([]byte(`{}`))
		}
	}))
	defer srv.Close()
	ytUploadBase = srv.URL
	at := time.Now().Add(48 * time.Hour).Unix()
	id, err := doUpload(Upload{ID: "x", File: vf, Title: "Test", Privacy: "public", PublishAt: at, Tags: "a, b"}, func(float64) {})
	if err != nil || id != "abc123" {
		t.Fatal(id, err)
	}
	if string(got) != string(video) {
		t.Fatal("bytes differ", len(got))
	}
	if !strings.Contains(meta, `"privacyStatus":"private"`) || !strings.Contains(meta, "publishAt") || !strings.Contains(meta, `"tags":["a","b"]`) {
		t.Fatal(meta)
	}
	th := filepath.Join(dataDir, "t.png")
	os.WriteFile(th, []byte("png"), 0o644)
	if err := setThumb("abc123", th); err != nil {
		t.Fatal(err)
	}
}

func TestValidate(t *testing.T) {
	dataDir = t.TempDir()
	if validUpload(Upload{}) == nil {
		t.Fatal("empty ok")
	}
	f := filepath.Join(dataDir, "v.mp4")
	os.WriteFile(f, []byte("x"), 0o644)
	if validUpload(Upload{File: f, Title: "a<b"}) == nil {
		t.Fatal("<> ok")
	}
	if validUpload(Upload{File: f, Title: "ok", PublishAt: time.Now().Unix() + 60}) == nil {
		t.Fatal("too soon ok")
	}
	if err := validUpload(Upload{File: f, Title: "ok", PublishAt: time.Now().Unix() + 3600}); err != nil {
		t.Fatal(err)
	}
}

func TestBestTimesAndRival(t *testing.T) {
	now := time.Now()
	var it []struct {
		At    int64
		Views int64
	}
	for i := 0; i < 10; i++ {
		tm := time.Date(now.Year(), now.Month(), now.Day()-10-i*7, 18, 0, 0, 0, time.Local)
		it = append(it, struct {
			At    int64
			Views int64
		}{tm.Unix(), 10000})
		tm2 := time.Date(now.Year(), now.Month(), now.Day()-11-i*7, 9, 0, 0, 0, time.Local)
		it = append(it, struct {
			At    int64
			Views int64
		}{tm2.Unix(), 500})
	}
	h := bestTimes(it)
	if h.N != 20 || len(h.Top) == 0 || !strings.HasSuffix(h.Top[0], "18:00") {
		t.Fatal(h.Top, h.N)
	}
	if parseRival("yt", "https://youtube.com/@CraftLena/") != "@CraftLena" || parseRival("tw", "https://twitch.tv/Rudi") != "rudi" || parseRival("yt", "UCabcdefghijklmnopqrstuv") != "UCabcdefghijklmnopqrstuv" {
		t.Fatal("parse")
	}
}

func TestDiscordValidation(t *testing.T) {
	if discordSend("https://example.com/x", "hi") == nil {
		t.Fatal("accepted non-discord")
	}
}

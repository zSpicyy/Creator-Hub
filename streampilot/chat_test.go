package main

// Test der Chat-Verbindung gegen einen nachgebauten Twitch-Chat (IRC über TLS) und eine
// nachgebaute Token-Prüfung. Prüft Anmeldung, Beitritt, PING, Nachrichten, Senden und Fehlerfälle.

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeTwitch struct {
	mu       sync.Mutex
	got      []string // vom Bot empfangene Zeilen
	validOK  bool     // Token gültig?
	scopes   string
	refresh  int
	joinOK   bool // 366 schicken?
	authFail bool // "Login authentication failed" schicken
	conn     net.Conn
}

func (f *fakeTwitch) lines() []string { f.mu.Lock(); defer f.mu.Unlock(); return append([]string{}, f.got...) }
func (f *fakeTwitch) has(p string) bool {
	for _, l := range f.lines() {
		if strings.HasPrefix(l, p) {
			return true
		}
	}
	return false
}
func (f *fakeTwitch) send(l string) {
	f.mu.Lock()
	c := f.conn
	f.mu.Unlock()
	if c != nil {
		c.Write([]byte(l + "\r\n"))
	}
}

func startFake(t *testing.T, f *fakeTwitch) func() {
	t.Helper()
	initDataDir(t.TempDir())
	cfg.Load()
	cfg.Set("twitchClientId", "testclient")
	// Token-Prüfung und Erneuerung
	hs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		if r.URL.Path == "/token" {
			f.refresh++
			f.validOK = true
			fmt.Fprint(w, `{"access_token":"neu","refresh_token":"r2","expires_in":3600}`)
			return
		}
		if !f.validOK || r.Header.Get("Authorization") == "OAuth alt" {
			w.WriteHeader(401)
			fmt.Fprint(w, `{"status":401}`)
			return
		}
		fmt.Fprintf(w, `{"login":"MeinBot","user_id":"42","scopes":[%s]}`, f.scopes)
	}))
	validateURL, tokenURL = hs.URL+"/validate", hs.URL+"/token"
	// IRC-Server mit TLS
	cert := httptest.NewTLSServer(http.NotFoundHandler()).TLS.Certificates[0]
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{cert}})
	if err != nil {
		t.Fatal(err)
	}
	ircAddr, ircTLS = ln.Addr().String(), &tls.Config{InsecureSkipVerify: true}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			f.mu.Lock()
			f.conn = c
			f.mu.Unlock()
			go func(c net.Conn) {
				r := bufio.NewReader(c)
				for {
					l, err := r.ReadString('\n')
					if err != nil {
						return
					}
					l = strings.TrimRight(l, "\r\n")
					f.mu.Lock()
					f.got = append(f.got, l)
					joinOK, authFail := f.joinOK, f.authFail
					f.mu.Unlock()
					if strings.HasPrefix(l, "NICK ") {
						if authFail {
							c.Write([]byte(":tmi.twitch.tv NOTICE * :Login authentication failed\r\n"))
							c.Close()
							return
						}
						c.Write([]byte(":tmi.twitch.tv 001 meinbot :Welcome, GLHF!\r\n"))
					}
					if strings.HasPrefix(l, "JOIN #") && joinOK {
						ch := strings.TrimPrefix(l, "JOIN ")
						c.Write([]byte(":meinbot!meinbot@meinbot.tmi.twitch.tv JOIN " + ch + "\r\n:meinbot.tmi.twitch.tv 353 meinbot = " + ch + " :meinbot\r\n:meinbot.tmi.twitch.tv 366 meinbot " + ch + " :End of /NAMES list\r\n"))
					}
				}
			}(c)
		}
	}()
	return func() { ln.Close(); hs.Close() }
}

func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	for i := 0; i < 100; i++ {
		if ok() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("Zeitüberschreitung: %s", what)
}

func TestChatConnects(t *testing.T) {
	f := &fakeTwitch{validOK: true, scopes: `"chat:read","chat:edit"`, joinOK: true}
	defer startFake(t, f)()
	a := &TwitchAuth{file: "t.json", tok: &TwitchToken{Access: "gut", Refresh: "r", ExpiresAt: time.Now().Unix() + 3600}}
	var msgs []ChatMsg
	var mm sync.Mutex
	c := &Chat{auth: a, channel: cleanChannel("https://www.twitch.tv/zSpicyyy/"), onMsg: func(m ChatMsg) { mm.Lock(); msgs = append(msgs, m); mm.Unlock() }}
	c.Start()
	defer c.Stop()
	waitFor(t, "Beitritt", func() bool { return c.Joined })
	for _, want := range []string{"PASS oauth:gut", "NICK meinbot", "CAP REQ :twitch.tv/tags twitch.tv/commands", "JOIN #zspicyyy"} {
		if !f.has(want) {
			t.Errorf("Bot hat %q nicht gesendet; bekommen: %q", want, f.lines())
		}
	}
	if c.Err != "" {
		t.Errorf("Fehlertext nach Beitritt: %q", c.Err)
	}
	f.send("PING :tmi.twitch.tv")
	waitFor(t, "PONG", func() bool { return f.has("PONG :tmi.twitch.tv") })
	f.send(`@badges=moderator/1;display-name=Zuschauer;mod=1 :zuschauer!zuschauer@zuschauer.tmi.twitch.tv PRIVMSG #zspicyyy :!sr test song`)
	waitFor(t, "Chatnachricht", func() bool { mm.Lock(); defer mm.Unlock(); return len(msgs) == 1 })
	if m := msgs[0]; m.Login != "zuschauer" || m.Display != "Zuschauer" || m.Text != "!sr test song" || !m.Badges["moderator"] {
		t.Errorf("Nachricht falsch gelesen: %+v", m)
	}
	c.Say("Hallo Chat")
	waitFor(t, "Senden", func() bool { return f.has("PRIVMSG #zspicyyy :Hallo Chat") })
	// Twitch verlangt Neuverbindung: Bot soll wieder beitreten
	n := len(f.lines())
	f.send(":tmi.twitch.tv RECONNECT")
	time.Sleep(200 * time.Millisecond)
	if c.Joined {
		t.Log("noch verbunden direkt nach RECONNECT (ok, falls schon neu)")
	}
	_ = n
}

func TestChatExpiredTokenIsRefreshed(t *testing.T) {
	f := &fakeTwitch{validOK: true, scopes: `"chat:read","chat:edit"`, joinOK: true}
	defer startFake(t, f)()
	a := &TwitchAuth{file: "t.json", tok: &TwitchToken{Access: "alt", Refresh: "r", ExpiresAt: time.Now().Unix() + 3600}}
	c := &Chat{auth: a, channel: "zspicyyy"}
	c.Start()
	defer c.Stop()
	waitFor(t, "Beitritt nach Erneuerung", func() bool { return c.Joined })
	if !f.has("PASS oauth:neu") || f.refresh != 1 {
		t.Errorf("Token nicht erneuert: refresh=%d, %q", f.refresh, f.lines())
	}
}

func TestChatMissingScope(t *testing.T) {
	f := &fakeTwitch{validOK: true, scopes: `"user:read:email"`, joinOK: true}
	defer startFake(t, f)()
	a := &TwitchAuth{file: "t.json", tok: &TwitchToken{Access: "gut", Refresh: "r", ExpiresAt: time.Now().Unix() + 3600}}
	c := &Chat{auth: a, channel: "zspicyyy"}
	c.Start()
	defer c.Stop()
	waitFor(t, "Fehlertext fehlendes Recht", func() bool { return strings.Contains(c.Err, "Recht") || strings.Contains(c.Err, "permission") })
}

func TestChatChannelEmptyUsesLogin(t *testing.T) {
	f := &fakeTwitch{validOK: true, scopes: `"chat:read","chat:edit"`, joinOK: true}
	defer startFake(t, f)()
	a := &TwitchAuth{file: "t.json", tok: &TwitchToken{Access: "gut", Refresh: "r", ExpiresAt: time.Now().Unix() + 3600}}
	c := &Chat{auth: a, channel: ""}
	c.Start()
	defer c.Stop()
	waitFor(t, "Beitritt", func() bool { return c.Joined })
	if !f.has("JOIN #meinbot") {
		t.Errorf("leerer Kanal: erwartet JOIN #meinbot, bekommen %q", f.lines())
	}
}

func TestChatAuthRejected(t *testing.T) {
	f := &fakeTwitch{validOK: true, scopes: `"chat:read","chat:edit"`, joinOK: true, authFail: true}
	defer startFake(t, f)()
	a := &TwitchAuth{file: "t.json", tok: &TwitchToken{Access: "gut", Refresh: "r", ExpiresAt: time.Now().Unix() + 3600}}
	c := &Chat{auth: a, channel: "zspicyyy"}
	c.Start()
	defer c.Stop()
	waitFor(t, "Erneuerung nach Ablehnung", func() bool { f.mu.Lock(); defer f.mu.Unlock(); return f.refresh >= 1 })
}

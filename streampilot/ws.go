package main

// Kleiner WebSocket-Client (RFC 6455) ohne Zusatzpakete – für Twitch EventSub
// und die natürlichen Edge-Stimmen.

import (
	"bufio"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type WSConn struct {
	c   net.Conn
	r   *bufio.Reader
	wmu sync.Mutex
}

func wsDial(rawURL string, headers map[string]string) (*WSConn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "443"
	}
	d := &net.Dialer{Timeout: 15 * time.Second}
	c, err := tls.DialWithDialer(d, "tcp", net.JoinHostPort(host, port), &tls.Config{ServerName: host})
	if err != nil {
		return nil, err
	}
	keyb := make([]byte, 16)
	_, _ = rand.Read(keyb)
	key := base64.StdEncoding.EncodeToString(keyb)
	path := u.RequestURI()
	var sb strings.Builder
	fmt.Fprintf(&sb, "GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n", path, host, key)
	for k, v := range headers {
		fmt.Fprintf(&sb, "%s: %s\r\n", k, v)
	}
	sb.WriteString("\r\n")
	_ = c.SetDeadline(time.Now().Add(15 * time.Second))
	if _, err := c.Write([]byte(sb.String())); err != nil {
		c.Close()
		return nil, err
	}
	r := bufio.NewReader(c)
	resp, err := http.ReadResponse(r, nil)
	if err != nil {
		c.Close()
		return nil, err
	}
	if resp.StatusCode != 101 {
		c.Close()
		return nil, fmt.Errorf("websocket: status %d", resp.StatusCode)
	}
	_ = c.SetDeadline(time.Time{})
	return &WSConn{c: c, r: r}, nil
}

func (w *WSConn) Close() error { return w.c.Close() }

func (w *WSConn) SetReadDeadline(t time.Time) { _ = w.c.SetReadDeadline(t) }

func (w *WSConn) write(op byte, payload []byte) error {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	hdr := []byte{0x80 | op}
	n := len(payload)
	switch {
	case n < 126:
		hdr = append(hdr, 0x80|byte(n))
	case n < 65536:
		hdr = append(hdr, 0x80|126, byte(n>>8), byte(n))
	default:
		hdr = append(hdr, 0x80|127)
		b := make([]byte, 8)
		binary.BigEndian.PutUint64(b, uint64(n))
		hdr = append(hdr, b...)
	}
	mask := make([]byte, 4)
	_, _ = rand.Read(mask)
	hdr = append(hdr, mask...)
	out := make([]byte, n)
	for i := range payload {
		out[i] = payload[i] ^ mask[i%4]
	}
	_, err := w.c.Write(append(hdr, out...))
	return err
}

func (w *WSConn) WriteText(s string) error { return w.write(1, []byte(s)) }

// Read liefert die nächste vollständige Nachricht (text=true für Textnachrichten).
func (w *WSConn) Read() (data []byte, text bool, err error) {
	var first byte = 0xff
	for {
		h := make([]byte, 2)
		if _, err = io.ReadFull(w.r, h); err != nil {
			return
		}
		fin := h[0]&0x80 != 0
		op := h[0] & 0x0f
		n := uint64(h[1] & 0x7f)
		if n == 126 {
			b := make([]byte, 2)
			if _, err = io.ReadFull(w.r, b); err != nil {
				return
			}
			n = uint64(binary.BigEndian.Uint16(b))
		} else if n == 127 {
			b := make([]byte, 8)
			if _, err = io.ReadFull(w.r, b); err != nil {
				return
			}
			n = binary.BigEndian.Uint64(b)
		}
		var mask []byte
		if h[1]&0x80 != 0 {
			mask = make([]byte, 4)
			if _, err = io.ReadFull(w.r, mask); err != nil {
				return
			}
		}
		if n > 64<<20 {
			return nil, false, errors.New("websocket: frame too large")
		}
		p := make([]byte, n)
		if _, err = io.ReadFull(w.r, p); err != nil {
			return
		}
		if mask != nil {
			for i := range p {
				p[i] ^= mask[i%4]
			}
		}
		switch op {
		case 9: // ping
			_ = w.write(10, p)
			continue
		case 10:
			continue
		case 8:
			return nil, false, errors.New("websocket: closed by server")
		}
		if first == 0xff {
			first = op
		}
		data = append(data, p...)
		if fin {
			return data, first == 1, nil
		}
	}
}

package main

import (
	"encoding/json"
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

func TestSocialUploads(t *testing.T) {
	dataDir = t.TempDir()
	loadData()
	edit(func(d *Data) {
		d.TT = TTAuth{Access: "tt", Expiry: time.Now().Unix() + 3600}
		d.Meta = MetaAuth{Token: "u", Pages: []MetaPage{{ID: "p1", Name: "Seite", Token: "pt", IGID: "ig1"}}, PageID: "p1"}
	})
	vid := make([]byte, 23<<20+77)
	for i := range vid {
		vid[i] = byte(i * 7)
	}
	vf := filepath.Join(dataDir, "v.mp4")
	os.WriteFile(vf, vid, 0o644)
	var ttGot, fbGot, igGot []byte
	var ttPriv string
	var fbPublished, igPublished string
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		switch {
		case p == "/v2/post/publish/creator_info/query/":
			w.Write([]byte(`{"data":{"privacy_level_options":["SELF_ONLY","PUBLIC_TO_EVERYONE"]},"error":{"code":"ok"}}`))
		case p == "/v2/post/publish/video/init/":
			var m map[string]any
			json.NewDecoder(r.Body).Decode(&m)
			ttPriv = s(obj(m["post_info"])["privacy_level"])
			si := obj(m["source_info"])
			if int(num(si["total_chunk_count"])) != 2 {
				t.Errorf("chunks %v", si)
			}
			fmt.Fprintf(w, `{"data":{"publish_id":"pub1","upload_url":"%s/ttup"},"error":{"code":"ok"}}`, srv.URL)
		case p == "/ttup":
			b, _ := io.ReadAll(r.Body)
			ttGot = append(ttGot, b...)
			w.WriteHeader(201)
		case p == "/v2/post/publish/status/fetch/":
			w.Write([]byte(`{"data":{"status":"PUBLISH_COMPLETE"},"error":{"code":"ok"}}`))
		case p == "/p1/videos":
			r.ParseMultipartForm(64 << 20)
			switch r.FormValue("upload_phase") {
			case "start":
				w.Write([]byte(`{"upload_session_id":"s1","video_id":"fbv","start_offset":"0","end_offset":"10485760"}`))
			case "transfer":
				f, _, _ := r.FormFile("video_file_chunk")
				b, _ := io.ReadAll(f)
				fbGot = append(fbGot, b...)
				so := len(fbGot)
				eo := so + 10<<20
				if eo > len(vid) {
					eo = len(vid)
				}
				fmt.Fprintf(w, `{"start_offset":"%d","end_offset":"%d"}`, so, eo)
			case "finish":
				fbPublished = r.FormValue("published")
				w.Write([]byte(`{"success":true}`))
			}
		case p == "/ig1/media":
			r.ParseForm()
			if r.FormValue("media_type") != "REELS" {
				t.Error("not reels")
			}
			w.Write([]byte(`{"id":"c1","uri":"x"}`))
		case p == "/c1" && r.Method == "POST":
			b, _ := io.ReadAll(r.Body)
			igGot = b
			w.Write([]byte(`{"success":true}`))
		case p == "/c1":
			w.Write([]byte(`{"status_code":"FINISHED"}`))
		case p == "/ig1/media_publish":
			igPublished = "yes"
			w.Write([]byte(`{"id":"m1"}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, p)
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	ttAPI, graphBase, graphVideo, ruploadBase = srv.URL, srv.URL, srv.URL, srv.URL
	u := Upload{ID: "u", File: vf, Title: "Test", Tags: "minecraft, lets play"}
	id, note, err := ttUpload(u, func(float64) {})
	if err != nil || id != "pub1" || ttPriv != "SELF_ONLY" || string(ttGot) != string(vid) {
		t.Fatal("tt", id, note, err, ttPriv, len(ttGot))
	}
	u.TTPrivacy = "FOLLOWER_OF_CREATOR"
	if _, _, err := ttUpload(u, func(float64) {}); err == nil {
		t.Fatal("tt privacy not checked")
	}
	id, note, err = fbUpload(u, func(float64) {})
	if err != nil || id != "fbv" || fbPublished != "false" || string(fbGot) != string(vid) {
		t.Fatal("fb", id, err, fbPublished, len(fbGot))
	}
	id, note, err = igUpload(u, func(float64) {})
	if err != nil || id != "c1" || igPublished != "" || string(igGot) != string(vid) || !strings.Contains(note, "nicht") && !strings.Contains(note, "not") {
		t.Fatal("ig", id, note, err, igPublished)
	}
}

func TestMultiTargetState(t *testing.T) {
	dataDir = t.TempDir()
	loadData()
	edit(func(d *Data) {
		d.Uploads = []Upload{{ID: "a", Status: "wait", Targets: []string{"yt", "tt"}, TState: map[string]TState{"yt": {Status: "wait"}, "tt": {Status: "wait"}}}}
	})
	setT("a", "yt", func(x *TState) { x.Status = "done"; x.ID = "Y" })
	if u := view().Uploads[0]; u.Status != "wait" || u.VideoID != "Y" {
		t.Fatal(u.Status)
	}
	setT("a", "tt", func(x *TState) { x.Status = "error"; x.Error = "boom" })
	if u := view().Uploads[0]; u.Status != "error" || !strings.Contains(u.Error, "TikTok: boom") {
		t.Fatal(u.Status, u.Error)
	}
}

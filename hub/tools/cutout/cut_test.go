package cutout

import (
	"os"
	"testing"
	"time"
)

func TestCut(t *testing.T) {
	src := os.Getenv("CUT_SRC")
	if src == "" {
		t.Skip("CUT_SRC fehlt")
	}
	a := newApp()
	p, err := a.openImage(src)
	if err != nil {
		t.Fatal(err)
	}
	t0 := time.Now()
	for {
		time.Sleep(200 * time.Millisecond)
		a.mu.Lock()
		st, e := p.Status, p.Error
		a.mu.Unlock()
		if st == "ready" {
			break
		}
		if st == "error" {
			t.Fatal(e)
		}
	}
	t.Log("KI", time.Since(t0))
	t0 = time.Now()
	for _, bg := range []string{"", "#ff3cdc"} {
		dst, err := a.export(p, bg, "png", os.Getenv("CUT_OUT"))
		if err != nil {
			t.Fatal(err)
		}
		t.Log(dst, time.Since(t0))
	}
}

package main

import (
	"encoding/binary"
	"math"
	"os"
	"testing"
)

func readF32(t *testing.T, p string) []float32 {
	b, err := os.ReadFile(p)
	if err != nil {
		t.Skip(err)
	}
	v := make([]float32, len(b)/4)
	for i := range v {
		v[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4:]))
	}
	return v
}

func TestLogMel(t *testing.T) {
	in := readF32(t, "/tmp/claude-0/aitest/mel/in.f32")
	ref := readF32(t, "/tmp/claude-0/aitest/mel/ref.f32")
	got := logMel(in)
	var md float64
	for i := range ref {
		md = math.Max(md, math.Abs(float64(ref[i]-got[i])))
	}
	if md > 1e-3 {
		t.Fatalf("Abweichung %v", md)
	}
	t.Logf("max Abweichung %g", md)
}

func TestSplit(t *testing.T) {
	c := splitCue(0, 10, "Das ist ein sehr langer Satz, der in mehrere Untertitel aufgeteilt werden soll, weil er so lang ist. Und hier kommt noch ein zweiter Satz dazu.")
	for _, x := range c {
		t.Logf("%.2f-%.2f %q", x.S, x.E, x.Text)
	}
	if len(c) < 2 || math.Abs(c[len(c)-1].E-10) > 1e-6 {
		t.Fatal("Aufteilung falsch")
	}
}

func TestLogMelVals(t *testing.T) {
	in := readF32(t, "/tmp/claude-0/aitest/mel/in.f32")
	ref := readF32(t, "/tmp/claude-0/aitest/mel/ref.f32")
	got := logMel(in)
	for _, i := range []int{0, 10*3000 + 50, 20*3000 + 100, 40*3000 + 150, 79*3000 + 2999} {
		t.Logf("%d ref %v got %v", i, ref[i], got[i])
	}
}

func TestVocab(t *testing.T) {
	p := t.TempDir() + "/v.json"
	os.WriteFile(p, []byte(`{"Hallo":1,"ĠWelt":2,"Ġsch":3,"Ã¶":4,"n":5}`), 0o644)
	tk, err := loadVocab(p)
	if err != nil {
		t.Fatal(err)
	}
	if s := tk.text([]int{1, 2, 3, 4, 5, 50257}); s != "Hallo Welt schön" {
		t.Fatalf("%q", s)
	}
}

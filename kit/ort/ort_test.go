//go:build linux

package ort

import (
	"os"
	"testing"
)

func TestMagika(t *testing.T) {
	lib := os.Getenv("ORT_LIB")
	model := os.Getenv("ORT_MODEL")
	if lib == "" {
		t.Skip("ORT_LIB fehlt")
	}
	if err := Init(lib); err != nil {
		t.Fatal(err)
	}
	if _, err := Open("/gibt/es/nicht.onnx", 1); err == nil {
		t.Fatal("Fehler erwartet")
	} else {
		t.Log("Fehlermeldung:", err)
	}
	s, err := Open(model, 2)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("in %+v out %+v", s.In, s.Out)
	in := make([]int32, 2048)
	for i := range in {
		in[i] = int32(i % 256)
	}
	out, dims, err := s.Run(in, []int64{1, 2048})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("dims %v first %v", dims, out[:5])
}

func TestMulti(t *testing.T) {
	lib := os.Getenv("ORT_LIB")
	if lib == "" {
		t.Skip("ORT_LIB fehlt")
	}
	if err := Init(lib); err != nil {
		t.Fatal(err)
	}
	s, err := Open("/tmp/claude-0/aitest/two.onnx", 1)
	if err != nil {
		t.Fatal(err)
	}
	out, dims, err := s.RunMulti(map[string]Tensor{"ids": {[]int64{1, 2, 3}, []int64{1, 3}}, "h": {[]float32{.5, .5, .5}, []int64{1, 3}}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 3 || out[2] != 3.5 {
		t.Fatalf("falsch: %v %v", out, dims)
	}
}

package ollama

import (
	"os"
	"path/filepath"
	"testing"
)

func fake(t *testing.T, ver string) {
	bin := t.TempDir()
	os.WriteFile(filepath.Join(bin, "ollama"), []byte("#!/bin/sh\necho 'Warning: could not connect to a running Ollama instance'\necho 'Warning: client version is "+ver+"'\n"), 0o755)
	t.Setenv("PATH", bin+":/usr/bin:/bin")
}

func TestCheck(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, "c"))
	if s := Check("qwen2.5:3b"); s.Need != "install" {
		t.Fatalf("ohne Ollama: %+v", s)
	}
	fake(t, "0.3.14")
	if s := Check("qwen2.5:3b"); s.Need != "update" || s.Version != "0.3.14" {
		t.Fatalf("altes Ollama: %+v", s)
	}
	fake(t, "0.6.2")
	if s := Check("qwen2.5:3b"); s.Need != "model" || s.Version != "0.6.2" {
		t.Fatalf("passendes Ollama ohne Modell: %+v", s)
	}
	m := filepath.Join(home, ".ollama", "models", "manifests", "registry.ollama.ai", "library", "qwen2.5")
	os.MkdirAll(m, 0o755)
	os.WriteFile(filepath.Join(m, "3b"), []byte("{}"), 0o644)
	if s := Check("qwen2.5:3b"); s.Need != "" || !Installed("qwen2.5:3b") {
		t.Fatalf("passendes Ollama mit Modell: %+v", s)
	}
}

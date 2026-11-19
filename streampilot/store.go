package main

// Speicher: Alle Nutzerdaten liegen getrennt vom Programm unter %APPDATA%\StreamPilot.
// Updates ersetzen nur die .exe – Logins und Einstellungen bleiben dadurch immer erhalten.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

var dataDir string

func initDataDir(root string) {
	dataDir = root
	_ = os.MkdirAll(dataDir, 0o755)
}

func dataPath(name string) string { return filepath.Join(dataDir, name) }

func loadJSON(name string, v any) bool {
	b, err := os.ReadFile(dataPath(name))
	if err != nil {
		return false
	}
	return json.Unmarshal(b, v) == nil
}

func saveJSON(name string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := dataPath(name + ".tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, dataPath(name))
}

// ---------------------------------------------------------------- Einstellungen
// Bewusst als freie JSON-Struktur: neue Felder kommen mit Standardwerten dazu,
// alte Einstellungen bleiben bei jedem Update erhalten.

type Store struct {
	mu sync.RWMutex
	m  map[string]any
}

var cfg = &Store{m: map[string]any{}}

func (s *Store) Load() {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := map[string]any{}
	if loadJSON("settings.json", &m) {
		s.m = m
	}
}

func (s *Store) Save() {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_ = saveJSON("settings.json", s.m)
}

func (s *Store) Snapshot() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, _ := json.Marshal(s.m)
	out := map[string]any{}
	_ = json.Unmarshal(b, &out)
	return out
}

// Section liefert eine Kopie eines Unterbereichs (z. B. "tts").
func (s *Store) Section(name string) map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if v, ok := s.m[name].(map[string]any); ok {
		b, _ := json.Marshal(v)
		out := map[string]any{}
		_ = json.Unmarshal(b, &out)
		return out
	}
	return map[string]any{}
}

func (s *Store) SetSection(name string, v map[string]any) {
	s.mu.Lock()
	s.m[name] = v
	s.mu.Unlock()
	s.Save()
}

func (s *Store) Get(key string) any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.m[key]
}

func (s *Store) Set(key string, v any) {
	s.mu.Lock()
	if v == nil {
		delete(s.m, key)
	} else {
		s.m[key] = v
	}
	s.mu.Unlock()
	s.Save()
}

// Hilfen für typsichere Zugriffe auf freie JSON-Werte
func str(m map[string]any, k, def string) string {
	if v, ok := m[k].(string); ok {
		return v
	}
	return def
}

func num(m map[string]any, k string, def float64) float64 {
	switch v := m[k].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	}
	return def
}

func boolean(m map[string]any, k string, def bool) bool {
	if v, ok := m[k].(bool); ok {
		return v
	}
	return def
}

func sub(m map[string]any, k string) map[string]any {
	if v, ok := m[k].(map[string]any); ok {
		return v
	}
	return map[string]any{}
}

func (s *Store) Str(k, def string) string     { return str(s.Snapshot(), k, def) }
func (s *Store) Bool(k string, def bool) bool { return boolean(s.Snapshot(), k, def) }

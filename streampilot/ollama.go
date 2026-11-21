package main

// Lokale KI für den Sortierer: gemeinsamer Baustein kit/ollama (ein Ordner für alle Werkzeuge,
// läuft nur solange StreamPilot offen ist).

import (
	"strings"

	"kit/ollama"
)

const defaultModel = "qwen2.5:3b"

var ai = ollama.P

func aiModel() string {
	if m := strings.TrimSpace(gStr("aiModel")); m != "" {
		return m
	}
	return defaultModel
}

func aiReady() bool { return ollama.Ready(aiModel()) }

func setupAI() { ollama.Setup(aiModel(), true) }

// ensureAIStarted: KI starten, wenn sie installiert ist (StreamPilot geöffnet → KI an).
func ensureAIStarted() {
	if ollama.Installed(aiModel()) || ollama.Bin() != "" {
		_ = ollama.Start()
	}
}

func aiState() map[string]any {
	u := ollama.UserByID("streampilot")
	return map[string]any{"ai": ai.Snapshot(), "aiReady": aiReady(), "installed": ollama.Installed(aiModel()),
		"asked": ollama.Asked("streampilot"), "purpose": u.Purpose, "size": ollama.SizeText()}
}

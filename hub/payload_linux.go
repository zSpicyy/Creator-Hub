package main

import (
	"embed"
	"kit/setup"
	"path/filepath"
)

// Eigenständige Werkzeuge für Linux
//
//go:embed payload/linux
var payload embed.FS

const payloadDir = "payload/linux"

func exeName(n string) string { return n }

// afterExtract: Symbol und Fensterklasse des Werkzeugs anmelden (richtiges Symbol in Dock/Taskleiste).
func afterExtract(exe string) {
	png, _ := payload.ReadFile(payloadDir + "/" + exe + ".png")
	title := toolTitleOf(exe)
	setup.RegisterTool(filepath.Join(toolsDir(), exe), exe, title, png)
}

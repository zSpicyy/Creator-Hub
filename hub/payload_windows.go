package main

import (
	"embed"
	"kit/setup"
	"path/filepath"
	"strings"
)

// Eigenständige Werkzeuge für Windows
//
//go:embed payload/windows
var payload embed.FS

const payloadDir = "payload/windows"

func exeName(n string) string { return n + ".exe" }

// afterExtract: Verknüpfung im Startmenü (zum Anheften an Taskleiste/Start) und einmalig auf dem Desktop.
func afterExtract(exe string) {
	name := strings.TrimSuffix(filepath.Base(exe), ".exe")
	setup.ToolShortcuts(filepath.Join(toolsDir(), exe), toolTitleOf(name))
}

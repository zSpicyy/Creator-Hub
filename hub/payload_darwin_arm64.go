package main

import "embed"

// Werkzeuge für Macs mit Apple-Chip
//
//go:embed payload/darwin-arm64
var payload embed.FS

const payloadDir = "payload/darwin-arm64"

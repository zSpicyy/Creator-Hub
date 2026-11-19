package main

import "embed"

// Werkzeuge für Macs mit Intel-Chip
//
//go:embed payload/darwin-amd64
var payload embed.FS

const payloadDir = "payload/darwin-amd64"

package main

import (
	"os"
	"path/filepath"
	"strings"
)

// macOS: jedes Werkzeug wird als eigene kleine App ausgepackt (Werkzeuge/Videoschnitt.app),
// damit Dock und Menüleiste den richtigen Namen und das richtige Symbol zeigen.
func exeName(n string) string { return n + ".app/Contents/MacOS/" + n }

var toolTitle = map[string][2]string{
	"Videoschnitt":    {"Videoschnitt", "Video Editor"},
	"MP3-Schneider":   {"MP3 Schneider", "MP3 Splitter"},
	"Bildbearbeitung": {"Bildbearbeitung", "Image Editor"},
	"Dateityp-Umwandler": {"Dateityp-Umwandler", "File Converter"},
	"Motion-Design":      {"Motion Design", "Motion Design"},
	"StreamPilot":        {"StreamPilot", "StreamPilot"},
	"Social-Planer":          {"Social-Planer", "Social-Planer"},
}

// afterExtract legt Info.plist und Symbol der Werkzeug-App an.
func afterExtract(exe string) {
	name := filepath.Base(exe)
	contents := filepath.Join(toolsDir(), name+".app", "Contents")
	os.MkdirAll(filepath.Join(contents, "Resources"), 0o755)
	if b, err := payload.ReadFile(payloadDir + "/" + name + ".icns"); err == nil {
		os.WriteFile(filepath.Join(contents, "Resources", "icon.icns"), b, 0o644)
	}
	title := toolTitleOf(name)
	id := strings.ToLower(strings.ReplaceAll(name, "-", ""))
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>` + title + `</string>
<key>CFBundleDisplayName</key><string>` + title + `</string>
<key>CFBundleIdentifier</key><string>app.creatorhub.` + id + `</string>
<key>CFBundleExecutable</key><string>` + name + `</string>
<key>CFBundleIconFile</key><string>icon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>
`
	os.WriteFile(filepath.Join(contents, "Info.plist"), []byte(plist), 0o644)
	// Als eigene App erreichbar: im Ordner „Programme“ des Benutzers (Launchpad, Spotlight, Dock)
	// und einmalig auf dem Schreibtisch
	app := filepath.Join(toolsDir(), name+".app")
	home, _ := os.UserHomeDir()
	apps := filepath.Join(home, "Applications")
	os.MkdirAll(apps, 0o755)
	link := filepath.Join(apps, title+".app")
	os.Remove(link)
	os.Symlink(app, link)
	mark := filepath.Join(toolsDir(), name+".desktop-angelegt")
	if _, err := os.Stat(mark); err != nil {
		d := filepath.Join(home, "Desktop", title+".app")
		if _, err := os.Lstat(d); err != nil {
			os.Symlink(app, d)
		}
		os.WriteFile(mark, []byte("1"), 0o644)
	}
}

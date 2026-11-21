package main

import (
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"kit"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// Eigenständige Werkzeuge stecken gepackt im Hub und werden erst beim ersten Benutzen ausgepackt.
//

func toolsDir() string { return filepath.Join(kit.ProgramDir(), "CreatorHub", "Werkzeuge") }

func extractTool(exe string, prog func(float64)) error {
	f, err := payload.Open(payloadDir + "/" + filepath.Base(exe) + ".gz")
	if err != nil {
		return errors.New("Dieses Werkzeug ist in dieser Version nicht enthalten.")
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	dst := filepath.Join(toolsDir(), exe)
	os.MkdirAll(filepath.Dir(dst), 0o755)
	out, err := os.OpenFile(dst+".tmp", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, zr)
	out.Close()
	if err != nil {
		os.Remove(dst + ".tmp")
		return err
	}
	prog(1)
	if err := os.Rename(dst+".tmp", dst); err != nil {
		// Werkzeug läuft gerade: Windows erlaubt das Umbenennen der laufenden Datei.
		// Die alte Version läuft weiter, beim nächsten Start kommt die neue.
		old := dst + ".alt-" + strconv.FormatInt(time.Now().UnixNano(), 36)
		if os.Rename(dst, old) != nil || os.Rename(dst+".tmp", dst) != nil {
			os.Remove(dst + ".tmp")
			return err
		}
	}
	afterExtract(exe)
	os.WriteFile(dst+".stand", []byte(payloadHash(exe)), 0o644)
	return nil
}

// payloadHash ist der Fingerabdruck des eingepackten Werkzeugs (ändert sich mit jeder neuen Version).
func payloadHash(exe string) string {
	b, err := payload.ReadFile(payloadDir + "/" + filepath.Base(exe) + ".gz")
	if err != nil {
		return ""
	}
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:8])
}

// refreshTools bringt bereits ausgepackte Werkzeuge nach einem Hub-Update auf den neuen Stand.
// Läuft ein Werkzeug gerade, lässt Windows das Ersetzen nicht zu; dann klappt es beim nächsten Start.
func refreshTools(exes []string) {
	// Reste alter Versionen wegräumen (klappt, sobald sie nicht mehr laufen)
	if olds, _ := filepath.Glob(filepath.Join(toolsDir(), "*.alt-*")); len(olds) > 0 {
		for _, o := range olds {
			os.Remove(o)
		}
	}
	for _, exe := range exes {
		dst := filepath.Join(toolsDir(), exe)
		if _, err := os.Stat(dst); err != nil {
			continue
		}
		want := payloadHash(exe)
		if want == "" {
			continue
		}
		if old, _ := os.ReadFile(dst + ".stand"); string(old) == want {
			continue
		}
		extractTool(exe, func(float64) {})
	}
}

// Anzeigenamen der eigenständigen Apps (für Verknüpfungen, Startmenü, Dock)
func toolTitleOf(name string) string {
	switch name {
	case "Videoschnitt":
		return kit.T("Videoschnitt", "Video Editor")
	case "MP3-Schneider":
		return kit.T("MP3 Schneider", "MP3 Splitter")
	case "Bildbearbeitung":
		return kit.T("Bildbearbeitung", "Image Editor")
	case "Dateityp-Umwandler":
		return kit.T("Dateityp-Umwandler", "File Converter")
	case "Motion-Design":
		return "Motion Design"
	case "StreamPilot":
		return "StreamPilot"
	case "Social-Planer":
		return "Social-Planer"
	}
	return name
}

// Der Dateityp-Umwandler läuft im Hub, gibt es aber zusätzlich als eigene App (eigenes Fenster,
// Desktop-Verknüpfung, Taskleiste). Sie wird ausgepackt, sobald der Umwandler eingerichtet ist.
const converterApp = "Dateityp-Umwandler"

func ensureConverterApp() {
	exe := exeName(converterApp)
	if _, err := os.Stat(filepath.Join(toolsDir(), exe)); err == nil {
		return
	}
	extractTool(exe, func(float64) {})
}

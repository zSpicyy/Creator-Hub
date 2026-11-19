package setup

import (
	"os"
	"path/filepath"
	"time"
)

// Ordner, in denen die Werkzeuge ihre Projekte ablegen (unter dem Benutzer-Einstellungsordner)
var dataApps = []string{"CreatorHub", "Bildbearbeitung", "Videoschnitt", "MP3-Schneider", "Dateityp-Umwandler", "Upscaler", "MotionDesign", "StreamPilot"}

// OldProjects zählt Projekte, die von einer früheren Installation übrig sind.
func OldProjects() int {
	cfg, _ := os.UserConfigDir()
	n := 0
	for _, a := range dataApps {
		es, _ := os.ReadDir(filepath.Join(cfg, a, "projects"))
		n += len(es)
	}
	return n
}

// Fresh: Creator Hub ist noch nicht installiert (keine Programmdatei vorhanden).
func Fresh() bool {
	_, err := os.Stat(filepath.Join(InstallDir(), ExeName))
	return err != nil
}

// ArchiveOldData verschiebt Projekte und Verlauf einer früheren Installation in einen Archivordner,
// damit der Hub leer startet. Nichts wird gelöscht; Einstellungen und KI-Modelle bleiben.
func ArchiveOldData() string {
	cfg, _ := os.UserConfigDir()
	dst := filepath.Join(cfg, "CreatorHub-Archiv", time.Now().Format("2006-01-02_15-04-05"))
	moved := false
	mv := func(src, rel string) {
		if _, err := os.Stat(src); err != nil {
			return
		}
		t := filepath.Join(dst, rel)
		os.MkdirAll(filepath.Dir(t), 0o755)
		if os.Rename(src, t) == nil {
			moved = true
		}
	}
	for _, a := range dataApps {
		mv(filepath.Join(cfg, a, "projects"), filepath.Join(a, "projects"))
	}
	mv(filepath.Join(cfg, "CreatorHub", "verlauf.json"), filepath.Join("CreatorHub", "verlauf.json"))
	mv(filepath.Join(cfg, "Videoschnitt", "Bibliothek"), filepath.Join("Videoschnitt", "Bibliothek"))
	if !moved {
		return ""
	}
	return dst
}

// DeleteUserData löscht alle Projekte, Einstellungen und Daten der Werkzeuge (nur nach Rückfrage).
func DeleteUserData() {
	cfg, _ := os.UserConfigDir()
	for _, a := range dataApps {
		os.RemoveAll(filepath.Join(cfg, a))
	}
	os.RemoveAll(filepath.Join(cfg, "CreatorHub-Archiv"))
}

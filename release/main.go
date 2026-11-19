// creatorhub-release erstellt die signierte Update-Datei latest.json für eine neue Version.
//
//	Schlüssel einmalig erzeugen:  creatorhub-release keygen
//	Neue Version veröffentlichen: creatorhub-release make -version 1.0.1 -github name/creator-hub \
//	    -windows Creator-Hub-Setup.exe -linux Creator-Hub-x86_64.AppImage \
//	    -mac-arm64 Creator-Hub-macOS-AppleSilicon.zip -mac-amd64 Creator-Hub-macOS-Intel.zip -notes-en "..." -notes-de "..."
//	(statt -github geht auch -base https://deine-seite.de/creatorhub)
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type File struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type Manifest struct {
	Version string            `json:"version"`
	Date    string            `json:"date"`
	Notes   map[string]string `json:"notes"`
	Files   map[string]File   `json:"files"`
	Tools   map[string]map[string]File `json:"tools,omitempty"` // Werkzeug -> System -> Datei
}

func die(f string, a ...any) { fmt.Fprintf(os.Stderr, f+"\n", a...); os.Exit(1) }

func hashFile(p string) (string, int64) {
	f, err := os.Open(p)
	if err != nil {
		die("Datei fehlt: %s", p)
	}
	defer f.Close()
	h := sha256.New()
	n, _ := io.Copy(h, f)
	return hex.EncodeToString(h.Sum(nil)), n
}

func main() {
	if len(os.Args) < 2 {
		die("Aufruf: creatorhub-release keygen | make ...")
	}
	switch os.Args[1] {
	case "keygen":
		fs := flag.NewFlagSet("keygen", flag.ExitOnError)
		out := fs.String("key", "creatorhub-release.key", "Datei für den privaten Schlüssel")
		fs.Parse(os.Args[2:])
		if _, err := os.Stat(*out); err == nil {
			die("%s gibt es schon. Ein neuer Schlüssel würde alle bisherigen Installationen von Updates abschneiden.", *out)
		}
		pub, priv, _ := ed25519.GenerateKey(rand.Reader)
		os.WriteFile(*out, []byte(base64.StdEncoding.EncodeToString(priv.Seed())+"\n"), 0o600)
		fmt.Println("Privater Schlüssel:", *out, "(geheim halten, nie hochladen)")
		fmt.Println("Öffentlicher Schlüssel:", hex.EncodeToString(pub))
	case "make":
		fs := flag.NewFlagSet("make", flag.ExitOnError)
		ver := fs.String("version", "", "neue Versionsnummer, z. B. 1.0.1")
		base := fs.String("base", "", "Adresse des Ordners auf der Website, in dem die Dateien liegen")
		win := fs.String("windows", "", "Creator-Hub-Setup.exe")
		lin := fs.String("linux", "", "Creator-Hub-x86_64.AppImage")
		macA := fs.String("mac-arm64", "", "Creator-Hub-macOS-AppleSilicon.zip")
		macI := fs.String("mac-amd64", "", "Creator-Hub-macOS-Intel.zip")
		gh := fs.String("github", "", "GitHub-Projekt, z. B. name/creator-hub (Dateien liegen in der Veröffentlichung v<version>)")
		nen := fs.String("notes-en", "", "Was ist neu (Englisch)")
		nde := fs.String("notes-de", "", "Was ist neu (Deutsch)")
		key := fs.String("key", "creatorhub-release.key", "privater Schlüssel")
		out := fs.String("out", "latest.json", "Ausgabedatei")
		tools := fs.String("tools", "", "Ordner mit den einzelnen Werkzeugen (<Name>-Windows.exe usw.)")
		test := fs.Bool("test", false, "nur zum Testen: http:// erlauben")
		fs.Parse(os.Args[2:])
		if *gh != "" {
			*base = "https://github.com/" + strings.Trim(*gh, "/") + "/releases/download/v" + strings.TrimPrefix(*ver, "v")
		}
		if *ver == "" || *base == "" || (*win == "" && *lin == "" && *macA == "" && *macI == "") {
			die("Bitte -version, -github (oder -base) und mindestens eine Programmdatei angeben.")
		}
		if !strings.HasPrefix(*base, "https://") && !*test {
			die("Die Website-Adresse muss mit https:// beginnen.")
		}
		raw, err := os.ReadFile(*key)
		if err != nil {
			die("Privater Schlüssel fehlt: %s", *key)
		}
		seed, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
		if err != nil || len(seed) != ed25519.SeedSize {
			die("Der private Schlüssel ist beschädigt.")
		}
		priv := ed25519.NewKeyFromSeed(seed)
		m := Manifest{Version: *ver, Date: time.Now().UTC().Format("2006-01-02"), Notes: map[string]string{"en": *nen, "de": *nde}, Files: map[string]File{}}
		add := func(plat, p string) {
			if p == "" {
				return
			}
			sum, n := hashFile(p)
			m.Files[plat] = File{URL: strings.TrimRight(*base, "/") + "/" + filepath.Base(p), SHA256: sum, Size: n}
		}
		add("windows-amd64", *win)
		add("linux-amd64", *lin)
		add("darwin-arm64", *macA)
		add("darwin-amd64", *macI)
		if *tools != "" {
			suf := map[string]string{"-Windows.exe": "windows-amd64", "-Linux-x86_64.AppImage": "linux-amd64", "-macOS-AppleSilicon.zip": "darwin-arm64", "-macOS-Intel.zip": "darwin-amd64"}
			es, err := os.ReadDir(*tools)
			if err != nil {
				die("Werkzeug-Ordner fehlt: %s", *tools)
			}
			m.Tools = map[string]map[string]File{}
			for _, e := range es {
				for sx, plat := range suf {
					if name := e.Name(); strings.HasSuffix(name, sx) && !strings.HasPrefix(name, "Creator-Hub") {
						t := strings.TrimSuffix(name, sx)
						if m.Tools[t] == nil {
							m.Tools[t] = map[string]File{}
						}
						sum, n := hashFile(filepath.Join(*tools, name))
						m.Tools[t][plat] = File{URL: strings.TrimRight(*base, "/") + "/" + name, SHA256: sum, Size: n}
					}
				}
			}
			fmt.Printf("%d Werkzeuge in latest.json aufgenommen.\n", len(m.Tools))
		}
		payload, _ := json.Marshal(m)
		sig := ed25519.Sign(priv, payload)
		doc, _ := json.MarshalIndent(map[string]string{"payload": base64.StdEncoding.EncodeToString(payload), "signature": base64.StdEncoding.EncodeToString(sig)}, "", "  ")
		os.WriteFile(*out, doc, 0o644)
		fmt.Printf("%s erstellt für Version %s.\nLade %s und die Programmdateien in %s hoch.\n", *out, *ver, *out, *base)
	default:
		die("Unbekannter Befehl: %s", os.Args[1])
	}
}

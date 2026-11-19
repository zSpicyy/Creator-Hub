package main

import (
	"kit"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"kit/ai"
	"kit/setup"
)

// handleInstall: „./Creator-Hub --install“ installiert die App für den aktuellen Benutzer,
// legt den Eintrag im Anwendungsmenü an und richtet die KI ein.
func handleInstall() bool {
	if len(os.Args) < 2 || os.Args[1] != "--install" {
		return false
	}
	desktop := !(len(os.Args) > 2 && os.Args[2] == "--no-desktop")
	if err := installSelf(desktop); err != nil {
		setup.Info(kit.T("Die Installation ist fehlgeschlagen: ", "Installation failed: ") + err.Error())
		os.Exit(1)
	}
	return true
}

func installSelf(desktop bool) error {
	src, err := os.Executable()
	if err != nil {
		return err
	}
	src, _ = filepath.EvalSymlinks(src)
	dir := setup.InstallDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	dst := filepath.Join(dir, setup.ExeName)
	if src != dst {
		fmt.Println(kit.T("Programm wird installiert …", "Installing the program …"))
		in, err := os.Open(src)
		if err != nil {
			return err
		}
		out, err := os.OpenFile(dst+".neu", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			in.Close()
			return err
		}
		_, err = io.Copy(out, in)
		in.Close()
		out.Close()
		if err != nil {
			return err
		}
		if err := os.Rename(dst+".neu", dst); err != nil {
			return err
		}
	}
	fmt.Println(kit.T("Eintrag im Anwendungsmenü wird angelegt …", "Adding the app menu entry …"))
	if err := setup.CreateShortcuts(dst, desktop); err != nil {
		return err
	}
	fmt.Println(kit.T("KI wird eingerichtet …", "Setting up the AI …"))
	ai.Install("upscale")
	last := -1
	for {
		time.Sleep(300 * time.Millisecond)
		s := ai.Get("upscale")
		if p := int(s.Done * 100); p/10 != last/10 {
			last = p
			fmt.Printf("  %d %%\n", p)
		}
		if !s.Loading {
			if s.Error != "" {
				fmt.Println(kit.T("Die KI konnte gerade nicht geladen werden ("+s.Error+"). Sie wird beim ersten Öffnen des Upscalers nachgeladen.", "The AI could not be downloaded right now ("+s.Error+"). It will be downloaded the first time you open the Upscaler."))
			}
			break
		}
	}
	fmt.Println(kit.T("Fertig. Creator Hub findest du im Anwendungsmenü.", "Done. You can find Creator Hub in your app menu."))
	cmd := exec.Command(dst)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Start()
	return nil
}

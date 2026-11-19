//go:build windows

package main

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"

	"kit"
)

const psHead = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;Add-Type -AssemblyName System.Windows.Forms;` +
	`$o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true;ShowInTaskbar=$false;WindowState='Minimized'};`

func pickPath(mode string) (string, error) {
	var script string
	if mode == "folder" {
		script = psHead + `$d=New-Object System.Windows.Forms.FolderBrowserDialog;$d.Description='Wohin sollen die Dateien?';$d.ShowNewFolderButton=$true;if($d.ShowDialog($o) -eq 'OK'){$d.SelectedPath}`
	} else {
		script = psHead + `$d=New-Object System.Windows.Forms.OpenFileDialog;$d.Filter='MP3-Dateien (*.mp3)|*.mp3|Alle Dateien (*.*)|*.*';if($d.ShowDialog($o) -eq 'OK'){$d.FileName}`
	}
	cmd := exec.Command("powershell", "-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	if err != nil {
		return "", errors.New("Das Auswahlfenster ließ sich nicht öffnen. Füge den Pfad bitte ins Feld ein.")
	}
	return strings.TrimSpace(strings.TrimPrefix(string(out), "\xef\xbb\xbf")), nil
}

func openFolder(p string) {
	if p != "" {
		kit.StartApp(exec.Command("explorer", p))
	}
}

type shFileOp struct {
	hwnd     uintptr
	wFunc    uint32
	pFrom    *uint16
	pTo      *uint16
	flags    uint16
	aborted  int32
	mappings uintptr
	title    *uint16
}

// moveToTrash legt Dateien in den Papierkorb, damit man sie wiederherstellen kann.
func moveToTrash(paths []string) error {
	list := []uint16{}
	for _, p := range paths {
		u, err := windows.UTF16FromString(p)
		if err != nil {
			return err
		}
		list = append(list, u...)
	}
	list = append(list, 0)
	const foDelete, flags = 3, 0x0040 | 0x0010 | 0x0004 | 0x0400 // Papierkorb, keine Rückfrage, leise, keine Fehlerfenster
	op := shFileOp{wFunc: foDelete, pFrom: &list[0], flags: flags}
	r, _, _ := windows.NewLazySystemDLL("shell32.dll").NewProc("SHFileOperationW").Call(uintptr(unsafe.Pointer(&op)))
	if r != 0 {
		return fmt.Errorf("Windows meldet Fehler %d", r)
	}
	if op.aborted != 0 {
		return errors.New("Der Vorgang wurde abgebrochen.")
	}
	return nil
}

func openURL(u string) {
	kit.StartApp(exec.Command("rundll32", "url.dll,FileProtocolHandler", u))
}

func blobOf(b []byte) *windows.DataBlob {
	if len(b) == 0 {
		return &windows.DataBlob{}
	}
	return &windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
}

func blobBytes(d *windows.DataBlob) []byte {
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(d.Data)))
	return append([]byte(nil), unsafe.Slice(d.Data, d.Size)...)
}

// protect verschlüsselt den Spotify-Zugang so, dass nur dieses Windows-Konto ihn lesen kann.
func protect(b []byte) ([]byte, error) {
	var out windows.DataBlob
	if err := windows.CryptProtectData(blobOf(b), nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return blobBytes(&out), nil
}

func unprotect(b []byte) ([]byte, error) {
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(blobOf(b), nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return blobBytes(&out), nil
}



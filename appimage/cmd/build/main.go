// Baut ein AppImage: build <AppDir> <Startprogramm> <Ausgabe>
package main

import (
	"appimage/sqfs"
	"encoding/binary"
	"fmt"
	"io"
	"os"
)

func main() {
	if len(os.Args) != 4 {
		fmt.Println("build <AppDir> <runtime> <out.AppImage>")
		os.Exit(2)
	}
	rt, err := os.ReadFile(os.Args[2])
	check(err)
	if len(rt) < 16 || string(rt[1:4]) != "ELF" {
		check(fmt.Errorf("Startprogramm ist kein ELF"))
	}
	rt[8], rt[9], rt[10] = 'A', 'I', 2 // AppImage-Typ-2-Kennung
	// Go legt die Abschnittstabelle an den Dateianfang. AppImage-Werkzeuge (get_appimage_offset, 7-Zip,
	// Gear Lever, AppImageLauncher) suchen das SquashFS aber direkt hinter dieser Tabelle. Darum die
	// Tabelle ans Ende kopieren und e_shoff darauf zeigen lassen.
	shoff := binary.LittleEndian.Uint64(rt[40:])
	shentsize, shnum := uint64(binary.LittleEndian.Uint16(rt[58:])), uint64(binary.LittleEndian.Uint16(rt[60:]))
	if tbl := shentsize * shnum; tbl > 0 && shoff+tbl < uint64(len(rt)) {
		for len(rt)%8 != 0 {
			rt = append(rt, 0)
		}
		newOff := uint64(len(rt))
		rt = append(rt, rt[shoff:shoff+tbl]...)
		binary.LittleEndian.PutUint64(rt[40:], newOff)
	}
	out, err := os.OpenFile(os.Args[3], os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	check(err)
	_, err = out.Write(rt)
	check(err)
	check(sqfs.Write(out, os.Args[1]))
	check(out.Close())
	// Probe: wieder lesen und vollständig entpacken
	f, _ := os.Open(os.Args[3])
	s, err := sqfs.Open(f, int64(len(rt)))
	check(err)
	tmp, _ := os.MkdirTemp("", "aiprobe")
	defer os.RemoveAll(tmp)
	check(s.Extract(tmp))
	fi, _ := os.Stat(os.Args[3])
	fmt.Printf("ok: %s (%.1f MB)\n", os.Args[3], float64(fi.Size())/1e6)
	_ = io.EOF
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "Fehler:", err)
		os.Exit(1)
	}
}

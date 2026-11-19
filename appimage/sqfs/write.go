// Package sqfs schreibt und liest SquashFS-4.0-Abbilder ohne Kompression (Daten, Inodes, Verzeichnisse,
// IDs alle als „unkomprimiert“ markiert). Das ist gültiges SquashFS, das jedes Werkzeug lesen kann, und
// reicht für AppImages, deren Inhalt (Go-Programme mit gepackten Nutzlasten) ohnehin kaum schrumpft.
package sqfs

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const (
	blockSize = 1 << 17
	blockLog  = 17
	metaSize  = 8192

	tDir     = 1
	tFile    = 2
	tSymlink = 3

	flags = 0x0001 | 0x0002 | 0x0008 | 0x0010 | 0x0200 | 0x0800 // alles unkomprimiert, keine Fragmente/Xattrs
)

type node struct {
	name     string
	path     string
	mode     fs.FileMode
	kids     []*node
	target   string
	size     int64
	ino      uint32
	ref      uint64 // Inode-Referenz (Block<<16 | Versatz)
	pos      int    // Position im (unkomprimierten) Inode-Strom
	ilen     int
	dataPos  uint64
	blocks   []uint32
	dirStart uint32
	dirOff   uint16
	dirSize  uint32
	parent   *node
}

func scan(path, name string, parent *node) (*node, error) {
	fi, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	n := &node{name: name, path: path, mode: fi.Mode(), size: fi.Size(), parent: parent}
	switch {
	case fi.Mode()&fs.ModeSymlink != 0:
		n.target, err = os.Readlink(path)
	case fi.IsDir():
		es, err := os.ReadDir(path)
		if err != nil {
			return nil, err
		}
		for _, e := range es {
			k, err := scan(filepath.Join(path, e.Name()), e.Name(), n)
			if err != nil {
				return nil, err
			}
			n.kids = append(n.kids, k)
		}
		sort.Slice(n.kids, func(i, j int) bool { return n.kids[i].name < n.kids[j].name })
	case !fi.Mode().IsRegular():
		return nil, errors.New("nicht unterstützte Datei: " + path)
	}
	return n, err
}

func (n *node) typ() uint16 {
	switch {
	case n.mode.IsDir():
		return tDir
	case n.mode&fs.ModeSymlink != 0:
		return tSymlink
	}
	return tFile
}

func le(v ...any) []byte {
	var b bytes.Buffer
	for _, x := range v {
		binary.Write(&b, binary.LittleEndian, x)
	}
	return b.Bytes()
}

// meta schreibt einen Strom in Metadatenblöcke (je 8 KiB, als unkomprimiert markiert).
func meta(stream []byte) []byte {
	var out bytes.Buffer
	for i := 0; i < len(stream) || i == 0; i += metaSize {
		end := i + metaSize
		if end > len(stream) {
			end = len(stream)
		}
		out.Write(le(uint16(end-i) | 0x8000))
		out.Write(stream[i:end])
		if end == len(stream) {
			break
		}
	}
	return out.Bytes()
}

// ref rechnet eine Stromposition in eine Referenz um (Blockbeginn auf der Platte << 16 | Versatz).
func ref(pos int) (uint32, uint16) {
	return uint32((pos / metaSize) * (metaSize + 2)), uint16(pos % metaSize)
}

// Write packt das Verzeichnis dir als SquashFS nach w.
func Write(w io.Writer, dir string) error {
	root, err := scan(dir, "", nil)
	if err != nil {
		return err
	}
	// Reihenfolge wie mksquashfs: Kinder vor den Eltern, Wurzel zuletzt
	var order []*node
	var walk func(n *node)
	walk = func(n *node) {
		for _, k := range n.kids {
			walk(k)
		}
		order = append(order, n)
	}
	walk(root)
	for i, n := range order {
		n.ino = uint32(i + 1)
	}
	now := uint32(time.Now().Unix())

	// 1. Daten: direkt nach dem Superblock
	var data bytes.Buffer
	pos := uint64(96)
	for _, n := range order {
		if n.typ() != tFile {
			continue
		}
		n.dataPos = pos
		f, err := os.Open(n.path)
		if err != nil {
			return err
		}
		buf := make([]byte, blockSize)
		for left := n.size; left > 0; {
			c := int64(blockSize)
			if left < c {
				c = left
			}
			if _, err := io.ReadFull(f, buf[:c]); err != nil {
				f.Close()
				return err
			}
			data.Write(buf[:c])
			n.blocks = append(n.blocks, uint32(c)|1<<24) // Bit 24: unkomprimiert
			left -= c
			pos += uint64(c)
		}
		f.Close()
	}

	// 2. Inode-Größen festlegen, Positionen im Strom vergeben
	ilen := func(n *node) int {
		switch n.typ() {
		case tDir:
			return 16 + 16
		case tSymlink:
			return 16 + 8 + len(n.target)
		}
		return 16 + 16 + 4*len(n.blocks)
	}
	ip := 0
	for _, n := range order {
		n.pos, n.ilen = ip, ilen(n)
		b, o := ref(ip)
		n.ref = uint64(b)<<16 | uint64(o)
		ip += n.ilen
	}

	// 3. Verzeichnistabelle (braucht die Inode-Positionen der Kinder)
	var dirs bytes.Buffer
	for _, n := range order {
		if n.typ() != tDir {
			continue
		}
		b, o := ref(dirs.Len())
		n.dirStart, n.dirOff = b, o
		start := dirs.Len()
		for i := 0; i < len(n.kids); {
			// Gruppe: gleiche Inode-Metadatenblöcke, höchstens 256 Einträge, Inode-Nummern nah beieinander
			k0 := n.kids[i]
			blk, _ := ref(k0.pos)
			j := i
			for j < len(n.kids) && j-i < 256 {
				bj, _ := ref(n.kids[j].pos)
				d := int64(n.kids[j].ino) - int64(k0.ino)
				if bj != blk || d < -32768 || d > 32767 {
					break
				}
				j++
			}
			dirs.Write(le(uint32(j-i-1), blk, k0.ino))
			for _, k := range n.kids[i:j] {
				_, off := ref(k.pos)
				dirs.Write(le(off, int16(int64(k.ino)-int64(k0.ino)), k.typ(), uint16(len(k.name)-1)))
				dirs.WriteString(k.name)
			}
			i = j
		}
		n.dirSize = uint32(dirs.Len()-start) + 3
	}

	// 4. Inodes schreiben
	var inodes bytes.Buffer
	for _, n := range order {
		perm := uint16(n.mode.Perm())
		inodes.Write(le(n.typ(), perm, uint16(0), uint16(0), now, n.ino))
		switch n.typ() {
		case tDir:
			parent := uint32(len(order) + 1)
			if n.parent != nil {
				parent = n.parent.ino
			}
			links := uint32(2)
			for _, k := range n.kids {
				if k.typ() == tDir {
					links++
				}
			}
			if n.dirSize > 0xffff {
				return errors.New("Verzeichnis zu groß: " + n.path)
			}
			inodes.Write(le(n.dirStart, links, uint16(n.dirSize), n.dirOff, parent))
		case tSymlink:
			inodes.Write(le(uint32(1), uint32(len(n.target))))
			inodes.WriteString(n.target)
		default:
			if n.dataPos > 0xffffffff || n.size > 0xffffffff {
				return errors.New("Datei zu groß: " + n.path)
			}
			inodes.Write(le(uint32(n.dataPos), uint32(0xffffffff), uint32(0), uint32(n.size)))
			for _, b := range n.blocks {
				inodes.Write(le(b))
			}
		}
	}

	// 5. zusammensetzen
	inodeStart := 96 + uint64(data.Len())
	im := meta(inodes.Bytes())
	dirStart := inodeStart + uint64(len(im))
	dm := meta(dirs.Bytes())
	idMetaStart := dirStart + uint64(len(dm))
	idm := meta(le(uint32(0)))
	idTable := idMetaStart + uint64(len(idm))
	end := idTable + 8

	sb := le(uint32(0x73717368), uint32(len(order)), now, uint32(blockSize), uint32(0), uint16(1), uint16(blockLog),
		uint16(flags), uint16(1), uint16(4), uint16(0), root.ref, end, idTable, ^uint64(0), inodeStart, dirStart, ^uint64(0), ^uint64(0))
	for _, part := range [][]byte{sb, data.Bytes(), im, dm, idm, le(idMetaStart)} {
		if _, err := w.Write(part); err != nil {
			return err
		}
	}
	// auf 4 KiB auffüllen wie mksquashfs
	if pad := (4096 - end%4096) % 4096; pad > 0 {
		w.Write(make([]byte, pad))
	}
	return nil
}

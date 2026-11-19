package sqfs

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Reader liest ein SquashFS-4.0-Abbild (unkomprimiert oder gzip/zlib) ab einem Versatz in einer Datei.
type Reader struct {
	r                             io.ReaderAt
	base                          int64
	blockSize                     uint32
	inodeStart, dirStart, rootRef uint64
	BytesUsed                     uint64
	Mtime                         uint32
	metaCache                     map[uint64][]byte
}

func Open(r io.ReaderAt, base int64) (*Reader, error) {
	sb := make([]byte, 96)
	if _, err := r.ReadAt(sb, base); err != nil {
		return nil, err
	}
	u32 := func(o int) uint32 { return binary.LittleEndian.Uint32(sb[o:]) }
	u64 := func(o int) uint64 { return binary.LittleEndian.Uint64(sb[o:]) }
	if u32(0) != 0x73717368 || binary.LittleEndian.Uint16(sb[28:]) != 4 {
		return nil, errors.New("kein SquashFS 4.0")
	}
	if c := binary.LittleEndian.Uint16(sb[20:]); c != 1 {
		return nil, errors.New("nur gzip-SquashFS wird unterstützt")
	}
	return &Reader{r: r, base: base, blockSize: u32(12), Mtime: u32(8), rootRef: u64(32), BytesUsed: u64(40),
		inodeStart: u64(64), dirStart: u64(72), metaCache: map[uint64][]byte{}}, nil
}

// block liest einen Metadatenblock (absolute Position im Abbild) und gibt Inhalt + Länge auf der Platte zurück.
func (s *Reader) block(at uint64) ([]byte, uint64, error) {
	h := make([]byte, 2)
	if _, err := s.r.ReadAt(h, s.base+int64(at)); err != nil {
		return nil, 0, err
	}
	n := binary.LittleEndian.Uint16(h)
	size := uint64(n & 0x7fff)
	if c, ok := s.metaCache[at]; ok {
		return c, size + 2, nil
	}
	raw := make([]byte, size)
	if _, err := s.r.ReadAt(raw, s.base+int64(at)+2); err != nil {
		return nil, 0, err
	}
	if n&0x8000 == 0 {
		zr, err := zlib.NewReader(bytes.NewReader(raw))
		if err != nil {
			return nil, 0, err
		}
		raw, err = io.ReadAll(zr)
		if err != nil {
			return nil, 0, err
		}
	}
	s.metaCache[at] = raw
	return raw, size + 2, nil
}

// readMeta liest n Bytes aus einer Metadatentabelle ab (Blockbeginn relativ zur Tabelle, Versatz).
func (s *Reader) readMeta(table uint64, blk uint64, off int, n int) ([]byte, error) {
	var out []byte
	at := table + blk
	for len(out) < n {
		b, disk, err := s.block(at)
		if err != nil {
			return nil, err
		}
		if off > len(b) {
			return nil, errors.New("beschädigte Metadaten")
		}
		take := b[off:]
		if len(take) > n-len(out) {
			take = take[:n-len(out)]
		}
		out = append(out, take...)
		off = 0
		at += disk
	}
	return out, nil
}

type inode struct {
	typ, perm            uint16
	dirBlk               uint32
	dirSize              uint32
	dirOff               uint16
	start, frag, fragOff uint32
	size                 uint64
	blocks               []uint32
	target               string
}

func (s *Reader) inode(ref uint64) (*inode, error) {
	blk, off := ref>>16, int(ref&0xffff)
	h, err := s.readMeta(s.inodeStart, blk, off, 16)
	if err != nil {
		return nil, err
	}
	in := &inode{typ: binary.LittleEndian.Uint16(h), perm: binary.LittleEndian.Uint16(h[2:])}
	more := func(n int) ([]byte, error) {
		b, err := s.readMeta(s.inodeStart, blk, off, 16+n)
		if err != nil {
			return nil, err
		}
		return b[16:], nil
	}
	switch in.typ {
	case 1:
		b, err := more(16)
		if err != nil {
			return nil, err
		}
		in.dirBlk, in.dirSize, in.dirOff = binary.LittleEndian.Uint32(b), uint32(binary.LittleEndian.Uint16(b[8:])), binary.LittleEndian.Uint16(b[10:])
	case 8: // erweitertes Verzeichnis
		b, err := more(24)
		if err != nil {
			return nil, err
		}
		in.typ = 1
		in.dirSize, in.dirBlk, in.dirOff = binary.LittleEndian.Uint32(b[4:]), binary.LittleEndian.Uint32(b[8:]), binary.LittleEndian.Uint16(b[18:])
	case 2:
		b, err := more(16)
		if err != nil {
			return nil, err
		}
		in.start, in.frag, in.fragOff, in.size = binary.LittleEndian.Uint32(b), binary.LittleEndian.Uint32(b[4:]), binary.LittleEndian.Uint32(b[8:]), uint64(binary.LittleEndian.Uint32(b[12:]))
		if in.frag != 0xffffffff {
			return nil, errors.New("Fragmente werden nicht unterstützt")
		}
		nb := int((in.size + uint64(s.blockSize) - 1) / uint64(s.blockSize))
		b, err = more(16 + 4*nb)
		if err != nil {
			return nil, err
		}
		for i := 0; i < nb; i++ {
			in.blocks = append(in.blocks, binary.LittleEndian.Uint32(b[16+4*i:]))
		}
	case 3:
		b, err := more(8)
		if err != nil {
			return nil, err
		}
		n := int(binary.LittleEndian.Uint32(b[4:]))
		b, err = more(8 + n)
		if err != nil {
			return nil, err
		}
		in.target = string(b[8:])
	default:
		return nil, errors.New("nicht unterstützter Inode-Typ")
	}
	return in, nil
}

type entry struct {
	name string
	ref  uint64
}

func (s *Reader) list(in *inode) ([]entry, error) {
	if in.dirSize <= 3 {
		return nil, nil
	}
	b, err := s.readMeta(s.dirStart, uint64(in.dirBlk), int(in.dirOff), int(in.dirSize-3))
	if err != nil {
		return nil, err
	}
	var out []entry
	for p := 0; p+12 <= len(b); {
		count := int(binary.LittleEndian.Uint32(b[p:])) + 1
		start := uint64(binary.LittleEndian.Uint32(b[p+4:]))
		p += 12
		for i := 0; i < count; i++ {
			if p+8 > len(b) {
				return nil, errors.New("beschädigtes Verzeichnis")
			}
			off := uint64(binary.LittleEndian.Uint16(b[p:]))
			nl := int(binary.LittleEndian.Uint16(b[p+6:])) + 1
			name := string(b[p+8 : p+8+nl])
			p += 8 + nl
			if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\x00") {
				return nil, errors.New("ungültiger Dateiname")
			}
			out = append(out, entry{name, start<<16 | off})
		}
	}
	return out, nil
}

func (s *Reader) copyFile(in *inode, dst string) error {
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, os.FileMode(in.perm&0o777))
	if err != nil {
		return err
	}
	defer f.Close()
	pos := int64(in.start)
	left := in.size
	for _, b := range in.blocks {
		n := int64(b &^ (1 << 24))
		want := uint64(s.blockSize)
		if left < want {
			want = left
		}
		if n == 0 { // Lücke (sparse)
			if _, err := f.Write(make([]byte, want)); err != nil {
				return err
			}
			left -= want
			continue
		}
		raw := make([]byte, n)
		if _, err := s.r.ReadAt(raw, s.base+pos); err != nil {
			return err
		}
		pos += n
		if b&(1<<24) == 0 {
			zr, err := zlib.NewReader(bytes.NewReader(raw))
			if err != nil {
				return err
			}
			if raw, err = io.ReadAll(zr); err != nil {
				return err
			}
		}
		if uint64(len(raw)) > want {
			raw = raw[:want]
		}
		if _, err := f.Write(raw); err != nil {
			return err
		}
		left -= uint64(len(raw))
	}
	return f.Chmod(os.FileMode(in.perm & 0o777))
}

// Extract entpackt alles nach dst.
func (s *Reader) Extract(dst string) error {
	root, err := s.inode(s.rootRef)
	if err != nil {
		return err
	}
	var walk func(in *inode, dir string, depth int) error
	walk = func(in *inode, dir string, depth int) error {
		if depth > 64 {
			return errors.New("zu tief verschachtelt")
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		es, err := s.list(in)
		if err != nil {
			return err
		}
		for _, e := range es {
			k, err := s.inode(e.ref)
			if err != nil {
				return err
			}
			p := filepath.Join(dir, e.name)
			switch k.typ {
			case 1:
				if err := walk(k, p, depth+1); err != nil {
					return err
				}
				os.Chmod(p, os.FileMode(k.perm&0o777)|0o700)
			case 2:
				if err := s.copyFile(k, p); err != nil {
					return err
				}
			case 3:
				os.Remove(p)
				if err := os.Symlink(k.target, p); err != nil {
					return err
				}
			}
		}
		return nil
	}
	return walk(root, dst, 0)
}

//go:build darwin || (linux && !cgo)

package ort

import (
	"errors"
	"unsafe"

	"github.com/ebitengine/purego"
)

// macOS und Linux ohne cgo: Laufzeit ohne C-Compiler laden (purego).
func load(path string) (uintptr, error) {
	h, err := purego.Dlopen(path, purego.RTLD_NOW|purego.RTLD_LOCAL)
	if err != nil {
		return 0, errors.New("Die KI-Laufzeit lässt sich nicht laden: " + err.Error())
	}
	s, err := purego.Dlsym(h, "OrtGetApiBase")
	if err != nil {
		return 0, errors.New("OrtGetApiBase fehlt")
	}
	return call(s), nil
}

func call(f uintptr, args ...uintptr) uintptr {
	r, _, _ := purego.SyscallN(f, args...)
	return r
}

var keep [][]byte

func modelPath(p string) unsafe.Pointer {
	b := append([]byte(p), 0)
	keep = append(keep, b)
	return unsafe.Pointer(&b[0])
}

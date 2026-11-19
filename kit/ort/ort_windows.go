//go:build windows

package ort

import (
	"fmt"
	"path/filepath"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func load(path string) (uintptr, error) {
	// Abhängige DLLs (providers_shared) liegen im selben Ordner.
	windows.SetDllDirectory(filepath.Dir(path))
	h, err := windows.LoadLibrary(path)
	if err != nil {
		return 0, fmt.Errorf("onnxruntime.dll lässt sich nicht laden: %v", err)
	}
	p, err := windows.GetProcAddress(h, "OrtGetApiBase")
	if err != nil {
		return 0, err
	}
	r, _, _ := syscall.SyscallN(p)
	return r, nil
}

func call(f uintptr, args ...uintptr) uintptr {
	r, _, _ := syscall.SyscallN(f, args...)
	return r
}

func modelPath(p string) unsafe.Pointer {
	u, _ := windows.UTF16PtrFromString(p)
	return unsafe.Pointer(u)
}

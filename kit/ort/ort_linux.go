//go:build linux && cgo

package ort

/*
#cgo LDFLAGS: -ldl
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
typedef uintptr_t (*f10)(uintptr_t,uintptr_t,uintptr_t,uintptr_t,uintptr_t,uintptr_t,uintptr_t,uintptr_t,uintptr_t,uintptr_t);
static uintptr_t callf(uintptr_t f, uintptr_t* a){ return ((f10)f)(a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7],a[8],a[9]); }
static void* openlib(const char* p){ return dlopen(p, RTLD_NOW|RTLD_LOCAL); }
static void* sym(void* h, const char* n){ return dlsym(h, n); }
*/
import "C"

import (
	"errors"
	"unsafe"
)

// Nur zum Testen unter Linux.
func load(path string) (uintptr, error) {
	cp := C.CString(path)
	defer C.free(unsafe.Pointer(cp))
	h := C.openlib(cp)
	if h == nil {
		return 0, errors.New("dlopen fehlgeschlagen")
	}
	cn := C.CString("OrtGetApiBase")
	defer C.free(unsafe.Pointer(cn))
	s := C.sym(h, cn)
	if s == nil {
		return 0, errors.New("OrtGetApiBase fehlt")
	}
	return call(uintptr(s)), nil
}

func call(f uintptr, args ...uintptr) uintptr {
	a := (*[10]C.uintptr_t)(C.malloc(10 * 8))
	defer C.free(unsafe.Pointer(a))
	for i := range a {
		a[i] = 0
	}
	for i, v := range args {
		a[i] = C.uintptr_t(v)
	}
	return uintptr(C.callf(C.uintptr_t(f), &a[0]))
}

var keep [][]byte

func modelPath(p string) unsafe.Pointer {
	b := append([]byte(p), 0)
	keep = append(keep, b)
	return unsafe.Pointer(&b[0])
}

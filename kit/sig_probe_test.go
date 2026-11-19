//go:build linux

package kit

import (
	"testing"
	"unsafe"

	"github.com/ebitengine/purego"
)

// Simuliert WebKit: fremder Handler ohne SA_ONSTACK, danach muss fixSignals das Flag setzen.
func TestFixSignals(t *testing.T) {
	h, err := purego.Dlopen("libc.so.6", purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		t.Skip(err)
	}
	var sa func(sig int, act, old unsafe.Pointer) int
	purego.RegisterLibFunc(&sa, h, "sigaction")
	cb := purego.NewCallback(func(sig uintptr) uintptr { return 0 })
	var act [256]byte
	*(*uintptr)(unsafe.Pointer(&act[0])) = cb
	if sa(12, unsafe.Pointer(&act[0]), nil) != 0 { // SIGUSR2
		t.Fatal("sigaction")
	}
	fixSignals()
	var got [256]byte
	sa(12, nil, unsafe.Pointer(&got[0]))
	if f := *(*int32)(unsafe.Pointer(&got[136])); f&0x08000000 == 0 {
		t.Fatalf("SA_ONSTACK fehlt: %x", f)
	}
}

//go:build windows
// +build windows

package edge

import (
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// OnFiles wird aufgerufen, wenn die Seite Dateien per
// chrome.webview.postMessageWithAdditionalObjects schickt (z. B. nach Drag & drop).
// So kommen die echten Pfade an, ohne die Dateien zu kopieren.
var OnFiles func(message string, paths []string)

var (
	iidArgs2      = windows.GUID{Data1: 0x06fc7ab7, Data2: 0xc90c, Data3: 0x4297, Data4: [8]byte{0x93, 0x89, 0x33, 0xca, 0x01, 0xcf, 0x6d, 0x5e}}
	iidCollection = windows.GUID{Data1: 0x0f36fd87, Data2: 0x4f69, Data3: 0x4415, Data4: [8]byte{0x98, 0xda, 0x88, 0x8f, 0x89, 0xfb, 0x9a, 0x33}}
	iidFile       = windows.GUID{Data1: 0xf2c19559, Data2: 0x6bc1, Data3: 0x4583, Data4: [8]byte{0xa7, 0x57, 0x90, 0x02, 0x1b, 0xe9, 0xaf, 0xec}}
)

func vcall(obj uintptr, idx int, args ...uintptr) uintptr {
	vtbl := *(*uintptr)(unsafe.Pointer(obj))
	fn := *(*uintptr)(unsafe.Pointer(vtbl + uintptr(idx)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{obj}, args...)...)
	return r
}

func qi(obj uintptr, iid *windows.GUID) uintptr {
	var out uintptr
	if vcall(obj, 0, uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&out))) != 0 {
		return 0
	}
	return out
}

func release(obj uintptr) {
	if obj != 0 {
		vcall(obj, 2)
	}
}

// droppedPaths liest die Dateipfade aus ICoreWebView2WebMessageReceivedEventArgs2.AdditionalObjects.
func droppedPaths(args uintptr) (paths []string) {
	defer func() { recover() }() // ältere WebView2-Versionen: einfach nichts liefern
	a2 := qi(args, &iidArgs2)
	if a2 == 0 {
		return nil
	}
	defer release(a2)
	var coll uintptr
	// IUnknown(3) + GetSource, GetWebMessageAsJson, TryGetWebMessageAsString, get_AdditionalObjects
	if vcall(a2, 6, uintptr(unsafe.Pointer(&coll))) != 0 || coll == 0 {
		return nil
	}
	defer release(coll)
	var n uint32
	vcall(coll, 3, uintptr(unsafe.Pointer(&n)))
	for i := uint32(0); i < n; i++ {
		var item uintptr
		if vcall(coll, 4, uintptr(i), uintptr(unsafe.Pointer(&item))) != 0 || item == 0 {
			continue
		}
		f := qi(item, &iidFile)
		release(item)
		if f == 0 {
			continue
		}
		var p *uint16
		if vcall(f, 3, uintptr(unsafe.Pointer(&p))) == 0 && p != nil {
			paths = append(paths, windows.UTF16PtrToString(p))
			windows.CoTaskMemFree(unsafe.Pointer(p))
		}
		release(f)
	}
	return paths
}

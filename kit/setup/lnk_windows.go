//go:build windows

package setup

import (
	"errors"
	"runtime"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// makeLink legt eine Windows-Verknüpfung (.lnk) direkt über die Shell-Schnittstelle an –
// ohne PowerShell (versteckte PowerShell-Aufrufe stuft Virenschutz gern als verdächtig ein).
func makeLink(lnk, target, workDir, icon, desc string) error {
	done := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		done <- makeLinkCOM(lnk, target, workDir, icon, desc)
	}()
	return <-done
}

var (
	ole32            = windows.NewLazySystemDLL("ole32.dll")
	coInitializeEx   = ole32.NewProc("CoInitializeEx")
	coUninitialize   = ole32.NewProc("CoUninitialize")
	coCreateInstance = ole32.NewProc("CoCreateInstance")

	clsidShellLink = windows.GUID{Data1: 0x00021401, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidShellLinkW  = windows.GUID{Data1: 0x000214F9, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
	iidPersistFile = windows.GUID{Data1: 0x0000010b, Data4: [8]byte{0xC0, 0, 0, 0, 0, 0, 0, 0x46}}
)

func vcall(obj uintptr, idx int, args ...uintptr) uintptr {
	vtbl := *(*uintptr)(unsafe.Pointer(obj))
	fn := *(*uintptr)(unsafe.Pointer(vtbl + uintptr(idx)*unsafe.Sizeof(uintptr(0))))
	r, _, _ := syscall.SyscallN(fn, append([]uintptr{obj}, args...)...)
	return r
}

func wstr(s string) uintptr { p, _ := windows.UTF16PtrFromString(s); return uintptr(unsafe.Pointer(p)) }

func makeLinkCOM(lnk, target, workDir, icon, desc string) error {
	hr, _, _ := coInitializeEx.Call(0, 2) // COINIT_APARTMENTTHREADED
	if int32(hr) >= 0 {
		defer coUninitialize.Call()
	}
	var sl uintptr
	hr, _, _ = coCreateInstance.Call(uintptr(unsafe.Pointer(&clsidShellLink)), 0, 1, uintptr(unsafe.Pointer(&iidShellLinkW)), uintptr(unsafe.Pointer(&sl)))
	if int32(hr) < 0 || sl == 0 {
		return errors.New("Verknüpfung: Shell nicht verfügbar")
	}
	defer vcall(sl, 2)
	vcall(sl, 20, wstr(target))  // SetPath
	vcall(sl, 9, wstr(workDir))  // SetWorkingDirectory
	vcall(sl, 7, wstr(desc))     // SetDescription
	vcall(sl, 17, wstr(icon), 0) // SetIconLocation
	var pf uintptr
	if int32(vcall(sl, 0, uintptr(unsafe.Pointer(&iidPersistFile)), uintptr(unsafe.Pointer(&pf)))) < 0 || pf == 0 {
		return errors.New("Verknüpfung: Speichern nicht möglich")
	}
	defer vcall(pf, 2)
	if int32(vcall(pf, 6, wstr(lnk), 1)) < 0 { // Save
		return errors.New("Verknüpfung ließ sich nicht speichern")
	}
	return nil
}

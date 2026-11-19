// Paket ort spricht die ONNX Runtime über ihre C-Schnittstelle an, ohne cgo unter Windows.
// Es reicht die onnxruntime.dll, die beim ersten Start geladen wird.
package ort

import (
	"errors"
	"fmt"
	"runtime"
	"sync"
	"unsafe"
)

// Positionen in der OrtApi-Tabelle (onnxruntime_c_api.h). Diese Reihenfolge ändert sich nie,
// neue Funktionen kommen nur hinten dazu.
const (
	fGetErrorMessage            = 2
	fCreateEnv                  = 3
	fCreateSession              = 7
	fRun                        = 9
	fCreateSessionOptions       = 10
	fSetGraphOptimizationLevel  = 23
	fSetIntraOpNumThreads       = 24
	fSessionGetInputCount       = 30
	fSessionGetOutputCount      = 31
	fSessionGetInputTypeInfo    = 33
	fSessionGetOutputTypeInfo   = 34
	fSessionGetInputName        = 36
	fSessionGetOutputName       = 37
	fCreateTensorWithData       = 49
	fGetTensorMutableData       = 51
	fCastTypeInfoToTensorInfo   = 55
	fGetTensorElementType       = 60
	fGetDimensionsCount         = 61
	fGetDimensions              = 62
	fGetTensorTypeAndShape      = 65
	fCreateCpuMemoryInfo        = 69
	fAllocatorFree              = 76
	fGetAllocatorWithDefaultOps = 78
	fReleaseEnv                 = 92
	fReleaseStatus              = 93
	fReleaseMemoryInfo          = 94
	fReleaseSession             = 95
	fReleaseValue               = 96
	fReleaseTypeInfo            = 98
	fReleaseTensorShapeInfo     = 99
	fReleaseSessionOptions      = 100
)

const (
	Float32 = 1
	Int32   = 6
	Int64   = 7
)

var (
	mu    sync.Mutex
	api   uintptr // Zeiger auf die Funktionstabelle
	env   uintptr
	mem   uintptr
	alloc uintptr
)

func fn(i int) uintptr {
	return *(*uintptr)(unsafe.Pointer(api + uintptr(i)*unsafe.Sizeof(uintptr(0))))
}

func c(i int, args ...uintptr) uintptr { return call(fn(i), args...) }

func status(st uintptr) error {
	if st == 0 {
		return nil
	}
	msg := cstr(c(fGetErrorMessage, st))
	c(fReleaseStatus, st)
	return errors.New(msg)
}

func cstr(p uintptr) string {
	if p == 0 {
		return ""
	}
	var b []byte
	for i := uintptr(0); ; i++ {
		ch := *(*byte)(unsafe.Pointer(p + i))
		if ch == 0 {
			break
		}
		b = append(b, ch)
	}
	return string(b)
}

func cbytes(s string) []byte { return append([]byte(s), 0) }

// Init lädt die Bibliothek. Mehrfacher Aufruf ist harmlos.
func Init(libPath string) error {
	mu.Lock()
	defer mu.Unlock()
	if api != 0 {
		return nil
	}
	base, err := load(libPath)
	if err != nil {
		return err
	}
	// OrtApiBase { GetApi(version) ; GetVersionString() }
	getAPI := *(*uintptr)(unsafe.Pointer(base))
	for v := uintptr(20); v >= 10 && api == 0; v-- {
		api = call(getAPI, v)
	}
	if api == 0 {
		return errors.New("Diese ONNX-Runtime-Version ist zu alt.")
	}
	name := cbytes("creatorhub")
	if err := status(c(fCreateEnv, 3, uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&env)))); err != nil {
		api = 0
		return err
	}
	if err := status(c(fCreateCpuMemoryInfo, 1, 0, uintptr(unsafe.Pointer(&mem)))); err != nil {
		return err
	}
	return status(c(fGetAllocatorWithDefaultOps, uintptr(unsafe.Pointer(&alloc))))
}

type IO struct {
	Name string
	Type int
	Dims []int64
}

type Session struct {
	s       uintptr
	In, Out []IO
	inNames, outNames [][]byte
}

func shapeOf(info uintptr) (int, []int64) {
	var et uintptr
	c(fGetTensorElementType, info, uintptr(unsafe.Pointer(&et)))
	var n uintptr
	c(fGetDimensionsCount, info, uintptr(unsafe.Pointer(&n)))
	d := make([]int64, n)
	if n > 0 {
		c(fGetDimensions, info, uintptr(unsafe.Pointer(&d[0])), n)
	}
	return int(int32(et)), d
}

func ioInfo(s uintptr, idx uintptr, out bool) (IO, error) {
	var namep, ti uintptr
	nameF, typeF := fSessionGetInputName, fSessionGetInputTypeInfo
	if out {
		nameF, typeF = fSessionGetOutputName, fSessionGetOutputTypeInfo
	}
	if err := status(c(nameF, s, idx, alloc, uintptr(unsafe.Pointer(&namep)))); err != nil {
		return IO{}, err
	}
	io := IO{Name: cstr(namep)}
	c(fAllocatorFree, alloc, namep)
	if err := status(c(typeF, s, idx, uintptr(unsafe.Pointer(&ti)))); err != nil {
		return io, err
	}
	var tinfo uintptr
	c(fCastTypeInfoToTensorInfo, ti, uintptr(unsafe.Pointer(&tinfo)))
	if tinfo != 0 {
		io.Type, io.Dims = shapeOf(tinfo)
	}
	c(fReleaseTypeInfo, ti)
	return io, nil
}

// Open lädt ein Modell. threads <= 0 nimmt alle Kerne.
func Open(model string, threads int) (*Session, error) {
	if api == 0 {
		return nil, errors.New("ONNX Runtime ist nicht geladen.")
	}
	if threads <= 0 {
		threads = runtime.NumCPU()
	}
	var opts uintptr
	if err := status(c(fCreateSessionOptions, uintptr(unsafe.Pointer(&opts)))); err != nil {
		return nil, err
	}
	defer c(fReleaseSessionOptions, opts)
	c(fSetIntraOpNumThreads, opts, uintptr(threads))
	c(fSetGraphOptimizationLevel, opts, 99)
	mp := modelPath(model)
	se := &Session{}
	if err := status(c(fCreateSession, env, uintptr(mp), opts, uintptr(unsafe.Pointer(&se.s)))); err != nil {
		return nil, fmt.Errorf("Modell lässt sich nicht laden: %v", err)
	}
	runtime.KeepAlive(mp)
	var n uintptr
	c(fSessionGetInputCount, se.s, uintptr(unsafe.Pointer(&n)))
	for i := uintptr(0); i < n; i++ {
		io, err := ioInfo(se.s, i, false)
		if err != nil {
			return nil, err
		}
		se.In = append(se.In, io)
		se.inNames = append(se.inNames, cbytes(io.Name))
	}
	c(fSessionGetOutputCount, se.s, uintptr(unsafe.Pointer(&n)))
	for i := uintptr(0); i < n; i++ {
		io, err := ioInfo(se.s, i, true)
		if err != nil {
			return nil, err
		}
		se.Out = append(se.Out, io)
		se.outNames = append(se.outNames, cbytes(io.Name))
	}
	return se, nil
}

// Run führt das Modell mit einem Eingang aus und liefert den ersten Ausgang als float32.
// data muss []float32 oder []int32 sein.
func (se *Session) Run(data any, shape []int64) ([]float32, []int64, error) {
	var ptr unsafe.Pointer
	var bytes uintptr
	var et uintptr
	switch d := data.(type) {
	case []float32:
		ptr, bytes, et = unsafe.Pointer(&d[0]), uintptr(len(d)*4), Float32
	case []int32:
		ptr, bytes, et = unsafe.Pointer(&d[0]), uintptr(len(d)*4), Int32
	default:
		return nil, nil, errors.New("unbekannter Datentyp")
	}
	var in uintptr
	if err := status(c(fCreateTensorWithData, mem, uintptr(ptr), bytes, uintptr(unsafe.Pointer(&shape[0])), uintptr(len(shape)), et, uintptr(unsafe.Pointer(&in)))); err != nil {
		return nil, nil, err
	}
	defer c(fReleaseValue, in)
	inName := uintptr(unsafe.Pointer(&se.inNames[0][0]))
	outName := uintptr(unsafe.Pointer(&se.outNames[0][0]))
	var out uintptr
	err := status(c(fRun, se.s, 0, uintptr(unsafe.Pointer(&inName)), uintptr(unsafe.Pointer(&in)), 1, uintptr(unsafe.Pointer(&outName)), 1, uintptr(unsafe.Pointer(&out))))
	runtime.KeepAlive(data)
	runtime.KeepAlive(shape)
	if err != nil {
		return nil, nil, err
	}
	defer c(fReleaseValue, out)
	var info uintptr
	if err := status(c(fGetTensorTypeAndShape, out, uintptr(unsafe.Pointer(&info)))); err != nil {
		return nil, nil, err
	}
	_, dims := shapeOf(info)
	c(fReleaseTensorShapeInfo, info)
	n := int64(1)
	for _, d := range dims {
		n *= d
	}
	var p uintptr
	if err := status(c(fGetTensorMutableData, out, uintptr(unsafe.Pointer(&p)))); err != nil {
		return nil, nil, err
	}
	res := make([]float32, n)
	copy(res, unsafe.Slice((*float32)(unsafe.Pointer(p)), n))
	return res, dims, nil
}

// Tensor ist ein Eingang für RunMulti.
type Tensor struct {
	Data  any // []float32, []int32 oder []int64
	Shape []int64
}

// RunMulti führt ein Modell mit mehreren benannten Eingängen aus und liefert den Ausgang outName
// (leer = erster Ausgang) als float32.
func (se *Session) RunMulti(in map[string]Tensor, outName string) ([]float32, []int64, error) {
	names := make([]uintptr, 0, len(se.In))
	vals := make([]uintptr, 0, len(se.In))
	defer func() {
		for _, v := range vals {
			c(fReleaseValue, v)
		}
	}()
	for i, io := range se.In {
		t, ok := in[io.Name]
		if !ok {
			return nil, nil, fmt.Errorf("Eingang %q fehlt", io.Name)
		}
		var ptr unsafe.Pointer
		var bytes, et uintptr
		switch d := t.Data.(type) {
		case []float32:
			ptr, bytes, et = unsafe.Pointer(&d[0]), uintptr(len(d)*4), Float32
		case []int32:
			ptr, bytes, et = unsafe.Pointer(&d[0]), uintptr(len(d)*4), Int32
		case []int64:
			ptr, bytes, et = unsafe.Pointer(&d[0]), uintptr(len(d)*8), Int64
		default:
			return nil, nil, errors.New("unbekannter Datentyp")
		}
		var v uintptr
		if err := status(c(fCreateTensorWithData, mem, uintptr(ptr), bytes, uintptr(unsafe.Pointer(&t.Shape[0])), uintptr(len(t.Shape)), et, uintptr(unsafe.Pointer(&v)))); err != nil {
			return nil, nil, err
		}
		vals = append(vals, v)
		names = append(names, uintptr(unsafe.Pointer(&se.inNames[i][0])))
	}
	oi := 0
	if outName != "" {
		oi = -1
		for i, o := range se.Out {
			if o.Name == outName {
				oi = i
			}
		}
		if oi < 0 {
			return nil, nil, fmt.Errorf("Ausgang %q fehlt", outName)
		}
	}
	on := uintptr(unsafe.Pointer(&se.outNames[oi][0]))
	var out uintptr
	err := status(c(fRun, se.s, 0, uintptr(unsafe.Pointer(&names[0])), uintptr(unsafe.Pointer(&vals[0])), uintptr(len(vals)), uintptr(unsafe.Pointer(&on)), 1, uintptr(unsafe.Pointer(&out))))
	runtime.KeepAlive(in)
	if err != nil {
		return nil, nil, err
	}
	defer c(fReleaseValue, out)
	var info uintptr
	if err := status(c(fGetTensorTypeAndShape, out, uintptr(unsafe.Pointer(&info)))); err != nil {
		return nil, nil, err
	}
	_, dims := shapeOf(info)
	c(fReleaseTensorShapeInfo, info)
	n := int64(1)
	for _, d := range dims {
		n *= d
	}
	var p uintptr
	if err := status(c(fGetTensorMutableData, out, uintptr(unsafe.Pointer(&p)))); err != nil {
		return nil, nil, err
	}
	res := make([]float32, n)
	if n > 0 {
		copy(res, unsafe.Slice((*float32)(unsafe.Pointer(p)), n))
	}
	return res, dims, nil
}

func (se *Session) Close() {
	if se.s != 0 {
		c(fReleaseSession, se.s)
		se.s = 0
	}
}

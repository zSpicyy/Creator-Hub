//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

func lowPrio(c *exec.Cmd) {}

// niceSelf: das Programm (und damit jedes gestartete ffmpeg) etwas zurückstellen, damit der Rechner bedienbar bleibt.
func niceSelf() { syscall.Setpriority(syscall.PRIO_PROCESS, 0, 5) }

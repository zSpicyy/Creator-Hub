//go:build windows

package ollama

import (
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

func hidden(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

func ownGroup(c *exec.Cmd) {}

// killTree beendet Ollama samt der Rechenprozesse, die es gestartet hat.
func killTree(pid int) { hidden(exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(pid))).Run() }

func alive(pid int) bool {
	out, _ := hidden(exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(pid), "/FO", "CSV", "/NH")).Output()
	return strings.Contains(string(out), "\""+strconv.Itoa(pid)+"\"")
}

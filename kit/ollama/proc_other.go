//go:build !windows

package ollama

import (
	"os/exec"
	"syscall"
)

func ownGroup(c *exec.Cmd) {
	if c.SysProcAttr == nil {
		c.SysProcAttr = &syscall.SysProcAttr{}
	}
	c.SysProcAttr.Setpgid = true
}

// killTree beendet Ollama samt der Rechenprozesse, die es gestartet hat (eigene Prozessgruppe).
func killTree(pid int) {
	syscall.Kill(-pid, syscall.SIGTERM)
	syscall.Kill(pid, syscall.SIGTERM)
	go func() { exec.Command("sleep", "3").Run(); syscall.Kill(-pid, syscall.SIGKILL) }()
}

func alive(pid int) bool { return syscall.Kill(pid, 0) == nil }

func hidden(c *exec.Cmd) *exec.Cmd { return c }

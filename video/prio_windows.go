package main

import (
	"os/exec"
	"syscall"
)

// lowPrio: ffmpeg mit „niedriger als normal“ starten, damit der PC beim Rendern bedienbar bleibt.
func lowPrio(c *exec.Cmd) {
	if c.SysProcAttr == nil {
		c.SysProcAttr = &syscall.SysProcAttr{}
	}
	c.SysProcAttr.CreationFlags |= 0x00004000 // BELOW_NORMAL_PRIORITY_CLASS
}

func niceSelf() {}

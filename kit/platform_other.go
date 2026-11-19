//go:build !windows && !linux && !darwin

package kit

import (
	"fmt"
	"os/exec"
	"time"
)

func pickPath(mode, filter string) (string, error) { return "", ErrNoDialog }
func alreadyRunning(name, title string) bool       { return false }
func openFolder(p string)                          {}

// StartApp startet ein eigenständiges Werkzeug.
func StartApp(c *exec.Cmd) error { return c.Start() }

func HideCmd(c *exec.Cmd)                 { trackCmd(c) }
func runWindow(url string, a *App)        { fmt.Println(url); select {} }
func waitExit(pid int, max time.Duration) {}

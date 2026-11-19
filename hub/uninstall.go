package main

import (
	"os"

	"kit/setup"
)

// handleUninstall wird vom Eintrag „Creator Hub deinstallieren“ in den Windows-Einstellungen aufgerufen.
func handleUninstall() bool {
	if len(os.Args) > 1 && os.Args[1] == "--uninstall" {
		setup.Uninstall()
		return true
	}
	return false
}

//go:build !windows

package setup

// Einzelne Werkzeuge haben nur unter Windows einen Installer.
func UninstallTool(tool, title string) {}

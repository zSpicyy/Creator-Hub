//go:build !windows

package update

// macOS (ZIP mit .app) und Linux (AppImage): derselbe Weg wie beim Hub.
func applyTool(src string) error { return apply(src, true) }

func CleanupOld() {}

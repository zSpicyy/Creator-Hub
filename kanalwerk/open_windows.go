package main

import (
	"os/exec"

	"kit"
)

func openBrowser(u string) {
	_ = kit.StartApp(exec.Command("rundll32", "url.dll,FileProtocolHandler", u))
}

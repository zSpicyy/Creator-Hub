package main

import "os/exec"

func openBrowser(u string) { _ = exec.Command("xdg-open", u).Start() }

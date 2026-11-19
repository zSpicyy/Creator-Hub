package main

import "os/exec"

func openBrowser(u string) { _ = exec.Command("open", u).Start() }

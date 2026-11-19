//go:build windows

package ai

import (
	"errors"
	"os/exec"
	"strings"
	"syscall"
)

// verifySigned prüft die digitale Signatur von Microsoft, bevor die DLL je geladen wird.
func verifySigned(path string) error {
	script := `$s=Get-AuthenticodeSignature -LiteralPath '` + strings.ReplaceAll(path, "'", "''") + `';"$($s.Status)|$($s.SignerCertificate.Subject)"`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil {
		return errors.New("Die Signatur der KI-Laufzeit ließ sich nicht prüfen.")
	}
	s := strings.TrimSpace(string(out))
	if !strings.HasPrefix(s, "Valid|") || !strings.Contains(s, "Microsoft") {
		return errors.New("Die KI-Laufzeit ist nicht von Microsoft signiert. Nichts wurde installiert.")
	}
	return nil
}

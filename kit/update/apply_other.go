//go:build !windows && !linux && !darwin

package update

import "errors"

func apply(string, bool) error {
	return errors.New("Updates werden auf diesem System nicht unterstützt.")
}

//go:build windows

package worker

import "os/exec"

func configureProcessGroup(_ *exec.Cmd) {}

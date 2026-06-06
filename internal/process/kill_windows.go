//go:build windows

package process

import (
	"os"
	"os/exec"
)

func signalWorker(cmd *exec.Cmd, signal os.Signal) {
	if cmd.Process != nil {
		_ = cmd.Process.Signal(signal)
	}
}

func killWorker(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

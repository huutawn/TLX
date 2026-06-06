//go:build !windows

package process

import (
	"os"
	"os/exec"
	"syscall"
)

func signalWorker(cmd *exec.Cmd, signal os.Signal) {
	if cmd.Process == nil {
		return
	}

	sysSignal, ok := signal.(syscall.Signal)
	if !ok {
		_ = cmd.Process.Signal(signal)
		return
	}

	if err := syscall.Kill(-cmd.Process.Pid, sysSignal); err != nil {
		_ = cmd.Process.Signal(signal)
	}
}

func killWorker(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}

	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil {
		_ = cmd.Process.Kill()
	}
}

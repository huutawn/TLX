package process

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"tlx/internal/browser"
	"tlx/internal/config"
	"tlx/internal/health"
	"tlx/internal/output"
	"tlx/internal/worker"
)

const workerShutdownTimeout = 12 * time.Second

func Run(ctx context.Context, cfg config.Config) error {
	ctx, stopSignals := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	if health.IsPortOpen(cfg.DashboardPort) {
		status, err := health.FetchWorkerStatus(ctx, cfg.DashboardPort)
		if err != nil {
			return errPortBusy(cfg.DashboardPort)
		}

		if cfg.RestartWorker {
			if err := shutdownExternalWorker(ctx, cfg, status); err != nil {
				return err
			}
		} else {
			output.PrintReadySummary(cfg, status, true)
			if cfg.OpenBrowser {
				if err := browser.Open(cfg.DashboardURL()); err != nil {
					fmt.Fprintln(os.Stderr, "[TLX]", err)
				}
			}

			return nil
		}
	}

	workerCtx, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()

	cmd, err := worker.NewCommand(workerCtx, cfg)
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start worker: %w", err)
	}

	exited := make(chan error, 1)
	go func() {
		exited <- cmd.Wait()
	}()

	status, err := health.WaitForWorker(ctx, cfg.DashboardPort, cfg.HealthTimeout, exited)
	if err != nil {
		shutdownWorker(cmd, cancelWorker, exited)
		return err
	}

	output.PrintReadySummary(cfg, status, false)
	if cfg.OpenBrowser {
		if err := browser.Open(cfg.DashboardURL()); err != nil {
			fmt.Fprintln(os.Stderr, "[TLX]", err)
		}
	}

	select {
	case <-ctx.Done():
		fmt.Fprintln(os.Stdout, "[TLX] Shutting down worker...")
		shutdownWorker(cmd, cancelWorker, exited)
		fmt.Fprintln(os.Stdout, "[TLX] Worker stopped.")
		return nil
	case err := <-exited:
		if err != nil && !errors.Is(err, context.Canceled) {
			return fmt.Errorf("worker exited: %w", err)
		}

		return nil
	}
}

func shutdownExternalWorker(ctx context.Context, cfg config.Config, status health.WorkerStatus) error {
	if status.PID <= 0 {
		return fmt.Errorf("worker is already running on port %d but does not expose a PID; stop it manually once, or use TLX_PORT to choose another dashboard port", cfg.DashboardPort)
	}

	process, err := os.FindProcess(status.PID)
	if err != nil {
		return fmt.Errorf("failed to find worker process %d: %w", status.PID, err)
	}

	fmt.Fprintln(os.Stdout, "[TLX] Restarting existing worker...")
	_ = process.Signal(os.Interrupt)

	deadline := time.NewTimer(workerShutdownTimeout)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			_ = process.Kill()
			return waitForPortClose(cfg.DashboardPort, 3*time.Second)
		case <-ticker.C:
			if !health.IsPortOpen(cfg.DashboardPort) {
				return nil
			}
		}
	}
}

func waitForPortClose(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !health.IsPortOpen(port) {
			return nil
		}

		time.Sleep(200 * time.Millisecond)
	}

	return fmt.Errorf("worker port %d did not close after restart signal", port)
}

func shutdownWorker(cmd *exec.Cmd, cancel context.CancelFunc, exited <-chan error) {
	if cmd.Process == nil {
		cancel()
		return
	}

	signalWorker(cmd, os.Interrupt)

	select {
	case <-exited:
		cancel()
		return
	case <-time.After(workerShutdownTimeout):
		cancel()
		killWorker(cmd)
	}
}

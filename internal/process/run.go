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

func Run(ctx context.Context, cfg config.Config) error {
	ctx, stopSignals := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	if health.IsPortOpen(cfg.DashboardPort) {
		status, err := health.FetchWorkerStatus(ctx, cfg.DashboardPort)
		if err != nil {
			return errPortBusy(cfg.DashboardPort)
		}

		output.PrintReadySummary(cfg, status, true)
		if cfg.OpenBrowser {
			if err := browser.Open(cfg.DashboardURL()); err != nil {
				fmt.Fprintln(os.Stderr, "[TLX]", err)
			}
		}

		return nil
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

func shutdownWorker(cmd *exec.Cmd, cancel context.CancelFunc, exited <-chan error) {
	if cmd.Process == nil {
		cancel()
		return
	}

	_ = cmd.Process.Signal(os.Interrupt)

	select {
	case <-exited:
		cancel()
		return
	case <-time.After(5 * time.Second):
		cancel()
		_ = cmd.Process.Kill()
	}
}

package output

import (
	"fmt"
	"os"

	"tlx/internal/config"
	"tlx/internal/health"
)

func PrintReadySummary(cfg config.Config, status health.WorkerStatus, reused bool) {
	if reused {
		fmt.Fprintln(os.Stdout, "[TLX] Worker is already running. Reusing existing process.")
	}

	fmt.Fprintln(os.Stdout, "=== TLX ENGINE READY ===")
	fmt.Fprintln(os.Stdout, "[TLX] Dashboard:", cfg.DashboardURL())
	fmt.Fprintln(os.Stdout, "[TLX] Framework:", status.Framework)
	fmt.Fprintln(os.Stdout, "[TLX] Project root:", status.RootDir)
	if status.ProjectURL != "" {
		fmt.Fprintln(os.Stdout, "[TLX] Project URL:", status.ProjectURL)
	}
}

package config

import (
	"testing"
	"time"
)

func TestLoadConfigDefaults(t *testing.T) {
	t.TempDir()
	t.Setenv("TLX_PORT", "")
	t.Setenv("TLX_PROJECT", "")
	t.Setenv("TLX_TARGET_URL", "")
	t.Setenv("TLX_START_TARGET", "")
	t.Setenv("TLX_OPEN_BROWSER", "")
	t.Setenv("TLX_RESTART_WORKER", "")
	t.Setenv("TLX_WORKER_COMMAND", "")

	projectPath := t.TempDir()
	t.Chdir(projectPath)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.DashboardPort != defaultDashboardPort {
		t.Fatalf("DashboardPort = %d, want %d", cfg.DashboardPort, defaultDashboardPort)
	}
	if cfg.ProjectPath != projectPath {
		t.Fatalf("ProjectPath = %q, want %q", cfg.ProjectPath, projectPath)
	}
	if cfg.TargetURL != "" {
		t.Fatalf("TargetURL = %q, want empty", cfg.TargetURL)
	}
	if !cfg.StartTarget {
		t.Fatal("StartTarget = false, want true")
	}
	if !cfg.OpenBrowser {
		t.Fatal("OpenBrowser = false, want true")
	}
	if cfg.RestartWorker {
		t.Fatal("RestartWorker = true, want false")
	}
	if cfg.HealthTimeout != defaultHealthTimeout {
		t.Fatalf("HealthTimeout = %s, want %s", cfg.HealthTimeout, defaultHealthTimeout)
	}
	if cfg.WorkerCommand != "" {
		t.Fatalf("WorkerCommand = %q, want empty", cfg.WorkerCommand)
	}
	if got := cfg.DashboardURL(); got != "http://localhost:6532" {
		t.Fatalf("DashboardURL() = %q", got)
	}
}

func TestLoadConfigFromEnvironment(t *testing.T) {
	projectPath := t.TempDir()
	t.Setenv("TLX_PORT", "6543")
	t.Setenv("TLX_PROJECT", projectPath)
	t.Setenv("TLX_TARGET_URL", "http://localhost:3001")
	t.Setenv("TLX_START_TARGET", "false")
	t.Setenv("TLX_OPEN_BROWSER", "0")
	t.Setenv("TLX_RESTART_WORKER", "1")
	t.Setenv("TLX_WORKER_COMMAND", "node custom-worker.js")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.DashboardPort != 6543 {
		t.Fatalf("DashboardPort = %d, want 6543", cfg.DashboardPort)
	}
	if cfg.ProjectPath != projectPath {
		t.Fatalf("ProjectPath = %q, want %q", cfg.ProjectPath, projectPath)
	}
	if cfg.TargetURL != "http://localhost:3001" {
		t.Fatalf("TargetURL = %q", cfg.TargetURL)
	}
	if cfg.StartTarget {
		t.Fatal("StartTarget = true, want false")
	}
	if cfg.OpenBrowser {
		t.Fatal("OpenBrowser = true, want false")
	}
	if !cfg.RestartWorker {
		t.Fatal("RestartWorker = false, want true")
	}
	if cfg.HealthTimeout != 30*time.Second {
		t.Fatalf("HealthTimeout = %s, want 30s", cfg.HealthTimeout)
	}
	if cfg.WorkerCommand != "node custom-worker.js" {
		t.Fatalf("WorkerCommand = %q", cfg.WorkerCommand)
	}
}

func TestLoadConfigRejectsInvalidPort(t *testing.T) {
	t.Setenv("TLX_PORT", "99999")

	if _, err := LoadConfig(); err == nil {
		t.Fatal("LoadConfig() error = nil, want invalid port error")
	}
}

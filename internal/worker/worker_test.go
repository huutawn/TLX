package worker

import (
	"os"
	"path/filepath"
	"testing"

	"tlx/internal/config"
)

func TestResolveWorkerSpecUsesConfiguredCommand(t *testing.T) {
	cfg := config.Config{
		DashboardPort: 7777,
		ProjectPath:   "/tmp/project",
		TargetURL:     "http://localhost:3001",
		StartTarget:   false,
		WorkerCommand: "node custom-worker.js --verbose",
	}

	spec, err := ResolveWorkerSpec(cfg)
	if err != nil {
		t.Fatalf("ResolveWorkerSpec() error = %v", err)
	}

	if spec.Command != "node" {
		t.Fatalf("Command = %q, want node", spec.Command)
	}

	wantArgs := []string{
		"custom-worker.js",
		"--verbose",
		"--port=7777",
		"--project=/tmp/project",
		"--no-open",
		"--target-url=http://localhost:3001",
		"--no-start-target",
	}
	assertArgs(t, spec.Args, wantArgs)
}

func TestResolveWorkerSpecFindsDevelopmentWorker(t *testing.T) {
	rootDir := t.TempDir()
	workerPath := filepath.Join(rootDir, "apps", "worker-node", "src", "worker.ts")
	packagePath := filepath.Join(rootDir, "apps", "worker-node", "package.json")
	if err := os.MkdirAll(filepath.Dir(workerPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(workerPath, []byte("console.log('worker')\n"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if err := os.WriteFile(packagePath, []byte(`{"name":"@tlx/worker-node"}\n`), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	cfg := config.Config{
		DashboardPort: 6532,
		ProjectPath:   rootDir,
		StartTarget:   true,
	}

	spec, err := ResolveWorkerSpec(cfg)
	if err != nil {
		t.Fatalf("ResolveWorkerSpec() error = %v", err)
	}

	if spec.Command != "bun" {
		t.Fatalf("Command = %q, want bun", spec.Command)
	}

	wantArgs := []string{
		workerPath,
		"--port=6532",
		"--project=" + rootDir,
		"--no-open",
	}
	assertArgs(t, spec.Args, wantArgs)
}

func TestResolveWorkerSpecErrorsWhenWorkerMissing(t *testing.T) {
	t.Chdir(t.TempDir())

	cfg := config.Config{
		DashboardPort: 6532,
		ProjectPath:   t.TempDir(),
		StartTarget:   true,
	}

	if _, err := ResolveWorkerSpec(cfg); err == nil {
		t.Fatal("ResolveWorkerSpec() error = nil, want missing worker error")
	}
}

func assertArgs(t *testing.T, got []string, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("args length = %d, want %d\ngot:  %#v\nwant: %#v", len(got), len(want), got, want)
	}

	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("args[%d] = %q, want %q\ngot:  %#v\nwant: %#v", index, got[index], want[index], got, want)
		}
	}
}

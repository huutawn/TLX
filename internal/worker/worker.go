package worker

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"tlx/internal/config"
)

type WorkerSpec struct {
	Command string
	Args    []string
}

func ResolveWorkerSpec(cfg config.Config) (WorkerSpec, error) {
	if cfg.WorkerCommand != "" {
		parts := strings.Fields(cfg.WorkerCommand)
		if len(parts) == 0 {
			return WorkerSpec{}, fmt.Errorf("TLX_WORKER_COMMAND is empty")
		}

		return WorkerSpec{Command: parts[0], Args: append(parts[1:], workerArgs(cfg)...)}, nil
	}

	workerPath, err := findWorkerEntry(cfg.ProjectPath)
	if err != nil {
		return WorkerSpec{}, err
	}

	return WorkerSpec{
		Command: "bun",
		Args:    append([]string{workerPath}, workerArgs(cfg)...),
	}, nil
}

func NewCommand(ctx context.Context, cfg config.Config) (*exec.Cmd, error) {
	spec, err := ResolveWorkerSpec(cfg)
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, spec.Command, spec.Args...)
	cmd.Dir = cfg.ProjectPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	configureProcessGroup(cmd)
	cmd.Env = append(os.Environ(),
		"TLX_HOST=go",
		"TLX_WORKER_PORT="+strconv.Itoa(cfg.DashboardPort),
		"TLX_WORKER_PROJECT="+cfg.ProjectPath,
	)

	return cmd, nil
}

func workerArgs(cfg config.Config) []string {
	args := []string{
		"--port=" + strconv.Itoa(cfg.DashboardPort),
		"--project=" + cfg.ProjectPath,
		"--no-open",
	}

	if cfg.TargetURL != "" {
		args = append(args, "--target-url="+cfg.TargetURL)
	}

	if !cfg.StartTarget {
		args = append(args, "--no-start-target")
	}

	return args
}

func findWorkerEntry(projectPath string) (string, error) {
	candidates := candidateWorkerPaths(projectPath)
	for _, candidate := range candidates {
		if fileExists(candidate) {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("TLX worker was not found. Build the worker or set TLX_WORKER_COMMAND")
}

func candidateWorkerPaths(projectPath string) []string {
	paths := make([]string, 0, 8)
	addRepoCandidates := func(root string) {
		paths = append(paths,
			filepath.Join(root, "apps", "worker-node", "src", "worker.ts"),
			filepath.Join(root, "apps", "worker-node", "dist", "worker.js"),
		)
	}

	if repoRoot, ok := findRepoRoot(projectPath); ok {
		addRepoCandidates(repoRoot)
	}

	if executablePath, err := os.Executable(); err == nil {
		addRepoCandidates(filepath.Dir(executablePath))
		addRepoCandidates(filepath.Dir(filepath.Dir(executablePath)))
	}

	if cwd, err := os.Getwd(); err == nil {
		if repoRoot, ok := findRepoRoot(cwd); ok {
			addRepoCandidates(repoRoot)
		}
	}

	return paths
}

func findRepoRoot(startPath string) (string, bool) {
	absPath, err := filepath.Abs(startPath)
	if err != nil {
		return "", false
	}

	info, err := os.Stat(absPath)
	if err == nil && !info.IsDir() {
		absPath = filepath.Dir(absPath)
	}

	for {
		if fileExists(filepath.Join(absPath, "apps", "worker-node", "package.json")) {
			return absPath, true
		}

		parent := filepath.Dir(absPath)
		if parent == absPath {
			return "", false
		}

		absPath = parent
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

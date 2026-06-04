package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultDashboardPort = 6532
	defaultHealthTimeout = 30 * time.Second
)

type Config struct {
	DashboardPort int
	ProjectPath   string
	TargetURL     string
	StartTarget   bool
	OpenBrowser   bool
	HealthTimeout time.Duration
	WorkerCommand string
}

func (config Config) DashboardURL() string {
	return "http://localhost:" + strconv.Itoa(config.DashboardPort)
}

func LoadConfig() (Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return Config{}, err
	}

	config := Config{
		DashboardPort: defaultDashboardPort,
		ProjectPath:   cwd,
		StartTarget:   true,
		OpenBrowser:   true,
		HealthTimeout: defaultHealthTimeout,
	}

	if port := strings.TrimSpace(os.Getenv("TLX_PORT")); port != "" {
		parsed, err := strconv.Atoi(port)
		if err != nil || parsed <= 0 || parsed > 65535 {
			return Config{}, errInvalidPort(port)
		}

		config.DashboardPort = parsed
	}

	if projectPath := strings.TrimSpace(os.Getenv("TLX_PROJECT")); projectPath != "" {
		absProjectPath, err := filepath.Abs(projectPath)
		if err != nil {
			return Config{}, err
		}

		config.ProjectPath = absProjectPath
	}

	config.TargetURL = strings.TrimSpace(os.Getenv("TLX_TARGET_URL"))
	config.StartTarget = envBool("TLX_START_TARGET", config.StartTarget)
	config.OpenBrowser = envBool("TLX_OPEN_BROWSER", config.OpenBrowser)
	config.WorkerCommand = strings.TrimSpace(os.Getenv("TLX_WORKER_COMMAND"))

	return config, nil
}

func envBool(name string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if value == "" {
		return fallback
	}

	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

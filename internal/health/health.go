package health

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"
)

type WorkerStatus struct {
	Status        string `json:"status"`
	Engine        string `json:"engine"`
	DashboardPort int    `json:"dashboardPort"`
	ProjectURL    string `json:"projectUrl"`
	Framework     string `json:"framework"`
	RootDir       string `json:"rootDir"`
	StartedAt     string `json:"startedAt"`
}

func WaitForWorker(ctx context.Context, port int, timeout time.Duration, exited chan error) (WorkerStatus, error) {
	deadline := time.NewTimer(timeout)
	ticker := time.NewTicker(300 * time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return WorkerStatus{}, ctx.Err()
		case err := <-exited:
			exited <- err
			if err != nil {
				return WorkerStatus{}, fmt.Errorf("worker exited early: %w", err)
			}

			return WorkerStatus{}, fmt.Errorf("worker exited early")
		case <-deadline.C:
			return WorkerStatus{}, fmt.Errorf("worker was not ready after %s", timeout)
		case <-ticker.C:
			status, err := FetchWorkerStatus(ctx, port)
			if err == nil {
				return status, nil
			}
		}
	}
}

func FetchWorkerStatus(ctx context.Context, port int) (WorkerStatus, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, workerStatusURL(port), nil)
	if err != nil {
		return WorkerStatus{}, err
	}

	client := http.Client{Timeout: 800 * time.Millisecond}
	response, err := client.Do(request)
	if err != nil {
		return WorkerStatus{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return WorkerStatus{}, fmt.Errorf("status endpoint returned HTTP %d", response.StatusCode)
	}

	return decodeWorkerStatus(response.Body)
}

func workerStatusURL(port int) string {
	return "http://localhost:" + strconv.Itoa(port) + "/api/status"
}

func decodeWorkerStatus(body io.Reader) (WorkerStatus, error) {
	var status WorkerStatus
	if err := json.NewDecoder(body).Decode(&status); err != nil {
		return WorkerStatus{}, err
	}

	if status.Status == "" {
		return WorkerStatus{}, fmt.Errorf("status endpoint is not a TLX worker")
	}

	return status, nil
}

func IsPortOpen(port int) bool {
	conn, err := net.DialTimeout("tcp", "localhost:"+strconv.Itoa(port), 700*time.Millisecond)
	if err != nil {
		return false
	}

	_ = conn.Close()
	return true
}

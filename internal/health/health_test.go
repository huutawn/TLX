package health

import (
	"strings"
	"testing"
)

func TestWorkerStatusURL(t *testing.T) {
	if got := workerStatusURL(6532); got != "http://localhost:6532/api/status" {
		t.Fatalf("workerStatusURL() = %q", got)
	}
}

func TestDecodeWorkerStatus(t *testing.T) {
	status, err := decodeWorkerStatus(strings.NewReader(`{
      "status":"active",
      "engine":"TLX engine",
      "dashboardPort":6532,
      "projectUrl":"http://localhost:3000",
      "framework":"next",
      "rootDir":"/tmp/project",
	  "startedAt":"2026-06-04T00:00:00.000Z",
	  "pid":1234
	}`))
	if err != nil {
		t.Fatalf("decodeWorkerStatus() error = %v", err)
	}

	if status.Status != "active" {
		t.Fatalf("Status = %q, want active", status.Status)
	}
	if status.Framework != "next" {
		t.Fatalf("Framework = %q, want next", status.Framework)
	}
	if status.RootDir != "/tmp/project" {
		t.Fatalf("RootDir = %q", status.RootDir)
	}
	if status.PID != 1234 {
		t.Fatalf("PID = %d, want 1234", status.PID)
	}
}

func TestDecodeWorkerStatusRejectsNonTlxResponse(t *testing.T) {
	if _, err := decodeWorkerStatus(strings.NewReader(`{"engine":"other"}`)); err == nil {
		t.Fatal("decodeWorkerStatus() error = nil, want non-TLX response error")
	}
}

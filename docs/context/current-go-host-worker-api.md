# Current Go Host And Worker API Context

Date: 2026-06-12

## Go Host

Files:

- `cmd/tlx/main.go`
- `internal/cli/cli.go`
- `internal/config/*`
- `internal/process/*`
- `internal/worker/*`
- `internal/health/*`
- `internal/browser/*`

Current behavior:

- Public command is Cobra root command `tlx` with no required args or subcommands.
- `internal/config` loads defaults and TLX environment variables.
- `internal/process` orchestrates startup, worker reuse, signal handling, and browser/dashboard flow.
- `internal/worker` resolves development worker `apps/worker-node/src/worker.ts` or built worker `apps/worker-node/dist/worker.js`.
- Host checks worker readiness through `GET /api/status`.
- Host can reuse an existing TLX worker on the configured dashboard port.
- Host reports conflict if the dashboard port is used by a non-TLX process.

What Go intentionally does not own yet:

- Playwright browser scan logic.
- Express API implementation.
- Tree-sitter parser and framework strategies.
- Report generation and `.tlx` project storage writes.
- DevOps global DB and production agent.

## Node/Bun Worker API

Files:

- `apps/worker-node/src/worker.ts`
- `apps/worker-node/src/server/index.ts`
- `apps/worker-node/src/server/routes.ts`
- `apps/worker-node/src/controllers/action.controller.ts`
- `apps/worker-node/src/services/runtime-context.service.ts`

Stable current endpoints:

- `GET /api/status`
- `GET /api/project`
- `GET /api/graph`
- `GET /api/cache/diff`
- `GET /api/report/latest`
- `GET /api/auth/status`
- `POST /api/actions/auth/start`
- `POST /api/actions/auth/clear`
- `POST /api/actions/scan`

Server behavior:

- Express binds local API and serves screenshots from target project `.tlx/screenshots`.
- If `apps/ui/out` exists, worker serves static dashboard routes `/`, `/overview`, `/map`, `/tests`, `/bugs`.
- If UI build is missing, worker serves a minimal fallback HTML dashboard.
- API and dashboard are intended for localhost use, not network exposure.

Handoff notes:

- Keep API response shapes backward-compatible; dashboard and Go health checks depend on them.
- Do not move Node ecosystem work to Go unless there is a strong reason. Current SRS keeps Playwright/tree-sitter/framework detection in worker.
- If adding one-shot worker jobs later, stdout should be JSON-only and logs should go to stderr.

# TLX Engine

Local-first testing and operations tooling for web projects.

TLX runs a Go host CLI and a Node/Bun worker behind it. The Go process owns the public command and lifecycle. The worker owns the Node ecosystem tasks: Express API, Playwright scanning, AST parsing, framework detection, and dashboard serving.

## What TLX Does

- Detects common web frameworks such as Next.js, Vue/Vite, Laravel, and generic PHP.
- Builds a local project graph of pages, components, API calls, and edges.
- Runs local UI/UX checks with Playwright.
- Detects layout overlap, horizontal overflow, WCAG contrast, OKLCH palette, alignment, spacing, typography, orphan element, hit-area, and text-clipping issues.
- Stores reports locally in the target project, not in the cloud.
- Shows a local dashboard with project map, cache diff, scan controls, reports, and visual issue highlights.

## Architecture

```text
tlx Go host
  -> Node/Bun worker
       -> Express local API
       -> Playwright UI/UX scanner
       -> parser and framework detector
       -> static dashboard serving
```

The user-facing command target is `tlx`. Bun remains an internal worker runtime because Playwright, AST parsing, Express, and framework strategies live in Node for the current phases.

## Repository Layout

```text
apps/
  worker-node/       Node/Bun worker, local API, scanner, detector, tests
  ui/                Next.js dashboard, static export target
cmd/tlx/             Go CLI entrypoint
internal/            Go host packages
packages/contracts/  Shared TypeScript contracts and JSON schemas
```

## Requirements

- Go `1.23` or newer
- Bun `1.3.14` or newer
- Playwright Chromium for UI/UX scanning

## Install

```bash
bun install
bunx playwright install chromium
```

## Build

```bash
bun run build
```

This builds shared contracts, the worker, the dashboard, and the Go host binary at `dist/tlx`.

## Development

```bash
bun run dev:ui      # Run the dashboard dev server
bun run dev:worker  # Run the Node/Bun worker in watch mode
bun run dev:host    # Run the Go host; it spawns the Bun worker
bun run typecheck   # Typecheck all TypeScript workspaces
bun run lint        # Run lint/typecheck commands for app workspaces
```

`bun run dev:host` is only a development shortcut for `go run ./cmd/tlx`. It still exercises the Go host path.

## Run TLX Against a Project

From the TLX repository:

```bash
bun run build:ui
TLX_PROJECT=/path/to/target-project bun run dev:host
```

Open the dashboard:

```text
http://localhost:6532
```

If the target app is already running, pass its URL:

```bash
TLX_PROJECT=/path/to/target-project \
TLX_TARGET_URL=http://localhost:3000 \
bun run dev:host
```

After a full build, run the Go binary directly:

```bash
TLX_PROJECT=/path/to/target-project ./dist/tlx
```

## Local Storage

TLX writes generated local testing state into the target project:

```text
.tlx/
  hash.json
  latest-report.json
  screenshots/
```

The root `tlx.yaml` in the target project is the user-editable config file. `.tlx/tlx.yaml` is treated only as a legacy compatibility override.

Example `tlx.yaml`:

```yaml
scan.defaultScope: changed
scan.contrastRatio: 4.5
scan.crawler.enabled: true
scan.crawler.maxDepth: 2
scan.crawler.maxPages: 25
scan.api.enabled: true
scan.api.unsafeMethods: false
scan.ignoredPaths: .cache,tmp,coverage
auth.mode: manual
auth.profile: default
auth.loginUrl: http://localhost:3000/login
```

## Local API

The worker binds to `localhost` and exposes:

```text
GET  /api/status
GET  /api/project
GET  /api/graph
GET  /api/cache/diff
GET  /api/report/latest
GET  /api/auth/status
POST /api/actions/auth/start
POST /api/actions/auth/clear
POST /api/actions/scan
```

Scan changed routes:

```json
{ "scope": "changed" }
```

Scan one route:

```json
{ "scope": "route", "route": "/admin" }
```

Scan all pages:

```json
{ "scope": "all" }
```

Start manual auth capture:

```json
{ "profile": "default", "loginUrl": "http://localhost:3000/login", "timeoutMs": 120000 }
```

TLX opens a headed Playwright browser. Log in, close the page, then scans can reuse `.tlx/auth/default.json`. Routes returning `401` or `403` are reported as `auth_required` or `auth_failed` instead of generic crawler failures.

## Verification

```bash
go test ./...
bun --filter @tlx/contracts typecheck
bun --filter @tlx/contracts test
bun --filter @tlx/worker-node typecheck
bun --filter @tlx/worker-node test
bun --filter @tlx/worker-node test:uiux
bun --filter @tlx/ui typecheck
bun --filter @tlx/ui build
bun run build:host
```

## Roadmap

- Phase 1: Go host CLI and Node/Bun worker lifecycle.
- Phase 2: Local testing suite, local reports, UI/UX scanner, and dashboard.
- Phase 3: DevOps suite, global SQLite storage, production agent, log sync, metrics, and health checks.
- Phase 4: Optional SaaS/cloud workflow for teams.

## Notes

- TLX is local-first by default.
- Reports and screenshots stay on the local machine unless a future opt-in sync feature is added.
- Do not commit `node_modules`, `.next`, `out`, `dist`, `.tlx`, cache folders, or `.env` files.

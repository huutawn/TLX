# Phase 1 Completed - Go CLI Host + Node Worker

Date: 2026-06-04

## Status

Phase 1 is completed after final hardening and verification.

## Completed Items

- Go/Cobra public host CLI exists at `cmd/tlx`.
- Public UX is `tlx` with no required subcommands or flags.
- Go host loads runtime config from defaults and TLX environment variables.
- Go host resolves and spawns Node/Bun worker from `apps/worker-node/src/worker.ts` in development or `apps/worker-node/dist/worker.js` after build.
- Go host forwards worker stdout/stderr.
- Go host health-checks worker through `GET /api/status`.
- Go host handles busy dashboard port:
  - Reuses existing TLX worker when `/api/status` is valid.
  - Returns clear error when port belongs to another process.
- Go host handles `SIGINT`/`SIGTERM` and shuts down the worker.
- Node/Bun worker remains owner of Express API, Playwright, parser, detector, and framework strategies.
- Go does not port Playwright, tree-sitter, Express, detector, parser, or scanner logic.

## Final Fixes Applied

- Added Go unit coverage for config, worker resolution, and health behavior.
- Hardened worker shutdown so target app processes started by TLX do not remain running after `Ctrl+C`.
- Updated SRS Phase 1 worker path from old `apps/cli` wording to current `apps/worker-node`.

## Verification

- `rtk go test ./...`
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node test`
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/contracts typecheck`
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node typecheck`
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/ui typecheck`
- `rtk /home/tawn/.bun/bin/bun run build:host`

Known environment note: Bun commands may print an `fnm_multishells` read-only symlink warning in this sandbox, but commands exit 0.

## Phase 2 Entry Criteria

Phase 2 can start after this file exists and all verification commands pass.

Phase 2 should focus on local-first testing storage and report pipeline:
- `.tlx/`
- `tlx.yaml`
- `hash.json`
- diff
- scoped scan
- `latest-report.json`
- screenshots
- overflow/contrast/crawler/API contract testing
- dashboard report views

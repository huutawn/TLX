# TLX Upcoming Phase Plan

Date: 2026-06-12

## Phase 2 Hardening - Local Testing Reliability

Goal: make the completed Local Testing Suite stable for demo, handoff, and real project trials.

Scope:

- Align SRS and all `.agents/context` docs with actual repo state.
- Verify `tlx.yaml` config behavior and document the current flat `key: value` parser limit.
- Reduce likely false positives in overlap, spacing, typography, and color harmony rules through fixtures.
- Add route-param sampling for dynamic routes so `route` and `all` scans do not skip parameterized pages.
- Improve error messages for missing Chromium, unavailable target URL, port conflict, and report write failures.
- Re-check package distribution path because root `package.json` still maps `bin.tlx` to `apps/worker-node/dist/index.js` while product target is Go host.

Acceptance:

- `rtk go test ./...` passes.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node test` passes.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/worker-node test:uiux` passes where Playwright is available.
- `rtk /home/tawn/.bun/bin/bun --filter @tlx/ui build` passes.
- `.agents/errors/issues.md` has no untriaged critical blocker for Phase 2 demo.

## Phase 3A - Global Storage Foundation

Goal: introduce local global DevOps storage without changing local testing defaults.

Scope:

- Add `~/.tlx/global.db` SQLite with WAL enabled.
- Store project registry and recent workspaces.
- Add encrypted production key storage design; do not store plaintext secrets.
- Add Go tests for DB creation, WAL mode, migrations, and key metadata behavior.
- Keep Testing Suite `.tlx/` storage separate from global DevOps DB.

Acceptance:

- Starting `tlx` initializes global DB only when needed.
- DB migration is idempotent.
- Project-local scans still work without cloud or agent setup.

## Phase 3B - Production Agent And Auth

Goal: create a minimal Go production agent with authenticated pull endpoints.

Scope:

- Add agent binary/package.
- Require `X-TLX-Token` for all protected agent endpoints.
- Add health endpoint and version metadata.
- Add host-side config for registered agent URLs and tokens.
- Add tests for missing, invalid, and valid token behavior.

Acceptance:

- Agent rejects unauthenticated requests.
- Host can pull health status from a configured local agent.
- Dashboard can show agent status placeholder data from API.

## Phase 3C - Log Sync And Metrics Pull

Goal: implement pull/sync operations using local global DB.

Scope:

- Stream logs from agent to host using chunked gzip.
- Insert logs in DB batches without loading full payload into memory.
- Pull CPU/RAM/Disk I/O metrics by time range.
- Add dashboard metrics and log list views.

Acceptance:

- Large log sync remains bounded in memory.
- Metrics can be queried by project and time range.
- Dashboard shows real locally stored DevOps data.

## Phase 4 - Optional SaaS/Cloud

Goal: add opt-in team workflow after local-first core is stable.

Scope:

- Cloud workspace and report sync.
- RBAC and billing.
- CI/GitHub Action integration.
- AI UX Consultant and Auto-Fix PR Bot as explicit opt-in features.

Acceptance:

- No local scan data leaves the machine unless user explicitly enables sync.
- Cloud features remain disabled by default in local CLI.

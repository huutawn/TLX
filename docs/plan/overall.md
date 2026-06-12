# TLX Overall Plan

Date: 2026-06-12

## Product Target

TLX is a local-first testing and operations engine for web projects. The public command is `tlx`; it starts a local dashboard and worker pipeline that detects the project, builds a page/component/API graph, runs UI/UX checks, and stores reports in the target project.

Long-term target keeps two suites under one tool:

- Local Testing Suite: static graph scan, incremental cache, Playwright UI/UX scan, crawler, API contract checks, visual reports.
- DevOps Suite: production agent, pull/sync logs, metrics, health checks, local global SQLite storage.

## Architecture Direction

- Go host owns public CLI UX, config/process orchestration, worker lifecycle, health checks, signal handling, and future DevOps/local DB work.
- Node/Bun worker owns Express API, Playwright, tree-sitter parsing, detector strategies, scanner, report persistence, and dashboard serving.
- Next.js dashboard is statically exported and served by the worker when `apps/ui/out` exists.
- `packages/contracts` is the compatibility boundary for API payloads and scan report schemas.

## Completed Baseline

- Phase 1 is complete: Go/Cobra host exists at `cmd/tlx`, starts/reuses worker, checks `/api/status`, handles port conflicts and shutdown.
- Phase 2 local testing is implemented at practical baseline: `.tlx/hash.json`, `.tlx/latest-report.json`, screenshots, changed/all/route scopes, UI analyzer, crawler/API checks, dashboard views.
- Worker API exposes status, project, graph, cache diff, latest report, auth actions, and scan action.
- Dashboard has overview, map, tests, and bugs views using current local API data.

## Current Priority

Make Phase 2 reliable enough for handoff and demo before starting Phase 3:

- Keep docs aligned with code and SRS.
- Harden package/install path so `tlx` distribution launches the Go host or clearly documents the current development flow.
- Improve scanner precision where false positives are likely.
- Add route parameter samples and deeper crawler/API controls only after current flows are stable.

## Roadmap Summary

| Phase | Goal | Status |
| --- | --- | --- |
| Phase 0 | TypeScript worker baseline and local API | Complete baseline |
| Phase 1 | Go host CLI + Node/Bun worker lifecycle | Complete |
| Phase 2 | Local Testing Suite, local reports, dashboard | Complete baseline, needs hardening |
| Phase 3 | DevOps Suite, global DB, production agent | Planned |
| Phase 4 | Optional SaaS/cloud team workflow | Planned |

## Definition Of Done

- `tlx` can be run by a developer without knowing internal worker commands.
- Dashboard opens locally and shows project metadata, graph, diff, scan controls, latest report, screenshots, and issue metadata.
- Local scan data stays in target project `.tlx/` by default.
- Automated verification passes for Go host, worker-node, contracts, and UI build/typecheck.
- Known limitations are documented in `.agents/errors/issues.md` before new phases start.

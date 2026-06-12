# TLX Issues And Fix Queue

Date: 2026-06-12

## Critical

### E-001 - Package `bin.tlx` still points to worker dist

Current: root `package.json` has `"bin": { "tlx": "apps/worker-node/dist/index.js" }`.

Expected: public UX target is Go host `tlx`, per SRS Phase 1. Distribution plan must either ship Go binary or document Node worker bin as temporary legacy surface.

Impact: installed package may start legacy worker command instead of Go host lifecycle.

Fix direction: decide packaging strategy, then update package files, README, and release build scripts together.

## High

### E-002 - SRS still contains stale status lines

Current: `.agents/srs.md` still says some Phase 1/2 items are planned or partial in sections that predate Phase 2 completion, including dashboard placeholder wording.

Expected: SRS should reflect Phase 1 complete and Phase 2 baseline complete with hardening tasks separated.

Impact: handoff readers may think completed features are missing or planned work already exists.

Fix direction: update SRS status tables after final verification pass.

### E-003 - Dynamic route parameter sampling missing

Current: graph and scope resolution can identify routes, but dynamic route sample values are not configured.

Expected: `tlx.yaml` should support route params or sample URLs for frameworks with `[id]`, `[slug]`, `{id}`, etc.

Impact: all/route scans can skip or fail parameterized pages.

Fix direction: add route sample config, strategy extraction metadata, and tests.

### E-004 - Full YAML config not supported

Current: `storage.service.ts` parses flat `key: value` lines manually.

Expected: either keep flat config documented as official v1 or add a real YAML parser.

Impact: users may write nested YAML from intuition and see silent fallback.

Fix direction: choose v1 syntax, validate unsupported lines, and surface warnings.

## Medium

### E-005 - Report retention and screenshot cleanup missing

Current: scans write latest report and screenshots, but old screenshot directories have no retention policy.

Expected: configurable cleanup or report history.

Impact: `.tlx/screenshots` can grow indefinitely on repeated scans.

Fix direction: add retention count/age config or report history index.

### E-006 - Scanner progress/cancellation missing

Current: scan action waits until full scan completes.

Expected: dashboard should show route-level progress or allow cancellation for large projects.

Impact: user cannot distinguish slow scan from hung scan.

Fix direction: add in-memory scan job state or event stream after API contract design.

### E-007 - API contract checks are shallow

Current: API check validates status and JSON parse for local endpoints.

Expected: future opt-in schema validation/fuzzing and unsafe method controls.

Impact: many backend contract regressions will not be detected.

Fix direction: add OpenAPI/import support or route-handler-specific schema metadata in later phase.

### E-008 - Crawler is intentionally shallow

Current: crawler checks links and fills simple inputs, but does not perform deep workflows.

Expected: bounded BFS click/form crawler with explicit safety controls.

Impact: interaction-only route failures can be missed.

Fix direction: add action graph model, max actions, safe input profiles, and fixture tests.

### E-009 - Dashboard has no report history

Current: only `.tlx/latest-report.json` is read.

Expected: user can compare recent scans and open previous screenshot evidence.

Impact: cannot track regressions across scan runs.

Fix direction: add reports index or history folder under `.tlx/reports`.

## Low

### E-010 - Color harmony cannot know brand rules

Current: OKLCH heuristic uses generic thresholds.

Expected: project-specific design tokens or brand palette should inform harmony decisions later.

Impact: false positives on intentional brand/accent pages.

Fix direction: add config palette allowlist and token extraction.

### E-011 - Dashboard graph is custom instead of React Flow

Current: dashboard uses lightweight custom graph rendering.

Expected: SRS target mentions richer zoom/pan/click graph behavior.

Impact: graph UX is functional but not final target.

Fix direction: decide whether to keep custom graph or add React Flow after dependency review.

### E-012 - DevOps Suite not started

Current: no `~/.tlx/global.db`, production agent, auth token flow, gzip log sync, metrics pull, or ops charts.

Expected: Phase 3 implements these features.

Impact: product currently covers Local Testing Suite, not DevOps Suite.

Fix direction: follow `.agents/plan/upcoming-phases.md` Phase 3A-3C.

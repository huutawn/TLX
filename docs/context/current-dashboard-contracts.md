# Current Dashboard And Contracts Context

Date: 2026-06-12

## Dashboard

Directory: `apps/ui`

Current routes:

- `/` and `/overview`: project summary and local state overview.
- `/map`: project graph view and inspector-style information.
- `/tests`: scan controls for changed/all/route scope plus cache/report state.
- `/bugs`: latest report and visual bug viewer using screenshot paths.

Important files:

- `apps/ui/app/_components/dashboard-view.tsx`: route-to-view switch.
- `apps/ui/app/_components/dashboard-shell.tsx`: local dashboard shell/navigation.
- `apps/ui/app/_components/overview-view.tsx`: project and status overview.
- `apps/ui/app/_components/map-view.tsx`: graph view.
- `apps/ui/app/_components/tests-view.tsx`: scan controls and cache diff.
- `apps/ui/app/_components/bugs-view.tsx`: latest report and screenshots.
- `apps/ui/app/_components/project-graph.tsx`: visual graph rendering.
- `apps/ui/app/_lib/dashboard-data.tsx`: client data provider for worker API.

Current behavior:

- Dashboard is a Next.js App Router app configured for static export.
- Worker serves `apps/ui/out` when present.
- UI reads local worker API endpoints directly.
- Visual issue screenshots are loaded through `/.tlx/screenshots/...` static serving.

Current limits:

- Graph UI is custom/lightweight, not React Flow.
- No live progress stream during a long scan.
- No report history browser; latest report only.
- Ops metrics view is not implemented because Phase 3 global DB does not exist yet.

## Contracts

Directory: `packages/contracts`

Current responsibilities:

- TypeScript exports for status, graph, cache diff, scan action, scan report, auth, and color analysis payloads.
- JSON schemas for public contract validation.
- Tests validate representative contract shapes.

Important schemas:

- `project.schema.json`
- `graph.schema.json`
- `status.schema.json`
- `cache-diff.schema.json`
- `scan-action.schema.json`
- `scan-result.schema.json`

Handoff rule:

- Any API response shape change should update both TypeScript contracts and JSON schema tests before dashboard/controller code changes are considered complete.

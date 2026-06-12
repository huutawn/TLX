# Current Project Context

Date: 2026-06-12

## Repo Shape

TLX is a Bun workspace plus Go module:

- `cmd/tlx`: Go CLI entrypoint.
- `internal/*`: Go host config, process runner, worker lifecycle, browser/process helpers.
- `apps/worker-node`: Node/Bun worker, Express API, detector, parser, scanner, storage, tests.
- `apps/ui`: Next.js App Router dashboard, static export target.
- `packages/contracts`: shared TypeScript contracts and JSON schemas.
- `.agents`: SRS, phase notes, handoff context, plan, issue docs, screenshots.

## Working Product Flow

1. User runs `tlx` or development equivalent `bun run dev:host`.
2. Go host loads config and starts or reuses the Node/Bun worker.
3. Worker detects target project framework and source graph.
4. Worker starts Express API on localhost, default dashboard/API port `6532`.
5. Dashboard calls local API for status, project, graph, cache diff, latest report, auth state, and scan actions.
6. Scan action creates source hash snapshot, resolves scope, runs Playwright scanner, saves report and screenshots under target project `.tlx/`.

## Implemented Functional Areas

- Go host public command and worker lifecycle.
- Framework detection for Next.js, Vue/Vite, Laravel, generic PHP, and unknown fallback.
- Tree-sitter parser service for TS, TSX, JS/JSX, Vue, PHP.
- Scan graph with pages, components, APIs, and graph edges.
- Project-local storage for hash cache, latest report, screenshots, and auth storage state.
- Manual auth capture through headed Playwright.
- UI/UX scanner with Playwright collection and pure analyzer rules.
- Dashboard views: Overview, Map, Tests, Bugs.
- Contracts/schema tests for key API payloads.

## Important Current Limits

- DevOps Suite is not implemented yet: no global SQLite DB, production agent, log sync, metrics pull, or agent auth.
- Route parameter samples are not implemented, so dynamic routes need future config or discovery support.
- `tlx.yaml` parser is flat `key: value`, not full YAML.
- Package publishing path needs review because root `bin.tlx` currently targets worker dist, while product target is Go host.
- Dashboard map is lightweight custom UI, not React Flow.
- API contract scanner is shallow and safe by design; deeper fuzzing/unsafe methods remain future opt-in work.

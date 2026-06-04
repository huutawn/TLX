# @tlx/worker-node

Node/Bun worker for TLX. The public Go host CLI lives in `cmd/tlx` and spawns this worker.

## Worker and Legacy Commands

```bash
bun --filter @tlx/worker-node start -- --help
bun --filter @tlx/worker-node start ui:start --port 8080
bun apps/worker-node/src/worker.ts --port 6532 --project . --no-open
```

`worker.ts` serves the Express API and receives runtime options from the Go host. `ui:start` is a legacy/development fallback.

Build the UI before serving the static dashboard:

```bash
bun run build:ui
```

## Development

```bash
bun run dev:worker
bun run build:worker
bun --filter @tlx/worker-node typecheck
```

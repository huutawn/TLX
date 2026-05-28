# @tlx/cli

CLI TypeScript cho TLX.

## Lenh

```bash
bun --filter @tlx/cli start -- --help
bun --filter @tlx/cli start ui:start --port 8080
```

`ui:start` serve static export cua `apps/ui` tu thu muc `apps/ui/out`.
Hay build UI truoc khi chay lenh nay:

```bash
bun run build:ui
```

## Phat trien

```bash
bun run dev:cli
bun run build:cli
bun --filter @tlx/cli typecheck
```

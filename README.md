# TLX

TLX la monorepo dung Bun cho hai ung dung chinh:

- `apps/cli`: CLI viet bang TypeScript, dung Commander de khai bao lenh va Express de serve dashboard.
- `apps/ui`: Dashboard Next.js viet bang TypeScript, build static export vao `apps/ui/out`.

## Yeu cau

- Bun `1.3.14` hoac moi hon.

## Cai dat

```bash
bun install
```

## Lenh phat trien

```bash
bun run dev:ui      # chay Next.js dev server
bun run dev:cli     # chay CLI o watch mode voi lenh ui:start
bun run typecheck   # kiem tra TypeScript tat ca workspace
bun run lint        # lint tat ca workspace
bun run build       # build CLI va UI
```

## Chay dashboard qua CLI

```bash
bun run build:ui
bun --filter @tlx/cli start ui:start
```

Mac/Linux co the chay binary sau khi build CLI:

```bash
bun run build:cli
./apps/cli/dist/index.js ui:start --port 8080
```

## Quy uoc workspace

- Root chi giu config chung, script dieu phoi va dev dependencies dung chung.
- Runtime dependencies nam trong tung app, vi du `express` va `commander` nam o `apps/cli`.
- TypeScript config chung nam o `tsconfig.base.json`; moi app extend file nay va co script `typecheck` rieng.
- Khong commit `node_modules`, `.next`, `out`, `dist`, cache hoac file `.env`.

## Cau truc

```text
apps/
  cli/
    src/index.ts
    package.json
    tsconfig.json
  ui/
    app/
    package.json
    tsconfig.json
package.json
tsconfig.base.json
tsconfig.json
```

# SRS - TLX Engine

**Du an:** TLX Engine (Tan-Luan eXecution Engine)

**Dinh vi:** Nen tang hop nhat kiem thu va van hanh theo huong Local-First.

**Phien ban tai lieu:** 1.0.0

**License target:** MIT cho CLI/local; ma nguon dong cho SaaS/cloud.

**Nguon uu tien:** `.agents/raw_srs.md` la vision cao nhat. Tai lieu nay chuan hoa vision do theo hien trang repo va lo trinh phase.

## 1. Tong quan

TLX Engine la cong cu CLI hybrid kem dashboard cuc bo, giup developer va team nho hop nhat hai vong doi thuong tach roi:

- **Testing Suite:** quet UI/UX, phan tich AST/SAST, kiem thu API contract tai may local.
- **DevOps Suite:** quan ly cau hinh, dong bo log, keo metric va health-check agent production theo co che pull/sync.
- **Local Dashboard:** hien thi project map, ket qua scan, visual bug va chi so van hanh.

Triet ly thiet ke:

- **Local-First:** ma nguon, graph, report va screenshot mac dinh chi luu tai may user.
- **Hybrid Process Architecture:** Go lam public host CLI; Node/Bun lam worker cho nhung tac vu can he sinh thai Node.
- **Modular Monolith:** phan phoi nhu mot san pham duy nhat, nhung ranh gioi process va module phai ro.
- **Pull & Sync:** du lieu tu production agent chi duoc keo ve khi user yeu cau, khong duy tri background connection mac dinh.

## 2. Hien trang repo

Repo hien tai la monorepo Bun workspace:

- `apps/cli`: TypeScript/Bun CLI, Commander command, Express local API/server, Playwright scanner, web-tree-sitter parser va framework strategies.
- `apps/ui`: Next.js App Router dashboard, hien moi la shell/static placeholder va co `output: "export"`.
- `.agents/plan/go_cli_shell.md`: lo trinh chuyen public CLI sang Go host, Node/Bun thanh worker.

Hien co trong code:

- Public command target: `tlx`.
- Command/flags phu dang ton tai trong TypeScript CLI cu chi la legacy/development surface, khong phai UX target cho user.
- Default dashboard/API port: `6532`.
- Local API hien co: `GET /api/status`, `GET /api/project`, `GET /api/graph`, `GET /api/cache/diff`, `GET /api/report/latest`, `GET /api/auth/status`, `POST /api/actions/auth/start`, `POST /api/actions/auth/clear`, `POST /api/actions/scan`.
- Detector partial cho Next.js, Vue/Vite, Laravel va PHP thuong.
- Scan graph partial gom pages, components, apis, edges.
- `.tlx` project-local storage partial cho hash cache, latest report va screenshots.
- Playwright scan partial cho overlap, overflow, contrast, screenshot, crawler/API check va auth-aware `401`/`403` issues.

Chua co trong code:

- Go host CLI.
- Node worker entrypoint rieng.
- Cache manager day du cho route params, auth profiles nang cao va report retention.
- SQLite global DB tai `~/.tlx/global.db`.
- DevOps agent, auth, chunked gzip log sync, metric pull.
- Dashboard graph hoan chinh, heatmap, visual bug viewer, ops metrics chart.

## 3. Kien truc target

TLX dung mo hinh **Hybrid Process Architecture**.

| Lop | Cong nghe | Vai tro target | Trang thai |
| --- | --- | --- | --- |
| Public CLI host | Go + Cobra | Chay root command `tlx`, quan ly config, spawn worker, health check, signal, browser open, DevOps/local DB | Planned |
| Testing worker | Node/Bun + TypeScript | Express API, Playwright, tree-sitter, detector, framework strategies | Partial |
| Dashboard | Next.js static export | Project map, test controls, report, visual bug, ops metrics | Partial |
| Storage local | `.tlx/` | Project config, hash cache, latest report, screenshots | Planned |
| Storage global | `~/.tlx/global.db` SQLite | Project registry, encrypted production keys, compressed logs, monitoring metrics | Planned |
| Production agent | Go | Agent auth, log stream, metric pull, health check | Planned |

### 3.1. Go host

Go la binary public ma user goi truc tiep. User-facing UX target chi co mot lenh:

```bash
tlx
```

Go chiu trach nhiem:

- CLI UX don gian, khong yeu cau user nho subcommand hay flags.
- Config, profile, workspace selection va validation.
- Project/process orchestration.
- Spawn Node/Bun worker khi can dashboard, API, detector hoac scanner.
- Forward stdout/stderr cua worker.
- Poll `GET /api/status` de health check worker trong transitional v1.
- Bat `SIGINT`/`SIGTERM` va shutdown worker truoc khi thoat.
- DevOps Suite, SQLite global DB, agent connections va doctor checks.

Go khong port Playwright, tree-sitter, Express API hay framework strategies trong phase gan nhat.

### 3.2. Node/Bun worker

Node/Bun la worker noi bo, khong phai public CLI target dai han.

Node/Bun chiu trach nhiem:

- Express local API hien tai.
- Playwright browser automation.
- AST parsing bang `web-tree-sitter` va `tree-sitter-wasms`.
- Framework detection va route/component/API extraction.
- Scan graph phuc vu dashboard.

Transitional v1 dung HTTP loopback vi Express API da ton tai. Target dai han co the them JSON qua STDOUT cho cac one-shot worker job, voi quy tac stdout chi chua JSON va log/canh bao di qua stderr.

### 3.3. HTTP contract transitional v1

Go host chi can biet worker san sang qua local API. Dashboard va client tiep tuc dung API hien co.

Stable current endpoints:

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

## 4. Lo trinh phase

### Phase 0 - Hien trang da co

Muc tieu: giu baseline hien tai truoc migration.

- TypeScript/Bun CLI chay duoc `tlx`; command phu neu con ton tai chi de dev/fallback.
- Express local server bind `localhost` tai dashboard/API port.
- Detector tra framework, rootDir, port va scanGraph partial.
- Graph co pages, components, APIs va edges partial.
- Playwright scan overlap/overflow/contrast co ban qua `POST /api/actions/scan`.
- Scoped scan, cache diff, latest report va auth status/actions da co o worker.

### Phase 1 - Go CLI host + Node worker

Muc tieu: Go thanh public host CLI, Node/Bun thanh worker noi bo.

- Tao Go module/command `tlx` bang Cobra.
- Public UX chi expose `tlx`; cac options nhu port/project/target-url/start/open duoc suy luan tu project, config hoac dashboard.
- Tao `apps/worker-node/src/worker.ts` de worker nhan runtime options noi bo; `apps/cli` neu con trong lich su repo chi la legacy/development surface.
- Go spawn worker bang Bun/dist worker command.
- Go forward log, health check `/api/status`, xu ly port busy va graceful shutdown.
- Khong port detector, parser, Playwright hoac Express sang Go trong phase nay.

### Phase 2 - Local Testing Suite hoan chinh

Muc tieu: hoan thien local-first testing theo raw SRS.

- `.tlx/`, `tlx.yaml`, hash cache, diff, latest report va screenshots da co o muc co ban.
- Scan scope da co: changed only, all pages, single page; first scan fallback sang `all` khi chua co baseline de khong chi test `/`.
- Playwright scanner da co overlap, overflow, screenshot, visual bug metadata va WCAG contrast co ban.
- Crawler/API check da co o muc co ban; target tiep theo la BFS click/form sau hon va API contract/fuzzing day du.
- Authenticated UI testing: user dang nhap thu cong trong Playwright headed browser, TLX luu/reuse storage state local va phan loai `401`/`403` thanh auth issue.

### Phase 3 - DevOps Suite

Muc tieu: them van hanh production theo Pull & Sync.

- Tao `~/.tlx/global.db` SQLite voi WAL va batch insert.
- Luu project registry, encrypted production keys, compressed logs va monitoring metrics.
- Them production agent Go.
- Them `X-TLX-Token` auth va production key flow.
- Them chunked gzip log sync tu agent ve local DB.
- Them CPU/RAM/Disk I/O metric pull theo time range.
- Them agent/container health check.

### Phase 4 - SaaS/cloud optional

Muc tieu: mo rong team workflow khi local-first da on dinh.

- Cloud workspace va report sync opt-in.
- RBAC, billing, subscription, multi-tenancy.
- CI/GitHub Action.
- AI UX Consultant va Auto-Fix PR Bot dang opt-in.

## 5. Storage architecture

### 5.1. Project-local storage

Vi tri: `.tlx/` trong root project user dang test.

Target:

```text
.tlx/
├── tlx.yaml
├── hash.json
├── latest-report.json
└── screenshots/
```

Du lieu:

- `tlx.yaml`: cau hinh project-local nhu start command, ignored paths, scan defaults.
- `hash.json`: hash file, dependency mapping, diff state.
- `latest-report.json`: ket qua scan gan nhat.
- `screenshots/`: anh phuc vu visual bug viewer.

Trang thai: Planned. Repo hien chua co cache manager day du.

### 5.2. Global storage

Vi tri: `~/.tlx/global.db` tren may user.

Target:

- Project registry va recent workspaces.
- Production keys duoc ma hoa, khong luu plaintext.
- Log/monitoring data da dong bo va nen.
- Agent metadata va health history.

Trang thai: Planned. Repo hien chua co SQLite global DB.

## 6. Functional requirements

Trang thai:

- **Implemented:** da co trong repo va dung duoc o muc co ban.
- **Partial:** da co mot phan, chua day du theo SRS.
- **Planned:** chua co code, thuoc phase sau.

### 6.1. CLI va process orchestration

| Ma | Yeu cau | Mo ta | Trang thai |
| --- | --- | --- | --- |
| C1 | Public command | User chi can go `tlx` tai project root de khoi dong TLX. | Implemented basic trong TS CLI; Planned trong Go host |
| C2 | Go host CLI | Go/Cobra la binary public, khong expose subcommand/flags bat buoc cho user. | Planned |
| C3 | Worker lifecycle | Go spawn Node/Bun worker, forward log, health check, shutdown sach. | Planned |
| C4 | Project runner | Tu detect project URL, kiem tra port, spawn dev server neu can. | Partial |
| C5 | Error reporting | CLI/dashboard bao loi ro cho detect, port, runner, worker, scanner, cache. | Partial |

### 6.2. Testing Suite

| Ma | Yeu cau | Mo ta | Trang thai |
| --- | --- | --- | --- |
| T1 | Static source scan / SAST | AST va source scan de lap pages, components, API calls; target them hardcoded API key detection. | Partial |
| T2 | Smart incremental test | Hash file/dependency, scan `changed`/`all`/`route`; first scan chay `all`. | Partial |
| T3 | UI/UX collision | Playwright headless, AABB overlap, overflow, WCAG contrast va screenshot evidence. | Partial |
| T4 | Auto-crawler | Discover internal links va mock form data co ban; target BFS click/form sau hon. | Partial |
| T5 | API contract test | GET/OPTIONS local endpoints va JSON parse co ban; target fuzzing/schema validation day du. | Partial |
| T6 | Authenticated UI scan | Manual Playwright login, local storage state, report `auth_required`/`auth_failed` khi gap `401`/`403`. | Partial |

### 6.3. DevOps Suite

| Ma | Yeu cau | Mo ta | Trang thai |
| --- | --- | --- | --- |
| D1 | Handshake & Auth | Production key, `X-TLX-Token`, agent tu choi request khong hop le. | Planned |
| D2 | Chunked log sync | Agent stream gzip log qua HTTP chunked, Go ghi SQLite khong load full RAM. | Planned |
| D3 | Performance metric pull | Keo CPU, RAM, Disk I/O theo time range. | Planned |
| D4 | Agent health-check | Ping agent/container de theo doi uptime. | Planned |

### 6.4. Local Dashboard

| Ma | Yeu cau | Mo ta | Trang thai |
| --- | --- | --- | --- |
| U1 | Project Map | Hien thi graph pages/components/APIs, zoom/pan/click node. | Planned; graph API Partial |
| U2 | Impact Heatmap | Boi do nhanh bi anh huong khi file thay doi. | Planned |
| U3 | Visual Bug Highlight | Hien screenshot va bounding boxes loi layout/contrast. | Planned |
| U4 | Ops Metrics Chart | Ve line chart tu data monitoring trong global DB. | Planned |
| U5 | Dashboard shell | Next.js static placeholder co the build/export. | Partial |

## 7. Framework detection va graph

Framework target trong Local Testing phase:

| Framework | Dieu kien nhan dien | Port mac dinh | Trang thai |
| --- | --- | --- | --- |
| Next.js | Dependency `next`, `next.config.*`, app/pages router markers | 3000 | Partial |
| Vue/Vite | Dependency `vue` va `vite`, `vite.config.*` | 5173 | Partial |
| Laravel | Composer package `laravel/framework`, `artisan`, `routes/web.php` | 8000 | Partial |
| PHP thuong | Co `.php` source nhung khong phai Laravel | 8000 | Partial |
| Unknown | Khong match marker nao | 0 | Implemented basic |

`ScanGraph` target gom:

- `pages`: route, filePath, framework, components, apis.
- `components`: component id, name, filePath, importedFrom.
- `apis`: endpoint/API call strings.
- `edges`: `page_uses_component`, `page_calls_api`.

## 8. Local API contract

Tat ca API transitional v1 bind `localhost` va chay duoi `http://localhost:<dashboardPort>/api`.

### 8.1. Current stable endpoints

#### `GET /api/status`

Tra engine status va runtime context.

```json
{
  "status": "active",
  "engine": "TLX engine",
  "platform": "linux",
  "uptime": 12345,
  "dashboardPort": 6532,
  "projectUrl": "http://localhost:3000",
  "framework": "next",
  "rootDir": "/path/to/project",
  "startedAt": "2026-06-03T00:00:00.000Z"
}
```

#### `GET /api/project`

Tra project metadata khong kem full scan graph.

```json
{
  "framework": "next",
  "port": 3000,
  "rootDir": "/path/to/project",
  "projectUrl": "http://localhost:3000",
  "dashboardPort": 6532
}
```

#### `GET /api/graph`

Tra project scan graph.

```json
{
  "pages": [],
  "components": [],
  "apis": [],
  "edges": []
}
```

#### `POST /api/actions/scan`

Chay Playwright scan voi `context.projectUrl` hien tai. Body ho tro `scope` va `route`.

```json
{
  "success": true,
  "totalElementsScanned": 120,
  "bugsFound": [],
  "timestamp": "2026-06-03T00:00:00.000Z"
}
```

Body examples:

```json
{ "scope": "all" }
```

```json
{ "scope": "route", "route": "/admin" }
```

#### `GET /api/auth/status`

Tra trang thai manual auth state local.

```json
{
  "mode": "manual",
  "profile": "default",
  "authenticated": true,
  "storageStatePath": ".tlx/auth/default.json",
  "savedAt": "2026-06-03T00:00:00.000Z",
  "origins": ["http://localhost:3000"]
}
```

#### `POST /api/actions/auth/start`

Mo Playwright headed browser de user tu dang nhap, sau do luu `storageState` vao `.tlx/auth/<profile>.json` khi page dong hoac timeout.

```json
{ "profile": "default", "loginUrl": "http://localhost:3000/login", "timeoutMs": 120000 }
```

#### `POST /api/actions/auth/clear`

Xoa storage state local cua auth profile hien tai.

### 8.2. Planned endpoints

- Route-param samples cho dynamic routes.
- Auth profile management day du hon.
- API schema/fuzzing controls.

## 9. Dashboard target

Hien trang dashboard Next.js la shell/static placeholder, chua render graph hay report thuc.

Target Local Dashboard:

- **Project Overview:** framework, root path, project URL, dashboard URL, engine status.
- **Project Map:** graph pages/components/APIs, zoom/pan/click node.
- **Node Inspector:** route, filePath, imports/exports, API calls.
- **Cache Diff:** changed/unchanged/unknown/deleted.
- **Test Controls:** changed only, all pages, single page.
- **Auth Controls:** manual login, auth status, clear auth session.
- **Latest Report:** pass/fail, bug list, screenshot neu co.
- **Visual Bug Viewer:** screenshot + bounding boxes.
- **Ops Metrics Chart:** line charts tu `~/.tlx/global.db` khi DevOps Suite co mat.

Deploy target: Next static export duoc nhung/serve boi Go host hoac Node worker tuy phase. Phase gan nhat uu tien khong pha Express local API hien co.

## 10. Non-functional requirements

| Ma | Nhom | Yeu cau | Trang thai |
| --- | --- | --- | --- |
| NFR-001 | Local-first | Project data, graph, report, screenshots mac dinh chi luu local. | Target |
| NFR-002 | Local bind | Local API/dashboard phai bind `localhost`, khong expose network ngoai mac dinh. | Implemented current server uses localhost |
| NFR-003 | CLI boot time | `tlx help` target < 50ms sau khi Go host la public binary. | Planned |
| NFR-004 | Idle RAM | Idle dashboard/host target < 70MB sau khi Go host quan ly Node worker. | Planned |
| NFR-005 | Playwright RAM | UI testing co the spike khoang 600MB +/- 10%, phai giai phong sau scan. | Target |
| NFR-006 | Network payload | Log sync production phai stream gzip; vi du raw 100MB nen truyen < 20MB neu du lieu nen tot. | Planned |
| NFR-007 | Security | Khong luu plaintext production keys trong `.tlx/`; key quan trong ma hoa trong global DB. | Planned |
| NFR-008 | Agent auth | Production agent tu choi request thieu `X-TLX-Token` hop le. | Planned |
| NFR-009 | Node network policy | Node worker target khong truy cap internet ngoai mac dinh; chi localhost/STDOUT voi Go khi phu hop. | Planned |
| NFR-010 | Parser resilience | Loi parse mot file khong lam sap toan bo pipeline neu van thu thap duoc du lieu khac. | Partial |

## 11. Xy ly loi

| Tinh huong | Hanh vi mong muon | Trang thai |
| --- | --- | --- |
| Dashboard port ban | Go/CLI bao loi ro port dang ban va cach doi/tat process. | Partial now; Planned in Go |
| Unknown framework | Dashboard van mo, project la `unknown`, graph rong/partial. | Implemented basic |
| Khong tu start duoc project | CLI/dashboard bao runner error va goi y config `tlx.yaml`. | Partial |
| Worker crash som | Go bao exit code/message lien quan, cleanup child process. | Planned |
| Parse file loi | Bo qua file loi, log warning, tiep tuc scan. | Partial |
| Chromium thieu dependency | Bao can install Playwright browser/dependency. | Partial |
| `.tlx` chua ton tai | Tu tao khi cache/report can ghi. | Planned |
| Khong ghi duoc `.tlx` | Scan van tra temporary result neu co the, kem cache write failed. | Planned |
| SQLite lock | Dung WAL va batch insert cho global DB. | Planned |
| Node stdout dinh log rac | One-shot JSON protocol phai day log/canh bao sang stderr. | Planned |

## 12. Acceptance criteria theo phase

### Phase 0 baseline

- `tlx` trong TS CLI van chay.
- Command/flags phu neu con ton tai co the van chay tam thoi cho dev/fallback, nhung khong duoc mo ta la public UX bat buoc.
- `/api/status`, `/api/project`, `/api/graph`, `/api/actions/scan` tra response khong doi shape lon.
- Detector test cho Next.js, Vue/Vite, Laravel, PHP thuong van pass.

### Phase 1 Go host

- `go build ./cmd/tlx` tao binary `tlx`.
- `tlx` khoi dong pipeline chinh ma khong yeu cau subcommand hay flags.
- Help text cua Go CLI uu tien huong dan `tlx` va config/dashboard, khong day user sang command phu.
- Go spawn Node worker va health check thanh cong qua `/api/status`.
- `Ctrl+C` tat Go va Node child process, khong de process con do TLX tao chay ngam.
- Playwright/tree-sitter/Express van nam trong Node worker.

### Phase 2 Local Testing

- `.tlx/hash.json` va `.tlx/latest-report.json` duoc tao/cap nhat khi scan.
- Diff tra dung `changed`, `unchanged`, `unknown`, `deleted`.
- `changed only` khong test lai page khong doi.
- Scanner phat hien overlap, overflow va contrast issue co metadata du de ve visual bug.
- Dashboard hien Project Map, Cache Diff, Test Controls va Latest Report.

### Phase 3 DevOps

- `~/.tlx/global.db` duoc tao voi WAL.
- Production key khong luu plaintext.
- Agent yeu cau `X-TLX-Token` hop le.
- Log sync stream gzip va ghi DB theo batch.
- Metric pull va health check hien tren dashboard.

## 13. Test plan

### Automated

- Unit test DetectorService/strategies cho Next.js, Vue/Vite, Laravel, PHP thuong.
- Unit test Go CLI root command `tlx` va config/default resolution.
- Integration test Go host spawn worker, health check va shutdown.
- API test cho current endpoints: `/api/status`, `/api/project`, `/api/graph`, `/api/actions/scan`.
- Unit test Cache Manager khi Phase 2 bat dau: create `.tlx`, read/write hash, diff, latest report.
- Scanner test voi mock page/Playwright fixture cho overlap/overflow/contrast.
- DevOps tests khi Phase 3 bat dau: SQLite WAL, encrypted key storage, chunked gzip stream, agent auth.

### Manual

- Chay TLX trong project Next.js mau, kiem tra dashboard `http://localhost:6532`.
- Chay `tlx` tai project root, xac nhan TLX tu detect project va mo dashboard.
- Lam port `6532` ban, xac nhan loi ro.
- Sua component, xac nhan diff/changed-only sau khi Cache Manager co mat.
- Xoa `.tlx/`, chay lai, xac nhan folder duoc tao sau Phase 2.
- Mo Chromium scan, xac nhan RAM spike duoc giai phong sau scan.

## 14. Assumptions va quy tac uu tien

- `raw_srs.md` la vision cao nhat; SRS nay la ban phased de khop code hien tai.
- Phase gan nhat uu tien Go host + Node worker, public UX chi la `tlx`, khong rewrite chuc nang Node sang Go.
- DevOps Suite va SaaS/cloud la roadmap chinh thuc, nhung khong ep vao v1 local implementation.
- Bat ky tinh nang chua co code phai duoc gan `Planned` hoac `Partial`, khong mo ta nhu da hoan thanh.
- Go nen nhan tinh nang CLI/process/config/DevOps moi; Node nen giu Playwright/tree-sitter/framework logic den khi co ly do manh de port.

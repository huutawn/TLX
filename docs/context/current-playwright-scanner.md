# Current Playwright Scanner Context

Date: 2026-06-12

## File Map

Directory: `apps/worker-node/src/scanner/playwright`

| File | Responsibility |
| --- | --- |
| `runner.ts` | Main scan loop across viewports/routes; invokes collector, analyzer, crawler, API checks, screenshots, color summary. |
| `page-collector.ts` | Runs in browser context; collects DOM geometry, styles, accessibility names, media state, color samples, and page metrics. |
| `checks.ts` | Safe crawler checks, mock form fill, local API contract checks, synthetic/auth issue helpers. |
| `artifacts.ts` | Screenshot capture, screenshot path attachment, route slug generation. |
| `routes.ts` | Route target normalization and same-origin link discovery. |
| `fixed-occlusion.ts` | Probes anchor/focus scrolling against fixed/sticky occluders. |
| `types.ts` | Route target, scan options, and Playwright result types. |

## Current Scan Flow

1. `EngineService.runProjectScan` resolves route targets and calls `PlaywrightScannerRunner.scan`.
2. Runner launches headless Chromium and creates one Playwright context per configured viewport.
3. Each target route is opened with optional auth storage state.
4. HTTP `401`/`403` becomes `auth_required` or `auth_failed`.
5. `collectElements` waits for page settle, then gathers DOM evidence.
6. `analyzeElements` returns visual/accessibility/typography/color issues.
7. `probeFixedOcclusions` adds anchor/focus fixed-header evidence when enabled.
8. Visual issues trigger full-page screenshot capture under `.tlx/screenshots/<reportId>/`.
9. Safe crawler checks same-origin links and fills simple text-like form fields.
10. API contract check calls discovered local endpoints with safe method behavior.
11. Color harmony summary and cross-route drift issues are appended at end.

## Evidence Collected

- Bounding boxes and selectors.
- Text, color, background color, font, line-height, letter spacing.
- Display/position/overflow/scroll metrics.
- Accessible name sources and label text.
- Parent/child/ancestor selectors and interactive ancestor selectors.
- Image complete/natural size state.
- Color samples for text/background/border/SVG fill.
- Page title, URL, text sample, scroll/client dimensions.
- Occlusion evidence from `document.elementFromPoint`.

## Current Strengths

- Local-first screenshots and reports.
- Multi-viewport-ready config, currently default desktop viewport.
- Auth-aware route status classification.
- Screenshot paths attach directly to visual issues.
- Crawler and API checks are safe and bounded.

## Current Limits

- Crawler is shallow; it does not execute deep click/form workflows.
- API contract checks only validate status and JSON parse, not OpenAPI/schema/fuzzing.
- Route discovery is link-based and same-origin only.
- Dynamic routes need future route-param samples.
- Screenshot capture is full-page only; no cropped evidence artifacts yet.
- Playwright dependency errors need clearer user-facing installation hints.

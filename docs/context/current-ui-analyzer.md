# Current UI Analyzer Context

Date: 2026-06-12

## File Map

Directory: `apps/worker-node/src/scanner/ui-analyzer`

| File | Responsibility |
| --- | --- |
| `analyze.ts` | Top-level pure analyzer orchestration. |
| `geometry.ts` | AABB, gap, distance, area, overflow, median utilities. |
| `issues.ts` | Standard issue factory, severity defaults, visual quality defaults. |
| `predicates.ts` | Element classification, grouping, labels, formatting helpers. |
| `contrast.ts` | WCAG contrast ratio math. |
| `rules/layout.ts` | Page overflow, element overflow, overlap, alignment, spacing, orphan, local scroll. |
| `rules/accessibility.ts` | Hit area, tap target spacing, missing accessible names. |
| `rules/typography.ts` | Readable font size, hierarchy, font-family consistency, text clipping, line-height collision. |
| `rules/media.ts` | Broken image detection. |
| `types.ts` | Analyzer input/output and DOM evidence types. |

Related file:

- `apps/worker-node/src/scanner/color-harmony.ts`: OKLCH palette scoring and cross-route hue drift.

## Current Rule Coverage

Implemented issue kinds include:

- `overflow`: document horizontal scroll and element outside viewport.
- `overlap`: visual collisions verified by intersection and top-element hit testing.
- `contrast`: WCAG text contrast below configured ratio.
- `color_harmony`: weak route palette or cross-route hue drift in OKLCH.
- `alignment`: small drift from local row/column alignment cluster.
- `spacing`: inconsistent sibling gap or off-grid spacing.
- `orphan`: isolated element far from related UI cluster.
- `hit_area`: interactive control smaller than configured minimum.
- `tap_target_spacing`: adjacent touch targets too close.
- `text_clipping`: text hidden/truncated by overflow, nowrap, ellipsis, or line clamp.
- `line_height_collision`: wrapped text line boxes collide or line-height ratio is too low.
- `local_scroll`: element-level horizontal scroll when page itself does not overflow.
- `accessible_name`: interactive control has no accessible name.
- `broken_image`: image completed with zero natural dimensions.
- `fixed_occlusion`: fixed/sticky element covers anchor/focus target after scroll.

## Severity Model

- Warnings: contrast, color harmony, alignment, spacing, typography, orphan, hit area, tap target spacing, accessible name, line-height collision.
- Errors: overlap, overflow, text clipping without intentional truncation, local scroll, broken image, fixed occlusion, and other structural failures.
- Report success is false if artifact errors exist or any issue severity is `error`.

## Analyzer Input Contract

Analyzer is pure and does not call Playwright. It depends on `ScannedElement[]` and `AnalyzeOptions` built by `page-collector.ts`:

- route, URL, viewport, issue prefix.
- page metrics and page state.
- contrast threshold.
- visual quality thresholds.
- color harmony thresholds.

## Current Strengths

- Most logic is pure and unit-testable.
- Issue metadata contains fix hints, evidence boxes, viewport size, screenshot dimensions, element labels, and page state.
- Rule thresholds live in config defaults and can be overridden from `tlx.yaml` flat keys.

## Current Limits

- Some rules are heuristic and may produce false positives on complex responsive designs.
- Median helper expects sorted inputs; callers currently sort where needed.
- Color harmony intentionally approximates design consistency; it does not know brand guidelines.
- Analyzer does not yet understand CSS container queries or design token names directly.

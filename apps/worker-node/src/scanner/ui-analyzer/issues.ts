import type { TlxBoundingBox, TlxScanIssue } from '@tlx/contracts';
import { elementLabel } from './predicates';
import type { AnalyzeOptions, ScannedElement, VisualQualityThresholds } from './types';

/**
 * Creates a normalized scan issue with route, viewport, screenshot, and element metadata.
 */
export function createIssue(kind: TlxScanIssue['kind'], index: number, element: ScannedElement, boundingBox: TlxBoundingBox, options: AnalyzeOptions, message: string, metadata: Record<string, unknown>, severity?: TlxScanIssue['severity']): TlxScanIssue {
  return {
    id: `${options.issuePrefix}-${kind}-${index}`,
    kind,
    severity: severity ?? severityForKind(kind),
    message,
    route: options.route,
    url: options.url,
    selector: element.selector,
    boundingBox,
    metadata: {
      tagName: element.tagName,
      text: element.text,
      elementText: element.text,
      elementLabel: elementLabel(element),
      elementSelector: element.selector,
      areaLabel: element.areaLabel,
      areaSelector: element.areaSelector,
      viewportWidth: options.viewport.width,
      viewportHeight: options.viewport.height,
      screenshotWidth: Math.max(options.viewport.width, options.pageMetrics?.scrollWidth ?? options.viewport.width),
      screenshotHeight: Math.max(options.viewport.height, options.pageMetrics?.scrollHeight ?? options.viewport.height),
      pageTitle: options.pageState?.title,
      capturedUrl: options.pageState?.url,
      textSample: options.pageState?.textSample,
      ...metadata,
    },
  };
}

/**
 * Applies visual-quality defaults so rule modules can assume complete thresholds.
 */
export function normalizeVisualQuality(input: Partial<VisualQualityThresholds> | undefined): VisualQualityThresholds {
  return {
    enabled: input?.enabled ?? true,
    alignmentTolerancePx: input?.alignmentTolerancePx ?? 2,
    alignmentMaxDriftPx: input?.alignmentMaxDriftPx ?? 5,
    spacingGridPx: input?.spacingGridPx ?? 4,
    spacingTolerancePx: input?.spacingTolerancePx ?? 1,
    spacingMedianDriftPx: input?.spacingMedianDriftPx ?? 4,
    orphanDistancePx: input?.orphanDistancePx ?? 500,
    minDesktopHitTargetPx: input?.minDesktopHitTargetPx ?? 32,
    minMobileHitTargetPx: input?.minMobileHitTargetPx ?? 40,
    minTapTargetGapPx: input?.minTapTargetGapPx ?? 8,
    minReadableFontPx: input?.minReadableFontPx ?? 12,
    minMobileReadableFontPx: input?.minMobileReadableFontPx ?? 14,
    minInteractiveFontPx: input?.minInteractiveFontPx ?? 13,
    minLineHeightRatio: input?.minLineHeightRatio ?? 1.15,
    maxLocalScrollOverflowPx: input?.maxLocalScrollOverflowPx ?? 12,
    fixedOcclusionProbeEnabled: input?.fixedOcclusionProbeEnabled ?? true,
  };
}

/**
 * Creates a synthetic document element for page-level issues without a DOM selector.
 */
export function createDocumentElement(): ScannedElement {
  return {
    selector: 'document',
    tagName: 'DOCUMENT',
    text: '',
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgb(255, 255, 255)',
    areaLabel: 'Document',
    areaSelector: 'document',
  };
}

/**
 * Maps issue kinds to default severity for report success/failure decisions.
 */
function severityForKind(kind: TlxScanIssue['kind']): TlxScanIssue['severity'] {
  if (kind === 'contrast' || kind === 'color_harmony' || kind === 'alignment' || kind === 'spacing' || kind === 'typography' || kind === 'orphan' || kind === 'hit_area' || kind === 'tap_target_spacing' || kind === 'accessible_name' || kind === 'line_height_collision') return 'warning';
  return 'error';
}

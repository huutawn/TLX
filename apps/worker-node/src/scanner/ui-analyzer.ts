import type { TlxBoundingBox, TlxColorAnalysisThresholds, TlxRouteColorAnalysis, TlxScanIssue } from '@tlx/contracts';
import { analyzeColorHarmony, parseCssColor } from './color-harmony';

export interface ScannedElement {
  selector: string;
  tagName: string;
  text: string;
  boundingBox: TlxBoundingBox;
  color: string;
  backgroundColor: string;
  colorSamples?: Array<{ role: string; value: string }>;
  areaLabel?: string;
  areaSelector?: string;
  ancestorSelectors?: string[];
  interactiveAncestorSelector?: string;
  occludes?: string[];
}

export interface AnalyzeOptions {
  route: string;
  url: string;
  viewport: { width: number; height: number };
  contrastRatio: number;
  colorHarmony?: {
    enabled: boolean;
    thresholds: TlxColorAnalysisThresholds;
  };
  viewportName?: string;
  issuePrefix: string;
  pageMetrics?: { scrollWidth: number; clientWidth: number; scrollHeight?: number; clientHeight?: number };
}

export interface AnalyzeResult {
  issues: TlxScanIssue[];
  elementsScanned: number;
  colorAnalysis?: TlxRouteColorAnalysis;
}

export function analyzeElements(elements: ScannedElement[], options: AnalyzeOptions): AnalyzeResult {
  const issues: TlxScanIssue[] = [];
  const sorted = [...elements].sort((left, right) => left.boundingBox.x - right.boundingBox.x);

    if (options.pageMetrics && options.pageMetrics.scrollWidth > options.pageMetrics.clientWidth + 2) {
      const overflowWidth = options.pageMetrics.scrollWidth - options.pageMetrics.clientWidth;
    issues.push(createIssue('overflow', issues.length, createDocumentElement(), { x: 0, y: 0, width: options.pageMetrics.scrollWidth, height: options.viewport.height }, options, `Page creates ${Math.round(overflowWidth)}px of horizontal scrolling. Fix: remove fixed widths wider than the viewport, add max-width: 100%, or contain overflowing children.`, {
      evidence: 'horizontal-scroll',
      overflowX: overflowWidth,
      fixHint: 'Inspect wide elements, replace fixed width with responsive max-width, and hide decorative overflow only when intentional.',
    }));
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!current) continue;

    if (isOverflowing(current.boundingBox, options.viewport)) {
      const overflowX = overflowAmount(current.boundingBox, options.viewport);
      issues.push(createIssue('overflow', issues.length, current, current.boundingBox, options, `${describeElement(current)} extends ${Math.round(overflowX)}px outside the viewport. Fix: constrain its width, remove negative margins, or make the layout responsive.`, {
        evidence: 'element-outside-viewport',
        overflowX,
        fixHint: 'Check width/min-width, absolute positioning, transforms, and margins for this selector.',
      }));
    }

    const ratio = contrastRatio(current.color, current.backgroundColor);
    if (current.text && ratio > 0 && ratio < options.contrastRatio) {
      issues.push(createIssue('contrast', issues.length, current, current.boundingBox, options, `${describeElement(current)} has low text contrast (${ratio.toFixed(2)}:1, required ${options.contrastRatio}:1). Fix: darken text, lighten/darken background, or increase contrast token.`, {
        ratio,
        color: current.color,
        backgroundColor: current.backgroundColor,
        fixHint: 'Use WCAG AA contrast: 4.5:1 for normal text or 3:1 for large text.',
      }));
    }

    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const candidate = sorted[nextIndex];
      if (!candidate) continue;
      if (candidate.boundingBox.x >= current.boundingBox.x + current.boundingBox.width) break;

      const overlapBox = intersectionBox(current.boundingBox, candidate.boundingBox);
      if (overlapBox && isReportableOverlap(current, candidate, overlapBox)) {
        issues.push(createIssue('overlap', issues.length, current, overlapBox, options, `${describeElement(current)} visually overlaps ${describeElement(candidate)}. Fix: add spacing, remove conflicting absolute positioning, or adjust z-index only if layering is intended.`, {
          evidence: 'geometry+hit-test',
          otherSelector: candidate.selector,
          otherTagName: candidate.tagName,
          otherText: candidate.text,
          overlapRatio: overlapRatio(current.boundingBox, candidate.boundingBox, overlapBox),
          fixHint: 'Inspect both selectors in the named area and check position, z-index, flex/grid gaps, and responsive wrapping.',
        }));
      }
    }
  }

  let colorAnalysis: TlxRouteColorAnalysis | undefined;
  if (options.colorHarmony?.enabled) {
    const result = analyzeColorHarmony(elements, {
      route: options.route,
      viewportName: options.viewportName ?? 'default',
      thresholds: options.colorHarmony.thresholds,
    });
    colorAnalysis = result.analysis;
    if (result.issue) {
      issues.push(createIssue('color_harmony', issues.length, {
        ...createDocumentElement(),
        selector: result.issue.selector,
        boundingBox: result.issue.boundingBox,
      }, result.issue.boundingBox, options, result.issue.message, result.issue.metadata));
    }
  }

  return { issues, elementsScanned: elements.length, colorAnalysis };
}

export function isOverlapping(left: TlxBoundingBox, right: TlxBoundingBox): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

export function isOverflowing(box: TlxBoundingBox, viewport: { width: number; height: number }) {
  return box.x < -2 || box.x + box.width > viewport.width + 2;
}

export function isLikelyParentChildContainment(left: TlxBoundingBox, right: TlxBoundingBox) {
  return (contains(left, right) && area(left) > area(right) * 1.2) || (contains(right, left) && area(right) > area(left) * 1.2);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return 0;

  const foregroundLum = relativeLuminance(fg);
  const backgroundLum = relativeLuminance(bg);
  const lighter = Math.max(foregroundLum, backgroundLum);
  const darker = Math.min(foregroundLum, backgroundLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function createIssue(kind: TlxScanIssue['kind'], index: number, element: ScannedElement, boundingBox: TlxBoundingBox, options: AnalyzeOptions, message: string, metadata: Record<string, unknown>): TlxScanIssue {
  return {
    id: `${options.issuePrefix}-${kind}-${index}`,
    kind,
    severity: kind === 'contrast' || kind === 'color_harmony' ? 'warning' : 'error',
    message,
    route: options.route,
    url: options.url,
    selector: element.selector,
    boundingBox,
    metadata: {
      tagName: element.tagName,
      text: element.text,
      elementText: element.text,
      areaLabel: element.areaLabel,
      areaSelector: element.areaSelector,
      viewportWidth: options.viewport.width,
      viewportHeight: options.viewport.height,
      screenshotWidth: options.viewport.width,
      screenshotHeight: Math.max(options.viewport.height, options.pageMetrics?.scrollHeight ?? options.viewport.height),
      ...metadata,
    },
  };
}

function createDocumentElement(): ScannedElement {
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

function intersectionBox(left: TlxBoundingBox, right: TlxBoundingBox): TlxBoundingBox | undefined {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  const width = maxX - x;
  const height = maxY - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

function isReportableOverlap(left: ScannedElement, right: ScannedElement, overlapBox: TlxBoundingBox): boolean {
  if (overlapBox.width < 4 || overlapBox.height < 4) return false;
  if (isLikelyParentChildContainment(left.boundingBox, right.boundingBox)) return false;
  if (left.ancestorSelectors?.includes(right.selector) || right.ancestorSelectors?.includes(left.selector)) return false;
  if (left.interactiveAncestorSelector && left.interactiveAncestorSelector === right.interactiveAncestorSelector) return false;
  if (!left.occludes?.includes(right.selector) && !right.occludes?.includes(left.selector)) return false;
  return overlapRatio(left.boundingBox, right.boundingBox, overlapBox) >= 0.1;
}

function overlapRatio(left: TlxBoundingBox, right: TlxBoundingBox, overlapBox: TlxBoundingBox) {
  return area(overlapBox) / Math.max(1, Math.min(area(left), area(right)));
}

function overflowAmount(box: TlxBoundingBox, viewport: { width: number }) {
  return Math.max(0, -box.x, box.x + box.width - viewport.width);
}

function describeElement(element: ScannedElement) {
  const text = element.text ? ` "${element.text.slice(0, 40)}"` : '';
  return `${element.tagName.toLowerCase()} ${element.selector}${text}`;
}

function contains(outer: TlxBoundingBox, inner: TlxBoundingBox) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function area(box: TlxBoundingBox) {
  return box.width * box.height;
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

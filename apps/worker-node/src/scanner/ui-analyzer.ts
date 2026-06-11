import type { TlxBoundingBox, TlxColorAnalysisThresholds, TlxRouteColorAnalysis, TlxScanIssue } from '@tlx/contracts';
import { analyzeColorHarmony, parseCssColor } from './color-harmony';

export interface ScannedElement {
  selector: string;
  tagName: string;
  text: string;
  boundingBox: TlxBoundingBox;
  color: string;
  backgroundColor: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  lineHeight?: number;
  letterSpacing?: number;
  display?: string;
  position?: string;
  role?: string;
  parentSelector?: string;
  childrenSelectors?: string[];
  margin?: BoxEdges;
  padding?: BoxEdges;
  overflowX?: string;
  overflowY?: string;
  whiteSpace?: string;
  textOverflow?: string;
  scrollWidth?: number;
  scrollHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
  colorSamples?: Array<{ role: string; value: string }>;
  areaLabel?: string;
  areaSelector?: string;
  ancestorSelectors?: string[];
  interactiveAncestorSelector?: string;
  occludes?: string[];
}

export interface BoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface VisualQualityThresholds {
  enabled: boolean;
  alignmentTolerancePx: number;
  alignmentMaxDriftPx: number;
  spacingGridPx: number;
  spacingTolerancePx: number;
  spacingMedianDriftPx: number;
  orphanDistancePx: number;
  minDesktopHitTargetPx: number;
  minMobileHitTargetPx: number;
  minReadableFontPx: number;
  minMobileReadableFontPx: number;
  minInteractiveFontPx: number;
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
  visualQuality?: Partial<VisualQualityThresholds>;
  viewportName?: string;
  issuePrefix: string;
  pageMetrics?: { scrollWidth: number; clientWidth: number; scrollHeight?: number; clientHeight?: number };
  pageState?: { title: string; url: string; textSample: string };
}

export interface AnalyzeResult {
  issues: TlxScanIssue[];
  elementsScanned: number;
  colorAnalysis?: TlxRouteColorAnalysis;
}

export function analyzeElements(elements: ScannedElement[], options: AnalyzeOptions): AnalyzeResult {
  const issues: TlxScanIssue[] = [];
  const sorted = [...elements].sort((left, right) => left.boundingBox.x - right.boundingBox.x);
  const visualQuality = normalizeVisualQuality(options.visualQuality);

    if (options.pageMetrics && options.pageMetrics.scrollWidth > options.pageMetrics.clientWidth + 2) {
      const overflowWidth = options.pageMetrics.scrollWidth - options.pageMetrics.clientWidth;
    issues.push(createIssue('overflow', issues.length, createDocumentElement(), { x: 0, y: 0, width: options.pageMetrics.scrollWidth, height: options.viewport.height }, options, `Page creates ${Math.round(overflowWidth)}px of horizontal scrolling. Fix: remove fixed widths wider than the viewport, add max-width: 100%, or contain overflowing children.`, {
      evidence: 'horizontal-scroll',
      overflowX: overflowWidth,
      fixHint: 'Inspect wide elements, replace fixed width with responsive max-width, and hide decorative overflow only when intentional.',
    }));
  }

  if (visualQuality.enabled) {
    analyzeAlignment(elements, options, visualQuality, issues);
    analyzeSpacing(elements, options, visualQuality, issues);
    analyzeTypography(elements, options, visualQuality, issues);
    analyzeOrphans(elements, options, visualQuality, issues);
    analyzeHitAreas(elements, options, visualQuality, issues);
    analyzeTextClipping(elements, options, issues);
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
        issues.push(createIssue('overlap', issues.length, current, current.boundingBox, options, `${describeElement(current)} visually overlaps ${describeElement(candidate)}. Fix: add spacing, remove conflicting absolute positioning, or adjust z-index only if layering is intended.`, {
          evidence: 'geometry+hit-test',
          evidenceBox: overlapBox,
          otherSelector: candidate.selector,
          otherTagName: candidate.tagName,
          otherText: candidate.text,
          otherBoundingBox: candidate.boundingBox,
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

function createIssue(kind: TlxScanIssue['kind'], index: number, element: ScannedElement, boundingBox: TlxBoundingBox, options: AnalyzeOptions, message: string, metadata: Record<string, unknown>, severity?: TlxScanIssue['severity']): TlxScanIssue {
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
      screenshotWidth: options.viewport.width,
      screenshotHeight: Math.max(options.viewport.height, options.pageMetrics?.scrollHeight ?? options.viewport.height),
      pageTitle: options.pageState?.title,
      capturedUrl: options.pageState?.url,
      textSample: options.pageState?.textSample,
      ...metadata,
    },
  };
}

function severityForKind(kind: TlxScanIssue['kind']): TlxScanIssue['severity'] {
  if (kind === 'contrast' || kind === 'color_harmony' || kind === 'alignment' || kind === 'spacing' || kind === 'typography' || kind === 'orphan' || kind === 'hit_area') return 'warning';
  return 'error';
}

function normalizeVisualQuality(input: Partial<VisualQualityThresholds> | undefined): VisualQualityThresholds {
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
    minReadableFontPx: input?.minReadableFontPx ?? 12,
    minMobileReadableFontPx: input?.minMobileReadableFontPx ?? 14,
    minInteractiveFontPx: input?.minInteractiveFontPx ?? 13,
  };
}

function analyzeAlignment(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const reported = new Set<string>();
  for (const group of groupedByArea(elements.filter(isLayoutCandidate))) {
    for (const row of clusterByAxis(group, 'y')) {
      reportAlignmentOutliers(row, 'horizontal-row', options, thresholds, issues, reported);
    }
    for (const column of clusterByAxis(group, 'x')) {
      reportAlignmentOutliers(column, 'vertical-column', options, thresholds, issues, reported);
    }
  }
}

function reportAlignmentOutliers(elements: ScannedElement[], cluster: string, options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[], reported: Set<string>) {
  if (elements.length < 3) return;
  const axes: Array<{ name: string; value(element: ScannedElement): number }> = [
    { name: 'left', value: (element) => element.boundingBox.x },
    { name: 'right', value: (element) => element.boundingBox.x + element.boundingBox.width },
    { name: 'center-x', value: (element) => element.boundingBox.x + element.boundingBox.width / 2 },
  ];

  for (const axis of axes) {
    for (const element of elements) {
      const key = `${element.selector}:${axis.name}:${cluster}`;
      if (reported.has(key)) continue;
      const peerValues = elements.filter((item) => item !== element).map(axis.value).sort((left, right) => left - right);
      const peerMedian = median(peerValues);
      const alignedPeers = peerValues.filter((value) => Math.abs(value - peerMedian) <= thresholds.alignmentTolerancePx).length;
      const drift = Math.abs(axis.value(element) - peerMedian);
      if (alignedPeers >= 2 && drift > thresholds.alignmentTolerancePx && drift <= thresholds.alignmentMaxDriftPx) {
        issues.push(createIssue('alignment', issues.length, element, element.boundingBox, options, `${describeElement(element)} is ${formatPx(drift)} off the ${axis.name} alignment used by nearby components. Fix: align it to the shared grid or adjust the sibling spacing intentionally.`, {
          evidence: 'alignment-cluster',
          axis: axis.name,
          cluster,
          driftPx: drift,
          expectedPx: peerMedian,
          peerSelectors: elements.filter((item) => item !== element).map((item) => item.selector).slice(0, 6),
          fixHint: 'Check flex/grid alignment, margins, padding, and manual translate/left offsets in this area.',
        }));
        reported.add(key);
      }
    }
  }
}

function analyzeSpacing(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const byParent = groupMap(elements.filter(isLayoutCandidate).filter((element) => Boolean(element.parentSelector)), (element) => element.parentSelector ?? 'document');
  const reported = new Set<string>();
  for (const siblings of byParent.values()) {
    if (siblings.length < 3) continue;
    reportSpacingGaps(siblings, 'x', options, thresholds, issues, reported);
    reportSpacingGaps(siblings, 'y', options, thresholds, issues, reported);
  }
}

function reportSpacingGaps(elements: ScannedElement[], axis: 'x' | 'y', options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[], reported: Set<string>) {
  const sorted = [...elements].sort((left, right) => axisStart(left.boundingBox, axis) - axisStart(right.boundingBox, axis));
  const gaps: Array<{ before: ScannedElement; after: ScannedElement; gap: number }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const before = sorted[index];
    const after = sorted[index + 1];
    if (!before || !after) continue;
    const overlap = axis === 'x' ? overlapLength(before.boundingBox.y, before.boundingBox.height, after.boundingBox.y, after.boundingBox.height) : overlapLength(before.boundingBox.x, before.boundingBox.width, after.boundingBox.x, after.boundingBox.width);
    const minCross = axis === 'x' ? Math.min(before.boundingBox.height, after.boundingBox.height) : Math.min(before.boundingBox.width, after.boundingBox.width);
    if (overlap < minCross * 0.45) continue;
    const gap = axisStart(after.boundingBox, axis) - axisEnd(before.boundingBox, axis);
    if (gap <= 0 || gap > 240) continue;
    gaps.push({ before, after, gap });
  }

  if (gaps.length < 2) return;
  const medianGap = median(gaps.map((item) => item.gap).sort((left, right) => left - right));
  for (const item of gaps) {
    const nearestGrid = Math.round(item.gap / thresholds.spacingGridPx) * thresholds.spacingGridPx;
    const gridDrift = Math.abs(item.gap - nearestGrid);
    const medianDrift = Math.abs(item.gap - medianGap);
    const offGrid = gridDrift >= Math.min(0.5, thresholds.spacingTolerancePx);
    const inconsistent = offGrid || (medianDrift > thresholds.spacingMedianDriftPx && gridDrift > 0);
    const key = `${item.before.selector}:${item.after.selector}:${axis}`;
    if (!inconsistent || reported.has(key)) continue;
    const evidenceBox = gapBox(item.before.boundingBox, item.after.boundingBox, axis);
    issues.push(createIssue('spacing', issues.length, item.after, item.after.boundingBox, options, `${describeElement(item.after)} is separated from its previous sibling by a ${formatPx(item.gap)} ${axis === 'x' ? 'horizontal' : 'vertical'} gap. Fix: use spacing tokens such as 4px, 8px, 16px, or a consistent flex/grid gap.`, {
      evidence: 'sibling-gap-consistency',
      evidenceBox,
      axis,
      gapPx: item.gap,
      expectedGapPx: nearestGrid,
      medianGapPx: medianGap,
      siblingSelector: item.before.selector,
      siblingBoundingBox: item.before.boundingBox,
      fixHint: 'Prefer a shared gap/margin token on the parent instead of one-off child margins.',
    }));
    reported.add(key);
  }
}

function analyzeTypography(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const textElements = elements.filter((element) => element.text && element.fontSize && element.fontSize > 0 && isLayoutCandidate(element));
  const reported = new Set<string>();
  for (const element of textElements) {
    const fontSize = element.fontSize ?? 0;
    const minReadable = options.viewport.width <= 640 ? thresholds.minMobileReadableFontPx : thresholds.minReadableFontPx;
    const minFont = isInteractiveElement(element) ? thresholds.minInteractiveFontPx : minReadable;
    if (fontSize < minFont) {
      issues.push(createIssue('typography', issues.length, element, element.boundingBox, options, `${describeElement(element)} uses ${formatPx(fontSize)} text, below the ${formatPx(minFont)} readable minimum. Fix: raise the font-size token for this component or viewport.`, {
        evidence: 'font-size-minimum',
        fontSizePx: fontSize,
        expectedMinPx: minFont,
        fontFamily: element.fontFamily,
        fixHint: 'Use readable body text sizes and avoid shrinking labels/buttons below the configured threshold.',
      }));
      reported.add(element.selector);
      continue;
    }

    if (element.lineHeight && fontSize > 0 && element.text.length > 30 && element.lineHeight / fontSize < 1.15) {
      issues.push(createIssue('typography', issues.length, element, element.boundingBox, options, `${describeElement(element)} has tight line-height (${(element.lineHeight / fontSize).toFixed(2)}). Fix: increase line-height for readable multi-word text.`, {
        evidence: 'line-height-ratio',
        fontSizePx: fontSize,
        lineHeightPx: element.lineHeight,
        lineHeightRatio: element.lineHeight / fontSize,
        fixHint: 'Use line-height around 1.3-1.6 for paragraph-like text.',
      }));
      reported.add(element.selector);
    }
  }

  for (const group of groupedByArea(textElements)) {
    const bodySizes = group.filter((element) => !isHeading(element) && !isInteractiveElement(element)).map((element) => element.fontSize ?? 0).filter((value) => value >= thresholds.minReadableFontPx).sort((left, right) => left - right);
    if (bodySizes.length > 0) {
      const bodyMedian = median(bodySizes);
      for (const heading of group.filter(isHeading)) {
        const headingSize = heading.fontSize ?? 0;
        const headingWeight = numericFontWeight(heading.fontWeight);
        const lacksHierarchy = headingSize > 0 && headingSize <= bodyMedian + 1 && headingWeight < 600;
        if (lacksHierarchy && !reported.has(heading.selector)) {
          issues.push(createIssue('typography', issues.length, heading, heading.boundingBox, options, `${describeElement(heading)} does not stand out from nearby body text. Fix: use a larger heading size or stronger type scale token.`, {
            evidence: 'type-scale-hierarchy',
            fontSizePx: headingSize,
            bodyMedianPx: bodyMedian,
            fontWeight: heading.fontWeight,
            fixHint: 'Keep headings visibly larger than paragraph/control text in the same area.',
          }));
          reported.add(heading.selector);
        }
      }
    }

    const families = new Map<string, ScannedElement[]>();
    for (const element of group) {
      const family = normalizeFontFamily(element.fontFamily);
      if (!family) continue;
      const bucket = families.get(family) ?? [];
      bucket.push(element);
      families.set(family, bucket);
    }
    if (families.size > 2) {
      const entries = [...families.entries()].sort((left, right) => right[1].length - left[1].length);
      const outlier = entries[2]?.[1][0];
      if (outlier && !reported.has(outlier.selector)) {
        issues.push(createIssue('typography', issues.length, outlier, outlier.boundingBox, options, `${describeElement(outlier)} introduces an extra font family in this area. Fix: keep component typography on one primary family plus one intentional accent.`, {
          evidence: 'font-family-consistency',
          fontFamily: outlier.fontFamily,
          fontFamilies: entries.map(([family]) => family),
          fixHint: 'Inspect font-family declarations and remove one-off fonts unless this is a deliberate brand/accent treatment.',
        }));
        reported.add(outlier.selector);
      }
    }
  }
}

function analyzeOrphans(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const candidates = elements.filter(isLayoutCandidate).filter((element) => !isLikelyIntentionalEdgeElement(element, options));
  if (candidates.length < 3) return;
  for (const element of candidates) {
    const nearest = Math.min(...candidates.filter((item) => item !== element).map((item) => boxDistance(element.boundingBox, item.boundingBox)));
    const elementArea = area(element.boundingBox);
    if (nearest > thresholds.orphanDistancePx && elementArea < 50000) {
      issues.push(createIssue('orphan', issues.length, element, element.boundingBox, options, `${describeElement(element)} sits ${formatPx(nearest)} away from the nearest UI cluster. Fix: move it into the related section, anchor it as an intentional fixed element, or remove accidental positioning.`, {
        evidence: 'isolated-element-distance',
        distancePx: nearest,
        thresholdPx: thresholds.orphanDistancePx,
        fixHint: 'Check absolute positioning, large margins, transforms, and responsive breakpoints around this element.',
      }));
    }
  }
}

function analyzeHitAreas(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const minimum = options.viewport.width <= 640 ? thresholds.minMobileHitTargetPx : thresholds.minDesktopHitTargetPx;
  for (const element of elements) {
    if (!isInteractiveElement(element) || isInlineTextLink(element)) continue;
    if (element.boundingBox.width >= minimum && element.boundingBox.height >= minimum) continue;
    issues.push(createIssue('hit_area', issues.length, element, element.boundingBox, options, `${describeElement(element)} has a ${formatPx(element.boundingBox.width)} x ${formatPx(element.boundingBox.height)} hit area. Fix: increase padding or min-width/min-height to at least ${formatPx(minimum)}.`, {
      evidence: 'interactive-hit-target-size',
      widthPx: element.boundingBox.width,
      heightPx: element.boundingBox.height,
      expectedMinPx: minimum,
      fixHint: 'Add padding or min-size on the interactive control while keeping the visible label/icon aligned.',
    }));
  }
}

function analyzeTextClipping(elements: ScannedElement[], options: AnalyzeOptions, issues: TlxScanIssue[]) {
  for (const element of elements) {
    if (!element.text || element.clientWidth === undefined || element.scrollWidth === undefined || element.clientHeight === undefined || element.scrollHeight === undefined) continue;
    const clipsX = element.scrollWidth > element.clientWidth + 2 && (element.overflowX === 'hidden' || element.overflowX === 'clip' || element.whiteSpace === 'nowrap' || element.textOverflow === 'ellipsis');
    const clipsY = element.scrollHeight > element.clientHeight + 2 && (element.overflowY === 'hidden' || element.overflowY === 'clip');
    if (!clipsX && !clipsY) continue;
    const intentionalEllipsis = element.textOverflow === 'ellipsis';
    issues.push(createIssue('text_clipping', issues.length, element, element.boundingBox, options, `${describeElement(element)} text is ${intentionalEllipsis ? 'truncated' : 'clipped'} inside its box. Fix: allow wrapping, increase the container size, or make truncation explicit only for low-priority text.`, {
      evidence: intentionalEllipsis ? 'text-ellipsis-overflow' : 'text-clipped-overflow',
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowX: element.overflowX,
      overflowY: element.overflowY,
      textOverflow: element.textOverflow,
      fixHint: 'Inspect width, max-width, white-space, overflow, line-clamp, and translated children for this text element.',
    }, intentionalEllipsis ? 'warning' : 'error'));
  }
}

function isLayoutCandidate(element: ScannedElement) {
  if (element.boundingBox.width < 4 || element.boundingBox.height < 4) return false;
  if (element.boundingBox.width > 4000 || element.boundingBox.height > 4000) return false;
  if (element.tagName === 'SVG' && !element.text && Math.max(element.boundingBox.width, element.boundingBox.height) < 24) return false;
  if (isLandmarkContainer(element) && !isInteractiveElement(element) && directText(element).length === 0) return false;
  return true;
}

function isLandmarkContainer(element: ScannedElement) {
  return ['MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'ASIDE'].includes(element.tagName);
}

function directText(element: ScannedElement) {
  if (!isLandmarkContainer(element)) return element.text;
  return element.childrenSelectors && element.childrenSelectors.length > 0 ? '' : element.text;
}

function isInteractiveElement(element: ScannedElement) {
  const tag = element.tagName.toLowerCase();
  const role = element.role?.toLowerCase();
  return tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab';
}

function isInlineTextLink(element: ScannedElement) {
  return element.tagName === 'A' && element.display === 'inline' && Boolean(element.text) && element.boundingBox.height < 28;
}

function isHeading(element: ScannedElement) {
  return ['H1', 'H2', 'H3'].includes(element.tagName);
}

function isLikelyIntentionalEdgeElement(element: ScannedElement, options: AnalyzeOptions) {
  if (element.position === 'fixed' || element.position === 'sticky') return true;
  if (element.tagName === 'FOOTER' || element.areaSelector?.includes('footer')) return true;
  const bottom = element.boundingBox.y + element.boundingBox.height;
  const pageHeight = options.pageMetrics?.scrollHeight ?? options.viewport.height;
  return pageHeight > options.viewport.height * 1.5 && bottom > pageHeight - 220;
}

function groupedByArea(elements: ScannedElement[]) {
  return [...groupMap(elements, (element) => element.areaSelector ?? element.parentSelector ?? 'document').values()];
}

function groupMap<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function clusterByAxis(elements: ScannedElement[], axis: 'x' | 'y') {
  const clusters: ScannedElement[][] = [];
  const sorted = [...elements].sort((left, right) => axisCenter(left.boundingBox, axis) - axisCenter(right.boundingBox, axis));
  for (const element of sorted) {
    const center = axisCenter(element.boundingBox, axis);
    const cluster = clusters.find((items) => Math.abs(center - median(items.map((item) => axisCenter(item.boundingBox, axis)).sort((left, right) => left - right))) <= 18);
    if (cluster) cluster.push(element);
    else clusters.push([element]);
  }
  return clusters.filter((items) => items.length >= 3);
}

function axisStart(box: TlxBoundingBox, axis: 'x' | 'y') {
  return axis === 'x' ? box.x : box.y;
}

function axisEnd(box: TlxBoundingBox, axis: 'x' | 'y') {
  return axis === 'x' ? box.x + box.width : box.y + box.height;
}

function axisCenter(box: TlxBoundingBox, axis: 'x' | 'y') {
  return axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2;
}

function overlapLength(startA: number, sizeA: number, startB: number, sizeB: number) {
  return Math.max(0, Math.min(startA + sizeA, startB + sizeB) - Math.max(startA, startB));
}

function gapBox(before: TlxBoundingBox, after: TlxBoundingBox, axis: 'x' | 'y'): TlxBoundingBox {
  if (axis === 'x') {
    const x = before.x + before.width;
    const width = Math.max(1, after.x - x);
    const y = Math.max(before.y, after.y);
    const height = Math.max(1, Math.min(before.y + before.height, after.y + after.height) - y);
    return { x, y, width, height };
  }

  const y = before.y + before.height;
  const height = Math.max(1, after.y - y);
  const x = Math.max(before.x, after.x);
  const width = Math.max(1, Math.min(before.x + before.width, after.x + after.width) - x);
  return { x, y, width, height };
}

function boxDistance(left: TlxBoundingBox, right: TlxBoundingBox) {
  const dx = Math.max(0, right.x - (left.x + left.width), left.x - (right.x + right.width));
  const dy = Math.max(0, right.y - (left.y + left.height), left.y - (right.y + right.height));
  return Math.sqrt(dx * dx + dy * dy);
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  const current = values[middle] ?? 0;
  if (values.length % 2 === 1) return current;
  return ((values[middle - 1] ?? current) + current) / 2;
}

function normalizeFontFamily(value: string | undefined) {
  if (!value) return undefined;
  const first = value.split(',')[0]?.replace(/["']/g, '').trim().toLowerCase();
  if (!first || ['sans-serif', 'serif', 'monospace', 'system-ui', '-apple-system', 'blinkmacsystemfont'].includes(first)) return undefined;
  return first;
}

function numericFontWeight(value: string | undefined) {
  if (!value) return 400;
  if (value === 'bold') return 700;
  if (value === 'normal') return 400;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function formatPx(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}px`;
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
  return `${element.tagName.toLowerCase()}${text}`;
}

function elementLabel(element: ScannedElement) {
  const text = element.text ? ` "${element.text.slice(0, 40)}"` : '';
  return `${element.tagName.toLowerCase()}${text}`;
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

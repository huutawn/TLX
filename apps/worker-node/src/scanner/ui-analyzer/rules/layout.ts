import type { TlxBoundingBox, TlxScanIssue } from '@tlx/contracts';
import { axisEnd, axisStart, boxDistance, gapBox, intersectionBox, isLikelyParentChildContainment, isOverflowing, median, overflowAmount, overlapLength, overlapRatio } from '../geometry';
import { createDocumentElement, createIssue } from '../issues';
import { clusterByAxis, describeElement, formatPx, groupedByArea, groupMap, isLayoutCandidate, isLikelyIntentionalEdgeElement } from '../predicates';
import type { AnalyzeOptions, ScannedElement, VisualQualityThresholds } from '../types';

export function analyzePageOverflow(options: AnalyzeOptions, issues: TlxScanIssue[]) {
  if (options.pageMetrics && options.pageMetrics.scrollWidth > options.pageMetrics.clientWidth + 2) {
    const overflowWidth = options.pageMetrics.scrollWidth - options.pageMetrics.clientWidth;
    issues.push(createIssue('overflow', issues.length, createDocumentElement(), { x: 0, y: 0, width: options.pageMetrics.scrollWidth, height: options.viewport.height }, options, `Page creates ${Math.round(overflowWidth)}px of horizontal scrolling. Fix: remove fixed widths wider than the viewport, add max-width: 100%, or contain overflowing children.`, {
      evidence: 'horizontal-scroll',
      overflowX: overflowWidth,
      fixHint: 'Inspect wide elements, replace fixed width with responsive max-width, and hide decorative overflow only when intentional.',
    }));
  }
}

export function analyzeElementOverflowAndOverlap(sorted: ScannedElement[], options: AnalyzeOptions, issues: TlxScanIssue[]) {
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
}

export function analyzeAlignment(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
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

export function analyzeSpacing(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const byParent = groupMap(elements.filter(isLayoutCandidate).filter((element) => Boolean(element.parentSelector)), (element) => element.parentSelector ?? 'document');
  const reported = new Set<string>();
  for (const siblings of byParent.values()) {
    if (siblings.length < 3) continue;
    reportSpacingGaps(siblings, 'x', options, thresholds, issues, reported);
    reportSpacingGaps(siblings, 'y', options, thresholds, issues, reported);
  }
}

export function analyzeOrphans(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const candidates = elements.filter(isLayoutCandidate).filter((element) => !isLikelyIntentionalEdgeElement(element, options));
  if (candidates.length < 3) return;
  for (const element of candidates) {
    const nearest = Math.min(...candidates.filter((item) => item !== element).map((item) => boxDistance(element.boundingBox, item.boundingBox)));
    const elementArea = element.boundingBox.width * element.boundingBox.height;
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

export function analyzeLocalScroll(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const pageOverflows = Boolean(options.pageMetrics && options.pageMetrics.scrollWidth > options.pageMetrics.clientWidth + 2);
  for (const element of elements) {
    if (pageOverflows || !element.scrollWidth || !element.clientWidth || element.scrollWidth <= element.clientWidth + thresholds.maxLocalScrollOverflowPx) continue;
    if (['HTML', 'BODY', 'DOCUMENT'].includes(element.tagName)) continue;
    const scrollable = element.overflowX === 'auto' || element.overflowX === 'scroll' || element.overflowX === 'hidden' || element.overflowX === 'clip';
    const nowrap = element.whiteSpace === 'nowrap' || element.whiteSpace === 'pre' || element.whiteSpace === 'pre-wrap';
    if (!scrollable && !nowrap && element.tagName !== 'TABLE') continue;
    const overflowX = element.scrollWidth - element.clientWidth;
    issues.push(createIssue('local_scroll', issues.length, element, element.boundingBox, options, `${describeElement(element)} creates ${Math.round(overflowX)}px of local horizontal scrolling. Fix: allow wrapping, make tables responsive, or constrain long inline content.`, {
      evidence: 'local-inline-scroll',
      overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      overflowStyle: element.overflowX,
      whiteSpace: element.whiteSpace,
      fixHint: 'Add word-break/overflow-wrap, flex-wrap, min-width: 0, or a deliberate responsive table pattern.',
    }));
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

function isReportableOverlap(left: ScannedElement, right: ScannedElement, overlapBox: TlxBoundingBox): boolean {
  if (overlapBox.width < 4 || overlapBox.height < 4) return false;
  if (isLikelyParentChildContainment(left.boundingBox, right.boundingBox)) return false;
  if (left.ancestorSelectors?.includes(right.selector) || right.ancestorSelectors?.includes(left.selector)) return false;
  if (left.interactiveAncestorSelector && left.interactiveAncestorSelector === right.interactiveAncestorSelector) return false;
  if (!left.occludes?.includes(right.selector) && !right.occludes?.includes(left.selector)) return false;
  return overlapRatio(left.boundingBox, right.boundingBox, overlapBox) >= 0.1;
}

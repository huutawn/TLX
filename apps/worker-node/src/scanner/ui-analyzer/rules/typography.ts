import type { TlxScanIssue } from '@tlx/contracts';
import { createIssue } from '../issues';
import { median } from '../geometry';
import { describeElement, formatPx, groupedByArea, isHeading, isInteractiveElement, isLayoutCandidate, normalizeFontFamily, numericFontWeight } from '../predicates';
import type { AnalyzeOptions, ScannedElement, VisualQualityThresholds } from '../types';

export function analyzeTypography(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
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

export function analyzeTextClipping(elements: ScannedElement[], options: AnalyzeOptions, issues: TlxScanIssue[]) {
  for (const element of elements) {
    if (!element.text || element.clientWidth === undefined || element.scrollWidth === undefined || element.clientHeight === undefined || element.scrollHeight === undefined) continue;
    const clipsX = element.scrollWidth > element.clientWidth + 2 && (element.overflowX === 'hidden' || element.overflowX === 'clip' || element.whiteSpace === 'nowrap' || element.textOverflow === 'ellipsis');
    const lineClamped = Boolean(element.lineClamp && element.lineClamp !== 'none' && element.lineClamp !== '0');
    const clipsY = element.scrollHeight > element.clientHeight + 2 && (element.overflowY === 'hidden' || element.overflowY === 'clip' || lineClamped);
    if (!clipsX && !clipsY) continue;
    const intentionalEllipsis = element.textOverflow === 'ellipsis' || lineClamped;
    issues.push(createIssue('text_clipping', issues.length, element, element.boundingBox, options, `${describeElement(element)} text is ${intentionalEllipsis ? 'truncated' : 'clipped'} inside its box. Fix: allow wrapping, increase the container size, or make truncation explicit only for low-priority text.`, {
      evidence: intentionalEllipsis ? 'text-ellipsis-overflow' : 'text-clipped-overflow',
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowX: element.overflowX,
      overflowY: element.overflowY,
      textOverflow: element.textOverflow,
      lineClamp: element.lineClamp,
      fixHint: 'Inspect width, max-width, white-space, overflow, line-clamp, and translated children for this text element.',
    }, intentionalEllipsis ? 'warning' : 'error'));
  }
}

export function analyzeLineHeightCollision(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  for (const element of elements) {
    if (!element.text || !element.fontSize || !element.lineHeight || element.fontSize <= 0) continue;
    const ratio = element.lineHeight / element.fontSize;
    const multiLine = (element.lineBoxCount ?? 0) > 1 || element.text.length > 30;
    const rectCollision = element.lineBoxMinGap !== undefined && element.lineBoxMinGap < 0;
    if ((!multiLine && !rectCollision) || ratio >= thresholds.minLineHeightRatio) continue;
    issues.push(createIssue('line_height_collision', issues.length, element, element.boundingBox, options, `${describeElement(element)} has ${ratio.toFixed(2)} line-height ratio on multi-line text. Fix: increase line-height so wrapped lines do not collide.`, {
      evidence: rectCollision ? 'line-box-overlap' : 'line-height-ratio',
      fontSizePx: element.fontSize,
      lineHeightPx: element.lineHeight,
      lineHeightRatio: ratio,
      expectedMinRatio: thresholds.minLineHeightRatio,
      lineBoxCount: element.lineBoxCount,
      lineBoxMinGap: element.lineBoxMinGap,
      fixHint: 'Use line-height at least 1.2 for headings and 1.3-1.6 for paragraph-like text that can wrap.',
    }));
  }
}

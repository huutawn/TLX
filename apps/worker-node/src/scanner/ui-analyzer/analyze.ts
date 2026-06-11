import type { TlxScanIssue } from '@tlx/contracts';
import { analyzeColorHarmony } from '../color-harmony';
import { contrastRatio } from './contrast';
import { createDocumentElement, createIssue, normalizeVisualQuality } from './issues';
import { analyzeAccessibleNames, analyzeHitAreas, analyzeTapTargetSpacing } from './rules/accessibility';
import { analyzeAlignment, analyzeElementOverflowAndOverlap, analyzeLocalScroll, analyzeOrphans, analyzePageOverflow, analyzeSpacing } from './rules/layout';
import { analyzeBrokenImages } from './rules/media';
import { analyzeLineHeightCollision, analyzeTextClipping, analyzeTypography } from './rules/typography';
import { describeElement } from './predicates';
import type { AnalyzeOptions, AnalyzeResult, ScannedElement } from './types';

export function analyzeElements(elements: ScannedElement[], options: AnalyzeOptions): AnalyzeResult {
  const issues: TlxScanIssue[] = [];
  const sorted = [...elements].sort((left, right) => left.boundingBox.x - right.boundingBox.x);
  const visualQuality = normalizeVisualQuality(options.visualQuality);

  analyzePageOverflow(options, issues);

  if (visualQuality.enabled) {
    analyzeAlignment(elements, options, visualQuality, issues);
    analyzeSpacing(elements, options, visualQuality, issues);
    analyzeTypography(elements, options, visualQuality, issues);
    analyzeOrphans(elements, options, visualQuality, issues);
    analyzeHitAreas(elements, options, visualQuality, issues);
    analyzeTapTargetSpacing(elements, options, visualQuality, issues);
    analyzeTextClipping(elements, options, issues);
    analyzeLineHeightCollision(elements, options, visualQuality, issues);
    analyzeLocalScroll(elements, options, visualQuality, issues);
    analyzeAccessibleNames(elements, options, issues);
    analyzeBrokenImages(elements, options, issues);
  }

  analyzeElementOverflowAndOverlap(sorted, options, issues);
  analyzeContrast(sorted, options, issues);

  let colorAnalysis: AnalyzeResult['colorAnalysis'];
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

function analyzeContrast(elements: ScannedElement[], options: AnalyzeOptions, issues: TlxScanIssue[]) {
  for (const current of elements) {
    const ratio = contrastRatio(current.color, current.backgroundColor);
    if (current.text && ratio > 0 && ratio < options.contrastRatio) {
      issues.push(createIssue('contrast', issues.length, current, current.boundingBox, options, `${describeElement(current)} has low text contrast (${ratio.toFixed(2)}:1, required ${options.contrastRatio}:1). Fix: darken text, lighten/darken background, or increase contrast token.`, {
        ratio,
        color: current.color,
        backgroundColor: current.backgroundColor,
        fixHint: 'Use WCAG AA contrast: 4.5:1 for normal text or 3:1 for large text.',
      }));
    }
  }
}

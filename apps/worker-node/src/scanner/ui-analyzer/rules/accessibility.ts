import type { TlxScanIssue } from '@tlx/contracts';
import { boxDistance, gapBetweenBoxes } from '../geometry';
import { createIssue } from '../issues';
import { accessibleNameFor, describeElement, formatPx, isInlineTextLink, isInteractiveElement, isLayoutCandidate, sharesInteractiveAncestor } from '../predicates';
import type { AnalyzeOptions, ScannedElement, VisualQualityThresholds } from '../types';

export function analyzeHitAreas(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
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

export function analyzeTapTargetSpacing(elements: ScannedElement[], options: AnalyzeOptions, thresholds: VisualQualityThresholds, issues: TlxScanIssue[]) {
  const controls = elements.filter((element) => isInteractiveElement(element) && !isInlineTextLink(element) && isLayoutCandidate(element));
  const reported = new Set<string>();
  for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
    const left = controls[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
      const right = controls[rightIndex];
      if (!right || sharesInteractiveAncestor(left, right)) continue;
      const distance = boxDistance(left.boundingBox, right.boundingBox);
      if (distance <= 0 || distance >= thresholds.minTapTargetGapPx) continue;
      const key = [left.selector, right.selector].sort().join(':');
      if (reported.has(key)) continue;
      const evidenceBox = gapBetweenBoxes(left.boundingBox, right.boundingBox);
      issues.push(createIssue('tap_target_spacing', issues.length, left, left.boundingBox, options, `${describeElement(left)} is only ${formatPx(distance)} from another tap target. Fix: add spacing or group the controls so touch users do not hit the wrong action.`, {
        evidence: 'interactive-target-spacing',
        evidenceBox,
        distancePx: distance,
        expectedGapPx: thresholds.minTapTargetGapPx,
        otherSelector: right.selector,
        otherTagName: right.tagName,
        otherText: right.text,
        otherBoundingBox: right.boundingBox,
        fixHint: 'Increase gap/margin between adjacent buttons or expand the shared composite control intentionally.',
      }));
      reported.add(key);
    }
  }
}

export function analyzeAccessibleNames(elements: ScannedElement[], options: AnalyzeOptions, issues: TlxScanIssue[]) {
  for (const element of elements) {
    if (!isInteractiveElement(element) || isInlineTextLink(element)) continue;
    if (accessibleNameFor(element)) continue;
    issues.push(createIssue('accessible_name', issues.length, element, element.boundingBox, options, `${describeElement(element)} has no accessible name. Fix: add visible text, aria-label, aria-labelledby, title, or an associated label.`, {
      evidence: 'missing-accessible-name',
      role: element.role,
      ariaLabel: element.ariaLabel,
      title: element.title,
      associatedLabelText: element.associatedLabelText,
      accessibleNameSource: element.accessibleNameSource,
      fixHint: 'Icon-only controls need an aria-label or equivalent accessible name that describes the action.',
    }));
  }
}

import type { TlxScanIssue } from '@tlx/contracts';
import { createIssue } from '../issues';
import { describeElement } from '../predicates';
import type { AnalyzeOptions, ScannedElement } from '../types';

/** Reports image elements that completed loading with zero natural dimensions. */
export function analyzeBrokenImages(elements: ScannedElement[], options: AnalyzeOptions, issues: TlxScanIssue[]) {
  for (const element of elements) {
    if (element.tagName !== 'IMG' || element.complete !== true) continue;
    if ((element.naturalWidth ?? 0) > 0 && (element.naturalHeight ?? 0) > 0) continue;
    issues.push(createIssue('broken_image', issues.length, element, element.boundingBox, options, `${describeElement(element)} did not load an image resource. Fix: correct the src path, public asset location, or remote image configuration.`, {
      evidence: 'img-natural-size-zero',
      imageSrc: element.currentSrc,
      alt: element.alt,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
      fixHint: 'Open the image URL and verify it returns a valid image with the expected deployment base path.',
    }));
  }
}

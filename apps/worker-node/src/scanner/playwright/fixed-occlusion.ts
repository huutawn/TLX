/// <reference lib="dom" />

import type { TlxScanIssue } from '@tlx/contracts';
import type { Page } from 'playwright';
import type { ScannedElement } from '../ui-analyzer';
import { slugRoute } from './artifacts';
import type { RouteScanTarget } from './types';

/**
 * Scrolls anchor/focus targets into view and reports fixed or sticky elements that cover them.
 */
export async function probeFixedOcclusions(page: Page, target: RouteScanTarget, viewportName: string, reportId: string, pageMetrics: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }, pageState: { title: string; url: string; textSample: string }): Promise<TlxScanIssue[]> {
  const probes = await page.evaluate(() => {
    const selectors = 'main, section, article, nav, header, footer, aside, form, button, a, h1, h2, h3, p, input, label, textarea, select, img, svg, [data-tlx-target], .__tlx-target';
    const fixedElements = Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (style.position === 'fixed' || style.position === 'sticky') && rect.width > 0 && rect.height > 0;
      });

    if (fixedElements.length === 0) return [];

    const anchorIds = new Set<string>();
    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).slice(0, 20)) {
      const id = decodeURIComponent(anchor.hash.replace(/^#/, ''));
      if (id) anchorIds.add(id);
    }
    for (const invalid of Array.from(document.querySelectorAll<HTMLElement>('input:invalid, textarea:invalid, select:invalid')).slice(0, 10)) {
      if (invalid.id) anchorIds.add(invalid.id);
    }

    const targets = Array.from(anchorIds)
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))
      .slice(0, 20);
    const issues: Array<{ targetSelector: string; targetText: string; targetBox: ScannedElement['boundingBox']; occluderSelector: string; occluderText: string; occluderBox: ScannedElement['boundingBox']; evidenceBox: ScannedElement['boundingBox']; overlapRatio: number }> = [];
    const originalX = window.scrollX;
    const originalY = window.scrollY;

    for (const element of targets) {
      element.scrollIntoView({ block: 'start', inline: 'nearest' });
      const targetRect = element.getBoundingClientRect();
      if (targetRect.width <= 0 || targetRect.height <= 0) continue;
      for (const fixed of fixedElements) {
        const fixedRect = fixed.getBoundingClientRect();
        const box = intersectionBox(toViewportBox(targetRect), toViewportBox(fixedRect));
        if (!box || box.width < 4 || box.height < 4) continue;
        const ratio = area(box) / Math.max(1, Math.min(area(toViewportBox(targetRect)), area(toViewportBox(fixedRect))));
        if (ratio < 0.2) continue;
        const topElement = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) as HTMLElement | null;
        if (topElement && (topElement === fixed || fixed.contains(topElement))) {
          const scrollX = window.scrollX;
          const scrollY = window.scrollY;
          issues.push({
            targetSelector: buildSelector(element),
            targetText: (element.textContent || '').trim().slice(0, 80),
            targetBox: toDocumentBox(targetRect, scrollX, scrollY),
            occluderSelector: buildSelector(fixed),
            occluderText: (fixed.textContent || '').trim().slice(0, 80),
            occluderBox: toDocumentBox(fixedRect, scrollX, scrollY),
            evidenceBox: toDocumentBox(box, scrollX, scrollY),
            overlapRatio: ratio,
          });
          break;
        }
      }
      if (issues.length >= 5) break;
    }

    window.scrollTo(originalX, originalY);
    return issues;

    /** Converts DOMRect viewport coordinates into TLX bounding-box shape. */
    function toViewportBox(rect: DOMRect): ScannedElement['boundingBox'] {
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }

    /** Converts viewport coordinates to document coordinates using captured scroll offsets. */
    function toDocumentBox(rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>, scrollX: number, scrollY: number): ScannedElement['boundingBox'] {
      return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
    }

    /** Returns the visible intersection between two viewport boxes. */
    function intersectionBox(left: ScannedElement['boundingBox'], right: ScannedElement['boundingBox']): ScannedElement['boundingBox'] | undefined {
      const x = Math.max(left.x, right.x);
      const y = Math.max(left.y, right.y);
      const maxX = Math.min(left.x + left.width, right.x + right.width);
      const maxY = Math.min(left.y + left.height, right.y + right.height);
      const width = maxX - x;
      const height = maxY - y;
      return width > 0 && height > 0 ? { x, y, width, height } : undefined;
    }

    /** Computes box area for overlap-ratio filtering. */
    function area(box: ScannedElement['boundingBox']) {
      return box.width * box.height;
    }

    /** Builds a stable human-readable selector for occlusion evidence. */
    function buildSelector(element: HTMLElement): string {
      if (element.id) return `#${cssEscape(element.id)}`;
      const attr = element.getAttribute('aria-label');
      if (attr) return `${element.tagName.toLowerCase()}[aria-label="${cssEscape(attr)}"]`;
      const parts: string[] = [];
      let current: HTMLElement | null = element;
      while (current && current !== document.body && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const parent: HTMLElement | null = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const siblings = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === current?.tagName);
        const index = siblings.indexOf(current) + 1;
        parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        current = parent;
      }
      return parts.join(' > ');
    }

    /** Escapes selector fragments in browser context with a small fallback. */
    function cssEscape(value: string): string {
      if ('CSS' in window && typeof CSS.escape === 'function') return CSS.escape(value);
      return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
  });

  return probes.map((probe, index): TlxScanIssue => ({
    id: `${reportId}-${slugRoute(target.route)}-${viewportName}-fixed-occlusion-${index}`,
    kind: 'fixed_occlusion',
    severity: 'error',
    message: `${probe.occluderSelector} covers ${probe.targetSelector} after anchor or focus scrolling. Fix: add scroll-margin-top to anchor targets or offset scroll behavior by the fixed header height.`,
    route: target.route,
    url: target.url,
    selector: probe.targetSelector,
    boundingBox: probe.targetBox,
    metadata: {
      evidence: 'fixed-element-anchor-occlusion',
      evidenceBox: probe.evidenceBox,
      viewport: viewportName,
      viewportWidth: pageMetrics.clientWidth,
      viewportHeight: pageMetrics.clientHeight,
      screenshotWidth: pageMetrics.clientWidth,
      screenshotHeight: Math.max(pageMetrics.clientHeight, pageMetrics.scrollHeight),
      pageTitle: pageState.title,
      capturedUrl: pageState.url,
      textSample: pageState.textSample,
      elementLabel: probe.targetText || probe.targetSelector,
      elementSelector: probe.targetSelector,
      occluderSelector: probe.occluderSelector,
      occluderText: probe.occluderText,
      occluderBoundingBox: probe.occluderBox,
      overlapRatio: probe.overlapRatio,
      fixHint: 'Add scroll-margin-top on anchor/focus targets, or configure scroll-padding-top on the scroll container to match the fixed header height.',
    },
  }));
}

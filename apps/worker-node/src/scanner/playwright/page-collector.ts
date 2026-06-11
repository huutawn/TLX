/// <reference lib="dom" />

import type { Page } from 'playwright';
import type { ScannedElement } from '../ui-analyzer';
import type { PageScanResult } from './types';

export async function waitForPageSettled(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready.then(() => undefined)).catch(() => undefined);
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText ?? '';
    const signature = `${location.href}|${root.scrollWidth}x${root.scrollHeight}|${bodyText.length}|${bodyText.slice(0, 240)}`;
    const key = '__tlxStableState';
    const state = ((window as unknown as Record<string, { signature: string; count: number }>)[key] ?? { signature, count: 0 });
    if (state.signature === signature) state.count += 1;
    else {
      state.signature = signature;
      state.count = 0;
    }
    (window as unknown as Record<string, { signature: string; count: number }>)[key] = state;
    return state.count >= 2;
  }, undefined, { timeout: 2_500, polling: 250 }).catch(() => undefined);
  await page.waitForTimeout(100).catch(() => undefined);
}

export async function collectElements(page: Page): Promise<PageScanResult> {
  return page.evaluate(() => {
    const selectors = 'main, section, article, nav, header, footer, aside, form, button, a, h1, h2, h3, p, input, label, textarea, select, img, svg, [data-tlx-target], .__tlx-target';
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const selector = buildSelector(el);
        const label = accessibleLabel(el);
        const lineBoxes = lineBoxMetrics(el);
        return {
          selector,
          tagName: el.tagName,
          text: (el.textContent || '').trim().substring(0, 80),
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          color: style.color,
          backgroundColor: findBackgroundColor(el),
          fontSize: parseCssPx(style.fontSize),
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          lineHeight: parseLineHeight(style.lineHeight, style.fontSize),
          letterSpacing: parseCssPx(style.letterSpacing) ?? 0,
          display: style.display,
          position: style.position,
          role: el.getAttribute('role') ?? undefined,
          ariaLabel: el.getAttribute('aria-label') ?? undefined,
          title: el.getAttribute('title') ?? undefined,
          alt: el instanceof HTMLImageElement ? el.alt : undefined,
          name: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el.name : undefined,
          placeholder: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder : undefined,
          value: el instanceof HTMLInputElement || el instanceof HTMLButtonElement ? el.value : undefined,
          associatedLabelText: associatedLabelText(el),
          accessibleName: label.name,
          accessibleNameSource: label.source,
          parentSelector: el.parentElement && el.parentElement !== document.body ? buildSelector(el.parentElement) : undefined,
          childrenSelectors: Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement).map((child) => buildSelector(child)),
          margin: boxEdges(style, 'margin'),
          padding: boxEdges(style, 'padding'),
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          scrollWidth: el.scrollWidth,
          scrollHeight: el.scrollHeight,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
          lineClamp: style.getPropertyValue('-webkit-line-clamp') || undefined,
          lineBoxCount: lineBoxes.count,
          lineBoxMinGap: lineBoxes.minGap,
          currentSrc: el instanceof HTMLImageElement ? el.currentSrc || el.src : undefined,
          naturalWidth: el instanceof HTMLImageElement ? el.naturalWidth : undefined,
          naturalHeight: el instanceof HTMLImageElement ? el.naturalHeight : undefined,
          complete: el instanceof HTMLImageElement ? el.complete : undefined,
          colorSamples: colorSamples(el, style),
          areaLabel: findAreaLabel(el),
          areaSelector: findAreaSelector(el),
          ancestorSelectors: ancestorSelectors(el),
          interactiveAncestorSelector: closestSelector(el, 'button, a, [role="button"], [role="link"]'),
          occludes: [] as string[],
        };
      })
      .filter((item) => item.boundingBox.width > 0 && item.boundingBox.height > 0 && isVisible(document.querySelector(item.selector) as HTMLElement | null));

    for (let leftIndex = 0; leftIndex < elements.length; leftIndex += 1) {
      const left = elements[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < elements.length; rightIndex += 1) {
        const right = elements[rightIndex];
        if (!right) continue;
        const box = intersectionBox(left.boundingBox, right.boundingBox);
        if (!box || box.width < 4 || box.height < 4) continue;
        const topSelector = topElementSelector(box);
        if (topSelector === left.selector) left.occludes.push(right.selector);
        if (topSelector === right.selector) right.occludes.push(left.selector);
      }
    }

    return {
      elements,
      pageMetrics: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
      pageState: {
        title: document.title,
        url: location.href,
        textSample: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
      },
    };

    function isVisible(element: HTMLElement | null): boolean {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.getAttribute('aria-hidden') !== 'true';
    }

    function buildSelector(element: HTMLElement): string {
      if (element.id) return `#${cssEscape(element.id)}`;
      for (const attr of ['data-testid', 'data-test', 'aria-label']) {
        const value = element.getAttribute(attr);
        if (value) return `${element.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
      }

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

    function cssEscape(value: string): string {
      if ('CSS' in window && typeof CSS.escape === 'function') return CSS.escape(value);
      return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function ancestorSelectors(element: HTMLElement): string[] {
      const selectors: string[] = [];
      let current = element.parentElement;
      while (current && current !== document.body) {
        selectors.push(buildSelector(current));
        current = current.parentElement;
      }
      return selectors;
    }

    function closestSelector(element: HTMLElement, selector: string): string | undefined {
      const closest = element.closest<HTMLElement>(selector);
      return closest ? buildSelector(closest) : undefined;
    }

    function associatedLabelText(element: HTMLElement): string | undefined {
      const labels: string[] = [];
      const id = element.id;
      if (id) {
        labels.push(...Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`)).map((label) => label.textContent?.trim() ?? ''));
      }
      const wrappingLabel = element.closest('label');
      if (wrappingLabel) labels.push(wrappingLabel.textContent?.trim() ?? '');
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        for (const labelId of ariaLabelledBy.split(/\s+/)) {
          const labelledElement = document.getElementById(labelId);
          if (labelledElement) labels.push(labelledElement.textContent?.trim() ?? '');
        }
      }
      return labels.map((value) => value.replace(/\s+/g, ' ').trim()).find(Boolean);
    }

    function accessibleLabel(element: HTMLElement): { name?: string; source?: string } {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return { name: text, source: 'text' };
      const aria = element.getAttribute('aria-label')?.trim();
      if (aria) return { name: aria, source: 'aria-label' };
      const associated = associatedLabelText(element);
      if (associated) return { name: associated, source: 'label' };
      const title = element.getAttribute('title')?.trim();
      if (title) return { name: title, source: 'title' };
      if (element instanceof HTMLImageElement && element.alt.trim()) return { name: element.alt.trim(), source: 'alt' };
      if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder.trim()) return { name: element.placeholder, source: 'placeholder' };
      return {};
    }

    function lineBoxMetrics(element: HTMLElement): { count?: number; minGap?: number } {
      const text = element.textContent?.trim();
      if (!text) return {};
      try {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects())
          .filter((rect) => rect.width > 1 && rect.height > 1)
          .sort((left, right) => left.top - right.top || left.left - right.left);
        range.detach();
        if (rects.length <= 1) return { count: rects.length };
        let minGap = Number.POSITIVE_INFINITY;
        for (let index = 1; index < rects.length; index += 1) {
          const previous = rects[index - 1];
          const current = rects[index];
          if (!previous || !current) continue;
          minGap = Math.min(minGap, current.top - previous.bottom);
        }
        return { count: rects.length, minGap: Number.isFinite(minGap) ? minGap : undefined };
      } catch {
        return {};
      }
    }

    function findAreaSelector(element: HTMLElement): string | undefined {
      const area = element.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form');
      return area ? buildSelector(area) : undefined;
    }

    function findAreaLabel(element: HTMLElement): string | undefined {
      const area = element.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form');
      const heading = area?.querySelector<HTMLElement>('h1, h2, h3') ?? element.closest<HTMLElement>('section, article, main')?.querySelector<HTMLElement>('h1, h2, h3');
      const label = heading?.textContent?.trim() || area?.getAttribute('aria-label') || area?.tagName.toLowerCase();
      return label ? label.substring(0, 80) : undefined;
    }

    function intersectionBox(left: ScannedElement['boundingBox'], right: ScannedElement['boundingBox']): ScannedElement['boundingBox'] | undefined {
      const x = Math.max(left.x, right.x);
      const y = Math.max(left.y, right.y);
      const maxX = Math.min(left.x + left.width, right.x + right.width);
      const maxY = Math.min(left.y + left.height, right.y + right.height);
      const width = maxX - x;
      const height = maxY - y;
      return width > 0 && height > 0 ? { x, y, width, height } : undefined;
    }

    function topElementSelector(box: ScannedElement['boundingBox']): string | undefined {
      const points: Array<[number, number]> = [
        [box.x + box.width / 2, box.y + box.height / 2],
        [box.x + Math.min(3, box.width / 2), box.y + Math.min(3, box.height / 2)],
        [box.x + box.width - Math.min(3, box.width / 2), box.y + box.height - Math.min(3, box.height / 2)],
      ];
      for (const [x, y] of points) {
        const element = document.elementFromPoint(x, y) as HTMLElement | null;
        const target = element?.closest<HTMLElement>(selectors);
        if (target) return buildSelector(target);
      }
      return undefined;
    }

    function findBackgroundColor(element: HTMLElement): string {
      let current: HTMLElement | null = element;
      while (current) {
        const style = window.getComputedStyle(current);
        const color = style.backgroundColor;
        if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
        if (style.backgroundImage && style.backgroundImage !== 'none') return 'unknown-background-image';
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    }

    function colorSamples(element: HTMLElement, style: CSSStyleDeclaration): Array<{ role: string; value: string }> {
      const samples = [
        { role: 'text', value: style.color },
        { role: 'background', value: findBackgroundColor(element) },
      ];
      if (style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth || '0') > 0) {
        samples.push({ role: 'border', value: style.borderTopColor });
      }
      const fill = element instanceof SVGElement ? element.getAttribute('fill') || style.fill : '';
      if (fill && fill !== 'none') {
        samples.push({ role: 'fill', value: fill });
      }
      return samples;
    }

    function parseCssPx(value: string): number | undefined {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    function parseLineHeight(lineHeight: string, fontSize: string): number | undefined {
      const parsed = parseCssPx(lineHeight);
      if (parsed !== undefined) return parsed;
      const size = parseCssPx(fontSize);
      return size !== undefined && lineHeight === 'normal' ? size * 1.2 : undefined;
    }

    function boxEdges(style: CSSStyleDeclaration, prefix: 'margin' | 'padding') {
      return {
        top: parseCssPx(style.getPropertyValue(`${prefix}-top`)) ?? 0,
        right: parseCssPx(style.getPropertyValue(`${prefix}-right`)) ?? 0,
        bottom: parseCssPx(style.getPropertyValue(`${prefix}-bottom`)) ?? 0,
        left: parseCssPx(style.getPropertyValue(`${prefix}-left`)) ?? 0,
      };
    }
  });
}

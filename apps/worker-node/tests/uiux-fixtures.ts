/// <reference lib="dom" />

import { expect } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { chromium, type Browser } from 'playwright';
import type { TlxScanIssue, TlxScanIssueKind } from '@tlx/contracts';
import { analyzeElements, type AnalyzeResult, type ScannedElement } from '../src/scanner/ui-analyzer';
import { PlaywrightScannerRunner, type PlaywrightScanResult, type RouteScanTarget } from '../src/scanner/playwright-runner';
import type { TlxProjectConfig } from '../src/services/storage.service';

export const tempRoots: string[] = [];

export async function cleanupTempRoots() {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
}

export async function makeTempRoot(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

export async function scanHtmlFixture(html: string, options: { browser?: Browser; visualQuality?: Partial<TlxProjectConfig['scan']['visualQuality']>; colorHarmony?: Partial<TlxProjectConfig['scan']['colorHarmony']>; viewport?: { name: string; width: number; height: number } } = {}): Promise<AnalyzeResult> {
  const ownsBrowser = !options.browser;
  const browser = options.browser ?? await chromium.launch({ headless: true });
  const viewport = options.viewport ?? { name: 'desktop', width: 1000, height: 700 };
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts?.ready.then(() => undefined)).catch(() => undefined);
    const pageScan = await page.evaluate(() => {
      const selectors = 'main, section, article, nav, header, footer, aside, form, button, a, h1, h2, h3, p, input, label, textarea, select, img, svg, [data-tlx-target], .__tlx-target';
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const selector = selectorFor(el);
          const area = el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form');
          return {
            selector,
            tagName: el.tagName,
            text: (el.textContent || '').trim().slice(0, 80),
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            color: style.color,
            backgroundColor: backgroundFor(el),
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
            accessibleName: accessibleName(el),
            parentSelector: el.parentElement && el.parentElement !== document.body ? selectorFor(el.parentElement) : undefined,
            childrenSelectors: Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement).map(selectorFor),
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            whiteSpace: style.whiteSpace,
            textOverflow: style.textOverflow,
            scrollWidth: el.scrollWidth,
            scrollHeight: el.scrollHeight,
            clientWidth: el.clientWidth,
            clientHeight: el.clientHeight,
            lineClamp: style.getPropertyValue('-webkit-line-clamp') || undefined,
            currentSrc: el instanceof HTMLImageElement ? el.currentSrc || el.src : undefined,
            naturalWidth: el instanceof HTMLImageElement ? el.naturalWidth : undefined,
            naturalHeight: el instanceof HTMLImageElement ? el.naturalHeight : undefined,
            complete: el instanceof HTMLImageElement ? el.complete : undefined,
            areaLabel: area?.getAttribute('aria-label') ?? area?.querySelector('h1,h2,h3')?.textContent?.trim() ?? area?.tagName.toLowerCase(),
            areaSelector: area ? selectorFor(area) : undefined,
            ancestorSelectors: ancestors(el),
            interactiveAncestorSelector: closestSelector(el, 'button, a, [role="button"], [role="link"]'),
            occludes: [] as string[],
          } satisfies ScannedElement;
        })
        .filter((item) => item.boundingBox.width > 0 && item.boundingBox.height > 0);

      for (let leftIndex = 0; leftIndex < elements.length; leftIndex += 1) {
        const left = elements[leftIndex];
        if (!left) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < elements.length; rightIndex += 1) {
          const right = elements[rightIndex];
          if (!right) continue;
          const box = intersectionBox(left.boundingBox, right.boundingBox);
          if (!box || box.width < 4 || box.height < 4) continue;
          const top = topSelector(box);
          if (top === left.selector) left.occludes.push(right.selector);
          if (top === right.selector) right.occludes.push(left.selector);
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

      function selectorFor(element: HTMLElement): string {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const testId = element.getAttribute('data-testid');
        if (testId) return `${element.tagName.toLowerCase()}[data-testid="${CSS.escape(testId)}"]`;
        return element.tagName.toLowerCase();
      }

      function closestSelector(element: HTMLElement, selector: string): string | undefined {
        const closest = element.closest<HTMLElement>(selector);
        return closest ? selectorFor(closest) : undefined;
      }

      function ancestors(element: HTMLElement): string[] {
        const selectors: string[] = [];
        let current = element.parentElement;
        while (current && current !== document.body) {
          selectors.push(selectorFor(current));
          current = current.parentElement;
        }
        return selectors;
      }

      function backgroundFor(element: HTMLElement): string {
        let current: HTMLElement | null = element;
        while (current) {
          const color = window.getComputedStyle(current).backgroundColor;
          if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
          current = current.parentElement;
        }
        return 'rgb(255, 255, 255)';
      }

      function associatedLabelText(element: HTMLElement): string | undefined {
        const id = element.id;
        const labels = id ? Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)).map((label) => label.textContent?.trim() ?? '') : [];
        const wrapping = element.closest('label')?.textContent?.trim();
        if (wrapping) labels.push(wrapping);
        return labels.find(Boolean);
      }

      function accessibleName(element: HTMLElement): string | undefined {
        return (element.textContent || '').trim() || element.getAttribute('aria-label')?.trim() || associatedLabelText(element) || element.getAttribute('title')?.trim() || undefined;
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

      function intersectionBox(left: ScannedElement['boundingBox'], right: ScannedElement['boundingBox']): ScannedElement['boundingBox'] | undefined {
        const x = Math.max(left.x, right.x);
        const y = Math.max(left.y, right.y);
        const maxX = Math.min(left.x + left.width, right.x + right.width);
        const maxY = Math.min(left.y + left.height, right.y + right.height);
        const width = maxX - x;
        const height = maxY - y;
        return width > 0 && height > 0 ? { x, y, width, height } : undefined;
      }

      function topSelector(box: ScannedElement['boundingBox']): string | undefined {
        const element = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) as HTMLElement | null;
        const target = element?.closest<HTMLElement>(selectors);
        return target ? selectorFor(target) : undefined;
      }
    });

    const result = analyzeElements(pageScan.elements, {
      route: '/',
      url: 'http://localhost:3000',
      viewport,
      contrastRatio: 4.5,
      colorHarmony: { enabled: options.colorHarmony?.enabled ?? false, thresholds: colorHarmonyThresholds(options.colorHarmony) },
      visualQuality: options.visualQuality,
      viewportName: viewport.name,
      issuePrefix: 'fixture',
      pageMetrics: pageScan.pageMetrics,
      pageState: pageScan.pageState,
    });
    return { ...result, issues: result.issues.map((issue) => ({ ...issue, metadata: { ...issue.metadata, viewport: viewport.name } })) };
  } finally {
    await page.close();
    if (ownsBrowser) await browser.close();
  }
}

export function serveFixture(routes: Record<string, string | ((request: Request) => Response | Promise<Response>)>) {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const route = routes[url.pathname] ?? routes['*'];
      if (typeof route === 'function') return route(request);
      if (typeof route === 'string') return htmlResponse(route);
      return new Response('missing', { status: 404 });
    },
  });

  const origin = `http://localhost:${server.port}`;
  return {
    server,
    origin,
    urlFor(route: string) {
      return `${origin}${route}`;
    },
    target(route = '/'): RouteScanTarget {
      return { route, url: `${origin}${route}` };
    },
    async scan(targets: RouteScanTarget[] = [{ route: '/', url: `${origin}/` }], options: { reportId?: string; root?: string; config?: TlxProjectConfig; discoverRoutes?: boolean; storageStatePath?: string; apiEndpoints?: string[] } = {}): Promise<PlaywrightScanResult> {
      const root = options.root ?? await makeTempRoot('tlx-uiux-runner-');
      return new PlaywrightScannerRunner().scan(targets, {
        reportId: options.reportId ?? 'fixture',
        screenshotsDir: root,
        relativeScreenshotPath: (_reportId, fileName) => fileName,
        config: options.config ?? testConfig(),
        apiEndpoints: options.apiEndpoints ?? [],
        discoverRoutes: options.discoverRoutes,
        storageStatePath: options.storageStatePath,
      });
    },
  };
}

export function htmlResponse(html: string, init: ResponseInit = {}) {
  return new Response(html, { ...init, headers: { 'Content-Type': 'text/html', ...init.headers } });
}

export function expectIssue(result: Pick<AnalyzeResult | PlaywrightScanResult, 'issues'>, kind: TlxScanIssueKind, metadata: Record<string, unknown> = {}) {
  const issue = result.issues.find((item) => item.kind === kind && Object.entries(metadata).every(([key, value]) => item.metadata[key] === value));
  expect(issue).toBeDefined();
  return issue as TlxScanIssue;
}

export function expectNoIssue(result: Pick<AnalyzeResult | PlaywrightScanResult, 'issues'>, kind: TlxScanIssueKind) {
  expect(result.issues.filter((issue) => issue.kind === kind)).toEqual([]);
}

export function testConfig(overrides: { colorHarmony?: Partial<TlxProjectConfig['scan']['colorHarmony']>; visualQuality?: Partial<TlxProjectConfig['scan']['visualQuality']>; crawler?: Partial<TlxProjectConfig['scan']['crawler']>; api?: Partial<TlxProjectConfig['scan']['api']>; viewports?: TlxProjectConfig['scan']['viewports'] } = {}): TlxProjectConfig {
  return {
    auth: { mode: 'none', profile: 'default' },
    scan: {
      defaultScope: 'all',
      ignoredPaths: [],
      viewports: overrides.viewports ?? [{ name: 'desktop', width: 1000, height: 700 }],
      contrastRatio: 4.5,
      colorHarmony: {
        enabled: true,
        maxStrongHueFamilies: 3,
        maxRouteHueDrift: 85,
        maxHighChromaAreaRatio: 0.35,
        maxHueSpread: 150,
        ...overrides.colorHarmony,
      },
      visualQuality: {
        enabled: true,
        alignmentTolerancePx: 2,
        alignmentMaxDriftPx: 5,
        spacingGridPx: 4,
        spacingTolerancePx: 1,
        spacingMedianDriftPx: 4,
        orphanDistancePx: 500,
        minDesktopHitTargetPx: 32,
        minMobileHitTargetPx: 40,
        minTapTargetGapPx: 8,
        minReadableFontPx: 12,
        minMobileReadableFontPx: 14,
        minInteractiveFontPx: 13,
        minLineHeightRatio: 1.15,
        maxLocalScrollOverflowPx: 12,
        fixedOcclusionProbeEnabled: true,
        ...overrides.visualQuality,
      },
      crawler: { enabled: false, maxDepth: 1, maxPages: 10, ...overrides.crawler },
      api: { enabled: false, unsafeMethods: false, ...overrides.api },
    },
  };
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function colorHarmonyThresholds(overrides: Partial<TlxProjectConfig['scan']['colorHarmony']> = {}) {
  return {
    maxStrongHueFamilies: overrides.maxStrongHueFamilies ?? 3,
    maxRouteHueDrift: overrides.maxRouteHueDrift ?? 85,
    maxHighChromaAreaRatio: overrides.maxHighChromaAreaRatio ?? 0.35,
    maxHueSpread: overrides.maxHueSpread ?? 150,
  };
}

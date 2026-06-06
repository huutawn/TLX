/// <reference lib="dom" />

import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import type { TlxScanIssue } from '@tlx/contracts';
import type { TlxProjectConfig } from '../services/storage.service';
import { analyzeElements, type ScannedElement } from './ui-analyzer';

export interface RouteScanTarget {
  route: string;
  url: string;
}

export interface PlaywrightScanOptions {
  reportId: string;
  screenshotsDir: string;
  relativeScreenshotPath(reportId: string, fileName: string): string;
  config: TlxProjectConfig;
  apiEndpoints: string[];
  discoverRoutes?: boolean;
}

export interface PlaywrightScanResult {
  issues: TlxScanIssue[];
  screenshots: string[];
  elementsScanned: number;
  routesScanned: number;
  warnings: string[];
}

export class PlaywrightScannerRunner {
  async scan(targets: RouteScanTarget[], options: PlaywrightScanOptions): Promise<PlaywrightScanResult> {
    const browser = await chromium.launch({ headless: true });
    try {
      return await this.scanWithBrowser(browser, targets, options);
    } finally {
      await browser.close();
    }
  }

  private async scanWithBrowser(browser: Browser, targets: RouteScanTarget[], options: PlaywrightScanOptions): Promise<PlaywrightScanResult> {
    const issues: TlxScanIssue[] = [];
    const screenshots = new Set<string>();
    const warnings: string[] = [];
    const scannedRoutes = new Set<string>();
    let elementsScanned = 0;

    await fs.mkdir(options.screenshotsDir, { recursive: true });

    for (const viewport of options.config.scan.viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(error.message));

      try {
        const queuedTargets = uniqueTargets(targets);
        for (let targetIndex = 0; targetIndex < queuedTargets.length; targetIndex += 1) {
          const target = queuedTargets[targetIndex];
          if (!target) continue;
          const response = await page.goto(target.url, { waitUntil: 'networkidle' });
          scannedRoutes.add(target.route);
          if (response && response.status() >= 400) {
            issues.push(createSyntheticIssue('crawler', target, `Route returned HTTP ${response.status()}. Fix: verify this page exists, the dev server route is correct, and required data loaders do not fail.`, { status: response.status(), viewport: viewport.name }));
          }

          if (options.discoverRoutes) {
            const discovered = await discoverInternalTargets(page, target, options.config.scan.crawler.maxPages);
            const seenRoutes = new Set(queuedTargets.map((item) => item.route));
            for (const discoveredTarget of discovered) {
              if (!seenRoutes.has(discoveredTarget.route) && queuedTargets.length < options.config.scan.crawler.maxPages) {
                queuedTargets.push(discoveredTarget);
                seenRoutes.add(discoveredTarget.route);
              }
            }
          }

          const pageScan = await collectElements(page);
          const result = analyzeElements(pageScan.elements, {
            route: target.route,
            url: target.url,
            viewport,
            contrastRatio: options.config.scan.contrastRatio,
            issuePrefix: `${options.reportId}-${slugRoute(target.route)}-${viewport.name}`,
            pageMetrics: pageScan.pageMetrics,
          });
          elementsScanned += result.elementsScanned;
          issues.push(...result.issues.map((issue) => ({ ...issue, metadata: { ...issue.metadata, viewport: viewport.name } })));

          if (options.config.scan.crawler.enabled) {
            issues.push(...(await crawlSafe(page, target, options.config.scan.crawler.maxDepth, options.config.scan.crawler.maxPages)));
          }

          if (consoleErrors.length > 0) {
            issues.push(createSyntheticIssue('crawler', target, 'Page logged a console error. Fix: open this route, check the listed console errors, and repair the failing component or data request.', { errors: [...consoleErrors], viewport: viewport.name }));
            consoleErrors.length = 0;
          }

          if (options.config.scan.api.enabled) {
            issues.push(...(await checkApiContracts(page, target, options.apiEndpoints, options.config.scan.api.unsafeMethods)));
          }

          const routeIssues = issues.filter((issue) => issue.route === target.route && !issue.screenshotPath);
          if (routeIssues.length > 0) {
            const fileName = `${slugRoute(target.route)}-${viewport.name}.png`;
            const absolutePath = path.join(options.screenshotsDir, fileName);
            const relativePath = options.relativeScreenshotPath(options.reportId, fileName);
            await page.screenshot({ path: absolutePath, fullPage: true });
            screenshots.add(relativePath);
            for (const issue of routeIssues) {
              issue.screenshotPath = relativePath;
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`[${viewport.name}] ${message}`);
      } finally {
        await page.close();
      }
    }

    return { issues, screenshots: [...screenshots], elementsScanned, routesScanned: scannedRoutes.size, warnings };
  }
}

function uniqueTargets(targets: RouteScanTarget[]): RouteScanTarget[] {
  const seen = new Set<string>();
  const unique: RouteScanTarget[] = [];
  for (const target of targets) {
    if (!seen.has(target.route)) {
      unique.push(target);
      seen.add(target.route);
    }
  }
  return unique;
}

async function discoverInternalTargets(page: Page, target: RouteScanTarget, maxPages: number): Promise<RouteScanTarget[]> {
  const origin = new URL(target.url).origin;
  const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
  const routes: RouteScanTarget[] = [];
  for (const href of hrefs.slice(0, maxPages)) {
    const url = new URL(href, target.url);
    if (url.origin !== origin || url.hash || url.pathname.startsWith('/api/')) continue;
    routes.push({ route: `${url.pathname}${url.search}`, url: `${origin}${url.pathname}${url.search}` });
  }
  return uniqueTargets(routes);
}

async function collectElements(page: Page): Promise<{ elements: ScannedElement[]; pageMetrics: { scrollWidth: number; clientWidth: number } }> {
  return page.evaluate(() => {
    const selectors = 'button, a, h1, h2, h3, p, input, label, textarea, select, img, [data-tlx-target], .__tlx-target';
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const selector = buildSelector(el);
        return {
          selector,
          tagName: el.tagName,
          text: (el.textContent || '').trim().substring(0, 80),
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          color: style.color,
          backgroundColor: findBackgroundColor(el),
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
        const color = window.getComputedStyle(current).backgroundColor;
        if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    }
  });
}

async function crawlSafe(page: Page, target: RouteScanTarget, maxDepth: number, maxPages: number): Promise<TlxScanIssue[]> {
  const links = await page.$$eval('a[href]', (anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href).slice(0, maxPages));
  const origin = new URL(target.url).origin;
  const issues: TlxScanIssue[] = [];

  for (const href of links.slice(0, Math.max(0, Math.min(maxPages, maxDepth * maxPages)))) {
    const url = new URL(href, target.url);
    if (url.origin !== origin) {
      issues.push(createSyntheticIssue('crawler', target, 'Link points outside the local project origin. Fix: mark external links intentionally, or use an internal route for local navigation.', { href, fixHint: 'External links are not crawled during local UI checks.' }));
    }
  }

  await page.$$eval('input[type="text"], input[type="email"], input[type="password"], input[type="search"], textarea', (inputs) => {
    for (const input of inputs.slice(0, 20)) {
      (input as HTMLInputElement).value = 'tlx-mock';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  return issues;
}

async function checkApiContracts(page: Page, target: RouteScanTarget, endpoints: string[], allowUnsafeMethods: boolean): Promise<TlxScanIssue[]> {
  const issues: TlxScanIssue[] = [];
  const origin = new URL(target.url).origin;
  const uniqueEndpoints = [...new Set(endpoints)].filter((endpoint) => endpoint.startsWith('/'));

  for (const endpoint of uniqueEndpoints.slice(0, 20)) {
    const result = await page.evaluate(async ({ origin, endpoint, allowUnsafeMethods }) => {
      const startedAt = performance.now();
      const response = await fetch(`${origin}${endpoint}`, { method: allowUnsafeMethods ? 'OPTIONS' : 'GET' });
      const contentType = response.headers.get('content-type') || '';
      let jsonValid = true;
      if (contentType.includes('application/json')) {
        try {
          await response.clone().json();
        } catch {
          jsonValid = false;
        }
      }
      return { status: response.status, contentType, jsonValid, latencyMs: Math.round(performance.now() - startedAt) };
    }, { origin, endpoint, allowUnsafeMethods }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));

    if ('error' in result || result.status >= 500 || result.jsonValid === false) {
      issues.push(createSyntheticIssue('api', target, `API check failed for ${endpoint}. Fix: verify the endpoint returns a healthy status and valid JSON when expected.`, { endpoint, fixHint: 'Open the endpoint in the browser or inspect the route handler/server logs.', ...result }));
    }
  }

  return issues;
}

function createSyntheticIssue(kind: 'crawler' | 'api', target: RouteScanTarget, message: string, metadata: Record<string, unknown>): TlxScanIssue {
  return {
    id: `${kind}-${slugRoute(target.route)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    severity: 'warning',
    message,
    route: target.route,
    url: target.url,
    selector: 'document',
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata,
  };
}

export function slugRoute(route: string) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'route';
}

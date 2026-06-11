/// <reference lib="dom" />

import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import type { TlxColorAnalysis, TlxRouteColorAnalysis, TlxScanIssue } from '@tlx/contracts';
import type { TlxProjectConfig } from '../services/storage.service';
import { normalizeRoute } from '../strategies/utils';
import { createCrossRouteColorIssues, summarizeColorAnalysis } from './color-harmony';
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
  storageStatePath?: string;
}

export interface PlaywrightScanResult {
  issues: TlxScanIssue[];
  screenshots: string[];
  routes: string[];
  elementsScanned: number;
  routesScanned: number;
  warnings: string[];
  artifactErrors: string[];
  colorAnalysis?: TlxColorAnalysis;
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
    const artifactErrors: string[] = [];
    const scannedRoutes = new Set<string>();
    const scannedTargetUrls = new Map<string, string>();
    const routeColorAnalyses: TlxRouteColorAnalysis[] = [];
    let elementsScanned = 0;

    await fs.mkdir(options.screenshotsDir, { recursive: true });

    for (const viewport of options.config.scan.viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
      });
      const page = await context.newPage();
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
          try {
            const response = await page.goto(target.url, { waitUntil: 'networkidle' });
            await waitForPageSettled(page);
            scannedRoutes.add(target.route);
            scannedTargetUrls.set(target.route, target.url);
            if (response && (response.status() === 401 || response.status() === 403)) {
              issues.push(createAuthIssue(target, response.status(), viewport.name, Boolean(options.storageStatePath)));
              continue;
            }

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
              colorHarmony: {
                enabled: options.config.scan.colorHarmony.enabled,
                thresholds: colorHarmonyThresholds(options.config),
              },
              visualQuality: options.config.scan.visualQuality,
              viewportName: viewport.name,
              issuePrefix: `${options.reportId}-${slugRoute(target.route)}-${viewport.name}`,
              pageMetrics: pageScan.pageMetrics,
              pageState: pageScan.pageState,
            });
            elementsScanned += result.elementsScanned;
            if (result.colorAnalysis) routeColorAnalyses.push(result.colorAnalysis);
            const analyzedIssues = result.issues.map((issue) => ({ ...issue, metadata: { ...issue.metadata, viewport: viewport.name } }));
            issues.push(...analyzedIssues);

            const visualIssues = analyzedIssues.filter(isVisualIssue);
            if (visualIssues.length > 0) {
              await captureVisualScreenshot(page, target, viewport.name, visualIssues, options, screenshots, warnings, artifactErrors);
            }

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
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`[${viewport.name} ${target.route}] ${message}`);
            consoleErrors.length = 0;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`[${viewport.name}] ${message}`);
      } finally {
        await page.close();
        await context.close();
      }
    }

    let colorAnalysis: TlxColorAnalysis | undefined;
    if (options.config.scan.colorHarmony.enabled) {
      const thresholds = colorHarmonyThresholds(options.config);
      colorAnalysis = summarizeColorAnalysis(routeColorAnalyses, thresholds);
      const crossRouteIssues = createCrossRouteColorIssues(routeColorAnalyses, thresholds).map((issue, index): TlxScanIssue => {
        const targetUrl = scannedTargetUrls.get(issue.route) ?? targets.find((item) => item.route === issue.route)?.url ?? '';
        const viewport = options.config.scan.viewports.find((item) => item.name === issue.viewport) ?? options.config.scan.viewports[0] ?? { name: issue.viewport, width: 1280, height: 800 };
        return {
          id: `${options.reportId}-${slugRoute(issue.route)}-${viewport.name}-color-harmony-cross-${index}`,
          kind: 'color_harmony',
          severity: 'warning',
          message: issue.message,
          route: issue.route,
          url: targetUrl,
          selector: 'document',
          boundingBox: { x: 0, y: 0, width: viewport.width, height: viewport.height },
          metadata: {
            viewport: viewport.name,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            screenshotWidth: viewport.width,
            screenshotHeight: viewport.height,
            ...issue.metadata,
          },
        };
      });

      for (const issue of crossRouteIssues) {
        issues.push(issue);
        await captureSyntheticRouteScreenshot(browser, issue, options, screenshots, warnings, artifactErrors);
      }
    }

    const routes = [...scannedRoutes];
    return { issues, screenshots: [...screenshots], routes, elementsScanned, routesScanned: routes.length, warnings, artifactErrors, colorAnalysis };
  }
}

function colorHarmonyThresholds(config: TlxProjectConfig) {
  return {
    maxStrongHueFamilies: config.scan.colorHarmony.maxStrongHueFamilies,
    maxRouteHueDrift: config.scan.colorHarmony.maxRouteHueDrift,
    maxHighChromaAreaRatio: config.scan.colorHarmony.maxHighChromaAreaRatio,
    maxHueSpread: config.scan.colorHarmony.maxHueSpread,
  };
}

async function captureSyntheticRouteScreenshot(browser: Browser, issue: TlxScanIssue, options: PlaywrightScanOptions, screenshots: Set<string>, warnings: string[], artifactErrors: string[]) {
  if (!issue.url) return;
  const width = Number(issue.metadata.viewportWidth) || 1280;
  const height = Number(issue.metadata.viewportHeight) || 800;
  const context = await browser.newContext({
    viewport: { width, height },
    ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
  });
  const page = await context.newPage();
  try {
    await page.goto(issue.url, { waitUntil: 'networkidle' });
    await waitForPageSettled(page);
    await captureVisualScreenshot(page, { route: issue.route, url: issue.url }, String(issue.metadata.viewport ?? 'default'), [issue], options, screenshots, warnings, artifactErrors);
  } finally {
    await page.close();
    await context.close();
  }
}

async function captureVisualScreenshot(page: Page, target: RouteScanTarget, viewportName: string, visualIssues: TlxScanIssue[], options: PlaywrightScanOptions, screenshots: Set<string>, warnings: string[], artifactErrors: string[]) {
  const fileName = `${slugRoute(target.route)}-${viewportName}.png`;
  const absolutePath = path.join(options.screenshotsDir, fileName);
  const relativePath = options.relativeScreenshotPath(options.reportId, fileName);

  try {
    await page.screenshot({ path: absolutePath, fullPage: true });
    const stat = await fs.stat(absolutePath);
    if (stat.size <= 0) throw new Error('empty screenshot file');

    screenshots.add(relativePath);
    for (const issue of visualIssues) {
      issue.screenshotPath = relativePath;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const warning = `[${viewportName} ${target.route}] screenshot capture failed: ${message}`;
    warnings.push(warning);
    artifactErrors.push(warning);
  }
}

async function waitForPageSettled(page: Page) {
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

function isVisualIssue(issue: TlxScanIssue) {
  return issue.kind === 'overlap' || issue.kind === 'overflow' || issue.kind === 'contrast' || issue.kind === 'color_harmony' || issue.kind === 'alignment' || issue.kind === 'spacing' || issue.kind === 'typography' || issue.kind === 'orphan' || issue.kind === 'hit_area' || issue.kind === 'text_clipping';
}

function uniqueTargets(targets: RouteScanTarget[]): RouteScanTarget[] {
  const seen = new Set<string>();
  const unique: RouteScanTarget[] = [];
  for (const target of targets) {
    const normalized = normalizeTarget(target);
    if (!seen.has(normalized.route)) {
      unique.push(normalized);
      seen.add(normalized.route);
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
    routes.push(createTargetFromUrl(url));
  }
  return uniqueTargets(routes);
}

function normalizeTarget(target: RouteScanTarget): RouteScanTarget {
  return createTargetFromUrl(new URL(target.url));
}

function createTargetFromUrl(url: URL): RouteScanTarget {
  const routePath = normalizeRoute(url.pathname);
  const route = `${routePath}${url.search}`;
  return { route, url: `${url.origin}${route}` };
}

async function collectElements(page: Page): Promise<{ elements: ScannedElement[]; pageMetrics: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }; pageState: { title: string; url: string; textSample: string } }> {
  return page.evaluate(() => {
    const selectors = 'main, section, article, nav, header, footer, aside, form, button, a, h1, h2, h3, p, input, label, textarea, select, img, svg, [data-tlx-target], .__tlx-target';
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
          fontSize: parseCssPx(style.fontSize),
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          lineHeight: parseLineHeight(style.lineHeight, style.fontSize),
          letterSpacing: parseCssPx(style.letterSpacing) ?? 0,
          display: style.display,
          position: style.position,
          role: el.getAttribute('role') ?? undefined,
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

function createAuthIssue(target: RouteScanTarget, status: number, viewportName: string, hasStorageState: boolean): TlxScanIssue {
  const kind = hasStorageState ? 'auth_failed' : 'auth_required';
  const message = hasStorageState
    ? `Route returned HTTP ${status} with saved auth state. Fix: refresh the TLX auth session or use an account with access to this route.`
    : `Route returned HTTP ${status} and requires authentication. Fix: run TLX auth login, then rerun the scan.`;

  return {
    id: `${kind}-${slugRoute(target.route)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    severity: 'warning',
    message,
    route: target.route,
    url: target.url,
    selector: 'document',
    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    metadata: { status, viewport: viewportName, hasStorageState },
  };
}

export function slugRoute(route: string) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'route';
}

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
}

export interface PlaywrightScanResult {
  issues: TlxScanIssue[];
  screenshots: string[];
  elementsScanned: number;
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
        for (const target of targets) {
          const response = await page.goto(target.url, { waitUntil: 'networkidle' });
          if (response && response.status() >= 400) {
            issues.push(createSyntheticIssue('crawler', target, `HTTP ${response.status()} khi crawl route`, { status: response.status(), viewport: viewport.name }));
          }

          const elements = await collectElements(page);
          const result = analyzeElements(elements, {
            route: target.route,
            url: target.url,
            viewport,
            contrastRatio: options.config.scan.contrastRatio,
            issuePrefix: `${options.reportId}-${slugRoute(target.route)}-${viewport.name}`,
          });
          elementsScanned += result.elementsScanned;
          issues.push(...result.issues.map((issue) => ({ ...issue, metadata: { ...issue.metadata, viewport: viewport.name } })));

          if (options.config.scan.crawler.enabled) {
            issues.push(...(await crawlSafe(page, target, options.config.scan.crawler.maxDepth, options.config.scan.crawler.maxPages)));
          }

          if (consoleErrors.length > 0) {
            issues.push(createSyntheticIssue('crawler', target, 'Console/page error trong route', { errors: [...consoleErrors], viewport: viewport.name }));
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

    return { issues, screenshots: [...screenshots], elementsScanned, warnings };
  }
}

async function collectElements(page: Page): Promise<ScannedElement[]> {
  return page.evaluate(() => {
    const selectors = 'button, a, h1, h2, h3, p, input, label, textarea, select, img, nav, main, section, article, div.__tlx-target';
    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}_${index}`,
          tagName: el.tagName,
          text: (el.textContent || '').trim().substring(0, 80),
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          color: style.color,
          backgroundColor: findBackgroundColor(el),
        };
      })
      .filter((item) => item.boundingBox.width > 0 && item.boundingBox.height > 0);

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
      issues.push(createSyntheticIssue('crawler', target, 'Crawler chan navigation ra ngoai localhost/project URL', { href }));
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
      issues.push(createSyntheticIssue('api', target, 'API contract check fail', { endpoint, ...result }));
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

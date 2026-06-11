import fs from 'fs/promises';
import path from 'path';
import type { TlxScanIssue } from '@tlx/contracts';
import type { Browser, Page } from 'playwright';
import { waitForPageSettled } from './page-collector';
import type { PlaywrightScanOptions, RouteScanTarget } from './types';

export async function captureSyntheticRouteScreenshot(browser: Browser, issue: TlxScanIssue, options: PlaywrightScanOptions, screenshots: Set<string>, warnings: string[], artifactErrors: string[]) {
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

export async function captureVisualScreenshot(page: Page, target: RouteScanTarget, viewportName: string, visualIssues: TlxScanIssue[], options: PlaywrightScanOptions, screenshots: Set<string>, warnings: string[], artifactErrors: string[]) {
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

export function slugRoute(route: string) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'route';
}

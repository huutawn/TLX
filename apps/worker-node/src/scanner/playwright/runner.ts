import fs from 'fs/promises';
import { chromium, type Browser } from 'playwright';
import { isTlxVisualScanIssue, type TlxColorAnalysis, type TlxRouteColorAnalysis, type TlxScanIssue } from '@tlx/contracts';
import type { TlxProjectConfig } from '../../services/storage.service';
import { analyzeElements } from '../ui-analyzer';
import { createCrossRouteColorIssues, summarizeColorAnalysis } from '../color-harmony';
import { captureSyntheticRouteScreenshot, captureVisualScreenshot, slugRoute } from './artifacts';
import { checkApiContracts, crawlSafe, createAuthIssue, createSyntheticIssue } from './checks';
import { probeFixedOcclusions } from './fixed-occlusion';
import { collectElements, waitForPageSettled } from './page-collector';
import { discoverInternalTargets, uniqueTargets } from './routes';
import type { PlaywrightScanOptions, PlaywrightScanResult, RouteScanTarget } from './types';

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

            const fixedOcclusionIssues = options.config.scan.visualQuality.enabled && options.config.scan.visualQuality.fixedOcclusionProbeEnabled
              ? await probeFixedOcclusions(page, target, viewport.name, options.reportId, pageScan.pageMetrics, pageScan.pageState)
              : [];
            issues.push(...fixedOcclusionIssues);

            const visualIssues = [...analyzedIssues, ...fixedOcclusionIssues].filter(isTlxVisualScanIssue);
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

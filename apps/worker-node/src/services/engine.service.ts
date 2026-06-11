import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';
import type { TlxAuthActionResponse, TlxAuthStartRequest, TlxAuthStatusResponse, TlxCacheDiffResponse, TlxScanActionRequest, TlxScanReport, TlxScanResultResponse, TlxScanScope } from '@tlx/contracts';
import type { ProjectMetadata } from './detector.service';
import { DiffService } from './diff.service';
import { ProjectStorageService, type TlxProjectConfig } from './storage.service';
import { PlaywrightScannerRunner, type RouteScanTarget } from '../scanner/playwright-runner';
import { normalizeRoute } from '../strategies/utils';

interface RunProjectScanOptions extends TlxScanActionRequest {
  project: ProjectMetadata;
  projectUrl: string;
}

export class EngineService {
  private readonly diffService = new DiffService();
  private readonly runner = new PlaywrightScannerRunner();

  async getSystemStatus() {
    return {
      status: 'active',
      engine: 'TLX engine',
      platform: os.platform(),
      uptime: os.uptime(),
    };
  }

  async getCacheDiff(project: ProjectMetadata): Promise<TlxCacheDiffResponse> {
    const storage = new ProjectStorageService(project.rootDir);
    const config = await storage.readConfig();
    const previous = await storage.readHashCache();
    const current = await storage.createSnapshot(project.scanGraph, config.scan.ignoredPaths);
    return this.diffService.createDiff(previous, current, project.rootDir, project.scanGraph);
  }

  async getLatestReport(project: ProjectMetadata): Promise<TlxScanReport | undefined> {
    return new ProjectStorageService(project.rootDir).readLatestReport();
  }

  async getAuthStatus(project: ProjectMetadata): Promise<TlxAuthStatusResponse> {
    const storage = new ProjectStorageService(project.rootDir);
    const config = await storage.readConfig();
    return createAuthStatus(storage, config, await storage.authStorageStateExists(config));
  }

  async clearAuth(project: ProjectMetadata): Promise<TlxAuthActionResponse> {
    const storage = new ProjectStorageService(project.rootDir);
    const config = await storage.readConfig();
    await storage.clearAuthStorageState(config);
    return { ...(await createAuthStatus(storage, config, false)), success: true, message: 'Auth state cleared.' };
  }

  async startManualAuth(project: ProjectMetadata, projectUrl: string, request: TlxAuthStartRequest): Promise<TlxAuthActionResponse> {
    const storage = new ProjectStorageService(project.rootDir);
    const config = await storage.readConfig();
    const profile = request.profile ?? config.auth.profile;
    const loginUrl = request.loginUrl ?? config.auth.loginUrl ?? projectUrl;
    const timeoutMs = clampTimeout(request.timeoutMs);
    const storageStatePath = storage.resolveAuthStorageStatePath(config, profile);

    await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForEvent('close', { timeout: timeoutMs }).catch(async () => {
        await page.close().catch(() => undefined);
      });
      await context.storageState({ path: storageStatePath });
      await context.close();
    } finally {
      await browser.close();
    }

    const status = await createAuthStatus(storage, { ...config, auth: { ...config.auth, mode: 'manual', profile } }, true);
    return { ...status, success: true, message: 'Auth state saved.' };
  }

  async runProjectScan(options: RunProjectScanOptions): Promise<TlxScanResultResponse> {
    const startedAt = new Date().toISOString();
    const storage = new ProjectStorageService(options.project.rootDir);
    const config = await storage.readConfig();
    const initialScope = normalizeScope(options.scope ?? config.scan.defaultScope);
    const previous = await storage.readHashCache();
    const current = await storage.createSnapshot(options.project.scanGraph, config.scan.ignoredPaths);
    const diff = this.diffService.createDiff(previous, current, options.project.rootDir, options.project.scanGraph);
    const requestedScope = initialScope === 'changed' && Object.keys(previous.files).length === 0 ? 'all' : initialScope;
    const scoped = this.diffService.resolveRoutes(requestedScope, options.route, diff, options.project.scanGraph);
    const reportId = createReportId();

    await storage.ensureProjectStorage();

    if (scoped.skipped) {
      const report = createEmptyReport(reportId, requestedScope, startedAt, ['No changed routes to scan.']);
      const reportWarnings = await storage.writeLatestReport(report);
      report.warnings.push(...reportWarnings);
      return toResponse(report);
    }

    const targets = createTargets(scoped.routes, options.projectUrl);
    const screenshotDir = storage.screenshotReportDir(reportId);
    const hasAuthState = await storage.authStorageStateExists(config);
    const storageStatePath = hasAuthState ? storage.resolveAuthStorageStatePath(config) : undefined;
    const scan = await this.runner.scan(targets, {
      reportId,
      screenshotsDir: screenshotDir,
      relativeScreenshotPath: (id, fileName) => storage.relativeScreenshotPath(id, fileName),
      config,
      apiEndpoints: options.project.scanGraph.apis,
      discoverRoutes: requestedScope === 'all',
      storageStatePath,
    });
    const finishedAt = new Date().toISOString();
    const warnings = [...scan.warnings];
    const hashWarnings = await storage.writeHashCache({ ...current, updatedAt: finishedAt });
    warnings.push(...hashWarnings);

    const report: TlxScanReport = {
      id: reportId,
      scope: requestedScope,
      routes: scan.routes,
      startedAt,
      finishedAt,
      success: scan.artifactErrors.length === 0 && scan.issues.every((issue) => issue.severity !== 'error'),
      summary: {
        routesScanned: scan.routesScanned,
        elementsScanned: scan.elementsScanned,
        issuesFound: scan.issues.length,
        screenshotsCaptured: scan.screenshots.length,
      },
      issues: scan.issues,
      screenshots: scan.screenshots,
      warnings,
      colorAnalysis: scan.colorAnalysis,
    };

    const reportWarnings = await storage.writeLatestReport(report);
    report.warnings.push(...reportWarnings);

    return toResponse(report);
  }
}

async function createAuthStatus(storage: ProjectStorageService, config: TlxProjectConfig, authenticated: boolean): Promise<TlxAuthStatusResponse> {
  const metadata = authenticated ? await storage.readAuthStorageStateMetadata(config) : undefined;
  return {
    mode: authenticated ? 'manual' : config.auth.mode,
    profile: config.auth.profile,
    authenticated,
    storageStatePath: storage.relativeAuthStorageStatePath(config),
    savedAt: metadata?.savedAt,
    origins: metadata?.origins ?? [],
  };
}

function clampTimeout(timeoutMs: number | undefined) {
  if (!timeoutMs || !Number.isFinite(timeoutMs)) return 120_000;
  return Math.max(5_000, Math.min(timeoutMs, 10 * 60_000));
}

function normalizeScope(scope: string): TlxScanScope {
  return scope === 'all' || scope === 'route' || scope === 'changed' ? scope : 'changed';
}

function createTargets(routes: string[], projectUrl: string): RouteScanTarget[] {
  const base = projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl;
  const uniqueRoutes = routes.length > 0 ? [...new Set(routes.map((route) => normalizeScanRoute(route)))] : ['/'];
  return uniqueRoutes.map((route) => ({ route, url: `${base}${route}` }));
}

function normalizeScanRoute(route: string): string {
  const [pathPart = '/', queryPart] = route.split('?');
  const normalizedPath = normalizeRoute(pathPart);
  return queryPart ? `${normalizedPath}?${queryPart}` : normalizedPath;
}

function createReportId() {
  return `scan-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function createEmptyReport(id: string, scope: TlxScanScope, startedAt: string, warnings: string[]): TlxScanReport {
  const finishedAt = new Date().toISOString();
  return {
    id,
    scope,
    routes: [],
    startedAt,
    finishedAt,
    success: true,
    summary: { routesScanned: 0, elementsScanned: 0, issuesFound: 0, screenshotsCaptured: 0 },
    issues: [],
    screenshots: [],
    warnings,
  };
}

function toResponse(report: TlxScanReport): TlxScanResultResponse {
  return {
    success: report.success,
    totalElementsScanned: report.summary.elementsScanned,
    bugsFound: report.issues.map((issue) => issue.message),
    timestamp: report.finishedAt,
    report,
  };
}

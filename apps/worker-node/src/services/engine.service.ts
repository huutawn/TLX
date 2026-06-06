import os from 'os';
import type { TlxCacheDiffResponse, TlxScanActionRequest, TlxScanReport, TlxScanResultResponse, TlxScanScope } from '@tlx/contracts';
import type { ProjectMetadata } from './detector.service';
import { DiffService } from './diff.service';
import { ProjectStorageService, type TlxProjectConfig } from './storage.service';
import { PlaywrightScannerRunner, type RouteScanTarget } from '../scanner/playwright-runner';

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

  async runProjectScan(options: RunProjectScanOptions): Promise<TlxScanResultResponse> {
    const startedAt = new Date().toISOString();
    const storage = new ProjectStorageService(options.project.rootDir);
    const config = await storage.readConfig();
    const requestedScope = normalizeScope(options.scope ?? config.scan.defaultScope);
    const previous = await storage.readHashCache();
    const current = await storage.createSnapshot(options.project.scanGraph, config.scan.ignoredPaths);
    const diff = this.diffService.createDiff(previous, current, options.project.rootDir, options.project.scanGraph);
    const scoped = this.diffService.resolveRoutes(requestedScope, options.route, diff, options.project.scanGraph);
    const reportId = createReportId();

    await storage.ensureProjectStorage();

    if (scoped.skipped) {
      const latest = await storage.readLatestReport();
      const report = latest ?? createEmptyReport(reportId, requestedScope, startedAt, ['No changed routes to scan.']);
      return toResponse(report);
    }

    const targets = createTargets(scoped.routes, options.projectUrl);
    const screenshotDir = storage.screenshotReportDir(reportId);
    const scan = await this.runner.scan(targets, {
      reportId,
      screenshotsDir: screenshotDir,
      relativeScreenshotPath: (id, fileName) => storage.relativeScreenshotPath(id, fileName),
      config,
      apiEndpoints: options.project.scanGraph.apis,
      discoverRoutes: requestedScope === 'all',
    });
    const finishedAt = new Date().toISOString();
    const warnings = [...scan.warnings];
    const hashWarnings = await storage.writeHashCache({ ...current, updatedAt: finishedAt });
    warnings.push(...hashWarnings);

    const report: TlxScanReport = {
      id: reportId,
      scope: requestedScope,
      startedAt,
      finishedAt,
      success: scan.issues.every((issue) => issue.severity !== 'error'),
      summary: {
        routesScanned: scan.routesScanned,
        elementsScanned: scan.elementsScanned,
        issuesFound: scan.issues.length,
        screenshotsCaptured: scan.screenshots.length,
      },
      issues: scan.issues,
      screenshots: scan.screenshots,
      warnings,
    };

    const reportWarnings = await storage.writeLatestReport(report);
    report.warnings.push(...reportWarnings);

    return toResponse(report);
  }
}

function normalizeScope(scope: string): TlxScanScope {
  return scope === 'all' || scope === 'route' || scope === 'changed' ? scope : 'changed';
}

function createTargets(routes: string[], projectUrl: string): RouteScanTarget[] {
  const base = projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl;
  const uniqueRoutes = routes.length > 0 ? [...new Set(routes)] : ['/'];
  return uniqueRoutes.map((route) => ({ route, url: `${base}${route.startsWith('/') ? route : `/${route}`}` }));
}

function createReportId() {
  return `scan-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function createEmptyReport(id: string, scope: TlxScanScope, startedAt: string, warnings: string[]): TlxScanReport {
  const finishedAt = new Date().toISOString();
  return {
    id,
    scope,
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

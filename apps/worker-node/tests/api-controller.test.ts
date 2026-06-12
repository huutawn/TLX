import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ActionController } from '../src/controllers/action.controller';
import { resolveDashboardRoutePath } from '../src/server';
import { ProjectStorageService } from '../src/services/storage.service';
import type { TlxRuntimeContext } from '../src/services/runtime-context.service';
import type { ScanGraph } from '../src/strategies/types';
import type { TlxCacheDiffResponse, TlxScanReport, TlxScanResultResponse } from '@tlx/contracts';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('ActionController Phase 2 endpoints', () => {
  test('GET cache diff returns four buckets', async () => {
    const context = await createContext();
    const res = createResponse();

    await new ActionController(context).getCacheDiff({} as never, res as never);

    const body = res.body as TlxCacheDiffResponse;
    expect(res.statusCode).toBe(200);
    expect(body.changed).toBeDefined();
    expect(body.unchanged).toBeDefined();
    expect(body.unknown).toBeDefined();
    expect(body.deleted).toBeDefined();
    expect(body.affectedRoutes).toBeDefined();
  });

  test('GET latest report returns empty state before first report', async () => {
    const context = await createContext();
    const res = createResponse();

    await new ActionController(context).getLatestReport({} as never, res as never);

    const body = res.body as { empty: true; issues: [] };
    expect(body.empty).toBe(true);
    expect(body.issues).toEqual([]);
  });

  test('GET auth status returns empty manual-session state by default', async () => {
    const context = await createContext();
    const res = createResponse();

    await new ActionController(context).getAuthStatus({} as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ mode: 'none', profile: 'default', authenticated: false, origins: [] });
  });

  test('GET auth status detects saved storage state as manual auth', async () => {
    const context = await createContext();
    const storage = new ProjectStorageService(context.project.rootDir);
    const config = await storage.readConfig();
    const statePath = storage.resolveAuthStorageStatePath(config);
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ cookies: [], origins: [{ origin: context.projectUrl, localStorage: [] }] }), 'utf8');
    const res = createResponse();

    await new ActionController(context).getAuthStatus({} as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ mode: 'manual', profile: 'default', authenticated: true, origins: [context.projectUrl] });
  });

  test('POST auth clear removes saved storage state', async () => {
    const context = await createContext();
    const storage = new ProjectStorageService(context.project.rootDir);
    const config = await storage.readConfig();
    const statePath = storage.resolveAuthStorageStatePath(config);
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ cookies: [], origins: [{ origin: context.projectUrl, localStorage: [] }] }), 'utf8');
    const res = createResponse();

    await new ActionController(context).clearAuth({} as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, authenticated: false });
    await expect(fs.stat(statePath)).rejects.toThrow();
  });

  test('POST scan defaults to changed scope and skips browser when nothing changed', async () => {
    const context = await createContext();
    const storage = new ProjectStorageService(context.project.rootDir);
    const snapshot = await storage.createSnapshot(context.project.scanGraph, []);
    await storage.writeHashCache(snapshot);
    const staleReport: TlxScanReport = {
      id: 'stale-report',
      scope: 'route',
      routes: ['/stale'],
      startedAt: '2026-06-04T00:00:00.000Z',
      finishedAt: '2026-06-04T00:00:01.000Z',
      success: false,
      summary: { routesScanned: 1, elementsScanned: 1, issuesFound: 1, screenshotsCaptured: 1 },
      issues: [],
      screenshots: ['stale.png'],
      warnings: [],
    };
    await storage.writeLatestReport(staleReport);
    const res = createResponse();

    await new ActionController(context).triggerScan({ body: {} } as never, res as never);

    const body = res.body as TlxScanResultResponse;
    expect(res.statusCode).toBe(200);
    expect(body.report.id).not.toBe('stale-report');
    expect(body.report.scope).toBe('changed');
    expect(body.report.routes).toEqual([]);
    expect(body.report.screenshots).toEqual([]);
    expect(body.report.summary.routesScanned).toBe(0);
    expect(body.totalElementsScanned).toBe(0);
  });

  test('static dashboard route resolver keeps canonical paths slashless', () => {
    expect(resolveDashboardRoutePath('/map')).toEqual({ fileName: 'map.html' });
    expect(resolveDashboardRoutePath('/map/')).toEqual({ redirectTo: '/map' });
    expect(resolveDashboardRoutePath('/bugs')).toEqual({ fileName: 'bugs.html' });
    expect(resolveDashboardRoutePath('/bugs/')).toEqual({ redirectTo: '/bugs' });
  });
});

async function createContext(): Promise<TlxRuntimeContext> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-api-'));
  tempRoots.push(rootDir);
  await fs.mkdir(path.join(rootDir, 'app'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'app/page.tsx'), 'export default function Page() { return <main />; }', 'utf8');

  return {
    dashboardPort: 6532,
    projectUrl: 'http://localhost:3000',
    startedAt: '2026-06-04T00:00:00.000Z',
    project: {
      framework: 'next',
      port: 3000,
      rootDir,
      scanGraph: createGraph(rootDir),
    },
  };
}

function createGraph(rootDir: string): ScanGraph {
  return {
    pages: [
      {
        id: 'page-home',
        type: 'page',
        name: 'Home',
        route: '/',
        filePath: path.join(rootDir, 'app/page.tsx'),
        framework: 'next',
        components: [],
        apis: [],
        links: [],
      },
    ],
    components: [],
    apis: [],
    edges: [],
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

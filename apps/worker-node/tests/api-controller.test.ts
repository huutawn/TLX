import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ActionController } from '../src/controllers/action.controller';
import { ProjectStorageService } from '../src/services/storage.service';
import type { TlxRuntimeContext } from '../src/services/runtime-context.service';
import type { ScanGraph } from '../src/strategies/types';
import type { TlxCacheDiffResponse, TlxScanResultResponse } from '@tlx/contracts';

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

  test('POST scan defaults to changed scope and skips browser when nothing changed', async () => {
    const context = await createContext();
    const storage = new ProjectStorageService(context.project.rootDir);
    const snapshot = await storage.createSnapshot(context.project.scanGraph, []);
    await storage.writeHashCache(snapshot);
    const res = createResponse();

    await new ActionController(context).triggerScan({ body: {} } as never, res as never);

    const body = res.body as TlxScanResultResponse;
    expect(res.statusCode).toBe(200);
    expect(body.report.scope).toBe('changed');
    expect(body.report.summary.routesScanned).toBe(0);
    expect(body.totalElementsScanned).toBe(0);
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

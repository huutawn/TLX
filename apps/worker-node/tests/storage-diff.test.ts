import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DiffService } from '../src/services/diff.service';
import { ProjectStorageService, type TlxHashCache } from '../src/services/storage.service';
import type { ScanGraph } from '../src/strategies/types';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('ProjectStorageService and DiffService', () => {
  test('creates project-local storage and hashes source files', async () => {
    const rootDir = await createFixture({ 'app/page.tsx': 'export default function Page() { return <main />; }' });
    const storage = new ProjectStorageService(rootDir);

    await storage.ensureProjectStorage();
    const snapshot = await storage.createSnapshot(createGraph(rootDir), []);
    const warnings = await storage.writeHashCache(snapshot);

    expect(warnings).toEqual([]);
    expect(await exists(path.join(rootDir, '.tlx', 'hash.json'))).toBe(true);
    expect(snapshot.files['app/page.tsx']?.hash).toHaveLength(64);
  });

  test('loads root tlx.yaml config with legacy .tlx override', async () => {
    const rootDir = await createFixture({
      'tlx.yaml': 'scan.defaultScope: all\nscan.contrastRatio: 7\nscan.crawler.enabled: false\n',
      '.tlx/tlx.yaml': 'scan.api.enabled: false\n',
    });
    const config = await new ProjectStorageService(rootDir).readConfig();

    expect(config.scan.defaultScope).toBe('all');
    expect(config.scan.contrastRatio).toBe(7);
    expect(config.scan.crawler.enabled).toBe(false);
    expect(config.scan.api.enabled).toBe(false);
    expect(config.scan.ignoredPaths).toContain('node_modules');
  });

  test('diff classifies first-run unknown, edits changed, deletes deleted, and affected routes', async () => {
    const rootDir = await createFixture({
      'app/page.tsx': 'import Card from "../components/Card"; export default function Page() { return <Card />; }',
      'components/Card.tsx': 'export default function Card() { return <section />; }',
    });
    const graph = createGraph(rootDir);
    const storage = new ProjectStorageService(rootDir);
    const diffService = new DiffService();
    const emptyCache: TlxHashCache = { version: 1, updatedAt: new Date(0).toISOString(), files: {} };
    const firstSnapshot = await storage.createSnapshot(graph, []);
    const firstDiff = diffService.createDiff(emptyCache, firstSnapshot, rootDir, graph);

    expect(firstDiff.unknown.map((entry) => entry.path)).toContain('app/page.tsx');
    expect(firstDiff.affectedRoutes).toEqual(['/']);

    await fs.writeFile(path.join(rootDir, 'components/Card.tsx'), 'export default function Card() { return <article />; }', 'utf8');
    await fs.rm(path.join(rootDir, 'app/page.tsx'));
    const secondSnapshot = await storage.createSnapshot(graph, []);
    const secondDiff = diffService.createDiff(firstSnapshot, secondSnapshot, rootDir, graph);

    expect(secondDiff.changed.map((entry) => entry.path)).toContain('components/Card.tsx');
    expect(secondDiff.deleted.map((entry) => entry.path)).toContain('app/page.tsx');
    expect(secondDiff.affectedRoutes).toEqual(['/']);
  });

  test('changed scope skips browser when no route is affected', () => {
    const diff = { changed: [], unchanged: [], unknown: [], deleted: [], affectedRoutes: [] };
    const result = new DiffService().resolveRoutes('changed', undefined, diff, createGraph('/tmp/project'));

    expect(result.skipped).toBe(true);
    expect(result.routes).toEqual([]);
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-phase2-'));
  tempRoots.push(rootDir);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const filePath = path.join(rootDir, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents, 'utf8');
    }),
  );
  return rootDir;
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
        apis: [],
        components: [
          {
            id: 'component-card',
            type: 'component',
            name: 'Card',
            filePath: path.join(rootDir, 'components/Card.tsx'),
          },
        ],
      },
    ],
    components: [],
    apis: [],
    edges: [],
  };
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

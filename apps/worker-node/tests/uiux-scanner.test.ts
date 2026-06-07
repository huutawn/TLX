/// <reference lib="dom" />

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { analyzeElements, type ScannedElement } from '../src/scanner/ui-analyzer';
import { PlaywrightScannerRunner } from '../src/scanner/playwright-runner';
import { EngineService } from '../src/services/engine.service';
import type { TlxProjectConfig } from '../src/services/storage.service';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('UI/UX scanner Playwright fixtures', () => {
  test('detects overlapping elements', async () => {
    const result = await scanFixture(`
      <style>body { margin: 0; background: white; } #a, #b { position: absolute; left: 10px; top: 10px; width: 120px; height: 40px; color: black; background: white; }</style>
      <button id="a">Save</button><p id="b">Text</p>
    `);

    expect(result.issues.some((issue) => issue.kind === 'overlap')).toBe(true);
  });

  test('detects horizontal overflow', async () => {
    const result = await scanFixture(`
      <style>body { margin: 0; background: white; } #wide { width: 1400px; height: 40px; color: black; background: white; }</style>
      <div id="wide" class="__tlx-target">Wide</div>
    `);

    expect(result.issues.some((issue) => issue.kind === 'overflow')).toBe(true);
  });

  test('detects low contrast text', async () => {
    const result = await scanFixture(`
      <style>body { margin: 0; background: rgb(130, 130, 130); } #low { color: rgb(120, 120, 120); background: rgb(130, 130, 130); }</style>
      <p id="low">Low contrast</p>
    `);

    expect(result.issues.some((issue) => issue.kind === 'contrast')).toBe(true);
  });

  test('does not report contrast from text on gradient background', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-gradient-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(`
          <style>
            body { margin: 0; background: white; font-family: sans-serif; }
            main { min-height: 900px; background: linear-gradient(135deg, #064e3b, #047857); padding: 80px; }
            h1 { color: white; font-size: 48px; max-width: 620px; }
          </style>
          <main><h1>Every pledge is tracked</h1></main>
        `, { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'gradient',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      expect(result.issues.filter((issue) => issue.kind === 'contrast')).toEqual([]);
    } finally {
      server.stop(true);
    }
  });

  test('clean page passes and issue screenshot can be captured', async () => {
    const clean = await scanFixture(`
      <style>body { margin: 0; background: white; color: black; } main { min-height: 1600px; padding: 20px; }</style>
      <main><h1>Clean</h1><p>Readable text</p></main>
    `);
    expect(clean.issues).toEqual([]);

    const issue = await scanFixture(`
      <style>body { margin: 0; background: white; } #wide { width: 1400px; height: 40px; color: black; background: white; }</style>
      <div id="wide" class="__tlx-target">Wide</div>
    `, true);
    expect(issue.screenshotPath).toBeDefined();
    expect(await exists(issue.screenshotPath ?? '')).toBe(true);
  });

  test('normal nav link and button do not report overlap', async () => {
    const result = await scanFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        nav { height: 64px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 0 24px; }
        a, button { height: 36px; padding: 0 16px; color: black; background: white; border: 1px solid #ddd; }
      </style>
      <nav aria-label="Main"><a href="/signup">Dang ky</a><button>Dang nhap</button></nav>
    `);

    expect(result.issues.filter((issue) => issue.kind === 'overlap')).toEqual([]);
  });

  test('overlap issue includes route viewport area and evidence metadata', async () => {
    const result = await scanFixture(`
      <style>body { margin: 0; background: white; color: black; } section { position: relative; padding: 20px; } #a, #b { position: absolute; left: 20px; top: 20px; width: 140px; height: 40px; color: black; background: white; }</style>
      <section aria-label="Hero"><h1>Hero</h1><button id="a">Save</button><p id="b">Text</p></section>
    `);

    const issue = result.issues.find((item) => item.kind === 'overlap');
    expect(issue?.route).toBe('/');
    expect(issue?.metadata.viewport).toBe('desktop');
    expect(issue?.metadata.areaLabel).toBe('Hero');
    expect(issue?.metadata.evidence).toBe('geometry+hit-test');
  });

  test('all-pages scan discovers and scans linked internal routes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-routes-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/about') return new Response('<main><h1>About</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
        return new Response('<main><h1>Home</h1><a href="/about">About</a></main>', { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'routes',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
        discoverRoutes: true,
      });

      expect(result.routesScanned).toBe(2);
    } finally {
      server.stop(true);
    }
  });

  test('runner scans every explicit graph target', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-explicit-routes-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/settings') return new Response('<main><h1>Settings</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
        if (url.pathname === '/about') return new Response('<main><h1>About</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
        return new Response('<main><h1>Home</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const port = server.port;
      if (!port) throw new Error('test server did not start');
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([
        { route: '/', url: `http://localhost:${port}/` },
        { route: '/about', url: `http://localhost:${port}/about` },
        { route: '/settings', url: `http://localhost:${port}/settings` },
      ], {
        reportId: 'explicit-routes',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      expect(result.routesScanned).toBe(3);
    } finally {
      server.stop(true);
    }
  });

  test('first project scan defaults changed scope to all graph routes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-first-scan-'));
    tempRoots.push(root);
    await fs.mkdir(path.join(root, 'app', 'about'), { recursive: true });
    await fs.writeFile(path.join(root, 'app', 'page.tsx'), 'export default function Page() { return <main />; }', 'utf8');
    await fs.writeFile(path.join(root, 'app', 'about', 'page.tsx'), 'export default function About() { return <main />; }', 'utf8');
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/about') return new Response('<main><h1>About</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
        return new Response('<main><h1>Home</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
      },
    });
    const port = server.port;
    if (!port) throw new Error('test server did not start');

    try {
      const result = await new EngineService().runProjectScan({
        projectUrl: `http://localhost:${port}`,
        project: {
          framework: 'next',
          port,
          rootDir: root,
          scanGraph: {
            pages: [
              { id: 'page-home', type: 'page', name: 'Home', route: '/', filePath: path.join(root, 'app', 'page.tsx'), framework: 'next', components: [], apis: [], links: [] },
              { id: 'page-about', type: 'page', name: 'About', route: '/about', filePath: path.join(root, 'app', 'about', 'page.tsx'), framework: 'next', components: [], apis: [], links: [] },
            ],
            components: [],
            apis: [],
            edges: [],
          },
        },
      });

      expect(result.report.scope).toBe('all');
      expect(result.report.summary.routesScanned).toBeGreaterThan(0);
    } finally {
      server.stop(true);
    }
  });

  test('401 route reports auth_required without visual noise', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-auth-required-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('Unauthorized', { status: 401 });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/admin', url: `http://localhost:${server.port}/admin` }], {
        reportId: 'auth-required',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      expect(result.issues.map((issue) => issue.kind)).toEqual(['auth_required']);
      expect(result.screenshots).toEqual([]);
    } finally {
      server.stop(true);
    }
  });

  test('403 route with storage state reports auth_failed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-auth-failed-'));
    tempRoots.push(root);
    const storageStatePath = path.join(root, 'state.json');
    await fs.writeFile(storageStatePath, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('Forbidden', { status: 403 });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/admin', url: `http://localhost:${server.port}/admin` }], {
        reportId: 'auth-failed',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
        storageStatePath,
      });

      expect(result.issues.map((issue) => issue.kind)).toEqual(['auth_failed']);
    } finally {
      server.stop(true);
    }
  });

  test('runner attaches a real screenshot to visual issues', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-screenshots-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(`
          <style>body { margin: 0; background: white; } #wide { width: 1400px; height: 40px; color: black; background: white; }</style>
          <div id="wide" class="__tlx-target">Wide</div>
        `, { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'screenshots',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      const visualIssues = result.issues.filter((issue) => issue.kind === 'overlap' || issue.kind === 'overflow' || issue.kind === 'contrast');
      expect(visualIssues.length).toBeGreaterThan(0);
      expect(result.artifactErrors).toEqual([]);
      expect(result.screenshots.length).toBe(1);
      for (const issue of visualIssues) {
        expect(issue.screenshotPath).toBeDefined();
        const stat = await fs.stat(path.join(root, issue.screenshotPath ?? ''));
        expect(stat.size).toBeGreaterThan(0);
      }
    } finally {
      server.stop(true);
    }
  });

  test('synthetic crawler issues do not require visual screenshots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-crawler-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('<main><h1>Home</h1><p>Readable text</p><script>console.error("boom")</script></main>', { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'crawler',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      const crawlerIssue = result.issues.find((issue) => issue.kind === 'crawler');
      expect(crawlerIssue).toBeDefined();
      expect(crawlerIssue?.screenshotPath).toBeUndefined();
      expect(result.artifactErrors).toEqual([]);
    } finally {
      server.stop(true);
    }
  });
});

async function scanFixture(html: string, captureScreenshot = false) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pageScan = await page.evaluate(() => {
      const selectors = 'button, a, h1, h2, h3, p, input, label, textarea, select, img, [data-tlx-target], .__tlx-target';
      return Array.from(document.querySelectorAll<HTMLElement>(selectors))
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();
          return {
            selector,
            tagName: el.tagName,
            text: (el.textContent || '').trim(),
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            color: style.color,
            backgroundColor: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? window.getComputedStyle(document.body).backgroundColor : style.backgroundColor,
            areaLabel: el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form')?.getAttribute('aria-label') ?? el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form')?.tagName.toLowerCase(),
            areaSelector: el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form')?.tagName.toLowerCase(),
            ancestorSelectors: [],
            interactiveAncestorSelector: el.closest<HTMLElement>('button, a, [role="button"], [role="link"]')?.id ? `#${el.closest<HTMLElement>('button, a, [role="button"], [role="link"]')?.id}` : undefined,
            occludes: [] as string[],
          } satisfies ScannedElement;
        })
        .filter((item) => item.boundingBox.width > 0 && item.boundingBox.height > 0);
    });
    for (let leftIndex = 0; leftIndex < pageScan.length; leftIndex += 1) {
      const left = pageScan[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < pageScan.length; rightIndex += 1) {
        const right = pageScan[rightIndex];
        if (!right) continue;
        if (left.boundingBox.x < right.boundingBox.x + right.boundingBox.width && left.boundingBox.x + left.boundingBox.width > right.boundingBox.x && left.boundingBox.y < right.boundingBox.y + right.boundingBox.height && left.boundingBox.y + left.boundingBox.height > right.boundingBox.y) {
          right.occludes.push(left.selector);
        }
      }
    }
    const result = analyzeElements(pageScan, {
      route: '/',
      url: 'http://localhost:3000',
      viewport: { width: 1000, height: 700 },
      contrastRatio: 4.5,
      issuePrefix: 'fixture',
      pageMetrics: await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight })),
    });
    result.issues = result.issues.map((issue) => ({ ...issue, metadata: { ...issue.metadata, viewport: 'desktop' } }));

    let screenshotPath: string | undefined;
    if (captureScreenshot && result.issues.length > 0) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-'));
      tempRoots.push(root);
      screenshotPath = path.join(root, 'issue.png');
      await page.screenshot({ path: screenshotPath });
    }

    return { ...result, screenshotPath };
  } finally {
    await page.close();
    await browser.close();
  }
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function testConfig(): TlxProjectConfig {
  return {
    auth: { mode: 'none', profile: 'default' },
    scan: {
      defaultScope: 'all',
      ignoredPaths: [],
      viewports: [{ name: 'desktop', width: 1000, height: 700 }],
      contrastRatio: 4.5,
      crawler: { enabled: false, maxDepth: 1, maxPages: 10 },
      api: { enabled: false, unsafeMethods: false },
    },
  };
}

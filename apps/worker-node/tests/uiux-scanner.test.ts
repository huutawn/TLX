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

  test('detects alignment drift from real DOM geometry', async () => {
    const result = await scanFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        main { position: relative; min-height: 220px; }
        button { position: absolute; width: 120px; height: 32px; color: black; background: white; border: 1px solid #ddd; }
        #a { left: 40px; top: 20px; } #b { left: 43px; top: 70px; } #c { left: 40px; top: 120px; }
      </style>
      <main><button id="a">One</button><button id="b">Two</button><button id="c">Three</button></main>
    `);

    expect(result.issues.some((issue) => issue.kind === 'alignment')).toBe(true);
  });

  test('detects spacing inconsistency from sibling boxes', async () => {
    const result = await scanFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        main { position: relative; min-height: 120px; }
        .item { position: absolute; top: 20px; width: 40px; height: 32px; color: black; background: white; }
        #a { left: 0; } #b { left: 48px; } #c { left: 105px; }
      </style>
      <main><div id="a" class="item __tlx-target">A</div><div id="b" class="item __tlx-target">B</div><div id="c" class="item __tlx-target">C</div></main>
    `);

    expect(result.issues.some((issue) => issue.kind === 'spacing')).toBe(true);
  });

  test('detects typography issues from computed styles', async () => {
    const result = await scanFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        main { padding: 24px; }
        h1, p { margin: 0 0 12px; font-size: 14px; line-height: 20px; color: black; background: white; }
        button { width: 80px; height: 32px; font-size: 10px; color: black; background: white; }
      </style>
      <main><h1 id="title">Title</h1><p id="body">Readable body text</p><button id="tiny">Tiny</button></main>
    `);

    expect(result.issues.some((issue) => issue.kind === 'typography')).toBe(true);
  });

  test('detects orphan elements far from the main cluster', async () => {
    const result = await scanFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        main { position: relative; min-height: 140px; }
        button { position: absolute; width: 80px; height: 32px; color: black; background: white; }
        #a { left: 0; top: 0; } #b { left: 0; top: 48px; } #c { left: 100px; top: 0; } #lonely { left: 760px; top: 0; }
      </style>
      <main><button id="a">A</button><button id="b">B</button><button id="c">C</button><button id="lonely">Lonely</button></main>
    `);

    expect(result.issues.some((issue) => issue.kind === 'orphan')).toBe(true);
  });

  test('detects small interactive hit areas', async () => {
    const result = await scanFixture(`
      <style>body { margin: 0; background: white; color: black; } button { width: 24px; height: 24px; padding: 0; color: black; background: white; }</style>
      <button id="icon">x</button>
    `);

    expect(result.issues.some((issue) => issue.kind === 'hit_area')).toBe(true);
  });

  test('detects clipped text from browser layout metrics', async () => {
    const result = await scanFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        p { width: 120px; height: 20px; overflow: hidden; white-space: nowrap; color: black; background: white; }
      </style>
      <p id="clip">This text cannot fit inside the available box</p>
    `);

    expect(result.issues.some((issue) => issue.kind === 'text_clipping')).toBe(true);
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

  test('discovered routes strip trailing slash before scan', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-trailing-route-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/') return new Response('<main><h1>Home</h1><a href="/map/">Map</a></main>', { headers: { 'Content-Type': 'text/html' } });
        if (url.pathname === '/map') return new Response('<main><h1>Map</h1><p>Readable</p></main>', { headers: { 'Content-Type': 'text/html' } });
        return new Response('missing', { status: 404 });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'trailing-route',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
        discoverRoutes: true,
      });

      expect(result.routesScanned).toBe(2);
      expect(result.issues.some((issue) => issue.kind === 'crawler' && issue.route === '/map' && issue.metadata.status === 404)).toBe(false);
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
      expect(result.routes).toEqual(['/', '/about', '/settings']);
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
      expect(result.report.routes).toEqual(['/', '/about']);
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

      const visualIssues = result.issues.filter((issue) => issue.kind === 'overlap' || issue.kind === 'overflow' || issue.kind === 'contrast' || issue.kind === 'color_harmony');
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

  test('runner waits for client-rendered DOM before analysis', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-client-settle-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(`
          <style>
            body { margin: 0; background: white; color: black; }
            #wide { width: 1400px; height: 40px; color: black; background: white; }
          </style>
          <main id="root"><p>Loading</p></main>
          <script>
            setTimeout(() => {
              document.getElementById('root').innerHTML = '<div id="wide" class="__tlx-target">Client rendered wide content</div>';
            }, 300);
          </script>
        `, { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'client-settle',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      const issue = result.issues.find((item) => item.kind === 'overflow');
      expect(issue?.metadata.textSample).toContain('Client rendered wide content');
    } finally {
      server.stop(true);
    }
  });

  test('reports OKLCH route palette harmony and keeps scan successful', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-oklch-route-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(`
          <style>
            body { margin: 0; background: white; color: black; }
            main { min-height: 900px; display: grid; grid-template-columns: repeat(4, 1fr); }
            #red { background: rgb(255, 0, 0); }
            #green { background: rgb(0, 255, 0); }
            #blue { background: rgb(0, 0, 255); }
            #yellow { background: rgb(255, 255, 0); }
            section { min-height: 240px; color: white; }
          </style>
          <main><section id="red"><h1>Red</h1></section><section id="green"><h2>Green</h2></section><section id="blue"><p>Blue</p></section><section id="yellow"><p>Yellow</p></section></main>
        `, { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([{ route: '/', url: `http://localhost:${server.port}/` }], {
        reportId: 'oklch-route',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig(),
        apiEndpoints: [],
      });

      const issue = result.issues.find((item) => item.kind === 'color_harmony');
      expect(issue?.severity).toBe('warning');
      expect(issue?.screenshotPath).toBeDefined();
      expect(result.colorAnalysis?.routes.length).toBe(1);
      expect(result.issues.every((item) => item.severity !== 'error')).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test('reports OKLCH cross-route palette drift', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-uiux-oklch-cross-'));
    tempRoots.push(root);
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        const color = url.pathname === '/settings' ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)';
        return new Response(`
          <style>body { margin: 0; background: white; color: black; } main { min-height: 900px; background: ${color}; color: white; padding: 40px; }</style>
          <main><h1>${url.pathname}</h1><p>Readable</p></main>
        `, { headers: { 'Content-Type': 'text/html' } });
      },
    });

    try {
      const runner = new PlaywrightScannerRunner();
      const result = await runner.scan([
        { route: '/', url: `http://localhost:${server.port}/` },
        { route: '/settings', url: `http://localhost:${server.port}/settings` },
      ], {
        reportId: 'oklch-cross',
        screenshotsDir: root,
        relativeScreenshotPath: (_id, fileName) => fileName,
        config: testConfig({ maxRouteHueDrift: 30 }),
        apiEndpoints: [],
      });

      expect(result.colorAnalysis?.routes.length).toBe(2);
      expect(result.issues.some((issue) => issue.kind === 'color_harmony' && issue.metadata.evidence === 'oklch-cross-route-palette')).toBe(true);
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
      const selectors = 'main, section, article, nav, header, footer, aside, form, button, a, h1, h2, h3, p, input, label, textarea, select, img, svg, [data-tlx-target], .__tlx-target';
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
            fontSize: parseCssPx(style.fontSize),
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            lineHeight: parseLineHeight(style.lineHeight, style.fontSize),
            letterSpacing: parseCssPx(style.letterSpacing) ?? 0,
            display: style.display,
            position: style.position,
            role: el.getAttribute('role') ?? undefined,
            parentSelector: el.parentElement && el.parentElement !== document.body ? (el.parentElement.id ? `#${el.parentElement.id}` : el.parentElement.tagName.toLowerCase()) : undefined,
            childrenSelectors: Array.from(el.children).filter((child): child is HTMLElement => child instanceof HTMLElement).map((child) => child.id ? `#${child.id}` : child.tagName.toLowerCase()),
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
            areaLabel: el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form')?.getAttribute('aria-label') ?? el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form')?.tagName.toLowerCase(),
            areaSelector: el.closest<HTMLElement>('section, article, main, nav, header, footer, aside, form')?.tagName.toLowerCase(),
            ancestorSelectors: [],
            interactiveAncestorSelector: el.closest<HTMLElement>('button, a, [role="button"], [role="link"]')?.id ? `#${el.closest<HTMLElement>('button, a, [role="button"], [role="link"]')?.id}` : undefined,
            occludes: [] as string[],
          } satisfies ScannedElement;
        })
        .filter((item) => item.boundingBox.width > 0 && item.boundingBox.height > 0);

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

function testConfig(colorHarmony: Partial<TlxProjectConfig['scan']['colorHarmony']> = {}): TlxProjectConfig {
  return {
    auth: { mode: 'none', profile: 'default' },
    scan: {
      defaultScope: 'all',
      ignoredPaths: [],
      viewports: [{ name: 'desktop', width: 1000, height: 700 }],
      contrastRatio: 4.5,
      colorHarmony: {
        enabled: true,
        maxStrongHueFamilies: 3,
        maxRouteHueDrift: 85,
        maxHighChromaAreaRatio: 0.35,
        maxHueSpread: 150,
        ...colorHarmony,
      },
      visualQuality: {
        enabled: true,
        alignmentTolerancePx: 2,
        alignmentMaxDriftPx: 5,
        spacingGridPx: 4,
        spacingTolerancePx: 1,
        spacingMedianDriftPx: 4,
        orphanDistancePx: 500,
        minDesktopHitTargetPx: 32,
        minMobileHitTargetPx: 40,
        minReadableFontPx: 12,
        minMobileReadableFontPx: 14,
        minInteractiveFontPx: 13,
      },
      crawler: { enabled: false, maxDepth: 1, maxPages: 10 },
      api: { enabled: false, unsafeMethods: false },
    },
  };
}

/// <reference lib="dom" />

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { EngineService } from '../src/services/engine.service';
import { cleanupTempRoots, expectIssue, expectNoIssue, htmlResponse, makeTempRoot, scanHtmlFixture, serveFixture, testConfig } from './uiux-fixtures';

afterEach(cleanupTempRoots);

describe('UI/UX scanner DOM analysis fixtures', () => {
  test('detects real DOM overflow, overlap, contrast, and visual quality issues', async () => {
    const result = await scanHtmlFixture(`
      <style>
        body { margin: 0; background: rgb(130, 130, 130); color: black; font-family: sans-serif; }
        main { position: relative; min-height: 260px; background: white; }
        #wide { width: 1400px; height: 36px; color: black; background: white; }
        #a, #b { position: absolute; left: 20px; top: 60px; width: 130px; height: 40px; color: black; background: white; }
        #low { position: absolute; top: 120px; color: rgb(120, 120, 120); background: rgb(130, 130, 130); }
        #icon { position: absolute; top: 170px; width: 24px; height: 24px; padding: 0; color: black; background: white; }
      </style>
      <main><div id="wide" class="__tlx-target">Wide</div><button id="a">Save</button><p id="b">Text</p><p id="low">Low contrast</p><button id="icon">x</button></main>
    `);

    expectIssue(result, 'overflow');
    expectIssue(result, 'overlap');
    expectIssue(result, 'contrast');
    expectIssue(result, 'hit_area');
  });

  test('detects text clipping and local scroll from browser layout metrics', async () => {
    const result = await scanHtmlFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        #clip { width: 120px; height: 20px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        #scroll { width: 220px; overflow-x: hidden; white-space: nowrap; }
        #scroll span { display: inline-block; width: 520px; }
      </style>
      <main><p id="clip">This text cannot fit inside the available box</p><div id="scroll" class="__tlx-target"><span>Unbroken local scroll content</span></div></main>
    `);

    expectIssue(result, 'text_clipping', { evidence: 'text-ellipsis-overflow' });
    expectIssue(result, 'local_scroll');
  });

  test('clean responsive page and vertical-only overflow stay clean', async () => {
    const result = await scanHtmlFixture(`
      <style>body { margin: 0; background: white; color: black; font-family: sans-serif; } main { min-height: 1600px; padding: 20px; box-sizing: border-box; } p { max-width: 60ch; }</style>
      <main><h1>Clean</h1><p>Readable text wraps normally and vertical page length is allowed.</p></main>
    `);

    expect(result.issues).toEqual([]);
  });

  test('visual quality flag disables visual quality rules but leaves core checks on', async () => {
    const result = await scanHtmlFixture(`
      <style>
        body { margin: 0; background: white; color: black; font-family: sans-serif; }
        button { position: absolute; width: 24px; height: 24px; color: black; background: white; }
        #a { left: 40px; top: 20px; } #b { left: 43px; top: 70px; } #c { left: 40px; top: 120px; }
        #wide { position: absolute; top: 170px; width: 1400px; height: 24px; }
      </style>
      <main><button id="a">A</button><button id="b">B</button><button id="c">C</button><div id="wide" class="__tlx-target">Wide</div></main>
    `, { visualQuality: { enabled: false } });

    expectIssue(result, 'overflow');
    expectNoIssue(result, 'alignment');
    expectNoIssue(result, 'hit_area');
  });
});

describe('UI/UX scanner runner integration', () => {
  test('detects fixed header anchor occlusion', async () => {
    const fixture = serveFixture({
      '/': `
        <style>
          body { margin: 0; background: white; color: black; font-family: sans-serif; }
          header { position: fixed; top: 0; left: 0; right: 0; height: 72px; z-index: 10; background: white; color: black; }
          main { padding-top: 90px; }
          .spacer { height: 1200px; }
          #details { height: 120px; color: black; background: white; }
        </style>
        <header><a href="#details">Details</a></header>
        <main><div class="spacer"></div><section id="details"><h1>Details</h1></section><div class="spacer"></div></main>
      `,
    });

    try {
      const result = await fixture.scan(undefined, { reportId: 'fixed-occlusion', config: testConfig({ colorHarmony: { enabled: false } }) });
      expectIssue(result, 'fixed_occlusion');
    } finally {
      fixture.server.stop(true);
    }
  });

  test('detects broken images from browser image state', async () => {
    const fixture = serveFixture({
      '/missing.png': () => new Response('missing', { status: 404 }),
      '/': '<main><img id="photo" src="/missing.png" width="160" height="90" alt="Preview" /></main>',
    });

    try {
      const result = await fixture.scan(undefined, { reportId: 'broken-image', config: testConfig({ colorHarmony: { enabled: false } }) });
      expectIssue(result, 'broken_image');
    } finally {
      fixture.server.stop(true);
    }
  });

  test('does not report contrast from text on gradient background', async () => {
    const fixture = serveFixture({
      '/': `
        <style>
          body { margin: 0; background: white; font-family: sans-serif; }
          main { min-height: 900px; background: linear-gradient(135deg, #064e3b, #047857); padding: 80px; }
          h1 { color: white; font-size: 48px; max-width: 620px; }
        </style>
        <main><h1>Every pledge is tracked</h1></main>
      `,
    });

    try {
      const result = await fixture.scan();
      expectNoIssue(result, 'contrast');
    } finally {
      fixture.server.stop(true);
    }
  });

  test('discovers linked internal routes and normalizes trailing slashes', async () => {
    const fixture = serveFixture({
      '/': '<main><h1>Home</h1><a href="/map/">Map</a></main>',
      '/map': '<main><h1>Map</h1><p>Readable</p></main>',
    });

    try {
      const result = await fixture.scan(undefined, { reportId: 'routes', discoverRoutes: true });
      expect(result.routesScanned).toBe(2);
      expect(result.routes).toEqual(['/', '/map']);
      expect(result.issues.some((issue) => issue.kind === 'crawler' && issue.route === '/map' && issue.metadata.status === 404)).toBe(false);
    } finally {
      fixture.server.stop(true);
    }
  });

  test('scans every explicit graph target', async () => {
    const fixture = serveFixture({
      '/': '<main><h1>Home</h1><p>Readable</p></main>',
      '/about': '<main><h1>About</h1><p>Readable</p></main>',
      '/settings': '<main><h1>Settings</h1><p>Readable</p></main>',
    });

    try {
      const result = await fixture.scan([fixture.target('/'), fixture.target('/about'), fixture.target('/settings')], { reportId: 'explicit-routes' });
      expect(result.routesScanned).toBe(3);
      expect(result.routes).toEqual(['/', '/about', '/settings']);
    } finally {
      fixture.server.stop(true);
    }
  });

  test('first project scan defaults changed scope to all graph routes', async () => {
    const root = await makeTempRoot('tlx-uiux-first-scan-');
    await fs.mkdir(path.join(root, 'app', 'about'), { recursive: true });
    await fs.writeFile(path.join(root, 'app', 'page.tsx'), 'export default function Page() { return <main />; }', 'utf8');
    await fs.writeFile(path.join(root, 'app', 'about', 'page.tsx'), 'export default function About() { return <main />; }', 'utf8');
    const fixture = serveFixture({
      '/': '<main><h1>Home</h1><p>Readable</p></main>',
      '/about': '<main><h1>About</h1><p>Readable</p></main>',
    });

    try {
      const port = fixture.server.port;
      if (!port) throw new Error('test server did not start');
      const result = await new EngineService().runProjectScan({
        projectUrl: fixture.origin,
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
      fixture.server.stop(true);
    }
  });

  test('auth routes report auth issues without visual noise', async () => {
    const fixture = serveFixture({ '*': () => new Response('Unauthorized', { status: 401 }) });

    try {
      const result = await fixture.scan([{ route: '/admin', url: fixture.urlFor('/admin') }], { reportId: 'auth-required' });
      expect(result.issues.map((issue) => issue.kind)).toEqual(['auth_required']);
      expect(result.screenshots).toEqual([]);
    } finally {
      fixture.server.stop(true);
    }
  });

  test('storage state auth failures use auth_failed kind', async () => {
    const root = await makeTempRoot('tlx-uiux-auth-failed-');
    const storageStatePath = path.join(root, 'state.json');
    await fs.writeFile(storageStatePath, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
    const fixture = serveFixture({ '*': () => new Response('Forbidden', { status: 403 }) });

    try {
      const result = await fixture.scan([{ route: '/admin', url: fixture.urlFor('/admin') }], { reportId: 'auth-failed', root, storageStatePath });
      expect(result.issues.map((issue) => issue.kind)).toEqual(['auth_failed']);
    } finally {
      fixture.server.stop(true);
    }
  });

  test('waits for client-rendered DOM before analysis', async () => {
    const fixture = serveFixture({
      '/': `
        <style>body { margin: 0; background: white; color: black; } #wide { width: 1400px; height: 40px; color: black; background: white; }</style>
        <main id="root"><p>Loading</p></main>
        <script>setTimeout(() => { document.getElementById('root').innerHTML = '<div id="wide" class="__tlx-target">Client rendered wide content</div>'; }, 300);</script>
      `,
    });

    try {
      const result = await fixture.scan(undefined, { reportId: 'client-settle' });
      const issue = expectIssue(result, 'overflow');
      expect(issue.metadata.textSample).toContain('Client rendered wide content');
    } finally {
      fixture.server.stop(true);
    }
  });

  test('reports OKLCH route and cross-route palette issues', async () => {
    const fixture = serveFixture({
      '*': (request) => {
        const url = new URL(request.url);
        const color = url.pathname === '/settings' ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)';
        return htmlResponse(`
          <style>body { margin: 0; background: white; color: black; } main { min-height: 900px; background: ${color}; color: white; padding: 40px; }</style>
          <main><h1>${url.pathname}</h1><p>Readable</p></main>
        `);
      },
    });

    try {
      const result = await fixture.scan([fixture.target('/'), fixture.target('/settings')], { reportId: 'oklch-cross', config: testConfig({ colorHarmony: { maxRouteHueDrift: 30 } }) });
      expect(result.colorAnalysis?.routes.length).toBe(2);
      expect(result.issues.some((issue) => issue.kind === 'color_harmony' && issue.metadata.evidence === 'oklch-cross-route-palette')).toBe(true);
    } finally {
      fixture.server.stop(true);
    }
  });
});

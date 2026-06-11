/// <reference lib="dom" />

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { isTlxVisualScanIssue } from '@tlx/contracts';
import { ProjectStorageService } from '../src/services/storage.service';
import { cleanupTempRoots, expectIssue, htmlResponse, makeTempRoot, serveFixture, testConfig } from './uiux-fixtures';

afterEach(cleanupTempRoots);

describe('UI/UX scanner artifact contract', () => {
  test('visual issues receive a real full-page screenshot and overlay metadata', async () => {
    const projectRoot = await makeTempRoot('tlx-uiux-artifacts-');
    const storage = new ProjectStorageService(projectRoot);
    const reportId = 'artifact-contract';
    const screenshotsDir = storage.screenshotReportDir(reportId);
    const fixture = serveFixture({
      '/': `
        <style>
          body { margin: 0; background: white; color: black; }
          main { min-height: 1600px; }
          #wide { width: 1400px; height: 40px; color: black; background: white; }
        </style>
        <main><div id="wide" class="__tlx-target">Wide</div></main>
      `,
    });

    try {
      const result = await fixture.scan(undefined, {
        reportId,
        root: screenshotsDir,
        config: testConfig({ colorHarmony: { enabled: false } }),
      });
      const issue = expectIssue(result, 'overflow');
      const relative = storage.relativeScreenshotPath(reportId, 'home-desktop.png');

      expect(result.artifactErrors).toEqual([]);
      expect(result.screenshots).toEqual(['home-desktop.png']);
      expect(issue.screenshotPath).toBe('home-desktop.png');
      expect(issue.metadata.viewport).toBe('desktop');
      expect(issue.metadata.viewportWidth).toBe(1000);
      expect(issue.metadata.viewportHeight).toBe(700);
      expect(issue.metadata.screenshotWidth).toBe(1400);
      expect(issue.metadata.screenshotHeight).toBe(1600);
      expect(issue.metadata.fixHint || issue.metadata.evidence).toBeTruthy();

      const absolutePath = path.join(screenshotsDir, issue.screenshotPath ?? '');
      const stat = await fs.stat(absolutePath);
      expect(stat.size).toBeGreaterThan(0);
      expect(readPngDimensions(await fs.readFile(absolutePath))).toEqual({ width: 1400, height: 1600 });
      expect(relative).toBe('.tlx/screenshots/artifact-contract/home-desktop.png');
    } finally {
      fixture.server.stop(true);
    }
  }, 10_000);

  test('every visual issue carries screenshot metadata while non-visual issues do not need screenshots', async () => {
    const root = await makeTempRoot('tlx-uiux-visual-contract-');
    const fixture = serveFixture({
      '/api/data': () => new Response('bad', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      '/missing': () => new Response('missing', { status: 404, headers: { 'Content-Type': 'text/html' } }),
      '/': `
        <style>
          body { margin: 0; background: white; color: black; }
          #wide { width: 1400px; height: 40px; color: black; background: white; }
        </style>
        <main><div id="wide" class="__tlx-target">Wide</div><a href="https://example.com">External</a><script>console.error("boom")</script></main>
      `,
    });

    try {
      const result = await fixture.scan([fixture.target('/'), fixture.target('/missing')], {
        reportId: 'mixed-contract',
        root,
        config: testConfig({ colorHarmony: { enabled: false }, crawler: { enabled: true }, api: { enabled: true } }),
        apiEndpoints: ['/api/data'],
      });
      const visualIssues = result.issues.filter(isTlxVisualScanIssue);
      const nonVisualIssues = result.issues.filter((issue) => !isTlxVisualScanIssue(issue));

      expect(visualIssues.length).toBeGreaterThan(0);
      expect(nonVisualIssues.some((issue) => issue.kind === 'crawler')).toBe(true);
      expect(nonVisualIssues.some((issue) => issue.kind === 'api')).toBe(true);
      for (const issue of visualIssues) {
        expect(issue.screenshotPath).toBeDefined();
        expect(issue.metadata.viewportWidth).toBeGreaterThan(0);
        expect(issue.metadata.viewportHeight).toBeGreaterThan(0);
        expect(issue.metadata.screenshotWidth).toBeGreaterThan(0);
        expect(issue.metadata.screenshotHeight).toBeGreaterThan(0);
        expect(issue.metadata.fixHint || issue.metadata.evidence).toBeTruthy();
      }
      for (const issue of nonVisualIssues) {
        expect(issue.screenshotPath).toBeUndefined();
      }
    } finally {
      fixture.server.stop(true);
    }
  }, 10_000);

  test('auth-required issue does not create a fake screenshot artifact', async () => {
    const fixture = serveFixture({ '*': () => new Response('Unauthorized', { status: 401 }) });

    try {
      const result = await fixture.scan([{ route: '/admin', url: fixture.urlFor('/admin') }], { reportId: 'auth-artifact' });
      expect(result.issues.map((issue) => issue.kind)).toEqual(['auth_required']);
      expect(result.screenshots).toEqual([]);
      expect(result.issues[0]?.screenshotPath).toBeUndefined();
    } finally {
      fixture.server.stop(true);
    }
  });

  test('route-specific screenshot names are stable for overlay lookup', async () => {
    const root = await makeTempRoot('tlx-uiux-route-screenshot-');
    const fixture = serveFixture({
      '/settings/profile': '<style>body{margin:0;background:white;color:black}#wide{width:1400px;height:40px}</style><main><div id="wide" class="__tlx-target">Wide</div></main>',
    });

    try {
      const result = await fixture.scan([fixture.target('/settings/profile')], { reportId: 'route-paths', root, config: testConfig({ colorHarmony: { enabled: false } }) });
      const issue = expectIssue(result, 'overflow');
      expect(issue.screenshotPath).toBe('settings-profile-desktop.png');
      expect(await fs.stat(path.join(root, issue.screenshotPath ?? ''))).toBeDefined();
    } finally {
      fixture.server.stop(true);
    }
  });

  test('HTML response helper preserves explicit status for crawler checks', () => {
    const response = htmlResponse('<main />', { status: 418 });
    expect(response.status).toBe(418);
    expect(response.headers.get('content-type')).toBe('text/html');
  });
});

function readPngDimensions(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

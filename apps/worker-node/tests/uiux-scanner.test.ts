/// <reference lib="dom" />

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { analyzeElements, type ScannedElement } from '../src/scanner/ui-analyzer';

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

  test('clean page passes and issue screenshot can be captured', async () => {
    const clean = await scanFixture(`
      <style>body { margin: 0; background: white; color: black; } main { padding: 20px; }</style>
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
});

async function scanFixture(html: string, captureScreenshot = false) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const elements = await page.evaluate(() => {
      const selectors = 'button, a, h1, h2, h3, p, input, label, textarea, select, img, nav, main, section, article, div.__tlx-target';
      return Array.from(document.querySelectorAll<HTMLElement>(selectors))
        .map((el, index) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}_${index}`,
            tagName: el.tagName,
            text: (el.textContent || '').trim(),
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            color: style.color,
            backgroundColor: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? window.getComputedStyle(document.body).backgroundColor : style.backgroundColor,
          } satisfies ScannedElement;
        })
        .filter((item) => item.boundingBox.width > 0 && item.boundingBox.height > 0);
    });
    const result = analyzeElements(elements, {
      route: '/',
      url: 'http://localhost:3000',
      viewport: { width: 1000, height: 700 },
      contrastRatio: 4.5,
      issuePrefix: 'fixture',
    });

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

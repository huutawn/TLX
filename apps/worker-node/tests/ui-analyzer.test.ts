import { describe, expect, test } from 'bun:test';
import { analyzeColorHarmony, hueDistance, parseCssColor, rgbToOklch } from '../src/scanner/color-harmony';
import { analyzeElements, contrastRatio, isOverflowing, isOverlapping, type ScannedElement } from '../src/scanner/ui-analyzer';

describe('UI analyzer', () => {
  test('detects AABB overlap', () => {
    expect(isOverlapping({ x: 0, y: 0, width: 100, height: 40 }, { x: 20, y: 10, width: 50, height: 20 })).toBe(true);
    expect(isOverlapping({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(false);
  });

  test('detects viewport overflow', () => {
    expect(isOverflowing({ x: 900, y: 0, width: 200, height: 40 }, { width: 1000, height: 800 })).toBe(true);
    expect(isOverflowing({ x: 0, y: 0, width: 1000, height: 2000 }, { width: 1000, height: 800 })).toBe(false);
    expect(isOverflowing({ x: 10, y: 10, width: 200, height: 40 }, { width: 1000, height: 800 })).toBe(false);
  });

  test('calculates WCAG contrast ratio', () => {
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeGreaterThan(20);
    expect(contrastRatio('rgb(120, 120, 120)', 'rgb(130, 130, 130)')).toBeLessThan(1.2);
  });

  test('converts CSS colors to OKLCH', () => {
    expect(parseCssColor('#fff')).toEqual([255, 255, 255]);
    expect(parseCssColor('rgba(255, 0, 0, 0)')).toBeUndefined();
    expect(rgbToOklch([255, 255, 255]).lightness).toBeGreaterThan(0.99);
    expect(rgbToOklch([0, 0, 0]).lightness).toBeLessThan(0.01);
    expect(rgbToOklch([255, 0, 0]).chroma).toBeGreaterThan(0.2);
    expect(hueDistance(350, 10)).toBe(20);
  });

  test('keeps neutral plus one accent palette clean', () => {
    const result = analyzeColorHarmony([
      element('#hero', 0, 0, 600, 300, '', 'rgb(15, 23, 42)', 'rgb(248, 250, 252)'),
      element('#cta', 20, 20, 160, 44, 'Save', 'rgb(255, 255, 255)', 'rgb(37, 99, 235)'),
    ], {
      route: '/',
      viewportName: 'desktop',
      thresholds: colorThresholds(),
    });

    expect(result.issue).toBeUndefined();
    expect(result.analysis.score).toBeGreaterThan(80);
  });

  test('reports clashing high-chroma hue families', () => {
    const result = analyzeElements([
      element('#red', 0, 0, 200, 120, '', 'rgb(255, 255, 255)', 'rgb(255, 0, 0)'),
      element('#green', 220, 0, 200, 120, '', 'rgb(255, 255, 255)', 'rgb(0, 255, 0)'),
      element('#blue', 440, 0, 200, 120, '', 'rgb(255, 255, 255)', 'rgb(0, 0, 255)'),
      element('#yellow', 660, 0, 200, 120, '', 'rgb(0, 0, 0)', 'rgb(255, 255, 0)'),
    ], {
      ...baseOptions(),
      colorHarmony: { enabled: true, thresholds: colorThresholds() },
      viewportName: 'desktop',
    });

    const issue = result.issues.find((item) => item.kind === 'color_harmony');
    expect(issue?.severity).toBe('warning');
    expect(issue?.metadata.evidence).toBe('oklch-route-palette');
    expect(result.colorAnalysis?.strongHueFamilies).toBeGreaterThan(3);
  });

  test('returns structured issues', () => {
    const elements: ScannedElement[] = [
      element('button_0', 0, 0, 100, 50, 'Click', 'rgb(120, 120, 120)', 'rgb(130, 130, 130)', ['p_1']),
      element('p_1', 20, 10, 100, 50, 'Text', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
      element('div_2', 990, 0, 50, 20, '', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
    ];

    const result = analyzeElements(elements, {
      route: '/',
      url: 'http://localhost:3000',
      viewport: { width: 1000, height: 800 },
      contrastRatio: 4.5,
      issuePrefix: 'test',
    });

    expect(result.issues.some((issue) => issue.kind === 'overlap')).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'overflow')).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'contrast')).toBe(true);
    expect(result.issues.every((issue) => issue.message.includes('Fix:'))).toBe(true);
  });

  test('records full-page screenshot dimensions for overlay scaling', () => {
    const result = analyzeElements([
      element('p_1', 0, 900, 100, 20, 'Low contrast', 'rgb(120, 120, 120)', 'rgb(130, 130, 130)'),
    ], {
      ...baseOptions(),
      viewport: { width: 1000, height: 700 },
      pageMetrics: { scrollWidth: 1000, clientWidth: 1000, scrollHeight: 1600, clientHeight: 700 },
    });

    const issue = result.issues.find((item) => item.kind === 'contrast');
    expect(issue?.metadata.screenshotWidth).toBe(1000);
    expect(issue?.metadata.screenshotHeight).toBe(1600);
  });

  test('does not report overlap without hit-test evidence', () => {
    const result = analyzeElements([
      element('button_0', 0, 0, 100, 50, 'Click', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
      element('p_1', 20, 10, 100, 50, 'Text', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'overlap')).toBe(false);
  });

  test('does not report ancestor descendant overlap', () => {
    const result = analyzeElements([
      { ...element('#parent', 0, 0, 200, 80, 'Parent', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', ['#child']), tagName: 'A' },
      { ...element('#child', 10, 10, 50, 30, 'Child', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'), ancestorSelectors: ['#parent'], tagName: 'SPAN' },
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'overlap')).toBe(false);
  });
});

function baseOptions() {
  return {
    route: '/',
    url: 'http://localhost:3000',
    viewport: { width: 1000, height: 800 },
    contrastRatio: 4.5,
    issuePrefix: 'test',
  };
}

function colorThresholds() {
  return {
    maxStrongHueFamilies: 3,
    maxRouteHueDrift: 85,
    maxHighChromaAreaRatio: 0.35,
    maxHueSpread: 150,
  };
}

function element(selector: string, x: number, y: number, width: number, height: number, text: string, color: string, backgroundColor: string, occludes: string[] = []): ScannedElement {
  return { selector, tagName: 'DIV', text, color, backgroundColor, boundingBox: { x, y, width, height }, occludes };
}

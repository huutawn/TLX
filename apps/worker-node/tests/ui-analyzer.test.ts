import { describe, expect, test } from 'bun:test';
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

function element(selector: string, x: number, y: number, width: number, height: number, text: string, color: string, backgroundColor: string, occludes: string[] = []): ScannedElement {
  return { selector, tagName: 'DIV', text, color, backgroundColor, boundingBox: { x, y, width, height }, occludes };
}

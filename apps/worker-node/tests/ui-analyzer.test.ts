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
    const overlap = result.issues.find((issue) => issue.kind === 'overlap');
    expect(overlap?.boundingBox).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(overlap?.metadata.evidenceBox).toEqual({ x: 20, y: 10, width: 80, height: 40 });
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

  test('reports small alignment drift inside a component cluster', () => {
    const result = analyzeElements([
      element('#a', 40, 20, 120, 32, 'A', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { areaSelector: '#panel' }),
      element('#b', 43, 70, 120, 32, 'B', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { areaSelector: '#panel' }),
      element('#c', 40, 120, 120, 32, 'C', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { areaSelector: '#panel' }),
    ], baseOptions());

    const issue = result.issues.find((item) => item.kind === 'alignment');
    expect(issue?.metadata.driftPx).toBe(3);
  });

  test('reports sibling spacing that misses the 4px grid', () => {
    const result = analyzeElements([
      element('#a', 0, 20, 40, 32, 'A', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { parentSelector: '#row' }),
      element('#b', 48, 20, 40, 32, 'B', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { parentSelector: '#row' }),
      element('#c', 105, 20, 40, 32, 'C', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { parentSelector: '#row' }),
    ], baseOptions());

    const issue = result.issues.find((item) => item.kind === 'spacing');
    expect(issue?.metadata.gapPx).toBe(17);
    expect(issue?.boundingBox).toEqual({ x: 105, y: 20, width: 40, height: 32 });
    expect(issue?.metadata.evidenceBox).toEqual({ x: 88, y: 20, width: 17, height: 32 });
  });

  test('reports typography scale and minimum font problems', () => {
    const result = analyzeElements([
      { ...element('#title', 0, 0, 300, 24, 'Heading', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { areaSelector: '#panel', fontSize: 14 }), tagName: 'H1' },
      { ...element('#body', 0, 40, 300, 24, 'Readable body text', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { areaSelector: '#panel', fontSize: 14, lineHeight: 20 }), tagName: 'P' },
      { ...element('#tiny', 0, 80, 80, 16, 'Tiny', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { areaSelector: '#panel', fontSize: 10 }), tagName: 'BUTTON' },
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'typography' && issue.metadata.evidence === 'font-size-minimum')).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'typography' && issue.metadata.evidence === 'type-scale-hierarchy')).toBe(true);
  });

  test('reports orphan elements far from the main UI cluster', () => {
    const result = analyzeElements([
      element('#a', 0, 0, 80, 32, 'A', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
      element('#b', 0, 48, 80, 32, 'B', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
      element('#c', 100, 0, 80, 32, 'C', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
      element('#lonely', 760, 0, 80, 32, 'Lonely', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'orphan' && issue.selector === '#lonely')).toBe(true);
  });

  test('reports small interactive hit areas', () => {
    const result = analyzeElements([
      { ...element('#icon', 0, 0, 24, 24, 'X', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { display: 'block' }), tagName: 'BUTTON' },
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'hit_area')).toBe(true);
  });

  test('reports tap targets placed too close together', () => {
    const result = analyzeElements([
      { ...element('#save', 0, 0, 44, 44, 'Save', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'), tagName: 'BUTTON' },
      { ...element('#delete', 48, 0, 44, 44, 'Delete', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'), tagName: 'BUTTON' },
    ], baseOptions());

    const issue = result.issues.find((item) => item.kind === 'tap_target_spacing');
    expect(issue?.metadata.distancePx).toBe(4);
    expect(issue?.metadata.otherSelector).toBe('#delete');
  });

  test('reports clipped text from scroll metrics', () => {
    const result = analyzeElements([
      element('#clip', 0, 0, 120, 20, 'This text cannot fit inside the box', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], {
        overflowX: 'hidden',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
        scrollWidth: 260,
        clientWidth: 120,
        scrollHeight: 20,
        clientHeight: 20,
      }),
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'text_clipping')).toBe(true);
  });

  test('reports local inline scroll containers', () => {
    const result = analyzeElements([
      element('#scroll', 0, 0, 240, 80, 'Very long unbroken table content', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], {
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        scrollWidth: 520,
        clientWidth: 240,
      }),
    ], {
      ...baseOptions(),
      pageMetrics: { scrollWidth: 1000, clientWidth: 1000, scrollHeight: 800, clientHeight: 800 },
    });

    expect(result.issues.some((issue) => issue.kind === 'local_scroll')).toBe(true);
  });

  test('does not report vertical-only page overflow', () => {
    const result = analyzeElements([
      element('#tall', 0, 0, 1000, 1800, 'Tall content', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
    ], {
      ...baseOptions(),
      pageMetrics: { scrollWidth: 1000, clientWidth: 1000, scrollHeight: 1800, clientHeight: 800 },
    });

    expect(result.issues.some((issue) => issue.kind === 'overflow')).toBe(false);
  });

  test('does not report local scroll below configured threshold', () => {
    const result = analyzeElements([
      element('#table', 0, 0, 240, 80, 'Responsive table', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], {
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        scrollWidth: 248,
        clientWidth: 240,
      }),
    ], {
      ...baseOptions(),
      visualQuality: { maxLocalScrollOverflowPx: 12 },
      pageMetrics: { scrollWidth: 1000, clientWidth: 1000, scrollHeight: 800, clientHeight: 800 },
    });

    expect(result.issues.some((issue) => issue.kind === 'local_scroll')).toBe(false);
  });

  test('honors visual quality threshold overrides', () => {
    const result = analyzeElements([
      { ...element('#icon', 0, 0, 24, 24, 'X', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { display: 'block' }), tagName: 'BUTTON' },
    ], {
      ...baseOptions(),
      visualQuality: { minDesktopHitTargetPx: 20 },
    });

    expect(result.issues.some((issue) => issue.kind === 'hit_area')).toBe(false);
  });

  test('can disable visual quality rules while preserving core overflow checks', () => {
    const result = analyzeElements([
      { ...element('#icon', 0, 0, 24, 24, 'X', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { display: 'block' }), tagName: 'BUTTON' },
      element('#wide', 990, 40, 80, 24, 'Wide', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'),
    ], {
      ...baseOptions(),
      visualQuality: { enabled: false },
    });

    expect(result.issues.some((issue) => issue.kind === 'overflow')).toBe(true);
    expect(result.issues.some((issue) => issue.kind === 'hit_area')).toBe(false);
  });

  test('reports icon-only controls without accessible names', () => {
    const result = analyzeElements([
      { ...element('#trash', 0, 0, 40, 40, '', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'), tagName: 'BUTTON' },
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'accessible_name')).toBe(true);
  });

  test('reports broken images from natural dimensions', () => {
    const result = analyzeElements([
      { ...element('#photo', 0, 0, 160, 90, '', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { complete: true, naturalWidth: 0, naturalHeight: 0, currentSrc: 'http://localhost/missing.png' }), tagName: 'IMG' },
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'broken_image')).toBe(true);
  });

  test('reports multi-line line-height collisions', () => {
    const result = analyzeElements([
      { ...element('#title', 0, 0, 220, 40, 'This heading wraps into several tight lines', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', [], { fontSize: 24, lineHeight: 24, lineBoxCount: 2 }), tagName: 'H1' },
    ], baseOptions());

    expect(result.issues.some((issue) => issue.kind === 'line_height_collision')).toBe(true);
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

function element(selector: string, x: number, y: number, width: number, height: number, text: string, color: string, backgroundColor: string, occludes: string[] = [], extra: Partial<ScannedElement> = {}): ScannedElement {
  return { selector, tagName: 'DIV', text, color, backgroundColor, boundingBox: { x, y, width, height }, occludes, ...extra };
}

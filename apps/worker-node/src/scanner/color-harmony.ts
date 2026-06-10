import type { TlxBoundingBox, TlxColorAnalysis, TlxColorAnalysisThresholds, TlxRouteColorAnalysis } from '@tlx/contracts';
import type { ScannedElement } from './ui-analyzer';

export interface ColorHarmonyOptions {
  route: string;
  viewportName: string;
  thresholds: TlxColorAnalysisThresholds;
}

export interface ColorHarmonyIssueDraft {
  message: string;
  selector: string;
  boundingBox: TlxBoundingBox;
  metadata: Record<string, unknown>;
}

export interface ColorHarmonyResult {
  analysis: TlxRouteColorAnalysis;
  issue?: ColorHarmonyIssueDraft;
}

interface ColorSample {
  selector: string;
  role: string;
  color: string;
  oklch: { lightness: number; chroma: number; hue: number | null };
  weight: number;
  boundingBox: TlxBoundingBox;
  areaLabel?: string;
  areaSelector?: string;
}

const MIN_STRONG_CHROMA = 0.05;
const HIGH_CHROMA = 0.11;
const HUE_FAMILY_SIZE = 30;

export function analyzeColorHarmony(elements: ScannedElement[], options: ColorHarmonyOptions): ColorHarmonyResult {
  const samples = collectColorSamples(elements);
  const strongSamples = samples.filter((sample) => sample.oklch.hue !== null && sample.oklch.chroma >= MIN_STRONG_CHROMA);
  const totalWeight = Math.max(1, samples.reduce((sum, sample) => sum + sample.weight, 0));
  const highChromaWeight = samples.filter((sample) => sample.oklch.chroma >= HIGH_CHROMA).reduce((sum, sample) => sum + sample.weight, 0);
  const highChromaAreaRatio = round(highChromaWeight / totalWeight, 4);
  const families = hueFamilies(strongSamples);
  const dominantHue = dominantHueFromSamples(strongSamples);
  const hueSpread = routeHueSpread(families.map((family) => family.hue));
  const incompatiblePairs = countIncompatiblePairs(families.map((family) => family.hue));
  const score = scoreRoute(families.length, hueSpread, highChromaAreaRatio, incompatiblePairs, options.thresholds);
  const palette = summarizePalette(samples);
  const analysis: TlxRouteColorAnalysis = {
    route: options.route,
    viewport: options.viewportName,
    score,
    dominantHue,
    strongHueFamilies: families.length,
    hueSpread,
    highChromaAreaRatio,
    palette,
  };

  const issueReasons: string[] = [];
  if (families.length > options.thresholds.maxStrongHueFamilies && incompatiblePairs > 0) {
    issueReasons.push(`${families.length} strong hue families`);
  }
  if (hueSpread > options.thresholds.maxHueSpread && incompatiblePairs > 0) {
    issueReasons.push(`${Math.round(hueSpread)}deg hue spread`);
  }
  if (highChromaAreaRatio > options.thresholds.maxHighChromaAreaRatio && incompatiblePairs > 0) {
    issueReasons.push(`${Math.round(highChromaAreaRatio * 100)}% high-chroma area`);
  }

  if (issueReasons.length === 0) {
    return { analysis };
  }

  const representative = strongestSample(strongSamples) ?? strongestSample(samples);
  return {
    analysis,
    issue: {
      message: `Route palette has weak OKLCH harmony (${issueReasons.join(', ')}). Fix: reduce saturated accent families, align hues to the design-system palette, or use analogous/complementary accents intentionally.`,
      selector: representative?.selector ?? 'document',
      boundingBox: representative?.boundingBox ?? { x: 0, y: 0, width: 0, height: 0 },
      metadata: {
        evidence: 'oklch-route-palette',
        areaLabel: representative?.areaLabel,
        areaSelector: representative?.areaSelector,
        score,
        dominantHue,
        strongHueFamilies: families.length,
        hueSpread,
        highChromaAreaRatio,
        incompatibleHuePairs: incompatiblePairs,
        palette,
        thresholds: options.thresholds,
        fixHint: 'Keep one dominant hue family plus neutral surfaces; add only analogous or complementary accents with controlled chroma.',
      },
    },
  };
}

export function summarizeColorAnalysis(routes: TlxRouteColorAnalysis[], thresholds: TlxColorAnalysisThresholds): TlxColorAnalysis {
  const weighted = routes.flatMap((route) => route.palette.map((entry) => ({ hue: entry.oklch.hue, chroma: entry.oklch.chroma, weight: entry.weight })));
  const dominantHue = dominantHueFromSamples(weighted.filter((sample): sample is { hue: number; chroma: number; weight: number } => sample.hue !== null && sample.chroma >= MIN_STRONG_CHROMA).map((sample) => ({ oklch: { hue: sample.hue, chroma: sample.chroma, lightness: 0 }, weight: sample.weight })));
  const score = routes.length ? round(routes.reduce((sum, route) => sum + route.score, 0) / routes.length, 2) : 100;
  return { enabled: true, score, dominantHue, thresholds, routes };
}

export function createCrossRouteColorIssues(routes: TlxRouteColorAnalysis[], thresholds: TlxColorAnalysisThresholds): Array<{ route: string; viewport: string; message: string; metadata: Record<string, unknown> }> {
  const globalHue = summarizeColorAnalysis(routes, thresholds).dominantHue;
  if (globalHue === null) return [];

  return routes
    .filter((route) => route.dominantHue !== null)
    .filter((route) => {
      const drift = hueDistance(globalHue, route.dominantHue ?? globalHue);
      return drift > thresholds.maxRouteHueDrift && !isCompatibleHuePair(globalHue, route.dominantHue ?? globalHue);
    })
    .map((route) => {
      const drift = hueDistance(globalHue, route.dominantHue ?? globalHue);
      return {
        route: route.route,
        viewport: route.viewport,
        message: `Route palette drifts ${Math.round(drift)}deg from the scan palette in OKLCH hue. Fix: reuse shared color tokens or reserve this route-specific hue for an intentional state/brand variant.`,
        metadata: {
          evidence: 'oklch-cross-route-palette',
          score: route.score,
          dominantHue: route.dominantHue,
          globalDominantHue: globalHue,
          routeHueDrift: drift,
          palette: route.palette,
          thresholds,
          fixHint: 'Align dominant route hue with the global palette or document this route as a deliberate variant.',
        },
      };
    });
}

export function parseCssColor(value: string): [number, number, number] | undefined {
  const trimmed = value.trim().toLowerCase();
  const rgb = trimmed.match(/^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*(\d+(?:\.\d+)?))?/);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    const alpha = rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]);
    if (alpha <= 0) return undefined;
    return [clampRgb(Number.parseFloat(rgb[1])), clampRgb(Number.parseFloat(rgb[2])), clampRgb(Number.parseFloat(rgb[3]))];
  }

  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return undefined;

  const expanded = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  return [Number.parseInt(expanded.slice(0, 2), 16), Number.parseInt(expanded.slice(2, 4), 16), Number.parseInt(expanded.slice(4, 6), 16)];
}

export function rgbToOklch([red, green, blue]: [number, number, number]) {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6309787005 * b);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const c = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.sqrt(a * a + c * c);
  const hue = chroma < 0.0001 ? null : normalizeHue((Math.atan2(c, a) * 180) / Math.PI);

  return { lightness: round(lightness, 4), chroma: round(chroma, 4), hue: hue === null ? null : round(hue, 2) };
}

export function hueDistance(left: number, right: number) {
  const delta = Math.abs(normalizeHue(left) - normalizeHue(right));
  return Math.min(delta, 360 - delta);
}

function collectColorSamples(elements: ScannedElement[]): ColorSample[] {
  const samples: ColorSample[] = [];
  for (const element of elements) {
    const weight = Math.max(1, element.boundingBox.width * element.boundingBox.height);
    const values = element.colorSamples ?? [
      { role: 'text', value: element.color },
      { role: 'background', value: element.backgroundColor },
    ];
    for (const item of values) {
      const parsed = parseCssColor(item.value);
      if (!parsed) continue;
      samples.push({
        selector: element.selector,
        role: item.role,
        color: normalizeColor(parsed),
        oklch: rgbToOklch(parsed),
        weight: item.role === 'text' ? Math.max(1, weight * 0.2) : weight,
        boundingBox: element.boundingBox,
        areaLabel: element.areaLabel,
        areaSelector: element.areaSelector,
      });
    }
  }
  return samples;
}

function summarizePalette(samples: ColorSample[]) {
  const byColor = new Map<string, ColorSample & { count: number }>();
  for (const sample of samples) {
    const current = byColor.get(sample.color);
    if (!current) {
      byColor.set(sample.color, { ...sample, count: 1 });
      continue;
    }
    current.weight += sample.weight;
    current.count += 1;
  }

  return [...byColor.values()]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 8)
    .map((sample) => ({ role: sample.role, color: sample.color, oklch: sample.oklch, weight: round(sample.weight, 2) }));
}

function hueFamilies(samples: ColorSample[]) {
  const families = new Map<number, { hue: number; weight: number }>();
  for (const sample of samples) {
    if (sample.oklch.hue === null) continue;
    const bucket = Math.round(sample.oklch.hue / HUE_FAMILY_SIZE) * HUE_FAMILY_SIZE;
    const hue = normalizeHue(bucket);
    const current = families.get(hue) ?? { hue, weight: 0 };
    current.weight += sample.weight;
    families.set(hue, current);
  }
  return [...families.values()].sort((left, right) => right.weight - left.weight).slice(0, 8);
}

function dominantHueFromSamples(samples: Array<{ oklch: { hue: number | null; chroma: number }; weight: number }>): number | null {
  let x = 0;
  let y = 0;
  for (const sample of samples) {
    if (sample.oklch.hue === null) continue;
    const radians = (sample.oklch.hue * Math.PI) / 180;
    const weight = sample.weight * Math.max(MIN_STRONG_CHROMA, sample.oklch.chroma);
    x += Math.cos(radians) * weight;
    y += Math.sin(radians) * weight;
  }
  if (Math.abs(x) < 0.00001 && Math.abs(y) < 0.00001) return null;
  return round(normalizeHue((Math.atan2(y, x) * 180) / Math.PI), 2);
}

function routeHueSpread(hues: number[]) {
  let spread = 0;
  for (let left = 0; left < hues.length; left += 1) {
    for (let right = left + 1; right < hues.length; right += 1) {
      const leftHue = hues[left];
      const rightHue = hues[right];
      if (leftHue === undefined || rightHue === undefined) continue;
      spread = Math.max(spread, hueDistance(leftHue, rightHue));
    }
  }
  return round(spread, 2);
}

function countIncompatiblePairs(hues: number[]) {
  let count = 0;
  for (let left = 0; left < hues.length; left += 1) {
    for (let right = left + 1; right < hues.length; right += 1) {
      const leftHue = hues[left];
      const rightHue = hues[right];
      if (leftHue === undefined || rightHue === undefined) continue;
      if (!isCompatibleHuePair(leftHue, rightHue)) count += 1;
    }
  }
  return count;
}

function isCompatibleHuePair(left: number, right: number) {
  const distance = hueDistance(left, right);
  return distance <= 45 || (distance >= 150 && distance <= 180);
}

function scoreRoute(strongFamilies: number, hueSpread: number, highChromaAreaRatio: number, incompatiblePairs: number, thresholds: TlxColorAnalysisThresholds) {
  let score = 100;
  score -= Math.max(0, strongFamilies - thresholds.maxStrongHueFamilies) * 12;
  score -= Math.max(0, hueSpread - thresholds.maxHueSpread) * 0.25;
  score -= Math.max(0, highChromaAreaRatio - thresholds.maxHighChromaAreaRatio) * 70;
  score -= incompatiblePairs * 8;
  return round(Math.max(0, Math.min(100, score)), 2);
}

function strongestSample(samples: ColorSample[]) {
  return [...samples].sort((left, right) => right.oklch.chroma * right.weight - left.oklch.chroma * left.weight)[0];
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeColor([red, green, blue]: [number, number, number]) {
  return `rgb(${red}, ${green}, ${blue})`;
}

function clampRgb(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

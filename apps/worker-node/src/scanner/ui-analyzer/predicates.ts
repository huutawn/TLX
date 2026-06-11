import { axisCenter, median } from './geometry';
import type { AnalyzeOptions, ScannedElement } from './types';

export function isLayoutCandidate(element: ScannedElement) {
  if (element.boundingBox.width < 4 || element.boundingBox.height < 4) return false;
  if (element.boundingBox.width > 4000 || element.boundingBox.height > 4000) return false;
  if (element.tagName === 'SVG' && !element.text && Math.max(element.boundingBox.width, element.boundingBox.height) < 24) return false;
  if (isLandmarkContainer(element) && !isInteractiveElement(element) && directText(element).length === 0) return false;
  return true;
}

export function isLandmarkContainer(element: ScannedElement) {
  return ['MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'ASIDE'].includes(element.tagName);
}

export function directText(element: ScannedElement) {
  if (!isLandmarkContainer(element)) return element.text;
  return element.childrenSelectors && element.childrenSelectors.length > 0 ? '' : element.text;
}

export function isInteractiveElement(element: ScannedElement) {
  const tag = element.tagName.toLowerCase();
  const role = element.role?.toLowerCase();
  return tag === 'button' || tag === 'a' || tag === 'input' || tag === 'textarea' || tag === 'select' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab';
}

export function accessibleNameFor(element: ScannedElement) {
  const candidates = [element.accessibleName, element.text, element.ariaLabel, element.associatedLabelText, element.title, element.alt, element.name, element.value, element.placeholder];
  return candidates.find((value) => Boolean(value?.trim()));
}

export function sharesInteractiveAncestor(left: ScannedElement, right: ScannedElement) {
  return Boolean(left.interactiveAncestorSelector && right.interactiveAncestorSelector && left.interactiveAncestorSelector === right.interactiveAncestorSelector);
}

export function isInlineTextLink(element: ScannedElement) {
  return element.tagName === 'A' && element.display === 'inline' && Boolean(element.text) && element.boundingBox.height < 28;
}

export function isHeading(element: ScannedElement) {
  return ['H1', 'H2', 'H3'].includes(element.tagName);
}

export function isLikelyIntentionalEdgeElement(element: ScannedElement, options: AnalyzeOptions) {
  if (element.position === 'fixed' || element.position === 'sticky') return true;
  if (element.tagName === 'FOOTER' || element.areaSelector?.includes('footer')) return true;
  const bottom = element.boundingBox.y + element.boundingBox.height;
  const pageHeight = options.pageMetrics?.scrollHeight ?? options.viewport.height;
  return pageHeight > options.viewport.height * 1.5 && bottom > pageHeight - 220;
}

export function groupedByArea(elements: ScannedElement[]) {
  return [...groupMap(elements, (element) => element.areaSelector ?? element.parentSelector ?? 'document').values()];
}

export function groupMap<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

export function clusterByAxis(elements: ScannedElement[], axis: 'x' | 'y') {
  const clusters: ScannedElement[][] = [];
  const sorted = [...elements].sort((left, right) => axisCenter(left.boundingBox, axis) - axisCenter(right.boundingBox, axis));
  for (const element of sorted) {
    const center = axisCenter(element.boundingBox, axis);
    const cluster = clusters.find((items) => Math.abs(center - median(items.map((item) => axisCenter(item.boundingBox, axis)).sort((left, right) => left - right))) <= 18);
    if (cluster) cluster.push(element);
    else clusters.push([element]);
  }
  return clusters.filter((items) => items.length >= 3);
}

export function normalizeFontFamily(value: string | undefined) {
  if (!value) return undefined;
  const first = value.split(',')[0]?.replace(/["']/g, '').trim().toLowerCase();
  if (!first || ['sans-serif', 'serif', 'monospace', 'system-ui', '-apple-system', 'blinkmacsystemfont'].includes(first)) return undefined;
  return first;
}

export function numericFontWeight(value: string | undefined) {
  if (!value) return 400;
  if (value === 'bold') return 700;
  if (value === 'normal') return 400;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

export function formatPx(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}px`;
}

export function describeElement(element: ScannedElement) {
  const text = element.text ? ` "${element.text.slice(0, 40)}"` : '';
  return `${element.tagName.toLowerCase()}${text}`;
}

export function elementLabel(element: ScannedElement) {
  const text = element.text ? ` "${element.text.slice(0, 40)}"` : '';
  return `${element.tagName.toLowerCase()}${text}`;
}

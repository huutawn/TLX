import type { TlxBoundingBox, TlxScanIssue } from '@tlx/contracts';

export interface ScannedElement {
  selector: string;
  tagName: string;
  text: string;
  boundingBox: TlxBoundingBox;
  color: string;
  backgroundColor: string;
}

export interface AnalyzeOptions {
  route: string;
  url: string;
  viewport: { width: number; height: number };
  contrastRatio: number;
  issuePrefix: string;
}

export interface AnalyzeResult {
  issues: TlxScanIssue[];
  elementsScanned: number;
}

export function analyzeElements(elements: ScannedElement[], options: AnalyzeOptions): AnalyzeResult {
  const issues: TlxScanIssue[] = [];
  const sorted = [...elements].sort((left, right) => left.boundingBox.x - right.boundingBox.x);

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (!current) continue;

    if (isOverflowing(current.boundingBox, options.viewport)) {
      issues.push(createIssue('overflow', issues.length, current, current.boundingBox, options, 'Element overflows the viewport', {
        viewport: options.viewport,
      }));
    }

    const ratio = contrastRatio(current.color, current.backgroundColor);
    if (current.text && ratio > 0 && ratio < options.contrastRatio) {
      issues.push(createIssue('contrast', issues.length, current, current.boundingBox, options, `Contrast ${ratio.toFixed(2)} is below ${options.contrastRatio}`, {
        ratio,
        color: current.color,
        backgroundColor: current.backgroundColor,
      }));
    }

    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const candidate = sorted[nextIndex];
      if (!candidate) continue;
      if (candidate.boundingBox.x >= current.boundingBox.x + current.boundingBox.width) break;

      if (isOverlapping(current.boundingBox, candidate.boundingBox) && !isLikelyParentChildContainment(current.boundingBox, candidate.boundingBox)) {
        issues.push(createIssue('overlap', issues.length, current, unionBox(current.boundingBox, candidate.boundingBox), options, 'Elements overlap in the layout', {
          otherSelector: candidate.selector,
          otherTagName: candidate.tagName,
        }));
      }
    }
  }

  return { issues, elementsScanned: elements.length };
}

export function isOverlapping(left: TlxBoundingBox, right: TlxBoundingBox): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

export function isOverflowing(box: TlxBoundingBox, viewport: { width: number; height: number }) {
  return box.x < 0 || box.y < 0 || box.x + box.width > viewport.width;
}

export function isLikelyParentChildContainment(left: TlxBoundingBox, right: TlxBoundingBox) {
  return (contains(left, right) && area(left) > area(right) * 1.2) || (contains(right, left) && area(right) > area(left) * 1.2);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = parseCssColor(foreground);
  const bg = parseCssColor(background);
  if (!fg || !bg) return 0;

  const foregroundLum = relativeLuminance(fg);
  const backgroundLum = relativeLuminance(bg);
  const lighter = Math.max(foregroundLum, backgroundLum);
  const darker = Math.min(foregroundLum, backgroundLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function createIssue(kind: TlxScanIssue['kind'], index: number, element: ScannedElement, boundingBox: TlxBoundingBox, options: AnalyzeOptions, message: string, metadata: Record<string, unknown>): TlxScanIssue {
  return {
    id: `${options.issuePrefix}-${kind}-${index}`,
    kind,
    severity: kind === 'contrast' ? 'warning' : 'error',
    message,
    route: options.route,
    url: options.url,
    selector: element.selector,
    boundingBox,
    metadata: {
      tagName: element.tagName,
      text: element.text,
      ...metadata,
    },
  };
}

function unionBox(left: TlxBoundingBox, right: TlxBoundingBox): TlxBoundingBox {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.width, right.x + right.width);
  const maxY = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: maxX - x, height: maxY - y };
}

function contains(outer: TlxBoundingBox, inner: TlxBoundingBox) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function area(box: TlxBoundingBox) {
  return box.width * box.height;
}

function parseCssColor(value: string): [number, number, number] | undefined {
  const trimmed = value.trim().toLowerCase();
  const rgb = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    return [Number.parseInt(rgb[1], 10), Number.parseInt(rgb[2], 10), Number.parseInt(rgb[3], 10)];
  }

  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return undefined;

  const expanded = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
  return [Number.parseInt(expanded.slice(0, 2), 16), Number.parseInt(expanded.slice(2, 4), 16), Number.parseInt(expanded.slice(4, 6), 16)];
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

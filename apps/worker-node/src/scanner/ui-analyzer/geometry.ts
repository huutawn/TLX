import type { TlxBoundingBox } from '@tlx/contracts';

export function isOverlapping(left: TlxBoundingBox, right: TlxBoundingBox): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

export function isOverflowing(box: TlxBoundingBox, viewport: { width: number; height: number }) {
  return box.x < -2 || box.x + box.width > viewport.width + 2;
}

export function isLikelyParentChildContainment(left: TlxBoundingBox, right: TlxBoundingBox) {
  return (contains(left, right) && area(left) > area(right) * 1.2) || (contains(right, left) && area(right) > area(left) * 1.2);
}

export function axisStart(box: TlxBoundingBox, axis: 'x' | 'y') {
  return axis === 'x' ? box.x : box.y;
}

export function axisEnd(box: TlxBoundingBox, axis: 'x' | 'y') {
  return axis === 'x' ? box.x + box.width : box.y + box.height;
}

export function axisCenter(box: TlxBoundingBox, axis: 'x' | 'y') {
  return axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2;
}

export function overlapLength(startA: number, sizeA: number, startB: number, sizeB: number) {
  return Math.max(0, Math.min(startA + sizeA, startB + sizeB) - Math.max(startA, startB));
}

export function gapBox(before: TlxBoundingBox, after: TlxBoundingBox, axis: 'x' | 'y'): TlxBoundingBox {
  if (axis === 'x') {
    const x = before.x + before.width;
    const width = Math.max(1, after.x - x);
    const y = Math.max(before.y, after.y);
    const height = Math.max(1, Math.min(before.y + before.height, after.y + after.height) - y);
    return { x, y, width, height };
  }

  const y = before.y + before.height;
  const height = Math.max(1, after.y - y);
  const x = Math.max(before.x, after.x);
  const width = Math.max(1, Math.min(before.x + before.width, after.x + after.width) - x);
  return { x, y, width, height };
}

export function boxDistance(left: TlxBoundingBox, right: TlxBoundingBox) {
  const dx = Math.max(0, right.x - (left.x + left.width), left.x - (right.x + right.width));
  const dy = Math.max(0, right.y - (left.y + left.height), left.y - (right.y + right.height));
  return Math.sqrt(dx * dx + dy * dy);
}

export function gapBetweenBoxes(left: TlxBoundingBox, right: TlxBoundingBox): TlxBoundingBox {
  const horizontalGap = Math.max(0, Math.max(left.x, right.x) - Math.min(left.x + left.width, right.x + right.width));
  const verticalGap = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.height, right.y + right.height));

  if (horizontalGap >= verticalGap) {
    const leftBox = left.x <= right.x ? left : right;
    const rightBox = left.x <= right.x ? right : left;
    const x = leftBox.x + leftBox.width;
    const y = Math.max(leftBox.y, rightBox.y);
    return { x, y, width: Math.max(1, rightBox.x - x), height: Math.max(1, Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height) - y) };
  }

  const topBox = left.y <= right.y ? left : right;
  const bottomBox = left.y <= right.y ? right : left;
  const y = topBox.y + topBox.height;
  const x = Math.max(topBox.x, bottomBox.x);
  return { x, y, width: Math.max(1, Math.min(topBox.x + topBox.width, bottomBox.x + bottomBox.width) - x), height: Math.max(1, bottomBox.y - y) };
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  const current = values[middle] ?? 0;
  if (values.length % 2 === 1) return current;
  return ((values[middle - 1] ?? current) + current) / 2;
}

export function intersectionBox(left: TlxBoundingBox, right: TlxBoundingBox): TlxBoundingBox | undefined {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  const width = maxX - x;
  const height = maxY - y;
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

export function overlapRatio(left: TlxBoundingBox, right: TlxBoundingBox, overlapBox: TlxBoundingBox) {
  return area(overlapBox) / Math.max(1, Math.min(area(left), area(right)));
}

export function overflowAmount(box: TlxBoundingBox, viewport: { width: number }) {
  return Math.max(0, -box.x, box.x + box.width - viewport.width);
}

export function contains(outer: TlxBoundingBox, inner: TlxBoundingBox) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

export function area(box: TlxBoundingBox) {
  return box.width * box.height;
}

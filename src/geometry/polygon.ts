import type { Point } from '@/model/geometry';

/**
 * Signed area of a polygon via the shoelace formula. Positive when
 * vertices are counter-clockwise. We always use the absolute value
 * for display.
 */
export function signedArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(signedArea(points));
}

export function polygonCentroid(points: Point[]): Point | null {
  if (points.length === 0) return null;
  if (points.length < 3) {
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: (sx / points.length) as Point['x'], y: (sy / points.length) as Point['y'] };
  }
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i]!;
    const p1 = points[(i + 1) % points.length]!;
    const f = p0.x * p1.y - p1.x * p0.y;
    cx += (p0.x + p1.x) * f;
    cy += (p0.y + p1.y) * f;
    a += f;
  }
  if (a === 0) return null;
  a *= 0.5;
  return {
    x: (cx / (6 * a)) as Point['x'],
    y: (cy / (6 * a)) as Point['y'],
  };
}

/** Bounding box in world coords. */
export function boundingBox(points: Point[]): { min: Point; max: Point } | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    min: { x: minX as Point['x'], y: minY as Point['y'] },
    max: { x: maxX as Point['x'], y: maxY as Point['y'] },
  };
}

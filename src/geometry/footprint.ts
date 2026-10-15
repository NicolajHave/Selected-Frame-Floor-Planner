import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';

/** A convex outline on the floor, corners in order. */
export type Polygon = Point[];

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

/** True if the two convex polygons overlap by more than `tolerance` mm (separating axis test). */
export function convexOverlap(a: Polygon, b: Polygon, tolerance = 1): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-9) continue;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      const [aMin, aMax] = project(a, nx, ny);
      const [bMin, bMax] = project(b, nx, ny);
      if (aMax - tolerance <= bMin || bMax - tolerance <= aMin) return false;
    }
  }
  return true;
}

function project(poly: Polygon, nx: number, ny: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * nx + p.y * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/** Closest point to `p` on segment ab. */
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return pt(a.x + t * dx, a.y + t * dy);
}

export interface Gap {
  distance: number;
  /** Closest points: `from` on the first outline, `to` on the second. */
  from: Point;
  to: Point;
}

/**
 * Shortest distance between two outlines' edges, with the closest points.
 * For overlapping outlines this is not meaningful — check overlap first.
 */
export function outlineGap(a: Polygon, b: Polygon): Gap {
  let best: Gap = { distance: Infinity, from: a[0]!, to: b[0]! };
  const consider = (from: Point, to: Point) => {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < best.distance) best = { distance: d, from, to };
  };
  for (const [src, dst, flip] of [[a, b, false], [b, a, true]] as const) {
    for (const p of src) {
      for (let i = 0; i < dst.length; i++) {
        const q = closestOnSegment(p, dst[i]!, dst[(i + 1) % dst.length]!);
        if (flip) consider(q, p);
        else consider(p, q);
      }
    }
  }
  return best;
}

/** Gap between an outline and a single segment (e.g. a wall's inner face). */
export function segmentGap(a: Polygon, s0: Point, s1: Point): Gap {
  return outlineGap(a, [s0, s1]);
}

/** Even–odd point in polygon. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Distance along a ray from `origin` in direction (dx, dy) — a unit vector —
 * to the first crossing with any segment, or Infinity.
 */
export function rayHit(origin: Point, dx: number, dy: number, segments: [Point, Point][]): number {
  let best = Infinity;
  for (const [a, b] of segments) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const wx = a.x - origin.x;
    const wy = a.y - origin.y;
    const t = (wx * ey - wy * ex) / denom; // along the ray
    const u = (wx * dy - wy * dx) / denom; // along the segment
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

/** The outline's edges as segments. */
export function edges(poly: Polygon): [Point, Point][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]!] as [Point, Point]);
}

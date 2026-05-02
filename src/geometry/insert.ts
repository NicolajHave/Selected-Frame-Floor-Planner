import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';

interface ClosestEdgeResult {
  edgeIndex: number;     // index of the corner that starts the edge
  point: Point;          // closest point on that edge in world coords
  distance: number;      // mm from the cursor to that point
}

/**
 * Find the edge of a polygon closest to a world-space cursor and the
 * closest point along it. Used for inserting a new corner mid-edge.
 */
export function closestPointOnPolygon(
  vertices: Point[],
  cursor: Point,
  closed: boolean,
): ClosestEdgeResult | null {
  const n = vertices.length;
  if (n < 2) return null;

  let best: ClosestEdgeResult | null = null;
  const last = closed ? n : n - 1;

  for (let i = 0; i < last; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % n]!;
    const proj = closestPointOnSegment(a, b, cursor);
    const d = Math.hypot(proj.x - cursor.x, proj.y - cursor.y);
    if (!best || d < best.distance) {
      best = { edgeIndex: i, point: proj, distance: d };
    }
  }
  return best;
}

function closestPointOnSegment(a: Point, b: Point, p: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return {
    x: (a.x + t * abx) as Mm,
    y: (a.y + t * aby) as Mm,
  };
}

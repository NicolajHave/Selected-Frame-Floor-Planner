import type { Corner } from '@/model/geometry';
import type { Mm } from '@/model/units';

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

/** Lengths of each closing-segment in the order the corners appear. */
export function wallLengths(corners: Corner[], closed: boolean): number[] {
  if (corners.length < 2) return [];
  const lengths: number[] = [];
  const last = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < last; i++) {
    const a = corners[i]!.point;
    const b = corners[(i + 1) % corners.length]!.point;
    lengths.push(distance(a.x, a.y, b.x, b.y));
  }
  return lengths;
}

/** Walls within this angle of each other count as parallel. */
const PARALLEL_TOLERANCE = Math.sin((1 * Math.PI) / 180);

/**
 * Returns corners with wall `index` (from corner `index` to the next) set to
 * `length` mm, keeping its direction and start point.
 *
 * The far end is pushed along the wall, together with the corners after it,
 * up to the next wall that runs parallel to the edited one; that wall
 * absorbs the change. In a rectangle, lengthening the top wall therefore
 * lengthens the bottom wall too, and the room stays rectangular; in an
 * L-shape the matching parallel leg gives way. If no parallel wall exists
 * (e.g. a triangle) only the end corner moves. Open outlines move every
 * corner after the wall.
 */
export function setWallLength(
  corners: Corner[],
  closed: boolean,
  index: number,
  length: number,
): Corner[] {
  const n = corners.length;
  const lastWall = closed ? n - 1 : n - 2;
  if (n < 2 || index < 0 || index > lastWall || !(length > 0)) return corners;

  const a = corners[index]!.point;
  const b = corners[(index + 1) % n]!.point;
  const current = distance(a.x, a.y, b.x, b.y);
  if (current < 1e-6) return corners;
  const ux = (b.x - a.x) / current;
  const uy = (b.y - a.y) / current;
  const dx = ux * (length - current);
  const dy = uy * (length - current);

  const move = new Set<number>();
  if (!closed) {
    for (let j = index + 1; j < n; j++) move.add(j);
  } else {
    let found = false;
    for (let step = 1; step < n; step++) {
      const j = (index + step) % n;
      const k = (j + 1) % n;
      if (k === index) break; // wrapped round to the edited wall: no parallel wall
      move.add(j);
      const p = corners[j]!.point;
      const q = corners[k]!.point;
      const wl = distance(p.x, p.y, q.x, q.y);
      if (wl > 1e-6 && Math.abs(ux * (q.y - p.y) - uy * (q.x - p.x)) / wl < PARALLEL_TOLERANCE) {
        found = true;
        break;
      }
    }
    if (!found) {
      move.clear();
      move.add((index + 1) % n);
    }
  }

  return corners.map((c, j) =>
    move.has(j)
      ? { ...c, point: { x: (c.point.x + dx) as Mm, y: (c.point.y + dy) as Mm } }
      : c,
  );
}

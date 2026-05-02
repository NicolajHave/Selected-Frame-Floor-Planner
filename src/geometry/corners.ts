import type { Corner } from '@/model/geometry';

/**
 * Interior angle at each corner, in degrees, in corner order. Only
 * meaningful for closed polygons. For an open path, the first and
 * last corners report 0.
 */
export function cornerAngles(corners: Corner[], closed: boolean): number[] {
  const n = corners.length;
  if (n < 3) return new Array(n).fill(0);

  const angles: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (isEnd) continue;

    const prev = corners[(i - 1 + n) % n]!.point;
    const curr = corners[i]!.point;
    const next = corners[(i + 1) % n]!.point;

    const ax = prev.x - curr.x;
    const ay = prev.y - curr.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;

    const dot = ax * bx + ay * by;
    const magA = Math.hypot(ax, ay);
    const magB = Math.hypot(bx, by);
    if (magA === 0 || magB === 0) continue;

    let cos = dot / (magA * magB);
    cos = Math.max(-1, Math.min(1, cos));
    angles[i] = (Math.acos(cos) * 180) / Math.PI;
  }
  return angles;
}

import type { Corner } from '@/model/geometry';

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

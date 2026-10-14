import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';

export function snapValue(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapPoint(p: Point, step: number): Point {
  return {
    x: snapValue(p.x, step) as Mm,
    y: snapValue(p.y, step) as Mm,
  };
}

/**
 * The point `length` mm from `from`, heading towards `toward`. With
 * `snapAngle` the heading is rounded to the nearest multiple of 45°, which
 * keeps typed walls square. Without a heading it runs along +x.
 */
export function pointAtDistance(
  from: Point,
  toward: Point | null,
  length: number,
  snapAngle: boolean,
): Point {
  let angle = toward ? Math.atan2(toward.y - from.y, toward.x - from.x) : 0;
  if (snapAngle) angle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: (from.x + Math.cos(angle) * length) as Mm,
    y: (from.y + Math.sin(angle) * length) as Mm,
  };
}

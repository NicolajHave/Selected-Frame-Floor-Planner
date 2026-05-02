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

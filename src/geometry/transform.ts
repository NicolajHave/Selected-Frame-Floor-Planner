import type { Point, Size3D } from '@/model/geometry';
import type { Radians } from '@/model/units';
import type { Mm } from '@/model/units';

/** Rotate a point around an origin. */
export function rotateAround(p: Point, origin: Point, angle: Radians): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: (origin.x + dx * c - dy * s) as Mm,
    y: (origin.y + dx * s + dy * c) as Mm,
  };
}

/** Four corners of a rectangle defined by centre + size + rotation. */
export function rectCorners(
  centre: Point,
  size: Pick<Size3D, 'width' | 'depth'>,
  rotation: Radians,
): [Point, Point, Point, Point] {
  const hw = size.width / 2;
  const hd = size.depth / 2;
  const local: Point[] = [
    { x: -hw as Mm, y: -hd as Mm },
    { x:  hw as Mm, y: -hd as Mm },
    { x:  hw as Mm, y:  hd as Mm },
    { x: -hw as Mm, y:  hd as Mm },
  ];
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return local.map((p) => ({
    x: (centre.x + p.x * c - p.y * s) as Mm,
    y: (centre.y + p.x * s + p.y * c) as Mm,
  })) as [Point, Point, Point, Point];
}

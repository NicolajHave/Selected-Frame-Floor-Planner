import type { Point } from '@/model/geometry';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { wallFrame } from './openings';
import { wallHeightOf, wallStyle } from './wallStyle';

/** A point or direction in the room: x and y on the plan, z up from the floor (mm). */
export type Vec3 = readonly [number, number, number];

export interface WallHit {
  /** Which wall (corner index → next corner). */
  index: number;
  /** Where on the plan: on the wall's inside face. */
  point: Point;
  /** How far above the floor, mm. */
  height: number;
}

/**
 * Where a line of sight meets the inside face of one of the room's walls:
 * the nearest wall facing the viewer, within its length and height. A wall
 * seen from behind does not count (the 3D view cuts it away to look in),
 * nor an open side, which is no wall. Null when the line meets none.
 */
export function wallUnderRay(room: RoomPolygon, origin: Vec3, direction: Vec3): WallHit | null {
  if (!room.closed) return null;
  const inset = room.wallThickness / 2;
  let best: (WallHit & { along: number }) | null = null;
  let nearest = Infinity;
  for (let i = 0; i < room.corners.length; i++) {
    const w = wallFrame(room, i);
    if (!w || wallStyle(room, i).transparent) continue;
    // Towards the wall from the room's side: against its inward normal.
    const approach = direction[0] * w.nx + direction[1] * w.ny;
    if (approach > -1e-9) continue;
    const t = (inset - ((origin[0] - w.a.x) * w.nx + (origin[1] - w.a.y) * w.ny)) / approach;
    if (t <= 0 || t >= nearest) continue;
    const x = origin[0] + direction[0] * t;
    const y = origin[1] + direction[1] * t;
    const height = origin[2] + direction[2] * t;
    const along = (x - w.a.x) * w.ux + (y - w.a.y) * w.uy;
    if (along < 0 || along > w.length || height < 0 || height > wallHeightOf(room, i)) continue;
    nearest = t;
    best = { index: i, point: { x: x as Mm, y: y as Mm }, height, along };
  }
  return best ? { index: best.index, point: best.point, height: best.height } : null;
}

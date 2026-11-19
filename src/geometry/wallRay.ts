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
  /** How far along the wall from its start corner, mm. */
  along: number;
  /** How far above the floor, mm. */
  height: number;
}

/** A place on a wall's inside face: how far along from its start corner, and how far above the floor (mm). */
export interface WallSpot {
  index: number;
  along: number;
  height: number;
}

type Frame = NonNullable<ReturnType<typeof wallFrame>>;

/**
 * Where a line of sight meets the plane of a wall's inside face — beyond the
 * wall's ends, over its top and under the floor too. `facing` says whether
 * it comes at the face from the room's side. Null when the line runs along
 * the wall, or away from it.
 */
function meetFace(room: RoomPolygon, w: Frame, origin: Vec3, direction: Vec3) {
  // Towards the wall from the room's side: against its inward normal.
  const approach = direction[0] * w.nx + direction[1] * w.ny;
  if (Math.abs(approach) < 1e-9) return null;
  const t = (room.wallThickness / 2 - ((origin[0] - w.a.x) * w.nx + (origin[1] - w.a.y) * w.ny)) / approach;
  if (t <= 0) return null;
  const x = origin[0] + direction[0] * t;
  const y = origin[1] + direction[1] * t;
  return {
    t,
    x,
    y,
    along: (x - w.a.x) * w.ux + (y - w.a.y) * w.uy,
    height: origin[2] + direction[2] * t,
    facing: approach < 0,
  };
}

/**
 * Where a line of sight meets the inside face of one of the room's walls:
 * the nearest wall facing the viewer, within its length and height. A wall
 * seen from behind does not count (the 3D view cuts it away to look in),
 * nor an open side, which is no wall. Null when the line meets none.
 */
export function wallUnderRay(room: RoomPolygon, origin: Vec3, direction: Vec3): WallHit | null {
  if (!room.closed) return null;
  let best: WallHit | null = null;
  let nearest = Infinity;
  for (let i = 0; i < room.corners.length; i++) {
    const w = wallFrame(room, i);
    if (!w || wallStyle(room, i).transparent) continue;
    const m = meetFace(room, w, origin, direction);
    if (!m || !m.facing || m.t >= nearest) continue;
    if (m.along < 0 || m.along > w.length || m.height < 0 || m.height > wallHeightOf(room, i)) continue;
    nearest = m.t;
    best = { index: i, point: { x: m.x as Mm, y: m.y as Mm }, along: m.along, height: m.height };
  }
  return best;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Where the pointer's line of sight puts a point on one given wall, whatever
 * else is under the pointer: where the line meets the wall's face, or, past
 * an end, over the top or under the floor, as far that way as the wall
 * reaches. Null when the line never meets the wall's plane.
 */
export function wallSpotOn(room: RoomPolygon, index: number, origin: Vec3, direction: Vec3): WallSpot | null {
  const w = wallFrame(room, index);
  const m = w ? meetFace(room, w, origin, direction) : null;
  if (!w || !m) return null;
  return { index, along: clamp(m.along, 0, w.length), height: clamp(m.height, 0, wallHeightOf(room, index)) };
}

/**
 * Where a point on wall `current` goes when it is dragged, with the
 * pointer's line of sight: onto the wall under the pointer — its own or
 * another — and, with the pointer off every wall (past an end, over the top,
 * down on the floor), as far that way as its own wall reaches. A point on a
 * wall seen from behind (cut away to look in) keeps to that wall: what shows
 * through it is the far side of the shop.
 */
export function wallSpotForDrag(room: RoomPolygon, current: number, origin: Vec3, direction: Vec3): WallSpot | null {
  const w = wallFrame(room, current);
  const own = w ? meetFace(room, w, origin, direction) : null;
  if (!own || own.facing) {
    const hit = wallUnderRay(room, origin, direction);
    if (hit) return { index: hit.index, along: hit.along, height: hit.height };
  }
  return wallSpotOn(room, current, origin, direction);
}

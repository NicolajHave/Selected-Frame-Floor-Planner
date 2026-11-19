import type { Point } from '@/model/geometry';
import type { ElectricalPoint, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { nearestWall, wallFrame } from './openings';

export interface ElectricalAnchor {
  /** Where the point is on the plan: on the wall's inside face, or the floor box. */
  point: Point;
  /** Wall index, or null for floor boxes. */
  index: number | null;
  /** Into-the-room normal of the wall (0, 0 for floor boxes). */
  nx: number;
  ny: number;
}

/** Plan position of an electrical point, or null if its wall is gone. */
export function electricalAnchor(room: RoomPolygon | null, e: ElectricalPoint): ElectricalAnchor | null {
  if (e.position) return { point: e.position, index: null, nx: 0, ny: 0 };
  if (!room || !e.wallStartCornerId) return null;
  const index = room.corners.findIndex((c) => c.id === e.wallStartCornerId);
  const w = wallFrame(room, index);
  if (!w) return null;
  const along = clampToWall(w.length, room.wallThickness, e.offset ?? 0);
  const inset = room.wallThickness / 2;
  return {
    point: {
      x: (w.a.x + w.ux * along + w.nx * inset) as Mm,
      y: (w.a.y + w.uy * along + w.ny * inset) as Mm,
    },
    index,
    nx: w.nx,
    ny: w.ny,
  };
}

/** Keeps a point between the inside faces of the corners. */
export function clampToWall(length: number, thickness: number, along: number): number {
  const end = Math.min(thickness / 2, length / 2);
  return Math.max(end, Math.min(length - end, along));
}

/** Dragged up or down a wall in the 3D view, a point moves in steps of this many mm. */
export const HEIGHT_STEP = 50;

/** The height a wall point takes when it is dragged up or down its wall: in steps, between the floor and the top. */
export function draggedHeight(pointer: number, top: number): number {
  const highest = Math.max(HEIGHT_STEP, Math.floor(top / HEIGHT_STEP) * HEIGHT_STEP);
  return Math.max(HEIGHT_STEP, Math.min(highest, Math.round(pointer / HEIGHT_STEP) * HEIGHT_STEP));
}

/** A drag counts as up-and-down within about 35° of upright on the screen. */
const UPRIGHT = Math.cos((35 * Math.PI) / 180);

/**
 * Which way a drag in the 3D view takes a wall point: along its wall, or up
 * and down it. One or the other, settled by how the drag sets off: a wall
 * seen in perspective runs at a slant, so a point that simply followed the
 * pointer would change height whenever it was moved along. `move` is the
 * pointer's first movement on the screen and `wall` the way the wall runs
 * there (both px). Up and down only when the movement is clearly upright,
 * and more upright than it is along the wall's line — a wall seen nearly
 * end-on runs upright itself, and there the drag goes along.
 */
export function dragAxis(move: readonly [number, number], wall: readonly [number, number]): 'along' | 'height' {
  const m = Math.hypot(move[0], move[1]);
  const w = Math.hypot(wall[0], wall[1]);
  if (!m) return 'along';
  const up = Math.abs(move[1]) / m;
  const along = w ? Math.abs(move[0] * wall[0] + move[1] * wall[1]) / (m * w) : 0;
  return up > UPRIGHT && up > along + 0.02 ? 'height' : 'along';
}

/** Wall anchor (start corner + distance along) for a point near `p`, or null. */
export function wallAnchorAt(
  room: RoomPolygon,
  p: Point,
  reach: number,
): { wallStartCornerId: string; offset: Mm } | null {
  const hit = room.closed ? nearestWall(room, p) : null;
  if (!hit || hit.distance > reach) return null;
  return {
    wallStartCornerId: hit.cornerId,
    offset: Math.round(clampToWall(hit.length, room.wallThickness, hit.along)) as Mm,
  };
}

/**
 * After corners change, keeps wall points where they were: each one moves
 * onto the nearest wall of `after` at its old position.
 */
export function reanchorElectrical(
  points: ElectricalPoint[],
  before: RoomPolygon,
  after: RoomPolygon,
): ElectricalPoint[] {
  return points.flatMap((e) => {
    if (e.position) return [e];
    const a = electricalAnchor(before, e);
    if (!a) return [];
    const hit = nearestWall(after, a.point);
    if (!hit) return [];
    return [{ ...e, wallStartCornerId: hit.cornerId, offset: hit.along as Mm }];
  });
}

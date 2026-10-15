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

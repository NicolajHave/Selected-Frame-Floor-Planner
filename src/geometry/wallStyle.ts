import type { RoomPolygon, WallStyle } from '@/model/objects';
import type { Point } from '@/model/geometry';
import { nearestWall } from './openings';

/** Settings of wall `index` (start corner → next corner). */
export function wallStyle(room: RoomPolygon, index: number): WallStyle {
  const id = room.corners[index]?.id;
  return (id && room.walls?.[id]) || {};
}

/** Height of wall `index`, mm. */
export function wallHeightOf(room: RoomPolygon, index: number): number {
  return wallStyle(room, index).height ?? room.wallHeight;
}

/** Tallest wall of the room, mm. */
export function tallestWall(room: RoomPolygon): number {
  return Math.max(room.wallHeight, ...room.corners.map((_, i) => wallHeightOf(room, i)));
}

/** Height of the wall nearest `p` (e.g. the wall a logo hangs on), mm. */
export function wallHeightNear(room: RoomPolygon, p: Point): number {
  const hit = nearestWall(room, p);
  return hit ? wallHeightOf(room, hit.index) : room.wallHeight;
}

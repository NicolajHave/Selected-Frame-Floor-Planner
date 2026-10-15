import type { Point } from '@/model/geometry';
import type { Opening, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { signedArea } from './polygon';

export interface WallFrame {
  /** Index of the wall (= index of its start corner). */
  index: number;
  a: Point;
  b: Point;
  length: number;
  /** Unit vector along the wall, start → end. */
  ux: number;
  uy: number;
  /** Unit normal pointing into the room. */
  nx: number;
  ny: number;
}

/** Geometry of wall `index` (corner index → next corner), or null if it doesn't exist. */
export function wallFrame(room: RoomPolygon, index: number): WallFrame | null {
  const n = room.corners.length;
  const lastWall = room.closed ? n - 1 : n - 2;
  if (index < 0 || index > lastWall) return null;
  const a = room.corners[index]!.point;
  const b = room.corners[(index + 1) % n]!.point;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-6) return null;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  // Interior is on the (-dy, dx) side for a positive signed area.
  const sign = signedArea(room.corners.map((c) => c.point)) >= 0 ? 1 : -1;
  return { index, a, b, length, ux, uy, nx: -uy * sign, ny: ux * sign };
}

/** Keeps the whole opening on its wall. */
export function clampOffset(wallLength: number, width: number, offset: number): number {
  const half = Math.min(width, wallLength) / 2;
  return Math.max(half, Math.min(wallLength - half, offset));
}

export interface OpeningSpan extends WallFrame {
  /** Offset after clamping to the wall. */
  offset: number;
  /** Opening width, capped at the wall length. */
  width: number;
  center: Point;
  /** Ends of the opening on the wall line: p1 towards the wall start, p2 towards its end. */
  p1: Point;
  p2: Point;
}

/** Where an opening currently sits, or null if its wall no longer exists. */
export function openingSpan(room: RoomPolygon, o: Opening): OpeningSpan | null {
  const index = room.corners.findIndex((c) => c.id === o.wallStartCornerId);
  const w = wallFrame(room, index);
  if (!w) return null;
  const width = Math.min(o.width, w.length);
  const offset = clampOffset(w.length, width, o.offset);
  const at = (d: number): Point => ({ x: (w.a.x + w.ux * d) as Mm, y: (w.a.y + w.uy * d) as Mm });
  return { ...w, offset, width, center: at(offset), p1: at(offset - width / 2), p2: at(offset + width / 2) };
}

export interface WallHit {
  index: number;
  cornerId: string;
  /** Distance from the wall's start corner to the projected point. */
  along: number;
  /** Distance from `p` to the wall line segment. */
  distance: number;
  length: number;
}

/** The wall closest to `p`. */
export function nearestWall(room: RoomPolygon, p: Point): WallHit | null {
  let best: WallHit | null = null;
  const n = room.corners.length;
  const lastWall = room.closed ? n - 1 : n - 2;
  for (let i = 0; i <= lastWall; i++) {
    const w = wallFrame(room, i);
    if (!w) continue;
    const along = Math.max(0, Math.min(w.length, (p.x - w.a.x) * w.ux + (p.y - w.a.y) * w.uy));
    const distance = Math.hypot(p.x - (w.a.x + w.ux * along), p.y - (w.a.y + w.uy * along));
    if (!best || distance < best.distance) {
      best = { index: i, cornerId: room.corners[i]!.id, along, distance, length: w.length };
    }
  }
  return best;
}

/**
 * After a corner is inserted `splitDistance` mm along the wall that starts
 * at `splitCornerId`, openings beyond it move onto the new second half.
 */
export function reanchorAfterInsert(
  openings: Opening[],
  splitCornerId: string,
  newCornerId: string,
  splitDistance: number,
): Opening[] {
  return openings.map((o) =>
    o.wallStartCornerId === splitCornerId && o.offset > splitDistance
      ? { ...o, wallStartCornerId: newCornerId, offset: (o.offset - splitDistance) as Mm }
      : o,
  );
}

/**
 * Re-anchors openings onto the nearest wall of `after`, keeping their
 * centres where they were in `before`. Used when a corner is removed and
 * two walls merge into one.
 */
export function reanchorByPosition(
  before: RoomPolygon,
  after: RoomPolygon,
): Opening[] {
  return before.openings.flatMap((o) => {
    const span = openingSpan(before, o);
    if (!span) return [];
    const hit = nearestWall(after, span.center);
    if (!hit) return [];
    return [{ ...o, wallStartCornerId: hit.cornerId, offset: hit.along as Mm }];
  });
}

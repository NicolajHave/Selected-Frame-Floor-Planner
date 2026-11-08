import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';
import type { RoomPolygon } from '@/model/objects';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { closestOnSegment, edges, pointInPolygon, type Polygon } from '@/geometry/footprint';
import { polygonCentroid } from '@/geometry/polygon';

/** Eye height of a standing visitor, mm. */
export const EYE_HEIGHT_MM = 1650;
/** How close to a wall's centre line the eye may come, beyond half its thickness, mm. */
export const WALL_CLEARANCE_MM = 250;
/** Walking pace, mm per second (and with Shift). */
export const WALK_SPEED_MM = 1400;
export const RUN_SPEED_MM = 3200;
/** How close to a fixture the eye may come, mm. */
export const FIXTURE_CLEARANCE_MM = 150;

export interface WalkPose {
  /** Eye position on the plan, mm. */
  x: number;
  y: number;
  /** Heading on the plan, radians: 0 looks along +x, π/2 along +y. */
  yaw: number;
}

const toward = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);

/**
 * Where a visitor comes in: just inside the first door (or opening),
 * facing into the shop; else the middle of the room, looking along its
 * longer side.
 */
export function walkStart(room: RoomPolygon, obstacles: Polygon[] = []): WalkPose {
  const pts = room.corners.map((c) => c.point);
  const centre = polygonCentroid(pts) ?? pts[0] ?? ({ x: 0, y: 0 } as Point);
  const entrances = [...room.openings].sort((a, b) => rank(a.kind) - rank(b.kind));
  for (const o of entrances) {
    const s = openingSpan(room, o);
    if (!s) continue;
    const inset = room.wallThickness / 2 + 900;
    const p = { x: (s.center.x + s.nx * inset) as Mm, y: (s.center.y + s.ny * inset) as Mm };
    if (allowed(room, p, obstacles)) return { x: p.x, y: p.y, yaw: toward(p, centre) };
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  return { x: centre.x, y: centre.y, yaw: wide ? 0 : Math.PI / 2 };
}

const rank = (kind: string) => (kind === 'door' || kind === 'double-door' ? 0 : kind === 'opening' ? 1 : 2);

/** Whether the eye may be at `p`: inside the room, clear of every wall and fixture. */
export function allowed(room: RoomPolygon, p: Point, obstacles: Polygon[] = []): boolean {
  if (!room.closed || !pointInPolygon(p, room.corners.map((c) => c.point))) return false;
  const min = room.wallThickness / 2 + WALL_CLEARANCE_MM;
  for (let i = 0; i < room.corners.length; i++) {
    const w = wallFrame(room, i);
    if (!w) continue;
    const t = Math.max(0, Math.min(w.length, (p.x - w.a.x) * w.ux + (p.y - w.a.y) * w.uy));
    if (Math.hypot(p.x - (w.a.x + w.ux * t), p.y - (w.a.y + w.uy * t)) < min) return false;
  }
  for (const o of obstacles) {
    if (pointInPolygon(p, o)) return false;
    for (const [a, b] of edges(o)) {
      const c = closestOnSegment(p, a, b);
      if (Math.hypot(p.x - c.x, p.y - c.y) < FIXTURE_CLEARANCE_MM) return false;
    }
  }
  return true;
}

/**
 * One step from `from` by (dx, dy) mm. A step into a wall slides along it
 * (keeping whichever part of the step is free), so walking stays smooth.
 */
export function walkStep(room: RoomPolygon, from: Point, dx: number, dy: number, obstacles: Polygon[] = []): Point {
  const at = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });
  const full = at(from.x + dx, from.y + dy);
  // Standing somewhere blocked (a fixture was moved onto you): step out freely within the room.
  if (!allowed(room, from, obstacles)) return allowed(room, full) || !allowed(room, from) ? full : from;
  if (allowed(room, full, obstacles)) return full;
  const alongX = at(from.x + dx, from.y);
  const alongY = at(from.x, from.y + dy);
  const okX = Math.abs(dx) > 1e-6 && allowed(room, alongX, obstacles);
  const okY = Math.abs(dy) > 1e-6 && allowed(room, alongY, obstacles);
  if (okX && okY) return Math.abs(dx) >= Math.abs(dy) ? alongX : alongY;
  if (okX) return alongX;
  if (okY) return alongY;
  return from;
}

import type { Point } from '@/model/geometry';
import type { RoomPolygon } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';
import { signedArea } from './polygon';

export interface WallSnapResult {
  position: Point;
  rotation: Radians;
  edgeIndex: number;
}

/** How far (mm) beyond touching the wall an item still gets pulled onto it. */
const SNAP_REACH = 500;

/**
 * Places a wall-mounted item flush against the inner face of the nearest
 * wall, with its back (local -depth side) facing the wall.
 *
 * Walls are drawn centred on the polygon edge, so the inner face sits
 * wallThickness / 2 inside the edge. Returns null when the room is not
 * closed or no wall is within reach of `p`.
 */
export function snapToWall(room: RoomPolygon, p: Point, depth: number): WallSnapResult | null {
  if (!room.closed || room.corners.length < 3) return null;

  const pts = room.corners.map((c) => c.point);
  // Interior lies on the (-dy, dx) side of each edge when the signed area
  // is positive, on the opposite side when negative.
  const sign = signedArea(pts) >= 0 ? 1 : -1;
  const halfWall = room.wallThickness / 2;
  const reach = halfWall + depth / 2 + SNAP_REACH;

  let best: { dist: number; result: WallSnapResult } | null = null;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;

    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len)));
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const dist = Math.hypot(p.x - qx, p.y - qy);
    if (dist > reach || (best && dist >= best.dist)) continue;

    const nx = (sign * -dy) / len;
    const ny = (sign * dx) / len;
    const offset = halfWall + depth / 2;

    best = {
      dist,
      result: {
        edgeIndex: i,
        position: { x: (qx + nx * offset) as Mm, y: (qy + ny * offset) as Mm },
        // Local back direction (0, -1) rotated by θ is (sin θ, -cos θ);
        // solve for it pointing along the outward normal (-nx, -ny).
        rotation: normalizeAngle(Math.atan2(-nx, ny)),
      },
    };
  }

  return best?.result ?? null;
}

/** Wrap an angle into [0, 2π). */
export function normalizeAngle(r: number): Radians {
  const full = Math.PI * 2;
  return (((r % full) + full) % full) as Radians;
}

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

export interface WallPush {
  /** Where the item's centre goes. */
  position: Point;
  /** The inner wall faces it now stands against (indices into the outline's edges). */
  faces: number[];
}

/**
 * Pulls a free-standing item flush against the inside of a wall it is
 * near (within `reach` mm) or pushed into, without turning it — so it can
 * stand against the wall without poking through it. In a corner it ends
 * up against both walls. Further out than `reach`, it is left alone.
 * `inner` is the room's inner outline (wall faces).
 */
export function pushToWalls(
  inner: readonly Point[],
  centre: Point,
  size: { width: number; depth: number },
  rotation: number,
  reach: number,
): WallPush {
  const n = inner.length;
  if (n < 3) return { position: centre, faces: [] };
  const sign = signedArea([...inner]) >= 0 ? 1 : -1;
  let c = { x: centre.x as number, y: centre.y as number };
  const faces: number[] = [];
  const corners = () => {
    const hw = size.width / 2;
    const hd = size.depth / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: c.x + x! * cos - y! * sin, y: c.y + x! * sin + y! * cos }));
  };
  // Two rounds: the second catches the other wall in a corner.
  for (let round = 0; round < 2; round++) {
    let best: { i: number; shift: number; nx: number; ny: number } | null = null;
    const pts = corners();
    for (let i = 0; i < n; i++) {
      if (faces.includes(i)) continue;
      const a = inner[i]!;
      const b = inner[(i + 1) % n]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      // Inward normal of this face.
      const nx = -uy * sign;
      const ny = ux * sign;
      // Only walls the item is actually beside (its span overlaps the face).
      const along = pts.map((p) => (p.x - a.x) * ux + (p.y - a.y) * uy);
      if (Math.max(...along) <= 1 || Math.min(...along) >= len - 1) continue;
      // Distance of the item's nearest corner in front of the face (negative: through it).
      const front = Math.min(...pts.map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny));
      const depth = Math.max(...pts.map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny)) - front;
      if (front > reach || front < -depth) continue;
      if (Math.abs(front) < 0.01) {
        faces.push(i);
        continue;
      }
      if (!best || Math.abs(front) < Math.abs(best.shift)) best = { i, shift: -front, nx, ny };
    }
    if (!best) break;
    c = { x: c.x + best.nx * best.shift, y: c.y + best.ny * best.shift };
    faces.push(best.i);
  }
  return { position: { x: c.x as Mm, y: c.y as Mm }, faces };
}

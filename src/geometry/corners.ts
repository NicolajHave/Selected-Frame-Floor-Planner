import type { Corner, Point } from '@/model/geometry';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';

/**
 * Interior angle at each corner, in degrees, in corner order. Only
 * meaningful for closed polygons. For an open path, the first and
 * last corners report 0.
 */
export function cornerAngles(corners: Corner[], closed: boolean): number[] {
  const n = corners.length;
  if (n < 3) return new Array(n).fill(0);

  const angles: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const isEnd = !closed && (i === 0 || i === n - 1);
    if (isEnd) continue;

    const prev = corners[(i - 1 + n) % n]!.point;
    const curr = corners[i]!.point;
    const next = corners[(i + 1) % n]!.point;

    const ax = prev.x - curr.x;
    const ay = prev.y - curr.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;

    const dot = ax * bx + ay * by;
    const magA = Math.hypot(ax, ay);
    const magB = Math.hypot(bx, by);
    if (magA === 0 || magB === 0) continue;

    let cos = dot / (magA * magB);
    cos = Math.max(-1, Math.min(1, cos));
    angles[i] = (Math.acos(cos) * 180) / Math.PI;
  }
  return angles;
}

/**
 * The room scaled evenly — every wall in proportion — so that corner
 * `cornerId` follows `p`, about the corner farthest from it, which stays
 * put. Doors and windows keep their place along their walls (in
 * proportion) and their own size. `room` is the room as it was when the
 * drag started.
 */
export function scaleRoomByCorner(room: RoomPolygon, cornerId: string, p: Point): RoomPolygon {
  const moving = room.corners.find((c) => c.id === cornerId);
  if (!moving || room.corners.length < 2) return room;
  let anchor = room.corners[0]!.point;
  let far = -1;
  for (const c of room.corners) {
    const d = Math.hypot(c.point.x - moving.point.x, c.point.y - moving.point.y);
    if (d > far) {
      far = d;
      anchor = c.point;
    }
  }
  const dx = moving.point.x - anchor.x;
  const dy = moving.point.y - anchor.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return room;
  // How far along the anchor → corner diagonal the pointer is.
  const k = Math.max(0.1, ((p.x - anchor.x) * dx + (p.y - anchor.y) * dy) / len2);
  return {
    ...room,
    corners: room.corners.map((c) => ({
      ...c,
      point: { x: (anchor.x + (c.point.x - anchor.x) * k) as Mm, y: (anchor.y + (c.point.y - anchor.y) * k) as Mm },
    })),
    openings: room.openings.map((o) => ({ ...o, offset: (o.offset * k) as Mm })),
  };
}

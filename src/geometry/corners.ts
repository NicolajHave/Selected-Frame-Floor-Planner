import type { Corner, Point } from '@/model/geometry';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { signedArea } from './polygon';

/** +1 when the room lies to the left of its walls in corner order (as the numbers stand), −1 to the right. */
const roomSide = (corners: Corner[]) => (signedArea(corners.map((c) => c.point)) >= 0 ? 1 : -1);

/**
 * Which side the angle at corner `i` is measured on. A closed room has an
 * inside; an outline that is not closed yet has none, so there it is the
 * side the corner bends to (the angle that is 180° or less).
 */
function angleSide(corners: Corner[], closed: boolean, i: number): 1 | -1 {
  if (closed) return roomSide(corners);
  const n = corners.length;
  const prev = corners[(i - 1 + n) % n]!.point;
  const curr = corners[i]!.point;
  const next = corners[(i + 1) % n]!.point;
  const turn = Math.atan2(prev.y - curr.y, prev.x - curr.x) - Math.atan2(next.y - curr.y, next.x - curr.x);
  return Math.sin(turn) >= 0 ? 1 : -1;
}

/**
 * The angle inside the room at each corner, in degrees, in corner order:
 * 90 in a square corner, 270 where the room turns outwards (the inner
 * corner of an L). In an outline that is not closed yet the two ends
 * report 0, and the others the angle on the side the corner bends to.
 */
export function cornerAngles(corners: Corner[], closed: boolean): number[] {
  const n = corners.length;
  if (n < 3) return new Array(n).fill(0);
  const angles: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const prev = corners[(i - 1 + n) % n]!.point;
    const curr = corners[i]!.point;
    const next = corners[(i + 1) % n]!.point;
    if ((prev.x === curr.x && prev.y === curr.y) || (next.x === curr.x && next.y === curr.y)) continue;
    const toPrev = Math.atan2(prev.y - curr.y, prev.x - curr.x);
    const toNext = Math.atan2(next.y - curr.y, next.x - curr.x);
    const deg = ((angleSide(corners, closed, i) * (toPrev - toNext) * 180) / Math.PI) % 360;
    angles[i] = deg < 0 ? deg + 360 : deg;
  }
  return angles;
}

/**
 * The angle at corner `i` as an arc to draw: the direction it starts in
 * (towards the next corner) and how far round it goes to reach the wall
 * from the previous corner, through the inside of the room (radians, as
 * `Math.atan2` gives them on the plan). Null where there is no angle.
 */
export function cornerArc(corners: Corner[], closed: boolean, i: number): { from: number; by: number } | null {
  const n = corners.length;
  const degrees = cornerAngles(corners, closed)[i] ?? 0;
  if (n < 3 || degrees === 0) return null;
  const curr = corners[i]!.point;
  const next = corners[(i + 1) % n]!.point;
  return {
    from: Math.atan2(next.y - curr.y, next.x - curr.x),
    by: (angleSide(corners, closed, i) * degrees * Math.PI) / 180,
  };
}

/** Which of the two walls at a corner turns: the one leaving it (to the next corner) or the one arriving. */
export type Turn = 'next' | 'prev';

export interface AngleEdit {
  corners: Corner[];
  /** Indices of the corners that moved. */
  moved: number[];
  /**
   * The wall that turned kept its length: because that was asked for, or
   * because the wall beyond it could not follow at this angle.
   */
  keptLength: boolean;
}

/** No wall is left shorter than this by an angle edit (mm). */
const SHORTEST_WALL = 100;

const tidy = (v: number) => (Math.round(v * 1000) / 1000) as Mm;

/**
 * The corners with the angle inside the room at corner `index` set to
 * `degrees`. One of the corner's two walls turns about the corner (`turn`);
 * the other stays where it is.
 *
 * The far end of the wall that turns slides along the wall beyond it, so
 * that wall keeps its direction and every other corner stays put: only
 * those two walls change length. A rectangle given a 100° corner becomes a
 * trapezium, its opposite side still parallel. With `keepLength` — or when
 * the wall beyond cannot follow (it runs parallel to the new direction, or
 * would be left with no length) — the wall keeps its length instead and
 * only swings, and the wall beyond turns with its end.
 *
 * In an outline that is not closed yet, everything past the corner swings
 * round with the wall, as one piece.
 *
 * Null when there is no such corner or angle.
 */
export function setCornerAngle(
  corners: Corner[],
  closed: boolean,
  index: number,
  degrees: number,
  turn: Turn,
  keepLength = false,
): AngleEdit | null {
  const n = corners.length;
  if (n < 3 || !(degrees > 0 && degrees < 360)) return null;
  if (index < 0 || index >= n || (!closed && (index === 0 || index === n - 1))) return null;
  const at = (i: number) => corners[((i % n) + n) % n]!.point;
  const step = turn === 'next' ? 1 : -1;
  const c = at(index);
  const far = at(index + step);
  const fixed = at(index - step);
  const length = Math.hypot(far.x - c.x, far.y - c.y);
  if (length < 1e-6 || Math.hypot(fixed.x - c.x, fixed.y - c.y) < 1e-6) return null;

  // The inside angle runs from the wall that leaves the corner round to the one that arrives.
  const direction = Math.atan2(fixed.y - c.y, fixed.x - c.x) - step * angleSide(corners, closed, index) * ((degrees * Math.PI) / 180);
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);

  if (!closed) {
    const by = direction - Math.atan2(far.y - c.y, far.x - c.x);
    const cos = Math.cos(by);
    const sin = Math.sin(by);
    const moved: number[] = [];
    const next = corners.map((corner, j) => {
      if (step > 0 ? j <= index : j >= index) return corner;
      moved.push(j);
      const x = corner.point.x - c.x;
      const y = corner.point.y - c.y;
      return { ...corner, point: { x: tidy(c.x + x * cos - y * sin), y: tidy(c.y + x * sin + y * cos) } };
    });
    return { corners: next, moved, keptLength: true };
  }

  // Where the new direction meets the line of the wall beyond: c + t·d = beyond + k·e.
  let to: { x: Mm; y: Mm } | null = null;
  if (!keepLength) {
    const beyond = at(index + 2 * step);
    const ex = far.x - beyond.x;
    const ey = far.y - beyond.y;
    const e = Math.hypot(ex, ey);
    const cross = dx * ey - dy * ex;
    if (e > 1e-6 && Math.abs(cross) > 1e-6 * e) {
      const bx = beyond.x - c.x;
      const by = beyond.y - c.y;
      const t = (bx * ey - by * ex) / cross;
      const k = (bx * dy - by * dx) / cross;
      if (t >= SHORTEST_WALL && k * e >= SHORTEST_WALL) to = { x: tidy(c.x + dx * t), y: tidy(c.y + dy * t) };
    }
  }
  const keptLength = !to;
  to ??= { x: tidy(c.x + dx * length), y: tidy(c.y + dy * length) };
  const iFar = (((index + step) % n) + n) % n;
  return {
    corners: corners.map((corner, j) => (j === iFar ? { ...corner, point: to! } : corner)),
    moved: [iFar],
    keptLength,
  };
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

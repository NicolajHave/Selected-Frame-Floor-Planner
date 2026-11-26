import { test, expect } from '@playwright/test';
import { cornerAngles, setCornerAngle } from '@/geometry/corners';
import { wallLengths } from '@/geometry/walls';
import type { Corner } from '@/model/geometry';
import type { Mm } from '@/model/units';

const outline = (pts: [number, number][]): Corner[] => pts.map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } }));
const at = (corners: Corner[], i: number) => [corners[i]!.point.x, corners[i]!.point.y];
const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 1));

// 10 × 7 m, as it is drawn on the plan: wall 1 along the top, wall 2 down the right side.
const rect = outline([[0, 0], [10000, 0], [10000, 7000], [0, 7000]]);
const SIN80 = Math.sin((80 * Math.PI) / 180);
const COS80 = Math.cos((80 * Math.PI) / 180);

test('the angle inside the room: 90 in a square corner, 270 where an L turns outwards', () => {
  near(cornerAngles(rect, true), [90, 90, 90, 90]);
  // The same room drawn the other way round.
  near(cornerAngles([...rect].reverse(), true), [90, 90, 90, 90]);
  const ell = outline([[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 6000], [0, 6000]]);
  near(cornerAngles(ell, true), [90, 90, 90, 270, 90, 90]);
  near(cornerAngles([...ell].reverse(), true), [90, 90, 270, 90, 90, 90]);
  // Not closed yet: the ends have no angle.
  near(cornerAngles(rect, false), [0, 90, 90, 0]);
  near(cornerAngles(outline([[0, 0], [5000, 0], [5000, 5000]]).slice(0, 2), false), [0, 0]);
});

test('a typed angle turns one wall about the corner; its far end follows the wall beyond', () => {
  // Top right corner to 100°, the wall down the right side turning: it swings outwards.
  const edit = setCornerAngle(rect, true, 1, 100, 'next')!;
  expect(edit.moved).toEqual([2]);
  expect(edit.keptLength).toBe(false);
  near(at(edit.corners, 2), [10000 + (7000 / SIN80) * COS80, 7000]);
  // Nothing else moved: the bottom wall is still level, only longer, and the room is a trapezium.
  [0, 1, 3].forEach((i) => expect(edit.corners[i]).toBe(rect[i]));
  near(cornerAngles(edit.corners, true), [90, 100, 80, 90]);
  near(wallLengths(edit.corners, true), [10000, 7000 / SIN80, 10000 + (7000 / SIN80) * COS80, 7000]);

  // The other wall of the same corner: the top wall turns, and its far end follows the left wall.
  const other = setCornerAngle(rect, true, 1, 100, 'prev')!;
  expect(other.moved).toEqual([0]);
  near(at(other.corners, 0), [0, -(10000 / SIN80) * COS80]);
  near(cornerAngles(other.corners, true), [80, 100, 90, 90]);

  // Closing the corner instead: the wall swings into the room.
  const closing = setCornerAngle(rect, true, 1, 80, 'next')!;
  near(at(closing.corners, 2), [10000 - (7000 / SIN80) * COS80, 7000]);
  near(cornerAngles(closing.corners, true), [90, 80, 100, 90]);
});

test('whichever way round the room was drawn, the angle is the one inside it', () => {
  const back = [...rect].reverse(); // c3, c2, c1, c0: the top right corner is now index 2
  const edit = setCornerAngle(back, true, 2, 100, 'prev')!; // the wall arriving from c2: the right side
  expect(edit.moved).toEqual([1]);
  near(at(edit.corners, 1), [10000 + (7000 / SIN80) * COS80, 7000]);
  near(cornerAngles(edit.corners, true), [90, 80, 100, 90]);
});

test('asked to, the wall keeps its length and the wall beyond turns with its end', () => {
  const edit = setCornerAngle(rect, true, 1, 100, 'next', true)!;
  expect(edit.keptLength).toBe(true);
  near(at(edit.corners, 2), [10000 + 7000 * COS80, 7000 * SIN80]);
  near(wallLengths(edit.corners, true).slice(0, 2), [10000, 7000]);
  near([cornerAngles(edit.corners, true)[1]!], [100]);
});

test('where the wall beyond cannot follow, the wall keeps its length instead', () => {
  // Straight on from the top wall: it never meets the bottom wall's line.
  const flat = setCornerAngle(rect, true, 1, 180, 'next')!;
  expect(flat.keptLength).toBe(true);
  near(at(flat.corners, 2), [17000, 0]);
  // Turned past it: the line of the bottom wall is behind.
  const past = setCornerAngle(rect, true, 1, 200, 'next')!;
  expect(past.keptLength).toBe(true);
  near([cornerAngles(past.corners, true)[1]!], [200]);
  near([wallLengths(past.corners, true)[1]!], [7000]);
  // So sharp that the wall beyond would be left with nothing.
  const sharp = setCornerAngle(rect, true, 1, 30, 'next')!;
  expect(sharp.keptLength).toBe(true);
  near([cornerAngles(sharp.corners, true)[1]!], [30]);
});

test('the inner corner of an L, and a triangle', () => {
  const ell = outline([[0, 0], [6000, 0], [6000, 3000], [3000, 3000], [3000, 6000], [0, 6000]]);
  const edit = setCornerAngle(ell, true, 3, 260, 'next')!;
  expect(edit.moved).toEqual([4]);
  near([cornerAngles(edit.corners, true)[3]!], [260]);
  // Its far end is still on the bottom wall's line.
  expect(edit.corners[4]!.point.y).toBeCloseTo(6000, 1);

  const tri = outline([[0, 0], [6000, 0], [0, 6000]]);
  const t = setCornerAngle(tri, true, 0, 60, 'next')!;
  near([cornerAngles(t.corners, true)[0]!], [60]);
  // The far end slid along the third side: that side still runs at 45°.
  const end = t.corners[1]!.point;
  expect(end.x + end.y).toBeCloseTo(6000, 1);
});

test('an outline that is not closed: everything past the corner swings round as one piece', () => {
  const open = outline([[0, 0], [4000, 0], [4000, 3000], [7000, 3000]]);
  const before = wallLengths(open, false);
  const edit = setCornerAngle(open, false, 1, 135, 'next')!;
  expect(edit.moved).toEqual([2, 3]);
  near(wallLengths(edit.corners, false), before);
  near(cornerAngles(edit.corners, false), [0, 135, cornerAngles(open, false)[2]!, 0]);
  expect(edit.corners[0]).toBe(open[0]);
  // The ends have no angle to set.
  expect(setCornerAngle(open, false, 0, 90, 'next')).toBeNull();
  expect(setCornerAngle(open, false, 3, 90, 'prev')).toBeNull();
});

test('no such angle, no such corner: nothing happens', () => {
  expect(setCornerAngle(rect, true, 1, 0, 'next')).toBeNull();
  expect(setCornerAngle(rect, true, 1, 360, 'next')).toBeNull();
  expect(setCornerAngle(rect, true, 1, Number.NaN, 'next')).toBeNull();
  expect(setCornerAngle(rect, true, 7, 90, 'next')).toBeNull();
  expect(setCornerAngle(rect.slice(0, 2), true, 0, 90, 'next')).toBeNull();
});

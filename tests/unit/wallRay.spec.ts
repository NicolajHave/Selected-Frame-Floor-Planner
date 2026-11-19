import { test, expect } from '@playwright/test';
import { wallSpotForDrag, wallSpotOn, wallUnderRay } from '@/geometry/wallRay';
import { dragAxis, draggedHeight } from '@/geometry/electrical';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';

// 10 × 7 m, walls 120 thick and 2.7 m high; wall 1 runs along the top (y = 0), wall 2 down the right side.
const room: RoomPolygon = {
  id: 'r',
  closed: true,
  wallThickness: 120 as Mm,
  wallHeight: 2700 as Mm,
  corners: [[0, 0], [10000, 0], [10000, 7000], [0, 7000]].map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
  openings: [],
};

test('a line of sight meets the inside face of the wall it looks at', () => {
  // From the middle of the room, straight at wall 1, 1.5 m up.
  expect(wallUnderRay(room, [5000, 3500, 1500], [0, -1, 0])).toEqual({ index: 0, point: { x: 5000, y: 60 }, along: 5000, height: 1500 });
  // Looking down at it from above: where the line reaches the face.
  const down = wallUnderRay(room, [5000, 3500, 4000], [0, -1, -0.5])!;
  expect(down.index).toBe(0);
  expect(down.height).toBeCloseTo(4000 - 3440 * 0.5);
  // At an angle, the first wall the line reaches: wall 1 here, not wall 4 further on.
  expect(wallUnderRay(room, [5000, 3500, 1000], [-1, -1, 0])).toMatchObject({ index: 0, point: { x: 1560, y: 60 } });
  expect(wallUnderRay(room, [5000, 3500, 1000], [-1, -0.2, 0])).toMatchObject({ index: 3, point: { x: 60 } });
});

test('over a wall, past its end, or at an open side there is nothing to meet', () => {
  // Rising over the top of the wall.
  expect(wallUnderRay(room, [5000, 3500, 1500], [0, -1, 0.5])).toBeNull();
  // Into the floor before the wall.
  expect(wallUnderRay(room, [5000, 3500, 1500], [0, -1, -1])).toBeNull();
  // Straight up.
  expect(wallUnderRay(room, [5000, 3500, 1500], [0, 0, 1])).toBeNull();
  // An open side is no wall.
  const open: RoomPolygon = { ...room, walls: { c0: { transparent: true } } };
  expect(wallUnderRay(open, [5000, 3500, 1500], [0, -1, 0])).toBeNull();
  expect(wallUnderRay({ ...room, closed: false }, [5000, 3500, 1500], [0, -1, 0])).toBeNull();
});

test('a wall seen from behind is looked through, as the 3D view cuts it away', () => {
  // From outside, beyond wall 1, looking into the shop: the line meets wall 3 on the far side.
  expect(wallUnderRay(room, [5000, -3000, 1500], [0, 1, 0])).toEqual({ index: 2, point: { x: 5000, y: 6940 }, along: 5000, height: 1500 });
  // From above and outside, the way the overview looks in.
  const hit = wallUnderRay(room, [14000, 12000, 9000], [-0.6, -0.75, -0.45])!;
  expect([0, 3]).toContain(hit.index);
  expect(hit.height).toBeGreaterThan(0);
  expect(hit.height).toBeLessThan(2700);
});

test('a dragged wall point follows the pointer over its wall and on to the next', () => {
  const eye = [5000, 3500, 1500] as const;
  // On its own wall: where the pointer is.
  expect(wallSpotForDrag(room, 0, eye, [0.5, -1, 0])).toMatchObject({ index: 0, height: 1500 });
  expect(wallSpotForDrag(room, 0, eye, [0.5, -1, 0])!.along).toBeCloseTo(5000 + 3440 * 0.5);
  // The pointer goes round the corner: so does the point.
  const round = wallSpotForDrag(room, 0, eye, [1, -0.2, 0])!;
  expect(round.index).toBe(1);
  expect(round.along).toBeCloseTo(3500 - 4940 * 0.2);
});

test('with the pointer off every wall, a dragged point goes as far that way as its wall reaches', () => {
  const eye = [5000, 3500, 1500] as const;
  // Over the top of the wall: at the top.
  expect(wallSpotForDrag(room, 0, eye, [0, -1, 0.5])).toEqual({ index: 0, along: 5000, height: 2700 });
  // Down on the floor in front of it: at the floor.
  expect(wallSpotForDrag(room, 0, eye, [0, -1, -1])).toEqual({ index: 0, along: 5000, height: 0 });
  // Past the end of the wall where the next side is open: at the end.
  const open: RoomPolygon = { ...room, walls: { c1: { transparent: true } } };
  expect(wallSpotForDrag(open, 0, eye, [1, -0.2, 0])).toMatchObject({ index: 0, along: 10000 });
  // Looking away from the wall altogether, at nothing: it stays put.
  expect(wallSpotForDrag(open, 0, eye, [1, 0.01, 0])).toBeNull();
});

test('a point on a wall cut away to look in keeps to that wall', () => {
  // From outside, beyond wall 1, looking through it into the shop: wall 3 shows behind, but the point stays on wall 1.
  expect(wallSpotForDrag(room, 0, [3000, -3000, 1500], [0.1, 1, -0.1])).toMatchObject({ index: 0 });
  const spot = wallSpotForDrag(room, 0, [3000, -3000, 1500], [0.1, 1, -0.1])!;
  expect(spot.along).toBeCloseTo(3000 + 3060 * 0.1);
  expect(spot.height).toBeCloseTo(1500 - 3060 * 0.1);
  // A point on a wall that faces the viewer goes where the pointer is, here wall 3.
  expect(wallSpotForDrag(room, 2, [3000, -3000, 1500], [0.1, 1, -0.1])).toMatchObject({ index: 2 });
});

test('dragged up or down, a point stays on its own wall whatever else is under the pointer', () => {
  const eye = [5000, 3500, 1500] as const;
  // The pointer has strayed over the next wall: the height is still read off the point's own.
  expect(wallSpotOn(room, 0, eye, [1, -0.2, 0.1])).toMatchObject({ index: 0, along: 10000 });
  expect(wallSpotOn(room, 0, eye, [0, -1, 0.2])!.height).toBeCloseTo(1500 + 3440 * 0.2);
  expect(wallSpotOn(room, 0, eye, [0, -1, 0.5])).toEqual({ index: 0, along: 5000, height: 2700 });
  expect(wallSpotOn(room, 0, eye, [1, 0, 0])).toBeNull();
});

test('a drag goes along the wall or up and down it, by how it sets off', () => {
  // A wall running level across the screen.
  expect(dragAxis([6, 0], [100, 0])).toBe('along');
  expect(dragAxis([-5, 3], [100, 0])).toBe('along');
  expect(dragAxis([0, -6], [100, 0])).toBe('height');
  expect(dragAxis([2, 6], [100, 0])).toBe('height');
  // Halfway between is along: the height does not change by accident.
  expect(dragAxis([4, 4], [100, 0])).toBe('along');
  // A wall receding steeply up the screen: following its line is along, upright is up.
  expect(dragAxis([3, -5], [50, -90])).toBe('along');
  expect(dragAxis([0, -6], [50, -50])).toBe('height');
  // A wall seen end-on runs upright itself: along wins.
  expect(dragAxis([0, -6], [2, -90])).toBe('along');
  expect(dragAxis([0, 0], [100, 0])).toBe('along');
});

test('up and down, a point moves in steps between the floor and the top of the wall', () => {
  expect(draggedHeight(1118, 2700)).toBe(1100);
  expect(draggedHeight(324, 2700)).toBe(300);
  expect(draggedHeight(326, 2700)).toBe(350);
  expect(draggedHeight(-400, 2700)).toBe(50);
  expect(draggedHeight(5000, 2720)).toBe(2700);
});

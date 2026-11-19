import { test, expect } from '@playwright/test';
import { wallUnderRay } from '@/geometry/wallRay';
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
  expect(wallUnderRay(room, [5000, 3500, 1500], [0, -1, 0])).toEqual({ index: 0, point: { x: 5000, y: 60 }, height: 1500 });
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
  expect(wallUnderRay(room, [5000, -3000, 1500], [0, 1, 0])).toEqual({ index: 2, point: { x: 5000, y: 6940 }, height: 1500 });
  // From above and outside, the way the overview looks in.
  const hit = wallUnderRay(room, [14000, 12000, 9000], [-0.6, -0.75, -0.45])!;
  expect([0, 3]).toContain(hit.index);
  expect(hit.height).toBeGreaterThan(0);
  expect(hit.height).toBeLessThan(2700);
});

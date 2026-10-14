import { test, expect } from '@playwright/test';
import { snapToWall, normalizeAngle } from '@/geometry/wallSnap';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';

const deg = (r: number) => Math.round((r * 180) / Math.PI);

/** 10 m × 7 m room, corners listed clockwise on screen (y down). */
function rect(reverse = false): RoomPolygon {
  const pts = [[0, 0], [10000, 0], [10000, 7000], [0, 7000]];
  if (reverse) pts.reverse();
  return {
    id: 'room',
    closed: true,
    wallThickness: 120 as Mm,
    wallHeight: 2700 as Mm,
    corners: pts.map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
  };
}

for (const reverse of [false, true]) {
  test.describe(`snapToWall (${reverse ? 'counter-clockwise' : 'clockwise'} corners)`, () => {
    const room = rect(reverse);

    test('top wall: flush to the inner face, back to the wall', () => {
      const hit = snapToWall(room, { x: 5000 as Mm, y: 300 as Mm }, 500)!;
      expect(hit.position.x).toBeCloseTo(5000);
      expect(hit.position.y).toBeCloseTo(60 + 250);
      expect(deg(hit.rotation)).toBe(0);
    });

    test('each wall gets the rotation that turns the back towards it', () => {
      expect(deg(snapToWall(room, { x: 9800 as Mm, y: 3500 as Mm }, 400)!.rotation)).toBe(90);
      expect(deg(snapToWall(room, { x: 5000 as Mm, y: 6800 as Mm }, 400)!.rotation)).toBe(180);
      expect(deg(snapToWall(room, { x: 200 as Mm, y: 3500 as Mm }, 400)!.rotation)).toBe(270);
    });

    test('nothing within reach: no snap', () => {
      expect(snapToWall(room, { x: 5000 as Mm, y: 3500 as Mm }, 400)).toBeNull();
    });
  });
}

test('open rooms never snap', () => {
  expect(snapToWall({ ...rect(), closed: false }, { x: 5000 as Mm, y: 100 as Mm }, 400)).toBeNull();
});

test('normalizeAngle wraps into [0, 2π)', () => {
  expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
  expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
  expect(normalizeAngle(5 * Math.PI)).toBeCloseTo(Math.PI);
});

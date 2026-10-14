import { test, expect } from '@playwright/test';
import {
  clampOffset,
  nearestWall,
  openingSpan,
  reanchorAfterInsert,
  reanchorByPosition,
  wallFrame,
} from '@/geometry/openings';
import type { Opening, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';

function room(pts: number[][], openings: Opening[] = []): RoomPolygon {
  return {
    id: 'r',
    closed: true,
    wallThickness: 120 as Mm,
    wallHeight: 2700 as Mm,
    corners: pts.map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
    openings,
  };
}

function door(wallStartCornerId: string, offset: number, width = 900): Opening {
  return {
    id: 'd',
    kind: 'door',
    wallStartCornerId,
    offset: offset as Mm,
    width: width as Mm,
    height: 2100 as Mm,
    sillHeight: 0 as Mm,
    hinge: 'start',
    swing: 'in',
  };
}

const rect = room([[0, 0], [10000, 0], [10000, 7000], [0, 7000]]);

test('wallFrame: direction and inward normal for either winding', () => {
  const w = wallFrame(rect, 0)!;
  expect([w.ux, w.uy, w.nx, w.ny].map((v) => Math.round(v) + 0)).toEqual([1, 0, 0, 1]);
  const ccw = room([[0, 0], [0, 7000], [10000, 7000], [10000, 0]]);
  const w2 = wallFrame(ccw, 0)!; // left wall, going down
  expect([w2.nx, w2.ny].map((v) => Math.round(v) + 0)).toEqual([1, 0]);
});

test('openingSpan: centre and ends on the wall, clamped inside it', () => {
  const s = openingSpan(rect, door('c0', 3000))!;
  expect(s.center).toEqual({ x: 3000, y: 0 });
  expect([s.p1.x, s.p2.x]).toEqual([2550, 3450]);
  // Past the end of the wall: pulled back so the whole door fits.
  expect(openingSpan(rect, door('c0', 9900))!.offset).toBe(9550);
  expect(openingSpan(rect, door('gone', 1000))).toBeNull();
});

test('clampOffset keeps an opening wider than the wall centred', () => {
  expect(clampOffset(800, 900, 0)).toBe(400);
  expect(clampOffset(800, 900, 800)).toBe(400);
});

test('nearestWall projects onto the closest wall', () => {
  const hit = nearestWall(rect, { x: 9800 as Mm, y: 2500 as Mm })!;
  expect(hit.cornerId).toBe('c1');
  expect(hit.along).toBeCloseTo(2500);
  expect(hit.distance).toBeCloseTo(200);
});

test('inserting a corner moves later openings onto the new wall half', () => {
  const ops = [door('c0', 2000), { ...door('c0', 7000), id: 'e' }];
  const out = reanchorAfterInsert(ops, 'c0', 'new', 5000);
  expect(out[0]).toMatchObject({ wallStartCornerId: 'c0', offset: 2000 });
  expect(out[1]).toMatchObject({ wallStartCornerId: 'new', offset: 2000 });
});

test('removing a corner keeps openings where they were', () => {
  // Top wall split at x = 5000 by c1; the door sits on the second half.
  const before = room([[0, 0], [5000, 0], [10000, 0], [10000, 7000], [0, 7000]], [door('c1', 2000)]);
  const after = { ...before, corners: before.corners.filter((c) => c.id !== 'c1') };
  const [moved] = reanchorByPosition(before, after);
  expect(moved).toMatchObject({ wallStartCornerId: 'c0', offset: 7000 });
});

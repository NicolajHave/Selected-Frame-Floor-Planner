import { test, expect } from '@playwright/test';
import { scaleRoomByCorner } from '@/geometry/corners';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';

const room: RoomPolygon = {
  id: 'r',
  closed: true,
  wallThickness: 120 as Mm,
  wallHeight: 2700 as Mm,
  corners: [[0, 0], [10000, 0], [10000, 6000], [0, 6000]].map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
  openings: [{ id: 'd', kind: 'door', wallStartCornerId: 'c0', offset: 5000 as Mm, width: 900 as Mm, height: 2100 as Mm, sillHeight: 0 as Mm, hinge: 'start', swing: 'in' }],
};

test('dragging the far corner out scales every wall in proportion about the opposite corner', () => {
  // c2 (10000, 6000) dragged to (12000, 7200): 120 %.
  const r = scaleRoomByCorner(room, 'c2', { x: 12000 as Mm, y: 7200 as Mm });
  expect(r.corners.map((c) => [c.point.x, c.point.y])).toEqual([[0, 0], [12000, 0], [12000, 7200], [0, 7200]]);
  // The door stays in the middle of its wall, at its own width.
  expect(r.openings[0]!.offset).toBe(6000);
  expect(r.openings[0]!.width).toBe(900);
});

test('the pointer off the diagonal still scales evenly (by its reach along it)', () => {
  const r = scaleRoomByCorner(room, 'c2', { x: 5000 as Mm, y: 3000 as Mm });
  const w = r.corners[1]!.point.x - r.corners[0]!.point.x;
  const h = r.corners[3]!.point.y - r.corners[0]!.point.y;
  expect(w / h).toBeCloseTo(10000 / 6000, 6);
  expect(w).toBeCloseTo(5000, 6);
});

test('it never collapses below a tenth', () => {
  const r = scaleRoomByCorner(room, 'c2', { x: -5000 as Mm, y: -5000 as Mm });
  expect(r.corners[2]!.point.x).toBeCloseTo(1000, 6);
});

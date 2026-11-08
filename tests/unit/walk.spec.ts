import { test, expect } from '@playwright/test';
import { allowed, walkStart, walkStep, WALL_CLEARANCE_MM } from '@/lib/walk';
import type { Opening, RoomPolygon } from '@/model/objects';
import type { Point } from '@/model/geometry';
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

const door = (wallStartCornerId: string, offset: number): Opening => ({
  id: 'd',
  kind: 'door',
  wallStartCornerId,
  offset: offset as Mm,
  width: 900 as Mm,
  height: 2100 as Mm,
  sillHeight: 0 as Mm,
  hinge: 'start',
  swing: 'in',
});

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm }) as Point;
const RECT = [[0, 0], [10000, 0], [10000, 6000], [0, 6000]];
const box = (x0: number, y0: number, x1: number, y1: number) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

test('starts just inside the door, facing into the shop', () => {
  // Door in the bottom wall (corner 2 → 3 runs from x 10000 to 0 at y 6000), 3 m from its start.
  const r = room(RECT, [door('c2', 3000)]);
  const s = walkStart(r);
  expect(s.x).toBeCloseTo(7000, 0);
  expect(s.y).toBeCloseTo(6000 - 60 - 900, 0);
  // Looking up the plan towards the middle (5000, 3000).
  expect(Math.sin(s.yaw)).toBeLessThan(-0.5);
});

test('without a door it starts in the middle, looking along the long side', () => {
  const s = walkStart(room(RECT));
  expect(s).toMatchObject({ x: 5000, y: 3000, yaw: 0 });
  expect(walkStart(room([[0, 0], [4000, 0], [4000, 9000], [0, 9000]])).yaw).toBeCloseTo(Math.PI / 2);
});

test('walls and fixtures keep you at a distance; outside the room is off limits', () => {
  const r = room(RECT);
  const edge = 60 + WALL_CLEARANCE_MM;
  expect(allowed(r, P(edge + 5, 3000))).toBe(true);
  expect(allowed(r, P(edge - 5, 3000))).toBe(false);
  expect(allowed(r, P(-500, 3000))).toBe(false);
  const rack = box(4000, 2000, 6000, 2500);
  expect(allowed(r, P(5000, 2200), [rack])).toBe(false);
  expect(allowed(r, P(5000, 2600), [rack])).toBe(false); // 100 mm off its edge
  expect(allowed(r, P(5000, 2700), [rack])).toBe(true);
});

test('a step into a wall slides along it instead of stopping', () => {
  const r = room(RECT);
  const from = P(9600, 3000);
  // Diagonally into the right-hand wall: x is blocked, y keeps going.
  const to = walkStep(r, from, 400, 300);
  expect(to.x).toBe(9600);
  expect(to.y).toBe(3300);
  // Straight into it: stay put.
  expect(walkStep(r, from, 400, 0)).toEqual(from);
});

test('standing inside a fixture (it was moved onto you) lets you step out', () => {
  const r = room(RECT);
  const rack = box(4000, 2000, 6000, 2500);
  const to = walkStep(r, P(5000, 2250), 0, 500, [rack]);
  expect(to.y).toBe(2750);
});

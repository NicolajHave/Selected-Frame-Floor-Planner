import { test, expect } from '@playwright/test';
import { pushToWalls } from '@/geometry/wallSnap';
import type { Mm } from '@/model/units';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });
// Inner faces of a 10 × 6 m room.
const inner = [P(0, 0), P(10000, 0), P(10000, 6000), P(0, 6000)];
const rack = { width: 1310, depth: 500 };

test('near a wall: flush against it, not turned', () => {
  // Back edge 120 mm from the top wall.
  const r = pushToWalls(inner, P(5000, 370), rack, 0, 200);
  expect(r.position).toEqual(P(5000, 250));
  expect(r.faces).toHaveLength(1);
});

test('pushed into a wall: back out, flush', () => {
  const r = pushToWalls(inner, P(5000, 100), rack, 0, 200);
  expect(r.position.y).toBe(250);
});

test('into a corner: against both walls', () => {
  const r = pushToWalls(inner, P(9400, 5700), rack, 0, 200);
  expect(r.position).toEqual(P(10000 - 655, 6000 - 250));
  expect(r.faces).toHaveLength(2);
});

test('further out than the reach: left where it is', () => {
  const r = pushToWalls(inner, P(5000, 700), rack, 0, 200);
  expect(r.position).toEqual(P(5000, 700));
  expect(r.faces).toEqual([]);
});

test('turned a quarter: its short side goes to the wall', () => {
  const r = pushToWalls(inner, P(400, 3000), rack, Math.PI / 2, 200);
  expect(r.position.x).toBeCloseTo(250, 6);
});

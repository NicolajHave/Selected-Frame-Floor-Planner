import { test, expect } from '@playwright/test';
import { setWallLength, wallLengths } from '@/geometry/walls';
import type { Corner } from '@/model/geometry';
import type { Mm } from '@/model/units';

const outline = (pts: number[][]): Corner[] =>
  pts.map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } }));
const xy = (cs: Corner[]) => cs.map((c) => [Math.round(c.point.x), Math.round(c.point.y)]);

const rect = outline([[0, 0], [10000, 0], [10000, 7000], [0, 7000]]);

test('rectangle: lengthening the top wall keeps it rectangular', () => {
  const out = setWallLength(rect, true, 0, 12000);
  expect(xy(out)).toEqual([[0, 0], [12000, 0], [12000, 7000], [0, 7000]]);
});

test('rectangle: the closing wall works too', () => {
  // wall 3 runs from (0,7000) up to (0,0)
  const out = setWallLength(rect, true, 3, 8000);
  expect(wallLengths(out, true).map(Math.round)).toEqual([10000, 8000, 10000, 8000]);
  expect(xy(out)[3]).toEqual([0, 7000]); // start corner of the edited wall stays
});

test('rectangle: shortening works and only the edited pair changes', () => {
  const out = setWallLength(rect, true, 1, 5000);
  expect(wallLengths(out, true).map(Math.round)).toEqual([10000, 5000, 10000, 5000]);
});

test('L-shape: the matching parallel leg absorbs the change', () => {
  const l = outline([[0, 0], [10000, 0], [10000, 4000], [5000, 4000], [5000, 8000], [0, 8000]]);
  const out = setWallLength(l, true, 0, 12000);
  expect(xy(out)).toEqual([[0, 0], [12000, 0], [12000, 4000], [5000, 4000], [5000, 8000], [0, 8000]]);
  expect(wallLengths(out, true).map(Math.round)).toEqual([12000, 4000, 7000, 4000, 5000, 8000]);
});

test('triangle: no parallel wall, only the end corner moves along the wall', () => {
  const tri = outline([[0, 0], [6000, 0], [3000, 4000]]);
  const out = setWallLength(tri, true, 0, 8000);
  expect(xy(out)).toEqual([[0, 0], [8000, 0], [3000, 4000]]);
});

test('open outline: every later corner moves with the wall end', () => {
  const open = outline([[0, 0], [4000, 0], [4000, 3000]]);
  const out = setWallLength(open, false, 0, 5000);
  expect(xy(out)).toEqual([[0, 0], [5000, 0], [5000, 3000]]);
});

test('invalid input leaves the outline untouched', () => {
  expect(setWallLength(rect, true, 0, 0)).toBe(rect);
  expect(setWallLength(rect, true, 9, 1000)).toBe(rect);
  expect(setWallLength(rect, false, 3, 1000)).toBe(rect); // no closing wall when open
});

import { test, expect } from '@playwright/test';
import { snapToObjects, squareAngle, type Box } from '@/geometry/objectSnap';
import type { Mm } from '@/model/units';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });
/** A box of size w × d centred on (x, y). */
const B = (x: number, y: number, w: number, d: number): Box => ({ minX: x - w / 2, maxX: x + w / 2, minY: y - d / 2, maxY: y + d / 2 });

const rack = B(0, 0, 1400, 500);

test('keeps the aisle to a neighbour beside it', () => {
  // 1400 wide at x ≈ 2330: its left edge is 930 from the rack's right edge → 900.
  const r = snapToObjects(P(2330, 10), B(2330, 10, 1400, 500), [rack], 50, 900);
  expect(r.position.x).toBe(700 + 900 + 700);
  // …and lines up with it as well (top, centre and bottom edges agree).
  expect(r.position.y).toBe(0);
  expect(r.guides.some((g) => g.kind === 'gap' && g.distance === 900)).toBe(true);
  expect(r.guides.some((g) => g.kind === 'align' && g.axis === 'y')).toBe(true);
});

test('lines up edges and centres; out of reach nothing moves', () => {
  // Below the rack, left edges 30 mm apart → they line up.
  const r = snapToObjects(P(-270, 2000), B(-270, 2000, 800, 500), [rack], 50, 900);
  expect(r.position.x).toBe(-700 + 400);
  expect(r.guides[0]).toMatchObject({ kind: 'align', axis: 'x', at: -700 });
  const far = snapToObjects(P(-100, 2000), B(-100, 2000, 800, 500), [rack], 50, 900);
  expect(far.position).toEqual(P(-100, 2000));
  expect(far.guides).toEqual([]);
});

test('the gap above or below works the same way', () => {
  // Under the rack: top edge 880 below its bottom edge → 900.
  const r = snapToObjects(P(0, 1380), B(0, 1380, 1400, 500), [rack], 50, 900);
  expect(r.position.y).toBe(250 + 900 + 250);
});

test('only square angles snap', () => {
  expect(squareAngle(0)).toBe(true);
  expect(squareAngle(Math.PI / 2)).toBe(true);
  expect(squareAngle(-Math.PI)).toBe(true);
  expect(squareAngle(0.3)).toBe(false);
});

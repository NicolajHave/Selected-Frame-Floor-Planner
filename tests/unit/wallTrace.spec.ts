import { test, expect } from '@playwright/test';
import { outset, traceRoom, type GreyImage } from '@/lib/wallTrace';

/** A white picture with black wall lines `t` px thick. */
function plan(w: number, h: number, walls: [number, number, number, number][], t = 3): GreyImage {
  const lum = new Uint8Array(w * h).fill(255);
  for (const [x0, y0, x1, y1] of walls) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + t - 1; y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + t - 1; x++) lum[y * w + x] = 0;
    }
  }
  return { lum, w, h };
}

const box = (pts: { x: number; y: number }[]) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

test('a rectangular room with a door gap: closed gaps give its four walls', () => {
  // Room 20..180 × 20..130 with a 20 px door in the top wall (x 60–80).
  const img = plan(200, 150, [
    [20, 20, 60, 20], [80, 20, 180, 20], // top, with the gap
    [20, 130, 180, 130], // bottom
    [20, 20, 20, 130], // left
    [180, 20, 180, 130], // right
  ]);
  const open = traceRoom(img, { x: 100, y: 75 }, { closePx: 0, tolerancePx: 2 });
  expect(open!.leaked).toBe(true);
  const closed = traceRoom(img, { x: 100, y: 75 }, { closePx: 30, tolerancePx: 2 })!;
  expect(closed.leaked).toBe(false);
  expect(closed.polygon).toHaveLength(4);
  // Inside faces: walls are 3 px thick, starting at 20 and ending at 180 + 2.
  const [x0, y0, x1, y1] = box(closed.polygon);
  expect(x0).toBeCloseTo(23, -0.5);
  expect(y0).toBeCloseTo(23, -0.5);
  expect(x1).toBeCloseTo(180, -0.5);
  expect(y1).toBeCloseTo(130, -0.5);
});

test('an L-shaped room keeps its six corners; furniture inside is ignored', () => {
  const img = plan(220, 220, [
    [20, 20, 200, 20], [200, 20, 200, 100], [110, 100, 200, 100],
    [110, 100, 110, 200], [20, 200, 110, 200], [20, 20, 20, 200],
    // A table inside the room
    [50, 50, 80, 50], [50, 70, 80, 70], [50, 50, 50, 70], [80, 50, 80, 70],
  ]);
  const r = traceRoom(img, { x: 40, y: 150 }, { closePx: 6, tolerancePx: 2 })!;
  expect(r.leaked).toBe(false);
  expect(r.polygon).toHaveLength(6);
});

test('a click outside the picture, or with no room, gives nothing', () => {
  const img = plan(50, 50, []);
  expect(traceRoom(img, { x: 80, y: 10 }, { closePx: 0, tolerancePx: 1 })).toBeNull();
});

test('outset moves each edge out by the distance', () => {
  const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  expect(box(outset(sq, 10))).toEqual([-10, -10, 110, 60]);
  expect(box(outset([...sq].reverse(), 10))).toEqual([-10, -10, 110, 60]);
});

test('several clicks add up: a line drawn across the room no longer splits it', () => {
  const img = plan(200, 150, [
    [20, 20, 180, 20], [20, 130, 180, 130], [20, 20, 20, 130], [180, 20, 180, 130],
  ]);
  // A thin (1 px) line across the room, e.g. a dimension line.
  for (let y = 23; y < 130; y++) img.lum[y * 200 + 100] = 0;
  const one = traceRoom(img, { x: 60, y: 75 }, { closePx: 4, tolerancePx: 2 })!;
  const [, , x1] = box(one.polygon);
  expect(x1).toBeLessThan(105);
  const both = traceRoom(img, [{ x: 60, y: 75 }, { x: 140, y: 75 }], { closePx: 4, tolerancePx: 2 })!;
  expect(both.polygon).toHaveLength(4);
  expect(box(both.polygon)[2]).toBeCloseTo(180, -0.5);
});

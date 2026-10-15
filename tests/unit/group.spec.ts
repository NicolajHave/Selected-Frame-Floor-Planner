import { test, expect } from '@playwright/test';
import { alignPositions, distributePositions, membersInBox, rotatePositions } from '@/lib/group';
import type { Project } from '@/model/project';
import type { InventoryItem, Selection } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });

function item(id: string, x: number, y: number, w = 1000, d = 500): InventoryItem {
  return {
    id,
    type: 'inventory',
    name: id,
    position: P(x, y),
    size: { width: w as Mm, depth: d as Mm, height: 1800 as Mm },
    rotation: 0 as Radians,
  };
}

const project = (inventory: InventoryItem[]): Project => ({
  schemaVersion: 1,
  id: 'p',
  name: 'T',
  createdAt: '',
  updatedAt: '',
  units: 'mm',
  room: null,
  pillars: [],
  inventory,
  annotations: [{ id: 'n', position: P(9000, 9000), text: 'x' }],
});

const sel = (...ids: string[]): Selection[] => ids.map((id) => ({ kind: 'inventory', id }));

test('align edges and centres by each footprint', () => {
  const p = project([item('a', 1000, 1000), item('b', 4000, 2000, 2000), item('c', 2000, 3000)]);
  const left = alignPositions(p, sel('a', 'b', 'c'), 'left');
  // Leftmost edge is a's at 500: b (2000 wide) centres at 1500, c at 1000.
  expect([...left.values()].map((q) => q.x)).toEqual([1000, 1500, 1000]);
  const top = alignPositions(p, sel('a', 'b', 'c'), 'top');
  expect([...top.values()].map((q) => q.y)).toEqual([1000, 1000, 1000]);
  const mid = alignPositions(p, sel('a', 'b'), 'center-y');
  expect([...mid.values()].map((q) => q.y)).toEqual([1500, 1500]);
});

test('distribute leaves equal gaps between footprints', () => {
  const p = project([item('a', 500, 0), item('b', 1600, 0), item('c', 9500, 0)]);
  // Span 0..10000, three 1000-wide items: gaps of 3500.
  const out = distributePositions(p, sel('c', 'a', 'b'), 'x');
  expect(out.get('a')!.x).toBe(500);
  expect(out.get('b')!.x).toBe(5000);
  expect(out.get('c')!.x).toBe(9500);
  expect(distributePositions(p, sel('a', 'b'), 'x').size).toBe(0);
});

test('rotating a group turns it as one piece around its middle', () => {
  const p = project([item('a', 0, 0), item('b', 2000, 0)]);
  const out = rotatePositions(p, sel('a', 'b'), Math.PI / 2);
  expect(out.get('a')).toEqual({ position: { x: 1000, y: -1000 }, rotation: Math.PI / 2 });
  expect(out.get('b')).toEqual({ position: { x: 1000, y: 1000 }, rotation: Math.PI / 2 });
});

test('box select picks what has its centre inside', () => {
  const p = project([item('a', 1000, 1000), item('b', 5000, 5000)]);
  expect(membersInBox(p, { minX: 0, minY: 0, maxX: 2000, maxY: 2000 })).toEqual([{ kind: 'inventory', id: 'a' }]);
  expect(membersInBox(p, { minX: 0, minY: 0, maxX: 10000, maxY: 10000 })).toHaveLength(3); // + the note
});

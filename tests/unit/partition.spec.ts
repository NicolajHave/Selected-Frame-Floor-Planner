import { test, expect } from '@playwright/test';
import { partitionBetween } from '@/lib/partition';
import { layoutIssues } from '@/lib/layout';
import { proposeLayout } from '@/lib/autoLayout';
import { rectCorners } from '@/geometry/transform';
import { outlineGap } from '@/geometry/footprint';
import type { Project } from '@/model/project';
import type { InventoryItem } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });

test('an interior wall runs from the first click to the second', () => {
  const wall = partitionBetween(P(1000, 2000), P(4000, 2000), 2800)!;
  expect(wall).toMatchObject({ type: 'pillar', kind: 'wall', position: { x: 2500, y: 2000 }, rotation: 0 });
  expect(wall.size).toEqual({ width: 3000, depth: 100, height: 2800 });

  // At an angle: its length is the distance, its turn the direction.
  const slanted = partitionBetween(P(0, 0), P(3000, 4000), 2800)!;
  expect(slanted.size.width).toBe(5000);
  expect(slanted.rotation).toBeCloseTo(Math.atan2(4, 3));
  const [a, b] = rectCorners(slanted.position, slanted.size, slanted.rotation);
  expect(Math.hypot(b!.x - a!.x, b!.y - a!.y)).toBeCloseTo(5000);

  // Two clicks on the same spot are not a wall.
  expect(partitionBetween(P(0, 0), P(100, 0), 2800)).toBeNull();
});

const shop = (pillars: Project['pillars'], inventory: InventoryItem[] = []): Project => ({
  schemaVersion: 1, id: 'p', name: 'Shop', createdAt: '', updatedAt: '', units: 'mm', pillars, inventory,
  room: {
    id: 'r', closed: true, wallThickness: 120 as Mm, wallHeight: 2800 as Mm, openings: [],
    corners: [[0, 0], [12000, 0], [12000, 9000], [0, 9000]].map(([x, y], i) => ({ id: `c${i}`, point: P(x!, y!) })),
  },
});

test('fixtures may not stand in an interior wall, and proposals keep clear of it', () => {
  const wall = partitionBetween(P(6000, 0), P(6000, 5000), 2800)!;
  const rack: InventoryItem = {
    id: 'rack', type: 'inventory', name: 'Floor Rack 1400', assetRef: '105-06-001',
    position: P(6000, 2500), size: { width: 1310 as Mm, depth: 500 as Mm, height: 1508 as Mm }, rotation: 0 as Radians,
  };
  const issues = layoutIssues(shop([wall], [rack]), 900);
  expect(issues.some((i) => i.objectIds.includes(wall.id) && i.objectIds.includes('rack'))).toBe(true);
  expect(issues.map((i) => i.message).join(' ')).toContain('Interior wall');

  // A proposal keeps the aisle to the wall — or stands fixtures right against it.
  const inv = proposeLayout(shop([wall]), { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  expect(inv.length).toBeGreaterThan(5);
  const outline = rectCorners(wall.position, wall.size, wall.rotation);
  const gaps = inv
    .filter((i) => !i.assetRef?.startsWith('105-13') && !i.assetRef?.startsWith('105-19'))
    .map((it) => ({ it, gap: outlineGap(rectCorners(it.position, it.size, it.rotation), outline).distance }));
  for (const { it, gap } of gaps) expect(gap <= 1 || gap >= 899, `${it.name}: ${gap}`).toBe(true);
  expect(layoutIssues({ ...shop([wall]), inventory: inv }, 900)).toEqual([]);

  // Tall enough for wall units (2.8 m): a wall rack on either side of it, backs to the wall.
  const against = gaps.filter((g) => g.gap <= 1).map((g) => g.it);
  expect(against.length).toBe(2);
  expect(against.every((i) => !!i.modules?.length)).toBe(true);
  expect(against[0]!.position.x < 6000).not.toBe(against[1]!.position.x < 6000);
});

test('a low interior wall gets floor racks along it instead of wall racks; so does a tall one without wall racks', () => {
  const low = { ...partitionBetween(P(6000, 0), P(6000, 5000), 1500)! };
  const inv = proposeLayout(shop([low]), { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const outline = rectCorners(low.position, low.size, low.rotation);
  const against = inv.filter((i) => outlineGap(rectCorners(i.position, i.size, i.rotation), outline).distance <= 1);
  expect(against.length).toBeGreaterThanOrEqual(2);
  expect(against.every((i) => i.assetRef?.startsWith('105-06-'))).toBe(true);
  // Standing along it: their length follows the wall.
  for (const r of against) expect(Math.abs(Math.sin(r.rotation))).toBeCloseTo(1, 3);
  expect(layoutIssues({ ...shop([low]), inventory: inv }, 900)).toEqual([]);

  const tall = partitionBetween(P(6000, 0), P(6000, 5000), 2800)!;
  const noWallRacks = proposeLayout(shop([tall]), { style: 'volume', aisle: 900, wallRacks: false }).inventory;
  const tallOutline = rectCorners(tall.position, tall.size, tall.rotation);
  const beside = noWallRacks.filter((i) => outlineGap(rectCorners(i.position, i.size, i.rotation), tallOutline).distance <= 1);
  expect(beside.length).toBeGreaterThanOrEqual(2);
  expect(noWallRacks.some((i) => i.modules)).toBe(false);
});

test('the wall between two fixtures is not an aisle; an open side is no wall to keep an aisle to', () => {
  const rack = (id: string, x: number, y: number): InventoryItem => ({
    id, type: 'inventory', name: id, assetRef: '105-06-001',
    position: P(x, y), size: { width: 1310 as Mm, depth: 500 as Mm, height: 1508 as Mm }, rotation: (Math.PI / 2) as Radians,
  });
  // A 300 mm thick interior wall with a rack flush on either side: 300 mm apart, but with the wall in between.
  const thick = partitionBetween(P(6000, 1000), P(6000, 6000), 2800, 300)!;
  const either = [rack('left', 6000 - 150 - 250, 3500), rack('right', 6000 + 150 + 250, 3500)];
  expect(layoutIssues(shop([thick], either), 900)).toEqual([]);
  // Without the wall the same two racks are too close.
  expect(layoutIssues(shop([], either), 900).map((i) => i.kind)).toEqual(['aisle']);

  // 400 mm from the left wall: too narrow — unless that side of the shop is open.
  const near = [rack('edge', 60 + 400 + 250, 4500)];
  const solid = shop([], near);
  expect(layoutIssues(solid, 900).map((i) => i.message).join(' ')).toContain('and the wall');
  const open: Project = { ...solid, room: { ...solid.room!, walls: { c3: { transparent: true } } } };
  expect(layoutIssues(open, 900)).toEqual([]);
});


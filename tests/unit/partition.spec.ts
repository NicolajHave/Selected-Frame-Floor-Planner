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

  const inv = proposeLayout(shop([wall]), { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  expect(inv.length).toBeGreaterThan(5);
  const outline = rectCorners(wall.position, wall.size, wall.rotation);
  for (const it of inv.filter((i) => !i.assetRef?.startsWith('105-13') && !i.assetRef?.startsWith('105-19'))) {
    const gap = outlineGap(rectCorners(it.position, it.size, it.rotation), outline).distance;
    expect(gap, it.name).toBeGreaterThanOrEqual(899);
  }
  expect(layoutIssues({ ...shop([wall]), inventory: inv }, 900)).toEqual([]);
});

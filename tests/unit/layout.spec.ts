import { test, expect } from '@playwright/test';
import { convexOverlap, outlineGap, pointInPolygon, rayHit } from '@/geometry/footprint';
import { clearanceGuides, innerOutline, layoutIssues } from '@/lib/layout';
import { rectCorners } from '@/geometry/transform';
import type { Project } from '@/model/project';
import type { InventoryItem, Opening, Pillar } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });
const box = (cx: number, cy: number, w: number, d: number, rot = 0) =>
  rectCorners(P(cx, cy), { width: w as Mm, depth: d as Mm }, rot as Radians);

function item(id: string, x: number, y: number, w: number, d: number, extra: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    type: 'inventory',
    name: id,
    position: P(x, y),
    size: { width: w as Mm, depth: d as Mm, height: 1800 as Mm },
    rotation: 0 as Radians,
    ...extra,
  };
}

function project(inventory: InventoryItem[], openings: Opening[] = [], pillars: Pillar[] = []): Project {
  return {
    schemaVersion: 1,
    id: 'p',
    name: 'Test',
    createdAt: '',
    updatedAt: '',
    units: 'mm',
    room: {
      id: 'r',
      closed: true,
      wallThickness: 120 as Mm,
      wallHeight: 2700 as Mm,
      corners: [P(0, 0), P(10000, 0), P(10000, 7000), P(0, 7000)].map((point, i) => ({ id: `c${i}`, point })),
      openings,
    },
    pillars,
    inventory,
  };
}

test.describe('footprint geometry', () => {
  test('overlap: touching is not overlapping, rotated boxes are handled', () => {
    expect(convexOverlap(box(0, 0, 1000, 1000), box(1000, 0, 1000, 1000))).toBe(false);
    expect(convexOverlap(box(0, 0, 1000, 1000), box(900, 0, 1000, 1000))).toBe(true);
    // A 45° box (half-diagonal 283 mm) whose corner reaches past x = 500.
    expect(convexOverlap(box(0, 0, 1000, 1000), box(750, 0, 400, 400, Math.PI / 4))).toBe(true);
    expect(convexOverlap(box(0, 0, 1000, 1000), box(800, 0, 400, 400, Math.PI / 4))).toBe(false);
  });

  test('outlineGap returns the distance and closest points', () => {
    const g = outlineGap(box(0, 0, 1000, 1000), box(2000, 0, 1000, 1000));
    expect(g.distance).toBeCloseTo(1000);
    expect(g.from.x).toBeCloseTo(500);
    expect(g.to.x).toBeCloseTo(1500);
  });

  test('pointInPolygon and rayHit', () => {
    const sq = box(0, 0, 2000, 2000);
    expect(pointInPolygon(P(0, 0), sq)).toBe(true);
    expect(pointInPolygon(P(1500, 0), sq)).toBe(false);
    expect(rayHit(P(0, 0), 1, 0, [[P(700, -100), P(700, 100)]])).toBeCloseTo(700);
    expect(rayHit(P(0, 0), -1, 0, [[P(700, -100), P(700, 100)]])).toBe(Infinity);
  });
});

test('innerOutline sits half a wall inside', () => {
  const inner = innerOutline(project([]).room!)!;
  expect(inner.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
    [60, 60], [9940, 60], [9940, 6940], [60, 6940],
  ]);
});

test.describe('layoutIssues', () => {
  test('a clean layout has no issues', () => {
    expect(layoutIssues(project([item('a', 3000, 3000, 1300, 500), item('b', 6000, 3000, 1300, 500)]))).toEqual([]);
  });

  test('overlapping objects', () => {
    const issues = layoutIssues(project([item('a', 3000, 3000, 1300, 500), item('b', 3500, 3100, 1300, 500)]));
    expect(issues.map((i) => i.kind)).toEqual(['overlap']);
    expect(issues[0]!.objectIds).toEqual(['a', 'b']);
  });

  test('object through a wall', () => {
    const issues = layoutIssues(project([item('a', 200, 3000, 1300, 500)]));
    expect(issues.map((i) => i.kind)).toEqual(['wall']);
  });

  test('flush against the wall is fine, a 400 mm gap is a narrow aisle', () => {
    expect(layoutIssues(project([item('a', 3000, 60 + 250, 1300, 500)]))).toEqual([]);
    const issues = layoutIssues(project([item('a', 3000, 3000, 1300, 500), item('b', 4700, 3000, 1300, 500)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'aisle', message: 'Only 400 mm between a and b.' });
    expect(issues[0]!.gap!.distance).toBeCloseTo(400);
  });

  test('the minimum aisle is configurable', () => {
    const p = project([item('a', 3000, 3000, 1300, 500), item('b', 5000, 3000, 1300, 500)]); // 700 mm
    expect(layoutIssues(p, 900).map((i) => i.kind)).toEqual(['aisle']);
    expect(layoutIssues(p, 600)).toEqual([]);
  });

  test('low items and wall-hung logos are not obstacles', () => {
    const tray = item('tray', 3000, 3000, 420, 275, { size: { width: 420 as Mm, depth: 275 as Mm, height: 28 as Mm } });
    const table = item('table', 3000, 3000, 1800, 1280);
    const logo = item('logo', 3000, 3000, 1200, 20, { assetRef: '105-13-015' });
    expect(layoutIssues(project([tray, table, logo]))).toEqual([]);
  });

  test('blocking the swing of a door', () => {
    const door: Opening = {
      id: 'd', kind: 'door', wallStartCornerId: 'c0', offset: 5000 as Mm, width: 900 as Mm,
      height: 2100 as Mm, sillHeight: 0 as Mm, hinge: 'start', swing: 'in',
    };
    const issues = layoutIssues(project([item('rack', 5000, 600, 1300, 500)], [door]));
    expect(issues.map((i) => i.kind)).toContain('door');
  });
});

test('clearanceGuides measure to walls and neighbours', () => {
  const p = project([item('a', 3000, 3000, 1000, 1000), item('b', 6000, 3000, 1000, 1000)]);
  const guides = clearanceGuides(p, box(3000, 3000, 1000, 1000), 'a');
  const byDir = Object.fromEntries(
    guides.map((g) => [
      g.to.x > g.from.x ? 'right' : g.to.x < g.from.x ? 'left' : g.to.y > g.from.y ? 'down' : 'up',
      Math.round(g.distance),
    ]),
  );
  // left wall face at 60, right neighbour at 5500, top face at 60, bottom face at 6940
  expect(byDir).toEqual({ right: 2000, left: 2440, down: 3440, up: 2440 });
});

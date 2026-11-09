import { test, expect } from '@playwright/test';
import { proposeLayout } from '@/lib/autoLayout';
import { layoutIssues } from '@/lib/layout';
import type { Project } from '@/model/project';
import type { Opening, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { outlineGap } from '@/geometry/footprint';

function room(w: number, d: number, openings: Opening[] = []): RoomPolygon {
  return {
    id: 'r',
    closed: true,
    wallThickness: 120 as Mm,
    wallHeight: 2800 as Mm,
    corners: [[0, 0], [w, 0], [w, d], [0, d]].map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
    openings,
  };
}
const door = (wall: string, offset: number, width = 1800): Opening => ({
  id: 'door', kind: 'double-door', wallStartCornerId: wall, offset: offset as Mm, width: width as Mm,
  height: 2100 as Mm, sillHeight: 0 as Mm, hinge: 'start', swing: 'out',
});
const project = (r: RoomPolygon): Project => ({
  schemaVersion: 1, id: 'p', name: 'Shop', createdAt: '', updatedAt: '', units: 'mm', room: r, pillars: [], inventory: [],
});

const shop = project(room(12000, 9000, [door('c2', 6000)]));

for (const style of ['volume', 'brand'] as const) {
  test(`${style}: fixtures everywhere keep the aisle, doorways stay clear, the layout check is happy`, () => {
    const r = proposeLayout(shop, { style, aisle: 900, wallRacks: true });
    expect(r.problem).toBeUndefined();
    expect(r.inventory.length).toBeGreaterThan(style === 'volume' ? 12 : 5);
    expect(layoutIssues({ ...shop, inventory: r.inventory }, 900)).toEqual([]);
    // Every pair of floor fixtures at least 900 mm apart.
    const floor = r.inventory.filter((i) => !i.modules && !i.assetRef?.startsWith('105-13'));
    for (let i = 0; i < floor.length; i++) {
      for (let j = i + 1; j < floor.length; j++) {
        const a = rectCorners(floor[i]!.position, floor[i]!.size, floor[i]!.rotation);
        const b = rectCorners(floor[j]!.position, floor[j]!.size, floor[j]!.rotation);
        expect(outlineGap(a, b).distance).toBeGreaterThanOrEqual(899);
      }
    }
    expect(r.inventory.some((i) => i.modules?.length)).toBe(true);
  });
}

test('volume fits more than brand; brand has a welcome table, mannequins, signs and a logo', () => {
  const v = proposeLayout(shop, { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const b = proposeLayout(shop, { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  expect(v.length).toBeGreaterThan(b.length);
  expect(b.some((i) => i.assetRef === '105-17-007')).toBe(true);
  expect(b.filter((i) => i.assetRef?.startsWith('112-18')).length).toBe(2);
  expect(b.some((i) => i.accessories?.length)).toBe(true);
  expect(b.some((i) => i.assetRef === '105-13-001')).toBe(true);
});

test('a wider aisle means fewer fixtures; no wall racks when asked; no room says so', () => {
  const narrow = proposeLayout(shop, { style: 'volume', aisle: 900, wallRacks: false }).inventory;
  const wide = proposeLayout(shop, { style: 'volume', aisle: 1500, wallRacks: false }).inventory;
  expect(narrow.some((i) => i.modules)).toBe(false);
  expect(wide.length).toBeLessThan(narrow.length);
  const tiny = proposeLayout(project(room(1500, 1500)), { style: 'volume', aisle: 900, wallRacks: true });
  expect(tiny.inventory).toEqual([]);
  expect(tiny.problem).toContain('no room');
  expect(proposeLayout({ ...shop, room: null }, { style: 'brand', aisle: 900, wallRacks: true }).problem).toContain('room');
});

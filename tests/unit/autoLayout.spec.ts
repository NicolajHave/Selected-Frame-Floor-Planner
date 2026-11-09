import { test, expect } from '@playwright/test';
import { proposeLayout } from '@/lib/autoLayout';
import { layoutIssues } from '@/lib/layout';
import type { Project } from '@/model/project';
import type { Opening, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { outlineGap } from '@/geometry/footprint';
import { rackSlots } from '@/lib/racks';

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
    // Carpets are walked over; logos hang on the wall.
    const floor = r.inventory.filter((i) => !i.modules && !i.assetRef?.startsWith('105-13') && !i.assetRef?.startsWith('105-19'));
    for (let i = 0; i < floor.length; i++) {
      for (let j = i + 1; j < floor.length; j++) {
        const a = rectCorners(floor[i]!.position, floor[i]!.size, floor[i]!.rotation);
        const b = rectCorners(floor[j]!.position, floor[j]!.size, floor[j]!.rotation);
        // Either the full aisle apart, or standing together (touching, ≤ 100 mm: racks in pairs, mannequins by the table).
        const d = outlineGap(a, b).distance;
        expect(d >= 899 || d <= 100, `${floor[i]!.name} – ${floor[j]!.name}: ${d}`).toBe(true);
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

const count = (inv: { assetRef?: string }[], id: string) => inv.filter((i) => i.assetRef === id).length;
const shopOf = (w: number, d: number) => project(room(w, d, [door('c2', w / 2)]));

test('from 30 m²: one Iconic Table on a carpet in front of the entrance, in either style', () => {
  for (const style of ['brand', 'volume'] as const) {
    const inv = proposeLayout(shop, { style, aisle: 900, wallRacks: true }).inventory;
    expect(count(inv, '105-17-007')).toBe(1);
    expect(count(inv, '105-19-001')).toBe(1);
    const table = inv.find((i) => i.assetRef === '105-17-007')!;
    const carpet = inv.find((i) => i.assetRef === '105-19-001')!;
    // The table stands on the carpet, between the door (bottom wall) and the middle of the shop.
    expect(Math.hypot(table.position.x - carpet.position.x, table.position.y - carpet.position.y)).toBeLessThan(1);
    expect(table.position.y).toBeGreaterThan(9000 / 2);
    // Nothing else stands on the carpet.
    const c = rectCorners(carpet.position, carpet.size, carpet.rotation);
    for (const i of inv) {
      if (i === carpet || i === table || i.assetRef?.startsWith('112-18')) continue;
      expect(outlineGap(rectCorners(i.position, i.size, i.rotation), c).distance).toBeGreaterThan(0);
    }
  }
});

test('Volume Tables: none under 30 m², one from 30 m², two from 60 m²; never more than one Iconic Table', () => {
  const small = proposeLayout(shopOf(5000, 5000), { style: 'volume', aisle: 900, wallRacks: true }).inventory; // 25 m²
  expect(count(small, '105-17-001')).toBe(0);
  expect(count(small, '105-19-001')).toBe(0);
  const mid = proposeLayout(shopOf(7000, 6000), { style: 'volume', aisle: 900, wallRacks: true }).inventory; // 42 m²
  expect(count(mid, '105-17-001')).toBe(1);
  expect(count(mid, '105-17-007')).toBe(1);
  expect(layoutIssues({ ...shopOf(7000, 6000), inventory: mid }, 900)).toEqual([]);
  const big = proposeLayout(shop, { style: 'brand', aisle: 900, wallRacks: true }).inventory; // 108 m²
  expect(count(big, '105-17-001')).toBe(2);
  expect(count(big, '105-17-007')).toBe(1);
});

test('floor racks are held to the size of the shop', () => {
  const v = proposeLayout(shop, { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const b = proposeLayout(shop, { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  const racks = (inv: { assetRef?: string }[]) => inv.filter((i) => i.assetRef?.startsWith('105-06-')).length;
  expect(racks(v)).toBeLessThanOrEqual(Math.floor(108 / 12));
  expect(racks(b)).toBeLessThanOrEqual(Math.floor(108 / 25));
  expect(racks(b)).toBeLessThan(racks(v));
});

test('no wall racks against a transparent (glass) wall', () => {
  const glass = room(12000, 9000, [door('c2', 6000)]);
  glass.walls = { c0: { transparent: true } }; // the top wall
  const inv = proposeLayout(project(glass), { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const onTop = inv.filter((i) => i.modules?.length && i.position.y < 1000);
  expect(onTop).toEqual([]);
  expect(inv.some((i) => i.modules?.length)).toBe(true);
  // And no logo on it.
  const brand = proposeLayout(project(glass), { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  expect(brand.filter((i) => i.assetRef === '105-13-001' && i.position.y < 1000)).toEqual([]);
});

test('two mannequins stand beside the Iconic Table, on the carpet, in either style', () => {
  for (const style of ['brand', 'volume'] as const) {
    const inv = proposeLayout(shop, { style, aisle: 900, wallRacks: true }).inventory;
    const carpet = inv.find((i) => i.assetRef === '105-19-001')!;
    const table = inv.find((i) => i.assetRef === '105-17-007')!;
    const c = rectCorners(carpet.position, carpet.size, carpet.rotation);
    const mannequins = inv.filter((i) => i.assetRef?.startsWith('112-18'));
    expect(mannequins).toHaveLength(2);
    for (const m of mannequins) {
      // Wholly on the carpet, right by the table.
      for (const p of rectCorners(m.position, m.size, m.rotation)) {
        expect(p.x).toBeGreaterThanOrEqual(Math.min(...c.map((q) => q.x)) - 1);
        expect(p.x).toBeLessThanOrEqual(Math.max(...c.map((q) => q.x)) + 1);
        expect(p.y).toBeGreaterThanOrEqual(Math.min(...c.map((q) => q.y)) - 1);
        expect(p.y).toBeLessThanOrEqual(Math.max(...c.map((q) => q.y)) + 1);
      }
      const gap = outlineGap(rectCorners(m.position, m.size, m.rotation), rectCorners(table.position, table.size, table.rotation)).distance;
      expect(gap).toBeLessThanOrEqual(100);
    }
  }
});

test('the logo hangs centred over the leftmost wall unit on its wall', () => {
  const inv = proposeLayout(shop, { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  const logo = inv.find((i) => i.assetRef === '105-13-001')!;
  // The door is in the bottom wall, so the logo is on the top wall (y ≈ 0), facing down into the shop.
  expect(logo.position.y).toBeLessThan(200);
  const racks = inv.filter((i) => i.modules?.length && i.position.y < 1000);
  // Seen from inside facing the top wall, left is +x … check against the rack geometry: the leftmost unit's centre.
  const units = racks.flatMap((r) => rackSlots(r.modules!).map((s) => {
    const rx = { x: Math.cos(r.rotation), y: Math.sin(r.rotation) };
    return { x: r.position.x + rx.x * s.x - rx.y * s.y, left: (r.position.x + rx.x * s.x - rx.y * s.y) * rx.x };
  }));
  const leftmost = units.sort((a, b) => a.left - b.left)[0]!;
  expect(logo.position.x).toBeCloseTo(leftmost.x, 3);
});

test('volume racks stand in pairs, end to end, with the aisle around each pair', () => {
  const inv = proposeLayout(shop, { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const racks = inv.filter((i) => i.assetRef?.startsWith('105-06-'));
  expect(racks.length).toBeGreaterThanOrEqual(2);
  for (const r of racks) {
    const o = rectCorners(r.position, r.size, r.rotation);
    const touching = racks.filter((x) => x !== r && outlineGap(o, rectCorners(x.position, x.size, x.rotation)).distance <= 1);
    expect(touching).toHaveLength(1);
  }
  expect(layoutIssues({ ...shop, inventory: inv }, 900)).toEqual([]);
});

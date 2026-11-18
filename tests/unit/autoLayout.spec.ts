import { test, expect } from '@playwright/test';
import { entrance, entrances, proposeLayout, shelve } from '@/lib/autoLayout';
import { layoutIssues } from '@/lib/layout';
import type { Project } from '@/model/project';
import type { InventoryItem, Opening, RoomPolygon } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { convexOverlap, outlineGap } from '@/geometry/footprint';
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
        // The mannequins are styled right at the Iconic Table, reaching in over its outline: one display.
        const refs = [floor[i]!.assetRef ?? '', floor[j]!.assetRef ?? ''];
        if (refs.some((r) => r.startsWith('112-18')) && refs.some((r) => r === '105-17-007' || r.startsWith('112-18'))) continue;
        // Either the full aisle apart, or standing together (touching, ≤ 100 mm: racks in pairs).
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
  expect(racks(v)).toBeLessThanOrEqual(Math.floor(108 / 10));
  expect(racks(b)).toBeLessThanOrEqual(Math.floor(108 / 18));
  expect(racks(b)).toBeGreaterThanOrEqual(4);
  expect(racks(b)).toBeLessThan(racks(v));
});

test('no wall racks against an open side (a wall marked open)', () => {
  const glass = room(12000, 9000, [door('c2', 6000)]);
  glass.walls = { c0: { transparent: true } }; // the top wall
  const inv = proposeLayout(project(glass), { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const onTop = inv.filter((i) => i.modules?.length && i.position.y < 1000);
  expect(onTop).toEqual([]);
  expect(inv.some((i) => i.modules?.length)).toBe(true);
  // And no logo on it.
  const brand = proposeLayout(project(glass), { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  expect(brand.filter((i) => i.assetRef?.startsWith('105-13') && i.position.y < 1000)).toEqual([]);
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
      // Right at the table: reaching in over its outline, or at most a hand's breadth from it.
      const outline = rectCorners(m.position, m.size, m.rotation);
      const tableOutline = rectCorners(table.position, table.size, table.rotation);
      expect(convexOverlap(outline, tableOutline) || outlineGap(outline, tableOutline).distance <= 100).toBe(true);
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

test('volume racks stand two and two, back to back, in a straight row with the aisle around each pair', () => {
  const inv = proposeLayout(shop, { style: 'volume', aisle: 900, wallRacks: true }).inventory;
  const racks = inv.filter((i) => i.assetRef?.startsWith('105-06-'));
  expect(racks.length).toBeGreaterThanOrEqual(8);
  let paired = 0;
  for (const r of racks) {
    const o = rectCorners(r.position, r.size, r.rotation);
    const touching = racks.filter((x) => x !== r && outlineGap(o, rectCorners(x.position, x.size, x.rotation)).distance <= 1);
    expect(touching.length).toBeLessThanOrEqual(1);
    for (const t of touching) {
      paired++;
      // Side by side (a rack's depth between their centres), not one after the other (a rack's length).
      expect(Math.hypot(t.position.x - r.position.x, t.position.y - r.position.y)).toBeCloseTo(500, 0);
    }
  }
  expect(paired).toBeGreaterThanOrEqual(8);
  // In line: the racks point the same way and stand at no more than two heights on the plan.
  const turns = new Set(racks.map((r) => Math.round(Math.abs(Math.cos(r.rotation)) * 100)));
  expect(turns.size).toBe(1);
  const along = (r: (typeof racks)[number]) => Math.round(r.position.x * Math.cos(r.rotation) + r.position.y * Math.sin(r.rotation));
  expect(new Set(racks.map(along)).size).toBeLessThanOrEqual(2);
  expect(layoutIssues({ ...shop, inventory: inv }, 900)).toEqual([]);
});

test('Volume Tables stand free on the floor: the aisle all the way round', () => {
  for (const style of ['brand', 'volume'] as const) {
    const inv = proposeLayout(shop, { style, aisle: 900, wallRacks: true }).inventory;
    const tables = inv.filter((i) => i.assetRef === '105-17-001');
    expect(tables).toHaveLength(2);
    const walls = [[0, 0], [12000, 0], [12000, 9000], [0, 9000]].map(([x, y]) => ({ x: x as Mm, y: y as Mm }));
    for (const t of tables) {
      const o = rectCorners(t.position, t.size, t.rotation);
      for (let i = 0; i < 4; i++) expect(outlineGap(o, [walls[i]!, walls[(i + 1) % 4]!]).distance).toBeGreaterThanOrEqual(899);
      for (const other of inv) {
        // Carpets are walked over; logos hang on the wall.
        if (other === t || other.assetRef?.startsWith('105-13') || other.assetRef?.startsWith('105-19')) continue;
        const gap = outlineGap(o, rectCorners(other.position, other.size, other.rotation)).distance;
        expect(gap, `${other.name}: ${gap}`).toBeGreaterThanOrEqual(899);
      }
    }
  }
});

test('the entrance zone moves along an open side, or to the next way in, when something is in the way', () => {
  // An open side at the top with an interior wall right across where the zone would go; a double door at the bottom.
  const r = room(12000, 9000, [door('c2', 6000)]);
  r.walls = { c0: { transparent: true } };
  const blocked: Project = { ...project(r), pillars: [{
    id: 'wall', type: 'pillar', kind: 'wall', shape: 'rect', position: { x: 6000 as Mm, y: 2300 as Mm },
    size: { width: 11000 as Mm, depth: 100 as Mm, height: 2800 as Mm }, rotation: 0 as Radians,
  }] };
  expect(entrances(r).map((e) => e.center.y)).toEqual([0, 9000]);
  const inv = proposeLayout(blocked, { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  const table = inv.find((i) => i.assetRef === '105-17-007')!;
  expect(table.position.y).toBeGreaterThan(4500); // by the door, not behind the wall
  expect(inv.filter((i) => i.assetRef?.startsWith('112-18'))).toHaveLength(2);
  expect(inv.filter((i) => i.assetRef === '105-19-001')).toHaveLength(1);

  // A post in the middle of the open side: the zone slides along the side past it.
  const post: Project = { ...project(r), pillars: [{
    id: 'post', type: 'pillar', shape: 'rect', position: { x: 6000 as Mm, y: 1800 as Mm },
    size: { width: 400 as Mm, depth: 400 as Mm, height: 2800 as Mm }, rotation: 0 as Radians,
  }] };
  const withPost = proposeLayout(post, { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  const slid = withPost.find((i) => i.assetRef === '105-17-007')!;
  expect(slid.position.y).toBeLessThan(4500); // still at the open side
  expect(slid.position.x).not.toBe(6000); // but not straight behind the post
  const postOutline = rectCorners(post.pillars[0]!.position, post.pillars[0]!.size, post.pillars[0]!.rotation);
  expect(outlineGap(rectCorners(slid.position, slid.size, slid.rotation), postOutline).distance).toBeGreaterThanOrEqual(899);
  expect(withPost.filter((i) => i.assetRef?.startsWith('112-18'))).toHaveLength(2);
  expect(layoutIssues({ ...post, inventory: withPost }, 900)).toEqual([]);
});

// A 55 m² shop drawn at an angle: open side on the right, a double door to
// the stock room on the left, a single door and a window at the top.
function angledShop(): Project {
  const corners = [[0, 0], [4052, 891], [9168, 2400], [5978, 7602], [-1250, 7400]];
  const opening = (id: string, kind: Opening['kind'], wall: string, offset: number, width: number): Opening => ({
    id, kind, wallStartCornerId: wall, offset: offset as Mm, width: width as Mm, height: 2100 as Mm,
    sillHeight: (kind === 'window' ? 900 : 0) as Mm, hinge: 'start', swing: 'out',
  });
  return project({
    id: 'r', closed: true, wallThickness: 120 as Mm, wallHeight: 2800 as Mm,
    corners: corners.map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
    openings: [opening('win', 'window', 'c0', 2350, 1800), opening('d1', 'door', 'c1', 2660, 900), opening('dd', 'double-door', 'c4', 5350, 1700)],
    walls: { c2: { transparent: true } },
  });
}

test('the entrance: an open side before any door, double doors and passages before single doors', () => {
  // An open side without a door in it: its middle, facing in.
  const angled = angledShop().room!;
  const front = entrance(angled)!;
  expect(front.center.x).toBeCloseTo((9168 + 5978) / 2, 0);
  expect(front.center.y).toBeCloseTo((2400 + 7602) / 2, 0);
  expect(front.nx).toBeLessThan(0); // into the shop, to the left

  // A door drawn in the open side is the entrance, even with a wider door elsewhere.
  const withDoor = room(12000, 9000, [
    { ...door('c0', 3000, 1000), id: 'in-glass', kind: 'door' },
    { ...door('c2', 6000, 2400), id: 'stock' },
  ]);
  withDoor.walls = { c0: { transparent: true } };
  expect(entrance(withDoor)!.center).toEqual({ x: 3000, y: 0 });

  // No open side: the double door wins over a wider single door.
  const doors = room(12000, 9000, [
    { ...door('c0', 3000, 1300), id: 'single', kind: 'door' },
    { ...door('c2', 6000, 1200), id: 'double' },
  ]);
  expect(entrance(doors)!.center).toEqual({ x: 6000, y: 9000 });
  // Only single doors: the widest.
  expect(entrance(room(12000, 9000, [{ ...door('c0', 3000, 900), kind: 'door' }]))!.center).toEqual({ x: 3000, y: 0 });
  expect(entrance(room(12000, 9000))).toBeNull();
});

test('a shop at an angle: the impact zone is at the open side, with both mannequins and floor racks', () => {
  const shop55 = angledShop();
  for (const style of ['brand', 'volume'] as const) {
    const inv = proposeLayout(shop55, { style, aisle: 900, wallRacks: true }).inventory;
    expect(layoutIssues({ ...shop55, inventory: inv }, 900)).toEqual([]);
    expect(inv.filter((i) => i.assetRef?.startsWith('105-06-')).length).toBeGreaterThanOrEqual(2);
    expect(inv.filter((i) => i.assetRef?.startsWith('112-18'))).toHaveLength(2);
    expect(inv.filter((i) => i.assetRef === '105-17-001')).toHaveLength(1);
    // The Iconic Table is nearer the open side than the stock-room double door.
    const table = inv.find((i) => i.assetRef === '105-17-007')!;
    const toGlass = Math.hypot(table.position.x - 7573, table.position.y - 5001);
    const toStockDoor = Math.hypot(table.position.x + 367, table.position.y - 2125);
    expect(toGlass).toBeLessThan(toStockDoor);
    // No wall rack on the open side.
    expect(inv.filter((i) => i.modules && i.position.x > 6500 && i.position.y > 3500)).toEqual([]);
  }
});

test('the logo prefers a wall rack of two or more units, centred over its leftmost unit', () => {
  // Facing the entrance (top wall) only single units fit between the windows; the side walls take longer racks.
  const window = (id: string, offset: number): Opening => ({ ...door('c0', offset, 1500), id, kind: 'window', sillHeight: 900 as Mm });
  const r = room(9000, 8000, [door('c2', 4500), window('w1', 2700), window('w2', 6300)]);
  const inv = proposeLayout(project(r), { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  const top = inv.filter((i) => i.modules && i.position.y < 1000);
  expect(top.length).toBeGreaterThan(0);
  expect(top.every((i) => i.modules!.length === 1)).toBe(true);
  const logo = inv.find((i) => i.assetRef?.startsWith('105-13'))!;
  const under = inv
    .filter((i) => i.modules)
    .sort((a, b) => Math.hypot(a.position.x - logo.position.x, a.position.y - logo.position.y) - Math.hypot(b.position.x - logo.position.x, b.position.y - logo.position.y))[0]!;
  expect(under.modules!.length).toBeGreaterThanOrEqual(2);
  // Centred over that rack's leftmost unit, as seen from inside the shop.
  const rx = { x: Math.cos(under.rotation), y: Math.sin(under.rotation) };
  const centres = rackSlots(under.modules!).map((s) => ({
    x: under.position.x + rx.x * s.x - rx.y * s.y,
    y: under.position.y + rx.y * s.x + rx.x * s.y,
  }));
  const leftmost = centres.sort((a, b) => a.x * rx.x + a.y * rx.y - (b.x * rx.x + b.y * rx.y))[0]!;
  const alongWall = Math.abs((logo.position.x - leftmost.x) * rx.x + (logo.position.y - leftmost.y) * rx.y);
  expect(alongWall).toBeLessThan(1);

  // With only single units anywhere, it hangs over a single unit.
  const tight = room(4200, 4200, [door('c2', 2100, 1200)]);
  const small = proposeLayout(project(tight), { style: 'brand', aisle: 900, wallRacks: true }).inventory;
  if (small.some((i) => i.modules) && small.every((i) => !i.modules || i.modules.length === 1)) {
    expect(small.some((i) => i.assetRef?.startsWith('105-13'))).toBe(true);
  }
});

test('a logo in every proposal with a solid wall: Corona Light from 30 m², stainless steel below, never LED', () => {
  const logos = (inv: { assetRef?: string }[]) => inv.filter((i) => i.assetRef?.startsWith('105-13'));
  for (const style of ['brand', 'volume'] as const) {
    const big = logos(proposeLayout(shop, { style, aisle: 900, wallRacks: true }).inventory);
    expect(big.map((l) => l.assetRef)).toEqual(['105-13-001']);
    const small = logos(proposeLayout(shopOf(5000, 5000), { style, aisle: 900, wallRacks: true }).inventory);
    expect(small.map((l) => l.assetRef)).toEqual(['105-13-015']);
    // Without wall racks too: centred on the wall facing the entrance (the top wall here).
    const bare = logos(proposeLayout(shop, { style, aisle: 900, wallRacks: false }).inventory);
    expect(bare).toHaveLength(1);
    expect((bare[0] as { position: { x: number; y: number } }).position.y).toBeLessThan(200);
    expect((bare[0] as { position: { x: number; y: number } }).position.x).toBeCloseTo(6000, -1);
  }
  // Every wall glass: no logo.
  const glass = room(12000, 9000, [door('c2', 6000)]);
  glass.walls = Object.fromEntries(glass.corners.map((c) => [c.id, { transparent: true }]));
  expect(logos(proposeLayout(project(glass), { style: 'brand', aisle: 900, wallRacks: true }).inventory)).toEqual([]);
});

test('a rack right at a Volume Table stands at its short side, never along the long side', () => {
  // Narrow shops: so little free floor that a rack goes right at the Volume Table.
  let beside = 0;
  for (const [w, d] of [[5000, 8000], [6000, 7000]] as const) {
    const tight = project(room(w, d, [door('c2', w / 2)]));
    for (const style of ['brand', 'volume'] as const) {
      const inv = proposeLayout(tight, { style, aisle: 900, wallRacks: true }).inventory;
      expect(layoutIssues({ ...tight, inventory: inv }, 900)).toEqual([]);
      const tables = inv.filter((i) => i.assetRef === '105-17-001');
      const racks = inv.filter((i) => i.assetRef?.startsWith('105-06-'));
      for (const t of tables) {
        const outline = rectCorners(t.position, t.size, t.rotation);
        const long = { x: Math.cos(t.rotation), y: Math.sin(t.rotation) }; // the table is 1800 along its own x
        for (const rack of racks) {
          if (outlineGap(outline, rectCorners(rack.position, rack.size, rack.rotation)).distance > 1) continue;
          beside++;
          const dx = rack.position.x - t.position.x;
          const dy = rack.position.y - t.position.y;
          // Off the end of the table (along its length), not off its long side.
          expect(Math.abs(dx * long.x + dy * long.y)).toBeCloseTo(t.size.width / 2 + rack.size.depth / 2, 0);
          expect(Math.abs(-dx * long.y + dy * long.x)).toBeLessThan(1);
          // And lying across that end: its length runs along the table's short side.
          expect(Math.abs(Math.cos(rack.rotation - t.rotation))).toBeLessThan(0.001);
        }
      }
    }
  }
  // Each of the four proposals has one.
  expect(beside).toBe(4);
});

test('the mannequins stand together at a back corner of the Iconic Table, facing the entrance with it', () => {
  for (const style of ['brand', 'volume'] as const) {
    const inv = proposeLayout(shop, { style, aisle: 900, wallRacks: true }).inventory;
    const table = inv.find((i) => i.assetRef === '105-17-007')!;
    const female = inv.find((i) => i.assetRef === '112-18-001')!;
    const male = inv.find((i) => i.assetRef === '112-18-002')!;
    // The shop's door is in the bottom wall (y = 9000): the table's front faces down the plan.
    const local = (m: typeof female) => {
      const dx = m.position.x - table.position.x;
      const dy = m.position.y - table.position.y;
      const c = Math.cos(table.rotation);
      const s = Math.sin(table.rotation);
      return { x: Math.round(dx * c + dy * s), y: Math.round(-dx * s + dy * c) };
    };
    expect(local(female)).toEqual({ x: -400, y: -625 });
    expect(local(male)).toEqual({ x: -660, y: -275 });
    // Behind the table as seen from the door, and turned the same way as the table.
    expect(female.position.y).toBeLessThan(table.position.y);
    expect(male.position.y).toBeLessThan(table.position.y);
    expect(female.rotation).toBeCloseTo(table.rotation);
    expect(male.rotation).toBeCloseTo(table.rotation);
    // They reach in over the table's outline, and that is no layout problem.
    const t = rectCorners(table.position, table.size, table.rotation);
    expect(convexOverlap(rectCorners(female.position, female.size, female.rotation), t)).toBe(true);
    expect(convexOverlap(rectCorners(male.position, male.size, male.rotation), t)).toBe(true);
    expect(layoutIssues({ ...shop, inventory: inv }, 900)).toEqual([]);
  }
});


const [H, S, h, s7, M] = ['105-99-005', '105-99-004', '105-99-012', '105-99-010', '105-99-007'];
/** Racks of `units` on walls with `space` mm free; returns the units after the shelf rule. */
function shelved(area: number, ...racks: [units: string[], space: number][]): string[][] {
  const items = racks.map(([modules, space], i) => ({ item: { id: `r${i}`, modules } as InventoryItem, space }));
  shelve(items, area);
  return items.map((r) => r.item.modules!);
}

test('one shelf unit in a shop: in its longest rack, in the middle, with hanging on either side', () => {
  expect(shelved(50, [[H, H, H], 5000], [[H, H], 3000])).toEqual([[H, S, H], [H, H]]);
  expect(shelved(50, [[H, H], 3000], [[H, H, H, H, H], 6900])).toEqual([[H, H], [H, H, S, H, H]]);
  expect(shelved(50, [[H, H], 3000])).toEqual([[H, S]]);
  // Of two racks as long, the one on the wall with more room.
  expect(shelved(50, [[H, H], 3000], [[H, H], 4000])).toEqual([[H, H], [H, S]]);
  // A mirror stays in the middle of its rack; a lone unit is never the shelf.
  expect(shelved(50, [[H, M, H], 5000])).toEqual([[H, M, S]]);
  expect(shelved(50, [[M], 2000], [[h], 1000], [[H], 2000])).toEqual([[M], [h], [H]]);
  expect(shelved(50, [[H, h], 2500])).toEqual([[S, h]]);
});

test('a second shelf unit: over 80 m², or on a wall with more than 8.4 m free; the narrow one from 7 m', () => {
  // A long wall: two full units, side by side in the middle of the rack.
  expect(shelved(50, [[H, H, H, H, H, h], 8500])).toEqual([[H, H, S, S, H, h]]);
  expect(shelved(50, [[H, H, H, H, H, H], 9000])).toEqual([[H, H, S, S, H, H]]);
  // Exactly 8.4 m is not more than 8.4 m: the narrow unit comes in beside the shelf instead.
  expect(shelved(50, [[H, H, H, H, H, h], 8400])).toEqual([[H, H, S, s7, H, H]]);
  // From 7 m: the 700 unit that ended the rack becomes shelves, beside the full one.
  expect(shelved(50, [[H, H, H, H, h], 7000])).toEqual([[H, H, S, s7, H]]);
  expect(shelved(50, [[H, H, H, H, h], 6999])).toEqual([[H, H, S, H, h]]);
  // The middle is measured, not counted: a 700 unit at the end does not shift it.
  expect(shelved(50, [[H, H, H, H, H, h], 6999])).toEqual([[H, H, S, H, H, h]]);
  // No 700 unit in the rack: nothing to turn into the narrow shelf.
  expect(shelved(50, [[H, H, H, H], 7200])).toEqual([[H, H, S, H]]);

  // A large shop: beside the first on a wall of 7 m or more, else in the next rack.
  expect(shelved(81, [[H, H, H, H, h], 7200])).toEqual([[H, S, S, H, h]]);
  expect(shelved(81, [[H, H, H], 5000], [[H, H], 3000])).toEqual([[H, S, H], [H, S]]);
  expect(shelved(80, [[H, H, H], 5000], [[H, H], 3000])).toEqual([[H, S, H], [H, H]]);
  // Never more than two, however large the shop and long the walls.
  const all = shelved(200, [[H, H, H, H, H, H, h], 10000], [[H, H, H, H, H, H], 9000], [[H, H, H], 5000]).flat();
  expect(all.filter((m) => m === S || m === s7)).toHaveLength(2);
});

test('a proposal has one shelf unit; a large shop two, side by side', () => {
  const shelves = (p: Project, style: 'volume' | 'brand') =>
    proposeLayout(p, { style, aisle: 900, wallRacks: true })
      .inventory.filter((i) => i.modules?.length)
      .map((i) => i.modules!);
  for (const style of ['volume', 'brand'] as const) {
    // 42 m², no wall with 7 m free.
    const small = shelves(project(room(6500, 6500, [door('c2', 3250)])), style);
    expect(small.flat().filter((m) => m === S), style).toHaveLength(1);
    expect(small.flat().filter((m) => m === s7), style).toHaveLength(0);
    // The rack with the shelves still has hanging in it.
    expect(small.find((m) => m.includes(S))!.some((m) => m === H), style).toBe(true);
  }
  // 108 m² with a 12 m wall: two, next to each other in the same rack.
  const large = shelves(shop, 'volume');
  expect(large.flat().filter((m) => m === S)).toHaveLength(2);
  const rack = large.find((m) => m.includes(S))!;
  expect(rack.lastIndexOf(S) - rack.indexOf(S)).toBe(1);
  expect(rack.filter((m) => m === H).length).toBeGreaterThanOrEqual(2);
  // A large brand shop keeps its racks short: one shelf unit in each of two racks.
  const brand = shelves(shop, 'brand');
  expect(brand.filter((m) => m.includes(S))).toHaveLength(2);
  expect(brand.flat().filter((m) => m === S)).toHaveLength(2);
});

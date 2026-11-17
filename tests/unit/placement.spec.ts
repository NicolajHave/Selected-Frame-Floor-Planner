import { test, expect } from '@playwright/test';
import { fitOpening, freeStretches, placeOpening, stretchAround } from '@/geometry/openings';
import { tallestWall, wallHeightNear, wallHeightOf } from '@/geometry/wallStyle';
import { buildPartsList } from '@/lib/partsList';
import { itemMount, rackContents, rackSize, rackSlots, rackSummary } from '@/lib/racks';
import type { ElectricalPoint, InventoryItem, Opening, RoomPolygon } from '@/model/objects';
import { electricalAnchor, reanchorElectrical, wallAnchorAt } from '@/geometry/electrical';
import type { Mm, Radians } from '@/model/units';
import { migrate } from '@/lib/schema';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });

function door(id: string, offset: number, width = 900, wall = 'c0'): Opening {
  return {
    id,
    kind: 'door',
    wallStartCornerId: wall,
    offset: offset as Mm,
    width: width as Mm,
    height: 2100 as Mm,
    sillHeight: 0 as Mm,
    hinge: 'start',
    swing: 'in',
  };
}

// 10 × 7 m, 120 mm walls; wall 1 along the top.
function room(openings: Opening[] = [], walls: RoomPolygon['walls'] = undefined): RoomPolygon {
  return {
    id: 'r',
    closed: true,
    wallThickness: 120 as Mm,
    wallHeight: 2700 as Mm,
    corners: [P(0, 0), P(10000, 0), P(10000, 7000), P(0, 7000)].map((point, i) => ({ id: `c${i}`, point })),
    openings,
    walls,
  };
}

test.describe('placing doors and windows', () => {
  test('free stretches stop at the inside faces of the corners and around other openings', () => {
    expect(freeStretches(room(), 0)).toEqual([[60, 9940]]);
    // A 900 door centred at 3000 blocks 2550..3450 plus a 50 mm gap each side.
    expect(freeStretches(room([door('d', 3000)]), 0)).toEqual([
      [60, 2500],
      [3500, 9940],
    ]);
    // …except for the opening being moved itself.
    expect(freeStretches(room([door('d', 3000)]), 0, 'd')).toEqual([[60, 9940]]);
  });

  test('a door clicked into a corner slides clear of the side wall', () => {
    expect(fitOpening(room(), 0, 900, 100)).toBe(510); // 60 + 450
    expect(fitOpening(room(), 0, 900, 9990)).toBe(9490);
  });

  test('a second opening never lands on top of the first', () => {
    const r = room([door('d', 3000)]);
    // Wanted at 3200: the nearer free side is after the door.
    expect(fitOpening(r, 0, 1200, 3200)).toBe(4100); // 3500 + 600
    expect(fitOpening(r, 0, 1200, 2700)).toBe(1900); // 2500 − 600
  });

  test('no room left on a wall: nothing is placed', () => {
    const r = room([door('a', 2500, 4800), door('b', 7500, 4600)]);
    expect(fitOpening(r, 0, 900, 5000)).toBeNull();
    expect(placeOpening(r, P(5000, 100), 900, 600)).toEqual({ ok: false, index: 0, reason: 'full' });
  });

  test('clicks far from every wall are refused', () => {
    expect(placeOpening(room(), P(5000, 3500), 900, 600)).toEqual({ ok: false, index: null, reason: 'far' });
    expect(placeOpening(room(), P(10050, 3500), 900, 600)).toEqual({ ok: true, index: 1, cornerId: 'c1', offset: 3500 });
  });

  test('the free stretch around an opening bounds how wide it can get', () => {
    const r = room([door('a', 3000), door('b', 6000)]);
    expect(stretchAround(r, 0, 6000, 'b')).toEqual([3500, 9940]);
  });
});

test.describe('wall settings', () => {
  test('a wall can have its own height; the others keep the room’s', () => {
    const r = room([], { c1: { height: 3200 as Mm }, c2: { transparent: true } });
    expect([0, 1, 2, 3].map((i) => wallHeightOf(r, i))).toEqual([2700, 3200, 2700, 2700]);
    expect(tallestWall(r)).toBe(3200);
    expect(wallHeightNear(r, P(9900, 3000))).toBe(3200);
    expect(wallHeightNear(r, P(100, 3000))).toBe(2700);
  });
});

test.describe('wall racks', () => {
  const modules = ['105-99-003', '105-99-004', '105-99-010']; // 1506×434, 1506×517, 810×517

  test('units line up left to right with their backs together, sharing the uprights between them', () => {
    // 1506 + 1506 + 810, less the 95 mm pair of uprights at each of the two joins.
    expect(rackSize(modules)).toEqual({ width: 3632, depth: 517, height: 2288 });
    const slots = rackSlots(modules);
    // 1411 mm from one 1400 unit to the next; neighbours overlap by the shared uprights.
    expect(slots.map((s) => s.x)).toEqual([-1063, 348, 1411]);
    expect(rackSize(['105-99-004'])).toMatchObject({ width: 1506 });
    expect(rackSize(['105-99-004', '105-99-004'])).toMatchObject({ width: 2917 });
    expect(rackSize(['105-99-010', '105-99-010'])).toMatchObject({ width: 1525 });
    // The shallower sidehang sits back against the wall.
    expect(slots.map((s) => s.y)).toEqual([-41.5, 0, 0]);
    expect(rackSummary(modules)).toMatchObject({ units: 3, hangers: 35 });
    expect(rackContents([...modules, '105-99-004'])).toBe(
      '1× Wall Unit Sidehang, 2× Wall Unit 1400 - Shelves, 1× Wall Unit 700 - Shelf',
    );
  });

  test('a rack snaps to walls and counts as its units in the parts list', () => {
    const rack: InventoryItem = {
      id: 'rack',
      type: 'inventory',
      name: 'Wall rack 1',
      modules: [...modules, '105-99-004'],
      position: P(0, 0),
      size: rackSize(modules),
      rotation: 0 as Radians,
    };
    expect(itemMount(rack)).toBe('wall');
    const list = buildPartsList([rack]);
    // Four units in one run: left and right columns and three between.
    expect(list.totalUnits).toBe(4 + 1 + 3 + 1);
    expect(list.rows.find((r) => r.itemNumber === '105-99-001-02')!.quantity).toBe(3);
    const shelves = list.rows.find((r) => r.itemNumber === '105-99-004')!;
    expect(shelves.quantity).toBe(2);
    expect(shelves.itemIds).toEqual(['rack']);
  });
});

test.describe('electrical points', () => {
  test('wall points sit on the inside face; corner changes keep them in place', async () => {
    const r = room();
    const anchor = wallAnchorAt(r, P(3000, 200), 600)!;
    expect(anchor).toEqual({ wallStartCornerId: 'c0', offset: 3000 });
    const e: ElectricalPoint = { id: 'e', kind: 'socket', ...anchor, height: 300 as Mm };
    expect(electricalAnchor(r, e)!.point).toEqual({ x: 3000, y: 60 });
    // Clicked into the corner: stops at the side wall's inside face.
    expect(wallAnchorAt(r, P(30, -50), 600)).toEqual({ wallStartCornerId: 'c0', offset: 60 });
    expect(wallAnchorAt(r, P(5000, 3500), 600)).toBeNull();

    // A corner in the middle of the top wall is removed: the point moves
    // onto the merged wall at the same spot.
    const split: RoomPolygon = {
      ...r,
      corners: [P(0, 0), P(5000, 0), P(10000, 0), P(10000, 7000), P(0, 7000)].map((point, i) => ({ id: `k${i}`, point })),
    };
    const onRight: ElectricalPoint = { id: 'e', kind: 'socket', wallStartCornerId: 'k1', offset: 1000 as Mm, height: 300 as Mm };
    const merged = { ...split, corners: split.corners.filter((c) => c.id !== 'k1') };
    const [moved] = reanchorElectrical([onRight], split, merged);
    expect(moved).toMatchObject({ wallStartCornerId: 'k0', offset: 6000 });
  });
});

test('plans saved before racks shared their uprights get the new rack widths when opened', () => {
  const modules = ['105-99-004', '105-99-004', '105-99-010'];
  const old = {
    id: 'rack', type: 'inventory', name: 'Wall rack (3 units)', category: 'Wall rack', modules,
    position: { x: 5000, y: 300 }, size: { width: 3802, depth: 517, height: 2288 }, rotation: 0,
  };
  const single = { ...old, id: 'unit', modules: undefined, assetRef: '105-99-004', size: { width: 1496, depth: 517, height: 2288 } };
  const p = migrate({
    schemaVersion: 1, id: 'p', name: 'Shop', createdAt: '', updatedAt: '', units: 'mm', room: null, pillars: [],
    inventory: [old, single],
    variants: [{ id: 'v', name: 'B', inventory: [old] }],
  });
  // The rack keeps its centre and takes the width its units now add up to.
  expect(p.inventory[0]!.size.width).toBe(1506 + 1506 + 810 - 2 * 95);
  expect(p.inventory[0]!.position).toEqual({ x: 5000, y: 300 });
  expect(p.variants![0]!.inventory![0]!.size.width).toBe(3632);
  // A single unit is left as it was saved.
  expect(p.inventory[1]!.size.width).toBe(1496);
});


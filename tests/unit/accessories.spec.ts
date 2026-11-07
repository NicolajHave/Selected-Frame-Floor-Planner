import { test, expect } from '@playwright/test';
import {
  PRICE_SIGN,
  RACK_SIGN,
  TABLE_SIGN,
  TRAY_3X3,
  TRAY_3X5,
  accessoryHosts,
  accessoryOptions,
  freeShelf,
  isAccessory,
  placeAccessories,
  roomFor,
} from '@/lib/accessories';
import { buildPartsList } from '@/lib/partsList';
import { findAsset } from '@/lib/assetCatalog';
import type { Accessory, InventoryItem } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

function item(assetRef: string | undefined, accessories: Accessory[] = [], modules?: string[]): InventoryItem {
  const asset = findAsset(assetRef);
  return {
    id: 'inv',
    type: 'inventory',
    name: asset?.name ?? 'Rack',
    assetRef,
    modules,
    accessories,
    position: { x: 0 as Mm, y: 0 as Mm },
    size: asset ? { ...asset.size } : { width: 2992 as Mm, depth: 517 as Mm, height: 2288 as Mm },
    rotation: 0 as Radians,
  };
}

test('each accessory belongs to its own fixtures', () => {
  const ids = (host: string) => accessoryOptions(host).map((o) => o.asset.id);
  for (const rack of ['105-06-001', '105-06-002', '105-06-010', '105-06-011', '105-06-013', '105-06-014', '105-06-014-700']) {
    expect(ids(rack)).toEqual([RACK_SIGN]);
  }
  expect(ids('105-17-007')).toEqual(['105-15-001']);
  expect(ids('105-99-010')).toEqual([TRAY_3X3, TRAY_3X5]);
  expect(ids('105-99-004')).toEqual([TRAY_3X3, TRAY_3X5]);
  expect(ids('105-17-001')).toEqual([TABLE_SIGN]);
  expect(ids('112-18-001')).toEqual([PRICE_SIGN]);
  expect(ids('112-18-002')).toEqual([PRICE_SIGN]);
  expect(ids('105-99-003')).toEqual([]);
  expect(isAccessory(RACK_SIGN)).toBe(true);
  expect(isAccessory('105-06-001')).toBe(false);
});

test('the rack sign sits in the thick end, its holder on top of the posts', () => {
  const [p] = placeAccessories(item('105-06-001', [{ id: 'a', assetRef: RACK_SIGN }]));
  expect(p).toMatchObject({ x: -615, y: 0, z: 1508 - 95 });
  const [tall] = placeAccessories(item('105-06-014-700', [{ id: 'a', assetRef: RACK_SIGN }]));
  expect(tall).toMatchObject({ x: -360, z: 1708 - 95 });
  // One per rack.
  const host = accessoryHosts(item('105-06-001'))[0]!;
  expect(roomFor(item('105-06-001', [{ id: 'a', assetRef: RACK_SIGN }]), host, RACK_SIGN)).toBe(0);
});

test('signs on tables and in front of mannequins', () => {
  const signs = placeAccessories(
    item('105-17-001', [
      { id: 'a', assetRef: TABLE_SIGN },
      { id: 'b', assetRef: TABLE_SIGN },
    ]),
  );
  expect(signs.map((p) => [p.x, p.z])).toEqual([
    [-450, 816],
    [450, 816],
  ]);
  const [price] = placeAccessories(item('112-18-001', [{ id: 'a', assetRef: PRICE_SIGN }]));
  // Front edge of the mannequin (200) + 40 mm + half the sign's depth.
  expect(price!.y).toBeCloseTo(200 + 40 + 120.5);
  expect(price!.z).toBe(0);
});

test('trays fill a shelf left to right and go to the next shelf when full', () => {
  const unit = item('105-99-010');
  const host = accessoryHosts(unit)[0]!;
  // Eye level (shelf 3, 1160 mm) first.
  expect(freeShelf(unit, host, TRAY_3X3)).toBe(2);
  const two: Accessory[] = [
    { id: 'a', assetRef: TRAY_3X3, shelf: 2 },
    { id: 'b', assetRef: TRAY_3X3, shelf: 2 },
  ];
  const placed = placeAccessories(item('105-99-010', two));
  expect(placed.map((p) => p.z)).toEqual([1160, 1160]);
  expect(placed[1]!.x - placed[0]!.x).toBeCloseTo(287 + 15);
  // A 700 shelf takes two 3x3 trays, so the next goes to shelf 2.
  expect(freeShelf(item('105-99-010', two), host, TRAY_3X3)).toBe(1);
  // A 3x5 and a 3x3 don't fit side by side on a 700 shelf …
  expect(freeShelf(item('105-99-010', [{ id: 'a', assetRef: TRAY_3X5, shelf: 2 }]), host, TRAY_3X3)).toBe(1);
  // … but do on a 1400.
  const wide = item('105-99-004', [{ id: 'a', assetRef: TRAY_3X5, shelf: 2 }]);
  expect(freeShelf(wide, accessoryHosts(wide)[0]!, TRAY_3X3)).toBe(2);
});

test('wall rack units take their own accessories', () => {
  const modules = ['105-99-003', '105-99-004', '105-99-010'];
  const rack = item(undefined, [{ id: 'a', assetRef: TRAY_3X5, module: 1, shelf: 2 }], modules);
  const hosts = accessoryHosts(rack);
  expect(hosts.map((h) => h.module)).toEqual([1, 2]);
  const [p] = placeAccessories(rack);
  // Unit 2 is centred 1496 / 2 + 1496 / 2 - 2992 / 2 + … : just check it is on that unit.
  expect(p!.x).toBeGreaterThan(hosts[0]!.x - 748);
  expect(p!.x).toBeLessThan(hosts[0]!.x + 748);
});

test('accessories count in the parts list', () => {
  const list = buildPartsList([
    item('105-06-001', [{ id: 'a', assetRef: RACK_SIGN }]),
    item('105-99-004', [
      { id: 'b', assetRef: TRAY_3X3, shelf: 2 },
      { id: 'c', assetRef: TRAY_3X3, shelf: 1 },
    ]),
  ]);
  const qty = (id: string) => list.rows.find((r) => r.itemNumber === findAsset(id)!.itemNumber)?.quantity;
  expect(qty(RACK_SIGN)).toBe(1);
  expect(qty(TRAY_3X3)).toBe(2);
  expect(qty('105-06-001')).toBe(1);
});

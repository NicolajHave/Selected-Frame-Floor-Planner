import { test, expect } from '@playwright/test';
import { buildPartsList } from '@/lib/partsList';
import { columnCounts, wallRuns } from '@/lib/columns';
import { ASSET_CATALOG, findAsset } from '@/lib/assetCatalog';
import { PRICES } from '@/lib/prices';
import { rackSize } from '@/lib/racks';
import type { InventoryItem } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

/** A catalog item with its back against the line y = `back` (as wall snapping leaves it). */
function unit(id: string, ref: string, x: number, back = 0, rotation = 0): InventoryItem {
  const a = findAsset(ref)!;
  const d = (a.size.depth / 2) * (rotation ? -1 : 1);
  return {
    id,
    type: 'inventory',
    name: a.name,
    assetRef: ref,
    position: { x: x as Mm, y: (back + d) as Mm },
    size: { ...a.size },
    rotation: rotation as Radians,
  };
}

test('every price points at a catalog item', () => {
  for (const id of Object.keys(PRICES)) expect(findAsset(id), id).toBeTruthy();
  // Only these have no price yet: not in the system export nor the supplier calculation.
  const unpriced = ASSET_CATALOG.filter((a) => !PRICES[a.id]).map((a) => a.id);
  expect(unpriced).toEqual(['105-15-002', '105-13-LED', '105-19-001']);
});

test('wall units side by side share columns; separate ones each have two', () => {
  // Two 1496 mm units touching (different depths, backs in line), then one on its own.
  const inv = [unit('a', '105-99-004', 0), unit('b', '105-99-003', 1496), unit('c', '105-99-010', 5000)];
  const runs = wallRuns(inv);
  expect(runs.map((r) => r.units).sort()).toEqual([1, 2]);
  expect(columnCounts(runs)).toEqual({ left: 2, mid: 1, right: 2 });

  // Facing the other way (another wall) never joins.
  expect(wallRuns([unit('a', '105-99-004', 0), unit('b', '105-99-004', 1496, 0, Math.PI)])).toHaveLength(2);
});

test('a wall rack of n units needs n + 1 columns; prices add up', () => {
  const modules = ['105-99-004', '105-99-003', '105-99-010'];
  const rack: InventoryItem = {
    id: 'r',
    type: 'inventory',
    name: 'Wall rack 1',
    modules,
    position: { x: 0 as Mm, y: 0 as Mm },
    size: rackSize(modules),
    rotation: 0 as Radians,
  };
  const list = buildPartsList([rack, unit('t', '105-17-007', 0, 3000)]);
  const qty = (n: string) => list.rows.find((r) => r.itemNumber === n)?.quantity ?? 0;
  expect([qty('105-99-001-01'), qty('105-99-001-02'), qty('105-99-001-03')]).toEqual([1, 2, 1]);
  // Wall units and columns from the system list; the table from the &elements quote.
  expect(list.totalPriceEur).toBe(1586 + 252 + 1126 + 4 * 419 + 2497);
  expect(list.rows.find((r) => r.itemNumber === '105-99-004')!.priceSource).toBe('system');
  expect(list.rows.find((r) => r.itemNumber === '105-17-007')!.priceSource).toBe('quote');
  expect(list.unitsWithoutPrice).toBe(0);
  const podium = buildPartsList([unit('p', '105-09-002', 0)]).rows[0]!;
  expect(podium).toMatchObject({ unitPriceEur: 484, priceSource: 'quote', sku: '105-09-002-A', supplier: '&elements' });
});

import { test, expect } from '@playwright/test';
import { buildPartsList } from '@/lib/partsList';
import { columnCounts, wallRuns } from '@/lib/columns';
import { ASSET_CATALOG, findAsset } from '@/lib/assetCatalog';
import { PRICES, activePriceList, priceOf, setPriceList } from '@/lib/prices';
import { PRICE_ROWS, parsePrice, pricesFromCsv } from '@/lib/priceRows';
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
  // Two 1506 mm units touching (different depths, backs in line), then one on its own.
  const inv = [unit('a', '105-99-004', 0), unit('b', '105-99-003', 1506), unit('c', '105-99-010', 5000)];
  const runs = wallRuns(inv);
  expect(runs.map((r) => r.units).sort()).toEqual([1, 2]);
  expect(columnCounts(runs)).toEqual({ left: 2, mid: 1, right: 2 });

  // Facing the other way (another wall) never joins.
  expect(wallRuns([unit('a', '105-99-004', 0), unit('b', '105-99-004', 1506, 0, Math.PI)])).toHaveLength(2);
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

test('items are priced by their catalog id: mannequins have a price, the two H1700 racks their own', () => {
  const rows = buildPartsList([
    unit('f', '112-18-001', 0), unit('m', '112-18-002', 2000),
    unit('r14', '105-06-014', 4000), unit('r7', '105-06-014-700', 7000),
  ]).rows;
  const price = (name: string) => rows.find((r) => r.name === name)!.unitPriceEur;
  expect(price('Long Torso Female')).toBe(440);
  expect(price('Long Torso Male')).toBe(453);
  // Same item number in the catalog (105-06-014), different racks and prices.
  expect(price('Floor Rack 1400 H1700')).toBe(527);
  expect(price('Floor Rack 700 H1700')).toBe(470);
});

test('a price list from the cloud lies over the built-in one', () => {
  const inv = [unit('a', '105-99-004', 0), unit('b', '105-99-004', 1506), unit('rack', '105-06-001', 5000, 3000), unit('led', '105-13-LED', 8000)];
  const before = buildPartsList(inv);
  expect(activePriceList()).toMatchObject({ name: '&elements quote 00309, rev. 03', builtIn: true });
  try {
    setPriceList({
      name: 'Prices 2027', date: '2027-01-04',
      prices: { '105-06-001': 550, '105-13-LED': 900, '105-99-004': null, 'column:mid': 400 },
    });
    expect(activePriceList()).toEqual({ name: 'Prices 2027', date: '2027-01-04', currency: 'EUR', builtIn: false });
    const after = buildPartsList(inv);
    const row = (list: typeof after, name: string) => list.rows.find((r) => r.name === name)!;
    // A changed price, a price for something that had none, and an item taken off the list.
    expect(row(after, 'Floor Rack 1400')).toMatchObject({ unitPriceEur: 550, priceSource: 'list' });
    expect(row(after, 'LED Logo').unitPriceEur).toBe(900);
    expect(row(before, 'LED Logo').unitPriceEur).toBeUndefined();
    expect(row(after, 'Wall Unit 1400 - Shelves').unitPriceEur).toBeUndefined();
    expect(after.unitsWithoutPrice).toBe(2);
    // Columns are on the list too; what it does not mention keeps the built-in price.
    expect(row(after, 'Wall rack column – middle').unitPriceEur).toBe(400);
    expect(row(after, 'Wall rack column – left')).toMatchObject({ unitPriceEur: 419, priceSource: 'system' });
    expect(after.totalPriceEur).toBe(550 + 900 + 400 + 419 + 419);
  } finally {
    setPriceList(null);
  }
  expect(priceOf('105-06-001')!.priceEur).toBe(506);
  expect(buildPartsList(inv).totalPriceEur).toBe(before.totalPriceEur);
});

test('prices are read the way they are typed, and from a CSV file', () => {
  expect(parsePrice('506')).toBe(506);
  expect(parsePrice('1.586,50')).toBe(1586.5);
  expect(parsePrice('1586.5')).toBe(1586.5);
  expect(parsePrice(' 440 € ')).toBe(440);
  expect(parsePrice('')).toBeNull();
  expect(parsePrice('abc')).toBeUndefined();
  expect(parsePrice('-5')).toBeUndefined();
  expect(parsePrice('2000000')).toBeUndefined();

  // Every catalog item and the three columns can have a price.
  expect(PRICE_ROWS.map((r) => r.key)).toEqual(expect.arrayContaining(['105-06-001', '112-18-001', '105-13-LED', 'column:left', 'column:mid', 'column:right']));
  const read = pricesFromCsv([
    'id;item number;name;price (EUR)',
    '105-06-001;105-06-001;Floor Rack 1400;550',
    '112_18_002;;Long Torso Male;460,5', // by item number
    'column:mid;105-99-001-02;Wall rack column – middle;400',
    'unknown-item;x;y;12',
    '105-17-001;105-17-001;Volume Table;not a price',
    '105-13-LED;;LED Logo;',
  ].join('\n'));
  expect(read).toEqual({ '105-06-001': '550', '112-18-002': '460,5', 'column:mid': '400', '105-13-LED': '' });
});


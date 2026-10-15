import { test, expect } from '@playwright/test';
import { buildPartsList, partsListToCsv } from '@/lib/partsList';
import { findAsset } from '@/lib/assetCatalog';
import type { InventoryItem } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

function item(id: string, assetRef?: string, name = 'Custom'): InventoryItem {
  const asset = findAsset(assetRef);
  return {
    id,
    type: 'inventory',
    name: asset?.name ?? name,
    assetRef,
    position: { x: 0 as Mm, y: 0 as Mm },
    size: asset ? { ...asset.size } : { width: 1200 as Mm, depth: 600 as Mm, height: 900 as Mm },
    rotation: 0 as Radians,
  };
}

test('groups catalog items and totals weight and hangers', () => {
  const list = buildPartsList([
    item('a', '105-06-001'),
    item('b', '105-06-001'),
    item('c', '105-99-004'),
  ]);
  expect(list.rows).toHaveLength(2);
  const rack = list.rows.find((r) => r.itemNumber === '105-06-001')!;
  expect(rack.quantity).toBe(2);
  expect(rack.totalWeightKg).toBeCloseTo(32.6);
  expect(rack.totalHangers).toBe(100);
  expect(list.totalUnits).toBe(3);
  expect(list.totalWeightKg).toBeCloseTo(32.6 + 71.3);
  expect(list.totalHangers).toBe(100);
});

test('items without a catalog weight are counted, not guessed', () => {
  const list = buildPartsList([item('a', '105-13-001'), item('b', '105-09-003')]);
  expect(list.totalWeightKg).toBe(42);
  expect(list.unitsWithoutWeight).toBe(1);
});

test('placeholders are listed as not-in-catalog rows', () => {
  const list = buildPartsList([item('a', undefined, 'Display table'), item('b', undefined, 'Display table')]);
  expect(list.rows).toEqual([
    expect.objectContaining({ name: 'Display table', quantity: 2, catalog: false, itemNumber: '' }),
  ]);
});

test('legacy asset ids from the first library version still resolve', () => {
  expect(findAsset('105-09-002-A')?.id).toBe('105-09-002');
});

test('CSV: BOM, semicolons, decimal commas, quoting', () => {
  const list = buildPartsList([item('a', '105-06-001'), item('b', undefined, 'Table; large')]);
  const csv = partsListToCsv(list, 'Store "A"');
  const lines = csv.split('\r\n');
  expect(lines[0]).toBe(
    '﻿Item number;Name;Category;Qty;Width (mm);Depth (mm);Height (mm);Material;Unit weight (kg);Total weight (kg);Hangers per unit;Total hangers;HS codes',
  );
  expect(csv).toContain('105-06-001;Floor Rack 1400;Racks;1;1310;500;1758;Stainless Steel;16,3;16,3;50;50;94032080');
  expect(csv).toContain('"Table; large"');
  expect(csv).toContain('Total;"Store ""A""";;2;');
});

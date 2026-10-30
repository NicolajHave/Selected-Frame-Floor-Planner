import type { InventoryItem } from '@/model/objects';
import { findAsset } from './assetCatalog';
import { COLUMNS, priceOf, type PriceEntry } from './prices';
import { columnCounts, wallRuns } from './columns';

export interface PartsListRow {
  itemNumber: string;
  name: string;
  category: string;
  quantity: number;
  /** Size of one unit, mm. */
  width: number;
  depth: number;
  height: number;
  material: string;
  unitWeightKg?: number;
  totalWeightKg?: number;
  hsCodes: string[];
  hangersPerUnit?: number;
  totalHangers?: number;
  /** False for placeholders that aren't in the SIS catalog. */
  catalog: boolean;
  /** The placed inventory items this row counts. */
  itemIds: string[];
  /** SKU in the price system, when it differs from the item number. */
  sku?: string;
  unitPriceEur?: number;
  totalPriceEur?: number;
  /** Where the price comes from: the system price list, or the supplier's calculation. */
  priceSource?: PriceEntry['source'];
  supplier?: string;
}

export interface PartsList {
  rows: PartsListRow[];
  totalUnits: number;
  /** Sum over rows with a known weight. */
  totalWeightKg: number;
  /** Units whose weight the catalog doesn't state. */
  unitsWithoutWeight: number;
  totalHangers: number;
  /** Sum over rows with a known price, euro. */
  totalPriceEur: number;
  /** Units with no price in the price list. */
  unitsWithoutPrice: number;
}

/**
 * Groups placed inventory into a bill of materials. Catalog items group by
 * catalog entry; anything else (generic placeholders) groups by name + size.
 */
export function buildPartsList(inventory: InventoryItem[]): PartsList {
  const byKey = new Map<string, PartsListRow>();

  // A wall rack counts as each of its units.
  const units = inventory.flatMap((item) =>
    item.modules?.length
      ? item.modules.map((ref) => ({ item, asset: findAsset(ref) })).filter((u) => u.asset)
      : [{ item, asset: findAsset(item.assetRef) }],
  );

  for (const { item, asset } of units) {
    const key = asset
      ? `asset:${asset.id}`
      : `custom:${item.name}:${item.size.width}x${item.size.depth}x${item.size.height}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += 1;
      if (!existing.itemIds.includes(item.id)) existing.itemIds.push(item.id);
      continue;
    }
    byKey.set(
      key,
      asset
        ? {
            itemNumber: asset.itemNumber,
            name: asset.name,
            category: asset.category,
            quantity: 1,
            width: asset.size.width,
            depth: asset.size.depth,
            height: asset.size.height,
            material: asset.material,
            unitWeightKg: asset.weightKg,
            hsCodes: asset.hsCodes,
            hangersPerUnit: asset.hangerCount,
            catalog: true,
            itemIds: [item.id],
          }
        : {
            itemNumber: '',
            name: item.name,
            category: item.category ?? 'Custom',
            quantity: 1,
            width: item.size.width,
            depth: item.size.depth,
            height: item.size.height,
            material: '',
            hsCodes: [],
            catalog: false,
            itemIds: [item.id],
          },
    );
  }

  // Wall units stand between columns: one at each end of a run, one between neighbours.
  const runs = wallRuns(inventory);
  const counts = columnCounts(runs);
  const runItemIds = runs.flatMap((r) => r.itemIds);
  for (const side of ['left', 'mid', 'right'] as const) {
    if (counts[side] === 0) continue;
    const c = COLUMNS[side];
    byKey.set(`column:${side}`, {
      itemNumber: c.itemNumber,
      name: c.name,
      category: 'Wall Units',
      quantity: counts[side],
      width: 40,
      depth: 40,
      height: 2288,
      material: 'Stainless steel',
      hsCodes: [],
      catalog: true,
      itemIds: [...runItemIds],
    });
  }

  const rows = [...byKey.values()]
    .map((r) => {
      const price = r.priceSource ? undefined : priceFor(r);
      const unitPriceEur = r.unitPriceEur ?? price?.priceEur;
      return {
        ...r,
        ...(price && {
          sku: price.sku !== r.itemNumber ? price.sku : undefined,
          priceSource: price.source,
          supplier: price.supplier || undefined,
        }),
        unitPriceEur,
        totalPriceEur: unitPriceEur !== undefined ? unitPriceEur * r.quantity : undefined,
        totalWeightKg: r.unitWeightKg !== undefined ? r.unitWeightKg * r.quantity : undefined,
        totalHangers: r.hangersPerUnit !== undefined ? r.hangersPerUnit * r.quantity : undefined,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.itemNumber.localeCompare(b.itemNumber));

  return {
    rows,
    totalUnits: rows.reduce((n, r) => n + r.quantity, 0),
    totalWeightKg: rows.reduce((n, r) => n + (r.totalWeightKg ?? 0), 0),
    unitsWithoutWeight: rows.reduce((n, r) => n + (r.unitWeightKg === undefined ? r.quantity : 0), 0),
    totalHangers: rows.reduce((n, r) => n + (r.totalHangers ?? 0), 0),
    totalPriceEur: rows.reduce((n, r) => n + (r.totalPriceEur ?? 0), 0),
    unitsWithoutPrice: rows.reduce((n, r) => n + (r.unitPriceEur === undefined ? r.quantity : 0), 0),
  };
}

function priceFor(r: PartsListRow): PriceEntry | undefined {
  if (!r.catalog) return undefined;
  const column = Object.values(COLUMNS).find((c) => c.itemNumber === r.itemNumber);
  return column ? column.price : priceOf(r.itemNumber);
}

/** Danish-locale number: decimal comma, no thousands separator. */
function num(n: number | undefined): string {
  if (n === undefined) return '';
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Euro with two decimals and a decimal comma. */
function money(n: number | undefined): string {
  return n === undefined ? '' : n.toFixed(2).replace('.', ',');
}

function cell(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Semicolon-separated with decimal commas and a UTF-8 BOM, so it opens
 * straight into columns in Excel with Danish regional settings.
 */
export function partsListToCsv(list: PartsList, projectName: string): string {
  const header = [
    'Item number', 'Name', 'Category', 'Qty',
    'Width (mm)', 'Depth (mm)', 'Height (mm)', 'Material',
    'Unit weight (kg)', 'Total weight (kg)', 'Hangers per unit', 'Total hangers', 'HS codes',
    'SKU', 'Unit price (EUR)', 'Total price (EUR)', 'Price source', 'Supplier',
  ];
  const lines = [
    header,
    ...list.rows.map((r) => [
      r.itemNumber, r.name, r.category, String(r.quantity),
      num(r.width), num(r.depth), num(r.height), r.material,
      num(r.unitWeightKg), num(r.totalWeightKg), num(r.hangersPerUnit), num(r.totalHangers),
      r.hsCodes.join(' / '),
      r.sku ?? r.itemNumber, money(r.unitPriceEur), money(r.totalPriceEur),
      r.priceSource === 'quote' ? '&elements quote' : r.priceSource === 'system' ? 'System price list' : '',
      r.supplier ?? '',
    ]),
    [],
    ['Total', projectName, '', String(list.totalUnits), '', '', '', '', '',
      num(list.totalWeightKg), '', num(list.totalHangers), '', '', '', money(list.totalPriceEur), '', ''],
  ];
  return '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n';
}

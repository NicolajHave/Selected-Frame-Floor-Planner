import type { InventoryItem } from '@/model/objects';
import { findAsset } from './assetCatalog';

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
}

export interface PartsList {
  rows: PartsListRow[];
  totalUnits: number;
  /** Sum over rows with a known weight. */
  totalWeightKg: number;
  /** Units whose weight the catalog doesn't state. */
  unitsWithoutWeight: number;
  totalHangers: number;
}

/**
 * Groups placed inventory into a bill of materials. Catalog items group by
 * catalog entry; anything else (generic placeholders) groups by name + size.
 */
export function buildPartsList(inventory: InventoryItem[]): PartsList {
  const byKey = new Map<string, PartsListRow>();

  for (const item of inventory) {
    const asset = findAsset(item.assetRef);
    const key = asset
      ? `asset:${asset.id}`
      : `custom:${item.name}:${item.size.width}x${item.size.depth}x${item.size.height}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.itemIds.push(item.id);
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

  const rows = [...byKey.values()]
    .map((r) => ({
      ...r,
      totalWeightKg: r.unitWeightKg !== undefined ? r.unitWeightKg * r.quantity : undefined,
      totalHangers: r.hangersPerUnit !== undefined ? r.hangersPerUnit * r.quantity : undefined,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.itemNumber.localeCompare(b.itemNumber));

  return {
    rows,
    totalUnits: rows.reduce((n, r) => n + r.quantity, 0),
    totalWeightKg: rows.reduce((n, r) => n + (r.totalWeightKg ?? 0), 0),
    unitsWithoutWeight: rows.reduce((n, r) => n + (r.unitWeightKg === undefined ? r.quantity : 0), 0),
    totalHangers: rows.reduce((n, r) => n + (r.totalHangers ?? 0), 0),
  };
}

/** Danish-locale number: decimal comma, no thousands separator. */
function num(n: number | undefined): string {
  if (n === undefined) return '';
  return String(Math.round(n * 10) / 10).replace('.', ',');
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
  ];
  const lines = [
    header,
    ...list.rows.map((r) => [
      r.itemNumber, r.name, r.category, String(r.quantity),
      num(r.width), num(r.depth), num(r.height), r.material,
      num(r.unitWeightKg), num(r.totalWeightKg), num(r.hangersPerUnit), num(r.totalHangers),
      r.hsCodes.join(' / '),
    ]),
    [],
    ['Total', projectName, '', String(list.totalUnits), '', '', '', '', '',
      num(list.totalWeightKg), '', num(list.totalHangers), ''],
  ];
  return '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n';
}

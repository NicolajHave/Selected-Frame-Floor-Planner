import { ASSET_CATALOG } from './assetCatalog';
import { COLUMNS } from './prices';

/** One line of the price list: something that can have a price. */
export interface PriceRow {
  /** What the price list knows the item by: its catalog id, or a column key. */
  key: string;
  itemNumber: string;
  name: string;
  group: string;
}

/** Everything that can have a price: the catalog, then the wall rack columns. */
export const PRICE_ROWS: PriceRow[] = [
  ...ASSET_CATALOG.map((a) => ({ key: a.id, itemNumber: a.itemNumber, name: a.name, group: a.category as string })),
  ...Object.values(COLUMNS).map((c) => ({ key: c.key, itemNumber: c.itemNumber, name: c.name, group: 'Wall rack columns' })),
];

/** "1.586,50" / "1586.5" / "" → a price, null for none, undefined when it is not a price. */
export function parsePrice(text: string): number | null | undefined {
  const t = text.trim().replace(/\s|€/g, '');
  if (!t) return null;
  // Danish thousands dots and decimal comma, or a plain decimal point.
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d+)?$/.test(normal)) return undefined;
  const n = Number(normal);
  return n <= 1_000_000 ? Math.round(n * 100) / 100 : undefined;
}

/**
 * Prices from a CSV file: one item per line, its id or item number in the
 * first cell and the price in the last, separated by semicolons or tabs.
 * Returns the prices it could read, as typed, by row key; other lines (a
 * header, unknown items) are skipped.
 */
export function pricesFromCsv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 2) continue;
    const first = cells[0] ?? '';
    const row = PRICE_ROWS.find((r) => r.key === first) ?? PRICE_ROWS.find((r) => r.itemNumber && r.itemNumber === first);
    const price = cells[cells.length - 1] ?? '';
    if (row && parsePrice(price) !== undefined) out[row.key] = price;
  }
  return out;
}

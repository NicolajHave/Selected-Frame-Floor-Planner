/**
 * Sales prices per catalog item, in euro.
 *
 * Source: the system export "TEST OVERSIGT" (SKUs with their current
 * revision letter). Items the export lists at 0 € are filled in from the
 * supplier's calculation, &elements "00309 Selected SIS Frame – 1x SIS
 * price list", 16.02.2026, and marked as such. Items in neither have no
 * price and are counted as "no price" rather than guessed.
 */

export interface PriceEntry {
  /** SKU in the price system, with revision. */
  sku: string;
  priceEur: number;
  source: 'system' | 'supplier';
  supplier?: string;
}

export const PRICE_LIST = {
  name: 'Selected SIS price list',
  date: '2026-02-16',
  currency: 'EUR',
} as const;

const ANDELEMENTS = '&elements';

const system = (sku: string, priceEur: number, supplier = ANDELEMENTS): PriceEntry => ({
  sku,
  priceEur,
  source: 'system',
  supplier,
});
const fromSupplier = (sku: string, priceEur: number): PriceEntry => ({
  sku,
  priceEur,
  source: 'supplier',
  supplier: ANDELEMENTS,
});

/** Keyed by the planner's catalog id (lib/assetCatalog). */
export const PRICES: Readonly<Record<string, PriceEntry>> = {
  // Wall units (the columns between them are priced separately, below)
  '105-99-003': system('105-99-003-A', 252),
  '105-99-004': system('105-99-004-A', 1586),
  '105-99-005': system('105-99-005-A', 792),
  '105-99-006': system('105-99-006-A', 390),
  '105-99-007': system('105-99-007-A', 878),
  '105-99-008': system('105-99-008-A', 3168),
  '105-99-009': system('105-99-009-A', 747),
  '105-99-010': system('105-99-010-A', 1126),
  '105-99-011': system('105-99-011-A', 220),
  '105-99-012': system('105-99-012-A', 202),
  // Racks
  '105-06-001': system('105-06-001-E', 466),
  '105-06-002': system('105-06-002-C', 449),
  '105-06-010': system('105-06-010-C', 924),
  '105-06-011': system('105-06-011-D', 1211),
  '105-06-013': system('105-06-013-B', 1532),
  '105-06-014': system('105-06-014-A', 505),
  '105-06-014-700': system('105-06-015-A', 488),
  '105-06-011-22-C': system('105-06-011-22-D', 45),
  // Podiums
  '105-09-001': system('105-09-001-B', 626),
  '105-09-002': fromSupplier('105-09-002-A', 484),
  '105-09-003': fromSupplier('105-09-003-A', 454),
  // Tables
  '105-17-001': system('105-17-001-B', 2228),
  '105-17-007': system('105-17-007-A', 2124),
  // Accessories, signs, logos
  '105-15-001': system('105-15-001', 174),
  '105-15-003': system('105-15-003-A', 138),
  '105-15-004': system('105-15-004-A', 187),
  '105-13-023': system('105-13-023-A', 18),
  '105-18-001': fromSupplier('105-18-001-B', 53),
  '105-13-001': system('105-13-001-A', 1229),
  '105-13-015': system('105-13-015-A', 224),
  // Mannequins (not from &elements)
  '112-18-001': system('112_99_040', 440.13, ''),
  '112-18-002': system('112_99_041', 453.55, ''),
};

/** Wall rack columns: one at each end of a run of wall units, one between neighbours. */
export const COLUMNS = {
  left: { itemNumber: '105-99-001-01', name: 'Wall rack column – left', price: system('105-99-001-01', 419) },
  mid: { itemNumber: '105-99-001-02', name: 'Wall rack column – middle', price: system('105-99-001-02', 419) },
  right: { itemNumber: '105-99-001-03', name: 'Wall rack column – right', price: system('105-99-001-03', 419) },
} as const;

export function priceOf(catalogId: string | undefined): PriceEntry | undefined {
  return catalogId ? PRICES[catalogId] : undefined;
}

/** "1.586 €" (Danish formatting, whole euros unless there are cents). */
export function eur(n: number): string {
  return `${n.toLocaleString('da-DK', { maximumFractionDigits: 2 })} €`;
}

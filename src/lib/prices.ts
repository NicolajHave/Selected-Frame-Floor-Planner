/**
 * Sales prices per catalog item, in euro.
 *
 * Primary source: the &elements quote "00309 Selected SIS Frame – 1x SIS
 * price list", revision 03, 16.02.2026. It prices racks, podiums, tables,
 * logos and signs as finished products, but wall units only part by part,
 * so wall units, their columns, accessories and mannequins take the system
 * price list ("TEST OVERSIGT" export) instead and are marked as such.
 * Items in neither have no price and are counted as "no price".
 */

export interface PriceEntry {
  /** SKU with revision, as in the source. */
  sku: string;
  priceEur: number;
  /** 'quote': the &elements quote; 'system': the system price list. */
  source: 'quote' | 'system';
  supplier?: string;
}

export const PRICE_LIST = {
  name: '&elements quote 00309, rev. 03',
  date: '2026-02-16',
  currency: 'EUR',
} as const;

const ANDELEMENTS = '&elements';

const quote = (sku: string, priceEur: number): PriceEntry => ({ sku, priceEur, source: 'quote', supplier: ANDELEMENTS });
const system = (sku: string, priceEur: number, supplier = ANDELEMENTS): PriceEntry => ({
  sku,
  priceEur,
  source: 'system',
  supplier: supplier || undefined,
});

/** Keyed by the planner's catalog id (lib/assetCatalog). */
export const PRICES: Readonly<Record<string, PriceEntry>> = {
  // Wall units: system price list (the quote prices their parts)
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
  '105-06-001': quote('105-06-001-E', 506),
  '105-06-002': quote('105-06-002-C', 449),
  '105-06-010': quote('105-06-010-C', 987),
  '105-06-011': quote('105-06-011-D', 1244),
  '105-06-013': quote('105-06-013-B', 1719),
  '105-06-014': quote('105-06-014-A', 527),
  '105-06-014-700': quote('105-06-015-A', 470),
  '105-06-011-22-C': quote('105-06-011-22-B', 56),
  // Podiums
  '105-09-001': quote('105-09-001-B', 929),
  '105-09-002': quote('105-09-002-A', 484),
  '105-09-003': quote('105-09-003-A', 454),
  // Tables
  '105-17-001': quote('105-17-001-B', 3360),
  '105-17-007': quote('105-17-007-A', 2497),
  // Logos and signs
  '105-13-001': quote('105-13-001-A', 1415),
  '105-13-015': quote('105-13-015-A', 253),
  '105-18-001': quote('105-18-001-B', 53),
  '105-13-023': system('105-13-023-A', 18),
  // Accessories
  '105-15-001': system('105-15-001', 174),
  '105-15-003': system('105-15-003-A', 138),
  '105-15-004': system('105-15-004-A', 187),
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

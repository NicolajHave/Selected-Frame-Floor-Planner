import type { OpeningKind } from '@/model/objects';

export interface OpeningType {
  kind: OpeningKind;
  name: string;
  description: string;
  width: number;
  height: number;
  sillHeight: number;
}

/** Defaults for new openings; every value can be changed per opening. */
export const OPENING_TYPES: readonly OpeningType[] = [
  { kind: 'door', name: 'Door', description: '900 × 2100, single leaf', width: 900, height: 2100, sillHeight: 0 },
  { kind: 'double-door', name: 'Double door', description: '1800 × 2100, two leaves', width: 1800, height: 2100, sillHeight: 0 },
  { kind: 'opening', name: 'Opening', description: 'Passage without a door, e.g. a shop-in-shop entrance', width: 2000, height: 2400, sillHeight: 0 },
  { kind: 'window', name: 'Window', description: '1200 wide, sill at 900', width: 1200, height: 2100, sillHeight: 900 },
];

export function openingType(kind: OpeningKind): OpeningType {
  return OPENING_TYPES.find((t) => t.kind === kind)!;
}

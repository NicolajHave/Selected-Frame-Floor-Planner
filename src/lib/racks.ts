import type { InventoryItem } from '@/model/objects';
import type { Size3D } from '@/model/geometry';
import { mm } from '@/model/units';
import { ASSET_CATALOG, findAsset, type AssetEntry } from './assetCatalog';

/** Catalog units that can be combined into a wall rack. */
export const RACK_MODULES: readonly AssetEntry[] = ASSET_CATALOG.filter((a) => a.category === 'Wall Units');

export const RACK_CATEGORY = 'Wall rack';

export const isRack = (item: Pick<InventoryItem, 'modules'>): boolean => !!item.modules?.length;

/** How a placed item is mounted: wall racks and wall units snap to walls. */
export function itemMount(item: Pick<InventoryItem, 'modules' | 'assetRef'>): 'wall' | 'floor' {
  if (isRack(item)) return 'wall';
  return findAsset(item.assetRef)?.mount ?? 'floor';
}

/** The catalog entries of a rack, skipping ids the catalog doesn't know. */
export function rackAssets(modules: readonly string[]): AssetEntry[] {
  return modules.map((id) => findAsset(id)).filter((a): a is AssetEntry => !!a);
}

/**
 * A wall unit's pair of uprights at each end is 95 mm across. Standing
 * alone a unit has a pair at both ends; in a rack, neighbours share the
 * pair between them (the "centre" column), so every unit after the first
 * adds its width less one pair: 1411 mm for a 1400 unit, 715 for a 700.
 */
export const SHARED_POST = 95;

/** Combined footprint: widths add up less the shared uprights; depth and height are the largest unit's. */
export function rackSize(modules: readonly string[]): Size3D {
  const assets = rackAssets(modules);
  return {
    width: mm(assets.reduce((sum, a) => sum + a.size.width, 0) - SHARED_POST * Math.max(0, assets.length - 1)),
    depth: mm(Math.max(0, ...assets.map((a) => a.size.depth))),
    height: mm(Math.max(0, ...assets.map((a) => a.size.height))),
  };
}

export interface RackSlot {
  asset: AssetEntry;
  /** Centre of the unit along the rack, from the rack's centre (mm, + is right seen from the front). */
  x: number;
  /** Centre of the unit front-to-back, from the rack's centre (mm, − is towards the wall): backs line up. */
  y: number;
}

/** Where each unit sits inside the rack; neighbours overlap by the uprights they share. */
export function rackSlots(modules: readonly string[]): RackSlot[] {
  const assets = rackAssets(modules);
  const size = rackSize(modules);
  let left = -size.width / 2;
  return assets.map((asset) => {
    const slot = { asset, x: left + asset.size.width / 2, y: -size.depth / 2 + asset.size.depth / 2 };
    // The next unit starts on this one's right-hand uprights.
    left += asset.size.width - SHARED_POST;
    return slot;
  });
}

export interface RackSummary {
  size: Size3D;
  units: number;
  hangers: number;
  weightKg: number;
}

export function rackSummary(modules: readonly string[]): RackSummary {
  const assets = rackAssets(modules);
  return {
    size: rackSize(modules),
    units: assets.length,
    hangers: assets.reduce((n, a) => n + (a.hangerCount ?? 0), 0),
    weightKg: assets.reduce((n, a) => n + (a.weightKg ?? 0), 0),
  };
}

/** "2× Wall Unit 1400 - Shelves, 1× Wall Unit 700 - Shelf", in rack order of first appearance. */
export function rackContents(modules: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const a of rackAssets(modules)) counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
  return [...counts].map(([name, n]) => `${n}× ${name}`).join(', ');
}

import type { InventoryItem } from '@/model/objects';
import { rectCorners } from '@/geometry/transform';
import { normalizeAngle } from '@/geometry/wallSnap';
import { findAsset } from './assetCatalog';

/** How close (mm) two wall units' ends must be to share a column. */
const JOIN = 40;

export interface WallRun {
  /** Inventory items (wall units and wall racks) in the run. */
  itemIds: string[];
  /** Wall units in the run, counting each unit of a wall rack. */
  units: number;
}

const isWallUnit = (it: InventoryItem) =>
  !!it.modules?.length || findAsset(it.assetRef)?.category === 'Wall Units';

/**
 * Wall units standing side by side, backs in line and ends touching, form a
 * run; a wall rack is a run by itself (and can join others). Each run needs
 * a column at both ends and one between every two units.
 */
export function wallRuns(inventory: InventoryItem[]): WallRun[] {
  const pieces = inventory.filter(isWallUnit).map((it) => {
    const [a, b] = rectCorners(it.position, it.size, it.rotation); // back edge, left → right
    return { it, a: a!, b: b!, rot: normalizeAngle(it.rotation), units: it.modules?.length || 1 };
  });
  const parent = pieces.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) <= JOIN;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const p = pieces[i]!;
      const q = pieces[j]!;
      const sameWay = Math.abs(Math.sin((p.rot - q.rot) / 1)) < 0.02 && Math.cos(p.rot - q.rot) > 0;
      if (sameWay && (near(p.b, q.a) || near(q.b, p.a))) parent[find(i)] = find(j);
    }
  }
  const runs = new Map<number, WallRun>();
  pieces.forEach((p, i) => {
    const r = runs.get(find(i)) ?? { itemIds: [], units: 0 };
    r.itemIds.push(p.it.id);
    r.units += p.units;
    runs.set(find(i), r);
  });
  return [...runs.values()];
}

/** Columns the runs need: left and right ends, and one between every two units. */
export function columnCounts(runs: WallRun[]): { left: number; mid: number; right: number } {
  return {
    left: runs.length,
    right: runs.length,
    mid: runs.reduce((n, r) => n + Math.max(0, r.units - 1), 0),
  };
}

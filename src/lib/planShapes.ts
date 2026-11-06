import type { InventoryItem } from '@/model/objects';
import type { Point } from '@/model/geometry';
import { findAsset } from './assetCatalog';
import { rackSlots } from './racks';
import data from './planShapes.json';

type Pt = [number, number];

/**
 * A catalog model seen from above, in plan mm around the item's centre
 * (unrotated: back towards −y). `fill` is the silhouette (rings, drawn
 * even-odd), `lines` the edges of the parts inside it. Generated from the
 * Blender models: `python scripts/blender/build.py --plan`.
 */
export interface PlanShape {
  fill: Pt[][];
  lines: Pt[][];
}

const SHAPES = data as unknown as Record<string, PlanShape>;

export function planShape(assetId: string): PlanShape | null {
  return SHAPES[assetId] ?? null;
}

/**
 * What an item looks like from above, in its own frame (centre at 0,0,
 * unrotated); a wall rack is its units side by side. Null when there is no
 * model shape, so the plan falls back to the footprint rectangle.
 */
export function itemPlanShape(item: Pick<InventoryItem, 'assetRef' | 'modules'>): PlanShape | null {
  if (item.modules?.length) {
    const out: PlanShape = { fill: [], lines: [] };
    for (const slot of rackSlots(item.modules)) {
      const s = planShape(slot.asset.id);
      if (!s) return null;
      const move = (r: Pt[]) => r.map(([x, y]) => [x + slot.x, y + slot.y] as Pt);
      out.fill.push(...s.fill.map(move));
      out.lines.push(...s.lines.map(move));
    }
    return out;
  }
  const asset = findAsset(item.assetRef);
  return asset ? planShape(asset.id) : null;
}

/** The shape placed in the plan: rotated about and moved to the item's position. */
export function placedPlanShape(
  item: Pick<InventoryItem, 'assetRef' | 'modules' | 'position' | 'rotation'>,
): { fill: Point[][]; lines: Point[][] } | null {
  const s = itemPlanShape(item);
  if (!s) return null;
  const c = Math.cos(item.rotation);
  const sn = Math.sin(item.rotation);
  const place = (r: Pt[]) =>
    r.map(([x, y]) => ({ x: item.position.x + x * c - y * sn, y: item.position.y + x * sn + y * c }) as Point);
  return { fill: s.fill.map(place), lines: s.lines.map(place) };
}

/** SVG path data for rings (closed) or polylines (open). */
export function pathData(rings: Pt[][], closed: boolean): string {
  return rings
    .map((r) => `M${r.map(([x, y]) => `${x} ${y}`).join('L')}${closed ? 'Z' : ''}`)
    .join('');
}

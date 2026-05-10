import type { Mm } from '@/model/units';
import { mm } from '@/model/units';
import type { Size3D } from '@/model/geometry';

export interface AssetEntry {
  /** Stable id used as `InventoryItem.assetRef`. */
  id: string;
  /** Display name in the library. */
  name: string;
  /** Coarse taxonomy. Free-form string today. */
  category: string;
  /** Path to the source STEP file under /public. The 3D adapter will load this. */
  stepUrl: string;
  /** Bounding-box dimensions in mm. Used as the 2D footprint until 3D ships. */
  size: Size3D;
  /** Short note shown in the library card. */
  note?: string;
}

const size = (w: number, d: number, h: number): Size3D => ({
  width: mm(w),
  depth: mm(d),
  height: mm(h),
});

/**
 * Bounding boxes are derived from CARTESIAN_POINT spans in the STEP files
 * and rounded to the nearest 10 mm. The user can tune Width / Depth / Height
 * per-instance from the right panel after placement.
 *
 * stepUrl points at the raw STEP file; the 2D canvas only uses `size`. When
 * the Three.js adapter lands it will fetch this URL via occt-import-js.
 */
export const ASSET_CATALOG: readonly AssetEntry[] = [
  {
    id: '105-06-001-E',
    name: '105-06-001-E',
    category: 'Frame',
    stepUrl: '/assets/3d/105-06-001-E.step',
    size: size(1290, 1730, 1520),
    note: 'STEP · SolidWorks 2025',
  },
  {
    id: '105-09-002-A',
    name: '105-09-002-A',
    category: 'Frame',
    stepUrl: '/assets/3d/105-09-002-A.step',
    size: size(510, 560, 650),
    note: 'STEP · SolidWorks 2025',
  },
  {
    id: '105-17-007-01-A',
    name: '105-17-007-01-A',
    category: 'Frame',
    stepUrl: '/assets/3d/105-17-007-01-A.step',
    size: size(1280, 1200, 340),
    note: 'STEP · SolidWorks 2025',
  },
] as const;

export function findAsset(id: string | undefined): AssetEntry | undefined {
  if (!id) return undefined;
  return ASSET_CATALOG.find((a) => a.id === id);
}

import type { Mm } from './units';
import type { RoomPolygon, Pillar, InventoryItem } from './objects';

/**
 * View state lives in the store but is **never serialised** in the
 * exported JSON. It is a UI concern and varies per user / session.
 */
export type ViewMode = '2d' | '3d';

export interface ViewState {
  zoom: number;                       // pixels per mm
  pan: { x: number; y: number };      // screen px
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: Mm;                       // 100 mm default
  viewMode: ViewMode;                 // 2D plan (editable) or 3D view (read-only)
}

/**
 * Always recomputed from the room polygon. Kept as its own type so
 * exports and panels share one shape.
 */
export interface DerivedMetrics {
  wallLengths: number[];   // mm, in corner order
  cornerAngles: number[];  // degrees, in corner order
  area: number;            // mm²
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  units: 'mm';             // explicit, future-proof
  room: RoomPolygon | null;
  pillars: Pillar[];
  inventory: InventoryItem[];
}

/** Shape produced by the export action. Includes derived metrics so
 *  downstream consumers (3D, quote engine) don't need to recompute. */
export interface ExportPayload {
  project: Project;
  derived: DerivedMetrics | null;
  exportedAt: string;
}

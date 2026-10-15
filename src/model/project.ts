import type { Mm } from './units';
import type { RoomPolygon, Pillar, InventoryItem, ElectricalPoint, PlanNote } from './objects';
import type { Point } from './geometry';

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
  viewMode: ViewMode;                 // 2D plan or 3D view; both edit the same project
  showLayoutCheck: boolean;           // draw layout issues on the plan
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

/**
 * A scanned or exported floor plan (PDF page or image) drawn under the
 * room so it can be traced. Stored inline as a data URL so saved files
 * and autosave are self-contained.
 */
export interface PlanUnderlay {
  src: string;             // data URL, JPEG or PNG
  fileName: string;
  position: Point;         // top-left corner, world mm
  width: Mm;               // world width; height = width * aspect
  aspect: number;          // image height / image width
  opacity: number;         // 0..1
  locked: boolean;         // locked underlays ignore the pointer
  calibrated: boolean;     // scale set from a known distance
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
  underlay?: PlanUnderlay | null;
  /** Narrowest acceptable aisle, mm. Defaults to 900 when absent. */
  minAisle?: Mm;
  /** Free text for the PDF's "Notes for this draft". */
  notes?: string;
  /** Sockets, data, logo power… for the electrical plan. */
  electrical?: ElectricalPoint[];
  /** Notes written on the plan. */
  annotations?: PlanNote[];
}

/** Shape produced by the export action. Includes derived metrics so
 *  downstream consumers (3D, quote engine) don't need to recompute. */
export interface ExportPayload {
  project: Project;
  derived: DerivedMetrics | null;
  exportedAt: string;
}

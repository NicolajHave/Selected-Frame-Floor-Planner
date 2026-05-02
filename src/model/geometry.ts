import type { Mm } from './units';

/** A 2D point in world coordinates (mm). */
export interface Point {
  x: Mm;
  y: Mm;
}

/** A 3D size used for any object that can be extruded later. */
export interface Size3D {
  width: Mm;
  depth: Mm;
  height: Mm;
}

/** A vertex of the room polygon. */
export interface Corner {
  id: string;
  point: Point;
}

/**
 * Wall segments are derived from consecutive corners. We expose the
 * shape so consumers (panels, exports, future 3D extrusion) can use a
 * stable record type instead of tuples.
 */
export interface WallSegment {
  fromCornerId: string;
  toCornerId: string;
  length: number; // mm — derived
}

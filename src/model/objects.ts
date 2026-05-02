import type { Mm, Radians } from './units';
import type { Corner, Point, Size3D } from './geometry';

export type ShapeType = 'rect' | 'round';

export interface RoomPolygon {
  id: string;
  corners: Corner[];     // ordered; closing edge is implicit
  closed: boolean;
  wallThickness: Mm;     // for 3D extrusion
  wallHeight: Mm;        // for 3D extrusion
}

/**
 * Pillars and inventory share a transform shape (centre + rotation +
 * 3D size). This mirrors how Three.js Object3D handles position and
 * rotation, so a 3D adapter can map fields one-to-one.
 */
interface PlacedObjectBase {
  id: string;
  position: Point;       // centre, world coords
  size: Size3D;
  rotation: Radians;     // around the vertical axis
}

export interface Pillar extends PlacedObjectBase {
  type: 'pillar';
  shape: ShapeType;      // 'round' reserved for post-MVP
}

export interface InventoryItem extends PlacedObjectBase {
  type: 'inventory';
  name: string;          // user label
  category?: string;     // future taxonomy ('frame' | 'shelf' | …)
  assetRef?: string;     // future: swap placeholder for SVG / GLTF
}

export type PlacedObject = Pillar | InventoryItem;
export type SelectionKind = 'corner' | 'pillar' | 'inventory' | 'room';

export interface Selection {
  kind: SelectionKind;
  id: string;
}

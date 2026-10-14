import type { Mm, Radians } from './units';
import type { Corner, Point, Size3D } from './geometry';

export type ShapeType = 'rect' | 'round';

export interface RoomPolygon {
  id: string;
  corners: Corner[];     // ordered; closing edge is implicit
  closed: boolean;
  wallThickness: Mm;     // for 3D extrusion
  wallHeight: Mm;        // for 3D extrusion
  openings: Opening[];   // doors, passages and windows cut into the walls
}

export type OpeningKind = 'door' | 'double-door' | 'opening' | 'window';

/**
 * A hole in a wall. It is anchored to the wall's start corner rather than a
 * wall index, so it stays on the same wall when corners are added, moved or
 * the wall is resized.
 */
export interface Opening {
  id: string;
  kind: OpeningKind;
  /** The wall this opening sits in: the wall that starts at this corner. */
  wallStartCornerId: string;
  /** Distance along the wall from its start corner to the opening's centre. */
  offset: Mm;
  width: Mm;
  /** Top of the opening above the floor. */
  height: Mm;
  /** Bottom of the opening above the floor (0 for doors and passages). */
  sillHeight: Mm;
  /** Doors: hinge on the end nearest the wall's start or end corner. */
  hinge: 'start' | 'end';
  /** Doors: leaf swings into the room or out of it. */
  swing: 'in' | 'out';
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
export type SelectionKind = 'corner' | 'pillar' | 'inventory' | 'room' | 'opening';

export interface Selection {
  kind: SelectionKind;
  id: string;
}

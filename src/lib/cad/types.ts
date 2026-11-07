/**
 * A CAD drawing read from DWG or DXF, reduced to what an underlay needs.
 * Coordinates are drawing units (x right, y up); angles are radians.
 */

export interface Xy {
  x: number;
  y: number;
}

export type CadEntity = { layer: string } & (
  | { kind: 'line'; a: Xy; b: Xy }
  /** `bulge` per vertex: tan(¼ of the arc's angle) to the next vertex. */
  | { kind: 'poly'; pts: (Xy & { bulge?: number })[]; closed: boolean }
  | { kind: 'arc'; c: Xy; r: number; a0: number; a1: number }
  | { kind: 'circle'; c: Xy; r: number }
  /** `major` is the semi-major axis as a vector from the centre. */
  | { kind: 'ellipse'; c: Xy; major: Xy; ratio: number; a0: number; a1: number }
  | { kind: 'text'; p: Xy; h: number; rot: number; text: string }
  | {
      kind: 'insert';
      block: string;
      p: Xy;
      sx: number;
      sy: number;
      rot: number;
      cols: number;
      rows: number;
      colSpacing: number;
      rowSpacing: number;
    }
);

export interface CadBlock {
  base: Xy;
  entities: CadEntity[];
}

export interface CadSource {
  /** Millimetres per drawing unit. */
  unitMm: number;
  /** Model space. */
  entities: CadEntity[];
  blocks: Map<string, CadBlock>;
  /** Layers switched off or frozen in the file. */
  hiddenLayers: Set<string>;
}

/**
 * Millimetres per drawing unit, from INSUNITS and the dimension scale
 * DIMLFAC: a plan drawn in centimetres often says "millimetres" but scales
 * its dimensions by 10 so they read in mm.
 */
export function drawingUnitMm(insunits: number | undefined, dimlfac: number | undefined): number {
  const base = unitToMm(insunits);
  const f = Number(dimlfac);
  return f > 0 && f !== 1 && [10, 100, 1000, 0.1, 0.01, 0.001, 25.4, 2.54].some((k) => Math.abs(f - k) < 1e-6) ? base * f : base;
}

/** Choices offered when the file's own units can't be trusted. */
export const DRAWING_UNITS = [
  { label: 'Millimetres', mm: 1 },
  { label: 'Centimetres', mm: 10 },
  { label: 'Metres', mm: 1000 },
  { label: 'Inches', mm: 25.4 },
] as const;

/** Millimetres per unit for the drawing's INSUNITS code (0 = unitless: taken as mm). */
export function unitToMm(code: number | undefined): number {
  switch (code) {
    case 1: return 25.4; // inches
    case 2: return 304.8; // feet
    case 5: return 10; // centimetres
    case 6: return 1000; // metres
    case 14: return 100; // decimetres
    default: return 1; // millimetres, or unitless
  }
}

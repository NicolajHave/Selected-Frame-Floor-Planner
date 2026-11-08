import { test, expect } from '@playwright/test';
import { flatten, robustBounds } from '@/lib/cad/flatten';
import { drawingUnitMm, unitToMm, type CadSource } from '@/lib/cad/types';
import { plainMtext } from '@/lib/cad/fromDwg';

const src = (entities: CadSource['entities'], blocks: CadSource['blocks'] = new Map()): CadSource => ({
  unitMm: 1,
  entities,
  blocks,
  hiddenLayers: new Set(['HIDDEN']),
});

const box = (paths: Float64Array[]) => {
  const xs = paths.flatMap((p) => [...p].filter((_, i) => i % 2 === 0));
  const ys = paths.flatMap((p) => [...p].filter((_, i) => i % 2 === 1));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((n) => Math.round(n * 1000) / 1000);
};

test('units: INSUNITS, corrected by a dimension scale for plans drawn in cm', () => {
  expect(unitToMm(4)).toBe(1);
  expect(unitToMm(5)).toBe(10);
  expect(unitToMm(6)).toBe(1000);
  expect(drawingUnitMm(4, 1)).toBe(1);
  expect(drawingUnitMm(4, 10)).toBe(10); // "mm", dimensions × 10: drawn in cm
  expect(drawingUnitMm(6, undefined)).toBe(1000);
  expect(drawingUnitMm(4, 3.7)).toBe(1); // an odd factor is a styling choice, not units
});

test('blocks are placed, rotated, scaled and arrayed; hidden layers are left out', () => {
  const blocks: CadSource['blocks'] = new Map([
    ['SQ', { base: { x: 10, y: 10 }, entities: [{ layer: '0', kind: 'poly', pts: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }], closed: true }] }],
  ]);
  const one = flatten(src([{ layer: 'A', kind: 'insert', block: 'SQ', p: { x: 100, y: 0 }, sx: 2, sy: 2, rot: Math.PI / 2, cols: 1, rows: 1, colSpacing: 0, rowSpacing: 0 }], blocks));
  // The block's base point lands on the insertion point; 10 × 10 scaled ×2 and turned 90°.
  expect(box(one.paths)).toEqual([80, 0, 100, 20]);
  const grid = flatten(src([{ layer: 'A', kind: 'insert', block: 'SQ', p: { x: 0, y: 0 }, sx: 1, sy: 1, rot: 0, cols: 3, rows: 2, colSpacing: 50, rowSpacing: 40 }], blocks));
  expect(grid.paths).toHaveLength(6);
  expect(box(grid.paths)).toEqual([0, 0, 110, 50]);
  const hidden = flatten(src([{ layer: 'HIDDEN', kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }]));
  expect(hidden.paths).toHaveLength(0);
});

test('arcs, circles and bulged polylines become points on the curve', () => {
  const arc = flatten(src([{ layer: 'A', kind: 'arc', c: { x: 0, y: 0 }, r: 10, a0: 0, a1: Math.PI / 2 }]));
  expect(box(arc.paths)).toEqual([0, 0, 10, 10]);
  // A half-circle bulge (b = 1) from (0,0) to (20,0) bows to the right of travel: down to y = −10.
  const bulge = flatten(src([{ layer: 'A', kind: 'poly', pts: [{ x: 0, y: 0, bulge: 1 }, { x: 20, y: 0 }], closed: false }]));
  expect(box(bulge.paths)).toEqual([0, -10, 20, 0]);
});

test('the extent ignores a stray line far away', () => {
  const room = new Float64Array([0, 0, 1000, 0, 1000, 600, 0, 600, 0, 0]);
  const stray = new Float64Array([90000, 90000, 90010, 90000]);
  const b = robustBounds([room, stray]);
  expect(b.maxX).toBeLessThan(1100);
  expect(b.maxY).toBeLessThan(700);
});

test('MTEXT formatting codes are stripped', () => {
  expect(plainMtext('{\\fArial|b1;Réserve}\\PStock')).toBe('Réserve Stock');
});

test('each line remembers its layer; block contents on layer 0 take the reference’s layer', () => {
  const blocks: CadSource['blocks'] = new Map([
    ['DESK', { base: { x: 0, y: 0 }, entities: [{ layer: '0', kind: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }] }],
  ]);
  const d = flatten(
    src(
      [
        { layer: 'WALLS', kind: 'line', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
        { layer: 'FURNITURE', kind: 'insert', block: 'DESK', p: { x: 0, y: 0 }, sx: 1, sy: 1, rot: 0, cols: 2, rows: 1, colSpacing: 20, rowSpacing: 0 },
        { layer: 'TEXT', kind: 'text', p: { x: 0, y: 0 }, h: 10, rot: 0, text: 'Shop' },
      ],
      blocks,
    ),
  );
  expect(d.pathLayers).toEqual(['WALLS', 'FURNITURE', 'FURNITURE']);
  expect(d.texts[0]!.layer).toBe('TEXT');
  expect(d.layers).toEqual([
    { name: 'FURNITURE', count: 2 },
    { name: 'WALLS', count: 1 },
    { name: 'TEXT', count: 1 },
  ]);
});

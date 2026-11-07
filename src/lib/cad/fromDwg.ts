import type { CadBlock, CadEntity, CadSource, Xy } from './types';
import { drawingUnitMm } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- LibreDWG's converted records are loosely typed */

/** Where the browser loads LibreDWG's WebAssembly from (copied there on install). */
const WASM_DIR = '/vendor/libredwg';

const xy = (p: any): Xy => ({ x: Number(p?.x ?? 0), y: Number(p?.y ?? 0) });

/** MTEXT keeps formatting codes in its text: drop them. */
export function plainMtext(s: string): string {
  return s
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/\\[~LlOoKk]/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

function entity(e: any): CadEntity | null {
  const layer = String(e.layer ?? '0');
  switch (e.type) {
    case 'LINE':
      return { layer, kind: 'line', a: xy(e.startPoint), b: xy(e.endPoint) };
    case 'LWPOLYLINE':
      return {
        layer,
        kind: 'poly',
        pts: (e.vertices ?? []).map((v: any) => ({ ...xy(v), bulge: v.bulge ?? 0 })),
        closed: !!(Number(e.flag) & 512),
      };
    case 'POLYLINE2D':
      return {
        layer,
        kind: 'poly',
        pts: (e.vertices ?? []).map((v: any) => ({ ...xy(v), bulge: v.bulge ?? 0 })),
        closed: !!(Number(e.flag) & 1),
      };
    case 'LEADER':
      return { layer, kind: 'poly', pts: (e.vertices ?? []).map(xy), closed: false };
    case 'ARC':
      return { layer, kind: 'arc', c: xy(e.center), r: e.radius, a0: e.startAngle, a1: e.endAngle };
    case 'CIRCLE':
      return { layer, kind: 'circle', c: xy(e.center), r: e.radius };
    case 'ELLIPSE':
      return {
        layer,
        kind: 'ellipse',
        c: xy(e.center),
        major: xy(e.majorAxisEndPoint),
        ratio: e.axisRatio,
        a0: e.startAngle,
        a1: e.endAngle,
      };
    case 'SPLINE': {
      // Fit points lie on the curve; control points close enough for an underlay.
      const pts = (e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? []).map(xy);
      return { layer, kind: 'poly', pts, closed: !!(Number(e.flag) & 1) };
    }
    case 'TEXT':
      return { layer, kind: 'text', p: xy(e.startPoint), h: e.textHeight ?? 0, rot: e.rotation ?? 0, text: String(e.text ?? '') };
    case 'MTEXT': {
      const dir = e.direction ? Math.atan2(e.direction.y, e.direction.x) : 0;
      return {
        layer,
        kind: 'text',
        // Anchored at its top left; draw from the first line's baseline.
        p: { x: Number(e.insertionPoint?.x ?? 0), y: Number(e.insertionPoint?.y ?? 0) - (e.textHeight ?? 0) },
        h: e.textHeight ?? 0,
        rot: e.rotation || dir,
        text: plainMtext(String(e.text ?? '')),
      };
    }
    case 'INSERT':
      return {
        layer,
        kind: 'insert',
        block: String(e.name),
        p: xy(e.insertionPoint),
        sx: e.xScale ?? 1,
        sy: e.yScale ?? 1,
        rot: e.rotation ?? 0,
        cols: e.columnCount || 1,
        rows: e.rowCount || 1,
        colSpacing: e.columnSpacing ?? 0,
        rowSpacing: e.rowSpacing ?? 0,
      };
    case 'DIMENSION':
      // Its lines, arrows and text are an anonymous block drawn in place.
      return e.name
        ? { layer, kind: 'insert', block: String(e.name), p: { x: 0, y: 0 }, sx: 1, sy: 1, rot: 0, cols: 1, rows: 1, colSpacing: 0, rowSpacing: 0 }
        : null;
    default:
      // Hatches, images, viewports, rays: not needed to trace a plan.
      return null;
  }
}

const entities = (list: any[] | undefined) => (list ?? []).map(entity).filter((e): e is CadEntity => !!e);

/** Reads a DWG (or DXF) file with LibreDWG, loaded on demand. */
export async function readWithLibreDwg(data: ArrayBuffer, kind: 'dwg' | 'dxf'): Promise<CadSource> {
  const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const lib = await LibreDwg.create(WASM_DIR);
  const raw = lib.dwg_read_data(data, kind === 'dwg' ? Dwg_File_Type.DWG : Dwg_File_Type.DXF);
  if (!raw) throw new Error('This drawing could not be read.');
  try {
    const db: any = lib.convert(raw);
    const records: any[] = db.tables?.BLOCK_RECORD?.entries ?? [];
    const blocks = new Map<string, CadBlock>();
    let model: any[] | null = null;
    for (const r of records) {
      const name = String(r.name ?? '');
      if (name.toUpperCase() === '*MODEL_SPACE') model = r.entities ?? [];
      else blocks.set(name, { base: xy(r.basePoint), entities: entities(r.entities) });
    }
    const hiddenLayers = new Set<string>(
      (db.tables?.LAYER?.entries ?? []).filter((l: any) => l.off || l.frozen).map((l: any) => String(l.name)),
    );
    return {
      unitMm: drawingUnitMm(Number(db.header?.INSUNITS), Number(db.header?.DIMLFAC)),
      entities: entities(model ?? db.entities),
      blocks,
      hiddenLayers,
    };
  } finally {
    lib.dwg_free(raw);
  }
}

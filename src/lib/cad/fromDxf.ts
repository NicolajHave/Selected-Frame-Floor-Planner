import type { CadBlock, CadEntity, CadSource, Xy } from './types';
import { drawingUnitMm } from './types';
import { plainMtext } from './fromDwg';

/* eslint-disable @typescript-eslint/no-explicit-any -- dxf-parser's entities are loosely typed */

const xy = (p: any): Xy => ({ x: Number(p?.x ?? 0), y: Number(p?.y ?? 0) });
const RAD = Math.PI / 180;

function entity(e: any): CadEntity | null {
  const layer = String(e.layer ?? '0');
  switch (e.type) {
    case 'LINE':
      return e.vertices?.length >= 2 ? { layer, kind: 'line', a: xy(e.vertices[0]), b: xy(e.vertices[1]) } : null;
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return {
        layer,
        kind: 'poly',
        pts: (e.vertices ?? []).map((v: any) => ({ ...xy(v), bulge: v.bulge ?? 0 })),
        closed: !!e.shape,
      };
    case 'LEADER':
      return { layer, kind: 'poly', pts: (e.vertices ?? []).map(xy), closed: false };
    // dxf-parser gives arc angles in radians, but text and insert rotations in degrees.
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
        a0: e.startAngle ?? 0,
        a1: e.endAngle ?? Math.PI * 2,
      };
    case 'SPLINE': {
      const pts = (e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? []).map(xy);
      return { layer, kind: 'poly', pts, closed: !!e.closed };
    }
    case 'TEXT':
      return { layer, kind: 'text', p: xy(e.startPoint), h: e.textHeight ?? 0, rot: (e.rotation ?? 0) * RAD, text: String(e.text ?? '') };
    case 'MTEXT':
      return {
        layer,
        kind: 'text',
        p: { x: Number(e.position?.x ?? 0), y: Number(e.position?.y ?? 0) - (e.height ?? 0) },
        h: e.height ?? 0,
        rot: e.rotation ? e.rotation * RAD : e.directionVector ? Math.atan2(e.directionVector.y, e.directionVector.x) : 0,
        text: plainMtext(String(e.text ?? '')),
      };
    case 'INSERT':
      return {
        layer,
        kind: 'insert',
        block: String(e.name),
        p: xy(e.position),
        sx: e.xScale ?? 1,
        sy: e.yScale ?? 1,
        rot: (e.rotation ?? 0) * RAD,
        cols: e.columnCount || 1,
        rows: e.rowCount || 1,
        colSpacing: e.columnSpacing ?? 0,
        rowSpacing: e.rowSpacing ?? 0,
      };
    case 'DIMENSION':
      return e.block
        ? { layer, kind: 'insert', block: String(e.block), p: { x: 0, y: 0 }, sx: 1, sy: 1, rot: 0, cols: 1, rows: 1, colSpacing: 0, rowSpacing: 0 }
        : null;
    default:
      return null;
  }
}

const entities = (list: any[] | undefined) => (list ?? []).map(entity).filter((e): e is CadEntity => !!e);

/** Reads a DXF file with dxf-parser (MIT). */
export async function readDxf(text: string): Promise<CadSource> {
  const { default: DxfParser } = await import('dxf-parser');
  const dxf: any = new DxfParser().parseSync(text);
  if (!dxf) throw new Error('This DXF could not be read.');
  const blocks = new Map<string, CadBlock>();
  for (const [name, b] of Object.entries<any>(dxf.blocks ?? {})) {
    blocks.set(name, { base: xy(b.position), entities: entities(b.entities) });
  }
  const layers: Record<string, any> = dxf.tables?.layer?.layers ?? {};
  const hiddenLayers = new Set(
    Object.values(layers)
      .filter((l: any) => l.visible === false || l.frozen)
      .map((l: any) => String(l.name)),
  );
  return {
    unitMm: drawingUnitMm(Number(dxf.header?.$INSUNITS), Number(dxf.header?.$DIMLFAC)),
    entities: entities((dxf.entities ?? []).filter((e: any) => !e.inPaperSpace)),
    blocks,
    hiddenLayers,
  };
}

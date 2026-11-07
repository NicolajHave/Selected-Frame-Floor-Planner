import type { CadEntity, CadSource, Xy } from './types';

/** A drawing as polylines and text in world drawing units, ready to draw at any scale. */
export interface FlatDrawing {
  unitMm: number;
  /** Polylines as flat [x0, y0, x1, y1, …] arrays. */
  paths: Float64Array[];
  texts: { x: number; y: number; h: number; rot: number; text: string }[];
  /** Where the drawing really is: outliers (stray far-off lines) left out. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Affine transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const apply = (m: M, p: Xy): Xy => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** Segments per full circle; arcs get their share (at least 4). */
const CIRCLE_STEPS = 64;
/** Nested block depth guard. */
const MAX_DEPTH = 12;
/** Too many array copies are almost always a mistake in the file. */
const MAX_ARRAY = 400;

function arcPoints(c: Xy, r: number, a0: number, a1: number): Xy[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(4, Math.ceil((CIRCLE_STEPS * sweep) / (Math.PI * 2)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (sweep * i) / n;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

/** A polyline with bulges, as straight points. */
function bulgePoints(pts: (Xy & { bulge?: number })[], closed: boolean): Xy[] {
  const out: Xy[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    out.push(p);
    const last = i === n - 1;
    if (last && !closed) break;
    const q = pts[(i + 1) % n]!;
    const b = p.bulge ?? 0;
    if (Math.abs(b) < 1e-9) continue;
    // Arc from p to q with included angle 4·atan(b), centre to the left for b > 0.
    const theta = 4 * Math.atan(b);
    const chord = Math.hypot(q.x - p.x, q.y - p.y);
    if (chord < 1e-9) continue;
    const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const h = r * Math.cos(Math.abs(theta) / 2);
    const nx = -(q.y - p.y) / chord;
    const ny = (q.x - p.x) / chord;
    const s = b > 0 ? 1 : -1;
    const c = { x: mx + s * nx * h, y: my + s * ny * h };
    const a0 = Math.atan2(p.y - c.y, p.x - c.x);
    const steps = Math.max(2, Math.ceil((CIRCLE_STEPS * Math.abs(theta)) / (Math.PI * 2)));
    for (let k = 1; k < steps; k++) {
      const a = a0 + (theta * k) / steps;
      out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
  }
  if (closed && n > 1) out.push(pts[0]!);
  return out;
}

/** Expands blocks and curves into polylines in model space. */
export function flatten(src: CadSource): FlatDrawing {
  const paths: Float64Array[] = [];
  const texts: FlatDrawing['texts'] = [];

  const push = (m: M, pts: Xy[]) => {
    if (pts.length < 2) return;
    const a = new Float64Array(pts.length * 2);
    pts.forEach((p, i) => {
      const q = apply(m, p);
      a[i * 2] = q.x;
      a[i * 2 + 1] = q.y;
    });
    paths.push(a);
  };

  const walk = (list: CadEntity[], m: M, inherited: string | null, depth: number) => {
    for (const e of list) {
      // Entities on layer 0 inside a block take the layer of the block reference.
      const layer = e.layer === '0' && inherited ? inherited : e.layer;
      if (src.hiddenLayers.has(layer)) continue;
      switch (e.kind) {
        case 'line':
          push(m, [e.a, e.b]);
          break;
        case 'poly':
          push(m, bulgePoints(e.pts, e.closed));
          break;
        case 'arc':
          push(m, arcPoints(e.c, e.r, e.a0, e.a1));
          break;
        case 'circle':
          push(m, arcPoints(e.c, e.r, 0, Math.PI * 2));
          break;
        case 'ellipse': {
          const r1 = Math.hypot(e.major.x, e.major.y);
          const rot = Math.atan2(e.major.y, e.major.x);
          const em: M = mul(m, [Math.cos(rot) * r1, Math.sin(rot) * r1, -Math.sin(rot) * r1 * e.ratio, Math.cos(rot) * r1 * e.ratio, e.c.x, e.c.y]);
          push(em, arcPoints({ x: 0, y: 0 }, 1, e.a0, e.a1 > e.a0 ? e.a1 : e.a1 + Math.PI * 2));
          break;
        }
        case 'text': {
          if (!e.text.trim()) break;
          const p = apply(m, e.p);
          const dir = apply(m, { x: e.p.x + Math.cos(e.rot), y: e.p.y + Math.sin(e.rot) });
          texts.push({ x: p.x, y: p.y, h: e.h * scaleOf(m), rot: Math.atan2(dir.y - p.y, dir.x - p.x), text: e.text });
          break;
        }
        case 'insert': {
          const block = src.blocks.get(e.block);
          if (!block || depth >= MAX_DEPTH) break;
          const cols = Math.min(MAX_ARRAY, Math.max(1, e.cols));
          const rows = Math.min(MAX_ARRAY, Math.max(1, e.rows));
          const cos = Math.cos(e.rot);
          const sin = Math.sin(e.rot);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              // Array copies step along the reference's own rotated axes.
              const ox = c * e.colSpacing;
              const oy = r * e.rowSpacing;
              const place: M = [
                cos * e.sx,
                sin * e.sx,
                -sin * e.sy,
                cos * e.sy,
                e.p.x + cos * ox - sin * oy,
                e.p.y + sin * ox + cos * oy,
              ];
              const base: M = [1, 0, 0, 1, -block.base.x, -block.base.y];
              walk(block.entities, mul(m, mul(place, base)), layer, depth + 1);
            }
          }
          break;
        }
      }
    }
  };

  walk(src.entities, IDENTITY, null, 0);
  return { unitMm: src.unitMm, paths, texts, bounds: robustBounds(paths) };
}

/**
 * The extent of the drawing's lines without far-off strays: a forgotten
 * line or construction ray kilometres away is common in plans.
 */
export function robustBounds(paths: Float64Array[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  // A sample is plenty for big drawings.
  let total = 0;
  for (const p of paths) total += p.length / 2;
  const step = Math.max(1, Math.floor(total / 50000));
  let k = 0;
  for (const p of paths) {
    for (let i = 0; i < p.length; i += 2) {
      if (k++ % step === 0) {
        xs.push(p[i]!);
        ys.push(p[i + 1]!);
      }
    }
  }
  if (!xs.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const [minX, maxX] = extent(xs);
  const [minY, maxY] = extent(ys);
  // A little margin around it.
  const pad = Math.max(maxX - minX, maxY - minY) * 0.03 || 1;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function extent(values: number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  let lo = 0;
  let hi = v.length - 1;
  // Drop a small group at either end when it sits farther from the rest than the rest is wide.
  for (let round = 0; round < 8 && hi > lo; round++) {
    let gap = 0;
    let at = -1;
    for (let i = lo; i < hi; i++) {
      if (v[i + 1]! - v[i]! > gap) {
        gap = v[i + 1]! - v[i]!;
        at = i;
      }
    }
    if (at < 0) break;
    const left = at - lo + 1;
    const right = hi - at;
    const small = Math.max(2, Math.ceil(0.02 * (hi - lo + 1)));
    if (right <= small && gap > v[at]! - v[lo]!) hi = at;
    else if (left <= small && gap > v[hi]! - v[at + 1]!) lo = at + 1;
    else break;
  }
  return [v[lo]!, v[hi]!];
}

import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';
import type { Polygon } from './footprint';

/**
 * Snapping a dragged fixture to the ones around it, one axis at a time:
 *  - align: an edge or the centre lines up with a neighbour's edge or centre;
 *  - gap:   it stands exactly `gap` mm (the minimum aisle) from a neighbour
 *           that is beside it, so aisles come out right without measuring.
 * Works on the axis-aligned boxes of the outlines; fixtures turned at an odd
 * angle don't snap (their box isn't their shape).
 */

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type SnapGuide =
  | { kind: 'align'; axis: 'x' | 'y'; at: number; from: number; to: number }
  | { kind: 'gap'; from: Point; to: Point; distance: number };

export interface ObjectSnap {
  position: Point;
  guides: SnapGuide[];
}

export const boxOf = (poly: Polygon): Box => ({
  minX: Math.min(...poly.map((p) => p.x)),
  minY: Math.min(...poly.map((p) => p.y)),
  maxX: Math.max(...poly.map((p) => p.x)),
  maxY: Math.max(...poly.map((p) => p.y)),
});

/** Whether an angle is a whole number of quarter turns (within half a degree). */
export function squareAngle(rotation: number): boolean {
  const q = rotation / (Math.PI / 2);
  return Math.abs(q - Math.round(q)) < 0.0088;
}

interface Candidate {
  delta: number;
  guide: (moved: Box) => SnapGuide;
}

/**
 * Where to put a fixture whose box would be `box` (centred on `centre`),
 * snapped to `others` within `reach` mm; `gap` is the aisle to keep.
 */
export function snapToObjects(centre: Point, box: Box, others: readonly Box[], reach: number, gap: number): ObjectSnap {
  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  const cx = (b: Box) => (b.minX + b.maxX) / 2;
  const cy = (b: Box) => (b.minY + b.maxY) / 2;
  // How far apart two intervals are (0 when they overlap).
  const apart = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

  for (const o of others) {
    // Only neighbours within a few metres matter.
    const near = Math.max(gap * 3, 3000);
    if (apart(box.minX, box.maxX, o.minX, o.maxX) > near || apart(box.minY, box.maxY, o.minY, o.maxY) > near) continue;

    // Align along x (vertical guide lines).
    for (const [mine, theirs] of [
      [box.minX, o.minX], [box.minX, o.maxX], [box.maxX, o.minX], [box.maxX, o.maxX], [cx(box), cx(o)],
    ] as const) {
      xs.push({
        delta: theirs - mine,
        guide: (m) => ({ kind: 'align', axis: 'x', at: theirs, from: Math.min(m.minY, o.minY), to: Math.max(m.maxY, o.maxY) }),
      });
    }
    for (const [mine, theirs] of [
      [box.minY, o.minY], [box.minY, o.maxY], [box.maxY, o.minY], [box.maxY, o.maxY], [cy(box), cy(o)],
    ] as const) {
      ys.push({
        delta: theirs - mine,
        guide: (m) => ({ kind: 'align', axis: 'y', at: theirs, from: Math.min(m.minX, o.minX), to: Math.max(m.maxX, o.maxX) }),
      });
    }

    // Keep the aisle to a neighbour beside it (their spans overlap on the other axis).
    if (gap > 0) {
      const sideBySide = apart(box.minY, box.maxY, o.minY, o.maxY) === 0;
      const aboveBelow = apart(box.minX, box.maxX, o.minX, o.maxX) === 0;
      if (sideBySide) {
        const y = (m: Box) => (Math.max(m.minY, o.minY) + Math.min(m.maxY, o.maxY)) / 2;
        xs.push({
          delta: o.maxX + gap - box.minX, // to its right
          guide: (m) => ({ kind: 'gap', from: pt(o.maxX, y(m)), to: pt(m.minX, y(m)), distance: gap }),
        });
        xs.push({
          delta: o.minX - gap - box.maxX, // to its left
          guide: (m) => ({ kind: 'gap', from: pt(m.maxX, y(m)), to: pt(o.minX, y(m)), distance: gap }),
        });
      }
      if (aboveBelow) {
        const x = (m: Box) => (Math.max(m.minX, o.minX) + Math.min(m.maxX, o.maxX)) / 2;
        ys.push({
          delta: o.maxY + gap - box.minY, // below it
          guide: (m) => ({ kind: 'gap', from: pt(x(m), o.maxY), to: pt(x(m), m.minY), distance: gap }),
        });
        ys.push({
          delta: o.minY - gap - box.maxY, // above it
          guide: (m) => ({ kind: 'gap', from: pt(x(m), m.maxY), to: pt(x(m), o.minY), distance: gap }),
        });
      }
    }
  }

  const best = (list: Candidate[]) => {
    let pick: Candidate | null = null;
    for (const c of list) if (Math.abs(c.delta) <= reach && (!pick || Math.abs(c.delta) < Math.abs(pick.delta) - 1e-6)) pick = c;
    return pick;
  };
  const bx = best(xs);
  const by = best(ys);
  const dx = bx?.delta ?? 0;
  const dy = by?.delta ?? 0;
  const moved: Box = { minX: box.minX + dx, maxX: box.maxX + dx, minY: box.minY + dy, maxY: box.maxY + dy };
  // Every candidate that lines up after the move shows its guide (several edges can agree).
  const guides: SnapGuide[] = [];
  for (const [pick, list] of [[bx, xs], [by, ys]] as const) {
    if (!pick) continue;
    for (const c of list) {
      if (Math.abs(c.delta - pick.delta) < 0.5) {
        const g = c.guide(moved);
        if (!guides.some((h) => JSON.stringify(h) === JSON.stringify(g))) guides.push(g);
      }
    }
  }
  return { position: pt(centre.x + dx, centre.y + dy), guides };
}

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

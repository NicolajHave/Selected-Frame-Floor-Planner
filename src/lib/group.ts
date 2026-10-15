import type { Point } from '@/model/geometry';
import type { Selection } from '@/model/objects';
import type { Project } from '@/model/project';
import type { Mm, Radians } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { normalizeAngle } from '@/geometry/wallSnap';

/** Kinds that can be selected and moved together. */
export const GROUPABLE = ['pillar', 'inventory', 'note'] as const;
export type Groupable = (typeof GROUPABLE)[number];

export const isGroupable = (s: Selection): s is Selection & { kind: Groupable } =>
  (GROUPABLE as readonly string[]).includes(s.kind);

interface Placed {
  position: Point;
  rotation: number;
  /** Footprint corners (a note is just its anchor point). */
  outline: Point[];
}

export function placed(project: Project, s: Selection): Placed | null {
  if (s.kind === 'pillar' || s.kind === 'inventory') {
    const o =
      s.kind === 'pillar'
        ? project.pillars.find((x) => x.id === s.id)
        : project.inventory.find((x) => x.id === s.id);
    return o ? { position: o.position, rotation: o.rotation, outline: rectCorners(o.position, o.size, o.rotation) } : null;
  }
  if (s.kind === 'note') {
    const n = project.annotations?.find((x) => x.id === s.id);
    return n ? { position: n.position, rotation: 0, outline: [n.position] } : null;
  }
  return null;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxOf(points: Point[]): Box {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y';

/**
 * New centres that line the members up on one edge (or centre line) of the
 * group's bounding box, each by its own footprint.
 */
export function alignPositions(project: Project, members: Selection[], mode: AlignMode): Map<string, Point> {
  const items = members.map((m) => ({ m, p: placed(project, m) })).filter((x) => x.p) as { m: Selection; p: Placed }[];
  const all = boxOf(items.flatMap((x) => x.p.outline));
  const out = new Map<string, Point>();
  for (const { m, p } of items) {
    const b = boxOf(p.outline);
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = all.minX - b.minX;
    if (mode === 'right') dx = all.maxX - b.maxX;
    if (mode === 'top') dy = all.minY - b.minY;
    if (mode === 'bottom') dy = all.maxY - b.maxY;
    if (mode === 'center-x') dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2;
    if (mode === 'center-y') dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2;
    out.set(m.id, pt(p.position.x + dx, p.position.y + dy));
  }
  return out;
}

/**
 * Equal gaps between members along x or y; the first and last stay where
 * they are. Needs three or more.
 */
export function distributePositions(project: Project, members: Selection[], axis: 'x' | 'y'): Map<string, Point> {
  const items = members
    .map((m) => ({ m, p: placed(project, m) }))
    .filter((x) => x.p)
    .map(({ m, p }) => ({ m, p: p!, b: boxOf(p!.outline) }));
  const out = new Map<string, Point>();
  if (items.length < 3) return out;
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY);
  const hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  items.sort((a, b) => lo(a.b) - lo(b.b));
  const span = hi(items.at(-1)!.b) - lo(items[0]!.b);
  const sizes = items.reduce((n, x) => n + hi(x.b) - lo(x.b), 0);
  const gap = (span - sizes) / (items.length - 1);
  let cursor = lo(items[0]!.b);
  for (const { m, p, b } of items) {
    const shift = cursor - lo(b);
    out.set(m.id, axis === 'x' ? pt(p.position.x + shift, p.position.y) : pt(p.position.x, p.position.y + shift));
    cursor += hi(b) - lo(b) + gap;
  }
  return out;
}

/** Turns the members as one piece around the centre of their bounding box. */
export function rotatePositions(
  project: Project,
  members: Selection[],
  delta: number,
): Map<string, { position: Point; rotation: Radians }> {
  const items = members.map((m) => ({ m, p: placed(project, m) })).filter((x) => x.p) as { m: Selection; p: Placed }[];
  const all = boxOf(items.flatMap((x) => x.p.outline));
  const cx = (all.minX + all.maxX) / 2;
  const cy = (all.minY + all.maxY) / 2;
  const c = Math.cos(delta);
  const s = Math.sin(delta);
  const out = new Map<string, { position: Point; rotation: Radians }>();
  for (const { m, p } of items) {
    const dx = p.position.x - cx;
    const dy = p.position.y - cy;
    out.set(m.id, {
      position: pt(Math.round(cx + dx * c - dy * s), Math.round(cy + dx * s + dy * c)),
      rotation: normalizeAngle(p.rotation + delta),
    });
  }
  return out;
}

/** Members whose centre lies inside the box. */
export function membersInBox(project: Project, box: Box): Selection[] {
  const inside = (p: Point) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  return [
    ...project.inventory.filter((x) => inside(x.position)).map((x) => ({ kind: 'inventory' as const, id: x.id })),
    ...project.pillars.filter((x) => inside(x.position)).map((x) => ({ kind: 'pillar' as const, id: x.id })),
    ...(project.annotations ?? []).filter((x) => inside(x.position)).map((x) => ({ kind: 'note' as const, id: x.id })),
  ];
}

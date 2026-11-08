import type { Point } from '@/model/geometry';
import type { Project } from '@/model/project';
import type { Mm } from '@/model/units';
import { rectCorners } from './transform';
import { openingSpan } from './openings';
import { innerOutline } from '@/lib/layout';

/** Corners worth measuring from: walls (both faces), fixtures, pillars and door/window ends. */
export function measureTargets(project: Project): Point[] {
  const out: Point[] = [];
  const room = project.room;
  if (room) {
    out.push(...room.corners.map((c) => c.point));
    out.push(...(innerOutline(room) ?? []));
    for (const o of room.openings) {
      const s = openingSpan(room, o);
      if (s) out.push(s.p1, s.p2, s.center);
    }
  }
  for (const it of project.inventory) out.push(...rectCorners(it.position, it.size, it.rotation));
  for (const p of project.pillars) out.push(...rectCorners(p.position, p.size, p.rotation));
  return out;
}

/**
 * Where a measuring click lands: on the nearest corner within `reach` mm,
 * and with `straight`, level or plumb from `from` (whichever is closer).
 */
export function measurePoint(p: Point, targets: readonly Point[], reach: number, from: Point | null, straight: boolean): Point {
  let q: Point = p;
  if (straight && from) {
    q = Math.abs(p.x - from.x) >= Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
  }
  let best: Point | null = null;
  let bestD = reach;
  for (const t of targets) {
    // Keep a straight measurement straight: only targets on its line count.
    if (straight && from && Math.abs(t.x - from.x) > 1 && Math.abs(t.y - from.y) > 1) continue;
    const d = Math.hypot(t.x - q.x, t.y - q.y);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best) return q;
  if (straight && from) {
    return q.y === from.y ? { x: best.x, y: from.y } : { x: from.x, y: best.y };
  }
  return { x: best.x as Mm, y: best.y as Mm };
}

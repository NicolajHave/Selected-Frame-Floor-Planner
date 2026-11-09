import type { Point } from '@/model/geometry';
import type { Project } from '@/model/project';
import { rectCorners } from '@/geometry/transform';
import { pointInPolygon } from '@/geometry/footprint';
import { nearestWall } from '@/geometry/openings';

/** What a right-click on the plan is about. */
export type PlanHit =
  | { kind: 'inventory' | 'pillar' | 'note' | 'opening'; id: string }
  | { kind: 'wall'; index: number; cornerId: string; along: number }
  | { kind: 'floor' }
  | { kind: 'outside' };

/**
 * The topmost thing at `p` (world mm). Notes and openings come from the
 * page (`dom`: the ids under the pointer, found by the caller), fixtures and
 * pillars from their outlines, walls from `reach` mm of their centre line.
 */
export function planHit(project: Project, p: Point, reach: number, dom: { note?: string; opening?: string } = {}): PlanHit {
  if (dom.note) return { kind: 'note', id: dom.note };
  if (dom.opening) return { kind: 'opening', id: dom.opening };
  for (let i = project.inventory.length - 1; i >= 0; i--) {
    const it = project.inventory[i]!;
    if (pointInPolygon(p, rectCorners(it.position, it.size, it.rotation))) return { kind: 'inventory', id: it.id };
  }
  for (let i = project.pillars.length - 1; i >= 0; i--) {
    const pl = project.pillars[i]!;
    if (pointInPolygon(p, rectCorners(pl.position, pl.size, pl.rotation))) return { kind: 'pillar', id: pl.id };
  }
  const room = project.room;
  if (room && room.corners.length >= 2) {
    const w = nearestWall(room, p);
    if (w && w.distance <= Math.max(room.wallThickness / 2, reach)) {
      return { kind: 'wall', index: w.index, cornerId: w.cornerId, along: w.along };
    }
    if (room.closed && pointInPolygon(p, room.corners.map((c) => c.point))) return { kind: 'floor' };
  }
  return { kind: 'outside' };
}

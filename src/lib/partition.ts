import type { Point } from '@/model/geometry';
import type { Pillar } from '@/model/objects';
import { mm, rad } from '@/model/units';
import { newId } from './id';

/** Thickness a new interior wall gets, mm. */
export const PARTITION_THICKNESS = 100;
/** Shortest interior wall worth drawing, mm. */
export const MIN_PARTITION = 200;

/**
 * An interior wall from `a` to `b`: a long, thin, free-standing piece of
 * wall (for a fitting room, a stock room, a screen). It is kept as a pillar
 * of kind 'wall', so it moves, turns, locks with the room, blocks fixtures
 * and shows in 3D and the PDF like one. Null when the two points are too
 * close together.
 */
export function partitionBetween(a: Point, b: Point, height: number, thickness = PARTITION_THICKNESS): Pillar | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < MIN_PARTITION) return null;
  return {
    id: newId('wall'),
    type: 'pillar',
    kind: 'wall',
    shape: 'rect',
    position: { x: mm((a.x + b.x) / 2), y: mm((a.y + b.y) / 2) },
    size: { width: mm(Math.round(length)), depth: mm(thickness), height: mm(height) },
    rotation: rad(Math.atan2(b.y - a.y, b.x - a.x)),
  };
}

export const isPartition = (p: Pick<Pillar, 'kind'>) => p.kind === 'wall';

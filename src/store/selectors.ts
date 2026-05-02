'use client';

import { useMemo } from 'react';
import { usePlannerStore } from './plannerStore';
import { wallLengths } from '@/geometry/walls';
import { cornerAngles } from '@/geometry/corners';
import { polygonArea } from '@/geometry/polygon';
import type { DerivedMetrics } from '@/model/project';

/**
 * One derived snapshot per render. Recomputes whenever the room's
 * corner array reference changes (immer guarantees a fresh array
 * after any structural edit).
 */
export function useDerivedMetrics(): DerivedMetrics | null {
  const room = usePlannerStore((s) => s.project.room);
  return useMemo<DerivedMetrics | null>(() => {
    if (!room) return null;
    const lengths = wallLengths(room.corners, room.closed);
    const angles = cornerAngles(room.corners, room.closed);
    const area = room.closed ? polygonArea(room.corners.map((c) => c.point)) : 0;
    return { wallLengths: lengths, cornerAngles: angles, area };
  }, [room]);
}

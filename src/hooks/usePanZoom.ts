'use client';

import { useCallback } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { boundingBox } from '@/geometry/polygon';
import { fitToBounds } from '@/render/svg/viewport';

/**
 * Fit the current room (plus pillars + inventory) into a given viewport.
 * Falls back to the room's centroid if there's nothing to bound.
 */
export function useFitToPlan() {
  const project = usePlannerStore((s) => s.project);
  const setZoom = usePlannerStore((s) => s.setZoom);
  const setPan = usePlannerStore((s) => s.setPan);
  const resetView = usePlannerStore((s) => s.resetView);

  return useCallback(
    (viewport: { width: number; height: number }) => {
      const points = [
        ...(project.room?.corners.map((c) => c.point) ?? []),
        ...project.pillars.map((p) => p.position),
        ...project.inventory.map((i) => i.position),
      ];
      if (points.length === 0) {
        resetView();
        // Centre the empty canvas at world origin
        setPan(viewport.width / 2, viewport.height / 2);
        return;
      }
      const bb = boundingBox(points);
      if (!bb) {
        resetView();
        return;
      }
      const next = fitToBounds(bb, viewport);
      setZoom(next.zoom);
      setPan(next.pan.x, next.pan.y);
    },
    [project, setZoom, setPan, resetView],
  );
}

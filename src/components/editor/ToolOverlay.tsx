'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { findAsset } from '@/lib/assetCatalog';

export function ToolOverlay() {
  const tool = usePlannerStore((s) => s.tool);
  const room = usePlannerStore((s) => s.project.room);
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);

  let hint: string | null = null;

  if (!room || (room.corners.length === 0 && tool !== 'draw-room')) {
    hint = 'Start by clicking "Draw area" in the toolbar to define the shop.';
  } else if (tool === 'draw-room') {
    if (!room || room.corners.length === 0) {
      hint = 'Click on the canvas to place the first corner.';
    } else if (room.corners.length < 3) {
      hint = 'Keep clicking to add corners.';
    } else {
      hint = 'Click the first corner — or press Esc — to close the shape.';
    }
  } else if (tool === 'add-pillar') {
    hint = 'Click anywhere to drop a pillar.';
  } else if (tool === 'add-inventory') {
    const asset = findAsset(pendingAssetRef ?? undefined);
    hint = asset
      ? `Click to place ${asset.name}.`
      : 'Click anywhere to drop an inventory placeholder.';
  }

  if (!hint) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
      <div className="rounded-[2px] border border-wall-200 bg-wall-50/95 px-3 py-1.5 text-[11px] text-ink-700 shadow-panel backdrop-blur-sm">
        {hint}
      </div>
    </div>
  );
}

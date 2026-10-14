'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { findAsset } from '@/lib/assetCatalog';

export function ToolOverlay() {
  const tool = usePlannerStore((s) => s.tool);
  const room = usePlannerStore((s) => s.project.room);
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);
  const calibration = usePlannerStore((s) => s.calibration);

  if (tool === 'calibrate' && calibration?.a && calibration.b) {
    return (
      <Banner>
        <CalibrationForm />
      </Banner>
    );
  }

  let hint: string | null = null;

  if (tool === 'calibrate') {
    hint = calibration?.a
      ? 'Now click the other end of that distance.'
      : 'Set scale: click one end of a distance you know on the plan — a wall, a door or a dimension line. Esc cancels.';
  } else if (!room || (room.corners.length === 0 && tool !== 'draw-room')) {
    hint = 'Start with "Draw area" in the toolbar — or import the store plan from the panel on the right and trace it.';
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

  return <Banner>{hint}</Banner>;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
      <div className="pointer-events-auto rounded-[2px] border border-wall-200 bg-wall-50/95 px-3 py-1.5 text-[11px] text-ink-700 shadow-panel backdrop-blur-sm">
        {children}
      </div>
    </div>
  );
}

function CalibrationForm() {
  const applyCalibration = usePlannerStore((s) => s.applyCalibration);
  const setTool = usePlannerStore((s) => s.setTool);
  const [text, setText] = useState('');
  const value = Number(text.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;

  return (
    <form
      className="flex items-center gap-2 py-0.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) applyCalibration(value);
      }}
    >
      <label htmlFor="calibration-distance">Real distance between the points</label>
      <input
        id="calibration-distance"
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-20 border-b border-ink-900 bg-transparent text-right font-mono text-[12px] text-ink-900 outline-none"
      />
      <span>mm</span>
      <button
        type="submit"
        disabled={!valid}
        className="rounded-[2px] bg-ink-900 px-2 py-0.5 text-wall-50 disabled:opacity-40"
      >
        Apply
      </button>
      <button type="button" onClick={() => setTool('select')} className="px-1 text-ink-500 hover:text-ink-900">
        Cancel
      </button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { findAsset } from '@/lib/assetCatalog';
import { openingType } from '@/lib/openingTypes';
import { electricalType } from '@/lib/electricalTypes';

export function ToolOverlay() {
  const tool = usePlannerStore((s) => s.tool);
  const room = usePlannerStore((s) => s.project.room);
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);
  const rack = usePlannerStore((s) => s.pendingRack);
  const pendingElectrical = usePlannerStore((s) => s.pendingElectrical);
  const calibration = usePlannerStore((s) => s.calibration);
  const drawLength = usePlannerStore((s) => s.drawLength);
  const pendingOpening = usePlannerStore((s) => s.pendingOpening);

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
    } else if (drawLength) {
      hint = `Next wall: ${drawLength} mm — Enter places it towards the cursor (snapped to 45°, hold Alt for any angle).`;
    } else if (room.corners.length < 3) {
      hint = 'Click to add corners — or type a wall length in mm and press Enter.';
    } else {
      hint = 'Click the first corner — or press Esc — to close the shape. Type a length + Enter for an exact wall.';
    }
  } else if (tool === 'add-opening' && pendingOpening) {
    hint = `Click on a wall to place the ${openingType(pendingOpening).name.toLowerCase()}.`;
  } else if (tool === 'add-electrical' && pendingElectrical) {
    const t = electricalType(pendingElectrical);
    hint =
      t.mount === 'floor'
        ? `Click on the floor to place the ${t.name.toLowerCase()}.`
        : `Click on a wall to place the ${t.name.toLowerCase()} (${t.height.toLocaleString('da-DK')} mm up — change it after).`;
  } else if (tool === 'add-note') {
    hint = 'Click where the note should go, then type it in the panel.';
  } else if (tool === 'add-pillar') {
    hint = 'Click anywhere to drop a pillar.';
  } else if (tool === 'add-inventory') {
    const asset = findAsset(pendingAssetRef ?? undefined);
    hint = rack
      ? `Click next to a wall to place ${rack.name} — it snaps to the wall as one piece. Hold Alt to place freely.`
      : asset
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

'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { findAsset } from '@/lib/assetCatalog';
import { openingType } from '@/lib/openingTypes';
import { electricalType } from '@/lib/electricalTypes';
import { DEFAULT_GAP_MM, runWallTrace } from '@/lib/traceUnderlay';

export function ToolOverlay() {
  const tool = usePlannerStore((s) => s.tool);
  const room = usePlannerStore((s) => s.project.room);
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);
  const rack = usePlannerStore((s) => s.pendingRack);
  const pendingElectrical = usePlannerStore((s) => s.pendingElectrical);
  const calibration = usePlannerStore((s) => s.calibration);
  const drawLength = usePlannerStore((s) => s.drawLength);
  const pendingOpening = usePlannerStore((s) => s.pendingOpening);

  if (tool === 'trace-room') {
    return (
      <Banner>
        <WallDraftPanel />
      </Banner>
    );
  }

  if (tool === 'measure') {
    return (
      <Banner>
        <MeasurePanel />
      </Banner>
    );
  }

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
  } else if (tool === 'draw-rect') {
    hint =
      room && room.corners.length > 0
        ? 'Drag a rectangle for the room — it replaces the current walls. Then drag corners or type exact lengths to adjust. Esc cancels.'
        : 'Drag a rectangle for the room. Then drag corners or type exact lengths to adjust. Esc cancels.';
  } else if (!room || (room.corners.length === 0 && tool !== 'draw-room')) {
    hint = 'Start with "Rectangle" or "Draw area" in the toolbar — or import the store plan from the panel on the right and trace it.';
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

function MeasurePanel() {
  const measure = usePlannerStore((s) => s.measure);
  const kept = usePlannerStore((s) => s.project.dimensions?.length ?? 0);
  const { keepMeasure, clearDimensions } = usePlannerStore.getState();
  const done = measure?.b ? Math.round(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y)) : null;
  return (
    <div className="flex items-center gap-3 py-0.5" data-testid="measure-panel">
      {done !== null ? (
        <>
          <span>
            <b className="font-mono text-[13px] font-medium text-ink-900" data-testid="measure-result">
              {done.toLocaleString('da-DK')} mm
            </b>{' '}
            · click to measure again
          </span>
          <button onClick={keepMeasure} className="rounded-[2px] bg-ink-900 px-2 py-0.5 text-[11px] font-medium text-wall-50">
            Keep on plan
          </button>
        </>
      ) : (
        <span>
          {measure ? 'Click the other end.' : 'Click where to measure from — corners snap, Shift keeps it straight.'} Esc stops.
        </span>
      )}
      {kept > 0 && (
        <button onClick={clearDimensions} className="text-[11px] text-ink-500 underline-offset-2 hover:underline">
          Remove all {kept} dimension{kept === 1 ? '' : 's'}
        </button>
      )}
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

/** Draft walls from the plan: click a room, close its openings, use the outline. */
function WallDraftPanel() {
  const draft = usePlannerStore((s) => s.wallDraft);
  const room = usePlannerStore((s) => s.project.room);
  const apply = usePlannerStore((s) => s.applyWallDraft);
  const setTool = usePlannerStore((s) => s.setTool);
  const [gap, setGap] = useState(draft?.gapMm ?? DEFAULT_GAP_MM);
  const replacing = !!room && room.corners.length > 0;

  const retrace = (mm: number) => {
    setGap(mm);
    if (draft) void runWallTrace(draft.seeds, mm);
  };

  const status = !draft
    ? 'Click inside the room on the plan — the walls around it are found for you.'
    : draft.busy
      ? 'Finding the walls…'
      : draft.error
        ? draft.error
        : draft.leaked
          ? 'That area isn’t closed: an opening is wider than the setting below. Raise it, or click inside a smaller room.'
          : `Found ${draft.points!.length} walls · ${draft.areaM2.toFixed(1).replace('.', ',')} m² inside. Missing a part? Shift-click it to add it. Then use the outline.`;

  return (
    <div className="flex w-[520px] max-w-[80vw] flex-col gap-2 py-1" data-testid="wall-draft-panel">
      <p className="text-[12px] leading-snug text-ink-900">{status}</p>
      <label className="flex items-center gap-2 text-[11px] text-ink-700">
        <span className="shrink-0">Close openings up to</span>
        <input
          type="range"
          min={0}
          max={3000}
          step={100}
          value={gap}
          onChange={(e) => setGap(Number(e.target.value))}
          onPointerUp={(e) => retrace(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => retrace(Number((e.target as HTMLInputElement).value))}
          aria-label="Close openings up to"
          className="flex-1"
        />
        <span className="w-12 shrink-0 text-right font-mono">{(gap / 1000).toFixed(1)} m</span>
      </label>
      <div className="flex items-center justify-end gap-2">
        {replacing && draft?.points && !draft.leaked && (
          <span className="mr-auto text-[11px] text-ink-500">Replaces the current walls (doors and wall points on them too).</span>
        )}
        <button className="px-2 py-1 text-[12px] text-ink-700 hover:text-ink-900" onClick={() => setTool('select')}>
          Cancel
        </button>
        <button
          className="rounded-[2px] bg-ink-900 px-3 py-1 text-[12px] text-wall-50 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!draft?.points || draft.leaked || draft.busy}
          onClick={apply}
        >
          Use as walls
        </button>
      </div>
    </div>
  );
}

'use client';

import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { mm } from '@/model/units';
import { cornerAngles, type Turn } from '@/geometry/corners';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { Button } from '../ui/Button';

export function CornerProperties({ cornerId }: { cornerId: string }) {
  const room = usePlannerStore((s) => s.project.room);
  const moveCorner = usePlannerStore((s) => s.moveCorner);
  const deleteCorner = usePlannerStore((s) => s.deleteCorner);
  const setCornerAngle = usePlannerStore((s) => s.setCornerAngle);
  const turn = usePlannerStore((s) => s.cornerTurn);
  const setTurn = usePlannerStore((s) => s.setCornerTurn);
  const keepLength = usePlannerStore((s) => s.cornerKeepLength);
  const setKeepLength = usePlannerStore((s) => s.setCornerKeepLength);
  const beginGesture = usePlannerStore((s) => s.beginGesture);
  const endGesture = usePlannerStore((s) => s.endGesture);

  const index = room ? room.corners.findIndex((c) => c.id === cornerId) : -1;
  const corner = room?.corners[index] ?? null;
  if (!room || !corner) return null;

  const n = room.corners.length;
  // Walls are numbered as on the plan: wall 1 leaves the first corner.
  const wall = (i: number) => (((i % n) + n) % n) + 1;
  const arriving = wall(index - 1);
  const leaving = wall(index);
  // The two ends of an outline that is not closed yet have only one wall.
  const hasAngle = n >= 3 && (room.closed || (index > 0 && index < n - 1));
  const angle = hasAngle ? cornerAngles(room.corners, room.closed)[index] ?? 0 : 0;
  const turning = turn === 'next' ? leaving : arriving;
  const still = turn === 'next' ? arriving : leaving;
  const beyond = turn === 'next' ? wall(index + 1) : wall(index - 2);

  const choice = (which: Turn, number: number) => (
    <button
      type="button"
      role="radio"
      aria-checked={turn === which}
      onClick={() => setTurn(which)}
      className={clsx(
        'flex-1 border px-2 py-1.5 text-[12px] transition-colors',
        turn === which ? 'border-ink-900 bg-ink-900 text-wall-50' : 'border-wall-300 text-ink-700 hover:border-ink-900',
      )}
    >
      Wall {number}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <Section title="Corner">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">Corner</p>
          <p className="text-[11px] text-ink-500">
            {hasAngle ? `Between wall ${arriving} and wall ${leaving}` : 'The end of the outline'}
          </p>
        </div>
      </Section>

      {hasAngle && (
        <>
          <div className="h-px bg-wall-200" />

          <Section title="Set the angle">
            <div className="flex items-end gap-3">
              <NumberField
                label="Angle"
                unit="°"
                value={angle}
                decimals={1}
                step={1}
                min={1}
                max={359}
                className="flex-1"
                stepper={{ by: 1, onStart: beginGesture, onEnd: endGesture }}
                onCommit={(v) => setCornerAngle(cornerId, v)}
              />
              <Button
                variant="subtle"
                className="shrink-0"
                disabled={Math.abs(angle - 90) < 0.05}
                onClick={() => setCornerAngle(cornerId, 90)}
                title="Make this a square corner"
              >
                90°
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <span id="corner-turn" className="text-[10px] uppercase tracking-widest2 text-ink-500">
                The wall that turns
              </span>
              <div role="radiogroup" aria-labelledby="corner-turn" className="flex gap-2">
                {choice('next', leaving)}
                {choice('prev', arriving)}
              </div>
            </div>

            {room.closed && (
              <label className="flex items-start gap-2 text-[12px] text-ink-900">
                <input
                  type="checkbox"
                  className="mt-[2px]"
                  checked={keepLength}
                  onChange={(e) => setKeepLength(e.target.checked)}
                />
                <span>Wall {turning} keeps its length</span>
              </label>
            )}

            <p className="text-[11px] leading-relaxed text-ink-500">
              The angle is the one inside the room. Wall {turning} turns about this corner and wall {still} stays where
              it is; it is marked on the plan.{' '}
              {!room.closed
                ? 'Everything drawn past the corner swings round with it.'
                : keepLength
                  ? `It keeps its length, so wall ${beyond} turns with its far end.`
                  : `Its far end follows wall ${beyond}, which keeps its direction: only walls ${turning} and ${beyond} change length.`}
            </p>
          </Section>
        </>
      )}

      <div className="h-px bg-wall-200" />

      <Section title="Position">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="X"
            unit="mm"
            value={corner.point.x}
            step={10}
            onCommit={(v) => moveCorner(cornerId, { x: mm(v), y: corner.point.y })}
          />
          <NumberField
            label="Y"
            unit="mm"
            value={corner.point.y}
            step={10}
            onCommit={(v) => moveCorner(cornerId, { x: corner.point.x, y: mm(v) })}
          />
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <Button variant="subtle" onClick={() => deleteCorner(cornerId)}>
          Delete corner
        </Button>
        <p className="text-[11px] leading-relaxed text-ink-500">
          A closed room must keep at least three corners.
        </p>
      </Section>
    </div>
  );
}

'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';

/** Arrows beside the field: a click moves the value one step, holding one keeps it moving. */
export interface Stepper {
  /** How far one step goes. The value lands on whole steps. */
  by: number;
  /** Around a click or a hold, so all of it can be one undo step. */
  onStart?: () => void;
  onEnd?: () => void;
}

interface Props {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  stepper?: Stepper;
}

/** Before a held arrow starts repeating, and between the steps once it does (ms). */
const HOLD_DELAY = 350;
const HOLD_EVERY = 35;

/** The next whole step up or down from `value` (a value between two steps goes to the nearest one that way). */
export function stepFrom(value: number, by: number, dir: 1 | -1): number {
  const at = value / by;
  return (dir > 0 ? Math.floor(at + 1e-3) + 1 : Math.ceil(at - 1e-3) - 1) * by;
}

/**
 * Local string state so the user can erase the field while typing
 * without triggering a numeric jump. Commits on blur or Enter.
 */
export function NumberField({
  label,
  value,
  onCommit,
  unit,
  step = 1,
  min,
  max,
  className,
  stepper,
}: Props) {
  const [text, setText] = useState(() => String(Math.round(value)));

  useEffect(() => {
    setText(String(Math.round(value)));
  }, [value]);

  // For the arrows: the latest of everything, so a running hold never works from a stale render.
  const live = useRef({ value, onCommit, stepper, min, max });
  live.current = { value, onCommit, stepper, min, max };
  const hold = useRef<{ wait?: number; every?: number } | null>(null);

  const stepOnce = (dir: 1 | -1) => {
    const now = live.current;
    if (!now.stepper) return;
    let next = stepFrom(now.value, now.stepper.by, dir);
    if (now.min !== undefined) next = Math.max(now.min, next);
    if (now.max !== undefined) next = Math.min(now.max, next);
    now.value = next;
    now.onCommit(next);
  };
  const stopHold = () => {
    if (!hold.current) return;
    window.clearTimeout(hold.current.wait);
    window.clearInterval(hold.current.every);
    hold.current = null;
    live.current.stepper?.onEnd?.();
  };
  const startHold = (dir: 1 | -1) => {
    stopHold();
    const timers: { wait?: number; every?: number } = {};
    hold.current = timers;
    live.current.stepper?.onStart?.();
    stepOnce(dir);
    timers.wait = window.setTimeout(() => {
      timers.every = window.setInterval(() => stepOnce(dir), HOLD_EVERY);
    }, HOLD_DELAY);
  };
  // Let go of a hold if the field goes away mid-press (the selection changed).
  useEffect(() => stopHold, []); // eslint-disable-line react-hooks/exhaustive-deps

  const arrow = (dir: 1 | -1) => (
    <button
      type="button"
      aria-label={`${label} ${dir > 0 ? 'up' : 'down'}`}
      title="Click for one step; hold to keep going"
      className="flex h-[13px] w-5 touch-none select-none items-center justify-center text-ink-500 hover:bg-wall-200 hover:text-ink-900 disabled:opacity-40"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        startHold(dir);
      }}
      onPointerUp={stopHold}
      onPointerCancel={stopHold}
      onLostPointerCapture={stopHold}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // Only from the keyboard (Enter or Space): a pointer has already stepped on its way down.
        if (e.detail !== 0) return;
        live.current.stepper?.onStart?.();
        stepOnce(dir);
        live.current.stepper?.onEnd?.();
      }}
    >
      <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
        <path
          d={dir > 0 ? 'M1 4.2 4 1.2l3 3' : 'M1 .8l3 3 3-3'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n)) {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onCommit(v);
      setText(String(Math.round(v)));
    } else {
      setText(String(Math.round(value)));
    }
  };

  return (
    // The arrows stand beside the label, not in it: they are not part of the field's name.
    <div className={clsx('flex items-end gap-1', className)}>
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest2 text-ink-500">{label}</span>
        <div className="relative flex items-center">
          <input
            type="number"
            value={text}
            step={step}
            min={min}
            max={max}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setText(String(Math.round(value)));
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-full border-b border-ink-100 bg-transparent py-1 pr-8 text-[13px] text-ink-900 outline-none transition-colors focus:border-ink-900"
          />
          {unit && (
            <span className="pointer-events-none absolute right-1 text-[11px] text-ink-500">{unit}</span>
          )}
        </div>
      </label>
      {stepper && (
        <span className="flex shrink-0 flex-col overflow-hidden rounded-[2px] border border-wall-200">
          {arrow(1)}
          {arrow(-1)}
        </span>
      )}
    </div>
  );
}

'use client';

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
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
}: Props) {
  const [text, setText] = useState(() => String(Math.round(value)));

  useEffect(() => {
    setText(String(Math.round(value)));
  }, [value]);

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
    <label className={clsx('flex flex-col gap-1', className)}>
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
  );
}

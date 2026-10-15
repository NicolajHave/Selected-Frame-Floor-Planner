'use client';

import { clsx } from 'clsx';

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label={label}>
      <span className="text-[10px] uppercase tracking-widest2 text-ink-500">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            onClick={() => o.value !== value && onChange(o.value)}
            className={clsx(
              'rounded-[2px] border px-2 py-1 text-[11px]',
              o.value === value
                ? 'border-ink-900 bg-ink-900 text-wall-50'
                : 'border-wall-200 bg-wall-50 text-ink-900 hover:bg-wall-100',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

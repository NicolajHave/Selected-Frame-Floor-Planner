'use client';

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: string;
  onCommit: (s: string) => void;
  className?: string;
}

export function TextField({ label, value, onCommit, className }: Props) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="text-[10px] uppercase tracking-widest2 text-ink-500">{label}</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="border-b border-ink-100 bg-transparent py-1 text-[13px] text-ink-900 outline-none transition-colors focus:border-ink-900"
      />
    </label>
  );
}

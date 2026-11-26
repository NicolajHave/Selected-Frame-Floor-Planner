'use client';

import { clsx } from 'clsx';
import { useEffect, useRef } from 'react';

export interface Swatch {
  id: string;
  name: string;
  /** What fills it: a colour, and over it a picture where there is one. */
  color: string;
  image?: string;
}

/**
 * A row of colours (or small pictures) to pick one from. `own`, where
 * given, adds a field for a colour that is not in the row.
 */
export function Swatches({
  label,
  swatches,
  value,
  onPick,
  own,
}: {
  label: string;
  swatches: Swatch[];
  /** The id of the one chosen, or null when it is none of them. */
  value: string | null;
  onPick: (id: string) => void;
  own?: { color: string; active: boolean; onPick: (color: string) => void; onStart?: () => void; onEnd?: () => void };
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {swatches.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={s.id === value}
          aria-label={s.name}
          title={s.name}
          onClick={() => s.id !== value && onPick(s.id)}
          className={clsx(
            'h-8 w-8 rounded-[2px] border bg-cover bg-center outline-offset-2',
            s.id === value ? 'border-ink-900 outline outline-2 outline-ink-900' : 'border-wall-300 hover:border-ink-900',
          )}
          style={{ backgroundColor: s.color, backgroundImage: s.image ? `url(${s.image})` : undefined, backgroundSize: '200%' }}
        />
      ))}
      {own && <OwnColor label={`${label}: a colour of your own`} {...own} />}
    </div>
  );
}

/**
 * The browser's colour picker. While it is open every colour tried shows at
 * once; `onStart` and `onEnd` bracket the picking so it can be one undo step.
 */
function OwnColor({
  label,
  color,
  active,
  onPick,
  onStart,
  onEnd,
}: {
  label: string;
  color: string;
  active: boolean;
  onPick: (color: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  const end = useRef(onEnd);
  end.current = onEnd;
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const done = () => {
      if (!picking.current) return;
      picking.current = false;
      end.current?.();
    };
    // "change" (not React's onChange, which is every colour tried): the picker was closed.
    el.addEventListener('change', done);
    el.addEventListener('blur', done);
    return () => {
      el.removeEventListener('change', done);
      el.removeEventListener('blur', done);
      done();
    };
  }, []);
  return (
    <label
      title="A colour of your own"
      className={clsx(
        'relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-[2px] border text-[15px] leading-none outline-offset-2',
        active ? 'border-ink-900 outline outline-2 outline-ink-900' : 'border-dashed border-wall-300 text-ink-500 hover:border-ink-900',
      )}
      style={active ? { backgroundColor: color } : undefined}
    >
      {!active && <span aria-hidden="true">+</span>}
      <input
        ref={input}
        type="color"
        aria-label={label}
        value={color}
        onChange={(e) => {
          if (!picking.current) {
            picking.current = true;
            onStart?.();
          }
          onPick(e.target.value.toLowerCase());
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

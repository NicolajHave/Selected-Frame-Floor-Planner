'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from './Button';

/** A top-bar button that opens a small dropdown of actions. */
export function Menu({ label, children, align = 'left' }: { label: string; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button variant="ghost" aria-haspopup="menu" aria-expanded={open} active={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <span aria-hidden className="text-[9px] opacity-60">▾</span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onClick={() => setOpen(false)}
          className={clsx(
            'absolute top-9 z-40 flex min-w-[200px] flex-col rounded-[2px] border border-wall-200 bg-wall-50 py-1 shadow-panel',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  onClick: () => void;
  children: ReactNode;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
}

export function MenuItem({ onClick, children, hint, checked, disabled }: ItemProps) {
  return (
    <button
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[12px] text-ink-900 hover:bg-wall-100 disabled:opacity-40"
    >
      {checked !== undefined && <span aria-hidden className="w-3 text-[11px]">{checked ? '✓' : ''}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[10px] text-ink-500">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-wall-200" />;
}

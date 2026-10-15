'use client';

import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/** Centered modal. Esc or a click on the backdrop closes it. */
export function Dialog({ title, onClose, children, width = 440 }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/30 p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[76vh] w-full flex-col rounded-[2px] border border-wall-200 bg-wall-50 shadow-panel"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-wall-200 px-5 py-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest2 text-ink-700">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="px-1 text-[16px] leading-none text-ink-500 hover:text-ink-900">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[10px] uppercase tracking-widest2 text-ink-500">{children}</span>;
}

export const inputClass =
  'w-full border-b border-wall-300 bg-transparent py-1 text-[13px] text-ink-900 outline-none focus:border-ink-900';

export function ErrorText({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-[12px] text-red-700">{children}</p>;
}

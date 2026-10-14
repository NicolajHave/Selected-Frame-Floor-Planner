'use client';

import { useEffect } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';

const AUTO_HIDE_MS = 12_000;

export function NoticeToast() {
  const notice = usePlannerStore((s) => s.notice);
  const dismiss = usePlannerStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice || notice.tone === 'warning') return; // warnings stay until dismissed
    const t = window.setTimeout(dismiss, AUTO_HIDE_MS);
    return () => window.clearTimeout(t);
  }, [notice, dismiss]);

  if (!notice) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <div
        role={notice.tone === 'warning' ? 'alert' : 'status'}
        className={clsx(
          'pointer-events-auto flex max-w-[560px] items-start gap-3 rounded-[2px] border px-4 py-3 shadow-panel',
          notice.tone === 'warning'
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : 'border-wall-200 bg-wall-50 text-ink-900',
        )}
      >
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest2">
          {notice.tone === 'warning' ? 'Check walls' : 'Note'}
        </span>
        <p className="flex-1 text-[12px] leading-relaxed">{notice.message}</p>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 px-1 text-[14px] leading-none text-ink-500 hover:text-ink-900"
        >
          ×
        </button>
      </div>
    </div>
  );
}

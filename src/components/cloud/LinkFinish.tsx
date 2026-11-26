'use client';

import { useEffect } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { useLinkFinish, type FinishTarget } from '@/lib/cloud/linkFinish';
import { useComments } from '@/lib/cloud/comments';
import { DEFAULT_WALL_COLOR, finishInWords, overlayFinish, sameFinish } from '@/lib/finishes';
import type { RoomFinish } from '@/model/objects';
import { FinishPickers } from '../panels/FinishPickers';
import { Button } from '../ui/Button';

/** How often someone on the plan looks again for a choice made on the link, ms. */
const REFRESH_MS = 30_000;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Keeps the link's floor and wall choice in step with the open plan. */
export function useLinkFinishSync(target: FinishTarget | null) {
  const setTarget = useLinkFinish((s) => s.setTarget);
  const key = JSON.stringify(target);
  useEffect(() => {
    setTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setTarget]);
  useEffect(() => {
    // A visitor is the one choosing; people on the plan look out for what was chosen.
    if (target?.kind !== 'member') return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void useLinkFinish.getState().refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** On a view-only link: the button that opens the visitor's floor and wall choice. */
export function LinkFinishButton() {
  const onLink = useLinkFinish((s) => s.target?.kind === 'link');
  const open = useLinkFinish((s) => s.open);
  const chosen = useLinkFinish((s) => !!s.chosen);
  const hasRoom = usePlannerStore((s) => !!s.project.room?.closed);
  if (!onLink || !hasRoom) return null;
  return (
    <button
      onClick={() => {
        if (!open) useComments.getState().setOpen(false);
        useLinkFinish.getState().setOpen(!open);
      }}
      aria-pressed={open}
      title="Show the plan with your shop's floor and wall colour"
      className={clsx(
        'flex h-7 items-center gap-1.5 rounded-[2px] border px-2.5 text-[11px] font-medium shadow-panel backdrop-blur-sm',
        open ? 'border-ink-900 bg-ink-900 text-wall-50' : 'border-wall-200 bg-wall-50/95 text-ink-900 hover:border-ink-900',
      )}
    >
      Floor &amp; walls
      {chosen && <span aria-hidden="true" className={clsx('h-1.5 w-1.5 rounded-full', open ? 'bg-wall-50' : 'bg-ink-900')} />}
    </button>
  );
}

/** On a view-only link: the visitor picks the floor and the wall colour of their shop. */
export function LinkFinishPanel() {
  const target = useLinkFinish((s) => s.target);
  const open = useLinkFinish((s) => s.open);
  const chosen = useLinkFinish((s) => s.chosen);
  const kept = useLinkFinish((s) => s.kept);
  const error = useLinkFinish((s) => s.error);
  const commentsOpen = useComments((s) => s.open);
  const shared = usePlannerStore((s) => s.shared);
  const shown = usePlannerStore((s) => s.project.room?.finish);
  const { choose, setOpen } = useLinkFinish.getState();
  // One panel at a time beside the plan.
  useEffect(() => {
    if (commentsOpen) setOpen(false);
  }, [commentsOpen, setOpen]);
  if (target?.kind !== 'link' || !open || !shared) return null;

  const mine = chosen?.finish;
  return (
    <aside
      aria-label="Floor and walls"
      // Above the banner that says whose plan this is (z-10): the panel is being used, the banner only tells.
      className="absolute bottom-3 right-3 top-12 z-20 flex w-[300px] flex-col rounded-[2px] border border-wall-200 bg-wall-50 shadow-panel"
    >
      <header className="flex items-center justify-between border-b border-wall-200 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">Floor &amp; walls</span>
        <button onClick={() => setOpen(false)} aria-label="Close floor and walls" className="text-[14px] leading-none text-ink-500 hover:text-ink-900">
          ×
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <p className="text-[11px] leading-relaxed text-ink-500">
          Is this not the floor or the wall colour of your shop? Choose them here and the 3D view shows the plan in your shop&apos;s
          own. It is up to you, and it changes nothing in the layout.
        </p>
        <FinishPickers
          finish={shown}
          // The neutral floor or walls: said outright where the plan says otherwise, else simply not chosen.
          onFloor={(floor) => choose(withPart(mine, 'floor', floor ?? (shared.planFinish?.floor ? { kind: 'plain' } : undefined)))}
          onWall={(wall) => choose(withPart(mine, 'wall', wall ?? (shared.planFinish?.wall ? DEFAULT_WALL_COLOR : undefined)))}
        />
        {error && (
          <p role="alert" className="rounded-[2px] border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
            Your choice shows here, but it was not saved: {error}
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-ink-500" data-testid="link-finish-status">
          {!mine
            ? 'Nothing chosen: this is what the plan says.'
            : kept === 'cloud'
              ? `Your choice is kept with this link, and ${shared.ownerEmail} can see it.`
              : 'Your choice is kept in this browser.'}
        </p>
        {mine && (
          <Button variant="subtle" className="justify-center" onClick={() => choose(null)}>
            Back to what the plan says
          </Button>
        )}
      </div>
    </aside>
  );
}

/** A visitor's choice with one part of it set anew, or taken out (it then falls back to the plan's). */
function withPart<K extends 'floor' | 'wall'>(mine: RoomFinish | undefined, part: K, value: RoomFinish[K] | undefined): RoomFinish | null {
  const next: RoomFinish = { ...mine };
  if (value) next[part] = value;
  else delete next[part];
  return next.floor || next.wall ? next : null;
}

/**
 * In the plan's own panel: what a visitor chose on the link, to take into
 * the plan or to dismiss. Shown only while it says something the plan does
 * not.
 */
export function LinkFinishSuggestion({ planSays }: { planSays: string }) {
  const target = useLinkFinish((s) => s.target);
  const chosen = useLinkFinish((s) => s.chosen);
  const error = useLinkFinish((s) => s.error);
  const plan = usePlannerStore((s) => s.project.room?.finish);
  if (target?.kind !== 'member' || !chosen) return null;
  if (sameFinish(overlayFinish(plan, chosen.finish), plan)) return null;
  const { adopt, dismiss } = useLinkFinish.getState();
  return (
    <div className="flex flex-col gap-2 rounded-[2px] border border-amber-300 bg-amber-50 px-3 py-2.5" data-testid="link-finish-suggestion">
      <p className="text-[12px] leading-relaxed text-amber-950">
        Chosen on the link by {chosen.chosen_by || 'someone with the link'}
        {when(chosen.chosen_at) ? `, ${when(chosen.chosen_at)}` : ''}: <strong className="font-medium">{finishInWords(chosen.finish)}</strong>.
        {planSays ? ` The plan says ${planSays}.` : ' The plan says nothing yet.'}
      </p>
      {target.canAdopt && (
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void adopt()}>
            Use in the plan
          </Button>
          <Button variant="ghost" onClick={() => void dismiss()}>
            Dismiss
          </Button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-800">{error}</p>}
    </div>
  );
}

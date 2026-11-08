'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { pinsFor, rememberName, rememberedName, useComments, type CommentTarget, type PlanComment } from '@/lib/cloud/comments';
import { eventToWorld, worldToScreen } from '@/render/svg/viewport';
import type { Mm } from '@/model/units';

/** How often open comments are fetched again, ms. */
const REFRESH_MS = 30_000;

const when = (iso: string) =>
  new Date(iso).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Keeps the comments in step with the open plan: which plan, and fresh every half minute. */
export function useCommentsSync(target: CommentTarget | null) {
  const setTarget = useComments((s) => s.setTarget);
  const key = JSON.stringify(target);
  useEffect(() => {
    setTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setTarget]);
  useEffect(() => {
    if (!target) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void useComments.getState().refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The open comments count, as a button for the top right of the plan. */
export function CommentsButton() {
  const target = useComments((s) => s.target);
  const list = useComments((s) => s.list);
  const open = useComments((s) => s.open);
  const setOpen = useComments((s) => s.setOpen);
  if (!target) return null;
  const count = list.filter((c) => !c.resolved_at).length;
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      title="Comments on this plan"
      className={clsx(
        'absolute right-3 top-3 z-10 flex h-7 items-center gap-1.5 rounded-[2px] border px-2.5 text-[11px] font-medium shadow-panel backdrop-blur-sm',
        open ? 'border-ink-900 bg-ink-900 text-wall-50' : 'border-wall-200 bg-wall-50/95 text-ink-900 hover:border-ink-900',
      )}
    >
      Comments
      {count > 0 && (
        <span data-testid="comment-count" className={clsx('rounded-full px-1.5 text-[10px]', open ? 'bg-wall-50 text-ink-900' : 'bg-ink-900 text-wall-50')}>
          {count}
        </span>
      )}
    </button>
  );
}

/** Pins on the 2D plan, and the click that places a new one. */
export function CommentPins() {
  const view = usePlannerStore((s) => s.view);
  const activeVariantId = usePlannerStore((s) => s.project.activeVariantId);
  const list = useComments((s) => s.list);
  const placing = useComments((s) => s.placing);
  const draftAt = useComments((s) => s.draftAt);
  const focusId = useComments((s) => s.focusId);
  const { place, focus } = useComments.getState();
  const pins = pinsFor(list, activeVariantId);
  const number = useMemo(() => new Map(list.map((c, i) => [c.id, i + 1])), [list]);

  return (
    <>
      {pins.map((c) => {
        const s = worldToScreen(view, { x: c.x! as Mm, y: c.y! as Mm });
        return (
          <button
            key={c.id}
            data-testid="comment-pin"
            title={`${c.author_name}: ${c.body}`}
            onClick={() => focus(c.id)}
            className={clsx(
              'absolute z-[5] flex h-6 min-w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border-2 border-wall-50 px-1 text-[10px] font-semibold shadow-panel',
              focusId === c.id ? 'bg-amber-700 text-wall-50' : 'bg-ink-900 text-wall-50',
            )}
            style={{ left: s.x, top: s.y }}
          >
            {number.get(c.id)}
          </button>
        );
      })}
      {draftAt && (
        <span
          className="pointer-events-none absolute z-[5] h-6 w-6 -translate-x-1/2 -translate-y-full rounded-full rounded-bl-none border-2 border-wall-50 bg-amber-700 shadow-panel"
          style={{ left: worldToScreen(view, { x: draftAt.x as Mm, y: draftAt.y as Mm }).x, top: worldToScreen(view, { x: draftAt.x as Mm, y: draftAt.y as Mm }).y }}
        />
      )}
      {placing && (
        <div
          data-testid="comment-place"
          className="absolute inset-0 z-[6] cursor-crosshair"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const w = eventToWorld(view, r, e.clientX, e.clientY);
            place({ x: Math.round(w.x), y: Math.round(w.y) });
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-[2px] border border-wall-200 bg-wall-50/95 px-3 py-1.5 text-[11px] text-ink-700 shadow-panel">
            Click the spot on the plan the comment is about · Esc cancels
          </div>
        </div>
      )}
    </>
  );
}

/** The comments next to the plan: read, write, pin, resolve. */
export function CommentsPanel() {
  const target = useComments((s) => s.target);
  const open = useComments((s) => s.open);
  const list = useComments((s) => s.list);
  const loaded = useComments((s) => s.loaded);
  const error = useComments((s) => s.error);
  const focusId = useComments((s) => s.focusId);
  const draftAt = useComments((s) => s.draftAt);
  const placing = useComments((s) => s.placing);
  const project = usePlannerStore((s) => s.project);
  const is2d = usePlannerStore((s) => s.view.viewMode === '2d');
  const { setOpen, startPlacing, place, add, setResolved, focus } = useComments.getState();
  const [showResolved, setShowResolved] = useState(false);
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => setName(rememberedName()), []);

  // Esc stops placing a pin.
  useEffect(() => {
    if (!placing) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && place(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [placing, place]);

  // A pin clicked on the plan scrolls its comment into view.
  useEffect(() => {
    if (focusId) listRef.current?.querySelector(`[data-id="${focusId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusId, open]);

  if (!target || !open) return null;
  const link = target.kind === 'link';
  const canResolve = target.kind === 'member' && target.canResolve;
  const variants = new Map((project.variants ?? []).map((v) => [v.id, v.name]));
  const shown = list.filter((c) => showResolved || !c.resolved_at);
  const resolvedCount = list.filter((c) => c.resolved_at).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    if (link && !name.trim()) {
      setProblem('Give your name, so the planners know who wrote it.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (link) rememberName(name.trim());
      await add({ name: name.trim(), body: body.trim(), variantId: draftAt ? project.activeVariantId ?? null : null });
      setBody('');
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'The comment was not saved.');
    } finally {
      setBusy(false);
    }
  };

  /** Brings a pinned comment's spot into the middle of the plan (and its layout on screen). */
  const show = (c: PlanComment) => {
    focus(c.id);
    const s = usePlannerStore.getState();
    if (c.variant_id && c.variant_id !== s.project.activeVariantId && variants.has(c.variant_id)) s.switchVariant(c.variant_id);
    if (c.x === null || c.y === null || s.view.viewMode !== '2d') return;
    const stage = document.querySelector('[data-stage]')?.getBoundingClientRect();
    if (!stage) return;
    s.setPan(stage.width / 2 - c.x * s.view.zoom, stage.height / 2 - c.y * s.view.zoom);
  };

  return (
    <aside
      aria-label="Comments"
      className="absolute bottom-3 right-3 top-12 z-10 flex w-[300px] flex-col rounded-[2px] border border-wall-200 bg-wall-50 shadow-panel"
    >
      <header className="flex items-center justify-between border-b border-wall-200 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">Comments</span>
        <div className="flex items-center gap-2">
          {resolvedCount > 0 && (
            <label className="flex items-center gap-1 text-[11px] text-ink-500">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
              Resolved ({resolvedCount})
            </label>
          )}
          <button onClick={() => setOpen(false)} aria-label="Close comments" className="text-[14px] leading-none text-ink-500 hover:text-ink-900">
            ×
          </button>
        </div>
      </header>

      <ol ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" data-testid="comment-list">
        {!loaded ? (
          <li className="text-[12px] text-ink-500">Loading…</li>
        ) : shown.length === 0 ? (
          <li className="text-[12px] leading-relaxed text-ink-500">
            {list.length ? 'All comments are resolved.' : 'No comments yet. Write one below — pin it to a spot on the plan if it is about one.'}
          </li>
        ) : (
          shown.map((c) => (
            <li
              key={c.id}
              data-id={c.id}
              className={clsx(
                'rounded-[2px] border p-2.5 text-[12px]',
                focusId === c.id ? 'border-amber-700 bg-white' : 'border-wall-200 bg-white/70',
                c.resolved_at && 'opacity-60',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-ink-900">
                  <span className="mr-1 text-ink-500">#{list.indexOf(c) + 1}</span>
                  {c.author_name}
                  {c.via_link && <span className="ml-1 text-[10px] font-normal text-ink-500">(via link)</span>}
                </span>
                <span className="shrink-0 text-[10px] text-ink-500">{when(c.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-ink-700">{c.body}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {c.x !== null && (
                  <button onClick={() => show(c)} className="text-ink-700 underline-offset-2 hover:underline">
                    Show on plan{c.variant_id && variants.has(c.variant_id) ? ` (${variants.get(c.variant_id)})` : ''}
                  </button>
                )}
                {canResolve && (
                  <button
                    onClick={() => void setResolved(c.id, !c.resolved_at).catch((e: unknown) => setProblem(e instanceof Error ? e.message : 'That did not work.'))}
                    className="text-ink-700 underline-offset-2 hover:underline"
                  >
                    {c.resolved_at ? 'Reopen' : 'Resolve'}
                  </button>
                )}
                {c.resolved_at && <span className="text-ink-500">Resolved{c.resolved_by_email ? ` by ${c.resolved_by_email}` : ''}</span>}
              </div>
            </li>
          ))
        )}
        {error && <li className="text-[11px] text-red-700">{error}</li>}
      </ol>

      <form onSubmit={submit} className="flex flex-col gap-2 border-t border-wall-200 p-3">
        {link && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Your name"
            aria-label="Your name"
            className="h-8 rounded-[2px] border border-wall-200 bg-white px-2 text-[12px] outline-none focus:border-ink-900"
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Write a comment…"
          aria-label="Comment"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit();
          }}
          className="resize-none rounded-[2px] border border-wall-200 bg-white px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:border-ink-900"
        />
        {problem && <p className="text-[11px] text-red-700">{problem}</p>}
        <div className="flex items-center justify-between gap-2">
          {draftAt ? (
            <button type="button" onClick={() => place(null)} className="text-[11px] text-amber-700 hover:underline">
              Pinned to the plan · remove pin
            </button>
          ) : (
            <button
              type="button"
              disabled={!is2d}
              onClick={startPlacing}
              title={is2d ? 'Click a spot on the plan this comment is about' : 'Pins are placed on the 2D plan'}
              className="text-[11px] text-ink-700 hover:underline disabled:opacity-40"
            >
              {placing ? 'Click the plan…' : 'Pin to the plan'}
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="h-7 rounded-[2px] bg-ink-900 px-3 text-[11px] font-medium text-wall-50 disabled:opacity-40"
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </aside>
  );
}

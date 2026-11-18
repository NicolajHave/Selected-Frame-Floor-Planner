'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopBar } from '../topbar/TopBar';
import { Canvas } from '@/render/svg/Canvas';
import { RightPanel } from '../panels/RightPanel';
import { AssetLibrary } from '../panels/AssetLibrary';
import { VariantBar } from './VariantBar';
import { PlanContextMenu } from './PlanContextMenu';
import { ToolOverlay } from './ToolOverlay';
import { NoticeToast } from './NoticeToast';
import { useKeyboard } from '@/hooks/useKeyboard';
import { NARROW_SCREEN, useMediaQuery } from '@/hooks/useMediaQuery';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { AUTOSAVE_EVENT, type AutosaveStatus } from '@/lib/autosaveStorage';
import { useLayoutIssues } from '@/store/selectors';
import { CLOUD_ENABLED } from '@/lib/cloud/config';
import { cloud } from '@/lib/cloud/api';
import { useCloudUser } from '@/lib/cloud/useCloudUser';
import { useCloudSync } from '@/lib/cloud/sync';
import { useUnderlayAsset } from '@/lib/cloud/assetSync';
import { CloudBanners } from '../cloud/CloudBanners';
import { RackBuilder } from '../racks/RackBuilder';
import { CommentPins, CommentsButton, CommentsPanel, useCommentsSync } from '../comments/Comments';
import type { CommentTarget } from '@/lib/cloud/comments';

// WebGL only exists in the browser; keep three out of the server bundle.
const ThreeCanvas = dynamic(
  () => import('@/render/three/ThreeCanvas').then((m) => m.ThreeCanvas),
  { ssr: false },
);

export function PlannerShell() {
  useKeyboard();

  const viewMode = usePlannerStore((s) => s.view.viewMode);
  const is3d = viewMode === '3d';
  const issueCount = useLayoutIssues().length;
  const clearSelection = usePlannerStore((s) => s.setSelection);

  const { user, ready: authReady } = useCloudUser();
  const readOnly = usePlannerStore((s) => s.readOnly);
  const rackBuilderOpen = usePlannerStore((s) => !!s.rackBuilder);

  // A ?share=… link shows that plan read-only and leaves this browser's own
  // autosaved plan untouched. Otherwise, restore the autosaved plan.
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const token = CLOUD_ENABLED ? new URLSearchParams(window.location.search).get('share') : null;
    if (!token) {
      void Promise.resolve(usePlannerStore.persist.rehydrate()).finally(() => setRestored(true));
      return;
    }
    setShareToken(token);
    usePlannerStore.persist.setOptions({
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
    cloud
      .getShared(token)
      .then((p) => {
        if (p?.expired) {
          setShareError('This view-only link has expired. Ask the person who sent it for a new one.');
        } else if (p) {
          usePlannerStore.getState().openShared(p);
          // Links from the PDF open straight in 3D.
          if (new URLSearchParams(window.location.search).get('view') === '3d') {
            usePlannerStore.getState().setViewMode('3d');
          }
        } else setShareError('This link has been revoked or does not exist.');
      })
      .catch((e: unknown) => setShareError(e instanceof Error ? e.message : 'Could not open the shared plan.'));
  }, []);

  useCloudSync(user, CLOUD_ENABLED && restored && !shareToken);
  // The plan's drawing is kept outside the plan: fetch it when the plan only refers to it.
  useUnderlayAsset(user, shareToken);

  // Comments: on a cloud plan you're signed in to, or through a view-only link.
  const cloudLink = usePlannerStore((s) => s.cloud);
  const sharedOpen = usePlannerStore((s) => !!s.shared);
  const commentTarget: CommentTarget | null = !CLOUD_ENABLED
    ? null
    : shareToken
      ? sharedOpen
        ? { kind: 'link', token: shareToken }
        : null
      : user && cloudLink
        ? { kind: 'member', projectId: cloudLink.projectId, canResolve: cloudLink.role !== 'viewer' }
        : null;
  useCommentsSync(commentTarget);

  const [autosave, setAutosave] = useState<AutosaveStatus>('saved');
  useEffect(() => {
    const on = (e: Event) => setAutosave((e as CustomEvent<AutosaveStatus>).detail);
    window.addEventListener(AUTOSAVE_EVENT, on);
    return () => window.removeEventListener(AUTOSAVE_EVENT, on);
  }, []);

  // On phones and narrow tablets the side panels are drawers over the plan,
  // opened from the bottom bar, so the plan or 3D view gets the whole screen.
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [drawer, setDrawer] = useState<'library' | 'details' | null>(null);
  useEffect(() => {
    if (!narrow) setDrawer(null);
  }, [narrow]);
  // Picking something to place closes the library so the floor is free to tap.
  const tool = usePlannerStore((s) => s.tool);
  useEffect(() => {
    if (tool !== 'select') setDrawer((d) => (d === 'library' ? null : d));
  }, [tool]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const getViewportSize = useCallback(() => {
    const el = stageRef.current;
    if (!el) return { width: 800, height: 600 };
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-wall-50 text-ink-900">
      <TopBar getViewportSize={getViewportSize} user={user} authReady={authReady} />
      {rackBuilderOpen && !readOnly && <RackBuilder />}

      <div className="relative flex min-h-0 flex-1">
        {narrow && drawer && (
          <button
            aria-label="Close panel"
            className="absolute inset-0 z-30 cursor-default bg-ink-900/30"
            onClick={() => setDrawer(null)}
          />
        )}

        {/* Asset library */}
        <aside
          data-testid="library-panel"
          className={clsx(
            'shrink-0 overflow-hidden border-r border-wall-200 bg-wall-50',
            narrow
              ? clsx('absolute inset-y-0 left-0 z-40 w-[min(280px,86vw)] shadow-panel', drawer !== 'library' && 'hidden')
              : 'w-[240px]',
          )}
        >
          <fieldset disabled={readOnly} className={readOnly ? 'h-full min-w-0 opacity-50' : 'h-full min-w-0'}>
            <AssetLibrary />
          </fieldset>
        </aside>

        {/* Canvas stage */}
        <div ref={stageRef} data-stage className="relative min-w-0 flex-1 bg-wall-100">
          {is3d ? (
            <ThreeCanvas />
          ) : (
            <>
              <Canvas />
              <ToolOverlay />
              <CommentPins />
              <PlanContextMenu />
            </>
          )}
          <VariantBar />
          <CommentsButton />
          <CommentsPanel />
          <NoticeToast />
          <CloudBanners user={user} />
          {shareError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-wall-100/90">
              <div role="alert" className="max-w-sm rounded-[2px] border border-wall-200 bg-wall-50 p-5 text-center shadow-panel">
                <p className="text-[13px] text-ink-900">{shareError}</p>
                <a href="/" className="mt-3 inline-block text-[12px] underline">Open your own planner</a>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <aside
          data-testid="details-panel"
          className={clsx(
            'shrink-0 overflow-y-auto border-l border-wall-200 bg-wall-50',
            narrow
              ? clsx('absolute inset-y-0 right-0 z-40 w-[min(340px,92vw)] shadow-panel', drawer !== 'details' && 'hidden')
              : 'w-[320px]',
          )}
        >
          <fieldset disabled={readOnly} className="min-w-0">
            <RightPanel />
          </fieldset>
        </aside>
      </div>

      {narrow ? (
        <footer className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-wall-200 bg-wall-50 px-3">
          {readOnly ? (
            <span className="truncate text-[10px] uppercase tracking-widest2 text-ink-500">
              {shareToken ? 'Shared plan · view only' : 'View only'}
            </span>
          ) : (
            <button
              onClick={() => setDrawer(drawer === 'library' ? null : 'library')}
              aria-expanded={drawer === 'library'}
              className={clsx(
                'h-8 rounded-[2px] border px-3 text-[12px] font-medium',
                drawer === 'library' ? 'border-ink-900 bg-ink-900 text-wall-50' : 'border-wall-200 bg-wall-100 text-ink-900',
              )}
            >
              Library
            </button>
          )}
          {issueCount > 0 && !readOnly && (
            <span className="truncate text-[10px] uppercase tracking-widest2 text-amber-700">
              {issueCount} layout {issueCount === 1 ? 'issue' : 'issues'}
            </span>
          )}
          <button
            onClick={() => setDrawer(drawer === 'details' ? null : 'details')}
            aria-expanded={drawer === 'details'}
            className={clsx(
              'h-8 rounded-[2px] border px-3 text-[12px] font-medium',
              drawer === 'details' ? 'border-ink-900 bg-ink-900 text-wall-50' : 'border-wall-200 bg-wall-100 text-ink-900',
            )}
          >
            {readOnly ? 'Parts & details' : 'Details'}
          </button>
        </footer>
      ) : (
        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-wall-200 bg-wall-50 px-4 text-[10px] uppercase tracking-widest2 text-ink-500">
          <span>
            Internal · MVP
            {restored &&
              autosave === 'saved' &&
              (cloudLink && user && cloudLink.role !== 'viewer' ? ' · Saved in the cloud' : ' · Autosaved in this browser')}
            {shareToken && ' · Shared plan, view only'}
            {autosave === 'failed' && (
              <span className="text-red-700"> · Autosave failed (plan too large for this browser) — use Save</span>
            )}
            {issueCount > 0 && (
              <button
                onClick={() => clearSelection(null)}
                className="ml-1 uppercase tracking-widest2 text-amber-700 hover:underline"
                title="Show the layout check"
              >
                · {issueCount} layout {issueCount === 1 ? 'issue' : 'issues'}
              </button>
            )}
          </span>
          <span>{is3d ? '3D View · m · drag to move, orbit to look around' : '2D Plan · mm · 1:1 world coordinates'}</span>
        </footer>
      )}
    </div>
  );
}

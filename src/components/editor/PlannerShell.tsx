'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopBar } from '../topbar/TopBar';
import { Canvas } from '@/render/svg/Canvas';
import { RightPanel } from '../panels/RightPanel';
import { AssetLibrary } from '../panels/AssetLibrary';
import { ToolOverlay } from './ToolOverlay';
import { NoticeToast } from './NoticeToast';
import { useKeyboard } from '@/hooks/useKeyboard';
import { usePlannerStore } from '@/store/plannerStore';
import { AUTOSAVE_EVENT, type AutosaveStatus } from '@/lib/autosaveStorage';
import { useLayoutIssues } from '@/store/selectors';
import { CLOUD_ENABLED } from '@/lib/cloud/config';
import { cloud } from '@/lib/cloud/api';
import { useCloudUser } from '@/lib/cloud/useCloudUser';
import { useCloudSync } from '@/lib/cloud/sync';
import { CloudBanners } from '../cloud/CloudBanners';

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
        if (p) {
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

  const [autosave, setAutosave] = useState<AutosaveStatus>('saved');
  useEffect(() => {
    const on = (e: Event) => setAutosave((e as CustomEvent<AutosaveStatus>).detail);
    window.addEventListener(AUTOSAVE_EVENT, on);
    return () => window.removeEventListener(AUTOSAVE_EVENT, on);
  }, []);

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

      <div className="flex min-h-0 flex-1">
        {/* Asset library */}
        <aside className="w-[240px] shrink-0 overflow-hidden border-r border-wall-200 bg-wall-50">
          <fieldset disabled={readOnly} className={readOnly ? 'h-full opacity-50' : 'h-full'}>
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
            </>
          )}
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
        <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-wall-200 bg-wall-50">
          <fieldset disabled={readOnly} className="min-w-0">
            <RightPanel />
          </fieldset>
        </aside>
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-wall-200 bg-wall-50 px-4 text-[10px] uppercase tracking-widest2 text-ink-500">
        <span>
          Internal · MVP
          {restored && autosave === 'saved' && ' · Autosaved in this browser'}
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
    </div>
  );
}

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

// WebGL only exists in the browser; keep three out of the server bundle.
const ThreeCanvas = dynamic(
  () => import('@/render/three/ThreeCanvas').then((m) => m.ThreeCanvas),
  { ssr: false },
);

export function PlannerShell() {
  useKeyboard();

  const viewMode = usePlannerStore((s) => s.view.viewMode);
  const is3d = viewMode === '3d';

  // Restore the autosaved plan once we're on the client.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    void Promise.resolve(usePlannerStore.persist.rehydrate()).finally(() => setRestored(true));
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
      <TopBar getViewportSize={getViewportSize} />

      <div className="flex min-h-0 flex-1">
        {/* Asset library */}
        <aside className="w-[240px] shrink-0 overflow-hidden border-r border-wall-200 bg-wall-50">
          <AssetLibrary />
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
        </div>

        {/* Right panel */}
        <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-wall-200 bg-wall-50">
          <RightPanel />
        </aside>
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-wall-200 bg-wall-50 px-4 text-[10px] uppercase tracking-widest2 text-ink-500">
        <span>Internal · MVP{restored ? ' · Autosaved in this browser' : ''}</span>
        <span>{is3d ? '3D View · m · drag to move, orbit to look around' : '2D Plan · mm · 1:1 world coordinates'}</span>
      </footer>
    </div>
  );
}

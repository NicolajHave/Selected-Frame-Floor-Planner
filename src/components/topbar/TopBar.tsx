'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useFileIO } from '@/hooks/useFileIO';
import { useFitToPlan } from '@/hooks/usePanZoom';
import { clsx } from 'clsx';
import { Button } from '../ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { CloudActions, CloudStatus } from '../cloud/CloudBar';
import { PdfDialog } from './PdfDialog';
import type { CloudUser } from '@/lib/cloud/useCloudUser';

interface Props {
  /** Provided by PlannerShell so Fit-to-view knows the canvas size. */
  getViewportSize: () => { width: number; height: number };
  user: CloudUser | null;
  authReady: boolean;
}

export function TopBar({ getViewportSize, user, authReady }: Props) {
  const readOnly = usePlannerStore((s) => s.readOnly);
  const sharedView = usePlannerStore((s) => !!s.shared);
  const tool = usePlannerStore((s) => s.tool);
  const setTool = usePlannerStore((s) => s.setTool);
  const startRoom = usePlannerStore((s) => s.startRoom);
  const newProject = usePlannerStore((s) => s.newProject);
  const projectName = usePlannerStore((s) => s.project.name);
  const renameProject = usePlannerStore((s) => s.renameProject);
  const view = usePlannerStore((s) => s.view);
  const toggleGrid = usePlannerStore((s) => s.toggleGrid);
  const toggleSnap = usePlannerStore((s) => s.toggleSnap);
  const setViewMode = usePlannerStore((s) => s.setViewMode);
  const undo = usePlannerStore((s) => s.undo);
  const redo = usePlannerStore((s) => s.redo);
  const canUndo = usePlannerStore((s) => s.past.length > 0);
  const canRedo = usePlannerStore((s) => s.future.length > 0);
  const is3d = view.viewMode === '3d';

  const fit = useFitToPlan();

  const [pdfOpen, setPdfOpen] = useState(false);
  const { save, exportData, triggerLoad, inputRef, onFileChange } = useFileIO();

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputEl = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraftName(projectName), [projectName]);
  useEffect(() => {
    if (editingName) inputEl.current?.select();
  }, [editingName]);

  const divider = <div className="h-6 w-px shrink-0 bg-wall-200" />;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-wall-200 bg-wall-50 px-4">
      {/* Brand slot: the wordmark only where there is room */}
      <div className="flex shrink-0 items-center gap-3">
        <div
          aria-hidden
          className="h-6 w-6 rounded-[2px] bg-ink-900"
          style={{
            backgroundImage:
              'linear-gradient(135deg, #16181A 0%, #16181A 50%, #737E62 50%, #737E62 100%)',
          }}
        />
        <div className="hidden flex-col leading-tight 2xl:flex">
          <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Selected Frame</span>
          <span className="font-display text-[14px] italic text-ink-900">Shop Planner</span>
        </div>
      </div>

      {divider}

      {/* Project name and cloud state */}
      <div className="flex min-w-0 flex-col justify-center leading-tight">
        {editingName ? (
          <input
            ref={inputEl}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              renameProject(draftName.trim() || 'Untitled plan');
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraftName(projectName);
                setEditingName(false);
              }
            }}
            className="w-[200px] border-b border-ink-900 bg-transparent text-[13px] text-ink-900 outline-none"
          />
        ) : (
          <button
            onClick={() => !readOnly && setEditingName(true)}
            title={readOnly ? projectName : `${projectName} — click to rename`}
            className={clsx(
              'max-w-[220px] truncate text-left text-[13px] text-ink-900',
              readOnly ? 'cursor-default' : 'hover:underline',
            )}
          >
            {projectName}
          </button>
        )}
        <CloudStatus user={user} ready={authReady} />
      </div>

      {divider}

      {/* File (a shared view can only be exported) */}
      <div className="flex shrink-0 items-center gap-1">
        <Menu label="File">
          {!sharedView && (
            <>
              <MenuItem onClick={newProject}>New plan</MenuItem>
              <MenuItem onClick={save} hint="⌘S">Save file copy…</MenuItem>
              <MenuItem onClick={triggerLoad}>Open file…</MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuItem onClick={exportData}>Export data (JSON)</MenuItem>
        </Menu>
        <Button
          variant="ghost"
          onClick={() => setPdfOpen(true)}
          title="A3 presentation: 3D views, plan to scale, elevations, parts list and live 3D link"
        >
          PDF
        </Button>
        {pdfOpen && <PdfDialog onClose={() => setPdfOpen(false)} signedIn={!!user} />}
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json,.sf"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {!readOnly && (
        <>
          {divider}

          {/* History */}
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
              ↶
            </Button>
            <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
              ↷
            </Button>
          </div>

          {divider}

          {/* Tools — room drawing needs the 2D plan; placement works in both views */}
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" active={tool === 'select'} onClick={() => setTool('select')} title="Select (Esc)">
              Select
            </Button>
            <Button variant="ghost" active={tool === 'draw-room'} disabled={is3d} onClick={startRoom}>
              Draw area
            </Button>
            <Button variant="ghost" active={tool === 'add-pillar'} onClick={() => setTool('add-pillar')}>
              + Pillar
            </Button>
            <Button
              variant="ghost"
              active={tool === 'add-inventory'}
              onClick={() => setTool('add-inventory')}
              title="A generic box; catalog items are in the library"
            >
              + Box
            </Button>
          </div>
        </>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Menu label="View" align="right">
          <MenuItem onClick={toggleGrid} checked={view.showGrid} disabled={is3d}>Grid</MenuItem>
          <MenuItem onClick={toggleSnap} checked={view.snapToGrid}>Snap to grid</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => fit(getViewportSize())} disabled={is3d}>Fit plan to screen</MenuItem>
        </Menu>

        {/* 2D / 3D view toggle */}
        <div className="flex items-center rounded-[2px] border border-wall-200 bg-wall-100 p-0.5">
          <button
            onClick={() => setViewMode('2d')}
            className={
              !is3d
                ? 'whitespace-nowrap rounded-[2px] bg-ink-900 px-2 py-1 text-[11px] font-medium text-wall-50'
                : 'whitespace-nowrap rounded-[2px] px-2 py-1 text-[11px] text-ink-500 hover:text-ink-900'
            }
          >
            2D Plan
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={
              is3d
                ? 'whitespace-nowrap rounded-[2px] bg-ink-900 px-2 py-1 text-[11px] font-medium text-wall-50'
                : 'whitespace-nowrap rounded-[2px] px-2 py-1 text-[11px] text-ink-500 hover:text-ink-900'
            }
          >
            3D View
          </button>
        </div>

        <CloudActions user={user} ready={authReady} />
      </div>
    </header>
  );
}

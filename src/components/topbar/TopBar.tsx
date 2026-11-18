'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useFileIO } from '@/hooks/useFileIO';
import { useFitToPlan } from '@/hooks/usePanZoom';
import { clsx } from 'clsx';
import { Button } from '../ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { CloudActions, CloudStatus } from '../cloud/CloudBar';
import { PdfDialog } from './PdfDialog';
import { PriceListDialog } from '../cloud/PriceListDialog';
import { ErrorLogDialog } from '../cloud/ErrorLogDialog';
import { LockIcon } from '../ui/LockIcon';
import type { CloudUser } from '@/lib/cloud/useCloudUser';

/**
 * How far the bar has folded to fit the window. Nothing is ever cut off:
 * 1 tightens the spacing, 2 shortens the lock and the 2D/3D switch,
 * 3 folds "+ Pillar / + Wall / + Box / + Note" and the cloud buttons into menus,
 * 4 folds every tool into one menu and drops the plan name (it is in the
 * right panel too), 5 lets the bar wrap onto a second row.
 */
const MAX_FOLD = 5;

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
  const layoutLocked = usePlannerStore((s) => !!s.project.layoutLocked);
  const setLayoutLocked = usePlannerStore((s) => s.setLayoutLocked);
  const lockedTitle = 'The floor plan is locked — unlock it to change walls, doors, windows and pillars';
  const hasCloudPlan = usePlannerStore((s) => !!s.cloud);

  const fit = useFitToPlan();

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const { save, exportData, triggerLoad, inputRef, onFileChange } = useFileIO();

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputEl = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraftName(projectName), [projectName]);
  useEffect(() => {
    if (editingName) inputEl.current?.select();
  }, [editingName]);

  // Fold the bar step by step until it fits; start over when the space or
  // what is in the bar changes. Layout effects run before paint, so the
  // steps are never seen.
  const header = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [fold, setFold] = useState(0);
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const signedIn = !!user;
  useLayoutEffect(() => {
    setFold(0);
  }, [width, readOnly, sharedView, signedIn, authReady, hasCloudPlan, projectName, editingName, layoutLocked]);
  useLayoutEffect(() => {
    const el = header.current;
    if (el && fold < MAX_FOLD && el.scrollWidth > el.clientWidth + 1) setFold(fold + 1);
  });
  const tight = fold >= 1 ? '!px-2' : undefined;

  const divider = <div className="h-6 w-px shrink-0 bg-wall-200" />;

  const tools = [
    { id: 'select', label: 'Select', title: 'Select (Esc)', active: tool === 'select', run: () => setTool('select') },
    {
      id: 'draw-room',
      label: 'Draw area',
      title: layoutLocked ? lockedTitle : undefined,
      active: tool === 'draw-room',
      disabled: is3d || layoutLocked,
      run: startRoom,
    },
    {
      id: 'draw-rect',
      label: 'Rectangle',
      title: layoutLocked ? lockedTitle : 'Drag a rectangle to make a room; then adjust it like any other',
      active: tool === 'draw-rect',
      disabled: is3d || layoutLocked,
      run: () => setTool('draw-rect'),
    },
    {
      id: 'add-pillar',
      label: '+ Pillar',
      title: layoutLocked ? lockedTitle : undefined,
      active: tool === 'add-pillar',
      disabled: layoutLocked,
      run: () => setTool('add-pillar'),
      add: true,
    },
    {
      id: 'add-partition',
      label: '+ Wall',
      title: layoutLocked
        ? lockedTitle
        : 'Interior wall: click where it starts and where it ends (Shift keeps it straight)',
      active: tool === 'add-partition',
      disabled: is3d || layoutLocked,
      run: () => setTool(tool === 'add-partition' ? 'select' : 'add-partition'),
      add: true,
    },
    {
      id: 'add-inventory',
      label: '+ Box',
      title: 'A generic box; catalog items are in the library',
      active: tool === 'add-inventory',
      run: () => setTool('add-inventory'),
      add: true,
    },
    {
      id: 'measure',
      label: 'Measure',
      title: 'Measuring tape: click two points (corners snap; Shift keeps it straight)',
      active: tool === 'measure',
      disabled: is3d,
      run: () => setTool(tool === 'measure' ? 'select' : 'measure'),
    },
    {
      id: 'add-note',
      label: '+ Note',
      title: 'Place Note',
      active: tool === 'add-note',
      run: () => setTool(tool === 'add-note' ? 'select' : 'add-note'),
      add: true,
    },
  ];
  type Tool = (typeof tools)[number];
  const toolButton = (t: Tool) => (
    <Button key={t.id} variant="ghost" className={tight} active={t.active} disabled={t.disabled} title={t.title} onClick={t.run}>
      {t.label}
    </Button>
  );
  const toolItem = (t: Tool) => (
    <MenuItem key={t.id} onClick={t.run} checked={t.active} disabled={t.disabled}>
      {t.id === 'add-partition' ? 'Interior wall' : t.label.replace(/^\+ /, '')}
    </MenuItem>
  );

  return (
    <header
      ref={header}
      data-fold={fold}
      className={clsx(
        'flex shrink-0 items-center border-b border-wall-200 bg-wall-50',
        fold >= 1 ? 'gap-1.5 px-3' : 'gap-3 px-4',
        fold >= MAX_FOLD ? 'min-h-14 flex-wrap gap-y-1 py-2' : 'h-14',
      )}
    >
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

      {fold < 4 && divider}

      {/* Project name and cloud state */}
      <div className={clsx('min-w-[88px] flex-col justify-center overflow-hidden leading-tight', fold >= 4 ? 'hidden' : 'flex')}>
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
        <Menu label="File" buttonClassName={tight}>
          {!sharedView && (
            <>
              <MenuItem onClick={newProject}>New plan</MenuItem>
              <MenuItem onClick={save} hint="⌘S">Save file copy…</MenuItem>
              <MenuItem onClick={triggerLoad}>Open file…</MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuItem onClick={exportData}>Export data (JSON)</MenuItem>
          {user && !sharedView && (
            <>
              <MenuSeparator />
              <MenuItem onClick={() => setPricesOpen(true)}>Price list…</MenuItem>
              <MenuItem onClick={() => setErrorsOpen(true)}>Error log…</MenuItem>
            </>
          )}
        </Menu>
        <Button
          variant="ghost"
          className={tight}
          onClick={() => setPdfOpen(true)}
          title="A3 presentation: 3D views, plan to scale, elevations, parts list and live 3D link"
        >
          PDF
        </Button>
        {pdfOpen && <PdfDialog onClose={() => setPdfOpen(false)} signedIn={!!user} />}
        {pricesOpen && <PriceListDialog onClose={() => setPricesOpen(false)} />}
        {errorsOpen && <ErrorLogDialog onClose={() => setErrorsOpen(false)} />}
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
            <Button variant="ghost" className={tight} onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">
              ↶
            </Button>
            <Button variant="ghost" className={tight} onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
              ↷
            </Button>
          </div>

          {divider}

          {/* Tools — room drawing needs the 2D plan; placement works in both views */}
          <div className="flex shrink-0 items-center gap-1">
            {fold >= 4 ? (
              <Menu label="Tools" buttonClassName={tight}>
                {tools.map(toolItem)}
              </Menu>
            ) : (
              <>
                {tools.filter((t) => fold < 3 || !t.add).map(toolButton)}
                {fold >= 3 && (
                  <Menu label="Add" buttonClassName={tight}>
                    {tools.filter((t) => t.add).map(toolItem)}
                  </Menu>
                )}
              </>
            )}
          </div>

          {divider}

          {/* Floor plan lock: walls, doors, windows and pillars stay put; fixtures still move */}
          <Button
            variant="subtle"
            className={tight}
            active={layoutLocked}
            aria-pressed={layoutLocked}
            aria-label={layoutLocked ? 'Floor plan locked' : 'Lock floor plan'}
            onClick={() => setLayoutLocked(!layoutLocked)}
            title={
              layoutLocked
                ? 'Unlock the floor plan to change walls, doors, windows and pillars'
                : 'Lock the floor plan: walls, doors, windows and pillars can’t be moved by accident. Fixtures still move.'
            }
          >
            <LockIcon locked={layoutLocked} />
            {fold < 2 && (layoutLocked ? 'Floor plan locked' : 'Lock floor plan')}
          </Button>
        </>
      )}

      <div className={clsx('ml-auto flex shrink-0 items-center', fold >= 1 ? 'gap-1' : 'gap-2')}>
        <Menu label="View" align="right" buttonClassName={tight}>
          <MenuItem onClick={toggleGrid} checked={view.showGrid} disabled={is3d}>Grid</MenuItem>
          <MenuItem onClick={toggleSnap} checked={view.snapToGrid}>Snap to grid</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => fit(getViewportSize())} disabled={is3d}>Fit plan to screen</MenuItem>
        </Menu>

        {/* 2D / 3D view toggle */}
        <div className="flex items-center rounded-[2px] border border-wall-200 bg-wall-100 p-0.5">
          <button
            onClick={() => setViewMode('2d')}
            aria-label="2D Plan"
            aria-pressed={!is3d}
            className={
              !is3d
                ? 'whitespace-nowrap rounded-[2px] bg-ink-900 px-2 py-1 text-[11px] font-medium text-wall-50'
                : 'whitespace-nowrap rounded-[2px] px-2 py-1 text-[11px] text-ink-500 hover:text-ink-900'
            }
          >
            {fold >= 2 ? '2D' : '2D Plan'}
          </button>
          <button
            onClick={() => setViewMode('3d')}
            aria-label="3D View"
            aria-pressed={is3d}
            className={
              is3d
                ? 'whitespace-nowrap rounded-[2px] bg-ink-900 px-2 py-1 text-[11px] font-medium text-wall-50'
                : 'whitespace-nowrap rounded-[2px] px-2 py-1 text-[11px] text-ink-500 hover:text-ink-900'
            }
          >
            {fold >= 2 ? '3D' : '3D View'}
          </button>
        </div>

        <CloudActions user={user} ready={authReady} compact={fold >= 3} />
      </div>
    </header>
  );
}

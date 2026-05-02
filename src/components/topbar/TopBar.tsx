'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useFileIO } from '@/hooks/useFileIO';
import { useFitToPlan } from '@/hooks/usePanZoom';
import { Button } from '../ui/Button';

interface Props {
  /** Provided by PlannerShell so Fit-to-view knows the canvas size. */
  getViewportSize: () => { width: number; height: number };
}

export function TopBar({ getViewportSize }: Props) {
  const tool = usePlannerStore((s) => s.tool);
  const setTool = usePlannerStore((s) => s.setTool);
  const startRoom = usePlannerStore((s) => s.startRoom);
  const newProject = usePlannerStore((s) => s.newProject);
  const projectName = usePlannerStore((s) => s.project.name);
  const renameProject = usePlannerStore((s) => s.renameProject);
  const view = usePlannerStore((s) => s.view);
  const toggleGrid = usePlannerStore((s) => s.toggleGrid);
  const toggleSnap = usePlannerStore((s) => s.toggleSnap);

  const fit = useFitToPlan();
  const { save, exportData, triggerLoad, inputRef, onFileChange } = useFileIO();

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const inputEl = useRef<HTMLInputElement | null>(null);

  useEffect(() => setDraftName(projectName), [projectName]);
  useEffect(() => {
    if (editingName) inputEl.current?.select();
  }, [editingName]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-wall-200 bg-wall-50 px-5">
      {/* Brand slot */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="h-6 w-6 rounded-[2px] bg-ink-900"
          style={{
            backgroundImage:
              'linear-gradient(135deg, #16181A 0%, #16181A 50%, #737E62 50%, #737E62 100%)',
          }}
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Selected Frame</span>
          <span className="font-display text-[14px] italic text-ink-900">Shop Planner</span>
        </div>
      </div>

      <div className="h-6 w-px bg-wall-200" />

      {/* Project name */}
      <div className="flex min-w-0 items-baseline gap-2">
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
            className="min-w-[120px] max-w-[260px] border-b border-ink-900 bg-transparent text-[13px] text-ink-900 outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            title="Rename project"
            className="truncate text-[13px] text-ink-900 hover:underline"
          >
            {projectName}
          </button>
        )}
      </div>

      <div className="h-6 w-px bg-wall-200" />

      {/* File actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={newProject}>New</Button>
        <Button variant="ghost" onClick={save} title="Save (⌘S)">Save</Button>
        <Button variant="ghost" onClick={triggerLoad}>Load</Button>
        <Button variant="ghost" onClick={exportData}>Export</Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json,.sf"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      <div className="h-6 w-px bg-wall-200" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          active={tool === 'select'}
          onClick={() => setTool('select')}
        >
          Select
        </Button>
        <Button
          variant="ghost"
          active={tool === 'draw-room'}
          onClick={startRoom}
        >
          Draw area
        </Button>
        <Button
          variant="ghost"
          active={tool === 'add-pillar'}
          onClick={() => setTool('add-pillar')}
        >
          + Pillar
        </Button>
        <Button
          variant="ghost"
          active={tool === 'add-inventory'}
          onClick={() => setTool('add-inventory')}
        >
          + Inventory
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          active={view.showGrid}
          onClick={toggleGrid}
          title="Toggle grid"
        >
          Grid
        </Button>
        <Button
          variant="ghost"
          active={view.snapToGrid}
          onClick={toggleSnap}
          title="Toggle snap"
        >
          Snap
        </Button>
        <Button variant="ghost" onClick={() => fit(getViewportSize())}>
          Fit to plan
        </Button>

        <div className="ml-2 h-6 w-px bg-wall-200" />

        {/* Future view toggle. The 3D entry point is intentionally disabled. */}
        <div className="ml-2 flex items-center rounded-[2px] border border-wall-200 bg-wall-100 p-0.5">
          <button className="cursor-default rounded-[2px] bg-ink-900 px-2 py-1 text-[11px] font-medium text-wall-50">
            2D Plan
          </button>
          <button
            disabled
            title="3D view ships in a future release"
            className="cursor-not-allowed rounded-[2px] px-2 py-1 text-[11px] text-ink-500"
          >
            3D View
          </button>
        </div>
      </div>
    </header>
  );
}

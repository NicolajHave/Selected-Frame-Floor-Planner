'use client';

import { useEffect } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { downloadJson } from '@/lib/io';
import type { Point } from '@/model/geometry';
import { planPointer } from '@/render/svg/pointer';
import { screenToWorld } from '@/render/svg/viewport';

const QUARTER_TURN = Math.PI / 2;

/** Where a paste lands: under the pointer on the plan, else the middle of the view. */
function pasteTarget(): Point {
  const s = usePlannerStore.getState();
  if (s.view.viewMode === '2d' && planPointer.world) return planPointer.world;
  const stage = document.querySelector('[data-stage]')?.getBoundingClientRect();
  const w = stage?.width ?? 800;
  const h = stage?.height ?? 600;
  return screenToWorld(s.view, { x: w / 2, y: h / 2 });
}

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;

      // Read fresh state per keypress instead of re-binding on every change.
      const s = usePlannerStore.getState();
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === 'Escape') {
        const room = s.project.room;
        if (s.tool === 'draw-room' && room && !room.closed && room.corners.length >= 3) {
          // Treat Escape during drawing as "finish here".
          s.closeRoom();
        } else {
          s.setTool('select');
          s.setSelection(null);
        }
        return;
      }

      if (meta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }

      if (meta && key === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        s.deleteSelected();
        return;
      }

      if (key === 'r' && !meta && !e.altKey) {
        s.rotateSelected(e.shiftKey ? -QUARTER_TURN : QUARTER_TURN);
        return;
      }

      if (key === 'l' && !meta && !e.altKey) {
        s.toggleLockSelected();
        return;
      }

      // Copy and paste fixtures between plans and layouts. Without a selection,
      // Ctrl+C is left to the browser (copying text on the page).
      if (meta && key === 'c' && !e.shiftKey && s.selection) {
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        s.copySelected();
        return;
      }
      if (meta && key === 'v' && !e.shiftKey && !s.readOnly) {
        e.preventDefault();
        s.pasteClip(pasteTarget());
        return;
      }

      if (meta && key === 'd') {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }

      if (meta && key === 'a') {
        e.preventDefault();
        s.selectMany([
          ...s.project.inventory.map((x) => ({ kind: 'inventory' as const, id: x.id })),
          ...s.project.pillars.map((x) => ({ kind: 'pillar' as const, id: x.id })),
          ...(s.project.annotations ?? []).map((x) => ({ kind: 'note' as const, id: x.id })),
        ]);
        return;
      }

      if (meta && key === 's') {
        e.preventDefault();
        downloadJson(`${s.project.name || 'plan'}.sf`, s.project);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

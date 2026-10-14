'use client';

import { useEffect } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { downloadJson } from '@/lib/io';

const QUARTER_TURN = Math.PI / 2;

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

      if (meta && key === 'd') {
        e.preventDefault();
        s.duplicateSelected();
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

'use client';

import { useEffect } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { downloadJson } from '@/lib/io';

export function useKeyboard() {
  const setSelection = usePlannerStore((s) => s.setSelection);
  const setTool = usePlannerStore((s) => s.setTool);
  const closeRoom = usePlannerStore((s) => s.closeRoom);
  const tool = usePlannerStore((s) => s.tool);
  const room = usePlannerStore((s) => s.project.room);
  const project = usePlannerStore((s) => s.project);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const duplicateSelected = usePlannerStore((s) => s.duplicateSelected);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;

      const meta = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        if (tool === 'draw-room' && room && !room.closed && room.corners.length >= 3) {
          // Treat Escape during drawing as "finish here".
          closeRoom();
        } else {
          setTool('select');
          setSelection(null);
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        deleteSelected();
        return;
      }

      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadJson(`${project.name || 'plan'}.sf`, project);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    setSelection, setTool, closeRoom, tool, room, project,
    deleteSelected, duplicateSelected,
  ]);
}

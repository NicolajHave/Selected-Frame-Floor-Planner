'use client';

import { useCallback, useRef } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { downloadJson, readJsonFile } from '@/lib/io';
import { wallLengths } from '@/geometry/walls';
import { cornerAngles } from '@/geometry/corners';
import { polygonArea } from '@/geometry/polygon';
import type { ExportPayload, Project } from '@/model/project';

/**
 * Save = native project JSON for round-tripping (the Project shape).
 * Export = ExportPayload with derived metrics baked in for downstream
 * consumers (3D viewer, quote engine, archival).
 */
export function useFileIO() {
  const project = usePlannerStore((s) => s.project);
  const loadProject = usePlannerStore((s) => s.loadProject);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filenameBase = (project.name || 'plan').trim().replace(/\s+/g, '-').toLowerCase();

  const save = useCallback(() => {
    downloadJson(`${filenameBase}.sf`, project);
  }, [project, filenameBase]);

  const exportData = useCallback(() => {
    const payload: ExportPayload = {
      project,
      derived: project.room
        ? {
            wallLengths: wallLengths(project.room.corners, project.room.closed),
            cornerAngles: cornerAngles(project.room.corners, project.room.closed),
            area: project.room.closed
              ? polygonArea(project.room.corners.map((c) => c.point))
              : 0,
          }
        : null,
      exportedAt: new Date().toISOString(),
    };
    downloadJson(`${filenameBase}.export`, payload);
  }, [project, filenameBase]);

  const triggerLoad = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const raw = await readJsonFile<Project>(file);
        loadProject(raw);
      } catch (err) {
        // Surface to the user; this is internal so a window.alert is fine.
        // eslint-disable-next-line no-alert
        alert(`Failed to load project: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        // Allow re-selecting the same file later
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [loadProject],
  );

  return { save, exportData, triggerLoad, inputRef, onFileChange };
}

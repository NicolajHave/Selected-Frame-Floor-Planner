'use client';

import { Suspense, useEffect } from 'react';
import type { Project } from '@/model/project';
import { Lights } from './Lights';
import { Floor } from './Floor';
import { Walls } from './Walls';
import { Pillars } from './Pillars';
import { InventoryMeshes } from './InventoryMeshes';

/** The shop itself: room, pillars and fixtures. Shared by the editor and the PDF renders. */
export function SceneContents({ project, onReady }: { project: Project; onReady?: () => void }) {
  const room = project.room;
  return (
    <>
      <Lights />
      {room && room.closed && (
        <>
          <Floor room={room} />
          <Walls room={room} />
        </>
      )}
      <Pillars pillars={project.pillars} />
      <Suspense fallback={null}>
        <InventoryMeshes items={project.inventory} />
        {onReady && <Ready onReady={onReady} />}
      </Suspense>
    </>
  );
}

/**
 * Sits in the models' Suspense boundary. r3f renders in React's concurrent
 * mode, where nothing in a boundary commits until every model has loaded,
 * so this effect fires exactly when the scene is complete.
 */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

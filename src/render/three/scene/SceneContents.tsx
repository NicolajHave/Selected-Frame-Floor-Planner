'use client';

import { Suspense, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Project } from '@/model/project';
import { useStage, type Stage } from './stage';
import { Lights } from './Lights';
import { Floor } from './Floor';
import { Walls } from './Walls';
import { Pillars } from './Pillars';
import { InventoryMeshes } from './InventoryMeshes';
import { ElectricalMeshes } from './ElectricalMeshes';

/** The shop itself: room, pillars, fixtures and electrical points. Shared by the editor and the PDF renders. */
export function SceneContents({ project, onReady }: { project: Project; onReady?: () => void }) {
  const room = project.room;
  const stage = useStage();
  return (
    <>
      {stage && <Staging stage={stage} />}
      <Lights />
      {room && room.closed && (
        <>
          <Floor room={room} />
          <Walls room={room} />
        </>
      )}
      <Pillars pillars={project.pillars} />
      {project.electrical && project.electrical.length > 0 && (
        <ElectricalMeshes room={room} points={project.electrical} />
      )}
      <Suspense fallback={null}>
        <InventoryMeshes items={project.inventory} />
        {onReady && <Ready onReady={onReady} />}
      </Suspense>
    </>
  );
}

/** Shows and hides fixtures and pillars as the still being taken is staged. */
function Staging({ stage }: { stage: Stage }) {
  useFrame(({ scene }) => {
    scene.traverse((o) => {
      const id: unknown = o.userData.stageId;
      if (typeof id === 'string') o.visible = !stage.hidden.has(id);
    });
  });
  return null;
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

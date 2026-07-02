'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { usePlannerStore } from '@/store/plannerStore';
import { boundingBox } from '@/geometry/polygon';
import { OrbitView } from './controls/OrbitView';
import { Lights } from './scene/Lights';
import { Floor } from './scene/Floor';
import { Walls } from './scene/Walls';
import { Pillars } from './scene/Pillars';
import { InventoryMeshes } from './scene/InventoryMeshes';

export const MM = 0.001; // world mm -> scene metres

/**
 * Read-only 3D view over the same Project slice the SVG canvas renders.
 * Coordinate mapping: world (x, y) mm -> scene (x, z) metres, height up Y.
 */
export function ThreeCanvas() {
  const room = usePlannerStore((s) => s.project.room);
  const pillars = usePlannerStore((s) => s.project.pillars);
  const inventory = usePlannerStore((s) => s.project.inventory);

  // Camera start + orbit target derived from the room (or a sane default).
  const { target, position } = useMemo(() => {
    const bb = room?.closed ? boundingBox(room.corners.map((c) => c.point)) : null;
    if (!bb) {
      return { target: [0, 0.8, 0] as const, position: [6, 5.5, 7] as const };
    }
    const cx = ((bb.min.x + bb.max.x) / 2) * MM;
    const cz = ((bb.min.y + bb.max.y) / 2) * MM;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) * MM;
    const dist = Math.max(6, span * 1.1);
    return {
      target: [cx, 0.8, cz] as const,
      position: [cx + dist * 0.72, dist * 0.75, cz + dist * 0.72] as const,
    };
  }, [room]);

  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ fov: 42, near: 0.05, far: 500, position: [...position] }}
        shadows
        dpr={[1, 2]}
        style={{ background: 'var(--wall-100, #ECEAE4)' }}
      >
        <Lights />
        <OrbitView target={[...target]} />

        {/* Context ground grid, 1 m cells */}
        <gridHelper args={[60, 60, '#C9C5BB', '#DDD9D0']} position={[0, -0.002, 0]} />

        {room && room.closed && (
          <>
            <Floor room={room} />
            <Walls room={room} />
          </>
        )}
        <Pillars pillars={pillars} />
        <Suspense fallback={null}>
          <InventoryMeshes items={inventory} />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
        <div className="rounded-[2px] border border-wall-200 bg-wall-50/95 px-3 py-1.5 text-[11px] text-ink-700 shadow-panel backdrop-blur-sm">
          3D view is read-only — switch to 2D Plan to edit. Drag to orbit, scroll to zoom.
        </div>
      </div>
    </div>
  );
}

'use client';

import { Suspense, useMemo } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { usePlannerStore } from '@/store/plannerStore';
import { boundingBox } from '@/geometry/polygon';
import { findAsset } from '@/lib/assetCatalog';
import { OrbitView } from './controls/OrbitView';
import { Lights } from './scene/Lights';
import { Floor } from './scene/Floor';
import { Walls } from './scene/Walls';
import { Pillars } from './scene/Pillars';
import { InventoryMeshes } from './scene/InventoryMeshes';
import { floorPoint } from './scene/useFloorDrag';

export const MM = 0.001; // world mm -> scene metres

/** Pointer travel (px) above which a press counts as an orbit drag, not a click. */
const CLICK_SLOP = 5;

type Vec3 = [number, number, number];

/**
 * 3D view over the same Project slice the SVG canvas renders. Objects can be
 * selected, dragged and placed here; room drawing stays in 2D.
 * Coordinate mapping: world (x, y) mm -> scene (x, z) metres, height up Y.
 */
export function ThreeCanvas() {
  const room = usePlannerStore((s) => s.project.room);
  const pillars = usePlannerStore((s) => s.project.pillars);
  const inventory = usePlannerStore((s) => s.project.inventory);
  const tool = usePlannerStore((s) => s.tool);
  const pendingAssetRef = usePlannerStore((s) => s.pendingAssetRef);

  // Camera start + orbit target from the room's footprint. Keyed on the
  // numbers, not the room object, so edits don't yank the camera around.
  const bb = room?.closed ? boundingBox(room.corners.map((c) => c.point)) : null;
  const key = bb ? `${bb.min.x},${bb.min.y},${bb.max.x},${bb.max.y}` : 'none';
  const { target, position } = useMemo<{ target: Vec3; position: Vec3 }>(() => {
    if (!bb) return { target: [0, 0.8, 0], position: [6, 5.5, 7] };
    const cx = ((bb.min.x + bb.max.x) / 2) * MM;
    const cz = ((bb.min.y + bb.max.y) / 2) * MM;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) * MM;
    const dist = Math.max(6, span * 1.1);
    return {
      target: [cx, 0.8, cz],
      position: [cx + dist * 0.72, dist * 0.75, cz + dist * 0.72],
    };
  }, [key]);

  const onFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP) return; // end of an orbit drag
    const s = usePlannerStore.getState();
    const p = floorPoint(e.ray);
    if (!p) return;
    if (s.tool === 'add-pillar') s.addPillarAt(p);
    else if (s.tool === 'add-inventory') s.addInventoryAt(p, { wallSnap: !e.nativeEvent.altKey });
    else s.setSelection(null);
  };

  const armed = tool === 'add-pillar' || tool === 'add-inventory';
  const pendingName = findAsset(pendingAssetRef ?? undefined)?.name;
  const hint =
    tool === 'add-pillar'
      ? 'Click the floor to place a pillar.'
      : tool === 'add-inventory'
        ? `Click the floor to place ${pendingName ?? 'an inventory placeholder'}.`
        : 'Drag items to move them · R rotates 90° · Delete removes · drag empty space to orbit, scroll to zoom.';

  return (
    <div className={`absolute inset-0 ${armed ? 'cursor-copy' : ''}`}>
      <Canvas
        camera={{ fov: 42, near: 0.05, far: 500, position }}
        shadows
        dpr={[1, 2]}
        style={{ background: 'var(--wall-100, #ECEAE4)' }}
      >
        <Lights />
        <OrbitView target={target} />

        {/* Context ground grid, 1 m cells */}
        <gridHelper args={[60, 60, '#C9C5BB', '#DDD9D0']} position={[0, -0.002, 0]} />

        {/* Invisible floor catching placement clicks and click-to-deselect */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onFloorClick}>
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>

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
          {hint}
        </div>
      </div>
    </div>
  );
}

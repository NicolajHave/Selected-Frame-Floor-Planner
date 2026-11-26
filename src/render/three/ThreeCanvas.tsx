'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { usePlannerStore } from '@/store/plannerStore';
import { boundingBox } from '@/geometry/polygon';
import { findAsset } from '@/lib/assetCatalog';
import { openingType } from '@/lib/openingTypes';
import { electricalType } from '@/lib/electricalTypes';
import { wallUnderRay } from '@/geometry/wallRay';
import { OrbitView } from './controls/OrbitView';
import { SceneContents } from './scene/SceneContents';
import { floorPoint } from './scene/useFloorDrag';
import { SceneModeContext } from './scene/mode';
import { WalkView } from './controls/WalkView';
import { WalkMap } from './WalkMap';
import { floorObstacles } from '@/lib/layout';
import { walkStart, type WalkPose } from '@/lib/walk';
import { activeVariantName } from '@/lib/variants';

export { MM } from './units';
import { MM } from './units';

/** Pointer travel (px) above which a press counts as an orbit drag, not a click. */
const CLICK_SLOP = 5;

type Vec3 = [number, number, number];

/**
 * 3D view over the same Project slice the SVG canvas renders. Objects can be
 * selected, dragged and placed here; room drawing stays in 2D.
 * Coordinate mapping: world (x, y) mm -> scene (x, z) metres, height up Y.
 */
export function ThreeCanvas() {
  const project = usePlannerStore((s) => s.project);
  const readOnly = usePlannerStore((s) => s.readOnly);
  const room = project.room;
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

  // Walk-through at eye level.
  const [walking, setWalking] = useState(false);
  const [start, setStart] = useState<WalkPose | null>(null);
  const [pose, setPose] = useState<WalkPose | null>(null);
  const obstacles = useMemo(() => floorObstacles(project).map((o) => o.outline), [project]);
  const canWalk = !!room?.closed && room.corners.length >= 3;
  const enterWalk = () => {
    if (!room || !canWalk) return;
    const s = usePlannerStore.getState();
    s.setSelection(null);
    if (s.tool !== 'select') s.setTool('select');
    const p = walkStart(room, obstacles);
    setStart(p);
    setPose(p);
    setWalking(true);
  };
  const exitWalk = useCallback(() => setWalking(false), []);
  const isWalking = walking && canWalk;

  // Snapshot: renders the view as it is now and saves it as a PNG.
  const capture = useRef<(() => string) | null>(null);
  const snapshot = () => {
    const url = capture.current?.();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    const variant = activeVariantName(project);
    a.download = `${`${project.name || 'Shop'}${variant ? ` ${variant}` : ''}`.replace(/[\\/:*?"<>|]+/g, '-')} - 3D${isWalking ? ' walk-through' : ''}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /** A click that hit nothing of the shop's: on the floor, a wall or the empty space around. */
  const onBackdropClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP) return; // end of an orbit drag
    const s = usePlannerStore.getState();
    const p = floorPoint(e.ray);
    if (s.tool === 'add-electrical' && s.pendingElectrical && electricalType(s.pendingElectrical).mount === 'wall') {
      // A point on a wall is placed by clicking the wall where it shows; the
      // plan's x, y is scene x, z. Failing that, the floor next to a wall.
      const o = e.ray.origin;
      const d = e.ray.direction;
      const hit = room ? wallUnderRay(room, [o.x / MM, o.z / MM, o.y / MM], [d.x, d.z, d.y]) : null;
      const at = hit?.point ?? p;
      if (at) s.addElectricalAt(at);
      return;
    }
    if (!p) return;
    if (s.tool === 'add-pillar') s.addPillarAt(p);
    else if (s.tool === 'add-inventory') s.addInventoryAt(p, { wallSnap: !e.nativeEvent.altKey });
    else if (s.tool === 'add-opening') s.addOpeningAt(p);
    else if (s.tool === 'add-electrical') s.addElectricalAt(p);
    else s.setSelection(null);
  };

  const pendingOpening = usePlannerStore((s) => s.pendingOpening);
  const pendingElectrical = usePlannerStore((s) => s.pendingElectrical);
  const armed = tool === 'add-pillar' || tool === 'add-inventory' || tool === 'add-opening' || tool === 'add-electrical';
  const pendingRack = usePlannerStore((s) => s.pendingRack);
  const pendingName = pendingRack?.name ?? findAsset(pendingAssetRef ?? undefined)?.name;
  const hint = isWalking
    ? 'Drag to look around · W A S D or the arrow keys to walk (Shift: faster) · click the map to jump · Esc leaves'
    : tool === 'add-pillar'
      ? 'Click the floor to place a pillar.'
      : tool === 'add-opening' && pendingOpening
        ? `Click next to a wall to place the ${openingType(pendingOpening).name.toLowerCase()}.`
      : tool === 'add-electrical' && pendingElectrical
        ? electricalType(pendingElectrical).mount === 'floor'
          ? 'Click the floor to place the floor box.'
          : `Click a wall to place the ${electricalType(pendingElectrical).name.toLowerCase()} — it goes ${electricalType(pendingElectrical).height} mm above the floor.`
      : tool === 'add-inventory'
        ? `Click the floor to place ${pendingName ?? 'an inventory placeholder'}.`
        : readOnly
          ? 'Drag to look around · scroll to zoom · click a fixture to see what it is.'
          : 'Drag items to move them · R rotates 90° · Delete removes · drag empty space to orbit, scroll to zoom.';

  return (
    <div className={`absolute inset-0 ${armed ? 'cursor-copy' : ''}`}>
      <Canvas
        camera={{ fov: 42, near: 0.05, far: 500, position }}
        shadows
        dpr={[1, 2]}
        style={{ background: 'var(--wall-100, #ECEAE4)' }}
      >
        {isWalking && room && start ? (
          <WalkView room={room} obstacles={obstacles} start={start} onPose={setPose} onExit={exitWalk} />
        ) : (
          <OrbitView target={target} />
        )}
        <Capture into={capture} />

        {/* Context ground grid, 1 m cells: under the floor slab (20 mm), not just under its top, or its lines flicker through a floor of another colour. */}
        <gridHelper args={[60, 60, '#C9C5BB', '#DDD9D0']} position={[0, -0.03, 0]} />

        {/* An invisible shell round everything: it catches the clicks that hit
            nothing of the shop's — for placing things and for deselecting —
            whichever way the click looks, also up along a wall. */}
        {!isWalking && (
          <mesh position={target} onClick={onBackdropClick}>
            <sphereGeometry args={[420, 24, 12]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.BackSide} />
          </mesh>
        )}

        {/* Walking is for looking: no selecting or dragging fixtures on the way. */}
        <SceneModeContext.Provider value={isWalking ? 'render' : 'interactive'}>
          <SceneContents project={project} />
        </SceneModeContext.Provider>
      </Canvas>

      <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 max-[900px]:bottom-16 max-[900px]:top-auto max-[900px]:w-[calc(100%-24px)] max-[900px]:text-center">
        <div className="rounded-[2px] border border-wall-200 bg-wall-50/95 px-3 py-1.5 text-[11px] text-ink-700 shadow-panel backdrop-blur-sm">
          {hint}
        </div>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
        {isWalking ? (
          <>
            <ViewButton onClick={() => room && setStart(walkStart(room, obstacles))} title="Back to where you came in">
              Entrance
            </ViewButton>
            <ViewButton onClick={exitWalk} title="Back to the overview (Esc)">
              Overview
            </ViewButton>
          </>
        ) : (
          <ViewButton
            onClick={enterWalk}
            disabled={!canWalk}
            title={canWalk ? 'Walk through the shop at eye height' : 'Draw and close the room first'}
          >
            Walk through
          </ViewButton>
        )}
        <ViewButton onClick={snapshot} title="Save this view as a picture (PNG)">
          Snapshot
        </ViewButton>
      </div>

      {isWalking && room && pose && (
        <WalkMap
          room={room}
          obstacles={obstacles}
          pose={pose}
          onJump={(p) => setStart({ ...p, yaw: pose.yaw })}
        />
      )}
    </div>
  );
}

function ViewButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-[2px] border border-wall-200 bg-wall-50/95 px-2.5 py-1.5 text-[11px] font-medium text-ink-900 shadow-panel backdrop-blur-sm transition-colors hover:border-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** Hands the outside a way to grab the current frame. */
function Capture({ into }: { into: React.MutableRefObject<(() => string) | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  into.current = () => {
    // Draw the frame now: the buffer is only readable right after a render.
    gl.render(scene, camera);
    return gl.domElement.toDataURL('image/png');
  };
  return null;
}

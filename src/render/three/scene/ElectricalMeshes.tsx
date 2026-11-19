'use client';

import * as THREE from 'three';
import type { ElectricalPoint, RoomPolygon } from '@/model/objects';
import { electricalAnchor } from '@/geometry/electrical';
import { electricalType } from '@/lib/electricalTypes';
import { usePlannerStore } from '@/store/plannerStore';
import { MM } from '../units';
import { useSceneMode } from './mode';
import { useElectricalDrag } from './useElectricalDrag';

/** The colour electrical points have on the plan. */
const EL_COLOR = '#B45309';
const SELECTED = '#16181A';

/**
 * Outlet plates on the walls' inside faces, and floor boxes. In the editor
 * each has a ring round it in the plan's colour for electrical points — a
 * plate is small and as pale as the wall — and can be clicked to select it
 * and dragged to move it; stills for the PDF show the plates alone.
 */
export function ElectricalMeshes({ room, points }: { room: RoomPolygon | null; points: ElectricalPoint[] }) {
  const interactive = useSceneMode() === 'interactive';
  const selectedId = usePlannerStore((s) => (s.selection?.kind === 'electrical' ? s.selection.id : null));
  return (
    <group>
      {points.map((e) =>
        interactive ? (
          <LivePoint key={e.id} room={room} point={e} selected={e.id === selectedId} />
        ) : (
          <Plate key={e.id} room={room} point={e} />
        ),
      )}
    </group>
  );
}

/** A point in the editor: ringed, and taken hold of by the ring or the plate. */
function LivePoint({ room, point, selected }: { room: RoomPolygon | null; point: ElectricalPoint; selected: boolean }) {
  const handlers = useElectricalDrag(point.id);
  return (
    <Plate room={room} point={point} handlers={handlers}>
      {/* Seen from both sides: a wall cut away to look in leaves its points standing. */}
      <mesh renderOrder={5}>
        <ringGeometry args={[selected ? 0.1 : 0.108, 0.13, 40]} />
        <meshBasicMaterial color={selected ? SELECTED : EL_COLOR} side={THREE.DoubleSide} />
      </mesh>
      {/* Unseen, the whole disc inside the ring, so the point is easy to take hold of. */}
      <mesh>
        <circleGeometry args={[0.13, 24]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </Plate>
  );
}

/** The plate (or floor box) itself; `children` lie flat against the wall or the floor, just clear of it. */
function Plate({
  room,
  point: e,
  handlers,
  children,
}: {
  room: RoomPolygon | null;
  point: ElectricalPoint;
  handlers?: ReturnType<typeof useElectricalDrag>;
  children?: React.ReactNode;
}) {
  const a = electricalAnchor(room, e);
  if (!a) return null;
  if (electricalType(e.kind).mount === 'floor') {
    return (
      <group position={[a.point.x * MM, 0.003, a.point.y * MM]} {...handlers}>
        <mesh receiveShadow>
          <boxGeometry args={[0.14, 0.006, 0.14]} />
          <meshStandardMaterial color="#9AA0A6" roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Lying on the floor, facing up. */}
        <group position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {children}
        </group>
      </group>
    );
  }
  const wide = e.kind === 'double-socket' || e.kind === 'screen-power';
  const rotY = -Math.atan2(-a.nx, a.ny);
  return (
    <group
      position={[(a.point.x + a.nx * 6) * MM, e.height * MM, (a.point.y + a.ny * 6) * MM]}
      rotation={[0, rotY, 0]}
      {...handlers}
    >
      <mesh castShadow>
        <boxGeometry args={[(wide ? 160 : 86) * MM, 86 * MM, 12 * MM]} />
        <meshStandardMaterial color="#F7F6F2" roughness={0.6} />
      </mesh>
      <group position={[0, 0, 0.008]}>{children}</group>
    </group>
  );
}

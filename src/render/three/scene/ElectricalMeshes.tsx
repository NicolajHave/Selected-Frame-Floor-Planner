'use client';

import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { ElectricalPoint, RoomPolygon } from '@/model/objects';
import { electricalAnchor } from '@/geometry/electrical';
import { electricalType } from '@/lib/electricalTypes';
import { usePlannerStore } from '@/store/plannerStore';
import { MM } from '../units';
import { useSceneMode } from './mode';

/** The colour electrical points have on the plan. */
const EL_COLOR = '#B45309';
const SELECTED = '#16181A';

/**
 * Outlet plates on the walls' inside faces, and floor boxes. In the editor
 * each has a ring round it in the plan's colour for electrical points — a
 * plate is small and as pale as the wall — and can be clicked to select it;
 * stills for the PDF show the plates alone.
 */
export function ElectricalMeshes({ room, points }: { room: RoomPolygon | null; points: ElectricalPoint[] }) {
  const interactive = useSceneMode() === 'interactive';
  const selectedId = usePlannerStore((s) => (s.selection?.kind === 'electrical' ? s.selection.id : null));
  const gl = useThree((s) => s.gl);
  const selecting = () => usePlannerStore.getState().tool === 'select';
  /** Click to select. With a placement tool armed, the click falls through to what is behind. */
  const handlers = (id: string) =>
    interactive
      ? {
          onPointerDown: (e: ThreeEvent<PointerEvent>) => {
            if (e.button !== 0 || !selecting()) return;
            e.stopPropagation();
            usePlannerStore.getState().setSelection({ kind: 'electrical', id });
          },
          // Keep the backdrop's click handler from deselecting what was just selected.
          onClick: (e: ThreeEvent<MouseEvent>) => {
            if (selecting()) e.stopPropagation();
          },
          onPointerOver: (e: ThreeEvent<PointerEvent>) => {
            if (!selecting()) return;
            e.stopPropagation();
            gl.domElement.style.cursor = 'pointer';
          },
          onPointerOut: () => {
            gl.domElement.style.cursor = '';
          },
        }
      : {};
  return (
    <group>
      {points.map((e) => {
        const a = electricalAnchor(room, e);
        if (!a) return null;
        const floor = electricalType(e.kind).mount === 'floor';
        const wide = e.kind === 'double-socket' || e.kind === 'screen-power';
        const selected = interactive && e.id === selectedId;
        // The ring: flat against the wall (or the floor), just clear of the plate —
        // and, unseen, the whole disc inside it, so the point is easy to click.
        const ring = interactive && (
          <group position={[0, 0, floor ? 0 : 0.008]}>
            <mesh renderOrder={5}>
              <ringGeometry args={[selected ? 0.1 : 0.108, 0.13, 40]} />
              <meshBasicMaterial color={selected ? SELECTED : EL_COLOR} />
            </mesh>
            <mesh>
              <circleGeometry args={[0.13, 24]} />
              <meshBasicMaterial colorWrite={false} depthWrite={false} />
            </mesh>
          </group>
        );
        if (floor) {
          return (
            <group key={e.id} position={[a.point.x * MM, 0.003, a.point.y * MM]} {...handlers(e.id)}>
              <mesh receiveShadow>
                <boxGeometry args={[0.14, 0.006, 0.14]} />
                <meshStandardMaterial color="#9AA0A6" roughness={0.5} metalness={0.2} />
              </mesh>
              {/* Lying on the floor, facing up. */}
              <group position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                {ring}
              </group>
            </group>
          );
        }
        const rotY = -Math.atan2(-a.nx, a.ny);
        return (
          <group
            key={e.id}
            position={[(a.point.x + a.nx * 6) * MM, e.height * MM, (a.point.y + a.ny * 6) * MM]}
            rotation={[0, rotY, 0]}
            {...handlers(e.id)}
          >
            <mesh castShadow>
              <boxGeometry args={[(wide ? 160 : 86) * MM, 86 * MM, 12 * MM]} />
              <meshStandardMaterial color="#F7F6F2" roughness={0.6} />
            </mesh>
            {ring}
          </group>
        );
      })}
    </group>
  );
}

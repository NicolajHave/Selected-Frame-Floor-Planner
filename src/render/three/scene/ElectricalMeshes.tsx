'use client';

import type { ElectricalPoint, RoomPolygon } from '@/model/objects';
import { electricalAnchor } from '@/geometry/electrical';
import { electricalType } from '@/lib/electricalTypes';
import { MM } from '../units';

/** Outlet plates on the walls' inside faces, and floor boxes. */
export function ElectricalMeshes({ room, points }: { room: RoomPolygon | null; points: ElectricalPoint[] }) {
  return (
    <group>
      {points.map((e) => {
        const a = electricalAnchor(room, e);
        if (!a) return null;
        const floor = electricalType(e.kind).mount === 'floor';
        const wide = e.kind === 'double-socket' || e.kind === 'screen-power';
        if (floor) {
          return (
            <mesh key={e.id} position={[a.point.x * MM, 0.003, a.point.y * MM]} receiveShadow>
              <boxGeometry args={[0.14, 0.006, 0.14]} />
              <meshStandardMaterial color="#9AA0A6" roughness={0.5} metalness={0.2} />
            </mesh>
          );
        }
        const rotY = -Math.atan2(-a.nx, a.ny);
        return (
          <mesh
            key={e.id}
            position={[(a.point.x + a.nx * 6) * MM, e.height * MM, (a.point.y + a.ny * 6) * MM]}
            rotation={[0, rotY, 0]}
            castShadow
          >
            <boxGeometry args={[(wide ? 160 : 86) * MM, 86 * MM, 12 * MM]} />
            <meshStandardMaterial color="#F7F6F2" roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

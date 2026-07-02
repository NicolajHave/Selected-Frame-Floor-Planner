'use client';

import { useMemo } from 'react';
import type { RoomPolygon } from '@/model/objects';
import { MM } from '../ThreeCanvas';

interface WallSeg {
  key: string;
  cx: number;
  cz: number;
  length: number;
  rotY: number;
}

/**
 * One box per wall segment, centred on the polygon edge, extruded to
 * wallHeight × wallThickness. Segments overlap by one thickness at the
 * corners so joints read as solid.
 */
export function Walls({ room }: { room: RoomPolygon }) {
  const height = room.wallHeight * MM;
  const thickness = room.wallThickness * MM;

  const segments = useMemo<WallSeg[]>(() => {
    const out: WallSeg[] = [];
    const n = room.corners.length;
    if (n < 2) return out;
    for (let i = 0; i < n; i++) {
      const a = room.corners[i]!;
      const b = room.corners[(i + 1) % n]!;
      const ax = a.point.x * MM, az = a.point.y * MM;
      const bx = b.point.x * MM, bz = b.point.y * MM;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      out.push({
        key: `${a.id}-${b.id}`,
        cx: (ax + bx) / 2,
        cz: (az + bz) / 2,
        length: len,
        rotY: -Math.atan2(dz, dx),
      });
    }
    return out;
  }, [room.corners]);

  return (
    <group>
      {segments.map((s) => (
        <mesh
          key={s.key}
          position={[s.cx, height / 2, s.cz]}
          rotation={[0, s.rotY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[s.length + thickness, height, thickness]} />
          <meshStandardMaterial color="#F1EEE7" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

'use client';

import type { Pillar } from '@/model/objects';
import { MM } from '../ThreeCanvas';

export function Pillars({ pillars }: { pillars: Pillar[] }) {
  return (
    <group>
      {pillars.map((p) => {
        const w = p.size.width * MM;
        const d = p.size.depth * MM;
        const h = p.size.height * MM;
        return (
          <mesh
            key={p.id}
            position={[p.position.x * MM, h / 2, p.position.y * MM]}
            rotation={[0, -p.rotation, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#C8C3B8" roughness={0.85} metalness={0} />
          </mesh>
        );
      })}
    </group>
  );
}

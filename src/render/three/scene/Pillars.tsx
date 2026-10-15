'use client';

import type { Pillar } from '@/model/objects';
import { usePlannerStore } from '@/store/plannerStore';
import { MM } from '../units';
import { useFloorDrag } from './useFloorDrag';
import { SelectionBox } from './SelectionBox';
import { useSceneMode } from './mode';

export function Pillars({ pillars }: { pillars: Pillar[] }) {
  const selectedId = usePlannerStore((s) =>
    s.selection?.kind === 'pillar' ? s.selection.id : null,
  );
  return (
    <group>
      {pillars.map((p) => (
        <PillarMesh key={p.id} pillar={p} selected={p.id === selectedId} />
      ))}
    </group>
  );
}

function PillarMesh({ pillar: p, selected }: { pillar: Pillar; selected: boolean }) {
  const updatePillar = usePlannerStore((s) => s.updatePillar);
  const handlers = useFloorDrag('pillar', p.id, p.position, (pos) =>
    updatePillar(p.id, { position: pos }),
  );
  const interactive = useSceneMode() === 'interactive';
  const w = p.size.width * MM;
  const d = p.size.depth * MM;
  const h = p.size.height * MM;

  return (
    <group
      position={[p.position.x * MM, 0, p.position.y * MM]}
      rotation={[0, -p.rotation, 0]}
      {...(interactive ? handlers : {})}
    >
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#C8C3B8" roughness={0.85} metalness={0} />
      </mesh>
      {selected && interactive && <SelectionBox w={w} h={h} d={d} />}
    </group>
  );
}

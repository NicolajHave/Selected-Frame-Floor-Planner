'use client';

import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { InventoryItem } from '@/model/objects';
import { mm, rad } from '@/model/units';
import { rackSize } from '@/lib/racks';
import { InventoryMeshes } from '@/render/three/scene/InventoryMeshes';
import { Lights } from '@/render/three/scene/Lights';
import { SceneModeContext } from '@/render/three/scene/mode';
import { MM } from '@/render/three/units';

/** The rack in 3D, seen from the front and a little to the side. */
export function RackPreview({ modules }: { modules: string[] }) {
  const size = rackSize(modules);
  const item: InventoryItem = {
    id: 'rack-preview',
    type: 'inventory',
    name: 'Preview',
    modules,
    position: { x: mm(0), y: mm(0) },
    size,
    rotation: rad(0),
  };
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.05, far: 100, position: [0, 1.4, 6] }}>
      <color attach="background" args={['#ECEAE4']} />
      <SceneModeContext.Provider value="render">
        <Lights />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color="#DDD8CE" roughness={0.95} />
        </mesh>
        {/* The wall behind the rack */}
        <mesh position={[0, 1.5, (-size.depth / 2) * MM - 0.06]} receiveShadow>
          <boxGeometry args={[Math.max(3, size.width * MM + 1.2), 3, 0.12]} />
          <meshStandardMaterial color="#F1EEE7" roughness={0.9} />
        </mesh>
        <Suspense fallback={null}>
          <InventoryMeshes items={modules.length ? [item] : []} />
        </Suspense>
        <Frame width={size.width * MM} height={Math.max(size.height * MM, 2.3)} />
      </SceneModeContext.Provider>
    </Canvas>
  );
}

/** Keeps the whole rack in view as units are added or removed. */
function Frame({ width, height }: { width: number; height: number }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    const fov = (30 * Math.PI) / 180;
    const fitH = (height * 1.25) / 2 / Math.tan(fov / 2);
    const fitW = (Math.max(width, 1.5) * 1.15) / 2 / (Math.tan(fov / 2) * aspect);
    const dist = Math.max(fitH, fitW);
    camera.position.set(dist * 0.28, height * 0.62, dist);
    camera.lookAt(0, height * 0.45, 0);
  }, [camera, width, height, aspect]);
  return null;
}

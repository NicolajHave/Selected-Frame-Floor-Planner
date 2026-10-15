'use client';

import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { InventoryItem } from '@/model/objects';
import { findAsset } from '@/lib/assetCatalog';
import { usePlannerStore } from '@/store/plannerStore';
import { MM } from '../units';
import { useFloorDrag } from './useFloorDrag';
import { SelectionBox } from './SelectionBox';
import { useSceneMode } from './mode';
import { rackSlots } from '@/lib/racks';

export function InventoryMeshes({ items }: { items: InventoryItem[] }) {
  const selectedId = usePlannerStore((s) =>
    s.selection?.kind === 'inventory' ? s.selection.id : null,
  );
  return (
    <group>
      {items.map((item) => (
        <InventoryMesh key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </group>
  );
}

function InventoryMesh({ item, selected }: { item: InventoryItem; selected: boolean }) {
  const asset = findAsset(item.assetRef);
  const moveInventory = usePlannerStore((s) => s.moveInventory);
  const handlers = useFloorDrag('inventory', item.id, item.position, (p, free) =>
    moveInventory(item.id, p, { wallSnap: !free }),
  );
  const interactive = useSceneMode() === 'interactive';

  const elevation = (asset?.mountHeight ?? 0) * MM;
  const position: [number, number, number] = [item.position.x * MM, elevation, item.position.y * MM];
  const rotation: [number, number, number] = [0, -item.rotation, 0];

  return (
    <group position={position} rotation={rotation} {...(interactive ? handlers : {})}>
      {item.modules?.length ? (
        <RackModels modules={item.modules} interactive={interactive} />
      ) : asset?.glbUrl ? (
        interactive ? (
          <Suspense fallback={<PlaceholderBox item={item} />}>
            <GlbModel url={asset.glbUrl} />
          </Suspense>
        ) : (
          // Stills wait (in the scene's Suspense) for every model to load.
          <GlbModel url={asset.glbUrl} />
        )
      ) : (
        <PlaceholderBox item={item} />
      )}
      {selected && interactive && (
        <SelectionBox w={item.size.width * MM} h={item.size.height * MM} d={item.size.depth * MM} />
      )}
    </group>
  );
}

/** The units of a wall rack side by side, their backs lined up. */
function RackModels({ modules, interactive }: { modules: string[]; interactive: boolean }) {
  return (
    <>
      {rackSlots(modules).map((slot, i) => {
        const a = slot.asset;
        const pos: [number, number, number] = [slot.x * MM, 0, slot.y * MM];
        const box = (
          <mesh position={[pos[0], (a.size.height * MM) / 2, pos[2]]} castShadow receiveShadow>
            <boxGeometry args={[a.size.width * MM, a.size.height * MM, a.size.depth * MM]} />
            <meshStandardMaterial color="#AEB59F" roughness={0.8} metalness={0} />
          </mesh>
        );
        if (!a.glbUrl) return <group key={i}>{box}</group>;
        return (
          <group key={i} position={pos}>
            {interactive ? (
              <Suspense fallback={<group position={[-pos[0], 0, -pos[2]]}>{box}</group>}>
                <GlbModel url={a.glbUrl} />
              </Suspense>
            ) : (
              <GlbModel url={a.glbUrl} />
            )}
          </group>
        );
      })}
    </>
  );
}

/** Generated catalog model. Fiber caches the load per URL; clone per instance. */
function GlbModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf]);
  return <primitive object={scene} />;
}

/** Box in the item's stored dimensions — used while loading and for
 *  items without a catalog model (e.g. the generic placeholder). */
function PlaceholderBox({ item }: { item: InventoryItem }) {
  const w = item.size.width * MM;
  const d = item.size.depth * MM;
  const h = item.size.height * MM;
  return (
    <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color="#AEB59F" roughness={0.8} metalness={0} />
    </mesh>
  );
}

'use client';

import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { InventoryItem } from '@/model/objects';
import { findAsset } from '@/lib/assetCatalog';
import { MM } from '../ThreeCanvas';

export function InventoryMeshes({ items }: { items: InventoryItem[] }) {
  return (
    <group>
      {items.map((item) => (
        <InventoryMesh key={item.id} item={item} />
      ))}
    </group>
  );
}

function InventoryMesh({ item }: { item: InventoryItem }) {
  const asset = findAsset(item.assetRef);
  const position: [number, number, number] = [item.position.x * MM, 0, item.position.y * MM];
  const rotation: [number, number, number] = [0, -item.rotation, 0];

  if (asset?.glbUrl) {
    return (
      <group position={position} rotation={rotation}>
        <Suspense fallback={<PlaceholderBox item={item} />}>
          <GlbModel url={asset.glbUrl} />
        </Suspense>
      </group>
    );
  }
  return (
    <group position={position} rotation={rotation}>
      <PlaceholderBox item={item} />
    </group>
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

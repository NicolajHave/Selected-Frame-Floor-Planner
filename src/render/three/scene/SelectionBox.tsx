'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const PAD = 0.04; // metres around the object

/** Outline box drawn around the selected object, in its local frame. */
export function SelectionBox({ w, h, d }: { w: number; h: number; d: number }) {
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + PAD * 2, h + PAD * 2, d + PAD * 2)),
    [w, h, d],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} position={[0, h / 2, 0]} renderOrder={10}>
      <lineBasicMaterial color="#16181A" depthTest={false} transparent opacity={0.85} />
    </lineSegments>
  );
}

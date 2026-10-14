'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { RoomPolygon } from '@/model/objects';
import { MM } from '../ThreeCanvas';

/** Room slab: the polygon extruded 20 mm down so it reads as a floor. */
export function Floor({ room }: { room: RoomPolygon }) {
  const geometry = useMemo(() => {
    const pts = room.corners.map((c) => new THREE.Vector2(c.point.x * MM, c.point.y * MM));
    if (pts.length < 3) return null;
    const shape = new THREE.Shape(pts);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    // Shape lies in XY; rotateX(+90°) maps shape (x, y) -> scene (x, z)
    // and the +Z extrusion ends up below the floor plane, so the slab
    // spans y ∈ [-20 mm, 0] with its top face exactly at y = 0.
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [room.corners]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#DDD8CE" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

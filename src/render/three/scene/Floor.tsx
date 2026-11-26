'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import type { RoomPolygon } from '@/model/objects';
import { DEFAULT_FLOOR_COLOR, roomFloor } from '@/lib/finishes';
import { MM } from '../units';
import { floorTexture } from './floorTexture';
import { useStage } from './stage';

/**
 * Room slab: the polygon extruded 20 mm down so it reads as a floor, in the
 * floor chosen for the room (lib/finishes). An elevation for the PDF is a
 * drawing, and keeps the plain neutral floor.
 */
export function Floor({ room }: { room: RoomPolygon }) {
  const stage = useStage();
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

  const drawing = !!stage?.frontLight;
  const floor = roomFloor(room);
  const texture = useMemo(() => (drawing ? null : floorTexture(floor)), [drawing, floor.type.kind, floor.color, floor.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} receiveShadow>
      {/* Keyed: a material with a map is another program than one without. */}
      <meshStandardMaterial
        key={texture ? 'painted' : 'plain'}
        color={drawing ? DEFAULT_FLOOR_COLOR : texture ? '#FFFFFF' : floor.color}
        map={texture}
        roughness={drawing ? 0.95 : floor.type.roughness}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

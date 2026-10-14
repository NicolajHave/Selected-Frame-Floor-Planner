'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';
import type { SelectionKind } from '@/model/objects';
import { usePlannerStore } from '@/store/plannerStore';
import { MM } from '../ThreeCanvas';

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** World mm point under the pointer on the floor plane, or null. */
export function floorPoint(ray: THREE.Ray): Point | null {
  const hit = ray.intersectPlane(FLOOR, new THREE.Vector3());
  if (!hit) return null;
  return { x: (hit.x / MM) as Mm, y: (hit.z / MM) as Mm };
}

interface Capturable {
  setPointerCapture(id: number): void;
  releasePointerCapture(id: number): void;
}

/**
 * Select-and-drag along the floor for a 3D object. The whole drag is one
 * undo step; orbiting is paused while it runs.
 */
export function useFloorDrag(
  kind: Extract<SelectionKind, 'pillar' | 'inventory'>,
  id: string,
  position: Point,
  onMove: (p: Point, freeMove: boolean) => void,
) {
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const gl = useThree((s) => s.gl);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const isSelectTool = () => usePlannerStore.getState().tool === 'select';

  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      // With a placement tool armed, let the click fall through to the floor.
      if (e.button !== 0 || !isSelectTool()) return;
      e.stopPropagation();
      const store = usePlannerStore.getState();
      store.setSelection({ kind, id });
      const hit = floorPoint(e.ray);
      if (!hit) return;
      drag.current = { dx: hit.x - position.x, dy: hit.y - position.y };
      store.beginGesture();
      (e.target as unknown as Capturable).setPointerCapture(e.pointerId);
      if (controls) controls.enabled = false;
      gl.domElement.style.cursor = 'grabbing';
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const hit = floorPoint(e.ray);
      if (!hit) return;
      onMove({ x: (hit.x - d.dx) as Mm, y: (hit.y - d.dy) as Mm }, e.nativeEvent.altKey);
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!drag.current) return;
      e.stopPropagation();
      drag.current = null;
      (e.target as unknown as Capturable).releasePointerCapture(e.pointerId);
      if (controls) controls.enabled = true;
      gl.domElement.style.cursor = 'grab';
      usePlannerStore.getState().endGesture();
    },
    // Keep the floor's click handler from deselecting what we just selected.
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (isSelectTool()) e.stopPropagation();
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      if (!isSelectTool()) return;
      e.stopPropagation();
      if (!drag.current) gl.domElement.style.cursor = 'grab';
    },
    onPointerOut: () => {
      if (!drag.current) gl.domElement.style.cursor = '';
    },
  };
}

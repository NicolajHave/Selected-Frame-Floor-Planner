'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Mm } from '@/model/units';
import { mm } from '@/model/units';
import { clampToWall, dragAxis, draggedHeight, electricalAnchor } from '@/geometry/electrical';
import { wallFrame } from '@/geometry/openings';
import { wallHeightOf } from '@/geometry/wallStyle';
import { wallSpotForDrag, wallSpotOn, type Vec3 } from '@/geometry/wallRay';
import { usePlannerStore } from '@/store/plannerStore';
import { MM } from '../units';
import { floorPoint } from './useFloorDrag';

/** Along a wall a dragged point moves in steps of this many mm. */
const ALONG_STEP = 10;
/**
 * The pointer moves this many pixels before a press becomes a drag: a click
 * to select nudges nothing, and by then the drag shows which way it is going.
 */
const SLACK_PX = 5;

interface Capturable {
  setPointerCapture(id: number): void;
  releasePointerCapture(id: number): void;
}

/** What was taken hold of, and how far from the point's centre. */
type Grip = { x: number; y: number; moving: boolean } & (
  | { on: 'floor'; dx: number; dy: number }
  | { on: 'wall'; dAlong: number; dHeight: number; axis: 'along' | 'height' | null }
);

/** The pointer's line of sight in the room's own measures: plan x and y, z up, mm. */
const sight = (ray: THREE.Ray): [Vec3, Vec3] => [
  [ray.origin.x / MM, ray.origin.z / MM, ray.origin.y / MM],
  [ray.direction.x, ray.direction.z, ray.direction.y],
];

/**
 * Select-and-drag for an electrical point in the 3D view. A wall point
 * follows the pointer along its wall and on to the next one, keeping its
 * height — or, dragged upright, goes up and down where it is (see
 * `dragAxis`). A floor box follows the pointer over the floor. The whole
 * drag is one undo step; orbiting is paused while it runs.
 */
export function useElectricalDrag(id: string) {
  const controls = useThree((s) => s.controls) as OrbitControls | null;
  const gl = useThree((s) => s.gl);
  const view = useThree((s) => s.get);
  const grip = useRef<Grip | null>(null);

  const selecting = () => usePlannerStore.getState().tool === 'select';
  const current = () => {
    const { project } = usePlannerStore.getState();
    return { room: project.room, point: project.electrical?.find((x) => x.id === id) };
  };

  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      // With a placement tool armed, let the click fall through to what is behind.
      if (e.button !== 0 || !selecting()) return;
      e.stopPropagation();
      const store = usePlannerStore.getState();
      store.setSelection({ kind: 'electrical', id });
      if (store.readOnly) return; // viewers can inspect, not move
      const { room, point } = current();
      if (!point) return;
      const press = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, moving: false };
      if (point.position) {
        const hit = floorPoint(e.ray);
        if (!hit) return;
        grip.current = { ...press, on: 'floor', dx: hit.x - point.position.x, dy: hit.y - point.position.y };
      } else {
        const index = room ? room.corners.findIndex((c) => c.id === point.wallStartCornerId) : -1;
        const w = room ? wallFrame(room, index) : null;
        const spot = room && w ? wallSpotForDrag(room, index, ...sight(e.ray)) : null;
        if (!room || !w || !spot || spot.index !== index) return;
        const along = clampToWall(w.length, room.wallThickness, point.offset ?? 0);
        grip.current = { ...press, on: 'wall', dAlong: spot.along - along, dHeight: spot.height - point.height, axis: null };
      }
      store.beginGesture();
      (e.target as unknown as Capturable).setPointerCapture(e.pointerId);
      if (controls) controls.enabled = false;
      gl.domElement.style.cursor = 'grabbing';
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const g = grip.current;
      if (!g) return;
      e.stopPropagation();
      const move = [e.nativeEvent.clientX - g.x, e.nativeEvent.clientY - g.y] as const;
      if (!g.moving && Math.hypot(...move) < SLACK_PX) return;
      g.moving = true;
      const store = usePlannerStore.getState();
      const { room, point } = current();
      if (!point) return;
      if (g.on === 'floor') {
        const hit = floorPoint(e.ray);
        if (!hit || !point.position) return;
        const to = { x: Math.round(hit.x - g.dx) as Mm, y: Math.round(hit.y - g.dy) as Mm };
        if (to.x !== point.position.x || to.y !== point.position.y) store.moveElectrical(id, to);
        return;
      }
      if (!room) return;
      const index = room.corners.findIndex((c) => c.id === point.wallStartCornerId);
      if (!g.axis) {
        // Which way the wall runs on the screen where the point is.
        const a = electricalAnchor(room, point);
        const w = wallFrame(room, index);
        if (!a || !w) return;
        const { camera, size } = view();
        const from = new THREE.Vector3(a.point.x * MM, point.height * MM, a.point.y * MM);
        const to = from.clone().add(new THREE.Vector3(w.ux, 0, w.uy).multiplyScalar(0.5));
        from.project(camera);
        to.project(camera);
        g.axis = dragAxis(move, [((to.x - from.x) * size.width) / 2, (-(to.y - from.y) * size.height) / 2]);
      }
      if (g.axis === 'height') {
        const spot = wallSpotOn(room, index, ...sight(e.ray));
        if (!spot) return;
        const height = mm(draggedHeight(spot.height - g.dHeight, wallHeightOf(room, index)));
        if (height !== point.height) store.updateElectrical(id, { height });
        return;
      }
      const spot = wallSpotForDrag(room, index, ...sight(e.ray));
      const w = spot ? wallFrame(room, spot.index) : null;
      if (!spot || !w) return;
      const wallStartCornerId = room.corners[spot.index]!.id;
      const along = Math.round((spot.along - g.dAlong) / ALONG_STEP) * ALONG_STEP;
      const offset = clampToWall(w.length, room.wallThickness, along) as Mm;
      if (wallStartCornerId !== point.wallStartCornerId || offset !== point.offset) store.updateElectrical(id, { wallStartCornerId, offset });
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!grip.current) return;
      e.stopPropagation();
      grip.current = null;
      (e.target as unknown as Capturable).releasePointerCapture(e.pointerId);
      if (controls) controls.enabled = true;
      gl.domElement.style.cursor = 'grab';
      usePlannerStore.getState().endGesture();
    },
    // Keep the backdrop's click handler from deselecting what was just selected.
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (selecting()) e.stopPropagation();
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      if (!selecting()) return;
      e.stopPropagation();
      if (!grip.current) gl.domElement.style.cursor = usePlannerStore.getState().readOnly ? 'pointer' : 'grab';
    },
    onPointerOut: () => {
      if (!grip.current) gl.domElement.style.cursor = '';
    },
  };
}

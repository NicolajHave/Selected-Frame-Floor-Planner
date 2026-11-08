'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { RoomPolygon } from '@/model/objects';
import type { Point } from '@/model/geometry';
import type { Polygon } from '@/geometry/footprint';
import { EYE_HEIGHT_MM, RUN_SPEED_MM, WALK_SPEED_MM, walkStep, type WalkPose } from '@/lib/walk';
import { MM } from '../units';

/** Field of view at eye level: wider than the overview, like looking around a shop. */
const WALK_FOV = 62;
/** Radians turned per pixel dragged. */
const LOOK_SPEED = 0.0045;
/** Radians per second the arrow keys turn. */
const TURN_SPEED = 1.6;
const MAX_PITCH = 1.2;
/** Mm walked per wheel notch. */
const WHEEL_STEP = 400;

interface Props {
  room: RoomPolygon;
  obstacles: Polygon[];
  start: WalkPose;
  /** Called a few times a second with where the visitor is (for the map). */
  onPose: (p: WalkPose) => void;
  onExit: () => void;
}

/**
 * First-person walk-through at eye height: drag to look around, W A S D or
 * the arrow keys to walk (←/→ turn, Shift walks faster), the wheel steps
 * forward and back, Esc leaves. Walls and fixtures can't be walked through.
 */
export function WalkView({ room, obstacles, start, onPose, onExit }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const pose = useRef({ ...start, pitch: -0.05 });
  const keys = useRef(new Set<string>());
  const lastReport = useRef(0);
  const geometry = useRef({ room, obstacles });
  geometry.current = { room, obstacles };

  // Start where asked (also when "start" changes, e.g. back to the entrance).
  useEffect(() => {
    pose.current = { ...start, pitch: -0.05 };
  }, [start]);

  // Eye-level lens while walking; the overview camera comes back afterwards.
  useEffect(() => {
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
    camera.fov = WALK_FOV;
    camera.updateProjectionMatrix();
    return () => {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = pose.current;
      // Drag the view: moving the pointer right turns to the right.
      p.yaw += (e.clientX - drag.x) * LOOK_SPEED;
      p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch - (e.clientY - drag.y) * LOOK_SPEED));
      drag = { ...drag, x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      step(-Math.sign(e.deltaY) * WHEEL_STEP, 0);
    };
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.matches?.('input, textarea, select, [contenteditable="true"]');
    const keyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onExit();
        return;
      }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        e.preventDefault();
        keys.current.add(k);
      }
      if (e.key === 'Shift') keys.current.add('Shift');
    };
    const keyUp = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current.delete(k);
      if (e.key === 'Shift') keys.current.delete('Shift');
    };
    const blur = () => keys.current.clear();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [gl, onExit]);

  /** Walk `forward` mm along the heading and `right` mm to the side, sliding along walls. */
  function step(forward: number, right: number) {
    const p = pose.current;
    const fx = Math.cos(p.yaw);
    const fy = Math.sin(p.yaw);
    // On the plan, +y is "down", so the right-hand side of heading (fx, fy) is (-fy, fx).
    const dx = fx * forward - fy * right;
    const dy = fy * forward + fx * right;
    const next: Point = walkStep(geometry.current.room, { x: p.x, y: p.y } as Point, dx, dy, geometry.current.obstacles);
    p.x = next.x;
    p.y = next.y;
  }

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const k = keys.current;
    const p = pose.current;
    if (k.has('ArrowLeft')) p.yaw -= TURN_SPEED * dt;
    if (k.has('ArrowRight')) p.yaw += TURN_SPEED * dt;
    const speed = (k.has('Shift') ? RUN_SPEED_MM : WALK_SPEED_MM) * dt;
    const forward = (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
    const right = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    if (forward || right) {
      const norm = Math.hypot(forward, right);
      step((forward / norm) * speed, (right / norm) * speed);
    }

    const eye = EYE_HEIGHT_MM * MM;
    camera.position.set(p.x * MM, eye, p.y * MM);
    const c = Math.cos(p.pitch);
    camera.lookAt(p.x * MM + Math.cos(p.yaw) * c, eye + Math.sin(p.pitch), p.y * MM + Math.sin(p.yaw) * c);

    if (state.clock.elapsedTime - lastReport.current > 0.15) {
      lastReport.current = state.clock.elapsedTime;
      onPose({ x: p.x, y: p.y, yaw: p.yaw });
    }
  });

  return null;
}

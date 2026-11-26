import * as THREE from 'three';
import type { ResolvedFloor } from '@/lib/finishes';
import { PAINT_SIZE, paintFloor } from '@/lib/floorPaint';
import { MM } from '../units';

const painted = new Map<string, HTMLCanvasElement>();
const made = new Map<string, THREE.CanvasTexture>();

/**
 * The floor's painted square as a texture that repeats over the floor at
 * its true size (the floor's texture coordinates are metres on the plan).
 * One per kind and colour, kept for as long as the page lives. Null for a
 * plain floor, which is just its colour.
 */
export function floorTexture(floor: ResolvedFloor): THREE.CanvasTexture | null {
  const { type, color } = floor;
  if (type.kind === 'plain' || typeof document === 'undefined') return null;
  const key = `${type.kind}|${color}`;
  const kept = made.get(`${key}|${floor.turn}`);
  if (kept) return kept;
  let canvas = painted.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = PAINT_SIZE[type.kind];
    paintFloor(canvas, type.kind, color);
    painted.set(key, canvas);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(1 / (type.tile * MM));
  texture.rotation = (floor.turn * Math.PI) / 180;
  // Floors are seen at a low angle: without this the pattern smears a few metres away.
  texture.anisotropy = 8;
  made.set(`${key}|${floor.turn}`, texture);
  return texture;
}

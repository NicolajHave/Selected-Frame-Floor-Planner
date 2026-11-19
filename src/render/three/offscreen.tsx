'use client';

import { Component, type ReactNode } from 'react';
import * as THREE from 'three';
import { createRoot, extend, _roots, type RootState } from '@react-three/fiber';
import type { Project } from '@/model/project';
import type { ShotSpec } from '@/lib/views';
import { SceneContents } from './scene/SceneContents';
import { SceneModeContext } from './scene/mode';
import { plainStage, StageContext, type Stage } from './scene/stage';

export interface ShotRequest {
  spec: ShotSpec;
  /** Pixels. */
  width: number;
  height: number;
  /**
   * A picture laid together from several takes of the same view, in turn
   * (an orthographic camera only). An elevation takes its wall and what
   * stands at it, then the rest of the shop faintly over that, then draws
   * the wall's own fixtures in line on top. The plain scene, once, when
   * left out.
   */
  takes?: Take[];
}

/** One take of a view: the scene set up some way, in colour and/or as outlines. */
export interface Take {
  /** How the scene is set up (see scene/stage.ts); the plain scene when left out. */
  stage?: Partial<Stage>;
  /** How strongly the take goes onto the picture, 0–1; 0 leaves its colours out. */
  alpha: number;
  /** Ink outlines round everything in the take, 0–1 strong; none when left out. */
  lines?: number;
}

/**
 * Writes how far from the camera each point is, instead of its colour: the
 * red byte coarse, the green fine. With an orthographic camera that runs
 * evenly from the near plane to the far one.
 */
const depthMaterial = new THREE.ShaderMaterial({
  vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'void main() { float d = gl_FragCoord.z * 255.0; gl_FragColor = vec4(floor(d) / 255.0, fract(d), 0.0, 1.0); }',
});

/** A jump in depth of this much (mm) between neighbouring points is an edge. */
const EDGE_MM = 9;
const INK = [58, 60, 62] as const;

/**
 * The outlines in a depth picture (`depth`: RGBA bytes as `depthMaterial`
 * writes them, bottom row first), as ink on a clear sheet. An edge is
 * where the depth breaks — the rim of something in front of something else,
 * a fold — not where a slanted or rounded surface merely recedes: the test
 * is on the change of the slope, so those stay clean.
 */
function outlines(depth: Uint8Array, width: number, height: number, rangeMm: number): HTMLCanvasElement {
  const mm = new Float32Array(width * height);
  for (let i = 0; i < mm.length; i++) mm[i] = ((depth[4 * i]! + depth[4 * i + 1]! / 255) / 255) * rangeMm;
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  const ctx = sheet.getContext('2d')!;
  const ink = ctx.createImageData(width, height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const d = mm[i]!;
      const bend = Math.max(Math.abs(mm[i - 1]! - 2 * d + mm[i + 1]!), Math.abs(mm[i - width]! - 2 * d + mm[i + width]!));
      if (bend < EDGE_MM) continue;
      // The depth picture is bottom-up; the sheet top-down.
      const o = 4 * ((height - 1 - y) * width + x);
      ink.data[o] = INK[0];
      ink.data[o + 1] = INK[1];
      ink.data[o + 2] = INK[2];
      ink.data[o + 3] = 255;
    }
  }
  ctx.putImageData(ink, 0, 0);
  return sheet;
}

// <Canvas> registers three's classes itself; a bare root has to.
extend(THREE as unknown as Parameters<typeof extend>[0]);

const BACKGROUND = '#ECECEC';
const LOAD_TIMEOUT = 30_000;

/**
 * Renders stills of the project's 3D scene on a detached canvas, one per
 * request, and returns them as JPEG data URLs keyed by shot id. The scene
 * is the editor's (walls cut away towards the camera) without selection
 * outlines; every model is loaded before the first picture is taken.
 */
export async function renderShots(project: Project, shots: ShotRequest[]): Promise<Record<string, string>> {
  if (shots.length === 0) return {};
  const canvas = document.createElement('canvas');
  const first = shots[0]!;
  canvas.width = first.width;
  canvas.height = first.height;
  const root = createRoot(canvas);
  // The scene reads this on every frame; each picture sets it up its own way.
  const stage = plainStage();
  try {
    // The renderer is made here (fiber may build it asynchronously); the scene goes in after.
    await root.configure({
      size: { width: first.width, height: first.height, top: 0, left: 0 },
      dpr: 1,
      frameloop: 'never',
      shadows: true,
      gl: { preserveDrawingBuffer: true, antialias: true },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('3D models took too long to load')), LOAD_TIMEOUT);
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      const fail = (e: unknown) => {
        window.clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      };
      root.render(
        <SceneModeContext.Provider value="render">
          <StageContext.Provider value={stage}>
            <Catch onError={fail}>
              <color attach="background" args={[BACKGROUND]} />
              <SceneContents project={project} onReady={done} />
            </Catch>
          </StageContext.Provider>
        </SceneModeContext.Provider>,
      );
    });

    const state = _roots.get(canvas)?.store.getState() as RootState | undefined;
    if (!state) throw new Error('3D renderer did not start');
    // Stills are viewed on paper, not a screen: lift them a little.
    state.gl.toneMappingExposure = 1.35;
    const out: Record<string, string> = {};
    let t = 0;
    const shoot = (setup: Partial<Stage> | undefined) => {
      Object.assign(stage, plainStage(), setup);
      // Twice: the first frame settles what shows (the wall cutaway, the staging), the second is clean.
      state.advance((t += 16));
      state.advance((t += 16));
    };
    const gl = state.gl.getContext();
    for (const { spec, width, height, takes } of shots) {
      if (state.size.width !== width || state.size.height !== height) {
        state.setSize(width, height);
      }
      state.set({ camera: makeCamera(spec, width / height) });
      if (!takes || spec.kind !== 'ortho') {
        shoot(undefined);
        out[spec.id] = canvas.toDataURL('image/jpeg', 0.88);
        continue;
      }
      // The takes laid together, in turn, on a plain sheet.
      const sheet = document.createElement('canvas');
      sheet.width = width;
      sheet.height = height;
      const ctx = sheet.getContext('2d')!;
      for (const take of takes) {
        if (take.alpha > 0) {
          shoot(take.stage);
          ctx.globalAlpha = take.alpha;
          ctx.drawImage(canvas, 0, 0, width, height);
        }
        if (take.lines) {
          // The same take once more as depth, far away where nothing is.
          const background = state.scene.background;
          state.scene.background = new THREE.Color(1, 1, 0);
          state.scene.overrideMaterial = depthMaterial;
          shoot(take.stage);
          const depth = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, depth);
          state.scene.overrideMaterial = null;
          state.scene.background = background;
          ctx.globalAlpha = take.lines;
          ctx.drawImage(outlines(depth, width, height, (spec.far - spec.near) * 1000), 0, 0);
        }
      }
      out[spec.id] = sheet.toDataURL('image/jpeg', 0.9);
    }
    return out;
  } finally {
    root.unmount();
  }
}

type ManualCamera = (THREE.PerspectiveCamera | THREE.OrthographicCamera) & { manual?: boolean };

function makeCamera(spec: ShotSpec, aspect: number): ManualCamera {
  let camera: ManualCamera;
  if (spec.kind === 'perspective') {
    camera = new THREE.PerspectiveCamera(spec.fov, aspect, 0.05, 500);
  } else {
    const f = spec.frustum;
    camera = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, spec.near, spec.far);
  }
  // Keep fiber from refitting the projection to the canvas size.
  camera.manual = true;
  camera.position.set(...spec.position);
  camera.lookAt(...spec.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

class Catch extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: unknown) {
    this.props.onError(e);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

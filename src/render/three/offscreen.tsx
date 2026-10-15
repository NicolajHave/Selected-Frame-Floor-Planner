'use client';

import { Component, type ReactNode } from 'react';
import * as THREE from 'three';
import { createRoot, extend, _roots, type RootState } from '@react-three/fiber';
import type { Project } from '@/model/project';
import type { ShotSpec } from '@/lib/views';
import { SceneContents } from './scene/SceneContents';
import { SceneModeContext } from './scene/mode';

export interface ShotRequest {
  spec: ShotSpec;
  /** Pixels. */
  width: number;
  height: number;
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
  try {
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
      root.configure({
        size: { width: first.width, height: first.height, top: 0, left: 0 },
        dpr: 1,
        frameloop: 'never',
        shadows: true,
        gl: { preserveDrawingBuffer: true, antialias: true },
      });
      root.render(
        <SceneModeContext.Provider value="render">
          <Catch onError={fail}>
            <color attach="background" args={[BACKGROUND]} />
            <SceneContents project={project} onReady={done} />
          </Catch>
        </SceneModeContext.Provider>,
      );
    });

    const state = _roots.get(canvas)?.store.getState() as RootState | undefined;
    if (!state) throw new Error('3D renderer did not start');
    // Stills are viewed on paper, not a screen: lift them a little.
    state.gl.toneMappingExposure = 1.35;
    const out: Record<string, string> = {};
    let t = 0;
    for (const { spec, width, height } of shots) {
      if (state.size.width !== width || state.size.height !== height) {
        state.setSize(width, height);
      }
      state.set({ camera: makeCamera(spec, width / height) });
      // Twice: the first frame settles the wall cutaway, the second is clean.
      state.advance((t += 16));
      state.advance((t += 16));
      out[spec.id] = canvas.toDataURL('image/jpeg', 0.88);
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

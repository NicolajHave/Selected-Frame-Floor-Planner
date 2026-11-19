'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useStage } from './stage';

/**
 * Daylight from one side, with shadows. A staged still can ask for a front
 * light instead: even light from everywhere and a little from the viewer's
 * side, no shadows, so an elevation reads like a drawing — the same
 * whichever way its wall faces, with the steel dark against the wall.
 */
/** The front light: mostly even light, which leaves bare steel darker than a painted wall. */
const FRONT = { ambient: 1.25, sky: 0.4, direct: 0.55 };

export function Lights() {
  const stage = useStage();
  const sun = useRef<THREE.DirectionalLight>(null);
  const front = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const aim = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const staged = !!stage?.frontLight;
    if (sun.current) sun.current.visible = !staged;
    if (ambient.current) ambient.current.intensity = staged ? FRONT.ambient : 0.75;
    if (sky.current) sky.current.intensity = staged ? FRONT.sky : 0.5;
    if (!front.current) return;
    front.current.visible = staged;
    if (!staged) return;
    // From behind the viewer, raised and a little to one side so edges still read.
    camera.getWorldDirection(aim.current);
    const side = new THREE.Vector3().crossVectors(aim.current, camera.up).normalize();
    front.current.position.copy(camera.position).addScaledVector(aim.current, -10).addScaledVector(camera.up, 4).addScaledVector(side, -3);
    front.current.target.position.copy(camera.position).addScaledVector(aim.current, 10);
    front.current.target.updateMatrixWorld();
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={0.75} />
      <hemisphereLight ref={sky} args={['#FCFBF7', '#B8B2A4', 0.5]} />
      <directionalLight
        ref={sun}
        position={[8, 14, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        // Without a bias, smooth curved surfaces (podiums, mannequins) get striped self-shadows.
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {stage && <directionalLight ref={front} intensity={FRONT.direct} visible={false} />}
    </>
  );
}

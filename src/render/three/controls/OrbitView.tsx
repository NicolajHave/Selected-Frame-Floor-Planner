'use client';

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Props {
  target: [number, number, number];
}

/** Thin wrapper around three's OrbitControls, no drei dependency. */
export function OrbitView({ target }: Props) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const setThree = useThree((s) => s.set);

  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.maxPolarAngle = Math.PI / 2 - 0.02; // stay above the floor
    c.minDistance = 0.5;
    c.maxDistance = 80;
    return c;
  }, [camera, gl]);

  // Expose as r3f's default controls so object drags can pause orbiting.
  useEffect(() => {
    setThree({ controls });
    return () => {
      setThree({ controls: null });
      controls.dispose();
    };
  }, [controls, setThree]);

  useEffect(() => {
    controls.target.set(...target);
    controls.update();
  }, [controls, target]);

  useFrame(() => controls.update());

  return null;
}

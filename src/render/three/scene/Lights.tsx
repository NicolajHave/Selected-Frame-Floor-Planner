'use client';

export function Lights() {
  return (
    <>
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#FCFBF7', '#B8B2A4', 0.5]} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </>
  );
}

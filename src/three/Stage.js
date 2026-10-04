import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function Environment({ intensity = 0.55 }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      room.dispose?.();
    };
  }, [gl, scene, intensity]);
  return null;
}

export function Lights({ shadowSize = 2048, extent = 16 }) {
  // Keeps the normal offset at the same number of shadow texels whatever the map resolution, so smaller maps don't acne
  const normalBias = 0.03 * (2048 / shadowSize) * (extent / 16);
  return (
    <>
      <Environment />
      <hemisphereLight args={['#ffe9cf', '#12302b', 0.45]} />
      <directionalLight
        castShadow
        position={[7, 18, 9]}
        intensity={2.3}
        color="#fff0dc"
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={normalBias}
      />
      <pointLight position={[-12, 9, -8]} intensity={60} distance={45} color="#8fc9ff" />
    </>
  );
}

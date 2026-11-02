import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PUFFS = [
  [-0.13, 0.51, 0, 0.12],
  [0, 0.57, 0, 0.145],
  [0.13, 0.52, 0, 0.115],
  [-0.02, 0.48, 0.065, 0.105],
];
const DROPS = [-0.16, -0.08, 0.01, 0.1, 0.17];
const DROP_GEO = new THREE.CylinderGeometry(0.004, 0.004, 0.075, 5);

export default function RainCloud({ size = 0.335 }) {
  const rain = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    rain.current.forEach((drop, i) => {
      if (!drop) return;
      const phase = (t * 1.8 + i * 0.23) % 1;
      drop.position.y = 0.43 - phase * 0.1;
      drop.material.opacity = 0.72 * Math.sin(Math.PI * phase);
    });
  });
  return (
    <group scale={size / 0.335}>
      {PUFFS.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1.3, 0.85, 1]} castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[r, 14, 10]} />
          <meshStandardMaterial color="#7d8894" roughness={1} />
        </mesh>
      ))}
      {DROPS.map((x, i) => (
        <mesh key={i} ref={(node) => { rain.current[i] = node; }} geometry={DROP_GEO} position={[x, 0.4, i % 2 ? 0.01 : -0.01]} castShadow={false}>
          <meshBasicMaterial color="#dbe5ef" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

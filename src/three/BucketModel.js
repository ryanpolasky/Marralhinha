import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const metal = new THREE.MeshStandardMaterial({ color: '#a1a8aa', metalness: 0.82, roughness: 0.34, side: THREE.DoubleSide });
const wire = new THREE.MeshStandardMaterial({ color: '#687175', metalness: 0.9, roughness: 0.28 });
const rimMetal = new THREE.MeshStandardMaterial({ color: '#727a7d', metalness: 0.92, roughness: 0.3 });
const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#668b95', transparent: true, opacity: 0.45, roughness: 0.12, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
const rippleMaterial = new THREE.MeshPhysicalMaterial({ color: '#c5dbe0', transparent: true, opacity: 0.6, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });

const profile = [
    new THREE.Vector2(0, 0.025),
    new THREE.Vector2(0.27, 0.025),
    new THREE.Vector2(0.31, 0.07),
    new THREE.Vector2(0.4, 0.69),
    new THREE.Vector2(0.42, 0.76),
    new THREE.Vector2(0.39, 0.76),
    new THREE.Vector2(0.37, 0.7),
    new THREE.Vector2(0.29, 0.1),
    new THREE.Vector2(0, 0.1),
  ];

const geometry = (() => {
    const g = new THREE.LatheGeometry(profile, 48);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const dent = Math.exp(-((a - 1.1) ** 2) / 0.055) * Math.exp(-((y - 0.52) ** 2) / 0.035);
      const ripple = Math.sin(a * 7 + y * 12) * 0.006;
      const radial = x || z ? (dent * -0.045 + ripple) / Math.hypot(x, z) : 0;
      pos.setXYZ(i, x + x * radial, y, z + z * radial);
    }
    g.computeVertexNormals();
    return g;
  })();
const handle = (() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.39, 0.72, 0),
      new THREE.Vector3(-0.46, 0.95, 0),
      new THREE.Vector3(0, 1.18, 0),
      new THREE.Vector3(0.46, 0.95, 0),
      new THREE.Vector3(0.39, 0.72, 0),
    ]);
    return new THREE.TubeGeometry(curve, 40, 0.018, 6, false);
  })();
export const warmBucket = () => ({ geometry, handle, materials: [metal, wire, rimMetal, waterMaterial, rippleMaterial] });

export default function BucketModel({ flipped = false, scale = 1 }) {
  const water = useRef();
  const ripple = useRef();
  useFrame(({ clock }) => {
    if (water.current) {
      water.current.material.opacity = 0.45 + Math.sin(clock.elapsedTime * 2.8) * 0.06;
      water.current.scale.setScalar(0.88 + Math.sin(clock.elapsedTime * 2) * 0.025);
    }
    if (ripple.current) {
      const pulse = (clock.elapsedTime * 0.3) % 1;
      ripple.current.scale.setScalar(0.2 + pulse * 0.95);
      ripple.current.material.opacity = (1 - pulse) * 0.66;
    }
  });
  return (
    <group scale={scale} rotation-x={flipped ? Math.PI : 0}>
      <mesh geometry={geometry} material={metal} castShadow receiveShadow />
      {[0.11, 0.67].map((y) => (
        <mesh key={y} position-y={y}>
          <torusGeometry args={[y < 0.2 ? 0.32 : 0.405, 0.018, 8, 48]} />
          <primitive object={rimMetal} attach="material" />
        </mesh>
      ))}
      <mesh geometry={handle} material={wire} />
      <mesh ref={water} position-y={0.66} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.35, 32]} />
        <primitive object={waterMaterial} attach="material" />
      </mesh>
      <mesh ref={ripple} position-y={0.67} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.14, 0.014, 8, 28]} />
        <primitive object={rippleMaterial} attach="material" />
      </mesh>
      <mesh position={[-0.39, 0.72, 0]} material={wire}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
      <mesh position={[0.39, 0.72, 0]} material={wire}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
    </group>
  );
}

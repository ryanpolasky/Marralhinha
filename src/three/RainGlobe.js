import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const _world = new THREE.Vector3();

export default function RainGlobe({ anchor, color = '#d84040', size = 0.335 }) {
  const root = useRef();
  const contents = useRef();
  const state = useMemo(() => ({ x: 0, z: 0, vx: 0, vz: 0, initialized: false, last: new THREE.Vector3() }), []);
  const waterColor = useMemo(() => new THREE.Color(color.main || color), [color]);
  const shell = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({
      color: '#f6fbff',
      roughness: 0.035,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      envMapIntensity: 2,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `float globeFresnel = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 2.2);
         float globeReflection = pow(max(dot(normalize(normal), normalize(vec3(-0.4, 0.65, 0.7))), 0.0), 22.0);
         outgoingLight += vec3(0.68, 0.82, 0.96) * globeFresnel * 1.4 + vec3(0.82, 0.93, 1.0) * globeReflection * 0.8;
         diffuseColor.a = max(diffuseColor.a, globeFresnel * 0.38);
         #include <output_fragment>`
      );
    };
    material.customProgramCacheKey = () => 'unlucky-rain-globe-shell';
    return material;
  }, []);
  const water = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: waterColor,
    transparent: true,
    opacity: 0.88,
    roughness: 0.12,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    side: THREE.DoubleSide,
  }), [waterColor]);
  const cloud = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9d0d5', roughness: 0.92 }), []);
  const ripple = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#e7f4ff', roughness: 0.12, metalness: 0.08, transparent: true, opacity: 0.7, side: THREE.DoubleSide }), []);
  const shellGeometry = useMemo(() => new THREE.SphereGeometry(size, 48, 32), [size]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    if (anchor?.current && root.current) {
      anchor.current.getWorldPosition(_world);
      root.current.position.copy(_world);
      root.current.rotation.set(0, 0, 0);
      if (step > 0) {
        if (!state.initialized) {
          state.last.copy(_world);
          state.initialized = true;
        } else {
          const dx = (_world.x - state.last.x) / step;
          const dz = (_world.z - state.last.z) / step;
          state.vx += (-dx * 0.012 - state.x * 7 - state.vx * 4.2) * step;
          state.vz += (-dz * 0.012 - state.z * 7 - state.vz * 4.2) * step;
          state.x += state.vx * step;
          state.z += state.vz * step;
          state.last.copy(_world);
        }
      }
    }
    if (contents.current) {
      contents.current.rotation.set(THREE.MathUtils.clamp(state.x, -0.28, 0.28), 0, THREE.MathUtils.clamp(state.z, -0.28, 0.28));
      contents.current.children[0].rotation.z = Math.sin(performance.now() * 0.0014) * 0.012;
    }
  });

  return (
    <group ref={root} renderOrder={1}>
      <group ref={contents}>
        <mesh position={[0, -size * 0.62, 0]} scale={[size * 0.92, size * 0.39, size * 0.92]} material={water}>
          <sphereGeometry args={[1, 36, 24]} />
        </mesh>
        <group position={[0, size * 0.56, 0]}>
          <mesh position={[-size * 0.1, 0, 0]} scale={[size * 0.27, size * 0.14, size * 0.2]} material={cloud}><sphereGeometry args={[1, 16, 12]} /></mesh>
          <mesh position={[size * 0.1, size * 0.035, 0]} scale={[size * 0.2, size * 0.16, size * 0.2]} material={cloud}><sphereGeometry args={[1, 16, 12]} /></mesh>
          <mesh position={[0, size * 0.02, size * 0.13]} scale={[size * 0.2, size * 0.13, size * 0.16]} material={cloud}><sphereGeometry args={[1, 16, 12]} /></mesh>
        </group>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * size * 0.11, -size * 0.035, 0]} material={cloud}>
            <cylinderGeometry args={[size * 0.006, size * 0.009, size * 0.39, 6]} />
          </mesh>
        ))}
        {[0, 1].map((i) => (
          <mesh key={`r${i}`} position={[0, -size * 0.22, 0]} rotation-x={-Math.PI / 2} scale={[1 + i * 0.15, 1 + i * 0.15, 1]} material={ripple}>
            <ringGeometry args={[size * (0.11 + i * 0.03), size * (0.125 + i * 0.03), 32]} />
          </mesh>
        ))}
      </group>
      <mesh geometry={shellGeometry} material={shell} renderOrder={2} />
    </group>
  );
}

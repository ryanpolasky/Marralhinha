import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const _world = new THREE.Vector3();
const LEVEL = -0.04;
const DROPS = 7;
const PUFFS = [[-0.2, 0, 0, 0.2], [0.02, 0.07, 0.02, 0.24], [0.22, 0.01, -0.02, 0.18], [-0.06, -0.02, 0.15, 0.17], [0.1, -0.03, -0.15, 0.16], [-0.18, -0.08, -0.08, 0.14], [0.2, -0.08, 0.08, 0.13]];

const shellMaterial = () => {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 2.4, transparent: true, opacity: 0.06, depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 2.6);
       outgoingLight += vec3(0.75, 0.86, 0.97) * rim * 0.9;
       diffuseColor.a = max(diffuseColor.a, rim * 0.55);
       #include <opaque_fragment>`
    );
  };
  material.customProgramCacheKey = () => 'unlucky-rain-globe-shell';
  return material;
};

const waterMaterial = (color) => {
  const surface = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.28);
  const material = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurface = { value: surface };
    shader.uniforms.uLevel = { value: LEVEL };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLocalY;\nuniform vec3 uSurface;\nuniform float uLevel;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vLocalY > uLevel) discard;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (!gl_FrontFacing) gl_FragColor = vec4(uSurface * 0.9, 0.96);`);
  };
  material.customProgramCacheKey = () => 'unlucky-rain-globe-water';
  return material;
};

export default function RainGlobe({ anchor, color = '#d84040', size = 0.335 }) {
  const root = useRef();
  const contents = useRef();
  const drops = useRef([]);
  const rings = useRef([]);
  const state = useMemo(() => ({ x: 0, z: 0, vx: 0, vz: 0, initialized: false, last: new THREE.Vector3() }), []);
  const seat = color.main || color;
  const materials = useMemo(() => ({
    shell: shellMaterial(),
    water: waterMaterial(seat),
    cloud: new THREE.MeshStandardMaterial({ color: '#d9dee2', roughness: 1 }),
    cloudBelly: new THREE.MeshStandardMaterial({ color: '#8f99a3', roughness: 1 }),
    drop: new THREE.MeshBasicMaterial({ color: '#e8f3fa', transparent: true, opacity: 0.9 }),
    ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
  }), [seat]);
  const seeds = useMemo(() => Array.from({ length: DROPS }, (_, i) => ({
    x: (((i * 37) % 11) / 11 - 0.5) * 0.42,
    z: (((i * 53) % 7) / 7 - 0.5) * 0.24,
    o: i / DROPS,
  })), []);
  const top = 0.34;
  const bottom = LEVEL + 0.01;

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05);
    if (anchor?.current && root.current) {
      anchor.current.getWorldPosition(_world);
      root.current.position.copy(_world);
      if (step > 0) {
        if (!state.initialized) {
          state.last.copy(_world);
          state.initialized = true;
        } else {
          const dx = (_world.x - state.last.x) / step / size;
          const dz = (_world.z - state.last.z) / step / size;
          state.vx += (dz * 0.05 - state.x * 60 - state.vx * 7) * step;
          state.vz += (-dx * 0.05 - state.z * 60 - state.vz * 7) * step;
          state.x += state.vx * step;
          state.z += state.vz * step;
          state.last.copy(_world);
        }
      }
    }
    if (contents.current) contents.current.rotation.set(THREE.MathUtils.clamp(state.x, -0.35, 0.35), 0, THREE.MathUtils.clamp(state.z, -0.35, 0.35));
    const t = clock.elapsedTime * 1.6;
    seeds.forEach((s, i) => {
      const p = (t + s.o) % 1;
      const drop = drops.current[i];
      if (drop) drop.position.y = (top - (top - bottom) * Math.min(1, p / 0.7)) * size;
      if (drop) drop.visible = p < 0.7;
      const ring = rings.current[i];
      if (ring) {
        const k = Math.max(0, (p - 0.7) / 0.3);
        ring.visible = p >= 0.7;
        ring.scale.setScalar(size * (0.02 + k * 0.12));
        ring.material.opacity = 0.7 * (1 - k);
      }
    });
  });

  return (
    <group ref={root}>
      <group ref={contents}>
        <mesh material={materials.water} scale={size * 0.95} renderOrder={1}>
          <sphereGeometry args={[1, 48, 32]} />
        </mesh>
        <group position={[0, size * 0.48, 0]}>
          {PUFFS.map(([x, y, z, r], i) => (
            <mesh key={i} position={[x * size, y * size, z * size]} scale={r * size} material={i < 5 ? materials.cloud : materials.cloudBelly}>
              <sphereGeometry args={[1, 16, 12]} />
            </mesh>
          ))}
        </group>
        {seeds.map((s, i) => (
          <mesh key={i} ref={(m) => { drops.current[i] = m; }} position={[s.x * size, 0, s.z * size]} material={materials.drop} scale={[size, size, size]}>
            <cylinderGeometry args={[0.008, 0.008, 0.09, 4]} />
          </mesh>
        ))}
        {seeds.map((s, i) => (
          <mesh key={`r${i}`} ref={(m) => { rings.current[i] = m; }} position={[s.x * size, (LEVEL + 0.005) * size * 0.95, s.z * size]} rotation-x={-Math.PI / 2} material={materials.ring.clone()} renderOrder={2}>
            <ringGeometry args={[0.8, 1, 24]} />
          </mesh>
        ))}
      </group>
      <mesh material={materials.shell} scale={size} renderOrder={3}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
    </group>
  );
}

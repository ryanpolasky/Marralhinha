import { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { idle } from './Board';

const PROBE_GEO = new THREE.PlaneGeometry(1, 1);
const PROBE_MAP = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
PROBE_MAP.needsUpdate = true;

// Program variants that otherwise compile for the first time mid-game: name tags, the die/ghost labels,
// the invisible pick meshes, the turn gem and the burst particles
export const probeMaterials = () => [
  new THREE.SpriteMaterial({ map: PROBE_MAP, transparent: true }),
  new THREE.SpriteMaterial({ map: PROBE_MAP, transparent: true, toneMapped: false }),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  new THREE.MeshPhysicalMaterial({ roughness: 0.1, clearcoat: 1, flatShading: true }),
  new THREE.MeshBasicMaterial({ toneMapped: false }),
];

export const buildProbes = (materials) => {
  const scratch = new THREE.Scene();
  materials.forEach((m, i) => {
    let probe;
    if (m.isSpriteMaterial) probe = new THREE.Sprite(m);
    else if (i === materials.length - 1) {
      probe = new THREE.InstancedMesh(PROBE_GEO, m, 1);
      probe.setColorAt(0, new THREE.Color(1, 1, 1));
    } else {
      probe = new THREE.Mesh(PROBE_GEO, m);
      probe.castShadow = true;
    }
    scratch.add(probe);
  });
  return scratch;
};

// Disposing a probe material would release its program from the cache, so the probes stay alive
const probes = new WeakMap();

export default function StaticWarmer() {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    if (probes.has(gl)) return undefined;
    let alive = true;
    const run = () => {
      if (!alive) return;
      const scratch = buildProbes(probeMaterials());
      probes.set(gl, scratch);
      gl.compile(scratch, camera, scene);
    };
    const handle = idle(run);
    return () => {
      alive = false;
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
      else clearTimeout(handle);
    };
  }, [gl, camera, scene]);
  return null;
}

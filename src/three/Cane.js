import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';

const REACH = 9;
const IN = 0.4;
const HOLD = 0.05;
const OUT = 0.32;

const caneCurve = () => {
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(REACH, 0.5, 0), new THREE.Vector3(0.38, 0.5, 0)));
  path.add(new THREE.CubicBezierCurve3(new THREE.Vector3(0.38, 0.5, 0), new THREE.Vector3(0.38, 1.0, 0), new THREE.Vector3(-0.42, 1.0, 0), new THREE.Vector3(-0.42, 0.45, 0)));
  path.add(new THREE.LineCurve3(new THREE.Vector3(-0.42, 0.45, 0), new THREE.Vector3(-0.36, 0.12, 0)));
  return path;
};

const ease = (k) => 1 - (1 - k) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export default function Cane({ bus = fx }) {
  const group = useRef();
  const state = useRef({ alive: false, t: 0, side: 1, at: [0, 0, 0] });
  const geometry = useMemo(() => new THREE.TubeGeometry(caneCurve(), 160, 0.06, 12, false), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a2a14', roughness: 0.35, metalness: 0.1 }), []);
  const tip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8c35c', roughness: 0.25, metalness: 0.9 }), []);
  useEffect(() => bus.on((type, d) => {
    if (type !== 'cane') return;
    Object.assign(state.current, { alive: true, t: 0, side: d.side || 1, at: d.position });
  }), [bus]);
  useFrame((_, dt) => {
    const s = state.current;
    const g = group.current;
    g.visible = s.alive;
    if (!s.alive) return;
    s.t += Math.min(dt, 0.05);
    const t = s.t;
    const off = t < IN ? (1 - ease(t / IN)) * REACH : t < IN + HOLD ? 0 : easeInOut(Math.min(1, (t - IN - HOLD) / OUT)) * REACH;
    if (t > IN + HOLD + OUT) s.alive = false;
    g.position.set(s.at[0] + s.side * off, s.at[1] - 0.33, s.at[2]);
    g.scale.set(s.side, 1, 1);
  });
  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={material} castShadow />
      <mesh position={[REACH, 0.5, 0]} material={tip}>
        <sphereGeometry args={[0.08, 12, 8]} />
      </mesh>
    </group>
  );
}

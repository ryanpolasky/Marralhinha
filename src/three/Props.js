import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';

export const ANVIL = { drop: 0.42, hold: 0.95, lift: 0.3 };
export const CLAW = [[0, 6, 0, 1], [0.5, 0, 0, 1], [0.65, 0, 0, 0], [1.15, 2.2, 0, 0], [1.3, 2.2, 0.15, 0], [1.45, 2.2, -0.15, 0], [1.55, 2.2, 0, 1], [2.0, 2.2, 0, 1], [2.4, 0, 0, 1], [2.55, 0, 0, 0], [3.15, 6.5, 0, 0]];

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (k) => Math.min(1, Math.max(0, k));

function useProp(bus, type) {
  const state = useRef({ alive: false, t: 0, at: [0, 0, 0] });
  useEffect(() => bus.on((kind, d) => {
    if (kind === type) Object.assign(state.current, { alive: true, t: 0, at: d.position });
  }), [bus, type]);
  return state;
}

const iron = new THREE.MeshStandardMaterial({ color: '#3a3e45', metalness: 0.7, roughness: 0.42 });

function Anvil({ bus }) {
  const g = useRef();
  const s = useProp(bus, 'anvil');
  const horn = useMemo(() => new THREE.ConeGeometry(0.17, 0.5, 16).rotateZ(-Math.PI / 2), []);
  useFrame((_, dt) => {
    const st = s.current;
    g.current.visible = st.alive;
    if (!st.alive) return;
    st.t += Math.min(dt, 0.05);
    const { drop, hold, lift } = ANVIL;
    const t = st.t;
    let y = 0;
    if (t < drop) y = 7 * (1 - (t / drop) ** 2);
    else if (t < drop + 0.18) y = Math.sin(((t - drop) / 0.18) * Math.PI) * 0.12;
    else if (t > drop + hold) y = 9 * clamp01((t - drop - hold) / lift) ** 2;
    if (t > drop + hold + lift) st.alive = false;
    g.current.position.set(st.at[0], 0.05 + y, st.at[2]);
    g.current.rotation.z = t < drop ? 0.25 * (1 - t / drop) : 0;
  });
  return (
    <group ref={g} visible={false} scale={1.3}>
      <mesh material={iron} position={[0, 0.09, 0]} castShadow>
        <boxGeometry args={[0.85, 0.18, 0.6]} />
      </mesh>
      <mesh material={iron} position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.42, 0.26, 0.36]} />
      </mesh>
      <mesh material={iron} position={[-0.08, 0.55, 0]} castShadow>
        <boxGeometry args={[0.8, 0.24, 0.5]} />
      </mesh>
      <mesh material={iron} geometry={horn} position={[0.55, 0.58, 0]} castShadow />
    </group>
  );
}

const chrome = new THREE.MeshStandardMaterial({ color: '#d9dee4', metalness: 1, roughness: 0.22 });
const red = new THREE.MeshStandardMaterial({ color: '#e0283a', metalness: 0.2, roughness: 0.35 });
const PIVOT = 0.42;
const prongCurve = () => new THREE.CatmullRomCurve3([[0.06, 0], [0.3, -0.16], [0.3, -0.5], [0.12, -0.7]].map(([x, y]) => new THREE.Vector3(x, y, 0)));

export const clawAt = (t) => {
  const i = CLAW.findIndex((k) => k[0] > t);
  if (i <= 0) return i === 0 ? CLAW[0] : CLAW[CLAW.length - 1];
  const [t0, ...a] = CLAW[i - 1];
  const [t1, ...b] = CLAW[i];
  const e = easeInOut((t - t0) / (t1 - t0));
  return [t, ...a.map((v, j) => v + (b[j] - v) * e)];
};

function Claw({ bus }) {
  const g = useRef();
  const prongs = useRef([]);
  const s = useProp(bus, 'claw');
  const prong = useMemo(() => new THREE.TubeGeometry(prongCurve(), 24, 0.035, 8, false), []);
  useFrame((_, dt) => {
    const st = s.current;
    g.current.visible = st.alive;
    if (!st.alive) return;
    st.t += Math.min(dt, 0.05);
    const [, y, dx, open] = clawAt(st.t);
    if (st.t > CLAW[CLAW.length - 1][0]) st.alive = false;
    g.current.position.set(st.at[0] + dx, st.at[1] + y, st.at[2]);
    prongs.current.forEach((p) => p && (p.rotation.z = 0.15 + open * 0.55));
  });
  return (
    <group ref={g} visible={false}>
      <mesh material={chrome} position={[0, PIVOT + 5, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 10, 6]} />
      </mesh>
      <mesh material={red} position={[0, PIVOT + 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.22, 20]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <group key={i} rotation-y={(i / 3) * Math.PI * 2}>
          <group ref={(el) => (prongs.current[i] = el)} position={[0, PIVOT, 0]}>
            <mesh geometry={prong} material={chrome} castShadow />
          </group>
        </group>
      ))}
    </group>
  );
}

export default function Props({ bus = fx }) {
  return (
    <>
      <Anvil bus={bus} />
      <Claw bus={bus} />
    </>
  );
}

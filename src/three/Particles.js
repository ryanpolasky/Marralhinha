import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';

const MAX = 600;
const GRAVITY = -9;

export default function Particles({ bus = fx }) {
  const mesh = useRef();
  const pool = useMemo(
    () =>
      Array.from({ length: MAX }, () => ({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.1,
        spin: 0,
        gravity: 1,
      })),
    []
  );
  const cursor = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const burst = ({ position, colors, count = 40, speed = 4, up = 3, life = 0.9, size = 0.1, gravity = 1, spread = 1, radius = 0, inward = false }) => {
      for (let i = 0; i < count; i++) {
        const index = cursor.current;
        const p = pool[index];
        cursor.current = (index + 1) % MAX;
        const theta = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.6) * (inward ? -1 : 1);
        p.alive = true;
        p.pos.set(position[0] + Math.cos(theta) * radius + (Math.random() - 0.5) * 0.2 * spread, position[1], position[2] + Math.sin(theta) * radius + (Math.random() - 0.5) * 0.2 * spread);
        p.vel.set(Math.cos(theta) * s * spread, up * (0.5 + Math.random()), Math.sin(theta) * s * spread);
        p.life = 0;
        p.maxLife = life * (0.6 + Math.random() * 0.6);
        p.size = size * (0.6 + Math.random() * 0.8);
        p.spin = Math.random() * 10;
        p.gravity = gravity;
        mesh.current.setColorAt(index, color.set(colors[i % colors.length]));
      }
      mesh.current.instanceColor.needsUpdate = true;
    };
    return bus.on((type, data) => type === 'burst' && burst(data));
  }, [pool, color, bus]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    pool.forEach((p, i) => {
      if (p.alive) {
        p.life += dt;
        if (p.life >= p.maxLife) p.alive = false;
        p.vel.y += GRAVITY * p.gravity * dt;
        p.vel.multiplyScalar(1 - dt * 1.2);
        p.pos.addScaledVector(p.vel, dt);
      }
      const k = p.alive ? 1 - p.life / p.maxLife : 0;
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.spin + p.life * 8, p.spin * 2 + p.life * 6, 0);
      dummy.scale.setScalar(p.size * k);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, MAX]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

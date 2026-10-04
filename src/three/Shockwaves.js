import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';

const MAX_RINGS = 12;
const MAX_BEAMS = 6;

// Pooled expanding rings on the board surface and vertical light beams, fed by kill-effect events
export default function Shockwaves({ bus = fx }) {
  const rings = useMemo(() => Array.from({ length: MAX_RINGS }, () => ({ alive: false, t: 0, life: 0.6, size: 2 })), []);
  const beams = useMemo(() => Array.from({ length: MAX_BEAMS }, () => ({ alive: false, t: 0, life: 0.35, size: 1, height: 4 })), []);
  const ringMeshes = useRef([]);
  const beamMeshes = useRef([]);

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type === 'ring') {
          const p = rings.find((r) => !r.alive) || rings[0];
          Object.assign(p, { alive: true, t: -(d.delay || 0), life: d.life || 0.6, size: d.size || 2 });
          const mesh = ringMeshes.current[rings.indexOf(p)];
          if (mesh) {
            mesh.position.set(d.position[0], d.position[1] ?? 0.07, d.position[2]);
            mesh.material.color.set(d.color || '#ffffff');
          }
        } else if (type === 'beam') {
          const p = beams.find((b) => !b.alive) || beams[0];
          Object.assign(p, { alive: true, t: -(d.delay || 0), life: d.life || 0.35, size: d.size || 1, height: d.height || 4 });
          const mesh = beamMeshes.current[beams.indexOf(p)];
          if (mesh) {
            mesh.position.set(d.position[0], (d.position[1] || 0) + p.height / 2, d.position[2]);
            mesh.material.color.set(d.color || '#ffffff');
          }
        }
      }),
    [rings, beams, bus]
  );

  useFrame((_, dt) => {
    rings.forEach((p, i) => {
      const mesh = ringMeshes.current[i];
      if (!mesh) return;
      if (p.alive) {
        p.t += dt;
        if (p.t >= p.life) p.alive = false;
      }
      const k = Math.max(0, Math.min(1, p.t / p.life));
      mesh.visible = p.alive && p.t >= 0;
      if (mesh.visible) {
        mesh.scale.setScalar(0.25 + (1 - (1 - k) ** 3) * p.size);
        mesh.material.opacity = (1 - k) * 0.9;
      }
    });
    beams.forEach((p, i) => {
      const mesh = beamMeshes.current[i];
      if (!mesh) return;
      if (p.alive) {
        p.t += dt;
        if (p.t >= p.life) p.alive = false;
      }
      const k = Math.max(0, Math.min(1, p.t / p.life));
      mesh.visible = p.alive && p.t >= 0;
      if (mesh.visible) {
        mesh.scale.set(p.size * (1 - k * 0.7), p.height / 4, p.size * (1 - k * 0.7));
        mesh.material.opacity = (1 - k) * 0.8;
      }
    });
  });

  return (
    <group>
      {rings.map((_, i) => (
        <mesh key={i} ref={(m) => (ringMeshes.current[i] = m)} rotation-x={-Math.PI / 2} visible={false}>
          <ringGeometry args={[0.8, 1, 48]} />
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} opacity={0} />
        </mesh>
      ))}
      {beams.map((_, i) => (
        <mesh key={`b${i}`} ref={(m) => (beamMeshes.current[i] = m)} visible={false}>
          <cylinderGeometry args={[1, 1, 4, 20, 1, true]} />
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} opacity={0} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

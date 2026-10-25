import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { clearOfPlay } from './minecraft';
import { makeCanvas, seeded } from './textures';

const ORB = new THREE.IcosahedronGeometry(1, 1);
const STEM = new THREE.CylinderGeometry(0.65, 1, 1, 7);
const BLADE = new THREE.ConeGeometry(0.12, 0.7, 3);

export function routeScenery(layout) {
  const rand = seeded(151);
  const trees = [];
  const grass = [];
  const flowers = [];
  const rocks = [];
  const extent = layout.spec.halfLength + 2.6;
  const sign = { x: layout.spec.halfWidth + 1.35, z: -layout.spec.halfLength - 2.4 };
  const nearSign = (x, z, radius) => Math.abs(x - sign.x) < 0.9 + radius && Math.abs(z - sign.z) < 0.3 + radius;
  for (let i = 0; i < 800; i++) {
    const x = (rand() * 2 - 1) * extent;
    const z = (rand() * 2 - 1) * extent;
    const size = 0.7 + rand() * 0.35;
    if (trees.length < 18 && !nearSign(x, z, size) && clearOfPlay(layout, x, z, size + 0.2) && trees.every((t) => Math.hypot(t.x - x, t.z - z) > t.size + size + 0.25)) {
      trees.push({ x, z, size, phase: rand() * Math.PI * 2 });
    }
  }
  for (let i = 0; i < 900; i++) {
    const x = (rand() * 2 - 1) * extent;
    const z = (rand() * 2 - 1) * extent;
    if (!clearOfPlay(layout, x, z, 0.34) || nearSign(x, z, 0.34) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < t.size * 0.85)) continue;
    if (i % 9 === 0) rocks.push({ x, z, size: 0.18 + rand() * 0.13 });
    else if (i % 3 === 0) flowers.push({ x, z, size: 0.08 + rand() * 0.045 });
    else grass.push({ x, z, size: 0.45 + rand() * 0.5, phase: rand() * Math.PI * 2 });
  }
  return { trees, grass, flowers, rocks, sign };
}

function Instances({ entries, geometry, color, transform, animate }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const motion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  const lastTime = useRef(0);
  useLayoutEffect(() => {
    entries.forEach((entry, i) => {
      transform(dummy, entry, i, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
      ref.current.setColorAt(i, new THREE.Color(color[i % color.length]));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [entries, dummy, color, transform]);
  useFrame(({ clock }) => {
    if (!animate || ref.current.parent?.parent?.visible === false) return;
    const t = motion?.matches ? 0 : clock.elapsedTime;
    if (t === lastTime.current) return;
    lastTime.current = t;
    entries.forEach((entry, i) => {
      transform(dummy, entry, i, t);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[geometry, null, entries.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.92} />
    </instancedMesh>
  );
}

const TRUNKS = ['#76604a', '#65553f'];
const LEAVES = ['#38765c', '#428765', '#58956a'];
const GRASS = ['#548c4b', '#78a557', '#8cba68'];
const FLOWERS = ['#ffe7a0', '#e8b0bb', '#f9f3d4'];
const ROCKS = ['#89958a', '#a7ad95'];
const trunk = (d, e) => {
  d.position.set(e.x, e.size * 0.5, e.z);
  d.scale.set(e.size * 0.2, e.size, e.size * 0.2);
  d.rotation.set(0, e.phase, 0);
};
const crown = (d, e, i, t) => {
  d.position.set(e.x, e.size * 1.6, e.z);
  d.scale.set(e.size, e.size * 1.05, e.size);
  d.rotation.set(0.02 * Math.sin(t * 0.8 + e.phase), e.phase, 0.025 * Math.sin(t + e.phase));
};
const blade = (d, e, i, t) => {
  d.position.set(e.x, e.size * 0.3, e.z);
  d.scale.set(e.size, e.size, e.size);
  d.rotation.set(0.12 * Math.sin(t * 1.3 + e.phase), e.phase, 0.2 * Math.sin(t + e.phase));
};
const flower = (d, e) => {
  d.position.set(e.x, 0.18, e.z);
  d.scale.set(e.size * 1.3, e.size * 0.5, e.size * 1.3);
  d.rotation.set(0, e.x, 0);
};
const rock = (d, e) => {
  d.position.set(e.x, e.size * 0.35, e.z);
  d.scale.set(e.size, e.size * 0.7, e.size * 0.85);
  d.rotation.set(0.2, e.x, 0.3);
};

export default function WildProps({ layout, y = 0 }) {
  const scenery = useMemo(() => routeScenery(layout), [layout]);
  const sign = useMemo(() => {
    const [canvas, ctx] = makeCanvas(256, 128);
    ctx.fillStyle = '#f4e9be';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#42634c';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 244, 116);
    ctx.fillStyle = '#294b3b';
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('ROUTE 01', 128, 56);
    ctx.font = '18px sans-serif';
    ctx.fillText('WILD ENCOUNTERS', 128, 91);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  return (
    <group position-y={y}>
      <Instances entries={scenery.trees} geometry={STEM} color={TRUNKS} transform={trunk} />
      <Instances entries={scenery.trees} geometry={ORB} color={LEAVES} transform={crown} animate />
      <Instances entries={scenery.grass} geometry={BLADE} color={GRASS} transform={blade} animate />
      <Instances entries={scenery.flowers} geometry={ORB} color={FLOWERS} transform={flower} />
      <Instances entries={scenery.rocks} geometry={ORB} color={ROCKS} transform={rock} />
      <group position={[scenery.sign.x, 0, scenery.sign.z]} rotation-y={-0.15}>
        <mesh position-y={0.6} castShadow>
          <boxGeometry args={[0.13, 1.2, 0.13]} />
          <meshStandardMaterial color="#76604a" roughness={0.9} />
        </mesh>
        <mesh position-y={1.15} castShadow>
          <boxGeometry args={[1.5, 0.75, 0.13]} />
          <meshStandardMaterial color="#42634c" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.15, 0.071]}>
          <planeGeometry args={[1.46, 0.71]} />
          <meshStandardMaterial map={sign} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

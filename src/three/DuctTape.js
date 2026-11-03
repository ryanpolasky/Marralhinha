import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { makeCanvas, seeded } from './textures';

const ARM = 0.8;
const HALF_W = 0.21;

const tapeTexture = () => {
  const [canvas, ctx] = makeCanvas(512, 128);
  if (!ctx) return null;
  const rand = seeded(4021);
  ctx.fillStyle = '#9fa4a7';
  ctx.fillRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.05})`;
    ctx.fillRect(x, 0, 1, 128);
  }
  for (let y = 0; y < 128; y += 4) {
    ctx.fillStyle = `rgba(40,44,48,${0.05 + rand() * 0.05})`;
    ctx.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 7; i++) {
    const x = rand() * 512;
    ctx.strokeStyle = `rgba(30,34,38,${0.18 + rand() * 0.15})`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rand() - 0.5) * 60, 128);
    ctx.stroke();
  }
  const edge = ctx.createLinearGradient(0, 0, 0, 128);
  edge.addColorStop(0, 'rgba(30,34,38,0.35)');
  edge.addColorStop(0.08, 'rgba(30,34,38,0)');
  edge.addColorStop(0.92, 'rgba(30,34,38,0)');
  edge.addColorStop(1, 'rgba(30,34,38,0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 512, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

export const TAPE_MATERIAL = new THREE.MeshStandardMaterial({ map: tapeTexture(), roughness: 0.48, metalness: 0.55, side: THREE.DoubleSide });
const beadTexture = (streak) => {
  const [canvas, ctx] = makeCanvas(128, 128);
  if (!ctx) return null;
  if (streak) {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(0,10,30,0)');
    g.addColorStop(0.5, 'rgba(0,10,30,0.22)');
    g.addColorStop(1, 'rgba(0,10,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  } else {
    const g = ctx.createRadialGradient(60, 58, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,10,30,0.3)');
    g.addColorStop(0.75, 'rgba(0,10,30,0.42)');
    g.addColorStop(0.92, 'rgba(0,10,30,0.2)');
    g.addColorStop(1, 'rgba(0,10,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const c = ctx.createRadialGradient(76, 84, 4, 70, 76, 40);
    c.addColorStop(0, 'rgba(255,255,255,0.45)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(46, 42, 14, 9, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

export const SEEP_MATERIAL = new THREE.MeshBasicMaterial({ map: beadTexture(false), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const STREAK_MATERIAL = new THREE.MeshBasicMaterial({ map: beadTexture(true), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });

const strip = (angle, radius, peel, seed) => {
  const rand = seeded(seed);
  const g = new THREE.PlaneGeometry(ARM * 2, HALF_W * 2, 32, 4);
  const p = g.attributes.position;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const v = new THREE.Vector3();
  const tears = Array.from({ length: 5 }, () => [(rand() - 0.5) * 0.14, (rand() - 0.5) * 0.14]);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    const row = Math.round((y / HALF_W + 1) * 2);
    if (x > ARM - 1e-4) x += tears[row][0];
    if (x < -ARM + 1e-4) x += tears[row][1];
    const u = x / ARM;
    const lift = peel && u > 0.62 ? ((u - 0.62) / 0.38) ** 2 * 0.045 : 0;
    const wrinkle = Math.sin(x * 23 + y * 7) * 0.003;
    v.set(x * ca - y * sa, 1, x * sa + y * ca).normalize().multiplyScalar(radius + lift + wrinkle);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
};

const STRIPS = [strip(Math.PI / 4, 1.012, false, 7), strip(-Math.PI / 4, 1.022, true, 19)];

export function TapeX({ size }) {
  return (
    <group scale={size}>
      {STRIPS.map((g, i) => <mesh key={i} geometry={g} material={TAPE_MATERIAL} castShadow />)}
    </group>
  );
}

const SEEPS = [
  { az: 0.09, period: 3.4, offset: 0 },
  { az: Math.PI + 0.09, period: 4.7, offset: 1.9 },
  { az: -0.1, period: 5.3, offset: 3.1 },
];
const BEAD_GEO = new THREE.CircleGeometry(1, 20);
const _n = new THREE.Vector3();
const _east = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();

const stick = (mesh, theta, az, radius) => {
  _n.set(Math.sin(theta) * Math.sin(az), Math.cos(theta), Math.sin(theta) * Math.cos(az));
  _east.set(Math.cos(az), 0, -Math.sin(az));
  _up.crossVectors(_n, _east);
  mesh.position.copy(_n).multiplyScalar(radius);
  mesh.quaternion.setFromRotationMatrix(_m.makeBasis(_east, _up, _n));
};

export function Seep({ size, seed = 0 }) {
  const beads = useRef([]);
  const streaks = useRef([]);
  useFrame(({ clock }) => {
    SEEPS.forEach((s, i) => {
      const bead = beads.current[i];
      const streak = streaks.current[i];
      if (!bead || !streak) return;
      const p = ((clock.elapsedTime + s.offset + seed * 1.37) % s.period) / s.period;
      const grow = Math.min(1, p / 0.3);
      const slide = THREE.MathUtils.clamp((p - 0.3) / 0.6, 0, 1);
      const start = 0.55;
      const theta = start + slide * slide * 0.85;
      const r = size * 0.075 * grow;
      stick(bead, theta, s.az, size * 1.004);
      bead.scale.set(r * 0.85, r * (1 + slide * 0.6), 1);
      bead.visible = p < 0.9;
      const len = (theta - start) * size;
      stick(streak, (start + theta) / 2, s.az, size * 1.003);
      streak.scale.set(size * 0.035, Math.max(0.001, len / 2), 1);
      streak.visible = len > 0.001;
      streak.material.opacity = 1 * (1 - THREE.MathUtils.clamp((p - 0.8) / 0.2, 0, 1));
    });
  });
  return SEEPS.map((s, i) => (
    <React.Fragment key={i}>
      <mesh ref={(m) => { streaks.current[i] = m; }} geometry={BEAD_GEO} material={STREAK_MATERIAL.clone()} renderOrder={2} />
      <mesh ref={(m) => { beads.current[i] = m; }} geometry={BEAD_GEO} material={SEEP_MATERIAL} renderOrder={3} />
    </React.Fragment>
  ));
}

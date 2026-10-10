import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { makeCanvas, seeded } from './textures';
import { basketCanvas } from './skins';

const TAU = Math.PI * 2;
const GROUND = 0.025;

const texCache = new Map();
const tex = (key, draw, repeat = null) => {
  if (!texCache.has(key)) {
    const t = new THREE.CanvasTexture(draw());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    texCache.set(key, t);
  }
  return texCache.get(key);
};

const matCache = new Map();
const mat = (key, make) => {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
};
const std = (key, params) => mat(key, () => new THREE.MeshStandardMaterial(params));
const phys = (key, params) => mat(key, () => new THREE.MeshPhysicalMaterial(params));

const GEO = {};
const geo = (key, make) => GEO[key] || (GEO[key] = make());

function mergeGeometries(parts) {
  const out = new THREE.BufferGeometry();
  Object.entries(parts[0].attributes).forEach(([name, attr]) => out.setAttribute(name, new THREE.Float32BufferAttribute(parts.flatMap((p) => Array.from(p.attributes[name].array)), attr.itemSize)));
  let base = 0;
  const index = [];
  parts.forEach((p) => {
    const count = p.attributes.position.count;
    (p.index ? Array.from(p.index.array) : [...Array(count).keys()]).forEach((i) => index.push(i + base));
    base += count;
  });
  out.setIndex(index);
  return out;
}

const limb = (a, b, r) => {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r * 0.7, r, len, 5, 1).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()));
  return g.translate(A.x, A.y, A.z);
};
const blob = (r, [x, y, z], [sx, sy, sz] = [1, 1, 1]) => new THREE.SphereGeometry(r, 12, 8).scale(sx, sy, sz).translate(x, y, z);

// Faces +x, feet on y = 0. aLeg tags each leg with its tripod (+1/-1) so the shader can walk it
function antGeometry() {
  const tag = (g, v) => g.setAttribute('aLeg', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(v), 1));
  const parts = [
    blob(0.075, [-0.11, 0.075, 0], [1.35, 1, 1]),
    blob(0.026, [-0.025, 0.07, 0]),
    blob(0.042, [0.03, 0.07, 0], [1.5, 0.9, 0.9]),
    blob(0.048, [0.115, 0.078, 0], [1.05, 0.95, 1]),
  ].map((p) => tag(p, 0));
  [-1, 1].forEach((s) => {
    [[-0.01, -0.1], [0.03, 0.01], [0.06, 0.12]].forEach(([x0, x1], j) => {
      const knee = [(x0 + x1) / 2, 0.11, s * 0.08];
      const gait = j % 2 ? -s : s;
      parts.push(tag(limb([x0, 0.065, s * 0.02], knee, 0.009), gait), tag(limb(knee, [x1, 0, s * 0.13], 0.008), gait));
    });
    parts.push(tag(limb([0.14, 0.1, s * 0.02], [0.18, 0.17, s * 0.05], 0.006), 0), tag(limb([0.18, 0.17, s * 0.05], [0.25, 0.14, s * 0.09], 0.005), 0));
  });
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// Feet swing most, hips stay put; each instance gets its own step phase
const antMat = (key, speed) =>
  mat(key, () => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#1a0c05', roughness: 0.3, clearcoat: 0.6 });
    m.userData.time = { value: 0 };
    m.customProgramCacheKey = () => `ant-${speed}`;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uAntTime = m.userData.time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uAntTime;\nattribute float aLeg;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float antPh = uAntTime * ${speed.toFixed(1)} + float(gl_InstanceID) * 1.7;
        #else
          float antPh = uAntTime * ${speed.toFixed(1)};
        #endif
        float antW = clamp(1.0 - position.y / 0.11, 0.0, 1.0) * abs(aLeg);
        transformed.x += sign(aLeg) * sin(antPh) * 0.03 * antW;
        transformed.y += max(0.0, sign(aLeg) * cos(antPh)) * 0.018 * antW;`
      );
    };
    return m;
  });

const UP = new THREE.Vector3(0, 1, 0);

const SPEED = 0.42;
const GRAB = 1.6;
const NAP = 1.2;
export const LANE = 0.27;
export const WIGGLE = 0.04;
export const SPREAD = 1.6;
const smooth = (k) => k * k * (3 - 2 * k);

// Each ant does a full round trip: out of the hole, a pause at the food to grab a bite and turn around, then home and back down the hole
function Ants({ trails, still }) {
  const ref = useRef();
  const lootRef = useRef();
  const material = antMat('ant', 16);
  const paths = useMemo(
    () =>
      trails.map((t) => {
        const path = new THREE.CatmullRomCurve3(t.pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
        const length = path.getLength();
        const walk = length / SPEED;
        return { ...t, path, length, walk, cycle: 2 * walk + GRAB + NAP, count: t.count ?? Math.max(3, Math.round(length / 4)) };
      }),
    [trails]
  );
  const ants = useMemo(() => {
    const rand = seeded(paths.length * 31 + 7);
    return paths.flatMap((p, ti) =>
      Array.from({ length: p.count }, (_, i) => ({
        ti,
        offset: ((i + rand() * 0.4) / p.count) * p.cycle,
        carry: rand() > 0.15,
        scale: rand() > 0.94 ? SPREAD : 1 + rand() * 0.25,
        wob: rand() * TAU,
      }))
    );
  }, [paths]);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    ants.forEach((a, i) => lootRef.current.setColorAt(i, c.set(paths[a.ti].loot)));
    lootRef.current.instanceColor.needsUpdate = true;
  }, [ants, paths]);
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), pos: new THREE.Vector3(), tan: new THREE.Vector3(), up: new THREE.Vector3(), side: new THREE.Vector3(), fwd: new THREE.Vector3(), s: new THREE.Vector3() }), []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime;
    material.userData.time.value = t;
    const { m, pos, tan, up, side, fwd, s } = scratch;
    ants.forEach((a, i) => {
      const p = paths[a.ti];
      const tau = (t + a.offset) % p.cycle;
      let u = 1;
      let turn = 0;
      if (tau < p.walk) u = tau / p.walk;
      else if (tau < p.walk + GRAB) turn = smooth((tau - p.walk) / GRAB);
      else {
        u = Math.max(0, 1 - (tau - p.walk - GRAB) / p.walk);
        turn = 1;
      }
      p.path.getPointAt(u, pos);
      p.path.getTangentAt(u, tan);
      side.crossVectors(tan, UP).normalize();
      up.crossVectors(side, tan).normalize();
      const wiggle = Math.sin(u * p.length * 3 + a.wob) * WIGGLE * Math.min(1, u * p.length);
      pos.addScaledVector(side, (turn * 2 - 1) * LANE + wiggle).addScaledVector(up, Math.abs(Math.sin(t * 22 + a.wob)) * 0.006);
      fwd.copy(tan).multiplyScalar(Math.cos(Math.PI * turn)).addScaledVector(side, Math.sin(Math.PI * turn));
      side.crossVectors(fwd, up);
      // Shrinks into the hole rather than popping out of existence
      const size = a.scale * Math.min(1, (u * p.length) / 0.35);
      m.makeBasis(fwd, up, side).scale(s.setScalar(size)).setPosition(pos);
      ref.current.setMatrixAt(i, m);
      const loot = a.carry && turn > 0.35 ? p.lootSize ?? 0.055 : 0;
      pos.addScaledVector(up, (0.17 + loot * 0.6) * size).addScaledVector(fwd, 0.1 * size);
      m.makeBasis(fwd, up, side).scale(s.setScalar(loot * Math.min(size, 1.15))).setPosition(pos);
      lootRef.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    lootRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={ref} args={[geo('ant', antGeometry), material, ants.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={lootRef} args={[geo('crumb', () => new THREE.IcosahedronGeometry(1, 0)), std('crumb', { roughness: 0.6 }), ants.length]} castShadow frustumCulled={false} />
    </>
  );
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.026 : 0.06;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false }).translate(0, 0, -0.0075);
}

const DROPS = 7;
const KICK = 1.7;

// Lies in the wine on its back, legs flailing, seeing stars, kicking up splashes
function DrunkAnt({ position, still }) {
  const ant = useRef();
  const stars = useRef();
  const drops = useRef([]);
  const ripple = useRef();
  const material = antMat('drunk-ant', 9);
  const spray = useMemo(() => {
    const rand = seeded(42);
    return Array.from({ length: DROPS }, () => ({ a: rand() * TAU, v: 0.35 + rand() * 0.35, up: 1 + rand() * 0.6, lag: rand() * 0.12, r: 0.018 + rand() * 0.018 }));
  }, []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime;
    material.userData.time.value = t;
    ant.current.rotation.set(Math.PI + Math.sin(t * 2.3) * 0.25, t * 0.4, Math.sin(t * 3.1) * 0.12);
    stars.current.rotation.y = t * 2.2;
    stars.current.children.forEach((star, i) => {
      star.rotation.y = -t * 2.2;
      star.rotation.z = t * 3 + i;
      star.position.y = Math.sin(t * 4 + i * 2.1) * 0.025;
    });
    const k = still?.matches ? 1 : (t % KICK) / KICK;
    drops.current.forEach((d, i) => {
      const sp = spray[i];
      const tau = (k * KICK - sp.lag) / 0.55;
      d.visible = tau > 0 && tau < 1;
      if (!d.visible) return;
      d.position.set(Math.cos(sp.a) * sp.v * tau * 0.55, 0.06 + sp.up * tau * 0.55 - 2.4 * (tau * 0.55) ** 2, Math.sin(sp.a) * sp.v * tau * 0.55);
      d.scale.setScalar(sp.r * (1 - tau * 0.5));
    });
    ripple.current.scale.setScalar(0.08 + k * 0.55);
    ripple.current.material.opacity = 0.55 * (1 - k) ** 1.5;
  });
  return (
    <group position={position}>
      <mesh ref={ant} position-y={0.16} geometry={geo('ant', antGeometry)} material={material} scale={1.1} castShadow />
      <group ref={stars} position-y={0.42}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * TAU) / 3) * 0.2, 0, Math.sin((i * TAU) / 3) * 0.2]} geometry={geo('star', starGeometry)} material={std('dizzy', { color: '#ffd84a', emissive: '#ffb800', emissiveIntensity: 0.6, roughness: 0.4 })} />
        ))}
      </group>
      {spray.map((_, i) => (
        <mesh key={i} ref={(m) => (drops.current[i] = m)} visible={false} geometry={geo('drop', () => new THREE.SphereGeometry(1, 8, 6))} material={phys('drop', { color: '#5a0a1a', roughness: 0.05, clearcoat: 1 })} />
      ))}
      <mesh ref={ripple} position-y={0.006} rotation-x={-Math.PI / 2} geometry={geo('ripple', () => new THREE.RingGeometry(0.85, 1, 32))} material={std('ripple', { color: '#c0405a', transparent: true, depthWrite: false, roughness: 0.2 })} />
    </group>
  );
}

function salamiCanvas() {
  const [c, g] = makeCanvas(128, 128);
  const rand = seeded(5);
  g.fillStyle = '#8a1a26';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = rand() > 0.3 ? 'rgba(250,225,215,0.9)' : 'rgba(60,8,14,0.6)';
    g.beginPath();
    g.ellipse(rand() * 128, rand() * 128, 1.5 + rand() * 3, 1 + rand() * 2.5, rand() * TAU, 0, TAU);
    g.fill();
  }
  g.strokeStyle = '#5a0e16';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 61, 0, TAU);
  g.stroke();
  return c;
}

function crackerCanvas() {
  const [c, g] = makeCanvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  gr.addColorStop(0, '#f0c47a');
  gr.addColorStop(0.85, '#e0a85a');
  gr.addColorStop(1, '#b97a35');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(120,70,20,0.55)';
  for (let x = 28; x <= 100; x += 18) {
    for (let y = 28; y <= 100; y += 18) {
      if (Math.hypot(x - 64, y - 64) < 44) {
        g.beginPath();
        g.arc(x, y, 2.4, 0, TAU);
        g.fill();
      }
    }
  }
  return c;
}

function Charcuterie({ position, scale = 1 }) {
  const salami = std('salami', { map: tex('salami', salamiCanvas), roughness: 0.45 });
  const cracker = std('cracker', { map: tex('cracker', crackerCanvas), roughness: 0.8 });
  const cheese = std('cube-cheese', { color: '#f3d36b', roughness: 0.6 });
  const cubes = useMemo(() => {
    const out = [];
    [[3, 0], [2, 1], [1, 2]].forEach(([n, layer]) => {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([(i - (n - 1) / 2) * 0.19, 0.2 + layer * 0.18, (j - (n - 1) / 2) * 0.19]);
    });
    return out;
  }, []);
  return (
    <group position={position} scale={scale}>
      <mesh position-y={0.07} geometry={geo('cboard', () => new THREE.CylinderGeometry(1.5, 1.55, 0.13, 48))} material={std('cboard', { color: '#a8703c', roughness: 0.55 })} castShadow receiveShadow />
      {Array.from({ length: 9 }, (_, i) => {
        const a = 0.2 + i * 0.32;
        return (
          <mesh key={`s${i}`} position={[Math.cos(a) * 0.95, 0.155 + i * 0.012, Math.sin(a) * 0.95]} rotation={[0.12, -a, 0.18]} geometry={geo('salami', () => new THREE.CylinderGeometry(0.27, 0.27, 0.03, 24))} material={salami} castShadow />
        );
      })}
      {Array.from({ length: 7 }, (_, i) => {
        const a = 3.4 + i * 0.3;
        return (
          <mesh key={`c${i}`} position={[Math.cos(a) * 0.98, 0.155 + i * 0.014, Math.sin(a) * 0.98]} rotation={[-0.14, -a, 0.2]} geometry={geo('cracker', () => new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20))} material={cracker} castShadow />
        );
      })}
      <group position={[0.15, 0, -0.1]} rotation-y={0.5}>
        {cubes.map((p, i) => (
          <mesh key={`q${i}`} position={p} geometry={geo('qcube', () => new THREE.BoxGeometry(0.17, 0.17, 0.17))} material={cheese} castShadow />
        ))}
      </group>
    </group>
  );
}

function labelCanvas() {
  const [c, g] = makeCanvas(512, 128);
  g.fillStyle = '#f2e6c8';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#7a1022';
  g.fillRect(0, 10, 512, 6);
  g.fillRect(0, 112, 512, 6);
  g.font = '700 54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('VINHO', 128, 62);
  g.fillText('VINHO', 384, 62);
  return c;
}

const BOTTLE = [[0, 0], [0.32, 0], [0.34, 0.05], [0.34, 1.1], [0.3, 1.32], [0.14, 1.56], [0.11, 1.64], [0.11, 2.0], [0.135, 2.02], [0.135, 2.1], [0.06, 2.1]];
const GLASS = [[0, 0], [0.27, 0], [0.28, 0.02], [0.05, 0.04], [0.025, 0.08], [0.025, 0.45], [0.06, 0.5], [0.2, 0.58], [0.27, 0.72], [0.26, 0.88], [0.22, 1.0]];
const WINE = [[0, 0.47], [0.1, 0.5], [0.22, 0.6], [0.26, 0.7], [0, 0.7]];
const lathe = (pts, n = 28) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), n);

function puddleGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU;
    const r = 1 + 0.2 * Math.sin(3 * a + 1) + 0.1 * Math.sin(5 * a + 2) + 0.06 * Math.sin(9 * a);
    const p = [Math.cos(a) * r * 1.15, Math.sin(a) * r * 0.85];
    if (i) shape.lineTo(...p);
    else shape.moveTo(...p);
  }
  const drips = [[1.55, 0.5, 0.14], [-1.25, -0.8, 0.1], [0.4, -1.15, 0.08]].map(([x, y, r]) => new THREE.ShapeGeometry(new THREE.Shape().absarc(x, y, r, 0, TAU, false), 12));
  const g = mergeGeometries([new THREE.ShapeGeometry(shape), ...drips]);
  return g.rotateX(-Math.PI / 2);
}

function Wine({ position, still, scale = 1 }) {
  const wine = phys('wine', { color: '#4a0614', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.05 });
  return (
    <group position={position} scale={scale}>
      <mesh position={[-0.15, 0.012, -1.4]} geometry={geo('puddle', puddleGeometry)} material={phys('puddle', { color: '#4a0614', roughness: 0.03, clearcoat: 1, polygonOffset: true, polygonOffsetFactor: -2 })} receiveShadow />
      <group position={[0.15, 0.34, 1.3]} rotation={[-Math.PI / 2, 0, 0.15]}>
        <mesh geometry={geo('bottle', () => lathe(BOTTLE))} material={phys('bottle', { color: '#1d4a22', roughness: 0.12, clearcoat: 1 })} castShadow />
        <mesh position-y={0.62} geometry={geo('label', () => new THREE.CylinderGeometry(0.345, 0.345, 0.56, 28, 1, true))} material={std('label', { map: tex('label', labelCanvas), roughness: 0.8 })} />
      </group>
      <mesh position={[0.75, 0.07, -0.25]} rotation={[0, 0.6, Math.PI / 2]} geometry={geo('cork', () => new THREE.CylinderGeometry(0.1, 0.1, 0.3, 14))} material={std('cork', { color: '#c49a63', roughness: 0.9 })} castShadow />
      <group position={[1.15, 0, 0.35]}>
        <mesh geometry={geo('glass', () => lathe(GLASS, 32))} material={phys('glass', { color: '#ffffff', roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })} renderOrder={2} />
        <mesh geometry={geo('glasswine', () => lathe(WINE, 32))} material={wine} renderOrder={1} />
      </group>
      <DrunkAnt position={[-0.3, 0.01, -1.5]} still={still} />
    </group>
  );
}

function sectorGeometry(r0, r1, angle, depth) {
  const s = new THREE.Shape();
  if (r0 > 0) {
    s.absarc(0, 0, r1, -angle / 2, angle / 2, false);
    s.absarc(0, 0, r0, angle / 2, -angle / 2, true);
  } else {
    s.moveTo(0, 0);
    s.absarc(0, 0, r1, -angle / 2, angle / 2, false);
    s.lineTo(0, 0);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 20 }).rotateX(-Math.PI / 2);
}

const MELON_R = 1.1;
const MELON_A = 1.05;

function melonCanvas() {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  const k = S / (2 * MELON_R);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, MELON_R * k);
  gr.addColorStop(0, '#ff5a64');
  gr.addColorStop(0.8, '#e8323f');
  gr.addColorStop(0.86, '#f39aa0');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const rand = seeded(12);
  [[0.42, 3], [0.66, 4]].forEach(([row, n]) => {
    for (let i = 0; i < n; i++) {
      const r = (row + (rand() - 0.5) * 0.04) * MELON_R;
      const a = ((i + 0.5) / n - 0.5) * MELON_A * 0.6 + (rand() - 0.5) * 0.04;
      g.save();
      g.translate(S / 2 + Math.cos(a) * r * k, S / 2 - Math.sin(a) * r * k);
      g.rotate(-a);
      g.fillStyle = '#1a0d08';
      g.beginPath();
      g.moveTo(-8, 0);
      g.bezierCurveTo(-4, -5, 4, -4.5, 8, 0);
      g.bezierCurveTo(4, 4.5, -4, 5, -8, 0);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-2, -2, 4, 1);
      g.restore();
    }
  });
  return c;
}

function Watermelon({ position, rot = 0, scale = 1 }) {
  const depth = 0.26;
  const flesh = useMemo(() => {
    const t = tex('melon', melonCanvas);
    t.repeat.set(1 / (2 * MELON_R), 1 / (2 * MELON_R));
    t.offset.set(0.5, 0.5);
    return [std('melon-cap', { map: t, roughness: 0.45 }), std('melon-side', { color: '#e8323f', roughness: 0.5 })];
  }, []);
  return (
    <group position={position} rotation-y={rot} scale={scale}>
      <mesh geometry={geo('melon', () => sectorGeometry(0, MELON_R * 0.86, MELON_A, depth))} material={flesh} castShadow receiveShadow />
      <mesh geometry={geo('melon-white', () => sectorGeometry(MELON_R * 0.86, MELON_R * 0.92, MELON_A, depth))} material={std('melon-white', { color: '#f1f0c8', roughness: 0.5 })} castShadow />
      <mesh geometry={geo('melon-rind', () => sectorGeometry(MELON_R * 0.92, MELON_R, MELON_A, depth))} material={std('melon-rind', { color: '#2d6e25', roughness: 0.4 })} castShadow />
    </group>
  );
}

function Sandwich({ position, rot = 0, scale = 1 }) {
  const bread = std('bread', { color: '#eacb8a', roughness: 0.85 });
  const box = geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  return (
    <group position={position} rotation-y={rot} scale={scale}>
      <mesh position-y={0.08} scale={[0.95, 0.16, 0.95]} geometry={box} material={bread} castShadow receiveShadow />
      <mesh position-y={0.18} rotation-y={0.2} scale={[1.0, 0.04, 1.0]} geometry={geo('lettuce', () => new THREE.CylinderGeometry(0.62, 0.62, 1, 9))} material={std('lettuce', { color: '#6dbb3a', roughness: 0.6 })} castShadow />
      <mesh position-y={0.22} rotation-y={-0.15} scale={[1.0, 0.04, 0.98]} geometry={box} material={std('ham', { color: '#e98f95', roughness: 0.55 })} castShadow />
      <mesh position-y={0.26} rotation-y={Math.PI / 4} scale={[0.9, 0.035, 0.9]} geometry={box} material={std('slice-cheese', { color: '#f6c443', roughness: 0.5 })} castShadow />
      {[[-0.22, 0.2], [0.22, -0.18]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.3, z]} geometry={geo('tomato', () => new THREE.CylinderGeometry(0.24, 0.24, 0.05, 20))} material={phys('tomato', { color: '#d92b26', roughness: 0.3, clearcoat: 0.6 })} castShadow />
      ))}
      <mesh position-y={0.42} scale={[0.95, 0.17, 0.95]} geometry={box} material={bread} castShadow />
      <mesh position-y={0.505} scale={[0.92, 0.01, 0.92]} geometry={box} material={std('crust', { color: '#c58b45', roughness: 0.8 })} />
      <group position={[0.1, 0.62, 0.05]} rotation-z={0.1}>
        <mesh geometry={geo('pick', () => new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6))} material={std('pick', { color: '#e8d3a8' })} castShadow />
        <mesh position-y={0.39} geometry={geo('frill', () => new THREE.SphereGeometry(0.035, 10, 8))} material={std('frill', { color: '#e0303b', roughness: 0.5 })} castShadow />
      </group>
    </group>
  );
}

function swissGeometry() {
  const R = 1.3;
  const A = 0.42;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.absarc(0, 0, R, -A, A, false);
  s.lineTo(0, 0);
  [[0.55, 0.05, 0.1], [0.92, -0.2, 0.13], [1.0, 0.24, 0.09], [0.36, -0.05, 0.06]].forEach(([x, y, r]) => s.holes.push(new THREE.Path().absarc(x, y, r, 0, TAU, true)));
  return new THREE.ExtrudeGeometry(s, { depth: 0.62, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 18 }).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
}

function Cheese({ position, rot = 0, scale = 1 }) {
  return (
    <group position={position} rotation-y={rot} scale={scale}>
      <mesh geometry={geo('swiss', swissGeometry)} material={std('swiss', { color: '#f5cd4a', roughness: 0.55 })} castShadow receiveShadow />
    </group>
  );
}

function Grapes({ position, rot = 0, scale = 1 }) {
  const ref = useRef();
  const berries = useMemo(() => {
    const rand = seeded(3);
    const out = [];
    for (let l = 0; l < 7; l++) {
      const rr = 0.24 * (1 - l / 8) + 0.03;
      [rr, rr * 0.4].forEach((ring) => {
        const n = Math.max(1, Math.ceil((TAU * ring) / 0.16));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + l * 0.6;
          const j = () => (rand() - 0.5) * 0.05;
          out.push([l * 0.12 + j(), Math.max(0.09, 0.1 + rr + Math.sin(a) * ring + j()), Math.cos(a) * ring + j(), 0.07 + rand() * 0.04, rand()]);
        }
      });
    }
    return out.filter(() => rand() > 0.12);
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    berries.forEach(([x, y, z, r, tint], i) => {
      ref.current.setMatrixAt(i, m.makeScale(r, r * (0.9 + tint * 0.2), r).setPosition(x, y, z));
      ref.current.setColorAt(i, c.setHSL(0.75 + (tint - 0.5) * 0.1, 0.3, 0.6 + tint * 0.4));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [berries]);
  return (
    <group position={position} rotation-y={rot} scale={scale}>
      <instancedMesh ref={ref} args={[geo('berry', () => new THREE.SphereGeometry(1, 14, 10)), phys('grape', { color: '#5a2470', roughness: 0.25, clearcoat: 0.8, sheen: 0.6, sheenColor: new THREE.Color('#b9a0d0') }), berries.length]} castShadow />
      <mesh position={[-0.12, 0.37, 0]} rotation-z={1.1} geometry={geo('stem', () => new THREE.CylinderGeometry(0.025, 0.035, 0.4, 6))} material={std('stem', { color: '#6b4a22', roughness: 0.9 })} castShadow />
    </group>
  );
}

// Golden crust with pale, torn-open score marks and a dusting of flour
function baguetteCanvas() {
  const [c, g] = makeCanvas(128, 512);
  const rand = seeded(23);
  const crust = g.createLinearGradient(0, 0, 128, 0);
  ['#b8732c', '#d79a48', '#b8732c', '#d79a48', '#b8732c'].forEach((col, i) => crust.addColorStop(i / 4, col));
  g.fillStyle = crust;
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '120,60,20' : '240,200,130'},${0.1 + rand() * 0.15})`;
    g.beginPath();
    g.ellipse(rand() * 128, rand() * 512, 4 + rand() * 10, 6 + rand() * 16, 0, 0, TAU);
    g.fill();
  }
  [32, 96].forEach((u) => {
    for (let i = 0; i < 5; i++) {
      const v = 90 + i * 72 + (u > 64 ? 36 : 0);
      g.save();
      g.translate(u, v);
      g.rotate(-0.5);
      g.fillStyle = '#f0d49c';
      g.beginPath();
      g.ellipse(0, 0, 9, 30, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(110,55,15,0.75)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(2, 0, 9, 30, 0, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.restore();
    }
  });
  g.fillStyle = 'rgba(255,250,240,0.55)';
  for (let i = 0; i < 400; i++) g.fillRect(rand() * 128, rand() * 512, 1.5, 1.5);
  return c;
}

// Quilted burgundy padding lining the hamper
function paddingCanvas() {
  const S = 256;
  const cell = 32;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#8e1c28';
  g.fillRect(0, 0, S, S);
  for (let x = 0; x <= S; x += cell) {
    for (let y = 0; y <= S; y += cell) {
      const puff = g.createRadialGradient(x + cell / 2, y + cell / 2, 2, x + cell / 2, y + cell / 2, cell * 0.7);
      puff.addColorStop(0, 'rgba(255,140,150,0.28)');
      puff.addColorStop(1, 'rgba(40,0,5,0.25)');
      g.fillStyle = puff;
      g.save();
      g.translate(x + cell / 2, y + cell / 2);
      g.rotate(Math.PI / 4);
      g.fillRect(-cell * 0.36, -cell * 0.36, cell * 0.72, cell * 0.72);
      g.restore();
    }
  }
  g.strokeStyle = 'rgba(245,215,200,0.7)';
  g.lineWidth = 1.5;
  g.setLineDash([4, 3]);
  for (let k = -S; k <= S * 2; k += cell) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.moveTo(k, S);
    g.lineTo(k + S, 0);
    g.stroke();
  }
  return c;
}

// Open-topped wicker shell with a quilted lining that folds over the rim
function Hamper({ position, rot = 0, scale = 1 }) {
  const wicker = std('wicker', { map: tex('wicker', () => basketCanvas(48), [1.5, 1]), roughness: 0.85 });
  const rim = std('rim', { color: '#6e4720', roughness: 0.8 });
  const pad = std('hamper-pad', { map: tex('hamper-pad', paddingCanvas, [2, 2]), roughness: 0.9 });
  const box = geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  const [w, h, d] = [1.8, 0.85, 1.1];
  const t = 0.06;
  const l = 0.025;
  const shell = [
    [[0, t / 2, 0], [w, t, d]],
    [[-(w - t) / 2, h / 2, 0], [t, h, d]],
    [[(w - t) / 2, h / 2, 0], [t, h, d]],
    [[0, h / 2, -(d - t) / 2], [w, h, t]],
    [[0, h / 2, (d - t) / 2], [w, h, t]],
  ];
  const rimBars = [
    [[-(w - t) / 2, h, 0], [t + 0.06, 0.07, d + 0.06]],
    [[(w - t) / 2, h, 0], [t + 0.06, 0.07, d + 0.06]],
    [[0, h, -(d - t) / 2], [w + 0.06, 0.07, t + 0.06]],
    [[0, h, (d - t) / 2], [w + 0.06, 0.07, t + 0.06]],
  ];
  const iw = w - 2 * t;
  const id = d - 2 * t;
  const lining = [
    [[0, t + l / 2, 0], [iw, l, id]],
    [[-(iw - l) / 2, h / 2 + t / 2, 0], [l, h - t, id]],
    [[(iw - l) / 2, h / 2 + t / 2, 0], [l, h - t, id]],
    [[0, h / 2 + t / 2, -(id - l) / 2], [iw, h - t, l]],
    [[0, h / 2 + t / 2, (id - l) / 2], [iw, h - t, l]],
  ];
  const fold = 0.16;
  const lip = [
    [[w / 4, h + 0.045, -(d - t) / 2], [w / 2 - 0.02, l, t + 0.1]],
    [[w / 4, h + 0.045, (d - t) / 2], [w / 2 - 0.02, l, t + 0.1]],
    [[(w - t) / 2, h + 0.045, 0], [t + 0.1, l, d - 0.02]],
    [[w / 4, h + 0.045 - fold / 2, -(d / 2 + 0.06)], [w / 2 - 0.02, fold, l]],
    [[w / 4, h + 0.045 - fold / 2, d / 2 + 0.06], [w / 2 - 0.02, fold, l]],
    [[w / 2 + 0.06, h + 0.045 - fold / 2, 0], [l, fold, d - 0.02]],
  ];
  const boxes = (list, material, key) => list.map(([p, sc], i) => <mesh key={key + i} position={p} scale={sc} geometry={box} material={material} castShadow receiveShadow />);
  return (
    <group position={position} rotation-y={rot} scale={scale}>
      {boxes(shell, wicker, 's')}
      {boxes(rimBars, rim, 'r')}
      {boxes(lining, pad, 'l')}
      {boxes(lip, pad, 'p')}
      <mesh position={[-w / 4, h + 0.06, 0]} scale={[w / 2, 0.06, d + 0.04]} geometry={box} material={wicker} castShadow />
      <group position={[0, h + 0.04, 0]} rotation-z={1.3}>
        <mesh position={[w / 4, 0, 0]} scale={[w / 2, 0.06, d + 0.04]} geometry={box} material={wicker} castShadow />
      </group>
      <mesh position={[0.49, 0.75, -0.08]} rotation={[0.2, 0, -0.45]} scale={[1, 1, 0.85]} geometry={geo('baguette', () => new THREE.CapsuleGeometry(0.12, 1.1, 8, 16))} material={std('baguette', { map: tex('baguette', baguetteCanvas), roughness: 0.8 })} castShadow />
      <group position={[-0.05, h + 0.04, 0]} rotation-z={0.45}>
        <mesh rotation-y={Math.PI / 2} geometry={geo('handle', () => new THREE.TorusGeometry(0.5, 0.02, 6, 24, Math.PI))} material={rim} castShadow />
      </group>
    </group>
  );
}

const SANDWICH_K = 0.7;
const HAMPER_K = 1.35;
const CHEESE_K = 0.75;
const HOLE_AT = 0.75;
const holeY = (r) => (0.34 * (0.85 - r)) / 0.73;

function Anthill({ position, holes, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position-y={0.17} geometry={geo('hill', () => new THREE.CylinderGeometry(0.12, 0.85, 0.34, 16, 3))} material={std('dirt', { color: '#6e4b2a', roughness: 1, flatShading: true })} castShadow receiveShadow />
      {holes.map((a) => (
        <mesh key={a} position={[Math.cos(a) * HOLE_AT, holeY(HOLE_AT), Math.sin(a) * HOLE_AT]} rotation-y={-a} scale={[0.07, 0.035, 0.1]} geometry={geo('hole', () => new THREE.SphereGeometry(1, 12, 8))} material={std('hole', { color: '#120803', roughness: 1 })} />
      ))}
    </group>
  );
}

const g = (x, z) => [x, GROUND, z];
const along = ([x, z], rot, d) => [x + Math.cos(rot) * d, z - Math.sin(rot) * d];

// Where everything sits, every trail, and rough footprints of what the ants must walk around
export function picnicLayout(spec) {
  const { halfLength: L, halfWidth: W, baseCenter, dishR } = spec;
  const bc = baseCenter[0];
  const H = L * 1.72;
  const F = (H - L) / 3.9;
  const M = L + 2 * F;
  const C = bc + dishR * 0.71 + 1.6 + 0.6 * F;
  const A = H * 0.78 + (H * 0.22 + 0.85 * F + 0.35) / Math.SQRT2;
  const props = {
    charcuterie: [-M, 0],
    wine: [M, 0],
    sandwich: { at: [0.6 * F, -M + 0.3 * F], rot: 0.4 },
    hamper: { at: [-C, -C], rot: Math.PI / 4 },
    cheese: { at: [C + 0.3 * F, -C - 0.2 * F], rot: Math.PI * 0.8 },
    grapes: { at: [-C + 0.2 * F, C - 0.2 * F], rot: -0.6 },
    melons: [{ at: [C + 0.1 * F, C - 1.5 * F], rot: 0.3 }, { at: [C - 0.3 * F, C + 0.1 * F], rot: -0.5 }],
  };
  const deg = Math.PI / 180;
  const holes = { melon: 15 * deg, cheese: 95 * deg, charcuterie: 155 * deg, hamper: 215 * deg };
  const exit = (a) => [
    [A + Math.cos(a) * HOLE_AT * F, holeY(HOLE_AT) * F, -A + Math.sin(a) * HOLE_AT * F],
    g(A + Math.cos(a) * 1.05 * F, -A + Math.sin(a) * 1.05 * F),
  ];
  const melonR = MELON_R * F;
  const gap = -((bc * Math.SQRT2 + dishR + 0.09 + C * Math.SQRT2 - 0.55 * F) / 2) / Math.SQRT2;
  const cheeseTop = along(props.cheese.at, props.cheese.rot, 0.715 * F)[1] - 0.73 * F - 0.65;
  const top = Math.min(-M - 1.03 * F, cheeseTop);
  const north = Math.min(-A - 0.6, top - 1.4);
  const trails = [
    { pts: [...exit(holes.melon), g(A + 1, -A + 3), g(A + 1, 0.4 * C), g(along(props.melons[0].at, props.melons[0].rot, melonR + 1.2)[0], props.melons[0].at[1] - 0.5 * F), g(...along(props.melons[0].at, props.melons[0].rot - 0.25, melonR + 1.0))], loot: '#e8323f', count: 2 },
    { pts: [...exit(holes.cheese), g(C + 1.7 * F, -C - 0.4 * F), g(...along(props.cheese.at, props.cheese.rot, -0.75))], loot: '#f5cd4a' },
    { pts: [...exit(holes.charcuterie), g(A - 2 * F, top), g(-3, top), g(gap, gap), g(-M + 0.9 * F, -C * 0.45), g(-M + 0.2 * F, -2.05 * F)], loot: '#a3202e' },
    { pts: [...exit(holes.hamper), g(A - 2.4 * F, north), g(-C + 2.6 * F, north), g(-C + 1.4 * F, -C - 2.3 * F), g(...along(props.hamper.at, props.hamper.rot, 0.9 * F * HAMPER_K + 0.8))], loot: '#e8c27a' },
  ];
  const circle = (at, r) => ({ type: 'circle', at, r });
  const obstacles = [
    { type: 'cross', w: W + 0.09, l: L + 0.09 },
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => circle([sx * bc, sz * bc], dishR + 0.09)),
    circle(props.charcuterie, 1.55 * F),
    circle([M - 0.15 * F, -1.4 * F], 1.75 * F),
    circle([M + 0.15 * F, 0.25 * F], 1.15 * F),
    circle([M + 1.15 * F, 0.35 * F], 0.3 * F),
    circle(props.sandwich.at, 0.7 * F * SANDWICH_K),
    { type: 'box', at: props.hamper.at, rot: props.hamper.rot, half: [0.9 * F * HAMPER_K + 0.15, 0.55 * F * HAMPER_K + 0.1] },
    circle(along(props.cheese.at, props.cheese.rot, 0.55 * 1.3 * F * CHEESE_K), 0.56 * 1.3 * F * CHEESE_K),
    circle(along(props.grapes.at, props.grapes.rot, 0.4 * F), 0.5 * F),
    ...props.melons.map((m) => circle(along(m.at, m.rot, 0.5 * melonR), 0.63 * melonR)),
  ];
  return { F, hill: [A, -A], holes: Object.values(holes), props, trails, obstacles };
}

export default function PicnicProps({ layout, y }) {
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  const { F, hill, holes, props, trails } = useMemo(() => picnicLayout(layout.spec), [layout]);
  return (
    <group position-y={y}>
      <Ants trails={trails} still={still} />
      <Anthill position={[hill[0], 0, hill[1]]} holes={holes} scale={F} />
      <Charcuterie position={g(...props.charcuterie)} scale={F} />
      <Wine position={g(...props.wine)} scale={F} still={still} />
      {props.melons.map((m, i) => (
        <Watermelon key={i} position={g(...m.at)} rot={m.rot} scale={F} />
      ))}
      <Sandwich position={g(...props.sandwich.at)} rot={props.sandwich.rot} scale={F * SANDWICH_K} />
      <Hamper position={g(...props.hamper.at)} rot={props.hamper.rot} scale={F * HAMPER_K} />
      <Cheese position={g(...props.cheese.at)} rot={props.cheese.rot} scale={F * CHEESE_K} />
      <Grapes position={g(...props.grapes.at)} rot={props.grapes.rot} scale={F} />
    </group>
  );
}

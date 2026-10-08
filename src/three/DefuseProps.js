import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { makeCanvas, seeded } from './textures';

const TAU = Math.PI * 2;
const PAINT = '#b8231c';

const texCache = new Map();
const tex = (key, draw, { repeat = null, alpha = false } = {}) => {
  if (!texCache.has(key)) {
    const t = new THREE.CanvasTexture(draw());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    if (alpha) t.premultiplyAlpha = false;
    texCache.set(key, t);
  }
  return texCache.get(key);
};

const matCache = new Map();
const mat = (key, make) => {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
};

function grain(g, rand, w, h, n, light, dark, a = 0.14) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? light : dark},${rand() * a})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

// Light planks in a dark frame with a diagonal brace, the crate everyone has hidden behind
function crateCanvas() {
  const [c, g] = makeCanvas(256, 256);
  const rand = seeded(41);
  g.fillStyle = '#c99a5e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '255,230,190' : '110,70,30'},${0.08 + rand() * 0.1})`;
    g.fillRect(i * 51.2, 0, 51.2, 256);
    g.fillStyle = 'rgba(80,48,20,0.55)';
    g.fillRect(i * 51.2, 0, 2, 256);
  }
  g.strokeStyle = 'rgba(120,78,36,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (rand() - 0.5) * 6, y + 20, x + (rand() - 0.5) * 4, y + 30 + rand() * 30);
    g.stroke();
  }
  g.strokeStyle = '#6a4220';
  g.lineWidth = 28;
  g.strokeRect(14, 14, 228, 228);
  g.lineWidth = 24;
  g.beginPath();
  g.moveTo(28, 228);
  g.lineTo(228, 28);
  g.stroke();
  g.strokeStyle = 'rgba(255,220,170,0.25)';
  g.lineWidth = 2;
  g.strokeRect(29, 29, 198, 198);
  g.fillStyle = '#2a1a0c';
  [[14, 14], [242, 14], [14, 242], [242, 242], [128, 14], [128, 242], [14, 128], [242, 128]].forEach(([x, y]) => {
    g.beginPath();
    g.arc(x, y, 3, 0, TAU);
    g.fill();
  });
  grain(g, rand, 256, 256, 900, '255,240,210', '60,35,12');
  return c;
}

// Sun-bleached plaster flaking off old brick, with an optional site letter sprayed across it
function plasterCanvas(letter) {
  const W = 512;
  const H = 256;
  const [c, g] = makeCanvas(W, H);
  const rand = seeded(letter ? letter.charCodeAt(0) * 7 : 77);
  g.fillStyle = '#d6bd8f';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 20 + rand() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, i % 2 ? 'rgba(236,216,176,0.5)' : 'rgba(170,140,98,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let p = 0; p < 4; p++) {
    const px = 30 + rand() * (W - 140);
    const py = 40 + rand() * (H - 120);
    const pw = 60 + rand() * 70;
    const ph = 40 + rand() * 50;
    g.save();
    g.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * TAU;
      const rr = 0.75 + rand() * 0.35;
      g.lineTo(px + pw / 2 + Math.cos(a) * pw * 0.5 * rr, py + ph / 2 + Math.sin(a) * ph * 0.5 * rr);
    }
    g.closePath();
    g.fillStyle = '#7e5638';
    g.fill();
    g.clip();
    for (let y = py - 10; y < py + ph + 10; y += 13) {
      for (let x = px - 30 + (Math.round(y / 13) % 2) * 14; x < px + pw + 30; x += 28) {
        g.fillStyle = ['#a8693f', '#b8794b', '#9a5f38', '#c08452'][Math.floor(rand() * 4)];
        g.fillRect(x + 1, y + 1, 26, 11);
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(90,64,36,0.6)';
    g.lineWidth = 2;
    g.stroke();
  }
  const grime = g.createLinearGradient(0, H * 0.6, 0, H);
  grime.addColorStop(0, 'rgba(90,66,40,0)');
  grime.addColorStop(1, 'rgba(90,66,40,0.5)');
  g.fillStyle = grime;
  g.fillRect(0, 0, W, H);
  grain(g, rand, W, H, 2600, '255,246,226', '80,58,34', 0.18);
  if (letter) {
    g.save();
    g.translate(W / 2, H / 2 + 6);
    g.font = '900 210px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = PAINT;
    g.shadowColor = PAINT;
    g.shadowBlur = 4;
    g.globalAlpha = 0.93;
    g.fillText(letter, 0, 0);
    g.restore();
  }
  return c;
}

function barrelCanvas(color) {
  const [c, g] = makeCanvas(256, 128);
  const rand = seeded(color.length * 31);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 128);
  [14, 64, 114].forEach((y) => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y - 4, 256, 8);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, y - 4, 256, 2);
  });
  for (let i = 0; i < 40; i++) {
    const x = rand() * 256;
    const y = rand() * 128;
    const r = 3 + rand() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(120,58,24,0.7)');
    gr.addColorStop(1, 'rgba(120,58,24,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  grain(g, rand, 256, 128, 700, '255,240,220', '30,20,10', 0.2);
  return c;
}

// Weathered teal planks with iron straps, the doors every desert map seems to have
function doorCanvas() {
  const [c, g] = makeCanvas(128, 256);
  const rand = seeded(19);
  g.fillStyle = '#2e6f84';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? '200,240,250' : '10,30,40'},${0.06 + rand() * 0.1})`;
    g.fillRect(i * 32, 0, 32, 256);
    g.fillStyle = 'rgba(10,30,40,0.6)';
    g.fillRect(i * 32, 0, 2, 256);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = '#8a6a45';
    g.beginPath();
    g.ellipse(rand() * 128, rand() * 256, 2 + rand() * 9, 1 + rand() * 4, rand() * TAU, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#2b2620';
  [40, 216].forEach((y) => g.fillRect(0, y, 128, 12));
  g.fillStyle = '#4a4238';
  [40, 216].forEach((y) => [12, 60, 108].forEach((x) => g.fillRect(x, y + 3, 6, 6)));
  grain(g, rand, 128, 256, 600, '220,250,255', '10,20,25', 0.2);
  return c;
}

function trunkCanvas() {
  const [c, g] = makeCanvas(64, 256);
  g.fillStyle = '#7a5a3a';
  g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = '#5a3f26';
    g.fillRect(0, y, 64, 5);
    g.fillStyle = 'rgba(255,230,190,0.15)';
    g.fillRect(0, y + 5, 64, 3);
  }
  return c;
}

function frondCanvas() {
  const [c, g] = makeCanvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = '#4f6b26';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 32);
  g.lineTo(256, 32);
  g.stroke();
  g.lineCap = 'round';
  for (let x = 8; x < 250; x += 7) {
    const len = 28 * Math.sin((x / 256) * Math.PI) + 4;
    [-1, 1].forEach((s) => {
      g.strokeStyle = s > 0 ? '#5f8030' : '#6e9238';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 10, 32 + s * len);
      g.stroke();
    });
  }
  return c;
}

const bagColors = ['#b9a678', '#a8966a', '#c2b084'];

const GEO = {};
const geo = (key, make) => GEO[key] || (GEO[key] = make());

function frondGeometry() {
  const g = new THREE.PlaneGeometry(1.9, 0.55, 10, 1);
  g.translate(0.95, 0, 0);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.25 * p.getX(i) - 0.32 * p.getX(i) ** 2);
  g.computeVertexNormals();
  return g;
}

const crateMat = () => mat('crate', () => new THREE.MeshStandardMaterial({ map: tex('crate', crateCanvas), roughness: 0.85 }));
const plasterMat = (letter) => mat(`plaster-${letter || ''}`, () => new THREE.MeshStandardMaterial({ map: tex(`plaster-${letter || ''}`, () => plasterCanvas(letter)), roughness: 0.95 }));
const capMat = () => mat('cap', () => new THREE.MeshStandardMaterial({ color: '#e2cfa6', roughness: 0.9 }));

function Crate({ position, size = 1, rot = 0 }) {
  return (
    <mesh position={[position[0], size / 2 + (position[1] || 0), position[2]]} rotation-y={rot} geometry={geo('box', () => new THREE.BoxGeometry(1, 1, 1))} scale={size} material={crateMat()} castShadow receiveShadow />
  );
}

function Barrel({ position, color = '#8a3a22', tilt = 0 }) {
  const material = mat(`barrel-${color}`, () => new THREE.MeshStandardMaterial({ map: tex(`barrel-${color}`, () => barrelCanvas(color)), roughness: 0.6, metalness: 0.35 }));
  return (
    <mesh position={[position[0], 0.48, position[2]]} rotation-z={tilt} geometry={geo('barrel', () => new THREE.CylinderGeometry(0.34, 0.34, 0.96, 18))} material={material} castShadow receiveShadow />
  );
}

// Long axis runs along local x; both long faces carry the paint
function Wall({ position, length, height, rot = 0, letter = null }) {
  const materials = useMemo(() => {
    const face = plasterMat(letter);
    const side = plasterMat(null);
    return [side, side, capMat(), side, face, face];
  }, [letter]);
  return (
    <mesh position={[position[0], height / 2, position[2]]} rotation-y={rot} geometry={geo('box', () => new THREE.BoxGeometry(1, 1, 1))} scale={[length, height, 0.45]} material={materials} castShadow receiveShadow />
  );
}

function Doorway({ position, length, height, rot = 0 }) {
  const opening = 1.5;
  const side = (length - opening) / 2;
  const doorMat = mat('door', () => new THREE.MeshStandardMaterial({ map: tex('door', doorCanvas), roughness: 0.8 }));
  const doorH = height - 0.35;
  return (
    <group position={position} rotation-y={rot}>
      {[-1, 1].map((s) => (
        <Wall key={s} position={[s * (opening / 2 + side / 2), 0, 0]} length={side} height={height} />
      ))}
      <mesh position={[0, height - 0.17, 0]} geometry={geo('box', () => new THREE.BoxGeometry(1, 1, 1))} scale={[opening + 0.05, 0.34, 0.5]} material={plasterMat(null)} castShadow receiveShadow />
      <mesh position={[-opening / 2 + 0.36, doorH / 2, 0]} geometry={geo('box', () => new THREE.BoxGeometry(1, 1, 1))} scale={[0.72, doorH, 0.08]} material={doorMat} castShadow />
      <group position={[opening / 2, 0, 0]} rotation-y={-1.1}>
        <mesh position={[-0.36, doorH / 2, 0]} geometry={geo('box', () => new THREE.BoxGeometry(1, 1, 1))} scale={[0.72, doorH, 0.08]} material={doorMat} castShadow />
      </group>
    </group>
  );
}

// One instanced mesh for a whole stack of bags laid in staggered rows
function Sandbags({ rows }) {
  const ref = useRef();
  const bags = useMemo(() => {
    const rand = seeded(rows.length * 13 + 5);
    const out = [];
    rows.forEach(([x0, z0, x1, z1, layers]) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(-(z1 - z0), x1 - x0);
      for (let l = 0; l < layers; l++) {
        const n = Math.max(1, Math.round(len / 0.6) - (l % 2));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5 + (l % 2) * 0.5) / (n + (l % 2));
          out.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, y: 0.12 + l * 0.2, yaw: yaw + (rand() - 0.5) * 0.18, color: bagColors[Math.floor(rand() * 3)] });
        }
      }
    });
    return out;
  }, [rows]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(0.64, 0.24, 0.36);
    const c = new THREE.Color();
    bags.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
      ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(b.x, b.y, b.z), q, s));
      ref.current.setColorAt(i, c.set(b.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [bags]);
  return (
    <instancedMesh key={bags.length} ref={ref} args={[geo('bag', () => new THREE.SphereGeometry(0.5, 14, 8)), mat('bag', () => new THREE.MeshStandardMaterial({ roughness: 1 })), bags.length]} castShadow receiveShadow />
  );
}

function Palm({ position, height = 3.6, lean = 0.3, yaw = 0 }) {
  const trunkGeo = useMemo(() => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const t = i / 5;
      return new THREE.Vector3(Math.sin(t * 1.4) * lean * height * 0.35, t * height, 0);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.13, 8, false);
  }, [height, lean]);
  const top = useMemo(() => [Math.sin(1.4) * lean * height * 0.35, height, 0], [height, lean]);
  const trunkMat = mat('trunk', () => new THREE.MeshStandardMaterial({ map: tex('trunk', trunkCanvas, { repeat: [1, 4] }), roughness: 0.9 }));
  const frondMat = mat('frond', () => new THREE.MeshStandardMaterial({ map: tex('frond', frondCanvas, { alpha: true }), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }));
  const fronds = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ yaw: (i / 9) * TAU + (i % 2) * 0.2, pitch: (i % 3) * 0.12 })), []);
  return (
    <group position={position} rotation-y={yaw}>
      <mesh geometry={trunkGeo} material={trunkMat} castShadow />
      <group position={top}>
        {fronds.map((f, i) => (
          <mesh key={i} rotation={[0, f.yaw, f.pitch]} geometry={geo('frond', frondGeometry)} material={frondMat} castShadow />
        ))}
      </group>
    </group>
  );
}

// Seat 0's corner, built in its own frame (x = column, z = row) and rotated into place for the others.
// The big pieces stand square across the corner's diagonal so the four corners mirror each other and
// never chase each other round; small clutter sits on the side away from the die's landing spot and throw line.
function Corner({ seat, kind, spec }) {
  const { baseCenter, dishR, halfLength: L } = spec;
  const bc = baseCenter[0];
  const D = bc + dishR + 1.5;
  const wallLen = dishR * 1.3 + 0.4;
  const front = D - 0.85;
  const pair = (d) => [[front + d, 0, front - d], [front - d, 0, front + d]];
  const tipBags = [[-1.7, L + 1.0, 1.7, L + 1.0, 2]];
  return (
    <group rotation-y={(seat * Math.PI) / 2}>
      <Sandbags rows={tipBags} />
      {kind === 'spawn' ? (
        <Doorway position={[D, 0, D]} length={wallLen} height={1.7} rot={Math.PI / 4} />
      ) : (
        <Wall position={[D, 0, D]} length={wallLen} height={1.7} rot={Math.PI / 4} letter={kind} />
      )}
      {kind === 'A' && (
        <>
          <Crate position={[front, 0, front]} size={0.9} rot={Math.PI / 4} />
          <Crate position={[front, 0.9, front]} size={0.7} rot={Math.PI / 4} />
        </>
      )}
      {kind === 'B' &&
        pair(0.42).map((p, i) => <Barrel key={i} position={p} color={i ? '#8a3a22' : '#5b6131'} />)}
      {kind === 'spawn' && <Palm position={[D + 1.0, 0, D + 1.0]} height={3.4} lean={0.3} yaw={-Math.PI / 4} />}
    </group>
  );
}

const KINDS = ['A', 'spawn', 'B', 'spawn'];

export default function DefuseProps({ layout, y }) {
  return (
    <group position-y={y}>
      {KINDS.map((kind, seat) => (
        <Corner key={seat} seat={seat} kind={kind} spec={layout.spec} />
      ))}
    </group>
  );
}

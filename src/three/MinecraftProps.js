import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { blockCanvas, minecraftScenery, clearOfPlay, cloudShapes } from './minecraft';
import { seeded } from './textures';

export const B = 0.5;
const CUBE = new THREE.BoxGeometry(1, 1, 1);

// Two quads crossed at 45 degrees, the way plants are drawn
function crossGeometry() {
  const position = [];
  const uv = [];
  const index = [];
  [Math.PI / 4, -Math.PI / 4].forEach((a, q) => {
    const dx = Math.cos(a) * 0.5;
    const dz = Math.sin(a) * 0.5;
    position.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const o = q * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
const CROSS = crossGeometry();

// Box faces run +x, -x, +y, -y, +z, -z
const FACES = {
  grass: { top: 'grass', bottom: 'dirt', side: 'grassSide' },
  log: { top: 'logTop', bottom: 'logTop', side: 'logSide' },
  craft: { top: 'craftTop', bottom: 'planks', side: 'craftSide' },
  furnace: { top: 'furnaceTop', bottom: 'furnaceTop', side: 'furnaceSide', front: 'furnaceFront' },
  chest: { top: 'chestTop', bottom: 'chestTop', side: 'chestSide', front: 'chestFront' },
  farmland: { top: 'farmland', bottom: 'dirt', side: 'dirt' },
};
const SOLIDS = { opening: '#0c0c0b', post: '#8a6a3c' };
const LOOK = {
  leaves: { alphaTest: 0.5, side: THREE.DoubleSide },
  glass: { transparent: true, alphaTest: 0.05, opacity: 0.9 },
  rail: { alphaTest: 0.5 },
  water: { transparent: true, opacity: 0.86, roughness: 0.15 },
  tuft: { alphaTest: 0.5, side: THREE.DoubleSide },
  poppy: { alphaTest: 0.5, side: THREE.DoubleSide },
  dandelion: { alphaTest: 0.5, side: THREE.DoubleSide },
  wheat: { alphaTest: 0.5, side: THREE.DoubleSide },
  sprout: { alphaTest: 0.5, side: THREE.DoubleSide },
};

const textures = new Map();
function texture(name) {
  if (!textures.has(name)) {
    const map = new THREE.CanvasTexture(blockCanvas(name, 731 + name.length * 13));
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestMipmapLinearFilter;
    map.anisotropy = 4;
    if (name === 'water') map.wrapS = map.wrapT = THREE.RepeatWrapping;
    textures.set(name, map);
  }
  return textures.get(name);
}

const materials = new Map();
export function materialFor(key) {
  if (!materials.has(key)) {
    const [kind, front] = key.split('@');
    const make = (name) => new THREE.MeshStandardMaterial({ map: texture(name), roughness: 0.95, ...LOOK[name] });
    let material;
    if (SOLIDS[kind]) material = new THREE.MeshStandardMaterial({ color: SOLIDS[kind], roughness: 1 });
    else if (FACES[kind]) {
      const f = FACES[kind];
      const side = make(f.side);
      material = [side, side, make(f.top), make(f.bottom), side, side];
      if (f.front) material[+front || 0] = make(f.front);
    } else material = make(kind);
    materials.set(key, material);
  }
  return materials.get(key);
}

// Vignettes are authored in local block units with +x/+z pointing away from the board, then mirrored into each corner
export function campsiteBlocks(layout) {
  const blocks = {};
  const plants = {};
  const torches = [];
  const sheep = [];
  const chickens = [];
  const bees = [];
  const vignettes = minecraftScenery(layout);
  vignettes.forEach(({ kind, at: [cx, cz] }, vi) => {
    const sx = Math.sign(cx);
    const sz = Math.sign(cz);
    const world = (lx, lz) => [cx + sx * lx * B, cz + sz * lz * B];
    // A face that looks back toward the board along local -x or -z, in world face order
    const facing = (axis) => (axis === 'x' ? (sx > 0 ? 1 : 0) : sz > 0 ? 5 : 4);
    const box = (type, lx, gy, lz, w = 1, h = 1, d = w, y = null) => {
      const [x, z] = world(lx, lz);
      (blocks[type] ||= []).push({ at: [x, y ?? (gy + h / 2) * B, z], size: [w * B, h * B, d * B] });
    };
    const block = (type, lx, gy, lz) => box(type, lx, gy, lz);
    const plant = (type, lx, lz, h = 1, y = 0) => {
      const [x, z] = world(lx, lz);
      (plants[type] ||= []).push({ at: [x, y, z], size: [B * 0.9, B * h, B * 0.9], turn: Math.abs(lx * 7 + lz * 3) % 2 });
    };
    const torch = (lx, lz, gy = 0) => {
      box('post', lx, gy, lz, 0.125, 0.56, 0.125);
      const [x, z] = world(lx, lz);
      torches.push([x, (gy + 0.62) * B, z]);
    };
    if (kind === 'grove') {
      const oak = (tx, tz, trunk, wide) => {
        for (let gy = 0; gy < trunk; gy++) block('log', tx, gy, tz);
        const rand = seeded(97 + tx * 11 + tz * 5);
        [trunk - 2, trunk - 1].forEach((gy) => {
          for (let dx = -wide; dx <= wide; dx++) for (let dz = -wide; dz <= wide; dz++) {
            const corner = Math.abs(dx) === wide && Math.abs(dz) === wide;
            if ((dx || dz) && !(corner && rand() > 0.35)) block('leaves', tx + dx, gy, tz + dz);
          }
        });
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!(Math.abs(dx) && Math.abs(dz) && rand() > 0.5)) block('leaves', tx + dx, trunk, tz + dz);
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => block('leaves', tx + dx, trunk + 1, tz + dz));
      };
      oak(1, 1, 5, 2);
      oak(-2, 3, 4, 1);
      for (let lx = -3; lx <= -1; lx++) for (let lz = -2; lz <= -1; lz++) box('water', lx, 0, lz, 1, 0.12, 1, 0.03);
      [[-4, -2], [-4, -1], [0, -2], [0, -1], [-3, -3], [-2, -3], [-1, -3], [-3, 0], [-2, 0], [-1, 0]].forEach(([lx, lz]) => box('sand', lx, 0, lz, 1, 0.14, 1, 0.07));
      [[3, -2, 'poppy'], [-1, 2, 'dandelion'], [3, 3, 'poppy'], [2, -1, 'tuft'], [-3, 2, 'tuft'], [0, 3, 'dandelion']].forEach(([lx, lz, type]) => plant(type, lx, lz));
      const [x, z] = world(1.2, -1.8);
      sheep.push({ at: [x, z], rx: 0.55, rz: 0.28, phase: vi });
      torch(-4, 1);
    } else if (kind === 'house') {
      for (let gy = 0; gy < 3; gy++) for (let lx = -1; lx <= 2; lx++) for (let lz = -1; lz <= 2; lz++) {
        const edgeX = lx === -1 || lx === 2;
        const edgeZ = lz === -1 || lz === 2;
        if (!edgeX && !edgeZ) continue;
        if (edgeX && edgeZ) block('log', lx, gy, lz);
        else if (lz === -1 && lx === 0 && gy < 2) continue;
        else if ((lz === -1 && lx === 1 && gy === 1) || (lx === -1 && lz === 1 && gy === 1)) block('glass', lx, gy, lz);
        else block('planks', lx, gy, lz);
      }
      for (let lx = -1; lx <= 2; lx++) for (let lz = -1; lz <= 2; lz++) box('planks', lx, 0, lz, 1, 0.1, 1, 0.03);
      [[3, [-2, 3]], [4, [-1, 2]], [5, [0, 1]]].forEach(([gy, xs]) => {
        for (let lz = -2; lz <= 3; lz++) xs.forEach((lx) => block('roof', lx, gy, lz));
      });
      [-1, 2].forEach((lz) => {
        for (let lx = -1; lx <= 2; lx++) block('planks', lx, 3, lz);
        [0, 1].forEach((lx) => block('planks', lx, 4, lz));
      });
      block('craft', -3, 0, 0);
      block(`furnace@${facing('x')}`, -3, 0, 1);
      block(`chest@${facing('x')}`, -3, 0, 2);
      [[-3, -2, 'poppy'], [3, -2, 'tuft'], [-2, 3, 'dandelion']].forEach(([lx, lz, type]) => plant(type, lx, lz));
      torch(-2, -2);
      torch(3, -2);
    } else if (kind === 'mine') {
      const rand = seeded(53);
      for (let lx = -2; lx <= 2; lx++) for (let lz = -2; lz <= -1; lz++) {
        const h = lz === -1 ? 3 : 4 - (Math.abs(lx) === 2 ? 1 : 0);
        for (let gy = 0; gy < h; gy++) {
          const frame = lz === -1 && Math.abs(lx) <= 1 && gy <= 2;
          if (frame && lx === 0 && gy < 2) continue;
          const top = gy === h - 1;
          block(frame ? 'log' : top ? 'grass' : rand() > 0.82 ? `ore${Math.floor(rand() * 4)}` : rand() > 0.5 ? 'cobble' : 'stone', lx, gy, lz);
        }
      }
      box('opening', 0, 0, -1.6, 0.98, 1.98, 1.2);
      for (let lz = -1; lz <= 3; lz++) box('rail', 0, 0, lz, 1, 0.06, 1, 0.03);
      [[2, 1, 'ore0'], [-2, 2, 'ore2'], [2, 3, 'ore1'], [-2, 0, 'ore3']].forEach(([lx, lz, type]) => block(type, lx, 0, lz));
      [[-1, 2], [-1, 3], [1, 3]].forEach(([lx, lz]) => box('gravel', lx, 0, lz, 1, 0.5, 1));
      plant('tuft', 3, 1);
      plant('dandelion', -3, 3);
      torch(-1, 0.6);
      torch(1, 0.6);
    } else {
      for (let lx = -2; lx <= 2; lx++) for (let lz = -1; lz <= 2; lz++) {
        if (lx === 0) box('water', lx, 0, lz, 1, 0.1, 1, 0.04);
        else {
          box('farmland', lx, 0, lz, 1, 0.14, 1);
          const ripe = Math.abs(lx * 3 + lz) % 4 !== 0;
          plant(ripe ? 'wheat' : 'sprout', lx, lz, ripe ? 0.95 : 0.6, 0.14 * B);
        }
      }
      const ring = (lx, lz) => lx >= -3 && lx <= 3 && lz >= -2 && lz <= 3 && (Math.abs(lx) === 3 || lz === -2 || lz === 3);
      const gate = (lx, lz) => lx === -3 && (lz === 0 || lz === 1);
      for (let lx = -3; lx <= 3; lx++) for (let lz = -2; lz <= 3; lz++) {
        if (!ring(lx, lz)) continue;
        if (gate(lx, lz)) [-0.38, 0.38].forEach((o) => box('planks', lx, 0.3, lz + o, 0.12, 0.9, 0.12));
        else box('planks', lx, 0, lz, 0.25, 1.5, 0.25);
        const rails = gate(lx, lz) ? [0.4, 1.0] : [0.375, 0.75].map((f) => f * 1.5);
        if (ring(lx + 1, lz)) rails.forEach((gy) => box('planks', lx + 0.5, gy, lz, 1, 0.19, 0.12));
        if (ring(lx, lz + 1)) rails.forEach((gy) => box('planks', lx, gy, lz + 0.5, 0.12, 0.19, 1));
      }
      [[-4, 0, 'poppy'], [4, -3, 'dandelion'], [-4, 3, 'tuft']].forEach(([lx, lz, type]) => plant(type, lx, lz));
      torch(3, 3, 1.5);
      [[0.4, 4.6], [-1.6, 4.9]].forEach(([lx, lz], i) => chickens.push({ at: world(lx, lz), phase: i * 2.1 }));
      const [bx, bz] = world(0.5, 0.5);
      bees.push({ at: [bx, 0.7, bz], rx: 0.8, rz: 0.55, phase: 0 }, { at: [bx, 0.85, bz], rx: 0.55, rz: 0.8, phase: 2.6 });
    }
  });

  const rand = seeded(2024);
  const reach = vignettes[0].at[0] * -1 + 2.6;
  for (let i = 0; i < 260 && (plants.tuft?.length || 0) < 70; i++) {
    const x = (rand() * 2 - 1) * reach;
    const z = (rand() * 2 - 1) * reach;
    const nearVignette = vignettes.some(({ at }) => Math.abs(x - at[0]) < 2.4 && Math.abs(z - at[1]) < 2.4);
    if (nearVignette || !clearOfPlay(layout, x, z, 0.3)) continue;
    const roll = rand();
    const type = roll < 0.74 ? 'tuft' : roll < 0.87 ? 'poppy' : 'dandelion';
    (plants[type] ||= []).push({ at: [x, 0, z], size: [B * 0.9, B * (0.7 + rand() * 0.4), B * 0.9], turn: rand() > 0.5 ? 1 : 0 });
  }
  return { blocks, plants, torches, sheep, chickens, bees, clouds: cloudShapes(6) };
}

function Instances({ geometry, material, items, shadows = true }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const none = new THREE.Quaternion();
    turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    items.forEach(({ at, size, turn: t }, i) => ref.current.setMatrixAt(i, matrix.compose(new THREE.Vector3(...at), t ? turn : none, new THREE.Vector3(...size))));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadows} receiveShadow dispose={null} />;
}

let sheepLook = null;
const sheepMaterials = () => (sheepLook ||= {
  WOOL: new THREE.MeshStandardMaterial({ map: texture('wool'), roughness: 1 }),
  SKIN: new THREE.MeshStandardMaterial({ color: '#d9c3a6', roughness: 0.9 }),
  EYE: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 }),
});

function Sheep({ at, rx, rz, phase }) {
  const { WOOL, SKIN, EYE } = sheepMaterials();
  const body = useRef();
  const head = useRef();
  const legs = useRef([]);
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime + phase * 5;
    const cycle = t % 11;
    const walking = cycle < 7;
    const walked = Math.floor(t / 11) * 7 + Math.min(cycle, 7);
    const a = walked * 0.38;
    const g = body.current;
    g.position.set(at[0] + Math.cos(a) * rx, 0, at[1] + Math.sin(a) * rz);
    g.rotation.y = -Math.atan2(Math.cos(a) * rz, -Math.sin(a) * rx);
    const swing = walking ? Math.sin(t * 7) * 0.5 : 0;
    legs.current.forEach((leg, i) => leg && (leg.rotation.z = i % 3 ? swing : -swing));
    head.current.rotation.z = walking ? 0 : -0.55 + Math.sin(t * 5) * 0.08;
  });
  return (
    <group ref={body}>
      <mesh material={WOOL} position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[0.56, 0.36, 0.38]} />
      </mesh>
      <group ref={head} position={[0.3, 0.46, 0]}>
        <mesh material={SKIN} position={[0.1, 0, 0]} castShadow>
          <boxGeometry args={[0.22, 0.22, 0.2]} />
        </mesh>
        <mesh material={WOOL} position={[0.02, 0.04, 0]}>
          <boxGeometry args={[0.1, 0.24, 0.24]} />
        </mesh>
        {[-0.06, 0.06].map((z) => (
          <mesh key={z} material={EYE} position={[0.215, 0.03, z]}>
            <boxGeometry args={[0.01, 0.04, 0.04]} />
          </mesh>
        ))}
      </group>
      {[[0.18, 0.12], [0.18, -0.12], [-0.18, 0.12], [-0.18, -0.12]].map(([x, z], i) => (
        <group key={i} ref={(el) => (legs.current[i] = el)} position={[x, 0.22, z]}>
          <mesh material={SKIN} position={[0, -0.11, 0]} castShadow>
            <boxGeometry args={[0.1, 0.22, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

let critterLook = null;
const critterMaterials = () => (critterLook ||= {
  WHITE: new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 1 }),
  COMB: new THREE.MeshStandardMaterial({ color: '#c8322a', roughness: 0.8 }),
  BEAK: new THREE.MeshStandardMaterial({ color: '#e9a52c', roughness: 0.8 }),
  BEE: new THREE.MeshStandardMaterial({ color: '#e9b41c', roughness: 0.9 }),
  STRIPE: new THREE.MeshStandardMaterial({ color: '#2a2418', roughness: 0.9 }),
  WING: new THREE.MeshStandardMaterial({ color: '#dff4ff', transparent: true, opacity: 0.6, roughness: 0.6, side: THREE.DoubleSide }),
});

function Chicken({ at: [x, z], phase }) {
  const { WHITE, COMB, BEAK, EYE } = { ...critterMaterials(), EYE: sheepMaterials().EYE };
  const body = useRef();
  const head = useRef();
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime + phase;
    const beat = t % 6;
    const pecking = beat > 3.6;
    body.current.rotation.y = phase + Math.sin(t * 0.3) * 0.8;
    body.current.position.y = pecking ? 0 : Math.abs(Math.sin(t * 6)) * 0.04;
    head.current.rotation.z = pecking ? -0.9 + Math.abs(Math.sin(t * 9)) * 0.5 : 0;
  });
  return (
    <group ref={body} position={[x, 0, z]}>
      <mesh material={WHITE} position={[0, 0.27, 0]} castShadow>
        <boxGeometry args={[0.3, 0.22, 0.2]} />
      </mesh>
      <group ref={head} position={[0.13, 0.4, 0]}>
        <mesh material={WHITE} position={[0.03, 0, 0]} castShadow>
          <boxGeometry args={[0.14, 0.2, 0.12]} />
        </mesh>
        <mesh material={COMB} position={[0.03, 0.12, 0]}>
          <boxGeometry args={[0.06, 0.05, 0.05]} />
        </mesh>
        <mesh material={BEAK} position={[0.13, -0.02, 0]}>
          <boxGeometry args={[0.07, 0.05, 0.07]} />
        </mesh>
        <mesh material={COMB} position={[0.1, -0.08, 0]}>
          <boxGeometry args={[0.03, 0.05, 0.05]} />
        </mesh>
        {[-0.065, 0.065].map((dz) => (
          <mesh key={dz} material={EYE} position={[0.08, 0.03, dz]}>
            <boxGeometry args={[0.03, 0.03, 0.01]} />
          </mesh>
        ))}
      </group>
      {[-0.06, 0.06].map((dz) => (
        <mesh key={dz} material={BEAK} position={[0, 0.08, dz]}>
          <boxGeometry args={[0.03, 0.16, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}

function Bee({ at: [x, y, z], rx, rz, phase }) {
  const { BEE, STRIPE, WING } = critterMaterials();
  const body = useRef();
  const wings = useRef([]);
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime * 0.7 + phase;
    const g = body.current;
    g.position.set(x + Math.cos(t) * rx, y + Math.sin(t * 2.3) * 0.12, z + Math.sin(t) * rz);
    g.rotation.y = -Math.atan2(Math.cos(t) * rz, -Math.sin(t) * rx);
    const flap = still?.matches ? 0.3 : 0.2 + Math.abs(Math.sin(clock.elapsedTime * 40)) * 0.8;
    wings.current.forEach((w, i) => w && (w.rotation.x = (i ? 1 : -1) * flap));
  });
  return (
    <group ref={body}>
      <mesh material={BEE} castShadow>
        <boxGeometry args={[0.22, 0.14, 0.14]} />
      </mesh>
      {[-0.04, 0.05].map((dx) => (
        <mesh key={dx} material={STRIPE} position={[dx, 0, 0]}>
          <boxGeometry args={[0.035, 0.145, 0.145]} />
        </mesh>
      ))}
      <mesh material={STRIPE} position={[-0.13, 0, 0]}>
        <boxGeometry args={[0.04, 0.03, 0.03]} />
      </mesh>
      {[-0.07, 0.07].map((dz, i) => (
        <mesh key={dz} ref={(el) => (wings.current[i] = el)} material={WING} position={[0.02, 0.08, dz]}>
          <boxGeometry args={[0.1, 0.01, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

const CLOUD = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.82 });
const CLOUD_SHADOW = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
const SHADE = new THREE.Color('#c4cfbf');
const SUNLIT = new THREE.Color('#ffffff');
const GROUND_QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
// Matches the key light in Stage.js, so painted shadows land where real ones would
const SUN = new THREE.Vector3(7, 18, 9);

// Cloud shadows are painted, not cast: the shadow map only covers the table and clipped them at its edge
function Clouds({ clouds }) {
  const ref = useRef();
  const shade = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const count = clouds.reduce((n, c) => n + c.cells.length, 0);
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime;
    let i = 0;
    clouds.forEach((cloud) => {
      const z = ((cloud.z + t * cloud.speed + 26) % 52) - 26;
      const dx = (-SUN.x / SUN.y) * cloud.y;
      const dz = (-SUN.z / SUN.y) * cloud.y;
      tint.lerpColors(SUNLIT, SHADE, Math.min(1, (26 - Math.abs(z)) / 6));
      cloud.cells.forEach(([cx, cz]) => {
        shade.current.setColorAt(i, tint);
        dummy.position.set(cloud.x + cx * 1.4, cloud.y, z + cz * 1.4);
        dummy.scale.set(1.4, 0.3, 1.4);
        dummy.updateMatrix();
        ref.current.setMatrixAt(i, dummy.matrix);
        dummy.position.set(cloud.x + cx * 1.4 + dx, 0.02, z + cz * 1.4 + dz);
        dummy.scale.set(1.4, 1, 1.4);
        dummy.updateMatrix();
        shade.current.setMatrixAt(i++, dummy.matrix);
      });
    });
    ref.current.instanceMatrix.needsUpdate = true;
    shade.current.instanceMatrix.needsUpdate = true;
    shade.current.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={ref} args={[CUBE, CLOUD, count]} frustumCulled={false} dispose={null} />
      <instancedMesh ref={shade} args={[GROUND_QUAD, CLOUD_SHADOW, count]} frustumCulled={false} renderOrder={-1} dispose={null} />
    </>
  );
}

function Torch({ at, phase }) {
  const flame = useRef();
  const glow = useRef();
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  useFrame(({ clock }) => {
    const t = still?.matches ? 0 : clock.elapsedTime;
    const flicker = 0.9 + 0.1 * Math.sin(t * 7.1 + phase) * Math.sin(t * 3.7 + phase);
    flame.current.scale.y = flicker;
    glow.current.material.opacity = 0.16 * flicker;
  });
  return (
    <group position={at}>
      <mesh ref={flame} position-y={0.02}>
        <boxGeometry args={[0.07, 0.08, 0.07]} />
        <meshBasicMaterial color="#ffe7a6" toneMapped={false} />
      </mesh>
      <mesh position-y={-0.03}>
        <boxGeometry args={[0.075, 0.035, 0.075]} />
        <meshBasicMaterial color="#ff9a2e" toneMapped={false} />
      </mesh>
      <mesh ref={glow} position-y={0.03 - at[1]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.85, 20]} />
        <meshBasicMaterial color="#ffc76a" transparent opacity={0.16} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

export default function MinecraftProps({ layout, y, preview = false }) {
  const { blocks, plants, torches, sheep, chickens, bees, clouds } = useMemo(() => campsiteBlocks(layout), [layout]);
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  useFrame(({ clock }) => {
    const water = texture('water');
    if (!still?.matches) water.offset.set(clock.elapsedTime * 0.02, clock.elapsedTime * 0.05);
  });
  return (
    <group position-y={y}>
      {Object.entries(blocks).map(([key, items]) => <Instances key={key} geometry={CUBE} material={materialFor(key)} items={items} shadows={key !== 'water' && key !== 'rail'} />)}
      {Object.entries(plants).map(([key, items]) => <Instances key={key} geometry={CROSS} material={materialFor(key)} items={items} shadows={false} />)}
      {sheep.map((s, i) => <Sheep key={i} {...s} />)}
      {chickens.map((c, i) => <Chicken key={i} {...c} />)}
      {bees.map((b, i) => <Bee key={i} {...b} />)}
      {!preview && <Clouds clouds={clouds} />}
      {torches.map((at, i) => <Torch key={i} at={at} phase={i * 2.3} />)}
    </group>
  );
}

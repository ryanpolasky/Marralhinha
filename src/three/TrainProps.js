import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from './PicnicProps';
import { makeCanvas, seeded } from './textures';

export const ROOF_HALF = 11;
export const DROP = 24;
const CAR_L = 72;
const GAP = 5;
const PITCH = CAR_L + GAP;
const CARS = [-3, -2, -1, 0, 1, 2, 3];
const PREVIEW_CARS = [0];
const SPEED = 110;
const WRAP = 2048;
const BLUR = 1.6;
const POLE_X = -27;
const POLE_GAP = 48;
const SCENERY_LEN = 256;
const SIDE_TRACK = 30;
const SUN = new THREE.Vector3(7, 18, 9).normalize();

const LOOK = {
  paint: '#b7bcc1', paintDark: '#80868c', trim: '#6c7176',
  trees: { trunk: ['#4f6b3a', '#5d7a45'], crown: ['#6f8a4a', '#7c9655'] },
  ballast: '0.55, 0.47, 0.38', sleeper: '0.30, 0.22, 0.15',
};

const canvasTex = (canvas, repeat) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  return t;
};

function grime(ctx, w, h, rand, count, color) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(${color},${0.03 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 4 + rand() * 40, 2 + rand() * 18, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 512px = the roof's full width; tiles along the car
function roofCanvas(look) {
  const S = 512;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(41);
  ctx.fillStyle = look.paint;
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, S);
  }
  grime(ctx, S, S, rand, 120, '60,55,50');
  [[S / 2 - 40, 120], [S / 2 + 10, 360]].forEach(([x, y]) => {
    ctx.fillStyle = '#5c6166';
    ctx.fillRect(x, y, 30, 70);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let k = 0; k < 6; k++) ctx.fillRect(x + 4, y + 6 + k * 11, 22, 4);
  });
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 10, S);
  ctx.fillRect(S - 10, 0, 10, S);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let y = 8; y < S; y += 22) {
    ctx.fillRect(4, y, 3, 3);
    ctx.fillRect(S - 7, y, 3, 3);
  }
  return canvas;
}

// The whole car side, one end to the other
function sideCanvas(look) {
  const W = 1024;
  const H = 288;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = look.paint;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < H; y += 12) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, y + 8, W, 3);
  }
  ctx.fillStyle = '#a3262a';
  ctx.fillRect(0, H * 0.62, W, 18);
  for (let x = 50; x < W - 60; x += 74) {
    const g = ctx.createLinearGradient(x, 60, x + 52, 130);
    g.addColorStop(0, '#2f3d48');
    g.addColorStop(0.5, '#151c22');
    g.addColorStop(1, '#3d4d58');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, 58, 54, 80, 10);
    ctx.fill();
  }
  ctx.fillStyle = '#a3262a';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('MARRALHINHA ZEPHYR', W / 2, H * 0.82);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, H - 10, W, 10);
  return canvas;
}

const GLSL = `
uniform float uRun;
uniform vec2 uSun;
varying vec3 vRail;
float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rn(vec2 p, float per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, per);
  float y1 = mod(i.y + 1.0, per);
  return mix(mix(rh(vec2(i.x, y0)), rh(vec2(i.x + 1.0, y0)), f.x), mix(rh(vec2(i.x, y1)), rh(vec2(i.x + 1.0, y1)), f.x), f.y);
}
vec4 track(float x, float z, float fw) {
  float ax = abs(x);
  float edge = 10.0 + rn(vec2(x * 0.0, z / 4.0), ${WRAP / 4}.0) * 1.8;
  float a = 1.0 - smoothstep(edge - 1.2, edge, ax);
  float g = mix(rn(vec2(x, z) * 2.0, ${WRAP * 2}.0), 0.5, smoothstep(0.2, 0.7, fw));
  vec3 col = vec3(BALLAST) * (0.72 + 0.5 * g);
  float tie = step(ax, 7.6) * step(fract(z / 3.2), 0.38);
  col = mix(col, vec3(SLEEPER) * (0.8 + 0.4 * rh(vec2(mod(floor(z / 3.2), 640.0), 3.0))), tie);
  float d = abs(ax - 6.0);
  float rail = 1.0 - smoothstep(0.3, 0.3 + fw, d);
  float head = 1.0 - smoothstep(0.1, 0.1 + fw, d);
  col = mix(col, vec3(0.24, 0.2, 0.18), rail);
  col = mix(col, vec3(0.78, 0.8, 0.82), head * 0.85);
  return vec4(col, a);
}
vec3 terrain(vec2 p, float fw) {
  float lo = rn(p / 32.0, ${WRAP / 32}.0);
  float hi = mix(rn(p / 2.0, ${WRAP / 2}.0), 0.5, smoothstep(0.4, 1.2, fw));
  float rowFade = 1.0 - smoothstep(0.3, 0.9, fw * 2.4);
  vec3 col = mix(vec3(0.71, 0.53, 0.33), vec3(0.83, 0.66, 0.43), lo);
  col *= 0.88 + 0.24 * hi;
  float dune = 0.5 + 0.5 * sin(p.x * 0.35 + lo * 6.0);
  col *= 0.9 + 0.14 * dune * rowFade;
  vec2 cell = floor(p / 8.0);
  vec2 cw = vec2(cell.x, mod(cell.y, ${WRAP / 8}.0));
  vec2 o = vec2(rh(cw), rh(cw + 7.1)) * 5.0 + 1.5;
  float bush = 1.0 - smoothstep(0.7, 1.3 + fw, length(p - cell * 8.0 - o));
  col = mix(col, vec3(0.36, 0.36, 0.2), bush * step(0.55, rh(cw + 3.3)));
  float wash = 1.0 - smoothstep(0.0, 3.0, abs(p.x - 58.0 + 18.0 * sin(p.y / 256.0 * 6.2832)));
  col = mix(col, vec3(0.58, 0.42, 0.27), wash * 0.7);
  return col;
}
vec3 groundAt(vec2 p, float fw) {
  vec3 col = terrain(p, fw);
  vec4 a = track(p.x, p.y, fw);
  col = mix(col, a.rgb, a.a);
  vec4 b = track(p.x - ${SIDE_TRACK}.0, p.y + 17.0, fw);
  return mix(col, b.rgb, b.a);
}
float trainShade(vec2 q) {
  float lo = -${ROOF_HALF}.0 + min(0.0, uSun.x * ${DROP}.0);
  float hi = ${ROOF_HALF}.0 + max(0.0, uSun.x * ${DROP}.0);
  float s = smoothstep(lo - 1.5, lo + 1.5, q.x) * (1.0 - smoothstep(hi - 1.5, hi + 1.5, q.x));
  return 1.0 - 0.5 * s;
}
`;

const BODY = `
float gfw = fwidth(vRail.x) + fwidth(vRail.z);
vec3 gsum = vec3(0.0);
for (int i = 0; i < 5; i++) gsum += groundAt(vec2(vRail.x, vRail.z - uRun + (float(i) - 2.0) * ${(BLUR / 4).toFixed(3)}), gfw);
diffuseColor.rgb = pow(gsum * 0.2, vec3(2.2)) * trainShade(vRail.xz);
`;

function groundMaterial(look, uniforms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  m.customProgramCacheKey = () => 'train-ground';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRail;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRail = transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#define BALLAST ${look.ballast}\n#define SLEEPER ${look.sleeper}\n${GLSL}`)
      .replace('#include <map_fragment>', BODY);
  };
  return m;
}

const GROUND_GEO = new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2);

function poleGeometry() {
  const parts = [];
  const H = 30;
  for (let z = -6 * POLE_GAP; z <= 6 * POLE_GAP; z += POLE_GAP) {
    parts.push(new THREE.CylinderGeometry(0.32, 0.45, H, 6).translate(POLE_X, H / 2, z));
    parts.push(new THREE.BoxGeometry(7, 0.45, 0.45).translate(POLE_X, H - 2.2, z));
    [-3, -1, 1, 3].forEach((dx) => parts.push(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 5).translate(POLE_X + dx, H - 1.65, z)));
    if (z < 6 * POLE_GAP) {
      [-3, 3].forEach((dx) => {
        const a = new THREE.Vector3(POLE_X + dx, H - 1.35, z);
        const b = new THREE.Vector3(POLE_X + dx, H - 1.35, z + POLE_GAP);
        const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -1.6, 0));
        parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 12, 0.06, 3, false));
      });
    }
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

function sceneryEntries(look) {
  const rand = seeded(110);
  const out = [];
  for (let i = 0; i < 400 && out.length < 34; i++) {
    const side = rand() > 0.5 ? 1 : -1;
    const x = side > 0 ? SIDE_TRACK + 16 + rand() * 140 : POLE_X - 9 - rand() * 140;
    const z = rand() * SCENERY_LEN;
    const size = 0.75 + rand() * 0.6;
    if (out.every((t) => Math.hypot(t.x - x, t.z - z) > 10)) out.push({ x, z, size, phase: rand() * Math.PI * 2 });
  }
  return [-2, -1, 0, 1].flatMap((k) => out.map((t) => ({ ...t, z: t.z + k * SCENERY_LEN })));
}

const CACTUS = [new THREE.CylinderGeometry(0.9, 1, 9, 7).translate(0, 4.5, 0), mergeGeometries([new THREE.CylinderGeometry(0.6, 0.6, 4, 6).translate(2.1, 6, 0), new THREE.CylinderGeometry(0.6, 0.6, 3, 6).translate(-1.9, 7.4, 0), new THREE.BoxGeometry(2.4, 0.9, 0.9).translate(1, 4, 0), new THREE.BoxGeometry(2, 0.9, 0.9).translate(-1, 5.6, 0)])];

function Scenery({ look }) {
  const entries = useMemo(() => sceneryEntries(look), [look]);
  const [stem, crown] = CACTUS;
  const refs = [useRef(), useRef()];
  React.useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    entries.forEach((e, i) => {
      d.position.set(e.x, 0, e.z);
      d.rotation.set(0, e.phase, 0);
      d.scale.setScalar(e.size);
      d.updateMatrix();
      refs.forEach((r, k) => {
        r.current.setMatrixAt(i, d.matrix);
        const pal = k ? look.trees.crown : look.trees.trunk;
        r.current.setColorAt(i, c.set(pal[i % pal.length]));
      });
    });
    refs.forEach((r) => {
      r.current.instanceMatrix.needsUpdate = true;
      r.current.instanceColor.needsUpdate = true;
      r.current.computeBoundingSphere();
    });
  }, [entries, look]); // eslint-disable-line react-hooks/exhaustive-deps
  return [stem, crown].map((g, k) => (
    <instancedMesh key={k} ref={refs[k]} args={[g, null, entries.length]} frustumCulled={false}>
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  ));
}

function trainGeometries() {
  const bodyH = DROP - 4.3;
  const roof = new THREE.BoxGeometry(ROOF_HALF * 2, 0.7, CAR_L).translate(0, -0.35, 0);
  const body = new THREE.BoxGeometry(ROOF_HALF * 2 - 0.6, bodyH - 0.7, CAR_L - 0.6).translate(0, -0.7 - (bodyH - 0.7) / 2, 0);
  const under = [];
  [-1, 1].forEach((end) => {
    const bz = end * (CAR_L / 2 - 11);
    under.push(new THREE.BoxGeometry(15, 2.4, 10).translate(0, -DROP + 3.4, bz));
    [-2.8, 2.8].forEach((dz) =>
      [-6, 6].forEach((x) => under.push(new THREE.CylinderGeometry(1.9, 1.9, 0.8, 14).rotateZ(Math.PI / 2).translate(x, -DROP + 2.5, bz + dz)))
    );
    under.push(new THREE.BoxGeometry(2, 1.6, GAP + 1).translate(0, -DROP + 6.2, end * (CAR_L / 2 + GAP / 2)));
  });
  const running = mergeGeometries(under);
  under.forEach((g) => g.dispose());
  return { roof, body, running };
}

function CarSet({ geometry, material, cars }) {
  const ref = useRef();
  React.useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    cars.forEach((k, i) => ref.current.setMatrixAt(i, m.makeTranslation(0, 0, k * PITCH)));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [cars]);
  return <instancedMesh ref={ref} args={[geometry, material, cars.length]} receiveShadow frustumCulled={false} />;
}

export default function TrainProps({ y = 0, preview = false }) {
  const look = LOOK;
  const cars = preview ? PREVIEW_CARS : CARS;
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)'), []);
  const uniforms = useMemo(() => ({ uRun: { value: 0 }, uSun: { value: new THREE.Vector2() } }), []);
  const ground = useMemo(() => groundMaterial(look, uniforms), [look, uniforms]);
  const geos = useMemo(trainGeometries, []);
  const poles = useMemo(poleGeometry, []);
  const mats = useMemo(() => {
    const roofTex = canvasTex(roofCanvas(look), [1, CAR_L / (ROOF_HALF * 2)]);
    const sideTex = canvasTex(sideCanvas(look));
    const metal = 0.6;
    const side = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.6, metalness: metal });
    const end = new THREE.MeshStandardMaterial({ color: look.paintDark, roughness: 0.7, metalness: metal });
    const trim = new THREE.MeshStandardMaterial({ color: look.trim, roughness: 0.6, metalness: 0.4 });
    const roof = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.72, metalness: metal });
    return {
      roof: [trim, trim, roof, trim, trim, trim],
      body: [side, side, end, end, end, end],
      running: new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.55, metalness: 0.6 }),
      pole: new THREE.MeshStandardMaterial({ color: '#4a3b2e', roughness: 0.9 }),
    };
  }, [look]);
  const poleRef = useRef();
  const treeRef = useRef();
  const root = useRef();
  const sun = useMemo(() => ({ dir: new THREE.Vector3(), inv: new THREE.Matrix4() }), []);
  useFrame(({ clock }) => {
    if (!root.current || root.current.parent?.visible === false) return;
    const t = window.__trainT ?? (still?.matches ? 0 : clock.elapsedTime);
    const run = t * SPEED;
    uniforms.uRun.value = run % WRAP;
    poleRef.current.position.z = run % POLE_GAP;
    treeRef.current.position.z = run % SCENERY_LEN;
    sun.inv.copy(root.current.matrixWorld).invert();
    sun.dir.copy(SUN).transformDirection(sun.inv);
    uniforms.uSun.value.set(-sun.dir.x / sun.dir.y, -sun.dir.z / sun.dir.y);
  });
  return (
    <group ref={root} position-y={y}>
      <CarSet geometry={geos.roof} material={mats.roof} cars={cars} />
      <CarSet geometry={geos.body} material={mats.body} cars={cars} />
      <CarSet geometry={geos.running} material={mats.running} cars={cars} />
      <group position-y={-DROP} visible={!preview}>
        <mesh geometry={GROUND_GEO} material={ground} />
        <group ref={poleRef}>
          <mesh geometry={poles} material={mats.pole} frustumCulled={false} />
        </group>
        <group ref={treeRef}>
          <Scenery look={look} />
        </group>
      </group>
    </group>
  );
}

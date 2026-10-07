import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';
import { MARBLE_R, worldOf } from './Marbles';
import { BUBBLE_ASPECT, bloodTextures, makeBubbleTexture } from './textures';
import { SEAT_COLORS } from '../game/geometry';
import { HIT, UNDO_S, clamp01, hitClock, undoClock, hitGeo } from '../game/hits';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const BARREL_GEO = new THREE.CylinderGeometry(0.032, 0.032, 0.1, 12);
const GUARD_GEO = new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI * 1.3);
const FLASH_GEO = new THREE.SphereGeometry(0.1, 12, 8);
const TRACER_GEO = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
const AIM_GEO = new THREE.RingGeometry(0.46, 0.58, 40);

const STEEL = new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.32, metalness: 0.85 });
const GRIP = new THREE.MeshStandardMaterial({ color: '#3a2a1f', roughness: 0.75, metalness: 0.05 });
const PLANE_GEO = new THREE.PlaneGeometry(1, 1);
const POOL_SIZE = 1.8;
// Board top is y=0 with hole lips at 0.007 and brass plates at 0.01; sit just over them
const BLOOD_Y = 0.012;
const SPRAY_SIZE = [3.2, 1.6];
// Blood is cut hard at the edge of the wood (the plus-shaped board and the four base dishes), so none hangs over the table
const BLOOD_CLIP = {
  uBoardInv: { value: new THREE.Matrix4() },
  uHalf: { value: new THREE.Vector2(2.75, 8.75) },
  uDish: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) },
  uDishR: { value: 2.2 },
};
const CLIP_VERT = 'varying vec3 vBoardPos;\nuniform mat4 uBoardInv;';
const CLIP_FRAG = `
varying vec3 vBoardPos;
uniform vec2 uHalf;
uniform vec2 uDish[4];
uniform float uDishR;
float bloodBox(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
bool onWood(vec2 p) {
  float r = min(0.65, uHalf.x * 0.35);
  if (min(bloodBox(p, uHalf, r), bloodBox(p, uHalf.yx, r)) < -0.04) return true;
  for (int i = 0; i < 4; i++) if (length(p - uDish[i]) < uDishR - 0.05) return true;
  return false;
}`;
let bloodMats = null;
const bloodMaterials = () => {
  bloodMats ??= bloodTextures().map((map) => {
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.16, metalness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, BLOOD_CLIP);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${CLIP_VERT}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBoardPos = (uBoardInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>${CLIP_FRAG}`)
        .replace('#include <clipping_planes_fragment>', 'if (!onWood(vBoardPos.xz)) discard;\n#include <clipping_planes_fragment>');
    };
    material.customProgramCacheKey = () => 'blood-clip';
    return material;
  });
  return bloodMats;
};

const GUN_Y = 0.26;
const GUN_GAP = MARBLE_R + 0.2;
const MUZZLE_X = 0.4;
const backOut = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;
const _v = new THREE.Vector3();

function Gun() {
  return (
    <group>
      <mesh geometry={BOX} material={STEEL} position={[0.08, 0.06, 0]} scale={[0.5, 0.11, 0.085]} castShadow />
      <mesh geometry={BOX} material={STEEL} position={[0.06, -0.02, 0]} scale={[0.38, 0.06, 0.075]} />
      <mesh geometry={BARREL_GEO} material={STEEL} position={[0.35, 0.06, 0]} rotation-z={Math.PI / 2} />
      <mesh geometry={BOX} material={GRIP} position={[-0.09, -0.14, 0]} rotation-z={-0.28} scale={[0.11, 0.25, 0.08]} castShadow />
      <mesh geometry={GUARD_GEO} material={STEEL} position={[0.04, -0.06, 0]} rotation-z={Math.PI * 1.1} />
      <mesh geometry={BOX} material={STEEL} position={[-0.17, 0.12, 0]} rotation-z={0.5} scale={[0.05, 0.06, 0.04]} />
    </group>
  );
}

const BUBBLE_W = 2.6;

function Bubble({ hit, text, color, at, from, until }) {
  const ref = useRef();
  const tex = useMemo(() => makeBubbleTexture(text, color), [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    const t = hitClock(hit);
    const s = undoClock(hit) !== null ? 0 : backOut(clamp01((t - from) / 0.3)) * (1 - clamp01((t - until) / 0.2));
    ref.current.visible = s > 0.001;
    ref.current.scale.set(BUBBLE_W * Math.max(0.001, s), BUBBLE_W * BUBBLE_ASPECT * Math.max(0.001, s), 1);
  });
  return (
    <sprite ref={ref} position={at} center={[0.5, 0]} renderOrder={14} visible={false}>
      <spriteMaterial map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function HitFx({ hit, board, layout }) {
  const root = useRef();
  const gun = useRef();
  const flash = useRef();
  const tracer = useRef();
  const pool = useRef();
  const spray = useRef();
  const fired = useRef(null);
  const [poolMat, sprayMat] = bloodMaterials();
  const geo = hitGeo(hit, board);
  const { dir } = geo;
  const yaw = Math.atan2(-dir[1], dir[0]);
  const from = { x: geo.from[0], z: geo.from[1] };
  const to = { x: geo.to[0], z: geo.to[1] };
  const reach = Math.max(0.2, Math.hypot(to.x - from.x, to.z - from.z) - MARBLE_R - GUN_GAP - MUZZLE_X);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, toneMapped: false, depthWrite: false }), []);
  // A rematch or leaving the table drops the hit without an undo, so hand the camera back
  useEffect(
    () => () => {
      const f = fired.current;
      if (f && (f.has('focus') || f.has('orbit')) && !f.has('unfocus')) fx.emit('unfocus');
    },
    []
  );

  useFrame(() => {
    const t = hitClock(hit);
    const u = undoClock(hit);
    const back = u === null ? 1 : 1 - clamp01(u / UNDO_S);
    // Late joiners and refreshes land mid-bit without replaying the beats they missed
    const beats = { focus: HIT.push, shot: HIT.shot, orbit: HIT.orbit };
    // The orbit never expires, so anyone landing late still gets swept into it
    if (!fired.current) fired.current = new Set(['focus', 'shot'].filter((k) => beats[k] < t - 0.5));
    const fire = (key, fn) => {
      if (u !== null || t < beats[key] || fired.current.has(key)) return;
      fired.current.add(key);
      fn();
    };
    const along = (k) => root.current.localToWorld(_v.set(from.x + (to.x - from.x) * k, 0, from.z + (to.z - from.z) * k)).toArray();
    fire('focus', () => fx.emit('focus', { at: along(0.25), dur: HIT.pushDur }));
    fire('orbit', () => fx.emit('orbit', { at: along(0.5) }));
    if (u !== null && (fired.current.has('focus') || fired.current.has('orbit')) && !fired.current.has('unfocus')) {
      fired.current.add('unfocus');
      fx.emit('unfocus');
    }
    const muzzle = [from.x + dir[0] * (GUN_GAP + MUZZLE_X), GUN_Y, from.z + dir[1] * (GUN_GAP + MUZZLE_X)];
    fire('shot', () => {
      fx.emit('shake', { amount: 0.6 });
      fx.emit('burst', { position: muzzle, colors: ['#fff3b0', '#ffd166', '#ffffff'], count: 14, speed: 4, up: 0.6, size: 0.05, life: 0.25, gravity: 0.2 });
      fx.emit('burst', { position: [muzzle[0], muzzle[1] + 0.05, muzzle[2]], colors: ['#8a8a8a', '#b5b5b5', '#5f5f5f'], count: 10, speed: 0.6, up: 1, size: 0.09, life: 1.4, gravity: -0.05 });
      fx.emit('burst', { position: [to.x, 0.25, to.z], colors: ['#9b0a1a', '#d1192b', '#5c0010'], count: 28, speed: 2.4, up: 2, size: 0.06, life: 0.8, gravity: 1 });
    });

    const show = backOut(clamp01((t - HIT.gun) / 0.4)) * (1 - easeOut(clamp01((t - HIT.gunOut) / 0.4))) * (u === null ? 1 : 1 - clamp01(u / 0.25));
    const g = gun.current;
    g.visible = show > 0.001;
    if (g.visible) {
      const rt = t - HIT.shot;
      const kick = rt > 0 && rt < 0.45 ? 0.7 * (1 - rt / 0.45) ** 2 : 0;
      const slide = MARBLE_R * 0.4 + (GUN_GAP - MARBLE_R * 0.4) * clamp01((t - HIT.gun) / 0.4);
      g.position.set(slide - kick * 0.12, GUN_Y + Math.sin(t * 2.2) * 0.015, 0);
      g.rotation.set(0, 0, kick + (rt < 0 ? Math.sin(t * 7) * 0.012 : 0));
      g.scale.setScalar(Math.max(0.001, show));
    }
    const rt = t - HIT.shot;
    flash.current.visible = u === null && rt >= 0 && rt < 0.09;
    if (flash.current.visible) flash.current.scale.set(2.4 + Math.random(), 1 + Math.random() * 0.5, 1 + Math.random() * 0.5);
    tracer.current.visible = u === null && rt >= 0 && rt < 0.14;
    if (tracer.current.visible) tracer.current.material.opacity = 1 - rt / 0.14;

    // Splat lands with the shot, then the pool keeps creeping out over the hole
    const hitIn = rt >= 0 ? back : 0;
    const spread = (0.4 + 0.6 * easeOut(clamp01((rt - 0.15) / 2.6))) * hitIn;
    pool.current.visible = spread > 0.001;
    pool.current.scale.set(POOL_SIZE * Math.max(0.001, spread), POOL_SIZE * Math.max(0.001, spread), 1);
    const fling = (0.5 + 0.5 * easeOut(clamp01(rt / 0.12))) * hitIn;
    spray.current.visible = fling > 0.001;
    spray.current.scale.set(SPRAY_SIZE[0] * Math.max(0.001, fling), SPRAY_SIZE[1] * Math.max(0.001, fling), 1);
  });

  const mouth = [from.x, 0.55, from.z];
  const color = SEAT_COLORS[hit.by].main;
  return (
    <group ref={root}>
      {hit.before && <Bubble hit={hit} text={hit.before} color={color} at={mouth} from={HIT.say} until={HIT.sayEnd} />}
      {hit.after && <Bubble hit={hit} text={hit.after} color={color} at={mouth} from={HIT.quip} until={HIT.quipEnd} />}
      <group position={[from.x, 0, from.z]} rotation-y={yaw}>
        <group ref={gun} visible={false}>
          <Gun />
          <mesh ref={flash} geometry={FLASH_GEO} material={flashMat} position={[MUZZLE_X + 0.1, 0.06, 0]} visible={false} />
          <mesh ref={tracer} position={[MUZZLE_X + reach / 2, 0.06, 0]} rotation-z={Math.PI / 2} scale={[1, reach, 1]} geometry={TRACER_GEO} visible={false}>
            <meshBasicMaterial color="#ffe9a8" transparent toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
      <group position={[to.x, BLOOD_Y, to.z]} rotation-y={yaw}>
        <group position-x={SPRAY_SIZE[0] / 2 - 0.2}>
          <mesh ref={spray} geometry={PLANE_GEO} material={sprayMat} rotation-x={-Math.PI / 2} renderOrder={2} visible={false} />
        </group>
        <mesh ref={pool} geometry={PLANE_GEO} material={poolMat} position-y={0.002} rotation-x={-Math.PI / 2} renderOrder={3} visible={false} />
      </group>
    </group>
  );
}

const DROPS = 1400;
const RAIN_BOX = [32, 18, 32];
const DROP_LEN = 0.7;
const WIND = 0.12;

// Streaks of rain over the whole table while any hit is live; fades in with the dolly and out on undo
function Rain({ hits }) {
  const ref = useRef();
  const level = useRef(0);
  const { geometry, speeds } = useMemo(() => {
    const pos = new Float32Array(DROPS * 6);
    const sp = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i++) {
      const x = (Math.random() - 0.5) * RAIN_BOX[0];
      const y = Math.random() * RAIN_BOX[1];
      const z = (Math.random() - 0.5) * RAIN_BOX[2];
      pos.set([x, y, z, x - WIND * DROP_LEN, y - DROP_LEN, z], i * 6);
      sp[i] = 14 + Math.random() * 8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geometry: geo, speeds: sp };
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const live = (hits || []).some((h) => !h.undone);
    level.current += ((live ? 1 : 0) - level.current) * (1 - Math.exp(-dt * (live ? 0.9 : 2)));
    const lines = ref.current;
    lines.visible = level.current > 0.01;
    if (!lines.visible) return;
    lines.material.opacity = 0.32 * level.current;
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      const fall = speeds[i] * dt;
      let y = pos[o + 1] - fall;
      let x = pos[o] - fall * WIND;
      if (y < 0) {
        y += RAIN_BOX[1];
        x = (Math.random() - 0.5) * RAIN_BOX[0];
        pos[o + 2] = pos[o + 5] = (Math.random() - 0.5) * RAIN_BOX[2];
      }
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 3] = x - WIND * DROP_LEN;
      pos[o + 4] = y - DROP_LEN;
    }
    geometry.attributes.position.needsUpdate = true;
  });
  return (
    <lineSegments ref={ref} geometry={geometry} frustumCulled={false} visible={false} renderOrder={5}>
      <lineBasicMaterial color="#b9cfdf" transparent opacity={0} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

// Pulsing rings on the marbles picked in the dev panel, so you can line the shot up with the board
function AimRing({ spot, color, board, layout }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    const pulse = Math.sin(clock.elapsedTime * 6) * 0.5 + 0.5;
    ref.current.scale.setScalar(1 + pulse * 0.3);
    ref.current.material.opacity = 0.55 + pulse * 0.45;
  });
  const pos = board.marbles[spot.seat]?.[spot.marble];
  if (!pos) return null;
  const at = worldOf(spot.seat, pos, spot.marble, layout);
  return (
    <mesh ref={ref} geometry={AIM_GEO} position={[at.x, 0.05, at.z]} rotation-x={-Math.PI / 2} renderOrder={4}>
      <meshBasicMaterial color={color} transparent toneMapped={false} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

export default function Hits({ hits, board, layout }) {
  const root = useRef();
  const [aim, setAim] = useState(null);
  useEffect(() => fx.on((type, data) => type === 'aim' && setAim(data)), []);
  useEffect(() => {
    const { halfWidth, halfLength, dishR } = layout.spec;
    BLOOD_CLIP.uHalf.value.set(halfWidth, halfLength);
    BLOOD_CLIP.uDishR.value = dishR;
    layout.BASE_TRAY.forEach(([r, c], s) => BLOOD_CLIP.uDish.value[s].set(c, r));
  }, [layout]);
  useFrame(() => {
    if (!hits?.length) return;
    root.current.updateWorldMatrix(true, false);
    BLOOD_CLIP.uBoardInv.value.copy(root.current.matrixWorld).invert();
  });
  return (
    <group ref={root}>
      <Rain hits={hits} />
      {aim?.by && <AimRing spot={aim.by} color={SEAT_COLORS[aim.by.seat].light} board={board} layout={layout} />}
      {aim?.victim && <AimRing spot={aim.victim} color="#ff3040" board={board} layout={layout} />}
      {(hits || []).map((hit) => (
        <HitFx key={hit.id} hit={hit} board={board} layout={layout} />
      ))}
    </group>
  );
}

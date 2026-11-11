import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { layoutFor } from '../game/geometry';
import { ROLL_REVEAL_MS } from '../game/moves';
import { boardSurfaceY, burnClock, cutClock, stuntClock, stuntLive } from '../game/stunts';
import { sfx } from '../game/sound';
import { makeNumberTexture } from './textures';
import { diceSkin, animateDiceSkin } from './skins';
import { skinKey } from '../game/catalog';
import { TABLE_Y, DISH_BEVEL } from './Board';
import { useRainbow } from '../game/rainbow';
import { fx } from './fx';
import { useWarmed } from './warm';

const SIZE = 0.85;
const REST_Y = TABLE_Y + SIZE / 2;
const ROLL_TIME = ROLL_REVEAL_MS / 1000;
const LAND_HOLD = 1.3;
const SPRING_STEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
const SLUG_GEO = new THREE.SphereGeometry(0.12, 20, 14);
const LEAD = new THREE.MeshStandardMaterial({ color: '#6b7075', metalness: 0.85, roughness: 0.45 });
const _down = new THREE.Vector3();
const _inv = new THREE.Quaternion();
export const HALF_FULL_ACRYLIC = new THREE.MeshPhysicalMaterial({
  color: '#f2fbfd',
  transparent: true,
  opacity: 0.16,
  roughness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.035,
  envMapIntensity: 2.6,
  depthWrite: false,
});

export function HalfFullWater({ orientation, state, size = SIZE }) {
  const surfaceRef = useRef();
  const bubbles = useRef([]);
  const planeState = useRef({ tiltX: 0, tiltZ: 0, vx: 0, vz: 0, lastLanding: -10 });
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), []);
  const planeUniform = useMemo(() => ({ value: new THREE.Vector4() }), []);
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#2f8fb8',
      roughness: 0.08,
      side: THREE.DoubleSide,
      clippingPlanes: [plane],
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uPlane = planeUniform;
      shader.uniforms.uDepth = { value: size * 0.8 };
      shader.uniforms.uDeep = { value: new THREE.Color('#1c6890') };
      shader.uniforms.uShallow = { value: new THREE.Color('#78c2da') };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;\nuniform vec4 uPlane;\nuniform float uDepth;\nuniform vec3 uDeep;\nuniform vec3 uShallow;')
        .replace('#include <opaque_fragment>', `float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
          float lit = clamp(dot(totalDiffuse, vec3(1.0)) / max(dot(diffuseColor.rgb, vec3(1.0)), 0.001), 0.0, 1.2);
          float wd = clamp(abs(dot(uPlane.xyz, vWaterWorld) + uPlane.w) / uDepth, 0.0, 1.0);
          vec3 body = uDeep * (0.68 + 0.32 * lit) * mix(1.08, 0.72, wd);
          body = mix(body, uShallow, pow(1.0 - ndv, 3.0) * 0.5);
          outgoingLight = body + totalSpecular;
          #include <opaque_fragment>
          if (!gl_FrontFacing) gl_FragColor = vec4(mix(uDeep, uShallow, 0.3), 1.0);`);
    };
    m.customProgramCacheKey = () => 'half-full-water';
    return m;
  }, [plane, planeUniform, size]);
  const waterGeometry = useMemo(() => new RoundedBoxGeometry(size * 0.86, size * 0.86, size * 0.86, 5, size * 0.11), [size]);
  const surfaceGeometry = useMemo(() => new THREE.PlaneGeometry(size * 0.78, size * 0.78), [size]);
  const worldQ = useMemo(() => new THREE.Quaternion(), []);
  const previousQ = useRef(new THREE.Quaternion());
  const deltaQ = useMemo(() => new THREE.Quaternion(), []);
  const localNormal = useMemo(() => new THREE.Vector3(), []);
  const worldNormal = useMemo(() => new THREE.Vector3(), []);
  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const surfaceQ = useMemo(() => new THREE.Quaternion(), []);
  const tangentA = useMemo(() => new THREE.Vector3(), []);
  const tangentB = useMemo(() => new THREE.Vector3(), []);
  const inverseQ = useMemo(() => new THREE.Quaternion(), []);
  const previousQuatReady = useRef(false);
  const planePoint = useMemo(() => new THREE.Vector3(), []);
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), []);
  const planeUp = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const clock = useMemo(() => ({ t: 0 }), []);
  useFrame((_, dt) => {
    if (!orientation.current) return;
    orientation.current.updateWorldMatrix(true, false);
    orientation.current.getWorldQuaternion(worldQ);
    orientation.current.getWorldPosition(worldPos);
    const step = Math.max(dt, 1 / 240);
    let omegaX = 0;
    let omegaZ = 0;
    if (previousQuatReady.current) {
      deltaQ.copy(previousQ.current).invert().multiply(worldQ).normalize();
      const angle = 2 * Math.acos(Math.min(1, Math.abs(deltaQ.w)));
      const sine = Math.sqrt(Math.max(0, 1 - deltaQ.w * deltaQ.w));
      if (sine > 0.001) {
        const rate = angle / step / sine;
        omegaX = deltaQ.x * rate;
        omegaZ = deltaQ.z * rate;
      }
    } else previousQuatReady.current = true;
    previousQ.current.copy(worldQ);
    clock.t += dt;
    const p = planeState.current;
    const rolling = !!state.roll;
    const targetX = rolling ? THREE.MathUtils.clamp(-omegaZ * 0.04, -0.24, 0.24) : 0;
    const targetZ = rolling ? THREE.MathUtils.clamp(omegaX * 0.04, -0.24, 0.24) : 0;
    if (!rolling && state.landedAt !== p.lastLanding && state.landedAt >= 0) {
      p.lastLanding = state.landedAt;
      p.vx += THREE.MathUtils.clamp(-omegaZ * 0.015, -0.18, 0.18);
      p.vz += THREE.MathUtils.clamp(omegaX * 0.015, -0.18, 0.18);
      if (Math.abs(p.vx) + Math.abs(p.vz) < 0.03) p.vx = 0.13;
    }
    const h = Math.min(dt, 0.05);
    p.vx += (targetX - p.tiltX) * 34 * h;
    p.vz += (targetZ - p.tiltZ) * 34 * h;
    p.vx *= Math.exp(-8 * h);
    p.vz *= Math.exp(-8 * h);
    p.tiltX += p.vx * h;
    p.tiltZ += p.vz * h;
    inverseQ.copy(worldQ).invert();
    localNormal.copy(down).applyQuaternion(inverseQ);
    localNormal.x += p.tiltX;
    localNormal.z += p.tiltZ;
    localNormal.normalize();
    worldNormal.copy(localNormal).applyQuaternion(worldQ).normalize();
    planePoint.copy(worldPos).addScaledVector(worldNormal, size * 0.035);
    plane.setFromNormalAndCoplanarPoint(worldNormal, planePoint);
    planeUniform.value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    if (surfaceRef.current) {
      surfaceRef.current.position.copy(localNormal).multiplyScalar(size * 0.035);
      surfaceQ.setFromUnitVectors(planeUp, localNormal);
      surfaceRef.current.quaternion.copy(surfaceQ);
      surfaceRef.current.material.opacity = 0.56 + Math.sin(clock.t * 2.5) * 0.035;
    }
    tangentA.set(Math.abs(localNormal.x) > 0.9 ? 0 : 1, 0, Math.abs(localNormal.x) > 0.9 ? 1 : 0);
    tangentA.addScaledVector(localNormal, -tangentA.dot(localNormal)).normalize();
    tangentB.crossVectors(localNormal, tangentA);
    bubbles.current.forEach((bubble, i) => {
      if (!bubble) return;
      const phase = (clock.t * 0.3 + i * 0.37) % 1;
      bubble.position.copy(localNormal).multiplyScalar(size * 0.022)
        .addScaledVector(tangentA, (i - 1) * size * 0.15 + Math.sin(clock.t * 0.7 + i * 2) * size * 0.03)
        .addScaledVector(tangentB, (i % 2 ? 1 : -1) * size * 0.11);
      bubble.visible = phase < 0.85;
      bubble.scale.setScalar(size * (0.018 + 0.01 * (i % 2)) * Math.min(1, phase * 6));
    });
  });
  return (
    <group>
      <mesh geometry={waterGeometry} material={material} renderOrder={1} />
      <mesh ref={surfaceRef} geometry={surfaceGeometry} position-y={-size * 0.035} renderOrder={2} visible={false}>
        <meshPhysicalMaterial color="#9fe0f2" transparent opacity={0.58} roughness={0.08} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={i} ref={(m) => { bubbles.current[i] = m; }} visible={false} renderOrder={2}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshPhysicalMaterial color="#dceff3" transparent opacity={0.65} roughness={0.06} clearcoat={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function LeadSlug({ size = SIZE }) {
  const ref = useRef();
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m?.parent) return;
    m.parent.getWorldQuaternion(_inv).invert();
    _down.set(0, -1, 0).applyQuaternion(_inv).multiplyScalar(0.22);
    m.position.lerp(_down, 1 - Math.exp(-Math.min(dt, 0.1) * 7));
  });
  return <mesh ref={ref} geometry={SLUG_GEO} material={LEAD} scale={size / SIZE} />;
}
const FACE_NORMALS = { 2: [1, 0, 0], 5: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 3: [0, 0, 1], 4: [0, 0, -1] };

const spot = ([r, c], y = REST_Y) => new THREE.Vector3(c, y, r);

// A landed die (half its diagonal, in any spin) plus a hair of air must stay outside the marble tray's rim
function clearOfTray(position, seat, layout) {
  const clearance = layout.spec.dishR + DISH_BEVEL + SIZE * 0.75 + 0.08;
  const [r, c] = layout.BASE_TRAY[seat];
  const dx = position.x - c;
  const dz = position.z - r;
  const dist = Math.hypot(dx, dz);
  if (dist < clearance) position.set(c + (dx / dist) * clearance, position.y, r + (dz / dist) * clearance);
  return position;
}

function faceUp(value, yaw) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...FACE_NORMALS[value]), UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
}

function bounce(t, height) {
  const arcs = [
    [0, 0.34, height, true],
    [0.34, 0.62, 0.55],
    [0.62, 0.82, 0.18],
    [0.82, 0.94, 0.05],
  ];
  for (const [a, b, h, fall] of arcs) {
    if (t < b) {
      const u = (t - a) / (b - a);
      return fall ? h * (1 - u * u) : h * 4 * u * (1 - u);
    }
  }
  return 0;
}

function useDieAssets() {
  return useMemo(
    () => ({
      geometry: new RoundedBoxGeometry(SIZE, SIZE, SIZE, 5, 0.13),
      numbers: [1, 2, 3, 4, 5, 6].map((v) => makeNumberTexture(v, v === 6 ? '#ffd166' : '#fff6e8')),
    }),
    []
  );
}

function DieBody({ seat, skin, color, spawnT, lastRoll, active, canRoll, onRoll, onGone, showRollLabel = true, assets, layout, onSkinSwap }) {
  // The die and its extras (slug, water) change together, once the new skin is ready to draw
  const { id: shownSkin, materials } = useWarmed(
    skin || '',
    () => ({ id: skin, materials: diceSkin(skin) }),
    (next) => {
      const probe = new THREE.Mesh(assets.geometry, next.materials);
      probe.castShadow = true;
      if (skinKey(next.id) === 'unlucky') probe.add(new THREE.Mesh(assets.geometry, HALF_FULL_ACRYLIC));
      return probe;
    },
    onSkinSwap
  );
  const ref = useRef();
  const orientation = useRef();
  const glow = useRef();
  const label = useRef();
  const loaded = skinKey(shownSkin) === 'loaded';
  const halfFull = skinKey(shownSkin) === 'unlucky';
  const anim = useRef(null);
  if (!anim.current) {
    const settled = !spawnT && lastRoll?.seat === seat;
    anim.current = {
      pos: spot(layout.DIE_SPOT[seat]),
      quat: faceUp(settled ? lastRoll.die : 5, 0.4),
      seen: spawnT ? null : lastRoll?.t,
      roll: null,
      scale: settled ? 1 : 0,
      vel: 0,
      landedAt: -10,
      label: { start: -10, pos: new THREE.Vector3() },
      gone: false,
    };
  }

  useLayoutEffect(() => {
    const a = anim.current;
    if (!lastRoll || lastRoll.seat !== seat || lastRoll.t === a.seen) return;
    a.seen = lastRoll.t;
    const inHand = a.scale > 0.5;
    const land = clearOfTray(spot(layout.DIE_SPOT[seat]).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), seat, layout);
    a.roll = {
      start: null,
      die: lastRoll.die,
      from: inHand ? a.pos.clone() : spot(layout.DIE_THROW_FROM[seat]),
      to: land,
      height: inHand ? 1.8 : 2.6,
      final: faceUp(lastRoll.die, Math.random() * Math.PI * 2),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: Math.PI * (5 + Math.random() * 2),
    };
    a.scale = 1;
    a.vel = 0;
    a.landedAt = -10;
    a.gone = false;
    a.label.start = -10;
    sfx.dice();
  }, [lastRoll, seat, layout]);

  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  const twist = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state, dt) => {
    const a = anim.current;
    const now = state.clock.elapsedTime;
    const mesh = ref.current;
    const rotation = orientation.current;
    animateDiceSkin(materials, color);

    const wanted = active || !!a.roll || now - a.landedAt < LAND_HOLD;
    if (wanted) a.gone = false;
    for (let left = Math.min(dt, 0.25); left > 0; left -= SPRING_STEP) {
      const h = Math.min(left, SPRING_STEP);
      a.vel += ((wanted ? 1 : 0) - a.scale) * 140 * h;
      a.vel *= Math.exp(-13 * h);
      a.scale = Math.max(0, a.scale + a.vel * h);
    }
    if (!wanted && a.scale < 0.01 && !a.gone) {
      a.gone = true;
      onGone(seat);
    }
    mesh.visible = a.scale > 0.01;
    mesh.scale.setScalar(Math.min(a.scale, 1.25));
    if (a.roll) {
      const r = a.roll;
      if (r.start === null) r.start = now;
      const t = Math.min(1, (now - r.start) / ROLL_TIME);
      const e = 1 - (1 - t) ** 3;
      a.pos.lerpVectors(r.from, r.to, e);
      a.pos.y = REST_Y + bounce(t, r.height);
      a.quat.copy(r.final).multiply(spinQ.setFromAxisAngle(r.axis, r.spin * (1 - e) ** 2));
      if (t >= 1) {
        a.roll = null;
        a.landedAt = now;
        a.label.start = now;
        a.label.pos.copy(a.pos);
        label.current.material.map = assets.numbers[r.die - 1];
        label.current.material.needsUpdate = true;
        if (r.die === 6) {
          fx.emit('burst', { position: [a.pos.x, a.pos.y + 0.4, a.pos.z], colors: ['#ffd166', '#fff3b0', '#ffffff', '#ff8a3d'], count: 45, speed: 3, up: 5, size: 0.09 });
        }
      }
      mesh.position.copy(a.pos);
      rotation.quaternion.copy(a.quat);
    } else {
      const hover = canRoll ? 0.35 + Math.sin(now * 3.5) * 0.12 : 0;
      const shrink = 1 - Math.min(a.scale, 1);
      mesh.position.set(a.pos.x, a.pos.y + hover - shrink * (SIZE / 2), a.pos.z);
      rotation.quaternion.copy(a.quat);
      if (canRoll) rotation.quaternion.premultiply(twist.setFromAxisAngle(UP, Math.sin(now * 2) * 0.25));
      if (shrink > 0) rotation.quaternion.premultiply(twist.setFromAxisAngle(UP, shrink * 2.4));
    }
    glow.current.visible = canRoll && !a.roll && a.scale > 0.6;
    glow.current.position.set(a.pos.x, TABLE_Y + 0.02, a.pos.z);
    glow.current.material.opacity = 0.4 + Math.sin(now * 5) * 0.3;

    const lt = now - a.label.start;
    const showLabel = showRollLabel && lt >= 0 && lt < 1.6;
    label.current.visible = showLabel;
    if (showLabel) {
      const pop = lt < 0.25 ? 0.4 + (lt / 0.25) * 0.9 : lt < 0.4 ? 1.3 - ((lt - 0.25) / 0.15) * 0.3 : 1;
      label.current.scale.setScalar(1.3 * pop);
      label.current.position.set(a.label.pos.x, REST_Y + 1.3 + lt * 0.35, a.label.pos.z);
      label.current.material.opacity = lt > 1.1 ? 1 - (lt - 1.1) / 0.5 : 1;
    }
  });

  const interactive = canRoll
    ? {
        onClick: (e) => {
          e.stopPropagation();
          document.body.style.cursor = '';
          onRoll();
        },
        onPointerOver: (e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
      }
    : {};

  return (
    <group>
      <group ref={ref}>
        <group ref={orientation}>
          {halfFull && <mesh geometry={assets.geometry} material={HALF_FULL_ACRYLIC} renderOrder={3} />}
          <mesh geometry={assets.geometry} material={materials} castShadow renderOrder={4} {...interactive}>
            {loaded && <LeadSlug />}
          </mesh>
          {halfFull && <HalfFullWater orientation={orientation} state={anim.current} />}
        </group>
      </group>
      <mesh ref={glow} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.75, 0.95, 48]} />
        <meshBasicMaterial color="#ffd166" transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <sprite ref={label} visible={false} renderOrder={20}>
        <spriteMaterial map={assets.numbers[0]} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

const _mat = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _spinQ = new THREE.Quaternion();
const _twistQ = new THREE.Quaternion();

function DiceStorm({ stunt, skin, color, assets, layout, onPickDie }) {
  const materials = diceSkin(skin);
  const meshRef = useRef();
  const glowRef = useRef();
  const labelRef = useRef();
  const itemsRef = useRef(null);
  const soundPlayed = useRef(false);
  const lastLabelDie = useRef(null);
  const dice = stunt.dice || [];
  const count = dice.length;

  if (!itemsRef.current || itemsRef.current.id !== stunt.id) {
    soundPlayed.current = false;
    itemsRef.current = {
      id: stunt.id,
      items: dice.map((d, i) => ({
        pos: new THREE.Vector3(d.fromX ?? d.x, REST_Y, d.fromZ ?? d.z),
        quat: faceUp(d.die, d.yaw || 0),
        finalQuat: faceUp(d.die, d.yaw || 0),
        axis: new THREE.Vector3(Math.sin(i * 1.7 + 0.3), Math.cos(i * 2.3 + 0.5), Math.sin(i * 3.1 + 1.1)).normalize(),
        spin: Math.PI * (5 + (i % 4) * 0.65),
        targetX: d.x,
        targetZ: d.z,
        nudge: null,
        landed: false,
        burnedSeen: !!d.burned && (d.burnedAge || 0) > 400,
      })),
    };
  }

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || !count) return;
    const now = state.clock.elapsedTime;
    const st = stuntClock(stunt);
    const cut = cutClock(stunt);
    const cutScale = cut === null ? 1 : Math.max(0, 1 - cut / 0.42);
    animateDiceSkin(materials, color);

    if (!soundPlayed.current) {
      soundPlayed.current = true;
      if (st < 0.45 && !stunt.cut) {
        sfx.diceStorm?.();
        setTimeout(() => fx.emit('shake', { amount: 0.28 }), 280);
      }
    }

    const { items } = itemsRef.current;
    let activeItem = null;
    let activeDie = null;
    let activeSurfY = TABLE_Y;

    for (let i = 0; i < count; i++) {
      const d = dice[i];
      const item = items[i];
      const bc = burnClock(stunt.id, d);
      if (bc !== null && !item.burnedSeen) {
        item.burnedSeen = true;
        if (bc < 0.35) {
          fx.emit('burst', {
            position: [item.pos.x, item.pos.y + 0.3, item.pos.z],
            colors: ['#ffd166', '#fff3b0', '#ffffff', '#ff8a3d'],
            count: 18,
            speed: 2.8,
            up: 3.5,
            size: 0.08,
          });
        }
      }
      const burnScale = bc === null ? 1 : Math.max(0, 1 - bc / 0.26);
      const s = Math.min(cutScale, burnScale);
      if (s <= 0.001) {
        _mat.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat);
        continue;
      }

      if (item.landed && (d.x !== item.targetX || d.z !== item.targetZ)) {
        item.nudge = { fromX: item.pos.x, fromZ: item.pos.z, toX: d.x, toZ: d.z, start: now };
        item.targetX = d.x;
        item.targetZ = d.z;
      }

      const rt = (st - (d.delay || 0)) / ROLL_TIME;
      if (rt < 0) {
        _mat.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat);
        continue;
      }
      if (rt < 1) {
        const e = 1 - (1 - rt) ** 3;
        const x = (d.fromX ?? d.x) + (d.x - (d.fromX ?? d.x)) * e;
        const z = (d.fromZ ?? d.z) + (d.z - (d.fromZ ?? d.z)) * e;
        const surfY = boardSurfaceY(x, z, layout.spec, TABLE_Y);
        item.pos.set(x, surfY + SIZE / 2 + bounce(rt, d.height || 2.6), z);
        item.quat.copy(item.finalQuat).multiply(_spinQ.setFromAxisAngle(item.axis, item.spin * (1 - e) ** 2));
      } else {
        if (!item.landed) {
          item.landed = true;
          if (d.die === 6 && st - (d.delay || 0) < ROLL_TIME + 0.25) {
            const sy = boardSurfaceY(d.x, d.z, layout.spec, TABLE_Y);
            fx.emit('burst', { position: [d.x, sy + SIZE + 0.2, d.z], colors: ['#ffd166', '#fff3b0', '#ffffff', '#ff8a3d'], count: 10, speed: 2.4, up: 4, size: 0.08 });
          }
        }
        if (item.nudge) {
          const nt = Math.min(1, (now - item.nudge.start) / 0.28);
          const ne = 1 - (1 - nt) ** 2;
          const x = item.nudge.fromX + (item.nudge.toX - item.nudge.fromX) * ne;
          const z = item.nudge.fromZ + (item.nudge.toZ - item.nudge.fromZ) * ne;
          const surfY = boardSurfaceY(x, z, layout.spec, TABLE_Y);
          item.pos.set(x, surfY + SIZE / 2 + Math.sin(Math.PI * nt) * 0.55, z);
          if (nt >= 1) item.nudge = null;
        } else {
          const surfY = boardSurfaceY(d.x, d.z, layout.spec, TABLE_Y);
          item.pos.set(d.x, surfY + SIZE / 2, d.z);
        }
        item.quat.copy(item.finalQuat);
      }

      const isActive = !stunt.cut && bc === null && item.landed && d.id === stunt.activeDieId;
      if (isActive) {
        activeItem = item;
        activeDie = d;
        activeSurfY = boardSurfaceY(item.pos.x, item.pos.z, layout.spec, TABLE_Y);
        item.pos.y += 0.32 + Math.sin(now * 4) * 0.1;
        item.quat.premultiply(_twistQ.setFromAxisAngle(UP, Math.sin(now * 2.2) * 0.25));
      }
      if (s < 1) {
        const shrink = 1 - s;
        item.pos.y -= shrink * (SIZE / 2);
        item.quat.premultiply(_twistQ.setFromAxisAngle(UP, shrink * 2.4));
      }
      _mat.compose(item.pos, item.quat, _scale.setScalar(s));
      mesh.setMatrixAt(i, _mat);
    }
    mesh.instanceMatrix.needsUpdate = true;

    const showActive = !!activeItem && !!activeDie;
    glowRef.current.visible = showActive;
    labelRef.current.visible = showActive;
    if (showActive) {
      glowRef.current.position.set(activeItem.pos.x, activeSurfY + 0.02, activeItem.pos.z);
      glowRef.current.material.opacity = 0.45 + Math.sin(now * 5) * 0.3;
      if (lastLabelDie.current !== activeDie.die) {
        lastLabelDie.current = activeDie.die;
        labelRef.current.material.map = assets.numbers[activeDie.die - 1];
        labelRef.current.material.needsUpdate = true;
      }
      labelRef.current.scale.setScalar(1.25);
      labelRef.current.position.set(activeItem.pos.x, activeSurfY + SIZE / 2 + 1.35 + Math.sin(now * 4) * 0.08, activeItem.pos.z);
      labelRef.current.material.opacity = 0.95;
    }
  });

  const interactive = onPickDie
    ? {
        onClick: (e) => {
          if (stunt.cut || e.instanceId === undefined) return;
          const d = dice[e.instanceId];
          if (!d || d.burned) return;
          e.stopPropagation();
          document.body.style.cursor = '';
          onPickDie(d.id);
        },
        onPointerOver: (e) => {
          if (stunt.cut || e.instanceId === undefined) return;
          const d = dice[e.instanceId];
          if (!d || d.burned) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
      }
    : {};

  return (
    <group>
      <instancedMesh key={`${stunt.id}:${count}`} ref={meshRef} args={[assets.geometry, materials, count]} frustumCulled={false} castShadow receiveShadow {...interactive} />
      <mesh ref={glowRef} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.72, 0.92, 48]} />
        <meshBasicMaterial color="#ffd166" transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <sprite ref={labelRef} visible={false} renderOrder={20}>
        <spriteMaterial map={assets.numbers[0]} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

export default function Dice({ lastRoll, turn, stunts = [], idleSeat = 0, canRoll, onRoll, onPickDie, skins = [], colors = null, devSeat = -1, showRollLabel = true, layout = layoutFor('classic'), onSkinSwap }) {
  const palette = useRainbow(colors);
  const tint = devSeat >= 0 ? palette?.[devSeat] || null : null;
  const assets = useDieAssets();
  const diceStunt = (stunts || []).find((s) => s.kind === 'dice' && (stuntLive(s) || (s.cut && cutClock(s) < 0.5))) || null;
  const stormLive = !!diceStunt && !diceStunt.cut;
  const idle = turn === null || turn === undefined;
  const activeSeat = stormLive ? null : idle ? idleSeat : lastRoll?.seat === turn || canRoll ? turn : null;
  const [dice, setDice] = useState(() => (activeSeat === null ? [] : [{ seat: activeSeat, spawnT: null }]));
  const seenRoll = useRef(lastRoll?.t);

  useLayoutEffect(() => {
    const fresh = !stormLive && lastRoll && lastRoll.t !== seenRoll.current ? lastRoll : null;
    if (lastRoll) seenRoll.current = lastRoll.t;
    const need = fresh ? fresh.seat : activeSeat;
    if (need === null || need === undefined) return;
    setDice((list) => (list.some((d) => d.seat === need) ? list : [...list, { seat: need, spawnT: fresh ? fresh.t : null }]));
  }, [lastRoll, activeSeat, stormLive]);

  const onGone = (seat) => setDice((list) => list.filter((d) => d.seat !== seat || d.seat === activeSeat));

  return (
    <>
      {diceStunt && <DiceStorm key={diceStunt.id} stunt={diceStunt} skin={skins[diceStunt.seat]} color={tint} assets={assets} layout={layout} onPickDie={onPickDie} />}
      {dice.map((d) => (
        <DieBody
          key={`${d.seat}:${layout.spec.id}`}
          seat={d.seat}
          skin={skins[d.seat]}
          color={tint}
          spawnT={d.spawnT}
          lastRoll={stormLive ? null : lastRoll}
          active={d.seat === activeSeat}
          canRoll={!stormLive && canRoll && d.seat === activeSeat}
          onRoll={onRoll}
          onGone={onGone}
          showRollLabel={showRollLabel}
          assets={assets}
          layout={layout}
          onSkinSwap={onSkinSwap}
        />
      ))}
    </>
  );
}

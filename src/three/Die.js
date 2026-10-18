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
import { TABLE_Y, DISH_BEVEL } from './Board';
import { fx } from './fx';
import { useRainbow } from '../game/rainbow';

const SIZE = 0.85;
const REST_Y = TABLE_Y + SIZE / 2;
const ROLL_TIME = ROLL_REVEAL_MS / 1000;
const LAND_HOLD = 1.3;
const SPRING_STEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
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

function DieBody({ seat, skin, color, spawnT, lastRoll, active, canRoll, onRoll, onGone, assets, layout }) {
  const materials = diceSkin(skin);
  const ref = useRef();
  const glow = useRef();
  const label = useRef();
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
      mesh.quaternion.copy(a.quat);
    } else {
      const hover = canRoll ? 0.35 + Math.sin(now * 3.5) * 0.12 : 0;
      const shrink = 1 - Math.min(a.scale, 1);
      mesh.position.set(a.pos.x, a.pos.y + hover - shrink * (SIZE / 2), a.pos.z);
      mesh.quaternion.copy(a.quat);
      if (canRoll) mesh.quaternion.premultiply(twist.setFromAxisAngle(UP, Math.sin(now * 2) * 0.25));
      if (shrink > 0) mesh.quaternion.premultiply(twist.setFromAxisAngle(UP, shrink * 2.4));
    }
    glow.current.visible = canRoll && !a.roll && a.scale > 0.6;
    glow.current.position.set(a.pos.x, TABLE_Y + 0.02, a.pos.z);
    glow.current.material.opacity = 0.4 + Math.sin(now * 5) * 0.3;

    const lt = now - a.label.start;
    const showLabel = lt >= 0 && lt < 1.6;
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
      <mesh ref={ref} geometry={assets.geometry} material={materials} castShadow {...interactive} />
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

export default function Dice({ lastRoll, turn, stunts = [], idleSeat = 0, canRoll, onRoll, onPickDie, skins = [], colors = null, layout = layoutFor('classic') }) {
  const palette = useRainbow(colors);
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
      {diceStunt && <DiceStorm key={diceStunt.id} stunt={diceStunt} skin={skins[diceStunt.seat]} color={palette?.[diceStunt.seat]} assets={assets} layout={layout} onPickDie={onPickDie} />}
      {dice.map((d) => (
        <DieBody
          key={`${d.seat}:${layout.spec.id}`}
          seat={d.seat}
          skin={skins[d.seat]}
          color={palette?.[d.seat]}
          spawnT={d.spawnT}
          lastRoll={stormLive ? null : lastRoll}
          active={d.seat === activeSeat}
          canRoll={!stormLive && canRoll && d.seat === activeSeat}
          onRoll={onRoll}
          onGone={onGone}
          assets={assets}
          layout={layout}
        />
      ))}
    </>
  );
}

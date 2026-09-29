import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DIE_SPOT, DIE_THROW_FROM, BASE_TRAY } from '../game/geometry';
import { ROLL_REVEAL_MS } from '../game/moves';
import { sfx } from '../game/sound';
import { makeNumberTexture } from './textures';
import { diceSkin, animateDiceSkin } from './skins';
import { TABLE_Y, DISH_R, DISH_BEVEL } from './Board';
import { fx } from './fx';

const SIZE = 0.85;
const REST_Y = TABLE_Y + SIZE / 2;
const ROLL_TIME = ROLL_REVEAL_MS / 1000;
const LAND_HOLD = 1.3;
const SPRING_STEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
const FACE_NORMALS = { 2: [1, 0, 0], 5: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 3: [0, 0, 1], 4: [0, 0, -1] };

const spot = ([r, c], y = REST_Y) => new THREE.Vector3(c, y, r);

// A landed die (half its diagonal, in any spin) plus a hair of air must stay outside the marble tray's rim
const TRAY_CLEARANCE = DISH_R + DISH_BEVEL + SIZE * 0.75 + 0.08;
function clearOfTray(position, seat) {
  const [r, c] = BASE_TRAY[seat];
  const dx = position.x - c;
  const dz = position.z - r;
  const dist = Math.hypot(dx, dz);
  if (dist < TRAY_CLEARANCE) position.set(c + (dx / dist) * TRAY_CLEARANCE, position.y, r + (dz / dist) * TRAY_CLEARANCE);
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

function DieBody({ seat, skin, spawnT, lastRoll, active, canRoll, onRoll, onGone, assets }) {
  const materials = diceSkin(skin);
  const ref = useRef();
  const glow = useRef();
  const label = useRef();
  const anim = useRef(null);
  if (!anim.current) {
    const settled = !spawnT && lastRoll?.seat === seat;
    anim.current = {
      pos: spot(DIE_SPOT[seat]),
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
    const land = clearOfTray(spot(DIE_SPOT[seat]).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), seat);
    a.roll = {
      start: null,
      die: lastRoll.die,
      from: inHand ? a.pos.clone() : spot(DIE_THROW_FROM[seat]),
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
  }, [lastRoll, seat]);

  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  const twist = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state, dt) => {
    const a = anim.current;
    const now = state.clock.elapsedTime;
    const mesh = ref.current;
    animateDiceSkin(materials);

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

export default function Dice({ lastRoll, turn, idleSeat = 0, canRoll, onRoll, skins = [] }) {
  const assets = useDieAssets();
  const idle = turn === null || turn === undefined;
  const activeSeat = idle ? idleSeat : lastRoll?.seat === turn || canRoll ? turn : null;
  const [dice, setDice] = useState(() => (activeSeat === null ? [] : [{ seat: activeSeat, spawnT: null }]));
  const seenRoll = useRef(lastRoll?.t);

  useLayoutEffect(() => {
    const fresh = lastRoll && lastRoll.t !== seenRoll.current ? lastRoll : null;
    if (fresh) seenRoll.current = fresh.t;
    const need = fresh ? fresh.seat : activeSeat;
    if (need === null || need === undefined) return;
    setDice((list) => (list.some((d) => d.seat === need) ? list : [...list, { seat: need, spawnT: fresh ? fresh.t : null }]));
  }, [lastRoll, activeSeat]);

  const onGone = (seat) => setDice((list) => list.filter((d) => d.seat !== seat || d.seat === activeSeat));

  return dice.map((d) => (
    <DieBody
      key={d.seat}
      seat={d.seat}
      skin={skins[d.seat]}
      spawnT={d.spawnT}
      lastRoll={lastRoll}
      active={d.seat === activeSeat}
      canRoll={canRoll && d.seat === activeSeat}
      onRoll={onRoll}
      onGone={onGone}
      assets={assets}
    />
  ));
}

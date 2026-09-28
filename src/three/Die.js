import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DIE_SPOT, DIE_THROW_FROM } from '../game/geometry';
import { sfx } from '../game/sound';
import { makeNumberTexture } from './textures';
import { diceSkin } from './skins';
import { TABLE_Y } from './Board';
import { fx } from './fx';

const SIZE = 0.85;
const REST_Y = TABLE_Y + SIZE / 2;
const ROLL_TIME = 1.05;
const UP = new THREE.Vector3(0, 1, 0);
const FACE_NORMALS = { 2: [1, 0, 0], 5: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 3: [0, 0, 1], 4: [0, 0, -1] };

const spot = ([r, c], y = REST_Y) => new THREE.Vector3(c, y, r);

function faceUp(value, yaw) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...FACE_NORMALS[value]), UP);
  return new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(q);
}

function bounce(t) {
  const arcs = [
    [0, 0.34, 2.6, true],
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

export default function Die({ lastRoll, restSeat, canRoll, onRoll, skins = [] }) {
  const [skinSeat, setSkinSeat] = useState(restSeat);
  const materials = diceSkin(skins[skinSeat]);
  const geometry = useMemo(() => new RoundedBoxGeometry(SIZE, SIZE, SIZE, 5, 0.13), []);
  const numbers = useMemo(() => [1, 2, 3, 4, 5, 6].map((v) => makeNumberTexture(v, v === 6 ? '#ffd166' : '#fff6e8')), []);
  const ref = useRef();
  const glow = useRef();
  const label = useRef();
  const labelAnim = useRef({ start: -10 });
  const anim = useRef(null);
  if (!anim.current) {
    anim.current = { pos: spot(DIE_SPOT[restSeat]), quat: faceUp(lastRoll?.die || 5, 0.4), seen: lastRoll?.t, roll: null };
  }

  useLayoutEffect(() => {
    const a = anim.current;
    if (!lastRoll || lastRoll.t === a.seen) return;
    a.seen = lastRoll.t;
    const to = spot(DIE_SPOT[lastRoll.seat]).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
    a.roll = {
      start: null,
      from: spot(DIE_THROW_FROM[lastRoll.seat], REST_Y),
      to,
      final: faceUp(lastRoll.die, Math.random() * Math.PI * 2),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: Math.PI * (5 + Math.random() * 2),
    };
    setSkinSeat(lastRoll.seat);
    sfx.dice();
  }, [lastRoll]);

  const restSeatRef = useRef(restSeat);
  restSeatRef.current = restSeat;
  useEffect(() => {
    if (!anim.current.roll) setSkinSeat(restSeat);
  }, [restSeat]);

  const spinQ = useMemo(() => new THREE.Quaternion(), []);
  const wobble = useMemo(() => new THREE.Quaternion(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const a = anim.current;
    const now = state.clock.elapsedTime;
    const mesh = ref.current;
    if (a.roll) {
      const r = a.roll;
      if (r.start === null) r.start = now;
      const t = Math.min(1, (now - r.start) / ROLL_TIME);
      const e = 1 - (1 - t) ** 3;
      a.pos.lerpVectors(r.from, r.to, e);
      a.pos.y = REST_Y + bounce(t);
      a.quat.copy(r.final).multiply(spinQ.setFromAxisAngle(r.axis, r.spin * (1 - e) ** 2));
      if (t >= 1) {
        a.roll = null;
        setSkinSeat(restSeatRef.current);
        labelAnim.current = { start: now, value: lastRoll.die };
        label.current.material.map = numbers[lastRoll.die - 1];
        label.current.material.needsUpdate = true;
        if (lastRoll.die === 6) {
          fx.emit('burst', { position: [a.pos.x, a.pos.y + 0.4, a.pos.z], colors: ['#ffd166', '#fff3b0', '#ffffff', '#ff8a3d'], count: 45, speed: 3, up: 5, size: 0.09 });
        }
      }
      mesh.position.copy(a.pos);
      mesh.quaternion.copy(a.quat);
    } else {
      target.copy(spot(DIE_SPOT[restSeat]));
      a.pos.lerp(target, 1 - Math.exp(-dt * 3));
      const hover = canRoll ? 0.35 + Math.sin(now * 3.5) * 0.12 : 0;
      mesh.position.set(a.pos.x, a.pos.y + hover, a.pos.z);
      mesh.quaternion.copy(a.quat);
      if (canRoll) mesh.quaternion.premultiply(wobble.setFromAxisAngle(UP, Math.sin(now * 2) * 0.25));
    }
    glow.current.visible = canRoll && !a.roll;
    glow.current.position.set(a.pos.x, TABLE_Y + 0.02, a.pos.z);
    glow.current.material.opacity = 0.4 + Math.sin(now * 5) * 0.3;

    const lt = now - labelAnim.current.start;
    const visible = lt >= 0 && lt < 1.6;
    label.current.visible = visible;
    if (visible) {
      const pop = lt < 0.25 ? 0.4 + (lt / 0.25) * 0.9 : lt < 0.4 ? 1.3 - ((lt - 0.25) / 0.15) * 0.3 : 1;
      label.current.scale.setScalar(1.3 * pop);
      label.current.position.set(a.pos.x, REST_Y + 1.3 + lt * 0.35, a.pos.z);
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
      <mesh ref={ref} geometry={geometry} material={materials} castShadow {...interactive} />
      <mesh ref={glow} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.75, 0.95, 48]} />
        <meshBasicMaterial color="#ffd166" transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <sprite ref={label} visible={false} renderOrder={20}>
        <spriteMaterial map={numbers[0]} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

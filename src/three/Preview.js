import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Lights } from './Stage';
import { marbleSkin, diceSkin, animateDiceSkin } from './skins';
import Board from './Board';
import Particles from './Particles';
import Shockwaves from './Shockwaves';
import Spectacle from './Spectacle';
import { makeFxBus } from './fx';
import { playKillFx } from './killfx';
import { ITEMS } from '../game/catalog';
import { sfx } from '../game/sound';

function Spinner({ children, speed = 0.6, tilt = 0.35 }) {
  const ref = useRef();
  useFrame(({ clock }, dt) => {
    ref.current.rotation.y += dt * speed;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.8) * tilt * 0.3 + tilt;
  });
  return <group ref={ref}>{children}</group>;
}

function MarblePreview({ itemId, seat }) {
  const skin = marbleSkin(itemId, seat);
  useFrame(({ clock }) => skin.animate?.(clock.elapsedTime));
  return (
    <Spinner>
      <mesh material={skin.material}>
        <sphereGeometry args={[1.35, 64, 40]} />
      </mesh>
    </Spinner>
  );
}

function DicePreview({ itemId }) {
  const materials = diceSkin(itemId);
  useFrame(() => animateDiceSkin(materials));
  const geometry = useMemo(() => new RoundedBoxGeometry(1.9, 1.9, 1.9, 6, 0.28), []);
  return (
    <Spinner speed={0.8} tilt={0.6}>
      <mesh geometry={geometry} material={materials} />
    </Spinner>
  );
}

function BoardPreview({ itemId }) {
  return (
    <group scale={0.19} rotation-x={0.75}>
      <Spinner speed={0.3} tilt={0}>
        <Board active={[0, 1, 2, 3]} names={[]} turn={null} skin={itemId} table={false} />
      </Spinner>
    </group>
  );
}

const LANE = 3;
const HOPS = 3;
const HOP_TIME = 0.2;
const START = 0.9;
const PERIOD = 5.5;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// A strip of the real board: one marble hops three cells onto another, then the kill effect plays. Private bus so nothing leaks into a live game
function FxPreview({ itemId, seat, replay }) {
  const bus = useMemo(() => makeFxBus(), [replay]); // eslint-disable-line react-hooks/exhaustive-deps
  const victim = (seat + 1) % 4;
  const attackerSkin = marbleSkin('marble.classic', seat);
  const victimSkin = marbleSkin('marble.classic', victim);
  const attacker = useRef();
  const target = useRef();
  const fired = useRef(false);
  const origin = useRef(null);
  useFrame(({ clock }) => {
    if (!origin.current || origin.current.replay !== replay) {
      origin.current = { at: clock.elapsedTime, replay };
      fired.current = false;
      target.current.visible = true;
    }
    attackerSkin.animate?.(clock.elapsedTime);
    victimSkin.animate?.(clock.elapsedTime);
    const t = (clock.elapsedTime - origin.current.at) % PERIOD;
    const h = t > START ? Math.min(HOPS, (t - START) / HOP_TIME) : 0;
    const i = Math.min(HOPS - 1, Math.floor(h));
    const e = h >= HOPS ? 1 : h - i;
    attacker.current.position.set(0, 0.07 + (h > 0 && h < HOPS ? Math.sin(Math.PI * e) * 0.45 : 0), LANE - i - easeInOut(e));
    if (t < START && fired.current) {
      fired.current = false;
      target.current.visible = true;
    } else if (h >= HOPS && !fired.current) {
      fired.current = true;
      target.current.visible = false;
      sfx.capture('mine');
      playKillFx(itemId, { at: [0, 0.4, 0], by: seat, victim }, { emit: bus.emit, sfx: (name) => sfx[name]?.() });
    }
  });
  return (
    <group rotation-y={-Math.PI / 2}>
      <group position={[-2, 0, -4]}>
        <Board active={[0, 1, 2, 3]} names={[]} turn={null} skin="board.oak" table={false} />
      </group>
      <mesh ref={target} material={victimSkin.material} position={[0, 0.07, 0]} castShadow>
        <sphereGeometry args={[0.335, 40, 24]} />
      </mesh>
      <mesh ref={attacker} material={attackerSkin.material} position={[0, 0.07, LANE]} castShadow>
        <sphereGeometry args={[0.335, 40, 24]} />
      </mesh>
      <Particles key={replay} bus={bus} />
      <Shockwaves key={replay} bus={bus} />
      <Spectacle key={replay} bus={bus} />
    </group>
  );
}

export default function ItemPreview({ itemId, seat = 0, replay = 0 }) {
  const slot = ITEMS[itemId]?.slot;
  return (
    <Canvas key={slot} dpr={[1, 2]} camera={{ fov: 32, position: slot === 'fx' ? [0, 5.2, 9.5] : [0, 0.4, 6.2] }} onCreated={({ camera }) => camera.lookAt(0, slot === 'fx' ? 0.9 : 0, 0)} gl={{ alpha: true, antialias: true }} resize={{ offsetSize: true }} events={() => ({ enabled: false, priority: 1, handlers: {} })}>
      <Lights shadowSize={slot === 'fx' ? 1024 : 512} extent={slot === 'fx' ? 7 : 4} />
      <group key={`${itemId}-${seat}`}>
        {slot === 'marble' && <MarblePreview itemId={itemId} seat={seat} />}
        {slot === 'dice' && <DicePreview itemId={itemId} />}
        {slot === 'board' && <BoardPreview itemId={itemId} />}
        {slot === 'fx' && <FxPreview itemId={itemId} seat={seat} replay={replay} />}
      </group>
    </Canvas>
  );
}

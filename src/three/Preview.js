import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Lights } from './Stage';
import { marbleSkin, diceSkin, animateDiceSkin } from './skins';
import Board, { hasBoardProps } from './Board';
import KillFxLayer from './KillFxLayer';
import Spectacle from './Spectacle';
import { makeFxBus } from './fx';
import { playKillFx, warmKillFx } from './killfx';
import { playTrail } from './trails';
import { MARBLE_GEO } from './Marbles';
import { ITEMS } from '../game/catalog';
import { layoutFor } from '../game/geometry';
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
    <group scale={hasBoardProps(itemId) ? 0.15 : 0.19} rotation-x={0.75}>
      <Spinner speed={0.3} tilt={0}>
        <Board active={[0, 1, 2, 3]} names={[]} turn={null} skin={itemId} />
      </Spinner>
    </group>
  );
}

const CLASSIC = layoutFor('classic');
const BOARD_ORIGIN = [2, 4];
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
  useMemo(() => warmKillFx(itemId), [itemId]);
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
      playKillFx(itemId, { at: [0, 0.4, 0], by: seat, victim }, { bus, sfx: (name) => sfx[name]?.() });
    }
  });
  return (
    <group rotation-y={-Math.PI / 2}>
      <group position={[-2, 0, -4]}>
        <Board active={[0, 1, 2, 3]} names={[]} turn={null} skin="board.oak" table={false} />
      </group>
      <mesh ref={target} geometry={MARBLE_GEO} material={victimSkin.material} position={[0, 0.07, 0]} castShadow />
      <mesh ref={attacker} geometry={MARBLE_GEO} material={attackerSkin.material} position={[0, 0.07, LANE]} castShadow />
      <KillFxLayer key={replay} bus={bus} layout={CLASSIC} origin={BOARD_ORIGIN} />
    </group>
  );
}

const RUN = 3;
const RUN_HOP_TIME = 0.22;
const RUN_PAUSE = 1.4;
const RUN_LEG = RUN * RUN_HOP_TIME;
const RUN_PERIOD = 2 * (RUN_LEG + RUN_PAUSE);
const STACK_Y = 0.07 + 0.335 * 1.95;

// Same lane as the kill fx stage, but the stand-in sits one cell into the path so the runner stacks onto it and hops off like a real over-jump
function TrailPreview({ itemId, seat, replay }) {
  const bus = useMemo(() => makeFxBus(), [replay]); // eslint-disable-line react-hooks/exhaustive-deps
  const skin = marbleSkin('marble.classic', seat);
  const blockerSkin = marbleSkin('marble.classic', (seat + 1) % 4);
  const m = useRef();
  const last = useRef(null);
  const prevI = useRef(-1);
  useFrame(({ clock }) => {
    skin.animate?.(clock.elapsedTime);
    blockerSkin.animate?.(clock.elapsedTime);
    const t = clock.elapsedTime % RUN_PERIOD;
    const leg = Math.floor(t / (RUN_LEG + RUN_PAUSE));
    const back = leg === 1;
    const u = t - leg * (RUN_LEG + RUN_PAUSE);
    const h = Math.min(RUN, u / RUN_HOP_TIME);
    const i = Math.min(RUN - 1, Math.floor(h));
    const e = Math.max(0, Math.min(1, h - i));
    const e2 = easeInOut(e);
    const zAt = (c) => (back ? c : RUN - c);
    const yAt = (c) => (zAt(c) === 1 ? STACK_Y : 0.07);
    const moving = h < RUN;
    const z = zAt(i) + (zAt(i + 1) - zAt(i)) * e2;
    const y = yAt(i) + (yAt(i + 1) - yAt(i)) * e2 + (moving ? Math.sin(Math.PI * e) * 0.45 : 0);
    m.current.position.set(0, y, z);
    if (moving) {
      if (i !== prevI.current) {
        prevI.current = i;
        if (yAt(i) === STACK_Y) sfx.clack();
      }
      const p = m.current.position;
      if (!last.current) last.current = p.clone();
      else if (p.distanceTo(last.current) > 0.32) {
        playTrail(itemId, [p.x, p.y - 0.08, p.z], { by: seat, prev: [last.current.x, last.current.y - 0.08, last.current.z] }, { emit: bus.emit });
        last.current.copy(p);
      }
    } else {
      last.current = null;
      prevI.current = -1;
    }
  });
  return (
    <group rotation-y={-Math.PI / 2}>
      <group position={[-2, 0, -4]}>
        <Board active={[0, 1, 2, 3]} names={[]} turn={null} skin="board.oak" table={false} />
      </group>
      <mesh geometry={MARBLE_GEO} material={blockerSkin.material} position={[0, 0.07, 1]} castShadow />
      <mesh ref={m} geometry={MARBLE_GEO} material={skin.material} position={[0, 0.07, RUN]} castShadow />
      <Spectacle key={replay} bus={bus} />
    </group>
  );
}

function ReadySignal({ onReady }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 3) onReady?.();
  });
  return null;
}

// Drawing a fresh material blocks the main thread until the driver finishes compiling it, so compile in parallel while hidden
function CompileGate({ children, onReady }) {
  const ref = useRef();
  const { gl, camera, scene } = useThree();
  const [compiled, setCompiled] = useState(false);
  useEffect(() => {
    let alive = true;
    gl.compileAsync(ref.current, camera, scene)
      .then((root) => {
        const programs = new Set();
        root.traverse((o) => [o.material].flat().forEach((m) => m && programs.add(gl.properties.get(m).currentProgram)));
        // First use reads back shader logs synchronously, so pay that one program per task instead of all in one frame
        const queue = [...programs].filter(Boolean);
        return new Promise((resolve) => {
          const step = () => {
            if (!alive || !queue.length) return resolve();
            queue.shift().getUniforms();
            setTimeout(step, 0);
          };
          step();
        });
      })
      .catch(() => {})
      .then(() => alive && setCompiled(true));
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group ref={ref} visible={compiled}>
      {compiled && <ReadySignal onReady={onReady} />}
      {children}
    </group>
  );
}

export default function ItemPreview({ itemId, seat = 0, replay = 0, onReady }) {
  const slot = ITEMS[itemId]?.slot;
  const stage = slot === 'fx' || slot === 'trail';
  return (
    <Canvas key={stage ? 'stage' : 'item'} dpr={[1, 2]} camera={{ fov: 32, position: stage ? [0, 5.2, 9.5] : [0, 0.4, 6.2] }} onCreated={({ camera }) => camera.lookAt(0, stage ? 0.9 : 0, 0)} gl={{ alpha: true, antialias: true }} resize={{ offsetSize: true }} events={() => ({ enabled: false, priority: 1, handlers: {} })}>
      <Lights shadowSize={stage ? 1024 : 512} extent={stage ? 7 : 4} />
      <CompileGate key={`${itemId}-${seat}`} onReady={onReady}>
        {slot === 'marble' && <MarblePreview itemId={itemId} seat={seat} />}
        {slot === 'dice' && <DicePreview itemId={itemId} />}
        {slot === 'board' && <BoardPreview itemId={itemId} />}
        {slot === 'fx' && <FxPreview itemId={itemId} seat={seat} replay={replay} />}
        {slot === 'trail' && <TrailPreview itemId={itemId} seat={seat} replay={replay} />}
      </CompileGate>
    </Canvas>
  );
}

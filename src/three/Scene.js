import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Board from './Board';
import Marbles from './Marbles';
import Die from './Die';
import Particles from './Particles';
import { Lights } from './Stage';
import { fx } from './fx';
import { SEAT_COLORS } from '../game/geometry';

const BG = '#0b1f24';
const NO_MOVES = [];
const NO_COSMETICS = [];
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function CameraRig({ mode, resetKey }) {
  const { camera, gl, size } = useThree();
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    Object.assign(c, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.1, maxPolarAngle: 1.05, rotateSpeed: 0.5, zoomSpeed: 0.7 });
    return c;
  }, [camera, gl]);
  useEffect(() => () => controls.dispose(), [controls]);
  const tween = useRef(null);

  useEffect(() => {
    const aspect = size.width / size.height;
    const game = mode === 'game';
    const elevation = game ? 0.98 : 0.8;
    const distance = Math.max(28, (game ? 28 : 31) / aspect);
    const target = new THREE.Vector3(0, 0, game ? 3.4 : 0);
    const position = target.clone().add(new THREE.Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance));
    tween.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), position, target, start: null };
    controls.minDistance = distance * 0.55;
    controls.maxDistance = distance * 1.5;
    controls.autoRotate = !game;
    controls.autoRotateSpeed = 0.35;
    controls.enabled = game;
  }, [mode, resetKey, size.width, size.height, camera, controls]);

  useFrame(({ clock }) => {
    const tw = tween.current;
    if (tw) {
      if (tw.start === null) tw.start = clock.elapsedTime;
      const t = Math.min(1, (clock.elapsedTime - tw.start) / 1.4);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(tw.fromPos, tw.position, e);
      controls.target.lerpVectors(tw.fromTarget, tw.target, e);
      if (t >= 1) tween.current = null;
    }
    controls.update();
  });
  return null;
}

function Turntable({ viewSeat, children }) {
  const ref = useRef();
  const shake = useRef(0);
  useEffect(() => fx.on((type, data) => type === 'shake' && (shake.current = Math.max(shake.current, data.amount))), []);
  useFrame((_, dt) => {
    const g = ref.current;
    const target = (-viewSeat * Math.PI) / 2;
    const diff = Math.atan2(Math.sin(target - g.rotation.y), Math.cos(target - g.rotation.y));
    g.rotation.y += diff * (1 - Math.exp(-dt * 3));
    const s = shake.current;
    g.position.set((Math.random() - 0.5) * s, Math.abs(Math.random() - 0.5) * s * 0.6, (Math.random() - 0.5) * s);
    g.rotation.x = (Math.random() - 0.5) * s * 0.03;
    shake.current = s < 0.005 ? 0 : s * Math.exp(-dt * 9);
  });
  return <group ref={ref}>{children}</group>;
}

function useWinFireworks(board) {
  const wasOver = useRef(board.phase === 'over');
  useEffect(() => {
    const over = board.phase === 'over';
    const started = over && !wasOver.current;
    wasOver.current = over;
    if (!started) return undefined;
    const colors = board.winners.flatMap((s) => [SEAT_COLORS[s].main, SEAT_COLORS[s].light]).concat('#ffd166', '#ffffff');
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (count > 14) {
        clearInterval(timer);
        return;
      }
      const position = [(Math.random() - 0.5) * 14, 3 + Math.random() * 3, (Math.random() - 0.5) * 12];
      fx.emit('burst', { position, colors, count: 60, speed: 5, up: 1.5, size: 0.11, gravity: 0.35, life: 1.6 });
    }, 380);
    return () => clearInterval(timer);
  }, [board.phase, board.winners]);
}

export default function Scene({ mode, board, names, cosmetics = NO_COSMETICS, boardSkinId, viewSeat = 0, moves = NO_MOVES, canRoll = false, onRoll, onMove, resetKey }) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    setSelected(null);
    setHovered(null);
    document.body.style.cursor = '';
  }, [moves]);

  useWinFireworks(board);
  const dieSeat = board.phase === 'roll' ? board.turn : board.lastRoll?.seat ?? board.turn ?? viewSeat;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 38, near: 0.5, far: 400, position: [0, 34, 34] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => setSelected(null)}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 110, 230]} />
      <Lights />
      <Turntable viewSeat={viewSeat}>
        <Board active={board.active} names={names} turn={board.phase === 'over' ? null : board.turn} showNames={mode === 'lobby'} skin={boardSkinId} />
        <Particles />
        <Marbles
          board={board}
          skins={cosmetics.map((c) => c?.marble)}
          moves={moves}
          selected={selected}
          setSelected={setSelected}
          hovered={hovered}
          setHovered={setHovered}
          onMove={onMove}
        />
        <Die lastRoll={board.lastRoll} restSeat={dieSeat ?? 0} canRoll={canRoll} onRoll={onRoll} skins={cosmetics.map((c) => c?.dice)} />
      </Turntable>
      <CameraRig mode={mode} resetKey={resetKey} />
    </Canvas>
  );
}

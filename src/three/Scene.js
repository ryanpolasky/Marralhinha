import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Board from './Board';
import Marbles from './Marbles';
import Die from './Die';
import Particles from './Particles';
import Pings, { snapToSpot } from './Pings';
import { Lights } from './Stage';
import { fx } from './fx';
import { SEAT_COLORS } from '../game/geometry';

const BG = '#0b1f24';
const NO_MOVES = [];
const NO_COSMETICS = [];
const NO_PINGS = [];
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function CameraRig({ mode, resetKey, spinning }) {
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
    const elevation = game ? 0.86 : 0.8;
    const distance = Math.max(game ? 33 : 28, (game ? 33 : 31) / aspect);
    const target = new THREE.Vector3(0, 0, 0);
    const position = target.clone().add(new THREE.Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance));
    tween.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), position, target, start: null };
    controls.minDistance = distance * 0.55;
    controls.maxDistance = distance * 1.5;
    controls.enabled = game;
  }, [mode, resetKey, size.width, size.height, camera, controls]);

  useEffect(() => {
    controls.autoRotate = mode !== 'game' || spinning;
    controls.autoRotateSpeed = spinning ? 0.6 : 0.35;
  }, [mode, spinning, controls]);

  // Lifts the picture above the bottom HUD while the camera still orbits the exact board center
  const lens = useRef({ shift: 0, w: 0, h: 0 });
  useFrame(({ clock }, dt) => {
    const tw = tween.current;
    if (tw) {
      if (tw.start === null) tw.start = clock.elapsedTime;
      const t = Math.min(1, (clock.elapsedTime - tw.start) / 1.4);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(tw.fromPos, tw.position, e);
      controls.target.lerpVectors(tw.fromTarget, tw.target, e);
      if (t >= 1) tween.current = null;
    }
    const l = lens.current;
    const goal = mode === 'game' ? size.height * 0.08 : 0;
    const next = l.shift + (goal - l.shift) * (1 - Math.exp(-dt * 3));
    if (Math.abs(next - l.shift) > 0.05 || l.w !== size.width || l.h !== size.height) {
      l.shift = next;
      l.w = size.width;
      l.h = size.height;
      camera.setViewOffset(size.width, size.height, 0, l.shift, size.width, size.height);
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

// Keyboard play: Tab / arrow keys / 1-9 pick a move (the board previews it), Enter plays it
function useKeyboardMoves(moves, movesKey, onMove, setSelected) {
  const [keyMove, setKeyMove] = useState(null);
  useEffect(() => setKeyMove(null), [movesKey]);
  useEffect(() => {
    if (!moves.length) return undefined;
    const pick = (move) => {
      setKeyMove(move.id);
      setSelected({ seat: move.seat, marble: move.marble });
    };
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const index = moves.findIndex((m) => m.id === keyMove);
      // Tab only takes over while nothing in the HUD has focus, so normal tabbing through buttons still works
      const tab = e.key === 'Tab' && (e.target === document.body || e.target.tagName === 'CANVAS');
      if (tab || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const back = e.key === 'ArrowLeft' || (tab && e.shiftKey);
        pick(moves[index < 0 ? (back ? moves.length - 1 : 0) : (index + (back ? -1 : 1) + moves.length) % moves.length]);
      } else if (/^[1-9]$/.test(e.key) && moves[Number(e.key) - 1]) {
        pick(moves[Number(e.key) - 1]);
      } else if (e.key === 'Enter' && keyMove !== null && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        setKeyMove(null);
        onMove(keyMove);
      } else if (e.key === 'Escape' && keyMove !== null) {
        setKeyMove(null);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moves, keyMove, onMove, setSelected]);
  return keyMove;
}

const LONG_PRESS_MS = 450;

// Invisible sheet over the board that tracks where the pointer is (in board coords) for pings.
// It has no click handler, so marble and die clicks go through untouched.
function PingSurface({ pointer, onMenu }) {
  const ref = useRef();
  const press = useRef(null);
  const toLocal = (e) => {
    const p = ref.current.parent.worldToLocal(e.point.clone());
    return { x: p.x, z: p.z, screenX: e.nativeEvent.clientX, screenY: e.nativeEvent.clientY };
  };
  const cancel = () => {
    clearTimeout(press.current?.timer);
    press.current = null;
  };
  return (
    <mesh
      ref={ref}
      rotation-x={-Math.PI / 2}
      position-y={0.02}
      onPointerMove={(e) => {
        pointer.current = toLocal(e);
        if (press.current && Math.hypot(e.nativeEvent.clientX - press.current.x, e.nativeEvent.clientY - press.current.y) > 12) cancel();
      }}
      onPointerOut={() => {
        pointer.current = null;
        cancel();
      }}
      onPointerDown={(e) => {
        if (e.nativeEvent.pointerType !== 'touch') return;
        const at = toLocal(e);
        press.current = { x: at.screenX, y: at.screenY, timer: setTimeout(() => onMenu(at), LONG_PRESS_MS) };
      }}
      onPointerUp={cancel}
      onContextMenu={(e) => {
        e.nativeEvent.preventDefault();
        onMenu(toLocal(e));
      }}
    >
      <planeGeometry args={[32, 32]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// H pings, G pings danger; in 2v2 they go to your partner unless you hold Shift (everyone)
function usePingKeys(pointer, canPing, onPing) {
  useEffect(() => {
    if (!canPing) return undefined;
    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if ((key !== 'h' && key !== 'g') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const at = pointer.current;
      if (!at) return;
      const [x, z] = snapToSpot(at.x, at.z);
      onPing({ x, z, type: key === 'g' ? 'danger' : 'look', scope: e.shiftKey ? 'all' : 'team' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pointer, canPing, onPing]);
}

export default function Scene({ mode, board, names, cosmetics = NO_COSMETICS, boardSkinId, viewSeat = 0, mySeat = -1, moves = NO_MOVES, canRoll = false, onRoll, onMove, resetKey, pings = NO_PINGS, teams = false, canPing = false, onPing, onPingMenu }) {
  const pointer = useRef(null);
  usePingKeys(pointer, canPing, onPing);
  const openPingMenu = (at) => {
    const [x, z] = snapToSpot(at.x, at.z);
    onPingMenu?.({ ...at, x, z });
  };
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  // Every room update re-sends legalMoves as a new array; only reset selection when the moves really change
  const movesKey = moves.map((m) => m.id).join('|');
  const keyMove = useKeyboardMoves(moves, movesKey, onMove, setSelected);

  useEffect(() => {
    setSelected(null);
    setHovered(null);
    document.body.style.cursor = '';
  }, [movesKey]);

  useWinFireworks(board);

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
          keyMove={keyMove}
          mySeat={mySeat}
        />
        <Pings pings={pings} teams={teams} />
        {canPing && <PingSurface pointer={pointer} onMenu={openPingMenu} />}
        <Die lastRoll={board.lastRoll} turn={board.turn} idleSeat={viewSeat} canRoll={canRoll} onRoll={onRoll} skins={cosmetics.map((c) => c?.dice)} />
      </Turntable>
      <CameraRig mode={mode} resetKey={resetKey} spinning={mode === 'game' && board.phase === 'over'} />
    </Canvas>
  );
}

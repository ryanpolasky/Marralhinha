import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Board from './Board';
import Marbles from './Marbles';
import Die from './Die';
import KillFxLayer from './KillFxLayer';
import Hits from './Hits';
import LoadoutWarmer from './LoadoutWarmer';
import Pings, { snapToSpot } from './Pings';
import { Lights } from './Stage';
import { fx } from './fx';
import { quality as defaultQuality, antialiasFor } from './quality';
import { SEAT_COLORS, layoutFor } from '../game/geometry';

const BG = '#0b1f24';
const NO_MOVES = [];
const NO_COSMETICS = [];
const NO_PINGS = [];
// three r182 dropped PCFSoft and silently falls back to PCF with a console warning; ask for PCF outright
const SHADOWS = { type: THREE.PCFShadowMap };
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const _toCamera = new THREE.Vector3();
const _homeDir = new THREE.Vector3();
const _orbit = new THREE.Spherical();
const ORBIT_SPEED = 0.16;
const framingExtent = ({ halfLength, baseCenter, dishR, dieSpot }) => Math.max(halfLength, baseCenter[0] + dishR, dieSpot[0] + 0.6);
const CLASSIC_EXTENT = framingExtent(layoutFor('classic').spec);
const PORTRAIT_FIT = 31;
const PORTRAIT_ELEVATION = 0.98;
const RAILS_FIT = 28.5;

function CameraRig({ mode, resetKey, spinning, locked, onOffView, layout }) {
  const { camera, gl, size } = useThree();
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement);
    // Right-drag / Shift+drag / two fingers pan along the table (not up into the air)
    Object.assign(c, { enablePan: true, screenSpacePanning: false, panSpeed: 0.8, enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.1, maxPolarAngle: 1.05, rotateSpeed: 0.5, zoomSpeed: 0.7 });
    return c;
  }, [camera, gl]);
  useEffect(() => () => controls.dispose(), [controls]);
  const tween = useRef(null);
  const home = useRef(null);
  const offView = useRef(false);

  useEffect(() => {
    const aspect = size.width / size.height;
    const game = mode === 'game';
    // Round the table: straight down, with the board kept clear of the HUD bars on every edge of the short side
    const overhead = game && locked;
    const portrait = game && !locked && aspect < 0.8;
    const rails = game && !locked && size.height <= 500 && aspect > 1.2;
    const elevation = overhead ? Math.PI / 2 - 1e-4 : game ? (portrait ? PORTRAIT_ELEVATION : 0.86) : 0.8;
    const zoom = framingExtent(layout.spec) / CLASSIC_EXTENT;
    const half = Math.min(size.width, size.height) / 2;
    const clear = half / Math.max(half - 120, half * 0.6);
    const distance = overhead
      ? (framingExtent(layout.spec) * 1.04 * clear) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, aspect)
      : rails
        ? RAILS_FIT * zoom
        : Math.max(game ? 33 : 28, (portrait ? PORTRAIT_FIT : game ? 33 : 31) / aspect) * zoom;
    controls.minPolarAngle = overhead ? 0 : 0.1;
    const target = new THREE.Vector3(0, 0, 0);
    const position = target.clone().add(new THREE.Vector3(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance));
    tween.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), position, target, start: null };
    home.current = { target, distance, dir: position.clone().sub(target).normalize() };
    controls.minDistance = distance * 0.55;
    controls.maxDistance = distance * 1.5;
    controls.enabled = game && !locked;
  }, [mode, resetKey, locked, size.width, size.height, camera, controls, layout]);

  // The dev hit: a slow push in on a point of the board, a cinematic orbit around it after the shot, then home
  const orbit = useRef(null);
  useEffect(() => {
    let back = null;
    const go = (position, target, dur) => (tween.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), position, target, start: null, dur });
    const release = () => {
      if (orbit.current) controls.enabled = orbit.current.enabled;
      orbit.current = null;
    };
    const off = fx.on((type, data) => {
      const h = home.current;
      if (!['focus', 'orbit', 'unfocus'].includes(type) || !h || locked) return;
      const goHome = () => {
        release();
        go(h.target.clone().addScaledVector(h.dir, h.distance), h.target.clone(), 2);
      };
      clearTimeout(back);
      if (type === 'unfocus') return goHome();
      const target = new THREE.Vector3(data.at[0], 0, data.at[2]);
      if (type === 'focus') {
        release();
        go(target.clone().addScaledVector(h.dir, h.distance * 0.56), target, data.dur || 2.2);
      } else {
        tween.current = null;
        orbit.current = { target, radius: h.distance * 0.58, phi: 0.98, speed: 0, enabled: orbit.current?.enabled ?? controls.enabled };
        controls.enabled = false;
      }
      // No hold means it lasts until someone says unfocus
      if (data.hold != null) back = setTimeout(goHome, Math.max(0, data.hold) * 1000);
      return undefined;
    });
    return () => {
      off();
      clearTimeout(back);
      release();
    };
  }, [camera, controls, locked]);

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
      const t = Math.min(1, (clock.elapsedTime - tw.start) / (tw.dur || 1.4));
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(tw.fromPos, tw.position, e);
      controls.target.lerpVectors(tw.fromTarget, tw.target, e);
      if (t >= 1) tween.current = null;
    }
    const o = orbit.current;
    if (o && !tween.current) {
      const ease = 1 - Math.exp(-dt * 1.5);
      o.speed = Math.min(ORBIT_SPEED, o.speed + dt * ORBIT_SPEED * 0.8);
      _orbit.setFromVector3(_toCamera.copy(camera.position).sub(o.target));
      _orbit.radius += (o.radius - _orbit.radius) * ease;
      _orbit.phi += (o.phi - _orbit.phi) * ease;
      _orbit.theta += o.speed * dt;
      camera.position.copy(o.target).add(_toCamera.setFromSpherical(_orbit));
      controls.target.copy(o.target);
    }
    const l = lens.current;
    // Phones have a slim bottom bar (portrait) or side rails (landscape), so there's nothing big to dodge
    const phone = (size.height <= 500 && size.width > size.height) || (size.width <= 620 && size.width < size.height);
    const goal = mode === 'game' && !locked && !phone ? size.height * 0.08 : 0;
    const next = l.shift + (goal - l.shift) * (1 - Math.exp(-dt * 3));
    if (Math.abs(next - l.shift) > 0.05 || l.w !== size.width || l.h !== size.height) {
      l.shift = next;
      l.w = size.width;
      l.h = size.height;
      camera.setViewOffset(size.width, size.height, 0, l.shift, size.width, size.height);
    }
    const panLimit = layout.spec.halfLength + 0.25;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -panLimit, panLimit);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -panLimit, panLimit);
    controls.target.y = 0;
    controls.update();

    // Tell the HUD when you've wandered off the default view (panned, zoomed or orbited away), so it
    // can nudge the reset-camera button. Only reports changes, not every frame.
    const h = home.current;
    let off = false;
    if (h && mode === 'game' && !spinning && !tween.current) {
      _toCamera.copy(camera.position).sub(controls.target);
      const zoom = Math.abs(_toCamera.length() - h.distance) / h.distance;
      const angle = _toCamera.normalize().angleTo(_homeDir.copy(h.dir));
      off = controls.target.distanceTo(h.target) > 0.8 || zoom > 0.12 || angle > 0.22;
    }
    if (off !== offView.current) {
      offView.current = off;
      onOffView?.(off);
    }
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

// Keyboard play: Tab / arrows cycle every option; 1-9 picks the nth movable marble, and pressing the
// same number again cycles that marble's options (e.g. step vs shortcut). Enter plays, Esc cancels
function useKeyboardMoves(moves, movesKey, onMove, setSelected) {
  const [keyMove, setKeyMove] = useState(null);
  useEffect(() => setKeyMove(null), [movesKey]);
  useEffect(() => {
    if (!moves.length) return undefined;
    const pick = (move) => {
      setKeyMove(move.id);
      setSelected({ seat: move.seat, marble: move.marble });
    };
    // Number keys pick marbles, not moves, so a marble with two options is still one key
    const marbleOrder = [...new Set(moves.map((m) => `${m.seat}:${m.marble}`))];
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const index = moves.findIndex((m) => m.id === keyMove);
      // Tab only takes over while nothing in the HUD has focus, so normal tabbing through buttons still works
      const tab = e.key === 'Tab' && (e.target === document.body || e.target.tagName === 'CANVAS');
      if (tab || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const back = e.key === 'ArrowLeft' || (tab && e.shiftKey);
        pick(moves[index < 0 ? (back ? moves.length - 1 : 0) : (index + (back ? -1 : 1) + moves.length) % moves.length]);
      } else if (/^[1-9]$/.test(e.key)) {
        const key = marbleOrder[Number(e.key) - 1];
        if (!key) return;
        const options = moves.filter((m) => `${m.seat}:${m.marble}` === key);
        const at = options.findIndex((m) => m.id === keyMove);
        pick(options[at < 0 ? 0 : (at + 1) % options.length]);
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
  const rightDown = useRef(null);
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
        const at = toLocal(e);
        if (e.nativeEvent.button === 2) rightDown.current = at;
        if (e.nativeEvent.pointerType !== 'touch') return;
        press.current = { x: at.screenX, y: at.screenY, timer: setTimeout(() => onMenu(at), LONG_PRESS_MS) };
      }}
      // Right-drag pans the camera, so the ping menu only opens on a right-click that didn't move
      onPointerUp={(e) => {
        cancel();
        const start = rightDown.current;
        rightDown.current = null;
        if (e.nativeEvent.button !== 2 || !start) return;
        if (Math.hypot(e.nativeEvent.clientX - start.screenX, e.nativeEvent.clientY - start.screenY) < 6) onMenu(start);
      }}
      onContextMenu={(e) => e.nativeEvent.preventDefault()}
    >
      <planeGeometry args={[32, 32]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// H pings, G pings danger; in 2v2 they go to your partner unless you hold Shift (everyone)
function usePingKeys(pointer, canPing, onPing, layout) {
  useEffect(() => {
    if (!canPing) return undefined;
    const onKey = (e) => {
      const key = e.key.toLowerCase();
      if ((key !== 'h' && key !== 'g') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const at = pointer.current;
      if (!at) return;
      const [x, z] = snapToSpot(at.x, at.z, layout);
      onPing({ x, z, type: key === 'g' ? 'danger' : 'look', scope: e.shiftKey ? 'all' : 'team' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pointer, canPing, onPing, layout]);
}

const TAP_MS = 280;
const TAP_SLOP = 10;

// On touch screens a quick tap anywhere on the table rolls; drags, pinches and long-press pings never count
function useTapToRoll(canvasRef, canRoll, onRoll) {
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !canRoll) return undefined;
    const touches = new Map();
    let multi = false;
    const down = (e) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      if (touches.size > 1) multi = true;
    };
    const release = (e) => {
      const start = touches.get(e.pointerId);
      touches.delete(e.pointerId);
      const wasMulti = multi;
      if (!touches.size) multi = false;
      return start && !wasMulti ? start : null;
    };
    const up = (e) => {
      const start = release(e);
      if (start && performance.now() - start.t <= TAP_MS && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP) onRoll();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', release);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', release);
    };
  }, [canvasRef, canRoll, onRoll]);
}

export default function Scene({ mode, board, names, cosmetics = NO_COSMETICS, boardSkinId, viewSeat = 0, mySeat = -1, moves = NO_MOVES, canRoll = false, onRoll, onMove, resetKey, pings = NO_PINGS, teams = false, canPing = false, onPing, onPingMenu, onCameraOffView, preview = false, lockCamera = false, quality = defaultQuality }) {
  const layout = layoutFor(board.variant);
  const pointer = useRef(null);
  usePingKeys(pointer, canPing, onPing, layout);
  const openPingMenu = (at) => {
    const [x, z] = snapToSpot(at.x, at.z, layout);
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

  // The die and the table tap both land on one pointerup, so only the first roll in a beat goes through
  const lastRoll = useRef(0);
  const roll = useCallback(() => {
    const now = performance.now();
    if (now - lastRoll.current < 600) return;
    lastRoll.current = now;
    onRoll?.();
  }, [onRoll]);
  const canvasRef = useRef(null);
  useTapToRoll(canvasRef, canRoll, roll);

  return (
    <Canvas
      ref={canvasRef}
      shadows={SHADOWS}
      dpr={[1, quality.dpr]}
      camera={{ fov: 38, near: 0.5, far: 400, position: [0, 34, 34] }}
      gl={{ antialias: antialiasFor(quality), powerPreference: 'high-performance' }}
      onPointerMissed={() => setSelected(null)}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 110, 230]} />
      <Lights shadowSize={quality.shadowSize} />
      <Turntable viewSeat={viewSeat}>
        <Board active={board.active} names={names} turn={board.phase === 'over' ? null : board.turn} showNames={mode === 'lobby'} skin={boardSkinId} layout={layout} />
        <KillFxLayer layout={layout} />
        <Marbles
          board={board}
          skins={cosmetics.map((c) => c?.marble)}
          killFx={cosmetics.map((c) => c?.fx)}
          trails={cosmetics.map((c) => c?.trail)}
          moves={moves}
          selected={selected}
          setSelected={setSelected}
          hovered={hovered}
          setHovered={setHovered}
          onMove={onMove}
          keyMove={keyMove}
          mySeat={mySeat}
          layout={layout}
        />
        <Hits hits={board.hits} board={board} layout={layout} />
        <LoadoutWarmer cosmetics={cosmetics} enabled={mode !== 'idle'} />
        <Pings pings={pings} teams={teams} />
        {canPing && <PingSurface pointer={pointer} onMenu={openPingMenu} />}
        <Die lastRoll={board.lastRoll} turn={board.turn} idleSeat={viewSeat} canRoll={canRoll} onRoll={roll} skins={cosmetics.map((c) => c?.dice)} layout={layout} />
      </Turntable>
      <CameraRig mode={mode} resetKey={resetKey} locked={lockCamera} spinning={preview || (!lockCamera && mode === 'game' && board.phase === 'over')} onOffView={onCameraOffView} layout={layout} />
    </Canvas>
  );
}

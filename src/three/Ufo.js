import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { fx } from './fx';
import UfoTransition from './UfoTransition';
import UfoWarmer from './UfoWarmer';
import { coneStripe, earthTexture, saucerGlass } from './ufoProps';
import { MARBLE_GEO } from './Marbles';
import { marbleSkin } from './skins';
import { makeCanvas } from './textures';
import { SEAT_COLORS } from '../game/geometry';
import { clamp01 } from '../game/hits';
import { UFO, UFO_HOVER_Y, starOf, stuntClock, ufoPhase, ufoSpot, ufoTalking } from '../game/stunts';
import { ufoButtonPose, ufoFlashbackPan, ufoFloorRoll, ufoGunMotion, ufoToastPose } from '../game/ufoMotion';

// The two sets sit far past the fog, so no camera near the table can ever see them
const SET_Z = 320;
const LAB_AT = [0, 0, SET_Z];
const KITCHEN_AT = [0, 40, SET_Z];
const ZORP = 0;
const KLARG = 1;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) ** 3;
const mix = (a, b, k) => a + (b - a) * k;
const isOn = (stunt, board, t) => starOf(stunt, board) && !stunt.cut && t < UFO.end;

function useBeats(stunt) {
  const fired = useRef(null);
  return (t, key, at, fn) => {
    if (!fired.current) fired.current = new Set();
    if (stunt.cut || t < at || fired.current.has(key)) return;
    fired.current.add(key);
    if (t - at < 0.5) fn();
  };
}

function frameDist(camera, halfW, halfH) {
  const vf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const width = camera.aspect < 0.8 ? Math.min(halfW, 2.2) : halfW;
  return Math.max(width / Math.tan(hf), halfH / (Math.tan(vf) * 0.82)) * 1.12;
}

const limb = (r0, r1, len) => new THREE.CylinderGeometry(r0, r1, len, 6).translate(0, -len / 2, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const G = {
  cranium: new THREE.SphereGeometry(0.3, 12, 8),
  eye: new THREE.SphereGeometry(0.11, 8, 6),
  mouth: new THREE.SphereGeometry(0.035, 8, 6),
  neck: new THREE.CylinderGeometry(0.065, 0.065, 0.2, 6),
  torso: new THREE.CylinderGeometry(0.18, 0.14, 0.52, 8),
  arm: limb(0.045, 0.035, 0.52),
  palm: new THREE.SphereGeometry(0.065, 6, 4),
  leg: limb(0.055, 0.04, 0.48),
  foot: new THREE.SphereGeometry(0.075, 6, 4),
  emblem: new THREE.CircleGeometry(0.045, 12),
  pad: new THREE.BoxGeometry(0.22, 0.3, 0.02),
  padScreen: new THREE.PlaneGeometry(0.18, 0.25),
  rod: new THREE.CylinderGeometry(0.014, 0.018, 0.7, 8).translate(0, 0.35, 0),
  tip: new THREE.SphereGeometry(0.05, 10, 8),
  hatCrown: new THREE.CylinderGeometry(0.22, 0.26, 0.2, 18),
  hatBrim: new THREE.CylinderGeometry(0.44, 0.44, 0.025, 24),
  hatBand: new THREE.CylinderGeometry(0.265, 0.265, 0.05, 18),
  gunBody: new THREE.BoxGeometry(0.1, 0.07, 0.22),
  gunBarrel: new THREE.CylinderGeometry(0.02, 0.026, 0.18, 10).rotateX(Math.PI / 2),
  gunEmitter: new THREE.SphereGeometry(0.038, 10, 8),
  gunGrip: new THREE.BoxGeometry(0.05, 0.12, 0.07),
  beam: new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateX(Math.PI / 2),
  coneStripe: coneStripe(),
};
const SKIN = new THREE.MeshStandardMaterial({ color: '#a9c6b0', roughness: 0.9, flatShading: true });
const PILOT_SKIN = new THREE.MeshBasicMaterial({ color: '#a9c6b0' });
const EYE = new THREE.MeshBasicMaterial({ color: '#080e12' });
const SUIT = new THREE.MeshStandardMaterial({ color: '#334b59', roughness: 0.9, flatShading: true });
const TRIM = new THREE.MeshStandardMaterial({ color: '#5ce6ff', emissive: '#2bb6d6', emissiveIntensity: 0.9, roughness: 0.3 });
const HULL = new THREE.MeshStandardMaterial({ color: '#1b232d', roughness: 0.55, metalness: 0.65, side: THREE.DoubleSide });
const CABIN_WALL = new THREE.MeshStandardMaterial({ color: '#1b232d', roughness: 0.55, metalness: 0.65, side: THREE.BackSide });
const HULL_LIGHT = new THREE.MeshStandardMaterial({ color: '#2a3542', roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide });
const CHROME = new THREE.MeshStandardMaterial({ color: '#cfd6df', roughness: 0.2, metalness: 0.95 });
const SAUCER_BODY = new THREE.MeshStandardMaterial({ color: '#98a3b1', roughness: 0.28, metalness: 0.88 });
const GLASS = saucerGlass();
const FIELD = new THREE.MeshBasicMaterial({ color: '#5ce6ff', transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const JAR = new THREE.MeshStandardMaterial({ color: '#b9fff0', roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const NEON_CYAN = new THREE.MeshBasicMaterial({ color: '#5ce6ff', toneMapped: false });
const NEON_GREEN = new THREE.MeshBasicMaterial({ color: '#5effa3', toneMapped: false });
const NEON_AMBER = new THREE.MeshBasicMaterial({ color: '#ffc14d', toneMapped: false });
const NEON_RED = new THREE.MeshBasicMaterial({ color: '#ff3b4a', toneMapped: false });
const WHITE_GLOW = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
const SPACE = new THREE.MeshBasicMaterial({ color: '#040814' });
const BUTTON = new THREE.MeshStandardMaterial({ color: '#ff2a3a', emissive: '#ff2030', emissiveIntensity: 0.7, roughness: 0.35 });
const SCREEN = new THREE.MeshBasicMaterial({ color: '#0d5f6b', toneMapped: false });
const COW_WHITE = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.85 });
const COW_BLACK = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.85 });
const PINK = new THREE.MeshStandardMaterial({ color: '#f4a3b8', roughness: 0.8 });
const DUCK = new THREE.MeshStandardMaterial({ color: '#ffd93b', roughness: 0.4 });
const ORANGE = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 });
const WALL = new THREE.MeshStandardMaterial({ color: '#f1deab', roughness: 0.9 });
const WAINSCOT = new THREE.MeshStandardMaterial({ color: '#cfae7a', roughness: 0.8 });
const WOOD = new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: 0.62 });
const COUNTER = new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.5 });
const FRIDGE = new THREE.MeshStandardMaterial({ color: '#ebe9e1', roughness: 0.35, metalness: 0.1 });
const CLOCK_FACE = new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.6 });
const DARK = new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.6 });
const CRUST = new THREE.MeshStandardMaterial({ color: '#8a4f22', roughness: 0.85 });
const CRUMB = new THREE.MeshStandardMaterial({ color: '#e7bb72', roughness: 0.9 });
const FEDORA = new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.75 });
const COAT = new THREE.MeshStandardMaterial({ color: '#b89b6a', roughness: 0.9, flatShading: true });
const SHADE = new THREE.MeshStandardMaterial({ color: '#f3c58a', emissive: '#c27a2a', emissiveIntensity: 0.35, roughness: 0.8, side: THREE.DoubleSide });
const CURTAIN = new THREE.MeshStandardMaterial({ color: '#c8463f', roughness: 0.95 });
const CEREAL = new THREE.MeshStandardMaterial({ color: '#2f8fd6', roughness: 0.7 });
const MUG = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
const GUN = new THREE.MeshStandardMaterial({ color: '#c9c9cf', roughness: 0.25, metalness: 0.85 });
const GUN_GRIP = new THREE.MeshStandardMaterial({ color: '#3b2f4f', roughness: 0.7 });

// Poses are joint targets; a track is a list of keyframes that ease into each other. arms: [-x hand, +x hand], each
// [shoulder x, shoulder y, shoulder z, elbow x]; gesture is the arm that waves while talking
const base = { y: 0, tilt: 0, fall: 0, turn: 0, headX: 0.05, headY: 0, headZ: 0, eye: 1, gesture: 0 };
const P = {
  idle: { ...base, arms: [[-0.2, 0, 0.1, -0.25], [-0.2, 0, -0.1, -0.25]] },
  tablet: { ...base, gesture: 0, arms: [[-0.35, 0, 0.12, -0.5], [-1.05, 0.3, -0.15, -1.25]] },
  present: { ...base, gesture: 0, headX: 0.12, arms: [[-1.3, -0.25, 0.3, -0.3], [-1.05, 0.3, -0.15, -1.25]] },
  emphatic: { ...base, gesture: 0, headX: 0.22, arms: [[-1.55, -0.1, 0.1, -0.1], [-1.05, 0.3, -0.15, -1.25]] },
  listenZ: { ...base, headY: 0.6, arms: [[-0.35, 0, 0.12, -0.5], [-1.05, 0.3, -0.15, -1.25]] },
  recallZ: { ...base, headX: -1.1, headY: -0.2, arms: [[-0.35, 0, 0.12, -0.5], [-1.05, 0.3, -0.15, -1.25]] },
  probe: { ...base, gesture: 1, arms: [[-0.75, -0.15, 0.15, -0.95], [-0.25, 0, -0.1, -0.3]] },
  lean: { ...base, gesture: 1, tilt: 0.32, headX: 0.28, eye: 0.3, arms: [[-0.75, -0.15, 0.15, -0.95], [-0.25, 0, -0.1, -0.3]] },
  listenK: { ...base, gesture: 1, headY: -0.5, arms: [[-0.75, -0.15, 0.15, -0.95], [-0.25, 0, -0.1, -0.3]] },
  smug: { ...base, gesture: 1, tilt: -0.08, headX: -0.15, headY: -0.4, eye: 0.7, arms: [[-0.75, -0.15, 0.15, -0.95], [-0.6, 0, -0.4, -1.5]] },
  recallK: { ...base, headX: -1.1, headY: 0.2, arms: [[-0.75, -0.15, 0.15, -0.95], [-0.25, 0, -0.1, -0.3]] },
  leader: { ...base, gesture: 1, headX: 0.08, arms: [[-1.55, 0, 0.1, -0.05], [-0.3, 0, -0.1, -0.3]] },
  waiting: { ...base, gesture: 1, headX: 0.2, tilt: 0.1, arms: [[-1.55, 0, 0.1, -0.05], [-0.3, 0, -0.1, -0.3]] },
  watch: { ...base, headX: 0.12, headY: 0.25, arms: [[-0.2, 0, 0.1, -0.25], [-0.2, 0, -0.1, -0.25]] },
  whisper: { ...base, gesture: 0, tilt: 0.14, headX: 0.1, headY: -0.55, arms: [[-0.3, 0, 0.1, -0.3], [-1.15, 0.45, -0.3, -1.7]] },
  startle: { ...base, y: 0.2, headX: -0.38, eye: 1.5, arms: [[-2.7, 0, -0.8, -0.2], [-2.7, 0, 0.8, -0.2]] },
  fallen: { ...base, y: 0.3, fall: -1.5, headX: -0.25, eye: 1.4, arms: [[-2.3, 0, -0.8, -0.5], [-2.3, 0, 0.8, -0.5]] },
  aim: { ...base, arms: [[-0.18, 0, -0.45, 0], [-0.3, 0, 0.1, -0.3]] },
  aimLook: { ...base, headY: 0.7, arms: [[-0.18, 0, -0.45, 0], [-0.3, 0, 0.1, -0.3]] },
  sober: { ...base, gesture: 1, tilt: -0.05, headX: -0.1, headY: -0.5, eye: 1, arms: [[-0.75, -0.15, 0.15, -0.95], [-1.25, 0.3, -0.55, -1.3]] },
  pointZ: { ...base, gesture: 0, headX: 0.15, arms: [[-1.35, -0.2, 0.35, -0.2], [-1.05, 0.3, -0.15, -1.25]] },
  poke: { ...base, gesture: 1, turn: -0.45, tilt: 0.22, headX: 0.28, arms: [[-1.42, -0.1, 0.05, -0.3], [-0.25, 0, -0.1, -0.3]] },
  dismiss: { ...base, gesture: 0, headY: -0.3, arms: [[-0.9, -0.6, 0.6, -0.4], [-1.05, 0.3, -0.15, -1.25]] },
};

const blendPose = (a, b, k) => ({
  y: mix(a.y, b.y, k),
  tilt: mix(a.tilt, b.tilt, k),
  fall: mix(a.fall, b.fall, k),
  turn: mix(a.turn, b.turn, k),
  headX: mix(a.headX, b.headX, k),
  headY: mix(a.headY, b.headY, k),
  headZ: mix(a.headZ, b.headZ, k),
  eye: mix(a.eye, b.eye, k),
  gesture: b.gesture,
  arms: a.arms.map((arm, i) => arm.map((v, j) => mix(v, b.arms[i][j], k))),
});

function poseAt(track, t) {
  let i = 0;
  while (i + 1 < track.length && t >= track[i + 1].t) i++;
  const cur = track[i];
  if (i === 0) return { pose: cur.pose, mood: cur.mood };
  const k = smooth(clamp01((t - cur.t) / (cur.dur ?? 0.35)));
  return { pose: k >= 1 ? cur.pose : blendPose(track[i - 1].pose, cur.pose, k), mood: cur.mood };
}

function applyGrey(r, pose, t, seed, { talking = false, mood = null, jab = 0, facing = 0 }) {
  if (!r.root || !r.body || !r.head || !r.mouth) return;
  const { y, tilt } = pose;
  let { headX, headY } = pose;
  let shake = 0;
  const chuckling = mood === 'chuckle';
  if (chuckling) {
    headX += Math.sin(t * 10 + seed) * 0.06 - 0.1;
  } else if (mood === 'panic') {
    shake = Math.sin(t * 42 + seed) * 0.03;
    headY += Math.sin(t * 12 + seed) * 0.08;
  } else if (mood === 'shake') shake = Math.sin(t * 36 + seed) * 0.012;
  r.root.position.set(shake, y, 0);
  r.root.rotation.set(pose.fall, facing + pose.turn * 0.45, 0);
  r.body.rotation.set(tilt, 0, 0);
  const nod = talking ? Math.sin(t * 8 + seed) * 0.025 : 0;
  r.head.rotation.set(headX * 0.5 + nod, headY * 0.45, pose.headZ * 0.5);
  const blink = (t * 0.9 + seed * 0.37) % 3.1 < 0.11 ? 0.08 : 1;
  r.eyes.forEach((e) => (e.scale.y = 0.85 * blink * (chuckling ? 0.7 : 1)));
  r.mouth.scale.y = talking || chuckling ? 0.55 + Math.abs(Math.sin(t * (chuckling ? 10 : 16) + seed)) * 1.8 : 0.25;
  pose.arms.forEach((a, i) => {
    const arm = r.arms[i];
    if (!arm) return;
    arm.rotation.set(a[0] + a[3] * 0.4 - (i === 0 ? jab * 0.15 : 0), 0, a[2] * 0.65);
    r.armMeshes[i].scale.y = 1;
    r.hands[i].position.y = -0.52;
  });
  if (r.probe) r.probe.scale.y = 1 + jab * 0.35;
}

function aimHand(r, i, target) {
  const arm = r.arms[i];
  arm.parent.updateWorldMatrix(true, false);
  arm.parent.worldToLocal(_a.copy(target)).sub(arm.position);
  const length = _a.length();
  arm.quaternion.setFromUnitVectors(DOWN, _a.normalize());
  r.armMeshes[i].scale.y = length / 0.52;
  r.hands[i].position.y = -length;
}

const Grey = React.memo(function Grey({ rig, scale = 1, tablet = false, probe = false, fedora = false, coat = false, gun = false }) {
  const r = rig.current;
  const arm = (i, side, child) => (
    <group key={side} name={`ufo-arm-${i}`} ref={(el) => (r.arms[i] = el)} position={[side * 0.2, 1.02, 0]}>
      <mesh name="ufo-sleeve" ref={(el) => (r.armMeshes[i] = el)} geometry={G.arm} material={coat ? COAT : SUIT} castShadow />
      <group name={`ufo-hand-${i}`} ref={(el) => (r.hands[i] = el)} position-y={-0.52}>
        <mesh name="ufo-palm" geometry={G.palm} material={SKIN} scale={[1, 1.15, 0.8]} />
        {child}
      </group>
    </group>
  );
  return (
    <group ref={(el) => (r.root = el)} scale={scale}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.09, 0.53, 0]}>
          <mesh geometry={G.leg} material={SUIT} />
          <mesh name="ufo-foot" geometry={G.foot} material={SUIT} position={[0, -0.48, 0.04]} scale={[1, 0.6, 1.5]} />
        </group>
      ))}
      <group name="ufo-waist" ref={(el) => (r.body = el)} position-y={0.53}>
        <group position-y={-0.53}>
          <mesh name="ufo-torso" geometry={G.torso} material={coat ? COAT : SUIT} position-y={0.79} castShadow />
          {!coat && <mesh geometry={G.emblem} material={TRIM} position={[0, 0.9, 0.16]} />}
          <mesh geometry={G.neck} material={SKIN} position-y={1.17} />
          <group name="ufo-alien-head" ref={(el) => (r.head = el)} position-y={1.3}>
            <mesh name="ufo-head-shell" geometry={G.cranium} material={SKIN} position-y={0.18} scale={[1.3, 1.35, 1.1]} castShadow />
            {[-1, 1].map((side, i) => (
              <group key={side} position={[side * 0.145, 0.2, 0.285]} rotation={[0, side * 0.3, -side * 0.2]}>
                <mesh ref={(el) => (r.eyes[i] = el)} geometry={G.eye} material={EYE} scale={[0.8, 0.85, 0.3]} />
              </group>
            ))}
            <mesh ref={(el) => (r.mouth = el)} geometry={G.mouth} material={EYE} position={[0, 0.015, 0.3]} scale={[1.8, 0.25, 0.4]} />
            {fedora && (
              <group position={[0, 0.56, -0.02]} rotation-x={0.12}>
                <mesh geometry={G.hatBrim} material={FEDORA} />
                <mesh geometry={G.hatCrown} material={FEDORA} position-y={0.11} />
                <mesh geometry={G.hatBand} material={DARK} position-y={0.04} />
              </group>
            )}
          </group>
          {arm(
            0,
            -1,
            <>
              {probe && (
                <group ref={(el) => (r.probe = el)} position={[0, -0.02, 0]} rotation-x={Math.PI}>
                  <mesh geometry={G.rod} material={CHROME} />
                  <mesh geometry={G.tip} material={NEON_CYAN} position-y={0.72} />
                </group>
              )}
            </>
          )}
          {arm(
            1,
            1,
            <>
              {gun && (
                <group name="ufo-raygun" ref={(el) => (r.gun = el)} position={[0, -0.06, 0]} rotation-x={Math.PI / 2}>
                  <mesh geometry={G.gunBody} material={GUN} />
                  <mesh geometry={G.gunBarrel} material={GUN} position-z={0.18} />
                  <mesh geometry={G.gunEmitter} material={NEON_RED} position-z={0.28} />
                  <mesh geometry={G.gunGrip} material={GUN_GRIP} position={[0, -0.08, -0.05]} rotation-x={0.3} />
                </group>
              )}
              {tablet && (
                <group position={[0, -0.06, 0.1]} rotation={[-0.9, 0.2, 0]}>
                  <mesh geometry={G.pad} material={HULL} />
                  <mesh geometry={G.padScreen} material={NEON_CYAN} position-z={0.012} />
                </group>
              )}
            </>
          )}
        </group>
      </group>
    </group>
  );
});

const newRig = () => ({ arms: [], armMeshes: [], hands: [], eyes: [] });

const LAB_TRACKS = {
  [ZORP]: [
    { t: 0, pose: P.tablet },
    { t: UFO.specimen, pose: P.present },
    { t: UFO.ball - 0.1, pose: P.listenZ },
    { t: UFO.menace, pose: P.emphatic },
    { t: UFO.toaster, pose: P.listenZ },
    { t: UFO.freeze, pose: P.recallZ, dur: 0.55 },
    { t: UFO.lab2, pose: P.tablet, mood: 'chuckle', dur: 0.2 },
    { t: UFO.cried, pose: P.listenZ },
    { t: UFO.cord, pose: P.listenZ },
    { t: UFO.pokeIt, pose: P.pointZ },
    { t: UFO.poke1, pose: P.watch },
    { t: UFO.nothing, pose: P.tablet },
    { t: UFO.tossIt, pose: P.dismiss },
    { t: UFO.button, pose: P.tablet },
  ],
  [KLARG]: [
    { t: 0, pose: P.probe },
    { t: UFO.ball - 0.2, pose: P.lean, dur: 0.5 },
    { t: UFO.menace, pose: P.listenK },
    { t: UFO.toaster, pose: P.smug },
    { t: UFO.freeze, pose: P.recallK, dur: 0.55 },
    { t: UFO.lab2, pose: P.probe, mood: 'chuckle', dur: 0.2 },
    { t: UFO.cried, pose: P.listenK },
    { t: UFO.cord, pose: P.sober },
    { t: UFO.pokeIt, pose: P.probe },
    { t: UFO.poke1 - 0.3, pose: P.poke, dur: 0.3 },
    { t: UFO.poke3 + 0.35, pose: P.probe },
    { t: UFO.tossIt + 0.3, pose: P.idle, dur: 0.45 },
  ],
};
const KITCHEN_TRACKS = {
  [ZORP]: [
    { t: 0, pose: P.watch },
    { t: UFO.thinking - 0.2, pose: P.whisper },
    { t: UFO.ding, pose: P.startle, dur: 0.1, mood: 'panic' },
    { t: UFO.armed, pose: P.aim, mood: 'shake', dur: 0.25 },
    { t: UFO.abort, pose: P.aimLook, mood: 'shake' },
  ],
  [KLARG]: [
    { t: 0, pose: P.idle },
    { t: UFO.leader, pose: P.leader },
    { t: UFO.tick, pose: P.waiting, dur: 0.6 },
    { t: UFO.ding, pose: P.startle, dur: 0.1, mood: 'panic' },
    { t: UFO.ding + 0.3, pose: P.fallen, dur: 0.35, mood: 'panic' },
  ],
};
const POKES = [UFO.poke1, UFO.poke2, UFO.poke3];
const jabAt = (t) => Math.max(0, ...POKES.map((p) => Math.sin(Math.PI * clamp01((t - p + 0.12) / 0.3))));

// Examination room: curved hull, porthole with Earth drifting by, consoles, specimen jars and the pedestal with its field
function LabSet({ stunt, board, clock, marbleMat }) {
  const root = useRef();
  const zorp = useRef(newRig());
  const klarg = useRef(newRig());
  const klargSpot = useRef();
  const specimen = useRef();
  const field = useRef();
  const scan = useRef();
  const rings = useRef([]);
  const blinkers = useRef([]);
  const earth = useRef();
  const column = useRef();
  const hatch = useRef();
  const button = useRef();
  const beat = useBeats(stunt);
  const fieldMat = useMemo(() => FIELD.clone(), []);
  const buttonMat = useMemo(() => BUTTON.clone(), []);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const globe = useMemo(() => earthTexture(), []);
  useEffect(
    () => () => {
      fieldMat.dispose();
      buttonMat.dispose();
      globe.dispose();
    },
    [fieldMat, buttonMat, globe]
  );

  useFrame((_, dt) => {
    const t = clock() ?? Infinity;
    const phase = ufoPhase(t);
    const on = phase === 'lab' && isOn(stunt, board, t);
    root.current.visible = on;
    if (!on) return;
    rings.current.forEach((ring, i) => ring && (ring.position.y = 0.86 + (((t * 0.55 + i / 2) % 1) + 1) % 1 * 1.1));
    scan.current.position.y = 0.95 + (0.5 + 0.5 * Math.sin(t * 1.8)) * 0.95;
    blinkers.current.forEach((b, i) => b && (b.scale.y = Math.sin(t * (2.1 + (i % 5) * 0.9) + i * 1.7) > 0.25 ? 1 : 0.18));
    earth.current.rotation.y = -1.8 + t * 0.012;

    const jab = jabAt(t);
    const jiggle = POKES.reduce((acc, p) => {
      const d = t - p;
      return d > 0 && d < 0.45 ? acc + Math.sin(d * 18) * (1 - d / 0.45) * 0.05 : acc;
    }, 0);
    const dropping = t >= UFO.drop;
    const fall = dropping ? t - UFO.drop : 0;
    const s = specimen.current;
    if (dropping) {
      s.position.y = 1.3 - 4.5 * fall * fall;
      s.visible = s.position.y > -1.4;
    } else {
      s.visible = true;
      s.position.set(-jiggle * 0.45, 1.3 + Math.sin(t * 2.2) * 0.04 + Math.abs(jiggle) * 0.12, 0);
      s.scale.set(1 + jiggle * 0.25, 1 - Math.abs(jiggle) * 0.2, 1 + jiggle * 0.25);
      s.rotation.y += dt * 0.8;
      s.rotation.x = Math.sin(t * 0.7) * 0.2;
    }
    const opening = clamp01((t - UFO.button - 0.1) / 0.4);
    fieldMat.opacity = 0.13 * (1 - opening);
    field.current.visible = opening < 1;
    column.current.scale.y = 1 - 0.92 * smooth(opening);
    column.current.position.y = 0.38 * column.current.scale.y;
    hatch.current.position.set(1.5 * smooth(clamp01((t - UFO.button - 0.3) / 0.35)), -0.26 * smooth(clamp01((t - UFO.button - 0.1) / 0.2)), 0);
    const buttonPose = ufoButtonPose(t);
    const { press } = buttonPose;
    button.current.position.y = 1.08 - press * 0.05;
    button.current.material.emissiveIntensity = 0.7 + press * 2.5;

    beat(t, 'drop', UFO.drop, () => fx.emit('burst', { position: [LAB_AT[0], LAB_AT[1] + 0.3, LAB_AT[2]], colors: ['#5effa3', '#5ce6ff'], count: 20, speed: 0.6, up: -0.5, size: 0.05, life: 0.6, gravity: 0.8 }));

    const z = poseAt(LAB_TRACKS[ZORP], t);
    const k = poseAt(LAB_TRACKS[KLARG], t);
    applyGrey(zorp.current, z.pose, t, 1.3, { talking: ufoTalking(ZORP, t), mood: z.mood, facing: 0.35 });
    klargSpot.current.position.fromArray(buttonPose.actor);
    applyGrey(klarg.current, k.pose, t + 0.7, 4.1, { talking: ufoTalking(KLARG, t), mood: k.mood, facing: -0.35 * (1 - buttonPose.walk), jab });
    if (t >= UFO.button - 1) {
      root.current.localToWorld(_b.fromArray(buttonPose.hand));
      aimHand(klarg.current, 1, _b);
    }
  });

  const desk = (side) => (
    <group position={[side * 2.5, 0, -3.0]} rotation-y={-side * 0.55}>
      <mesh geometry={BOX} material={HULL_LIGHT} position-y={0.45} scale={[1.6, 0.9, 0.7]} />
      <group position={[0, 0.95, 0.1]} rotation-x={-0.5}>
        <mesh geometry={BOX} material={HULL} scale={[1.6, 0.06, 0.8]} />
        <mesh geometry={BOX} material={SCREEN} position={[0, 0.035, -0.1]} scale={[1.3, 0.01, 0.42]} />
        {[0, 1].map((row) =>
          [0, 1, 2, 3, 4].map((col) => (
            <mesh key={`${row}${col}`} ref={(el) => (blinkers.current[side > 0 ? 10 + row * 5 + col : row * 5 + col] = el)} geometry={BOX} material={[NEON_CYAN, NEON_GREEN, NEON_AMBER][(row + col) % 3]} position={[-0.56 + col * 0.28, 0.04, 0.22 + row * 0.1]} scale={[0.1, 0.04, 0.05]} />
          ))
        )}
      </group>
    </group>
  );
  const jar = (x, children) => (
    <group position={[x, 1.56, -3.75]}>
      <mesh geometry={BOX} material={NEON_GREEN} position-y={0.005} scale={[0.44, 0.01, 0.44]} />
      {children}
      <mesh material={JAR} position-y={0.28}>
        <cylinderGeometry args={[0.24, 0.24, 0.56, 20, 1, true]} />
      </mesh>
      <mesh material={CHROME} position-y={0.58}>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 20]} />
      </mesh>
    </group>
  );

  return (
    <group name="ufo-lab-set" ref={root} position={LAB_AT} visible={false}>
      <spotLight position={[0, 4.1, 0.4]} angle={0.55} penumbra={0.7} intensity={45} distance={9} color="#d9fff1" target={spotTarget} />
      <primitive object={spotTarget} position={[0, 1, 0]} />
      <pointLight position={[0, 2.5, 2.2]} intensity={9} distance={9} color="#5ce6ff" />
      <pointLight position={[-2.3, 2.2, -3.2]} intensity={5} distance={5} color="#5effa3" />
      <pointLight position={[2.6, 1.6, -2.4]} intensity={4} distance={5} color="#ffc14d" />
      <mesh material={HULL} position-y={-0.06} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[4.8, 48]} />
      </mesh>
      {[1.3, 2.6, 3.9].map((r) => (
        <mesh key={r} material={r === 2.6 ? NEON_GREEN : NEON_CYAN} position-y={-0.05} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[r - 0.012, r + 0.012, 64]} />
        </mesh>
      ))}
      <mesh name="ufo-cabin-wall" material={CABIN_WALL} position-y={2.15}>
        <cylinderGeometry args={[4.8, 4.8, 4.5, 48, 1, true]} />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI * 0.6 + (i / 10) * Math.PI * 0.8;
        return <mesh key={i} geometry={BOX} material={HULL_LIGHT} position={[Math.sin(a) * 4.7, 2.15, Math.cos(a) * 4.7]} rotation-y={a} scale={[0.14, 4.4, 0.22]} />;
      })}
      <mesh material={HULL_LIGHT} position-y={4.4} rotation-x={Math.PI / 2}>
        <circleGeometry args={[4.8, 48]} />
      </mesh>
      <mesh material={NEON_CYAN} position-y={4.38} rotation-x={Math.PI / 2}>
        <ringGeometry args={[1.2, 1.3, 48]} />
      </mesh>

      <group position={[0, 2.25, -4.4]}>
        <mesh material={SPACE}>
          <circleGeometry args={[1.18, 40]} />
        </mesh>
        <mesh material={HULL_LIGHT} position-z={0.03} rotation-x={0}>
          <torusGeometry args={[1.2, 0.07, 10, 48]} />
        </mesh>
        {[[-0.7, 0.5], [0.5, 0.8], [-0.2, -0.75], [0.85, -0.3], [-0.9, -0.2], [0.15, 0.25], [0.6, 0.1]].map(([x, y], i) => (
          <mesh key={i} material={WHITE_GLOW} position={[x, y, 0.01]} scale={i % 3 ? 1 : 1.6}>
            <sphereGeometry args={[0.016, 6, 5]} />
          </mesh>
        ))}
        <group ref={earth} position={[0.25, -0.05, 0.3]} rotation-z={0.12}>
          <mesh name="ufo-earth">
            <sphereGeometry args={[0.65, 32, 20]} />
            <meshStandardMaterial map={globe} roughness={1} metalness={0} envMapIntensity={0.05} emissive="#8fa8bf" emissiveMap={globe} emissiveIntensity={0.35} />
          </mesh>
        </group>
      </group>

      {desk(-1)}
      {desk(1)}
      <group position={[1.65, 0, 0.45]}>
        <mesh material={CHROME} position-y={0.5}>
          <cylinderGeometry args={[0.06, 0.1, 1, 12]} />
        </mesh>
        <mesh material={HULL} position-y={1.02}>
          <cylinderGeometry args={[0.26, 0.26, 0.08, 20]} />
        </mesh>
        <mesh name="ufo-eject-button" ref={button} material={buttonMat} position-y={1.08}>
          <cylinderGeometry args={[0.16, 0.17, 0.08, 20]} />
        </mesh>
      </group>

      <group position={[-2.2, 0, 0]}>
        <mesh geometry={BOX} material={HULL_LIGHT} position={[0, 1.53, -3.75]} scale={[2.0, 0.06, 0.55]} />
        {jar(
          -0.62,
          <group position-y={0.09} scale={0.9} rotation-y={0.4}>
            <mesh geometry={BOX} material={COW_WHITE} position-y={0.12} scale={[0.3, 0.17, 0.15]} />
            <mesh geometry={BOX} material={COW_BLACK} position={[0.03, 0.15, 0.08]} scale={[0.1, 0.09, 0.02]} />
            <mesh geometry={BOX} material={COW_BLACK} position={[-0.09, 0.1, -0.08]} scale={[0.08, 0.07, 0.02]} />
            <mesh geometry={BOX} material={COW_WHITE} position={[0.19, 0.17, 0]} scale={[0.1, 0.1, 0.1]} />
            <mesh geometry={BOX} material={PINK} position={[0.245, 0.15, 0]} scale={[0.03, 0.05, 0.07]} />
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={BOX} material={COW_BLACK} position={[0.2, 0.25, s * 0.05]} scale={[0.02, 0.05, 0.02]} />
            ))}
            {[[-0.1, -0.05], [-0.1, 0.05], [0.1, -0.05], [0.1, 0.05]].map(([x, z], i) => (
              <mesh key={i} geometry={BOX} material={COW_WHITE} position={[x, 0.02, z]} scale={[0.04, 0.06, 0.04]} />
            ))}
            <mesh material={PINK} position={[-0.02, 0.03, 0]} scale={[1, 0.7, 1]}>
              <sphereGeometry args={[0.045, 8, 6]} />
            </mesh>
          </group>
        )}
        {jar(
          0,
          <group position-y={0.1} rotation-y={-0.5}>
            <mesh material={DUCK} position-y={0.06} scale={[1.2, 0.85, 1]}>
              <sphereGeometry args={[0.1, 14, 10]} />
            </mesh>
            <mesh material={DUCK} position={[0.08, 0.18, 0]}>
              <sphereGeometry args={[0.07, 14, 10]} />
            </mesh>
            <mesh material={ORANGE} position={[0.16, 0.17, 0]} rotation-z={-Math.PI / 2}>
              <coneGeometry args={[0.03, 0.06, 8]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} material={EYE} position={[0.11, 0.21, s * 0.04]}>
                <sphereGeometry args={[0.012, 6, 5]} />
              </mesh>
            ))}
          </group>
        )}
        {jar(
          0.62,
          <group position-y={0.01}>
            <mesh geometry={BOX} material={ORANGE} position-y={0.015} scale={[0.22, 0.03, 0.22]} />
            <mesh material={ORANGE} position-y={0.19}>
              <coneGeometry args={[0.1, 0.34, 10]} />
            </mesh>
            <mesh name="ufo-cone-stripe" geometry={G.coneStripe} material={COW_WHITE} position-y={0.19} />
          </group>
        )}
      </group>

      <group ref={hatch}>
        <mesh material={HULL_LIGHT} position-y={-0.02}>
          <cylinderGeometry args={[0.72, 0.72, 0.08, 28]} />
        </mesh>
        <mesh material={NEON_CYAN} position-y={0.025} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.66, 0.7, 40]} />
        </mesh>
      </group>
      <group ref={column} position-y={0.38}>
        <mesh material={CHROME}>
          <cylinderGeometry args={[0.3, 0.42, 0.76, 24]} />
        </mesh>
        <mesh material={HULL} position-y={0.4}>
          <cylinderGeometry args={[0.5, 0.52, 0.08, 24]} />
        </mesh>
      </group>
      <group ref={field}>
        <mesh material={fieldMat} position-y={1.4} renderOrder={10}>
          <cylinderGeometry args={[0.56, 0.56, 1.2, 28, 1, true]} />
        </mesh>
        {[0, 1].map((i) => (
          <mesh key={i} ref={(el) => (rings.current[i] = el)} material={NEON_CYAN} rotation-x={Math.PI / 2} renderOrder={11}>
            <torusGeometry args={[0.57, 0.012, 6, 36]} />
          </mesh>
        ))}
        <mesh ref={scan} geometry={BOX} position-y={1.3} scale={[1.15, 0.012, 1.15]} renderOrder={11}>
          <meshBasicMaterial color="#ff5a6e" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={specimen} geometry={MARBLE_GEO} material={marbleMat} position-y={1.3} castShadow />
      <group name="ufo-lab-zorp" position={[-1.1, 0, -0.35]}>
        <Grey rig={zorp} scale={0.92} tablet />
      </group>
      <group name="ufo-lab-klarg" ref={klargSpot} position={[1.1, 0, -0.35]}>
        <Grey rig={klarg} scale={1.08} probe />
      </group>
    </group>
  );
}

// Tulsa, 2009: a kitchen at night, two Greys in fedoras, and a toaster that will not negotiate
function KitchenSet({ stunt, board, clock }) {
  const root = useRef();
  const zorp = useRef(newRig());
  const klarg = useRef(newRig());
  const toaster = useRef();
  const lever = useRef();
  const coils = useRef();
  const toast = useRef([]);
  const beams = useRef([]);
  const seconds = useRef();
  const beat = useBeats(stunt);
  const checker = useMemo(() => {
    const [canvas, ctx] = makeCanvas(64, 64);
    ctx.fillStyle = '#f2ede1';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#2b2b30';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 7);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const floorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: checker, roughness: 0.4 }), [checker]);
  const cord = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.2, 0.87, -0.12),
    new THREE.Vector3(0.34, 0.85, -0.35),
    new THREE.Vector3(0.43, 0.85, -0.55),
    new THREE.Vector3(0.46, 0.64, -0.66),
    new THREE.Vector3(0.65, 0.1, -0.8),
    new THREE.Vector3(0.82, 0.035, -1.6),
    new THREE.Vector3(0.9, 0.06, -2.42),
    new THREE.Vector3(0.9, 0.36, -2.59),
  ]), 48, 0.012, 5, false), []);
  useEffect(
    () => () => {
      checker.dispose();
      floorMat.dispose();
      cord.dispose();
    },
    [checker, floorMat, cord]
  );
  const TOAST_Y = 1.04;
  const muzzle = useMemo(() => new THREE.Vector3(-0.4, 0.97, -0.2), []);
  const TARGET = useMemo(() => new THREE.Vector3(0, 0.96, 0.05), []);

  useFrame(() => {
    const t = clock() ?? Infinity;
    const on = ufoPhase(t) === 'kitchen' && isOn(stunt, board, t);
    root.current.visible = on;
    if (!on) return;
    seconds.current.rotation.z = -Math.floor(t) * (Math.PI / 30);
    const heat = clamp01((t - UFO.kitchen) / (UFO.ding - UFO.kitchen));
    coils.current.material.opacity = 0.25 + heat * 0.7;
    const popped = t >= UFO.ding;
    lever.current.position.y = popped ? 0.1 : -0.08;
    toast.current.forEach((slice, i) => {
      if (!slice) return;
      const pose = ufoToastPose(i, t);
      slice.position.fromArray(pose.position);
      slice.rotation.fromArray(pose.rotation);
    });
    const jolt = [0, 1, 2].reduce((acc, i) => {
      const d = t - (UFO.pew + i * 0.17 + 0.12);
      return d > 0 && d < 0.3 ? acc + Math.sin(d * 40) * (1 - d / 0.3) * 0.12 : acc;
    }, 0);
    toaster.current.rotation.z = jolt;
    toaster.current.position.y = 0.82 + Math.abs(jolt) * 0.3;
    const z = poseAt(KITCHEN_TRACKS[ZORP], t);
    const k = poseAt(KITCHEN_TRACKS[KLARG], t);
    applyGrey(zorp.current, z.pose, t, 2.2, { talking: ufoTalking(ZORP, t), mood: z.mood, facing: 0.4 });
    applyGrey(klarg.current, k.pose, t + 0.4, 5.3, { talking: ufoTalking(KLARG, t), mood: k.mood, facing: -0.4 });
    const tumble = ufoFloorRoll(t);
    klarg.current.root.rotation.y += tumble.roll;
    klarg.current.root.position.x += tumble.x;
    klarg.current.root.position.y += tumble.y;
    const gun = zorp.current.gun;
    if (gun) {
      gun.visible = t >= UFO.armed + 0.3;
      if (gun.visible) {
        const raise = smooth(clamp01((t - UFO.armed) / 0.4));
        const motion = ufoGunMotion(t);
        _b.fromArray(motion.hand);
        _b.y = mix(0.65, _b.y, raise);
        _b.z = mix(0.2, _b.z, raise);
        zorp.current.root.localToWorld(_b);
        aimHand(zorp.current, 1, _b);
        gun.position.set(0, 0, 0);
        gun.lookAt(root.current.localToWorld(_a.copy(TARGET)));
        gun.rotation.x += motion.aim[0];
        gun.rotation.y += motion.aim[1];
        gun.updateWorldMatrix(true, false);
        gun.parent.worldToLocal(gun.localToWorld(_a.set(0, -0.08, -0.05)));
        gun.position.sub(_a);
        root.current.worldToLocal(gun.localToWorld(muzzle.set(0, 0, 0.3)));
      }
    }
    beams.current.forEach((b, i) => {
      if (!b) return;
      const k = (t - (UFO.pew + i * 0.17)) / 0.12;
      b.visible = k >= 0 && k <= 1;
      if (!b.visible) return;
      b.position.lerpVectors(muzzle, TARGET, k);
      b.quaternion.setFromUnitVectors(FWD, _a.copy(TARGET).sub(muzzle).normalize());
    });
    [0, 1, 2].forEach((i) =>
      beat(t, `hit${i}`, UFO.pew + i * 0.17 + 0.12, () => {
        fx.emit('burst', { position: [KITCHEN_AT[0] + TARGET.x, KITCHEN_AT[1] + TARGET.y + 0.1, KITCHEN_AT[2] + TARGET.z], colors: ['#ffd166', '#ffffff', '#ff8a3d'], count: 18, speed: 2.6, up: 1.8, size: 0.05, life: 0.4, gravity: 0.6 });
        if (i === 2) fx.emit('burst', { position: [KITCHEN_AT[0], KITCHEN_AT[1] + 1.15, KITCHEN_AT[2]], colors: ['#7a7a7a', '#a3a3a3', '#4a4a4a'], count: 16, speed: 0.5, up: 1.1, size: 0.14, life: 2.2, gravity: -0.05 });
      })
    );
    beat(t, 'pop', UFO.ding, () => fx.emit('burst', { position: [KITCHEN_AT[0], KITCHEN_AT[1] + 1.15, KITCHEN_AT[2]], colors: ['#ffd166', '#fff3b0', '#c97a4b'], count: 24, speed: 2.4, up: 2.6, size: 0.06, life: 0.7, gravity: 0.8 }));

  });

  return (
    <group name="ufo-kitchen-set" ref={root} position={KITCHEN_AT} visible={false}>
      <pointLight position={[0, 3.05, 0.4]} intensity={12} distance={13} color="#ffe2b8" />
      <pointLight position={[2.3, 2.2, -2.2]} intensity={2} distance={6} color="#9fc2ff" />
      <mesh geometry={BOX} material={floorMat} position-y={-0.05} scale={[12, 0.1, 7]} />
      <mesh geometry={BOX} material={WALL} position={[0, 2.05, -2.7]} scale={[12, 4.2, 0.15]} />
      <mesh geometry={BOX} material={WAINSCOT} position={[0, 0.6, -2.61]} scale={[12, 1.2, 0.04]} />
      <mesh geometry={BOX} material={WOOD} position={[0, 0.08, -2.6]} scale={[12, 0.16, 0.05]} />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={BOX} material={WALL} position={[s * 6, 2.05, 0.5]} scale={[0.15, 4.2, 6.5]} />
      ))}
      <mesh geometry={BOX} material={COUNTER} position={[0, 4.15, 0.5]} scale={[12, 0.1, 6.5]} />

      <group position={[0, 3.3, 0.35]}>
        <mesh material={DARK} position-y={0.55}>
          <cylinderGeometry args={[0.012, 0.012, 0.7, 6]} />
        </mesh>
        <mesh material={SHADE} rotation-x={Math.PI}>
          <coneGeometry args={[0.52, 0.42, 24, 1, true]} />
        </mesh>
        <mesh material={WHITE_GLOW} position-y={-0.08}>
          <sphereGeometry args={[0.07, 10, 8]} />
        </mesh>
      </group>

      <group position={[2.3, 2.2, -2.6]}>
        <mesh geometry={BOX} material={WOOD} scale={[1.75, 1.75, 0.12]} />
        <mesh geometry={BOX} material={SPACE} position-z={0.065} scale={[1.5, 1.5, 0.01]} />
        <mesh material={WHITE_GLOW} position={[0.35, 0.4, 0.075]}>
          <circleGeometry args={[0.2, 24]} />
        </mesh>
        <mesh material={DARK} position={[-0.35, -0.3, 0.075]}>
          <coneGeometry args={[0.32, 0.7, 8]} />
        </mesh>
        <mesh geometry={BOX} material={DARK} position={[-0.35, -0.68, 0.075]} scale={[0.08, 0.2, 0.01]} />
        <mesh geometry={BOX} material={WOOD} position-z={0.08} scale={[1.5, 0.05, 0.03]} />
        <mesh geometry={BOX} material={WOOD} position-z={0.08} scale={[0.05, 1.5, 0.03]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={BOX} material={CURTAIN} position={[s * 1.0, 0.05, 0.1]} scale={[0.35, 1.95, 0.06]} />
        ))}
      </group>

      <group position={[-3.6, 0, -2.2]}>
        <mesh geometry={BOX} material={FRIDGE} position-y={1.05} scale={[0.95, 2.1, 0.85]} />
        <mesh geometry={BOX} material={DARK} position={[0, 1.35, 0.43]} scale={[0.9, 0.015, 0.01]} />
        <mesh geometry={BOX} material={CHROME} position={[0.35, 1.0, 0.45]} scale={[0.04, 0.5, 0.04]} />
        <mesh geometry={BOX} material={CHROME} position={[0.35, 1.6, 0.45]} scale={[0.04, 0.3, 0.04]} />
        <mesh geometry={BOX} material={COW_WHITE} position={[-0.15, 1.65, 0.435]} scale={[0.26, 0.3, 0.01]} />
        {[['#e8463f', -0.3, 1.85], ['#3b8ee6', 0.05, 1.9], ['#f0c230', -0.1, 1.4]].map(([c, x, y]) => (
          <mesh key={c} geometry={BOX} position={[x, y, 0.44]} scale={[0.07, 0.07, 0.02]}>
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
        ))}
      </group>
      <group position={[-1.7, 0, -2.3]}>
        <mesh geometry={BOX} material={WAINSCOT} position-y={0.46} scale={[2.3, 0.92, 0.65]} />
        <mesh geometry={BOX} material={COUNTER} position-y={0.95} scale={[2.4, 0.06, 0.72]} />
        <mesh name="ufo-kitchen-cabinet" geometry={BOX} material={WAINSCOT} position={[0, 2.75, -0.1]} scale={[2.3, 0.75, 0.45]} />
        <mesh geometry={BOX} material={CEREAL} position={[-0.7, 1.15, 0]} scale={[0.22, 0.34, 0.08]} />
        <mesh material={MUG} position={[0.3, 1.05, 0.1]}>
          <cylinderGeometry args={[0.07, 0.06, 0.14, 12]} />
        </mesh>
      </group>
      <group name="ufo-kitchen-clock" position={[0.15, 2.85, -2.6]}>
        <mesh material={CLOCK_FACE} position-z={0.02}>
          <circleGeometry args={[0.28, 28]} />
        </mesh>
        <mesh material={DARK} position-z={0.02}>
          <torusGeometry args={[0.285, 0.02, 8, 28]} />
        </mesh>
        <group position-z={0.03} rotation-z={-0.1}>
          <mesh geometry={BOX} material={DARK} position-y={0.075} scale={[0.02, 0.15, 0.005]} />
        </group>
        <group position-z={0.03} rotation-z={-1.1}>
          <mesh geometry={BOX} material={DARK} position-y={0.11} scale={[0.02, 0.22, 0.005]} />
        </group>
        <group ref={seconds} position-z={0.035}>
          <mesh geometry={BOX} material={NEON_RED} position-y={0.1} scale={[0.008, 0.2, 0.004]} />
        </group>
        <mesh material={DARK} position-z={0.04}>
          <circleGeometry args={[0.02, 12]} />
        </mesh>
      </group>

      <mesh name="ufo-kitchen-table" geometry={BOX} material={WOOD} position-y={0.78} scale={[1.7, 0.08, 1.05]} castShadow />
      {[[-0.75, -0.42], [0.75, -0.42], [-0.75, 0.42], [0.75, 0.42]].map(([x, z], i) => (
        <mesh key={i} geometry={BOX} material={WOOD} position={[x, 0.37, z]} scale={[0.07, 0.74, 0.07]} />
      ))}
      <group name="ufo-toaster" ref={toaster} position={[0, 0.82, 0.05]}>
        <mesh geometry={BOX} material={CHROME} position-y={0.17} scale={[0.52, 0.32, 0.32]} castShadow />
        <mesh geometry={BOX} material={DARK} position-y={0.01} scale={[0.56, 0.04, 0.36]} />
        {[-0.07, 0.07].map((z) => (
          <mesh key={z} geometry={BOX} material={DARK} position={[0, 0.335, z]} scale={[0.4, 0.015, 0.06]} />
        ))}
        <mesh ref={coils} geometry={BOX} position-y={0.33} scale={[0.38, 0.004, 0.2]}>
          <meshBasicMaterial color="#ff6a1a" transparent opacity={0.3} toneMapped={false} />
        </mesh>
        <mesh ref={lever} geometry={BOX} material={DARK} position={[0.29, 0.1, 0]} scale={[0.07, 0.035, 0.08]} />
        <mesh material={DARK} position={[0.29, 0.22, 0.05]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.03, 0.03, 0.03, 12]} />
        </mesh>
      </group>
      <mesh name="ufo-toaster-cord" geometry={cord} material={DARK} />
      <group position={[0.9, 0.36, -2.59]}>
        <mesh geometry={BOX} material={FRIDGE} scale={[0.16, 0.22, 0.03]} />
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={BOX} material={DARK} position={[side * 0.035, 0.04, 0.018]} scale={[0.014, 0.045, 0.008]} />
        ))}
        <mesh geometry={BOX} material={DARK} position-z={0.045} scale={[0.08, 0.06, 0.07]} />
      </group>
      {[0, 1].map((i) => (
        <group key={i} name={`ufo-toast-${i}`} ref={(el) => (toast.current[i] = el)} position={[0, TOAST_Y, 0.05 + (i - 0.5) * 0.14]}>
          <mesh geometry={BOX} material={CRUST} scale={[0.32, 0.3, 0.045]} />
          <mesh geometry={BOX} material={CRUMB} scale={[0.27, 0.25, 0.05]} />
        </group>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => (beams.current[i] = el)} geometry={G.beam} material={NEON_RED} visible={false} />
      ))}
      <group name="ufo-kitchen-zorp" position={[-1.4, 0, -0.45]}>
        <Grey rig={zorp} scale={0.92} fedora coat gun />
      </group>
      <group name="ufo-kitchen-klarg" position={[1.4, 0, -0.45]}>
        <Grey rig={klarg} scale={1.08} fedora coat />
      </group>
    </group>
  );
}

// The saucer: a lazy S-curve down with the searchlight hunting, the tractor beam, a gulp, and a doppler exit
function Saucer({ stunt, board, clock, spot }) {
  const root = useRef();
  const rim = useRef();
  const beamGroup = useRef();
  const beamRings = useRef([]);
  const spotRing = useRef();
  const search = useRef();
  const searchLight = useRef();
  const glow = useRef();
  const beat = useBeats(stunt);
  const target = useMemo(() => new THREE.Object3D(), []);
  const lastMote = useRef(0);
  const lastSpark = useRef(0);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#4eff9b', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), []);
  const coneMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dfffe9', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), []);
  const spotMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5effa3', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => [beamMat, coneMat, spotMat].forEach((m) => m.dispose()), [beamMat, coneMat, spotMat]);
  const [sx, sz] = spot;
  const HATCH = UFO_HOVER_Y - 0.4;

  useFrame((_, dt) => {
    const t = clock() ?? Infinity;
    const on = ufoPhase(t) === 'board' && isOn(stunt, board, t) && t >= UFO.arrive - 0.1;
    root.current.visible = on;
    spotRing.current.visible = false;
    if (!on) return;
    const g = root.current;
    const enter = clamp01((t - UFO.arrive) / (UFO.lock - UFO.arrive));
    const leave = clamp01((t - UFO.leave) / (UFO.end - UFO.leave - 0.3));
    const dropIn = smooth(enter);
    const flyOut = leave ** 2.2;
    const gulp = -0.28 * Math.sin(Math.PI * clamp01((t - UFO.aboard) / 0.4));
    const spit = 0.18 * Math.sin(Math.PI * clamp01((t - UFO.eject + 0.1) / 0.3));
    const x = sx + (1 - dropIn) * -7.5 + flyOut * 11;
    const y = UFO_HOVER_Y + (1 - easeOut(enter)) * 12 + Math.sin(Math.PI * enter) * 0.7 + Math.sin(t * 2.3) * 0.06 + gulp + spit + flyOut * 17;
    const z = sz + (1 - dropIn) * 5 + Math.sin(t * 1.7) * 0.05 - flyOut * 9;
    g.position.set(x, y, z);
    g.rotation.set(Math.sin(t * 3) * 0.035 + (1 - dropIn) * 0.18, 0, (1 - dropIn) * -0.38 + Math.sin(t * 2.1) * 0.025 + flyOut * 0.7);
    rim.current.rotation.y += dt * (3.5 + flyOut * 14 + (t > UFO.beam && t < UFO.aboard ? 4 : 0));

    const hunting = t < UFO.beam;
    const settle = clamp01((t - UFO.lock + 0.7) / 0.9);
    search.current.visible = hunting && enter > 0.2;
    searchLight.current.intensity = hunting ? 70 * clamp01((enter - 0.2) / 0.3) : 0;
    if (hunting) {
      const wander = 1 - smooth(settle);
      target.position.set(sx + Math.sin(t * 1.9) * 3.2 * wander, 0, sz + Math.cos(t * 1.3) * 2.4 * wander);
      g.worldToLocal(_a.copy(target.position).applyMatrix4(g.parent.matrixWorld));
      _a.y += 0.36;
      const len = _a.length();
      search.current.quaternion.setFromUnitVectors(DOWN, _b.copy(_a).normalize());
      search.current.scale.set(1, len, 1);
    }

    const beaming = (t >= UFO.beam && t < UFO.aboard + 0.05) || (t >= UFO.eject - 0.1 && t < UFO.land + 0.1);
    const outbound = t >= UFO.eject - 0.1;
    beamGroup.current.visible = beaming;
    spotRing.current.visible = beaming;
    glow.current.intensity = beaming ? 26 + Math.sin(t * 18) * 6 : t >= UFO.lock ? 6 : 0;
    if (beaming) {
      beamMat.opacity = 0.2 + Math.sin(t * 16) * 0.05;
      spotMat.opacity = 0.35 + Math.sin(t * 16) * 0.12;
      beamGroup.current.scale.set(1, (y - 0.36) / HATCH, 1);
      beamRings.current.forEach((ring, i) => {
        if (!ring) return;
        const u = ((((t * 1.2 * (outbound ? -1 : 1) + i / 3) % 1) + 1) % 1);
        ring.position.y = -HATCH * (1 - u);
        const s = 1.05 - u * 0.65;
        ring.scale.set(s, s, 1);
      });
      if (!outbound && t - lastMote.current > 0.22) {
        lastMote.current = t;
        fx.emit('burst', { position: [sx, 0.15, sz], colors: ['#5effa3', '#c9ffe4', '#ffffff'], count: 5, speed: 0.35, up: 1.4, size: 0.045, life: 1.6, gravity: -0.02, spread: 2.2 });
      }
    }
    if (flyOut > 0 && t - lastSpark.current > 0.07) {
      lastSpark.current = t;
      fx.emit('burst', { position: [x, y - 0.3, z], colors: ['#5ce6ff', '#5effa3', '#ffffff'], count: 6, speed: 0.8, up: 0.2, size: 0.07, life: 0.9, gravity: 0.15 });
    }
    beat(t, 'land', UFO.land, () => {
      fx.emit('shake', { amount: 0.3 });
      fx.emit('burst', { position: [sx, 0.2, sz], colors: ['#a08a6a', '#d8c9a8', '#5effa3'], count: 28, speed: 2.6, up: 1.8, size: 0.08, life: 0.7, gravity: 0.8 });
    });
  });

  return (
    <>
      <group name="ufo-saucer-set" ref={root} visible={false}>
        <mesh material={SAUCER_BODY} castShadow>
          <cylinderGeometry args={[0.72, 1.6, 0.3, 32]} />
        </mesh>
        <mesh material={HULL} position-y={-0.22}>
          <cylinderGeometry args={[1.6, 0.62, 0.22, 32]} />
        </mesh>
        <mesh material={CHROME} position-y={-0.08} rotation-x={Math.PI / 2}>
          <torusGeometry args={[1.6, 0.08, 10, 40]} />
        </mesh>
        <mesh name="ufo-dome" material={GLASS} position-y={0.13} renderOrder={13}>
          <sphereGeometry args={[0.72, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        </mesh>
        {[-0.24, 0.24].map((px, i) => (
          <group key={i} position={[px, 0.2, 0.1]} scale={0.55} rotation-y={-px * 0.8}>
            <mesh geometry={G.cranium} material={PILOT_SKIN} position-y={0.2} scale={[1.1, 1.2, 1]} />
            {[-1, 1].map((side) => (
              <mesh key={side} geometry={G.eye} material={EYE} position={[side * 0.125, 0.2, 0.26]} rotation={[0, side * 0.3, -side * 0.2]} scale={[0.8, 0.85, 0.3]} />
            ))}
          </group>
        ))}
        <mesh material={CHROME} position-y={-0.34} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.46, 0.05, 8, 28]} />
        </mesh>
        <mesh material={NEON_GREEN} position-y={-0.345} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.44, 28]} />
        </mesh>
        <pointLight ref={glow} position-y={-0.6} intensity={0} distance={7} color="#5effa3" />
        <group ref={rim} position-y={-0.08}>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <mesh key={i} material={i % 2 ? NEON_GREEN : NEON_CYAN} position={[Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6]}>
                <sphereGeometry args={[0.09, 10, 8]} />
              </mesh>
            );
          })}
        </group>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2 + 0.5;
          return (
            <mesh key={i} material={HULL_LIGHT} position={[Math.cos(a) * 1.0, -0.4, Math.sin(a) * 1.0]}>
              <sphereGeometry args={[0.09, 8, 6]} />
            </mesh>
          );
        })}
        <group ref={search} position-y={-0.36} visible={false}>
          <mesh material={coneMat} position-y={-0.5} renderOrder={11}>
            <cylinderGeometry args={[0.12, 1.1, 1, 24, 1, true]} />
          </mesh>
        </group>
        <spotLight ref={searchLight} position-y={-0.36} angle={0.34} penumbra={0.55} intensity={0} distance={16} color="#e9fff3" target={target} />
        <group ref={beamGroup} position-y={-0.36} visible={false}>
          <mesh material={beamMat} position-y={-HATCH / 2} renderOrder={11}>
            <cylinderGeometry args={[0.38, 1.05, HATCH, 28, 1, true]} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} ref={(el) => (beamRings.current[i] = el)} material={NEON_GREEN} rotation-x={Math.PI / 2} renderOrder={12}>
              <torusGeometry args={[1, 0.028, 8, 28]} />
            </mesh>
          ))}
        </group>
      </group>
      <primitive object={target} />
      <mesh ref={spotRing} material={spotMat} position={[sx, 0.03, sz]} rotation-x={-Math.PI / 2} renderOrder={10} visible={false}>
        <ringGeometry args={[0.25, 1.05, 32]} />
      </mesh>
    </>
  );
}

export function UfoFx({ stunt, board, layout, skins, colors }) {
  const { camera } = useThree();
  const root = useRef();
  const held = useRef(false);
  const offBoard = useRef(false);
  const theta0 = useRef(null);
  const framing = useRef(null);
  const spot = useMemo(() => ufoSpot(stunt, layout), [stunt, layout]);
  const palette = colors || board.colors || SEAT_COLORS;
  const seatColor = palette[stunt.seat] || SEAT_COLORS[stunt.seat];
  const marbleMat = useMemo(() => marbleSkin(skins?.[stunt.seat], stunt.seat, seatColor).material, [skins, stunt.seat, seatColor]);
  const clock = () => (stunt.cut ? null : stuntClock(stunt));
  // A rematch or leaving the table mid-bit hands the camera back
  useEffect(
    () => () => {
      if (held.current) fx.emit('unfocus', { cut: offBoard.current });
    },
    []
  );

  useFrame(() => {
    const t = stuntClock(stunt);
    if (!isOn(stunt, board, t)) {
      if (held.current) {
        held.current = false;
        fx.emit('unfocus', { cut: offBoard.current });
      }
      return;
    }
    if (t < UFO.push) return;
    const shotKey = t < UFO.toLab ? 'board' : t < UFO.kitchen ? 'lab' : t < UFO.lab2 ? 'kitchen' : t < UFO.board2 ? 'lab2' : 'board2';
    const pan = ufoFlashbackPan(t);
    const key = `${shotKey}:${camera.aspect}:${pan}`;
    if (framing.current === key) return;
    const resized = framing.current?.startsWith(`${shotKey}:`);
    framing.current = key;
    const g = root.current;
    const thetaOf = (at) => {
      g.localToWorld(_a.set(at[0], 0, at[2]));
      g.localToWorld(_b.set(at[0], 0, at[2] + 1));
      return Math.atan2(_b.x - _a.x, _b.z - _a.z);
    };
    const shot = (at, y, halfW, halfH, phi, opts) => {
      g.localToWorld(_a.set(at[0], at[1] + y, at[2]));
      held.current = true;
      offBoard.current = at === LAB_AT || at === KITCHEN_AT;
      fx.emit('orbit', { at: [_a.x, 0, _a.z], y: _a.y, radius: frameDist(camera, halfW, halfH), phi, cinematic: true, ...opts });
    };
    const here = [spot[0], 0, spot[1]];
    if (t < UFO.toLab) {
      shot(here, 1.5, 3.9, 2.7, 1.1, { speed: 0.08, ease: !resized, cut: resized });
      return;
    }
    if (theta0.current === null) {
      g.localToWorld(_a.set(spot[0], 0, spot[1]));
      theta0.current = Math.atan2(camera.position.x - _a.x, camera.position.z - _a.z);
    }
    if (t < UFO.kitchen) shot(LAB_AT, 0.95 + pan, 3.4, 1.8, 1.4 + pan * 0.12, { speed: 0, cut: true, theta: thetaOf(LAB_AT) });
    else if (t < UFO.lab2) shot(KITCHEN_AT, 1.0, 3.7, 1.95, 1.37, { speed: 0.02, cut: true, theta: thetaOf(KITCHEN_AT) - 0.2 });
    else if (t < UFO.board2) shot(LAB_AT, 0.95, 3.4, 1.8, 1.4, { speed: 0, cut: true, theta: thetaOf(LAB_AT) });
    else shot(here, 1.4, 3.6, 2.6, 1.12, { speed: 0.1, cut: true, theta: theta0.current ?? thetaOf(here) });
  });

  return (
    <group ref={root}>
      <UfoWarmer root={root} />
      <UfoTransition clock={clock} />
      <Saucer stunt={stunt} board={board} clock={clock} spot={spot} />
      <LabSet stunt={stunt} board={board} clock={clock} marbleMat={marbleMat} />
      <KitchenSet stunt={stunt} board={board} clock={clock} />
    </group>
  );
}

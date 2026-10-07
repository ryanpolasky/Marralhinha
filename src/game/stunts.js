import * as THREE from 'three';
import shared from '../shared/stunts';
import { positionIn } from './geometry';
import { clamp01, hitClock, samePos, sinceClock } from './hits';

export const { FLASH, ROCKY_JUMPS, rockyTiming, stuntSeconds } = shared;
export const stuntClock = hitClock;
export const stuntLive = (s, now) => !!s && !s.cut && stuntClock(s, now) < stuntSeconds(s);
export const liveStunt = (stunts) => (stunts || []).find((s) => stuntLive(s)) || null;
// The game moving the marble for real ends its part in the bit
export const starOf = (stunt, board) => !!stunt && samePos(stunt.at, board.marbles[stunt.seat]?.[stunt.marble]);

const REST_Y = 0.07;
// Marble center when it's up on its legs (hip drop plus leg length)
export const LEG_Y = 0.7;
const STRIDE = 0.8;
const JUMP_S = 1.15;
const easeOut = (t) => 1 - (1 - t) ** 3;
const backOut = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const xz = ([r, c]) => new THREE.Vector3(c, 0, r);

const geos = new Map();
export function rockyGeo(stunt, layout) {
  if (!geos.has(stunt.id)) {
    const at = (cell) => xz(positionIn(stunt.seat, cell, stunt.marble, layout));
    const curve = new THREE.CatmullRomCurve3([at(stunt.at), ...stunt.path.map(at)], false, 'centripetal');
    curve.arcLengthDivisions = (stunt.path.length + 1) * 10;
    geos.set(stunt.id, { curve, length: curve.getLength(), timing: rockyTiming(stunt.path.length) });
  }
  return geos.get(stunt.id);
}

// Eases in off the line and coasts into the home row, flat out in between
const ACCEL = 0.08;
const runAlong = (u) => {
  const v = 1 / (1 - ACCEL);
  if (u < ACCEL) return (0.5 * v * u * u) / ACCEL;
  if (u > 1 - ACCEL) return 1 - (0.5 * v * (1 - u) ** 2) / ACCEL;
  return v * (u - ACCEL / 2);
};
const runBack = (f) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (runAlong(mid) < f) lo = mid;
    else hi = mid;
  }
  return lo;
};

export const cutClock = (stunt, now) => (stunt.cut ? sinceClock(`${stunt.id}:cut`, stunt.cutAge, now) : null);
const SHRINK_S = 0.6;
export const CUT_HOLD = SHRINK_S + 0.4;

// Rounds of jumps with an arms-up breather between them, forever; null during the breather
const CYCLE = shared.ROCKY_CELEBRATE;
export function celebrateJump(timing, t) {
  const c = t - timing.celebrate;
  if (c < 0) return null;
  const k = (c % CYCLE) / JUMP_S;
  return k < ROCKY_JUMPS ? { n: Math.floor(c / CYCLE) * ROCKY_JUMPS + Math.floor(k), phase: k % 1 } : null;
}

// Where the Rocky marble is at t, in board space, with its limbs; once cut it shrinks its limbs where it stands, then null sends it home
export function rockyPose(stunt, layout, t) {
  if (t < 0) return null;
  const cut = cutClock(stunt);
  if (cut === null) return livePose(stunt, layout, t);
  if (cut >= SHRINK_S) return null;
  const pose = livePose(stunt, layout, t - cut);
  const left = 1 - cut / SHRINK_S;
  pose.legs *= left;
  pose.y = REST_Y + (pose.y - REST_Y) * left;
  return pose;
}

function livePose(stunt, layout, t) {
  const { curve, length, timing } = rockyGeo(stunt, layout);
  const pose = { pos: new THREE.Vector3(), dir: new THREE.Vector3(), y: LEG_Y, spin: 0, shot: 'face', legs: 1, stride: 0, arms: 'run', clock: t };
  if (t < timing.intro) {
    curve.getPointAt(0, pose.pos);
    curve.getTangentAt(0, pose.dir);
    // Sprouts legs, pops up out of the hole, then bounces on its toes throwing jabs
    const grow = clamp01((t - 0.4) / 0.7);
    pose.legs = Math.max(0, backOut(grow));
    pose.y = REST_Y + (LEG_Y - REST_Y) * easeOut(grow) + Math.abs(Math.sin(t * 9)) * 0.06 * grow;
    pose.arms = t > 1.4 ? 'jab' : 'run';
    const sway = Math.sin(t * 4.5) * 0.06 * grow;
    pose.pos.x += pose.dir.z * sway;
    pose.pos.z -= pose.dir.x * sway;
    pose.shot = t < timing.intro - 3 ? (t < timing.intro * 0.4 ? 'face' : 'side') : 'chase';
    return pose;
  }
  if (t < timing.celebrate) {
    const u = (t - timing.intro) / timing.run;
    const f = clamp01(runAlong(u));
    curve.getPointAt(f, pose.pos);
    curve.getTangentAt(f, pose.dir);
    pose.stride = ((f * length) / STRIDE) * Math.PI;
    pose.y = LEG_Y + Math.abs(Math.sin(pose.stride)) * 0.07;
    pose.shot = u < 0.38 ? 'chase' : u < 0.72 ? 'side' : 'lead';
    return pose;
  }
  curve.getPointAt(1, pose.pos);
  curve.getTangentAt(1, pose.dir);
  pose.shot = 'steps';
  pose.arms = 'up';
  const jump = celebrateJump(timing, t);
  const rounds = Math.floor((t - timing.celebrate) / CYCLE);
  if (jump) {
    pose.y = LEG_Y + Math.sin(Math.PI * jump.phase) * 1.3;
    pose.spin = (jump.n + easeOut(jump.phase)) * Math.PI * 2;
  } else {
    pose.spin = (rounds + 1) * ROCKY_JUMPS * Math.PI * 2;
    pose.y = LEG_Y + Math.abs(Math.sin(t * 6)) * 0.08;
  }
  return pose;
}

// Every marble sitting on the route gets blasted off the board as the runner reaches it, then drops back in near the end
const knockLists = new Map();
export function rockyKnocks(stunt, layout, marbles) {
  if (!knockLists.has(stunt.id)) {
    const { curve, length, timing } = rockyGeo(stunt, layout);
    const n = Math.ceil(length * 12);
    const pts = curve.getSpacedPoints(n);
    const list = [];
    marbles.forEach((row, seat) =>
      row.forEach((pos, marble) => {
        if ((seat === stunt.seat && marble === stunt.marble) || pos.zone === 'base') return;
        const [r, c] = positionIn(seat, pos, marble, layout);
        let best = null;
        pts.forEach((p, j) => {
          const d = Math.hypot(p.x - c, p.z - r);
          if (j > 6 && (!best || d < best.d)) best = { d, j };
        });
        if (!best || best.d > 0.4) return;
        const f = best.j / n;
        const tan = curve.getTangentAt(f);
        const side = (seat * 5 + marble) % 2 ? 1 : -1;
        const dx = tan.z * side + tan.x * 0.5;
        const dz = -tan.x * side + tan.z * 0.5;
        const len = Math.hypot(dx, dz);
        list.push({ seat, marble, from: pos, at: [c, r], dir: [dx / len, dz / len], t: timing.intro + timing.run * runBack(f) - 0.04 });
      })
    );
    list.sort((a, b) => a.t - b.t).forEach((k, i) => (k.back = timing.settle - 0.9 + i * 0.12));
    knockLists.set(stunt.id, list);
  }
  return knockLists.get(stunt.id);
}

export const KNOCK_FLY = 0.9;
export const KNOCK_DROP = 0.45;
// Off flying, gone, then falling back into its hole with a little bounce
export function knockOffset(knock, t) {
  const k = (t - knock.t) / KNOCK_FLY;
  if (k < 0 || t >= knock.back + KNOCK_DROP + 0.2) return null;
  if (k < 1) return { x: knock.dir[0] * 7 * k, y: 7 * k - 3 * k * k, z: knock.dir[1] * 7 * k, visible: true, tumble: true };
  if (t < knock.back) return { x: 0, y: 0, z: 0, visible: false };
  const r = (t - knock.back) / KNOCK_DROP;
  const y = r < 1 ? 6 * (1 - r * r) : Math.sin(Math.PI * clamp01((t - knock.back - KNOCK_DROP) / 0.2)) * 0.22;
  return { x: 0, y, z: 0, visible: true };
}

// Where the can goes: a few steps toward the middle of the board
const flashes = new Map();
export function flashGeo(stunt, layout) {
  if (!flashes.has(stunt.id)) {
    const [r, c] = positionIn(stunt.seat, stunt.at, stunt.marble, layout);
    const d = Math.hypot(r, c);
    const dir = d > 0.5 ? [-c / d, -r / d] : [1, 0];
    const reach = d > 0.5 ? Math.min(3.5, d * 0.55) : 2.5;
    flashes.set(stunt.id, { from: [c, r], to: [c + dir[0] * reach, r + dir[1] * reach], dir });
  }
  return flashes.get(stunt.id);
}

// The thrower hops as it lets go; after the bang every marble on the table wobbles, dazed
export function flashSway(t, star, seed) {
  const hop = star ? Math.sin(Math.PI * clamp01((t - (FLASH.toss - 0.15)) / 0.4)) * 0.45 : 0;
  const daze = t > FLASH.bang ? 0.07 * Math.max(0, 1 - (t - FLASH.bang) / 4) : 0;
  return { y: hop, x: Math.sin(t * 7 + seed) * daze, z: Math.cos(t * 5.3 + seed * 1.7) * daze };
}

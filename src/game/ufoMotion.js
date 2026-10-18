import { UFO } from './stunts';
import { clamp01 } from './hits';

const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const TOAST_Y = 1.04;

export function ufoToastPose(slice, t) {
  const z = 0.05 + (slice - 0.5) * 0.14;
  const d = Math.max(0, t - UFO.ding);
  const velocity = slice ? 5 : 4.6;
  const floor = slice ? 0.025 : 0.845;
  const landAt = (velocity + Math.sqrt(velocity ** 2 + 18 * (TOAST_Y - floor))) / 9;
  const travel = clamp01((d - 0.12) / (landAt - 0.12));
  const landed = d >= landAt;
  const spin = smooth(clamp01((d - 0.12) / 0.3));
  return {
    position: [
      mix(0, slice ? -1.25 : 0.6, travel),
      landed ? floor : TOAST_Y + velocity * d - 4.5 * d * d,
      mix(z, slice ? 1 : 0.25, travel),
    ],
    rotation: [Math.PI / 2 * spin, 0, 0],
  };
}

export function ufoButtonPose(t) {
  const walk = smooth(clamp01((t - UFO.button + 1.4) / 0.35));
  const lift = smooth(clamp01((t - UFO.button + 1) / 0.3));
  const reach = smooth(clamp01((t - UFO.button + 0.7) / 0.35));
  const touch = smooth(clamp01((t - UFO.button + 0.35) / 0.35));
  const press = Math.sin(Math.PI * clamp01((t - UFO.button) / 0.5));
  return {
    walk,
    press,
    hand: [1.65, mix(0.56, 1.34, lift) - 0.132 * touch - 0.05 * press, mix(0.15, 0.45, reach)],
    actor: [mix(1.1, 1.45, walk), 0, mix(-0.35, 0, walk)],
  };
}

export function ufoTransition(t, reduced = false) {
  const cut = [UFO.toLab, UFO.kitchen, UFO.lab2].find((at) => t >= at - 1 && t < at + 0.8);
  if (cut === undefined) return null;
  return {
    cut,
    blend: smooth(clamp01((t - cut) / 0.8)),
    ripple: reduced || cut === UFO.toLab ? 0 : Math.sin(Math.PI * clamp01((t - cut + 1) / 1.8)) * 0.014,
  };
}

export function ufoFlashbackPan(t) {
  if (t < UFO.freeze || t >= UFO.kitchen) return 0;
  return smooth(clamp01((t - UFO.freeze) / (UFO.kitchen - UFO.freeze)));
}

export function ufoGunMotion(t) {
  const recoil = Math.max(0, ...[0, 0.17, 0.34].map((offset) => {
    const d = t - UFO.pew - offset;
    return d >= 0 && d < 0.14 ? Math.sin(Math.PI * d / 0.14) : 0;
  }));
  return {
    recoil,
    hand: [0.35 + Math.sin(t * 33) * 0.012, 1.1 + Math.sin(t * 27) * 0.009 + recoil * 0.025, 0.65 - recoil * 0.07],
    aim: [Math.sin(t * 31) * 0.018 - recoil * 0.045, Math.sin(t * 23) * 0.025],
  };
}

export function ufoFloorRoll(t) {
  const d = Math.max(0, t - UFO.ding - 0.65);
  const roll = Math.sin(d * 5) * 0.28 * smooth(clamp01(d / 0.4));
  return { roll, x: roll * 0.24, y: Math.abs(roll) * 0.06 };
}

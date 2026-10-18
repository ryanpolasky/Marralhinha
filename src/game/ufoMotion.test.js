import * as THREE from 'three';
import { UFO } from './stunts';
import { ufoButtonPose, ufoFlashbackPan, ufoFloorRoll, ufoGunMotion, ufoToastPose, ufoTransition } from './ufoMotion';

test('toast rises out of the slots before rotating or travelling sideways', () => {
  for (let i = 0; i < 2; i++) {
    const start = ufoToastPose(i, UFO.ding);
    const clear = ufoToastPose(i, UFO.ding + 0.12);
    expect(start.rotation).toEqual([0, 0, 0]);
    expect(clear.position[0]).toBeCloseTo(0);
    expect(clear.position[1] - 0.15).toBeGreaterThan(1.15);
  }
});

test('both toast trajectories stay out of the toaster after clearing it', () => {
  const toaster = new THREE.Box3(new THREE.Vector3(-0.28, 0.82, -0.11), new THREE.Vector3(0.28, 1.16, 0.21));
  const geometry = new THREE.BoxGeometry(0.32, 0.3, 0.05);
  const mesh = new THREE.Mesh(geometry);
  for (let i = 0; i < 2; i++) {
    for (let d = 0.12; d < 3; d += 0.01) {
      const pose = ufoToastPose(i, UFO.ding + d);
      mesh.position.fromArray(pose.position);
      mesh.rotation.fromArray(pose.rotation);
      mesh.updateMatrixWorld();
      expect(new THREE.Box3().setFromObject(mesh).intersectsBox(toaster)).toBe(false);
    }
  }
  geometry.dispose();
});

test('one slice lands flat clear of the toaster and the other reaches the floor', () => {
  const table = ufoToastPose(0, UFO.ding + 5);
  const floor = ufoToastPose(1, UFO.ding + 5);
  expect(table.position).toEqual([0.6, 0.845, 0.25]);
  expect(floor.position).toEqual([-1.25, 0.025, 1]);
  expect(table.rotation[0]).toBeCloseTo(Math.PI / 2);
  expect(floor.rotation[0]).toBeCloseTo(Math.PI / 2);
});

test('the hand approaches above the button and follows its top without penetrating it', () => {
  for (let d = -0.7; d < 0.8; d += 0.005) {
    const pose = ufoButtonPose(UFO.button + d);
    const palmBottom = pose.hand[1] - 0.065 * 1.15 * 1.08;
    const buttonTop = 1.12 - pose.press * 0.05;
    expect(palmBottom).toBeGreaterThan(buttonTop);
    if (d >= 0) expect(palmBottom - buttonTop).toBeLessThan(0.01);
  }
  expect(ufoButtonPose(UFO.button - 1).actor).toEqual([1.45, 0, 0]);
});

test.each([UFO.toLab, UFO.kitchen, UFO.lab2])('scene %s dissolves real outgoing and incoming frames without a white interval', (cut) => {
  expect(ufoTransition(cut - 0.9).blend).toBe(0);
  expect(ufoTransition(cut).blend).toBe(0);
  expect(ufoTransition(cut + 0.4).blend).toBeCloseTo(0.5);
  expect(ufoTransition(cut + 0.79).blend).toBeGreaterThan(0.99);
  expect(ufoTransition(cut + 0.81)).toBeNull();
  expect(ufoTransition(cut + 0.4, true).ripple).toBe(0);
  expect(ufoTransition(cut).ripple > 0).toBe(cut !== UFO.toLab);
});

test('the upward pan follows the look-up beat and leaves the ordinary ship shots fixed', () => {
  expect(ufoFlashbackPan(UFO.specimen)).toBe(0);
  expect(ufoFlashbackPan(UFO.freeze)).toBe(0);
  let previous = 0;
  for (let t = UFO.freeze; t < UFO.kitchen; t += 0.01) {
    const pan = ufoFlashbackPan(t);
    expect(pan).toBeGreaterThanOrEqual(previous);
    expect(pan).toBeLessThanOrEqual(1);
    previous = pan;
  }
  expect(ufoFlashbackPan(UFO.kitchen - 0.01)).toBeGreaterThan(0.99);
  expect(ufoFlashbackPan(UFO.lab2)).toBe(0);
});

test('every toaster shot kicks the hand back and the aim up, then settles', () => {
  [0, 0.17, 0.34].forEach((offset) => {
    const shot = ufoGunMotion(UFO.pew + offset + 0.07);
    expect(shot.recoil).toBeCloseTo(1);
    expect(shot.hand[2]).toBeCloseTo(0.58);
    expect(shot.aim[0]).toBeLessThan(-0.02);
  });
  expect(ufoGunMotion(UFO.pew - 0.01).recoil).toBe(0);
  expect(ufoGunMotion(UFO.pew + 0.6).recoil).toBe(0);
  const first = ufoGunMotion(UFO.pew + 0.6);
  const next = ufoGunMotion(UFO.pew + 0.7);
  expect(first.hand).not.toEqual(next.hand);
  expect(first.aim).not.toEqual(next.aim);
});

test('Klarg starts rocking only once he is down, and rolls in both directions', () => {
  const start = UFO.ding + 0.65;
  expect(ufoFloorRoll(UFO.ding)).toEqual({ roll: 0, x: 0, y: 0 });
  expect(ufoFloorRoll(start)).toEqual({ roll: 0, x: 0, y: 0 });
  const right = ufoFloorRoll(start + 0.4);
  const left = ufoFloorRoll(start + 0.9);
  expect(right.roll).toBeGreaterThan(0.2);
  expect(left.roll).toBeLessThan(-0.2);
  [right, left].forEach((pose) => {
    expect(Math.abs(pose.x)).toBeLessThan(0.07);
    expect(pose.y).toBeGreaterThanOrEqual(0);
  });
});

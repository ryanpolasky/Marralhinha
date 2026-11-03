import * as THREE from 'three';
import { nearestTarget } from './touchPick';

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 100);
camera.position.set(0, 20, 0.001);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const rect = { left: 0, top: 0, width: 400, height: 400 };
const at = (x, z, name) => {
  const o = new THREE.Object3D();
  o.position.set(x, 0, z);
  o.updateMatrixWorld();
  return { ref: { current: o }, name };
};

test('snaps a near miss to the closest target', () => {
  const list = [at(0, 0, 'a'), at(1, 0, 'b')];
  const step = 200 / (20 * Math.tan(THREE.MathUtils.degToRad(19)));
  expect(nearestTarget(list, camera, rect, 200 + step * 0.7, 200)?.name).toBe('b');
  expect(nearestTarget(list, camera, rect, 200 + step * 0.3, 200)?.name).toBe('a');
});

test('ignores taps outside the snap radius', () => {
  expect(nearestTarget([at(0, 0, 'a')], camera, rect, 300, 300)).toBeNull();
});

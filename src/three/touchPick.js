import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

export const SNAP_PX = 36;
const CLAIM_MS = 450;

const targets = new Set();
const state = { camera: null, pointerType: 'mouse', claimedAt: -Infinity };
const _v = new THREE.Vector3();

if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => (state.pointerType = e.pointerType), true);

// Touch taps go through the snap picker instead of the tiny raycast hit spheres
export const touchActive = () => state.pointerType === 'touch';
export const touchClaimed = () => performance.now() - state.claimedAt < CLAIM_MS;

export function useTouchTarget(ref, onTap) {
  const tap = useRef(onTap);
  tap.current = onTap;
  const on = !!onTap;
  useEffect(() => {
    if (!on) return undefined;
    const t = { ref, tap: () => tap.current?.() };
    targets.add(t);
    return () => targets.delete(t);
  }, [ref, on]);
}

export function nearestTarget(list, camera, rect, x, y, radius = SNAP_PX) {
  let best = null;
  let bestD = radius;
  for (const t of list) {
    const obj = t.ref.current;
    if (!obj) continue;
    obj.getWorldPosition(_v).project(camera);
    if (_v.z > 1) continue;
    const d = Math.hypot(rect.left + ((_v.x + 1) / 2) * rect.width - x, rect.top + ((1 - _v.y) / 2) * rect.height - y);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

export function pickAt(rect, x, y) {
  if (!state.camera) return false;
  const hit = nearestTarget(targets, state.camera, rect, x, y);
  if (!hit) return false;
  state.claimedAt = performance.now();
  hit.tap();
  return true;
}

export function TouchPicker() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    state.camera = camera;
    return () => {
      if (state.camera === camera) state.camera = null;
    };
  }, [camera]);
  return null;
}

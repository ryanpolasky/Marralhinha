import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { diceSkin } from './skins';
import { idle } from './Board';
import { warmBoardSkin } from '../game/skinWarm';

const DEBOUNCE_MS = 750;
const PROBE_GEO = new THREE.PlaneGeometry(1, 1);
const WARMED_SLOTS = ['board', 'dice'];

export const loadoutKeys = (cosmetics) => [...new Set(cosmetics.flatMap((c) => WARMED_SLOTS.filter((slot) => c?.[slot]).map((slot) => `${slot}:${c[slot]}`)))];

// Marbles already render in the lobby and fx/trails share pooled layers, so only the starter's board and other seats' dice can surprise us
export default function LoadoutWarmer({ cosmetics, enabled = true }) {
  const { gl, camera, scene } = useThree();
  const warmed = useRef(new Set());
  const key = enabled ? loadoutKeys(cosmetics).join('|') : '';

  useEffect(() => {
    const queue = key ? key.split('|').filter((k) => !warmed.current.has(k)) : [];
    if (!queue.length) return undefined;
    let alive = true;
    const warmDice = (id) => {
      const mats = diceSkin(id);
      const scratch = new THREE.Scene();
      mats.forEach((m) => {
        const probe = new THREE.Mesh(PROBE_GEO, m);
        probe.castShadow = true;
        scratch.add(probe);
      });
      gl.compile(scratch, camera, scene);
      mats.forEach((m) => Object.values(m).forEach((v) => v?.isTexture && gl.initTexture(v)));
    };
    const step = () => {
      if (!alive || !queue.length) return;
      const k = queue.shift();
      const at = k.indexOf(':');
      const slot = k.slice(0, at);
      const id = k.slice(at + 1);
      warmed.current.add(k);
      try {
        if (slot === 'board') warmBoardSkin(id);
        else warmDice(id);
      } catch {
        warmed.current.delete(k);
      }
      idle(step);
    };
    const t = setTimeout(() => idle(step), DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key, gl, camera, scene]);

  return null;
}

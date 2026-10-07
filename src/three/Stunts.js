import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';
import { Bubble } from './Hits';
import { SEAT_COLORS } from '../game/geometry';
import { clamp01 } from '../game/hits';
import { sfx } from '../game/sound';
import { FLASH, KNOCK_DROP, KNOCK_FLY, celebrateJump, flashGeo, rockyGeo, rockyKnocks, rockyPose, starOf, stuntClock, stuntSeconds } from '../game/stunts';

const CAN_GEO = new THREE.CylinderGeometry(0.075, 0.075, 0.2, 14);
const CAP_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12);
const SPOON_GEO = new THREE.BoxGeometry(0.03, 0.17, 0.05);
const RING_GEO = new THREE.TorusGeometry(0.035, 0.008, 6, 14);
const BLAST_GEO = new THREE.SphereGeometry(1, 20, 14);
const CAN = new THREE.MeshStandardMaterial({ color: '#46523f', roughness: 0.55, metalness: 0.3 });
const STEEL = new THREE.MeshStandardMaterial({ color: '#b9bcc0', roughness: 0.3, metalness: 0.9 });
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

// Beats that already went by when this client showed up are skipped, except the ones in `always`
function useBeats(stunt, always = []) {
  const fired = useRef(null);
  return (t, key, at, fn) => {
    if (!fired.current) fired.current = new Set();
    if (stunt.cut || t < at || fired.current.has(key)) return;
    fired.current.add(key);
    if (always.includes(key) || t - at < 0.5) fn();
  };
}

function FlashFx({ stunt, layout }) {
  const can = useRef();
  const blast = useRef();
  const beat = useBeats(stunt);
  const { from, to, dir } = flashGeo(stunt, layout);
  const roll = [to[0] + dir[0] * 0.75, to[1] + dir[1] * 0.75];
  const blastMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false, depthWrite: false }), []);
  useEffect(() => () => blastMat.dispose(), [blastMat]);

  useFrame(() => {
    const t = stuntClock(stunt);
    const gone = stunt.cut || t >= FLASH.bang;
    const c = can.current;
    c.visible = !gone && t > FLASH.pin - 0.2;
    if (c.visible) {
      if (t < FLASH.toss) c.position.set(from[0] + dir[0] * 0.35, 0.55, from[1] + dir[1] * 0.35);
      else if (t < FLASH.land) {
        const k = (t - FLASH.toss) / (FLASH.land - FLASH.toss);
        c.position.set(from[0] + (to[0] - from[0]) * k, 0.55 + (0.1 - 0.55) * k + Math.sin(Math.PI * k) * 2.6, from[1] + (to[1] - from[1]) * k);
        c.rotation.set(k * 9, 0, k * 5);
      } else {
        const k = clamp01((t - FLASH.land) / (FLASH.bounce - FLASH.land));
        const r = clamp01((t - FLASH.land) / (FLASH.bang - FLASH.land));
        const ease = 1 - (1 - r) ** 2;
        c.position.set(to[0] + (roll[0] - to[0]) * ease, 0.1 + Math.sin(Math.PI * k) * 0.35 + (t > FLASH.bounce ? Math.sin(Math.PI * clamp01((t - FLASH.bounce) / 0.2)) * 0.08 : 0), to[1] + (roll[1] - to[1]) * ease);
        c.rotation.set(Math.PI / 2, Math.atan2(-dir[1], dir[0]), ease * 12);
      }
    }
    const rt = t - FLASH.bang;
    const b = blast.current;
    b.visible = !stunt.cut && rt >= 0 && rt < 0.45;
    if (b.visible) {
      b.scale.setScalar(0.3 + 7 * (1 - (1 - rt / 0.45) ** 3));
      blastMat.opacity = 1 - rt / 0.45;
    }
    beat(t, 'bang', FLASH.bang, () => {
      fx.emit('shake', { amount: 0.5 });
      fx.emit('burst', { position: [roll[0], 0.3, roll[1]], colors: ['#ffffff', '#fffbe6', '#e8f4ff'], count: 50, speed: 7, up: 2, size: 0.08, life: 0.5, gravity: 0.2, spread: 1.2 });
      fx.emit('burst', { position: [roll[0], 0.4, roll[1]], colors: ['#9a9a9a', '#c4c4c4', '#6f6f6f'], count: 26, speed: 1.2, up: 1.4, size: 0.16, life: 2.4, gravity: -0.06 });
    });
  });

  const clock = () => (stunt.cut ? null : stuntClock(stunt));
  return (
    <group>
      <Bubble clock={clock} text="Flash out!" color={SEAT_COLORS[stunt.seat].main} at={[from[0], 0.6, from[1]]} from={FLASH.pin} until={FLASH.land + 0.3} />
      <group ref={can} visible={false}>
        <mesh geometry={CAN_GEO} material={CAN} castShadow />
        <mesh geometry={CAP_GEO} material={STEEL} position-y={0.12} />
        <mesh geometry={SPOON_GEO} material={STEEL} position={[0.085, 0.04, 0]} rotation-z={0.12} />
        <mesh geometry={RING_GEO} material={STEEL} position={[-0.05, 0.15, 0]} rotation-y={Math.PI / 2} />
      </group>
      <mesh ref={blast} geometry={BLAST_GEO} material={blastMat} position={[roll[0], 0.3, roll[1]]} renderOrder={15} visible={false} />
    </group>
  );
}

function RockyFx({ stunt, board, layout }) {
  const root = useRef();
  const track = useRef({ pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), shot: 'face' });
  const held = useRef(false);
  const beat = useBeats(stunt, ['follow', 'orbit']);
  const { timing } = rockyGeo(stunt, layout);
  const colors = [SEAT_COLORS[stunt.seat].main, SEAT_COLORS[stunt.seat].light, '#ffd166', '#ffffff'];
  // A rematch, the game moving the marble or leaving the table mid-run hands the camera back
  useEffect(
    () => () => {
      if (held.current) fx.emit('unfocus');
    },
    []
  );

  useFrame(() => {
    const t = stuntClock(stunt);
    const on = starOf(stunt, board) && !stunt.cut;
    if (on) {
      rockyKnocks(stunt, layout, board.marbles).forEach((k, i) => {
        const [x, z] = k.at;
        beat(t, `knock${i}`, k.t, () => {
          sfx.boom();
          sfx.capture('other');
          fx.emit('shake', { amount: 0.3 });
          fx.emit('burst', { position: [x, 0.4, z], colors: ['#ff8a3d', '#ffd166', '#fff3b0', '#e03a3e'], count: 46, speed: 4.5, up: 2.4, size: 0.1, life: 0.7, gravity: 0.6 });
          fx.emit('burst', { position: [x, 0.5, z], colors: ['#6f6f6f', '#9a9a9a', '#3d3d3d'], count: 18, speed: 1, up: 1.2, size: 0.18, life: 1.8, gravity: -0.05 });
        });
        beat(t, `gone${i}`, k.t + KNOCK_FLY, () => {
          sfx.twinkle();
          fx.emit('burst', { position: [x + k.dir[0] * 7, 4, z + k.dir[1] * 7], colors: ['#ffffff', '#fff3b0'], count: 14, speed: 1.6, up: 0.4, size: 0.08, life: 0.5, gravity: 0 });
        });
        beat(t, `back${i}`, k.back + KNOCK_DROP, sfx.land);
      });
      beat(t, 'sprout', 0.45, sfx.pop);
    }
    if (!on) {
      if (held.current) {
        held.current = false;
        fx.emit('unfocus');
      }
      return;
    }
    const pose = rockyPose(stunt, layout, t);
    const tr = track.current;
    root.current.localToWorld(tr.pos.set(pose.pos.x, 0, pose.pos.z));
    root.current.localToWorld(_d.copy(pose.pos).setY(0).add(pose.dir));
    tr.dir.copy(_d).sub(tr.pos).setY(0).normalize();
    tr.shot = pose.shot;
    if (t < timing.celebrate)
      beat(t, 'follow', 0, () => {
        held.current = true;
        fx.emit('follow', { track: tr });
      });
    beat(t, 'orbit', timing.celebrate, () => {
      held.current = true;
      // Wide and aimed up at the jumps, so the whole leap and the raised arms stay in frame
      fx.emit('orbit', { at: tr.pos.toArray(), y: 1.3, radius: 8, phi: 1.08, speed: 0.9 });
    });
    const jump = celebrateJump(timing, t);
    if (jump && jump.phase >= 0.5)
      beat(t, `jump${jump.n}`, t, () => {
        root.current.worldToLocal(_v.copy(tr.pos));
        fx.emit('burst', { position: [_v.x, 2.4, _v.z], colors, count: 70, speed: 4.5, up: 3, size: 0.09, gravity: 0.5, life: 1.8 });
      });
  });

  return <group ref={root} />;
}

export default function Stunts({ stunts, board, layout }) {
  return (stunts || [])
    .filter((s) => stuntClock(s) < stuntSeconds(s) + 2)
    .map((s) => (s.kind === 'flash' ? <FlashFx key={s.id} stunt={s} layout={layout} /> : <RockyFx key={s.id} stunt={s} board={board} layout={layout} />));
}

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEAT_COLORS, positionIn, layoutFor } from '../game/geometry';
import { movesForMarble } from '../game/moves';
import { sfx } from '../game/sound';
import { marbleSkin } from './skins';
import { fx } from './fx';
import { playKillFx } from './killfx';
import { playTrail } from './trails';
import { makeLabelTexture } from './textures';
import { clamp01, downAmount, hitGeo, samePos } from '../game/hits';

export const MARBLE_R = 0.335;
const REST_Y = 0.07;
const STACKED_Y = REST_Y + MARBLE_R * 1.95;

// One copy of each buffer on the GPU instead of one per marble, ghost and halo
export const MARBLE_GEO = new THREE.SphereGeometry(MARBLE_R, 40, 24);
const HIT_GEO = new THREE.SphereGeometry(0.5, 12, 8);
const HALO_GEO = new THREE.RingGeometry(0.4, 0.5, 40);
const GHOST_GEO = new THREE.SphereGeometry(MARBLE_R, 24, 16);
const GHOST_RING_GEO = new THREE.RingGeometry(0.42, 0.56, 40);
const CAPTURE_RING_GEO = new THREE.RingGeometry(0.6, 0.68, 40);
const PATH_DOT_GEO = new THREE.SphereGeometry(0.07, 10, 8);

const FLING_HEIGHT = 3.2;
// A dark skin just over a downed marble, so its cosmetic still shows through, only dimmed
const SHADE_GEO = new THREE.SphereGeometry(MARBLE_R * 1.015, 32, 20);

const CLASSIC_LAYOUT = layoutFor('classic');
export const worldOf = (seat, pos, marble, layout = CLASSIC_LAYOUT) => {
  const [r, c] = positionIn(seat, pos, marble, layout);
  return new THREE.Vector3(c, REST_Y, r);
};

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function hopTiming(dist) {
  if (dist < 1.6) return { dur: 0.19, height: 0.45 };
  return { dur: 0.3 + dist * 0.05, height: 0.5 + dist * 0.22 };
}

export function planMove(lastMove, board, layout = CLASSIC_LAYOUT) {
  const plans = {};
  if (!lastMove) return plans;
  const { seat, marble, capture } = lastMove;
  const others = board.active.flatMap((s) => board.marbles[s].flatMap((pos, m) => (pos.zone === 'base' || (s === seat && m === marble) ? [] : [worldOf(s, pos, m, layout)])));
  const occupied = (spot) => others.some((o) => Math.abs(o.x - spot.x) < 0.05 && Math.abs(o.z - spot.z) < 0.05);
  const path = lastMove.path || [lastMove.to];
  let prev = worldOf(seat, lastMove.from, marble, layout);
  let total = 0;
  const hops = path.map((cell, i) => {
    const to = worldOf(seat, cell, marble, layout);
    const timing = hopTiming(prev.distanceTo(to));
    prev = to;
    const tap = i < path.length - 1 && occupied(to);
    if (tap) {
      to.y = STACKED_Y;
      timing.dur += 0.04;
    }
    total += timing.dur;
    return { to, tap, ...timing };
  });
  const last = hops[hops.length - 1];
  last.final = true;
  if (lastMove.to.zone === 'home' && lastMove.from.zone !== 'home') last.burst = { colors: ['#ffd166', '#fff3b0', SEAT_COLORS[seat].light], count: 40, up: 4, speed: 2.5 };
  if (lastMove.kind === 'enter') last.burst = { colors: [SEAT_COLORS[seat].light, '#ffffff'], count: 18, up: 2, speed: 2, size: 0.07 };
  plans[`${seat}-${marble}`] = hops;
  if (capture) {
    plans[`${capture.seat}-${capture.marble}`] = [
      { to: worldOf(capture.seat, { zone: 'base' }, capture.marble, layout), dur: 0.9, height: 3.4, delay: total - 0.04, impact: { by: seat, victim: capture.seat }, final: true },
    ];
  }
  return plans;
}

function setCursor(pointer) {
  document.body.style.cursor = pointer ? 'pointer' : '';
}

const TRAIL_GAP = 0.34;

function Marble({ seat, target, plan, planKey, material, movable, selected, hovered, onClick, onHover, mySeat, killFx, trail, down, pickable, onPick }) {
  const group = useRef();
  const body = useRef();
  const halo = useRef();
  const anim = useRef(null);
  const pickHover = useRef(false);
  const shade = useRef();
  if (!anim.current) anim.current = { pos: target.clone(), segs: [], lift: 0, seen: planKey, trailAt: null, off: new THREE.Vector3() };

  useLayoutEffect(() => {
    const a = anim.current;
    if (plan && planKey !== a.seen) {
      a.seen = planKey;
      a.segs = plan.map((s) => ({ ...s, start: null }));
    }
  }, [plan, planKey]);

  const prev = useMemo(() => new THREE.Vector3(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const spin = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state, dt) => {
    const a = anim.current;
    const now = state.clock.elapsedTime;
    prev.copy(a.pos);
    if (a.segs.length) {
      const seg = a.segs[0];
      if (seg.start === null) {
        seg.start = now + (seg.delay || 0);
        seg.from = a.pos.clone();
      }
      const t = (now - seg.start) / seg.dur;
      if (t >= 0 && !seg.begun) {
        seg.begun = true;
        if (seg.impact) {
          sfx.capture(seg.impact.by === mySeat ? 'mine' : seg.impact.victim === mySeat ? 'victim' : 'other');
          playKillFx(killFx[seg.impact.by], { at: [seg.from.x, 0.4, seg.from.z], by: seg.impact.by, victim: seg.impact.victim }, { sfx: (name) => sfx[name]?.() });
        }
      }
      if (t >= 1) {
        a.pos.copy(seg.to);
        a.segs.shift();
        if (seg.final) sfx.land();
        else if (seg.tap) sfx.clack();
        else sfx.hop();
        if (seg.burst) fx.emit('burst', { position: [seg.to.x, 0.3, seg.to.z], ...seg.burst });
      } else if (t >= 0) {
        const e = easeInOut(t);
        a.pos.lerpVectors(seg.from, seg.to, e);
        a.pos.y = seg.from.y + (seg.to.y - seg.from.y) * e + Math.sin(Math.PI * t) * seg.height;
        if (!seg.impact) {
          if (!a.trailAt) a.trailAt = a.pos.clone();
          else if (a.pos.distanceTo(a.trailAt) > TRAIL_GAP) {
            playTrail(trail, [a.pos.x, a.pos.y - 0.08, a.pos.z], { by: seat, prev: [a.trailAt.x, a.trailAt.y - 0.08, a.trailAt.z] });
            a.trailAt.copy(a.pos);
          }
        }
      }
    } else if (a.pos.distanceToSquared(target) > 1e-6) {
      a.trailAt = null;
      a.pos.lerp(target, 1 - Math.exp(-dt * 8));
    } else a.trailAt = null;

    const bob = (Math.sin(now * 5) * 0.5 + 0.5) * 0.14;
    const liftTarget = pickable ? (pickHover.current ? 0.55 : 0.1 + bob) : selected ? 0.5 : hovered ? 0.28 : movable ? 0.1 + bob : 0;
    a.lift += (liftTarget - a.lift) * (1 - Math.exp(-dt * 12));
    const k = down ? downAmount(down.hit) : 0;
    const fly = easeInOut(k);
    const prevOffX = a.off.x;
    const prevOffZ = a.off.z;
    a.off.set(down ? down.shift[0] * fly : 0, Math.sin(Math.PI * k) * FLING_HEIGHT, down ? down.shift[1] * fly : 0);
    if (shade.current) {
      shade.current.material.opacity = 0.72 * clamp01((k - 0.15) / 0.85);
      shade.current.visible = shade.current.material.opacity > 0.01;
    }
    group.current.position.set(a.pos.x + a.off.x, a.pos.y + a.lift + a.off.y, a.pos.z + a.off.z);

    const dx = a.pos.x - prev.x + a.off.x - prevOffX;
    const dz = a.pos.z - prev.z + a.off.z - prevOffZ;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-5) {
      axis.set(dz, 0, -dx).normalize();
      body.current.quaternion.premultiply(spin.setFromAxisAngle(axis, dist / MARBLE_R));
    }
    if (halo.current) {
      const pulse = Math.sin(now * 5) * 0.5 + 0.5;
      halo.current.scale.setScalar(1 + pulse * 0.25);
      halo.current.material.opacity = selected ? 0.95 : 0.35 + pulse * 0.45;
    }
  });

  const handlers = pickable
    ? {
        onClick: (e) => {
          e.stopPropagation();
          setCursor(false);
          pickHover.current = false;
          onPick();
        },
        onPointerOver: (e) => {
          e.stopPropagation();
          setCursor(true);
          pickHover.current = true;
        },
        onPointerOut: () => {
          setCursor(false);
          pickHover.current = false;
        },
      }
    : movable
    ? {
        onClick: (e) => {
          e.stopPropagation();
          onClick();
        },
        onPointerOver: (e) => {
          e.stopPropagation();
          setCursor(true);
          onHover(true);
        },
        onPointerOut: () => {
          setCursor(false);
          onHover(false);
        },
      }
    : {};

  return (
    <>
      <group ref={group}>
        <mesh ref={body} geometry={MARBLE_GEO} material={material} castShadow />
        {down && (
          <mesh ref={shade} geometry={SHADE_GEO} visible={false} renderOrder={1}>
            <meshBasicMaterial color="#050607" transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
        {(movable || pickable) && (
          <mesh geometry={HIT_GEO} {...handlers}>
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
      {movable && (
        <mesh ref={halo} geometry={HALO_GEO} position={[target.x, 0.02, target.z]} rotation-x={-Math.PI / 2}>
          <meshBasicMaterial color={selected ? '#ffe066' : SEAT_COLORS[seat].light} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

function GhostLabel({ text, color }) {
  const texture = useMemo(() => makeLabelTexture(text, color), [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position-y={1.25} scale={[2.4, 0.6, 1]} renderOrder={12}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

const moveLabel = (move) => (move.kind === 'enterCenter' ? 'Shortcut' : move.capture ? 'Capture!' : move.kind === 'exitCenter' ? 'Out of center' : `Move ${move.path.length}`);

function Ghost({ move, strong, label, onMove, layout }) {
  const ref = useRef();
  const ring = useRef();
  const color = SEAT_COLORS[move.seat];
  const target = worldOf(move.seat, move.to, move.marble, layout);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    ref.current.position.y = REST_Y + 0.25 + Math.sin(t * 4) * 0.07;
    ring.current.scale.setScalar(1 + (Math.sin(t * 6) * 0.5 + 0.5) * 0.2);
  });
  return (
    <group position={[target.x, 0, target.z]}>
      <mesh
        ref={ref}
        geometry={GHOST_GEO}
        onClick={(e) => {
          e.stopPropagation();
          setCursor(false);
          onMove(move.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setCursor(true);
        }}
        onPointerOut={() => setCursor(false)}
      >
        <meshStandardMaterial color={color.light} emissive={color.main} emissiveIntensity={0.7} transparent opacity={strong ? 0.6 : 0.35} depthWrite={false} />
      </mesh>
      <mesh ref={ring} geometry={GHOST_RING_GEO} position-y={0.03} rotation-x={-Math.PI / 2}>
        <meshBasicMaterial color={move.capture ? '#ff4040' : '#ffffff'} transparent opacity={strong ? 0.9 : 0.5} toneMapped={false} depthWrite={false} />
      </mesh>
      {move.capture && (
        <mesh geometry={CAPTURE_RING_GEO} position-y={0.03} rotation-x={-Math.PI / 2}>
          <meshBasicMaterial color="#ff4040" transparent opacity={0.7} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {label && <GhostLabel text={label} color={move.capture ? '#ff4040' : color.light} />}
    </group>
  );
}

function PathDots({ move, layout }) {
  if (!move.path || move.path.length < 2) return null;
  return move.path.slice(0, -1).map((cell, i) => {
    const p = worldOf(move.seat, cell, move.marble, layout);
    return (
      <mesh key={i} geometry={PATH_DOT_GEO} position={[p.x, 0.06, p.z]}>
        <meshBasicMaterial color={SEAT_COLORS[move.seat].light} toneMapped={false} />
      </mesh>
    );
  });
}

export default function Marbles({ board, skins = [], killFx = [], trails = [], moves, selected, setSelected, hovered, setHovered, onMove, keyMove = null, mySeat = -1, layout = CLASSIC_LAYOUT }) {
  const materials = [0, 1, 2, 3].map((s) => marbleSkin(skins[s], s));
  useFrame(({ clock }) => materials.forEach((m) => m.animate?.(clock.elapsedTime)));
  const plans = useMemo(() => planMove(board.lastMove, board, layout), [board.lastMove, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const planKey = board.lastMove?.t;
  const focus = selected || hovered;
  const focusMoves = focus ? movesForMarble(moves, focus.seat, focus.marble, board.marbles[focus.seat][focus.marble]) : [];
  // Dev bits ask for marbles straight off the board: every eligible marble becomes clickable and answers on the fx bus
  const [picking, setPicking] = useState(null);
  useEffect(() => fx.on((type, data) => type === 'pickmode' && setPicking(data)), []);
  useEffect(() => setCursor(false), [picking]);
  const hits = board.hits || [];
  const downOf = (seat, marble) => {
    const hit = [...hits].reverse().find((h) => h.victim === seat && h.victimMarble === marble);
    // Once the game actually moves the marble the bit lets go of it, so real moves never look broken
    if (!hit || !samePos(hit.victimAt, board.marbles[seat][marble])) return null;
    const { to, rest } = hitGeo(hit, board);
    return { hit, shift: [rest[0] - to[0], rest[1] - to[1]] };
  };

  const clickMarble = (seat, marble, pos) => {
    const options = movesForMarble(moves, seat, marble, pos);
    if (options.length === 1) {
      setCursor(false);
      setSelected(null);
      onMove(options[0].id);
    } else if (options.length > 1) {
      setSelected(selected && selected.seat === seat && selected.marble === marble ? null : { seat, marble });
    }
  };

  return (
    <group>
      {board.active.map((seat) =>
        board.marbles[seat].map((pos, marble) => {
          const key = `${seat}-${marble}`;
          const movable = movesForMarble(moves, seat, marble, pos).length > 0;
          return (
            <Marble
              key={key}
              seat={seat}
              target={worldOf(seat, pos, marble, layout)}
              plan={plans[key]}
              planKey={planKey}
              material={materials[seat].material}
              movable={movable}
              selected={!!selected && selected.seat === seat && selected.marble === marble}
              hovered={!!hovered && hovered.seat === seat && hovered.marble === marble}
              onClick={() => clickMarble(seat, marble, pos)}
              onHover={(on) => setHovered(on ? { seat, marble } : null)}
              mySeat={mySeat}
              killFx={killFx}
              trail={trails[seat]}
              down={downOf(seat, marble)}
              pickable={!!picking && seat !== picking.notSeat && !picking.skip?.includes(`${seat}:${marble}`)}
              onPick={() => fx.emit('picked', { seat, marble })}
            />
          );
        })
      )}
      {focusMoves.map((mv) => (
        <group key={`g-${mv.id}`}>
          <Ghost
            move={mv}
            strong={!!selected && (!keyMove || keyMove === mv.id)}
            label={keyMove === mv.id ? `${moveLabel(mv)} · Enter` : focusMoves.length > 1 ? moveLabel(mv) : null}
            onMove={onMove}
            layout={layout}
          />
          <PathDots move={mv} layout={layout} />
        </group>
      ))}
    </group>
  );
}

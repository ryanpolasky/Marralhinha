import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SEAT_COLORS, CENTER, layoutFor } from '../game/geometry';
import { PING_LIFE_MS } from '../game/moves';
import { makeLabelTexture } from './textures';

const DEV_COLOR = '#ffffff';
const DANGER = '#ff3b3b';

// Every hole on the board, in board-local world coords, so pings snap to "this spot"
const snapSpots = (layout) => [...layout.RING, ...layout.HOME.flat(), ...layout.BASE.flat(), CENTER].map(([r, c]) => [c, r]);
export function snapToSpot(x, z, layout = layoutFor('classic')) {
  let best = null;
  let bestD = 0.9;
  snapSpots(layout).forEach(([sx, sz]) => {
    const d = Math.hypot(sx - x, sz - z);
    if (d < bestD) {
      bestD = d;
      best = [sx, sz];
    }
  });
  return best || [x, z];
}

const colorOf = (ping) => (ping.seat === null ? DEV_COLOR : SEAT_COLORS[ping.seat].main);

function labelFor(ping, teams) {
  if (ping.type === 'ack') return `${ping.name}: on it!`;
  const who = ping.dev ? `${ping.name} · Dev` : ping.name;
  const text = ping.type === 'danger' ? `Careful! · ${who}` : who;
  return teams && ping.scope === 'all' && !ping.dev ? `${text} (all)` : text;
}

function Ping({ ping, teams }) {
  const group = useRef();
  const arrow = useRef();
  const rings = useRef();
  const label = useRef();
  const color = colorOf(ping);
  const team = ping.seat !== null && ping.scope === 'team';
  const danger = ping.type === 'danger';
  const ack = ping.type === 'ack';
  const texture = useMemo(() => makeLabelTexture(labelFor(ping, teams), danger ? DANGER : color), [ping, teams, danger, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  const born = useRef(null);

  useFrame(({ clock }) => {
    if (born.current === null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    const life = PING_LIFE_MS / 1000;
    const fade = Math.min(1, age / 0.15) * Math.min(1, Math.max(0, (life - age) / 0.5));
    const pop = age < 0.25 ? 0.4 + (age / 0.25) * 0.8 : age < 0.4 ? 1.2 - ((age - 0.25) / 0.15) * 0.2 : 1;
    group.current.visible = fade > 0.01;
    if (arrow.current) {
      arrow.current.position.y = 1.35 + Math.abs(Math.sin(age * 5)) * 0.35;
      arrow.current.rotation.y = age * 2.5;
      arrow.current.scale.setScalar(pop);
    }
    rings.current.children.forEach((ring, i) => {
      const wave = danger ? (age * 1.6 + i * 0.33) % 1 : 0;
      ring.scale.setScalar(danger ? 0.6 + wave * 1.6 : 1 + Math.sin(age * 6 + i) * 0.08);
      ring.material.opacity = fade * (danger ? 1 - wave : 0.85);
    });
    label.current.material.opacity = fade;
    label.current.position.y = (ack ? 1.1 : 2.45) + age * 0.08;
    label.current.scale.set(2.8 * pop, 0.7 * pop, 1);
  });

  return (
    <group ref={group} position={[ping.x, 0, ping.z]}>
      {!ack && (
        <group ref={arrow}>
          <mesh position-y={-0.28} rotation-x={Math.PI}>
            <coneGeometry args={[0.32, 0.55, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.35} />
          </mesh>
          <mesh position-y={0.22}>
            <cylinderGeometry args={[0.1, 0.1, 0.5, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.35} />
          </mesh>
        </group>
      )}
      {/* Ripples are always the sender's colour; danger pings just ripple outward faster and in threes */}
      <group ref={rings} position-y={0.05}>
        {(danger ? [0, 1, 2] : [0]).map((i) => (
          <mesh key={i} rotation-x={-Math.PI / 2} renderOrder={12}>
            <ringGeometry args={[0.42, 0.56, 40]} />
            <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
        {team && !danger && (
          <mesh rotation-x={-Math.PI / 2} renderOrder={12}>
            <ringGeometry args={[0.64, 0.7, 40]} />
            <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        )}
      </group>
      <sprite ref={label} renderOrder={21}>
        <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

export default function Pings({ pings = [], teams = false }) {
  return pings.map((ping) => <Ping key={ping.id} ping={ping} teams={teams} />);
}

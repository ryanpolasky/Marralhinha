import React from 'react';
import { SEAT_COLORS, RING, HOME, BASE, BASE_TRAY, INNER_CORNERS } from '../game/geometry';

const W = 2.75;
const L = 8.75;
const CROSS = [[-W, -L], [W, -L], [W, -W], [L, -W], [L, W], [W, W], [W, L], [-W, L], [-W, W], [-L, W], [-L, -W], [-W, -W]];

function roundedPath(points, r) {
  const toward = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + ((b[0] - a[0]) / len) * r, a[1] + ((b[1] - a[1]) / len) * r];
  };
  const parts = points.map((p, i) => {
    const s = toward(p, points[(i - 1 + points.length) % points.length]);
    const e = toward(p, points[(i + 1) % points.length]);
    return `${i ? 'L' : 'M'}${s[0]},${s[1]}Q${p[0]},${p[1]} ${e[0]},${e[1]}`;
  });
  return `${parts.join('')}Z`;
}

const CROSS_D = roundedPath(CROSS, 0.6);
const xy = ([r, c]) => [c, r];

export function Defs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#dca466" />
        <stop offset="1" stopColor="#a86a30" />
      </linearGradient>
      <linearGradient id={`${id}-dish`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#c58a4d" />
        <stop offset="1" stopColor="#8a5226" />
      </linearGradient>
      <radialGradient id={`${id}-hole`} cx="0.42" cy="0.36" r="0.72">
        <stop offset="0" stopColor="#2a1608" />
        <stop offset="1" stopColor="#6b4220" />
      </radialGradient>
      {SEAT_COLORS.map((c, i) => (
        <radialGradient key={i} id={`${id}-m${i}`} cx="0.34" cy="0.3" r="0.78">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.22" stopColor={c.light} />
          <stop offset="0.68" stopColor={c.main} />
          <stop offset="1" stopColor={c.dark} />
        </radialGradient>
      ))}
    </defs>
  );
}

export function Marble({ id, seat, at, ghost = false, r = 0.42, dim = false }) {
  const [x, y] = xy(at);
  if (ghost) return <circle cx={x} cy={y} r={r} fill={SEAT_COLORS[seat].light} opacity="0.45" stroke="#fff" strokeWidth="0.08" strokeDasharray="0.18 0.12" />;
  return (
    <g opacity={dim ? 0.4 : 1}>
      <circle cx={x + 0.05} cy={y + 0.12} r={r} fill="#000" opacity="0.3" />
      <circle cx={x} cy={y} r={r} fill={`url(#${id}-m${seat})`} />
      <ellipse cx={x - r * 0.32} cy={y - r * 0.38} rx={r * 0.3} ry={r * 0.2} fill="#fff" opacity="0.8" />
    </g>
  );
}

export function Arrow({ from, to, bend = 0, color = '#fff', width = 0.16, dashed = false }) {
  const [x1, y1] = xy(from);
  const [x2, y2] = xy(to);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = mx + (-(y2 - y1) / len) * bend;
  const cy = my + ((x2 - x1) / len) * bend;
  const tx = x2 - cx;
  const ty = y2 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const head = width * 3.4;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  return (
    <g>
      <path d={`M${x1},${y1}Q${cx},${cy} ${bx},${by}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? `${width * 2} ${width * 1.6}` : undefined} />
      <path d={`M${x2},${y2}L${bx - uy * head * 0.6},${by + ux * head * 0.6}L${bx + uy * head * 0.6},${by - ux * head * 0.6}Z`} fill={color} />
    </g>
  );
}

export function Trail({ points, color, width = 0.22 }) {
  const pts = points.map(xy);
  const [x2, y2] = pts[pts.length - 1];
  const [x1, y1] = pts[pts.length - 2];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = width * 3;
  return (
    <g opacity="0.9">
      <polyline points={pts.slice(0, -1).map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${width * 2.2} ${width * 1.4}`} />
      <path d={`M${x2 + ux * 0.2},${y2 + uy * 0.2}L${x2 - ux * head - uy * head * 0.7},${y2 - uy * head + ux * head * 0.7}L${x2 - ux * head + uy * head * 0.7},${y2 - uy * head - ux * head * 0.7}Z`} fill={color} />
    </g>
  );
}

export function Ring({ at, color = '#ffd166', r = 0.58, width = 0.12 }) {
  const [x, y] = xy(at);
  return <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={width} />;
}

const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

export function Die({ at, value, size = 1.6, mark }) {
  const [x, y] = xy(at);
  const h = size / 2;
  const pip = size * 0.26;
  return (
    <g>
      <rect x={x - h + 0.06} y={y - h + 0.14} width={size} height={size} rx={size * 0.2} fill="#000" opacity="0.3" />
      <rect x={x - h} y={y - h} width={size} height={size} rx={size * 0.2} fill="#fff6e6" stroke="#caa77a" strokeWidth={size * 0.04} />
      {PIPS[value].map(([dx, dy], i) => (
        <circle key={i} cx={x + dx * pip} cy={y + dy * pip} r={size * 0.09} fill={value === 1 || value === 6 ? '#c8283a' : '#2a1d12'} />
      ))}
      {mark && <Mark at={[at[0] - h, at[1] + h]} ok={mark === 'yes'} size={size * 0.52} />}
    </g>
  );
}

// A small marble dish (for "sent back home" and similar)
export function Dish({ id, at, seat, r = 0.85 }) {
  const [x, y] = xy(at);
  return (
    <g>
      <circle cx={x} cy={y + 0.1} r={r} fill="#000" opacity="0.3" />
      <circle cx={x} cy={y} r={r} fill={`url(#${id}-dish)`} stroke="#5a3212" strokeWidth="0.08" />
      <circle cx={x} cy={y} r={r * 0.86} fill="none" stroke={SEAT_COLORS[seat].main} strokeWidth="0.12" />
    </g>
  );
}

// The in-game ping: an arrow pointing down at a ring
export function PingMark({ at, color = '#ff8a8a' }) {
  const [x, y] = xy(at);
  return (
    <g>
      <circle cx={x} cy={y} r="0.55" fill="none" stroke={color} strokeWidth="0.12" />
      <path d={`M${x},${y - 0.2}L${x - 0.36},${y - 0.95}L${x + 0.36},${y - 0.95}Z`} fill={color} />
      <rect x={x - 0.11} y={y - 1.55} width="0.22" height="0.65" rx="0.08" fill={color} />
    </g>
  );
}

export function Coin({ at, size = 1 }) {
  const [x, y] = xy(at);
  const r = size / 2;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#f6c343" stroke="#a8740f" strokeWidth={size * 0.07} />
      <circle cx={x} cy={y} r={r * 0.66} fill="none" stroke="#fff0b8" strokeWidth={size * 0.05} opacity="0.8" />
      <circle cx={x} cy={y} r={r * 0.36} fill="#d99a1c" />
    </g>
  );
}

export function Mark({ at, ok, size = 1 }) {
  const [x, y] = xy(at);
  const s = size / 2;
  return (
    <g>
      <circle cx={x} cy={y} r={s} fill={ok ? '#2e9e55' : '#e03a3e'} stroke="#fff" strokeWidth={size * 0.1} />
      <path
        d={ok ? `M${x - s * 0.45},${y + s * 0.02}L${x - s * 0.12},${y + s * 0.34}L${x + s * 0.48},${y - s * 0.32}` : `M${x - s * 0.38},${y - s * 0.38}L${x + s * 0.38},${y + s * 0.38}M${x + s * 0.38},${y - s * 0.38}L${x - s * 0.38},${y + s * 0.38}`}
        fill="none"
        stroke="#fff"
        strokeWidth={size * 0.14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function Label({ at, children, color = '#fff6e8', size = 0.9 }) {
  const [x, y] = xy(at);
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontWeight="700" fill={color} stroke="rgba(10,20,24,0.85)" strokeWidth={size * 0.18} paintOrder="stroke">
      {children}
    </text>
  );
}

export function BoardArt({ id, view = '-9.9 -9.9 19.8 19.8', dishes = [0, 1, 2, 3], baseMarbles = {}, children }) {
  return (
    <svg className="tutorial-art" viewBox={view} role="img" aria-hidden="true">
      <Defs id={id} />
      {dishes.map((s) => {
        const [x, y] = xy(BASE_TRAY[s]);
        return (
          <g key={s}>
            <circle cx={x} cy={y + 0.15} r="2.25" fill="#000" opacity="0.3" />
            <circle cx={x} cy={y} r="2.25" fill={`url(#${id}-dish)`} stroke="#5a3212" strokeWidth="0.1" />
            <circle cx={x} cy={y} r="2.02" fill="none" stroke={SEAT_COLORS[s].main} strokeWidth="0.18" />
            {BASE[s].map((p, i) => {
              const [hx, hy] = xy(p);
              return <circle key={i} cx={hx} cy={hy} r="0.38" fill={`url(#${id}-hole)`} />;
            })}
            {Array.from({ length: baseMarbles[s] ?? 0 }, (_, i) => (
              <Marble key={`m${i}`} id={id} seat={s} at={BASE[s][i]} r={0.36} />
            ))}
          </g>
        );
      })}
      <path d={CROSS_D} fill="#000" opacity="0.3" transform="translate(0 0.25)" />
      <path d={CROSS_D} fill={`url(#${id}-wood)`} stroke="#6b3f18" strokeWidth="0.14" strokeLinejoin="round" />
      {[0, 1, 2, 3].map((s) => (
        <rect key={s} x="-0.55" y="2.45" width="1.1" height="5.15" rx="0.45" fill={SEAT_COLORS[s].main} opacity="0.9" transform={`rotate(${-90 * s})`} />
      ))}
      {[...RING, ...HOME.flat()].map((p, i) => {
        const [x, y] = xy(p);
        return <circle key={i} cx={x} cy={y} r="0.36" fill={`url(#${id}-hole)`} />;
      })}
      {INNER_CORNERS.map((i) => (
        <Ring key={i} at={RING[i]} r={0.48} width={0.1} color="#f0c46a" />
      ))}
      {[0, 1, 2, 3].map((s) => (
        <Ring key={`e${s}`} at={RING[(16 * s + 2) % 64]} r={0.5} width={0.12} color={SEAT_COLORS[s].main} />
      ))}
      <circle cx="0" cy="0" r="0.42" fill={`url(#${id}-hole)`} />
      <circle cx="0" cy="0" r="0.56" fill="none" stroke="#f0c46a" strokeWidth="0.12" />
      {children}
    </svg>
  );
}

export function RowArt({ id, holes = 7, children, height = 3.4, extra = 0 }) {
  const width = holes * 1.3 + 0.6 + extra;
  return (
    <svg className="tutorial-art" viewBox={`-0.9 ${-height / 2} ${width} ${height}`} role="img" aria-hidden="true">
      <Defs id={id} />
      <rect x="-0.8" y="-0.95" width={holes * 1.3 + 0.3} height="1.9" rx="0.7" fill="#000" opacity="0.3" transform="translate(0 0.2)" />
      <rect x="-0.8" y="-0.95" width={holes * 1.3 + 0.3} height="1.9" rx="0.7" fill={`url(#${id}-wood)`} stroke="#6b3f18" strokeWidth="0.1" />
      {Array.from({ length: holes }, (_, i) => (
        <circle key={i} cx={i * 1.3} cy="0" r="0.36" fill={`url(#${id}-hole)`} />
      ))}
      {children}
    </svg>
  );
}

export const rowAt = (i, dy = 0) => [dy, i * 1.3];

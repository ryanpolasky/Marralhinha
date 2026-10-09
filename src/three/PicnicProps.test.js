import * as THREE from 'three';
import { picnicLayout, LANE, WIGGLE, SPREAD } from './PicnicProps';
import { layoutFor } from '../game/geometry';

const HALF_W = 0.13 * SPREAD;
const HALF_LEN = 0.25 * SPREAD;
const GROWN = 0.35;

const rectSdf = ([x, z], hx, hz) => {
  const dx = Math.abs(x) - hx;
  const dz = Math.abs(z) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
};

const sdf = (o, [x, z]) => {
  if (o.type === 'circle') return Math.hypot(x - o.at[0], z - o.at[1]) - o.r;
  if (o.type === 'cross') return Math.min(rectSdf([x, z], o.w, o.l), rectSdf([x, z], o.l, o.w));
  const [dx, dz] = [x - o.at[0], z - o.at[1]];
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  return rectSdf([dx * c - dz * s, dx * s + dz * c], ...o.half);
};

// Both lanes of a trail, with the wiggle pushed each way
function samples(trail, n = 300) {
  const path = new THREE.CatmullRomCurve3(trail.pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const length = path.getLength();
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = path.getPointAt(u);
    const t = path.getTangentAt(u);
    const side = new THREE.Vector2(-t.z, t.x).normalize();
    [LANE + WIGGLE, LANE - WIGGLE, -LANE + WIGGLE, -LANE - WIGGLE].forEach((off) => out.push({ at: [p.x + side.x * off, p.z + side.y * off], d: u * length, end: i === n }));
  }
  return out;
}

describe.each(['classic', 'blitz'])('picnic ants on %s', (variant) => {
  const { trails, obstacles } = picnicLayout(layoutFor(variant).spec);
  const lanes = trails.map((t) => samples(t));

  test('never walk through the board, the dishes or the food', () => {
    lanes.forEach((points, ti) =>
      points.forEach(({ at, d, end }) => {
        if (d < GROWN) return;
        const clear = Math.min(...obstacles.map((o) => sdf(o, at)));
        if (clear < (end ? HALF_LEN : HALF_W)) throw new Error(`trail ${ti} clips at ${at.map((v) => v.toFixed(2))} (clearance ${clear.toFixed(2)})`);
      })
    );
  });

  test('never walk through ants on other trails', () => {
    const radius = (d) => HALF_W * Math.min(1, d / GROWN);
    lanes.forEach((a, i) =>
      lanes.slice(i + 1).forEach((b, k) => {
        a.forEach((p) =>
          b.forEach((q) => {
            const gap = Math.hypot(p.at[0] - q.at[0], p.at[1] - q.at[1]) - radius(p.d) - radius(q.d);
            if (gap < 0.02) throw new Error(`trails ${i} and ${i + k + 1} touch near ${p.at.map((v) => v.toFixed(2))}`);
          })
        );
      })
    );
  });

  test('outbound and homebound ants on one trail pass without touching', () => {
    expect(2 * (LANE - WIGGLE)).toBeGreaterThanOrEqual(2 * HALF_W);
  });
});

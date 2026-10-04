import { SEAT_COLORS } from '../game/geometry';
import { skinKey } from '../game/catalog';
import { fx } from './fx';

const col = (s) => SEAT_COLORS[s];
const later = (ms, fn) => setTimeout(fn, ms);
const rand = (a, b) => a + Math.random() * (b - a);
const seq = (n, gap, fn, start = 0) => Array.from({ length: n }, (_, i) => later(start + i * gap, () => fn(n > 1 ? i / (n - 1) : 1, i)));
const off = (at, dx = 0, dy = 0, dz = 0) => [at[0] + dx, at[1] + dy, at[2] + dz];
const ground = (at, dx = 0, dz = 0) => [at[0] + dx, 0.1, at[2] + dz];
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const TILE = { glow: 0, smoke: 1, star: 2, drop: 3, petal: 4, square: 5, flame: 6, bubble: 7, ghost: 8, bat: 9, flare: 10, streak: 11, ring: 12 };

// Slides a moving point from a to b, calling step(position, progress) every ~18ms
const track = (a, b, ms, step, ease = (k) => k) => {
  const n = Math.max(2, Math.round(ms / 18));
  seq(n, ms / (n - 1), (k) => step(lerp3(a, b, ease(k)), k));
};

// One (emit, info) => {} per kill-effect skin key. info = { at: [x,y,z], by, victim, sfx(name) }.
// Primitives: spr (billboard sprites), shard (solid bouncing bits), dome (fresnel shell), bolt (lightning),
// decal (floor art or billboard panel), ring/beam (Shockwaves), shake (Turntable)
const KILL_FX = {
  // Glass marble shatters into solid shards
  pop: (emit, { at, by, victim }) => {
    emit('spr', { position: at, tile: TILE.glow, c: ['#ffffff'], size: 0.4, size2: 2.4, life: 0.22 });
    emit('shard', { position: at, colors: [col(victim).main, col(victim).light, col(victim).dark, '#ffffff'], n: 22, speed: 3.6, up: 3.4, size: 0.1, life: 1.6, bounce: 0.5 });
    emit('spr', { position: at, n: 14, tile: TILE.smoke, c: ['#e8e2d8'], add: false, speed: 1.4, up: 0.2, size: 0.3, size2: 0.9, life: 0.55, a: 0.45, drag: 2 });
    emit('spr', { position: at, n: 6, tile: TILE.star, c: [col(by).light, '#ffffff'], sphere: true, speed: 3, size: 0.4, size2: 0.05, life: 0.5, drag: 2, rotv: 5 });
    emit('ring', { position: ground(at), color: '#ffffff', size: 1.8, life: 0.35 });
    emit('shake', { amount: 0.3 });
  },

  // Tall geyser erupts from the floor and rains back down in colorful droplets
  fountain: (emit, { at, by }) => {
    const base = ground(at);
    seq(22, 55, (k) => {
      emit('spr', { position: off(base, 0, 0.1), n: 4, tile: TILE.drop, c: [col(by).light, '#ffffff', '#cfe9ff', col(by).main], radius: 0.06, speed: 0.25, up: 10.5, uj: 2.5, size: 0.17, size2: 0.1, life: 1.5, grav: 1, land: true, a: 0.95 });
      emit('spr', { position: off(base, 0, 0.2), n: 1, tile: TILE.glow, c: ['#ffffff', '#cfe9ff'], speed: 0.2, up: 9, uj: 2, size: 0.3, size2: 0.05, life: 0.9, grav: 1, flick: 0, a: 0.7 });
      if (k > 0.2) emit('spr', { position: off(base, 0, 3.4), n: 1, tile: TILE.smoke, c: ['#e5f4ff'], add: false, radius: 0.3, speed: 0.5, size: 0.6, size2: 1.6, life: 0.9, a: 0.28 });
    });
    later(300, () => emit('spr', { position: off(base, 0, 2.8), n: 18, tile: TILE.star, c: ['#ffffff', col(by).light], sphere: true, speed: 1.2, size: 0.28, size2: 0.04, life: 1.3, grav: 0.5, flick: 18 }));
    seq(4, 260, (k) => emit('ring', { position: base, color: '#bfe3ff', size: 1 + k * 1.4, life: 0.8 }), 900);
    emit('shake', { amount: 0.12 });
  },

  // Water balloon: a translucent bubble swells and bursts into a hemisphere of spray
  splash: (emit, { at, by, sfx }) => {
    const base = ground(at);
    emit('dome', { position: base, color: '#6ec0f5', size: 1.1, squash: 0.9, life: 0.28, add: false, solid: 0.25, from: 0.3, opacity: 0.8 });
    later(240, () => {
      emit('dome', { position: base, color: '#ffffff', size: 1.7, squash: 0.7, life: 0.2 });
      emit('spr', { position: off(base, 0, 0.35), n: 48, tile: TILE.drop, c: ['#a9dcff', '#ffffff', '#6ec0f5', col(by).light], sphere: true, speed: 5.4, up: 1.4, size: 0.22, size2: 0.14, life: 1.1, grav: 1.1, drag: 0.6, land: true });
      emit('spr', { position: off(base, 0, 0.35), n: 10, tile: TILE.bubble, c: ['#e8f6ff'], sphere: true, speed: 2.6, size: 0.3, size2: 0.4, life: 0.9, grav: -0.1, drag: 1, a: 0.9 });
      emit('ring', { position: base, color: '#9fdcff', size: 3.6, life: 0.6 });
      emit('decal', { position: base, kind: 'puddle', size: 3.6, life: 2, grow: 0.3 });
      emit('shake', { amount: 0.32 });
      sfx('splash');
    });
  },

  // Cartoon smoke cloud with dizzy stars
  puff: (emit, { at, by, victim }) => {
    emit('spr', { position: at, tile: TILE.glow, c: ['#ffffff'], size: 0.3, size2: 1.8, life: 0.15 });
    emit('spr', { position: at, n: 18, tile: TILE.smoke, c: ['#f4f4f4', '#d9dfe3', col(victim).light], c2: ['#9aa3a8'], add: false, radius: 0.25, speed: 1.2, up: 0.7, uj: 0.8, size: 0.7, size2: 2.2, life: 1.4, a: 0.8, drag: 1.4 });
    emit('spr', { position: off(at, 0, 0.3), n: 7, tile: TILE.star, c: ['#ffe27a', '#ffffff', col(by).light], radius: 0.5, speed: 1.2, up: 2.4, size: 0.4, size2: 0.2, life: 1.1, grav: 0.5, swirl: 4, rotv: 4, drag: 0.8 });
    emit('shake', { amount: 0.12 });
  },

  // A rocket climbs, then bursts into a glittering firework overhead
  sparkler: (emit, { at, by, sfx }) => {
    const top = off(at, 0, 3.4);
    const hues = [col(by).light, '#ffe38a', '#ffffff', col(by).main];
    track(at, top, 380, (p) => {
      emit('spr', { position: p, n: 2, tile: TILE.glow, c: ['#ffcf6a', '#ffffff'], c2: ['#ff7a2a'], speed: 0.4, size: 0.3, size2: 0, life: 0.4, drag: 2 });
      emit('spr', { position: p, tile: TILE.glow, c: ['#ffffff'], size: 0.45, life: 0.05 });
    });
    later(400, () => {
      emit('dome', { position: top, color: '#ffe38a', size: 1.3, life: 0.3 });
      emit('spr', { position: top, tile: TILE.flare, c: ['#fff6d0'], size: 0.5, size2: 4, life: 0.4 });
      emit('spr', { position: top, n: 80, tile: TILE.star, c: hues, sphere: true, speed: 4.2, size: 0.4, size2: 0.08, life: 1.5, drag: 2, grav: 0.25, flick: 24, rotv: 2 });
      emit('shake', { amount: 0.22 });
      sfx('twinkle');
    });
    later(560, () => emit('spr', { position: top, n: 70, tile: TILE.glow, c: hues, sphere: true, speed: 2.6, size: 0.14, size2: 0.04, life: 1.6, drag: 1.6, grav: 0.45, flick: 34 }));
    emit('spr', { position: at, tile: TILE.glow, c: ['#ffe38a'], size: 0.3, size2: 1.4, life: 0.25 });
  },

  // Electric discharge arcing around the marble
  volt: (emit, { at, by, sfx }) => {
    const hub = off(at, 0, 0.05);
    emit('dome', { position: at, color: '#8fe4ff', size: 1.2, life: 0.5 });
    later(180, () => emit('dome', { position: at, color: '#ffe94d', size: 0.9, life: 0.35 }));
    seq(9, 65, () => {
      for (let i = 0; i < 4; i++) {
        const a = rand(0, 6.28);
        const r = rand(0.9, 1.7);
        emit('bolt', { from: hub, to: [at[0] + Math.cos(a) * r, rand(0.1, 1.3), at[2] + Math.sin(a) * r], color: '#7fdcff', radius: 0.014, life: 0.1, jag: 0.17, branches: 1 });
      }
    });
    emit('spr', { position: at, n: 22, tile: TILE.star, c: ['#ffe94d', '#ffffff', '#9feaff', col(by).main], sphere: true, speed: 3.4, size: 0.26, size2: 0, life: 0.55, drag: 2, flick: 40 });
    emit('spr', { position: at, tile: TILE.flare, c: ['#bfefff'], size: 0.4, size2: 3, life: 0.3 });
    emit('ring', { position: ground(at), color: '#bfefff', size: 2.4, life: 0.35 });
    emit('decal', { position: ground(at), kind: 'scorch', size: 1.6, life: 1.4 });
    emit('shake', { amount: 0.3 });
    sfx('zap');
  },

  // Flower blooms on the floor while petals drift down
  bloom: (emit, { at }) => {
    const base = ground(at);
    emit('decal', { position: base, kind: 'flower', color: '#ff8fcb', size: 3.2, life: 2, spin: 0.35, grow: 0.05 });
    emit('spr', { position: at, n: 24, tile: TILE.petal, c: ['#ff9ad5', '#ffc1e3', '#fff0f7', '#ff6fb5'], add: false, radius: 0.15, speed: 1.8, up: 2.8, uj: 1.4, size: 0.34, size2: 0.28, life: 2, grav: 0.2, drag: 0.9, rotv: 1.6, a: 0.95, fade: 0.6 });
    emit('spr', { position: at, n: 7, tile: TILE.petal, c: ['#7bd88f', '#4fb06a'], add: false, speed: 1.6, up: 2.4, size: 0.28, size2: 0.22, life: 1.8, grav: 0.22, drag: 0.9, rotv: 1.6, fade: 0.6 });
    seq(6, 120, () => emit('spr', { position: off(at, 0, 0.1), n: 2, tile: TILE.glow, c: ['#fff3a8', '#ffe27a'], radius: 0.7, speed: 0.3, up: 1.6, size: 0.16, size2: 0, life: 1.2, grav: -0.1, a: 0.8 }));
    emit('ring', { position: base, color: '#ff9ad5', size: 2.4, life: 0.6 });
    emit('shake', { amount: 0.18 });
  },

  // Icy comet streaks in from the sky and leaves stardust
  comet: (emit, { at, by, sfx }) => {
    const from = off(at, -4.8, 8.5, 2.8);
    track(from, at, 360, (p) => {
      emit('spr', { position: p, tile: TILE.glow, c: ['#ffffff'], size: 1, life: 0.07 });
      emit('spr', { position: p, tile: TILE.star, c: ['#e8f7ff'], size: 0.65, life: 0.07, rotv: 6 });
      emit('spr', { position: p, n: 3, tile: TILE.glow, c: ['#cfeaff', '#ffd166'], c2: ['#3b6fb5'], sphere: true, speed: 0.5, size: 0.55, size2: 0, life: 0.6, drag: 2 });
      emit('spr', { position: p, n: 2, tile: TILE.star, c: ['#ffffff', '#ffd166'], sphere: true, speed: 0.6, size: 0.24, size2: 0, life: 0.9, grav: 0.3, flick: 26 });
    }, (k) => k * k * 0.6 + k * 0.4);
    later(360, () => {
      emit('dome', { position: at, color: '#ffe9a8', size: 2, life: 0.35 });
      emit('spr', { position: at, tile: TILE.flare, c: ['#ffffff'], size: 0.6, size2: 5, life: 0.45 });
      emit('spr', { position: at, n: 50, tile: TILE.star, c: ['#ffffff', '#ffd166', '#bfe9ff', col(by).light], sphere: true, speed: 4.2, up: 1.5, size: 0.42, size2: 0.05, life: 1.7, drag: 1.5, grav: 0.15, flick: 18, rotv: 2 });
      emit('ring', { position: ground(at), color: '#ffffff', size: 3.2, life: 0.5 });
      emit('ring', { position: ground(at), color: '#ffd166', size: 2.2, life: 0.45, delay: 0.1 });
      emit('shake', { amount: 0.4 });
      sfx('twinkle');
    });
  },

  // Quick flash and a small star burst
  nova: (emit, { at, by, sfx }) => {
    const core = off(at, 0, 0.1);
    emit('dome', { position: core, color: '#ffffff', size: 1.8, life: 0.3 });
    emit('spr', { position: core, tile: TILE.flare, c: ['#ffffff'], size: 0.5, size2: 3, life: 0.35 });
    emit('spr', { position: core, n: 26, tile: TILE.star, c: ['#ffffff', col(by).light, '#ffd166'], sphere: true, speed: 4, size: 0.3, size2: 0.05, life: 0.8, drag: 2 });
    emit('ring', { position: ground(at), color: '#ffffff', size: 2.6, life: 0.5 });
    emit('shake', { amount: 0.25 });
    sfx('twinkle');
  },

  // Black hole that eats the marble, then spits the remains
  vortex: (emit, { at, victim, sfx }) => {
    const core = off(at, 0, 0.1);
    emit('decal', { position: ground(at), kind: 'vortex', color: '#b36bff', size: 4.2, life: 1.5, spin: 6, grow: 0.2, add: true });
    emit('dome', { position: core, color: '#04000a', size: 0.75, life: 1.05, add: false, solid: 0.85, from: 0.2, opacity: 0.95 });
    seq(15, 42, () => emit('spr', { position: core, n: 5, tile: TILE.glow, c: [col(victim).main, '#b36bff', '#e3c9ff'], radius: 2.9, inward: true, speed: 4.4, size: 0.3, size2: 0.05, life: 0.75, swirl: 5.5 }));
    later(700, () => {
      emit('dome', { position: core, color: '#b36bff', size: 2.6, life: 0.35 });
      emit('ring', { position: ground(at), color: '#b36bff', size: 3.2, life: 0.55 });
      emit('spr', { position: core, n: 50, tile: TILE.star, c: ['#b36bff', '#ffffff', '#e3c9ff'], sphere: true, speed: 5.4, size: 0.34, size2: 0.04, life: 0.95, drag: 2.2 });
      emit('shard', { position: core, colors: [col(victim).main, col(victim).dark], n: 10, speed: 3.4, up: 2.4, size: 0.09, life: 1.4 });
      emit('shake', { amount: 0.42 });
    });
    sfx('glitch');
  },

  // Storm cloud gathers, rain falls, three heavy strikes
  tempest: (emit, { at, by, sfx }) => {
    const sky = 4.6;
    seq(10, 40, () => emit('spr', { position: [at[0], sky, at[2]], n: 3, tile: TILE.smoke, c: ['#2b3340', '#3c4757', '#1b2230'], add: false, radius: 1.5, speed: 0.4, size: 1.5, size2: 2.4, life: 1.6, a: 0.9, fade: 0.5 }));
    seq(18, 38, () => emit('spr', { position: [at[0], sky - 0.3, at[2]], n: 7, tile: TILE.streak, c: ['#a9c6e8'], radius: 1.7, up: -11, uj: 0, size: 0.34, size2: 0.34, life: 0.5, grav: 0.1, rot: Math.PI / 2, a: 0.6, land: true, fade: 0.3 }), 120);
    [320, 540, 780].forEach((ms, i) =>
      later(ms, () => {
        const sx = at[0] + (i - 1) * 0.55;
        const sz = at[2] + (i % 2 ? 0.45 : -0.35);
        emit('bolt', { from: [sx + rand(-0.4, 0.4), sky, sz], to: [sx, 0.1, sz], color: '#bfe3ff', radius: 0.05, life: 0.26, jag: 0.5, branches: 3 });
        emit('dome', { position: [sx, 0.3, sz], color: '#ffffff', size: 1.3 + i * 0.6, life: 0.28 });
        emit('spr', { position: [sx, 0.3, sz], n: 16, tile: TILE.star, c: ['#ffffff', '#bfe3ff', col(by).light], sphere: true, speed: 4, size: 0.28, size2: 0, life: 0.5, drag: 2, flick: 40 });
        emit('ring', { position: ground([sx, 0, sz]), color: '#cfe9ff', size: 1.8 + i * 0.8, life: 0.4 });
        emit('decal', { position: ground([sx, 0, sz]), kind: 'scorch', size: 1.4, life: 1.6 });
        emit('shake', { amount: 0.25 + i * 0.15 });
        if (i === 0) sfx('zap');
        if (i === 2) {
          emit('dome', { position: off(at, 0, 0.3), color: '#ffffff', size: 3.6, life: 0.4 });
          sfx('boom');
        }
      })
    );
  },

  // A fire bird unfolds its wings over the marble
  phoenix: (emit, { at, by, sfx }) => {
    const fire = ['#ffd166', '#ff9a3c', '#ff5f3a'];
    emit('decal', { position: ground(at), kind: 'rune', color: '#ff9a3c', size: 3.6, life: 1.7, spin: 1.5, grow: 0.3, add: true });
    emit('dome', { position: at, color: '#ff7a2a', size: 1.6, life: 0.4 });
    seq(15, 50, () => emit('spr', { position: off(at, 0, 0.1), n: 4, tile: TILE.flame, c: fire, c2: ['#5a1608'], radius: 0.18, speed: 0.4, up: 3.4, uj: 1.4, size: 0.7, size2: 0.15, life: 0.85, grav: -0.3, drag: 0.5 }));
    seq(11, 48, (k) => {
      [-1, 1].forEach((side) => {
        const p = off(at, side * (0.3 + k * 2.3), 0.5 + Math.sin(k * 2.7) * 1.2 + k * 0.7, 0);
        emit('spr', { position: p, n: 3, tile: TILE.flame, c: ['#fff3b0', '#ffd166', '#ff9a3c'], c2: ['#8a2a0a'], vel: [side * 1.1, 0.8, 0], size: 0.55 - k * 0.15, size2: 0.1, life: 0.55, rot: side * (1.1 - k * 0.5), jitter: 0.08, drag: 1 });
        if (k > 0.5) emit('spr', { position: p, tile: TILE.star, c: ['#fff3b0'], size: 0.3, size2: 0, life: 0.5, flick: 30 });
      });
    }, 120);
    later(480, () => {
      emit('spr', { position: off(at, 0, 1.5), tile: TILE.glow, c: ['#ffd166'], size: 1.2, size2: 3.4, life: 0.6 });
      emit('spr', { position: off(at, 0, 1.5), tile: TILE.flare, c: ['#fff3b0'], size: 0.5, size2: 4.4, life: 0.5 });
      emit('shake', { amount: 0.4 });
    });
    emit('spr', { position: at, n: 44, tile: TILE.glow, c: ['#ffd166', '#ff9a3c'], speed: 2.2, up: 4, size: 0.16, size2: 0, life: 2, grav: -0.25, flick: 14, swirl: 1.2 });
    emit('ring', { position: ground(at), color: '#ff9a3c', size: 2.8, life: 0.7 });
    emit('ring', { position: ground(at), color: '#ffd166', size: 1.8, life: 0.55, delay: 0.1 });
    sfx('twinkle');
  },

  // Flaming rock slams in, leaves a crater and a smoke column
  meteor: (emit, { at, by, victim, sfx }) => {
    const from = off(at, 3.6, 10, -2.2);
    track(from, at, 320, (p) => {
      emit('spr', { position: p, tile: TILE.smoke, c: ['#3d342f'], add: false, size: 1.2, life: 0.1, a: 0.95 });
      emit('spr', { position: p, tile: TILE.glow, c: ['#ffb45a'], size: 1.7, life: 0.07 });
      emit('spr', { position: p, n: 3, tile: TILE.flame, c: ['#ffd166', '#ff7a2a', '#ff4a1a'], c2: ['#5a1a08'], sphere: true, speed: 0.6, size: 0.8, size2: 0.1, life: 0.6, drag: 2 });
      emit('spr', { position: p, n: 2, tile: TILE.smoke, c: ['#4a423c', '#6a625a'], add: false, sphere: true, speed: 0.4, size: 0.5, size2: 1.5, life: 1.2, a: 0.6 });
    }, (k) => k * k);
    later(320, () => {
      const base = ground(at);
      emit('dome', { position: at, color: '#ffa04a', size: 3.4, life: 0.45 });
      emit('dome', { position: at, color: '#ffffff', size: 1.4, life: 0.18 });
      emit('decal', { position: base, kind: 'scorch', size: 3.8, life: 3.2, grow: 0.5 });
      emit('decal', { position: off(base, 0, 0.01), kind: 'cracks', size: 3.6, life: 3, grow: 0.4 });
      emit('ring', { position: base, color: '#ff9a4a', size: 4.6, life: 0.7 });
      emit('ring', { position: base, color: '#ffe0a0', size: 3, life: 0.5, delay: 0.06 });
      emit('shard', { position: at, colors: ['#5a4a40', '#3a2f2a', '#7a6a5e', '#ff8a3c'], n: 22, speed: 4.6, up: 6, size: 0.17, life: 2, bounce: 0.5 });
      emit('spr', { position: off(at, 0, 0.1), n: 18, tile: TILE.smoke, c: ['#8a7f76', '#b3a69a', '#5e554e'], add: false, radius: 0.3, speed: 2.8, up: 0.3, size: 0.9, size2: 2.8, life: 1.5, a: 0.75, drag: 1.8 });
      emit('spr', { position: at, n: 46, tile: TILE.glow, c: ['#ffd166', '#ff8a3c', '#ff5a1a'], sphere: true, speed: 5, up: 2.5, size: 0.2, size2: 0, life: 1.3, grav: 0.8, drag: 0.8, flick: 20 });
      seq(9, 70, () => emit('spr', { position: off(at, 0, 0.2), n: 2, tile: TILE.smoke, c: ['#3a3430', '#554c45'], add: false, radius: 0.25, up: 2.4, size: 0.7, size2: 1.9, life: 1.6, a: 0.7 }));
      emit('shake', { amount: 0.7 });
      sfx('boom');
    });
  },

  // 8-bit: marble blows apart into voxels and glitchy pixels
  pixel: (emit, { at, by, sfx }) => {
    const neon = ['#ff4fd8', '#2fe6ff', '#ffe94d', '#ffffff', col(by).main];
    emit('decal', { position: ground(at), kind: 'pixels', size: 3.4, life: 1.3, grow: 0.7, add: true });
    emit('shard', { shape: 'box', position: at, colors: neon, n: 40, speed: 3.6, up: 4.2, size: 0.12, life: 1.7, bounce: 0.55, spin: 5 });
    emit('spr', { position: at, n: 36, tile: TILE.square, c: neon, add: false, rot: 0, speed: 3, up: 2.6, size: 0.22, size2: 0.22, life: 0.8, drag: 1.4, flick: 38, fade: 0.4 });
    seq(6, 55, (k, i) => emit('spr', { position: off(at, 0, 0.3), n: 2, tile: TILE.square, c: i % 2 ? ['#2fe6ff', '#ffffff'] : ['#ff4fd8', '#ffe94d'], rot: 0, radius: 0.5, size: 0.8, size2: 0.8, life: 0.1, a: 0.8 }));
    emit('ring', { position: ground(at), color: '#2fe6ff', size: 2.6, life: 0.4 });
    emit('ring', { position: ground(at), color: '#ff4fd8', size: 1.7, life: 0.35, delay: 0.12 });
    emit('shake', { amount: 0.4 });
    sfx('glitch');
  },

  // Whirlpool of foam and bubbles drags the marble under
  supporter: (emit, { at, by, sfx }) => {
    const base = ground(at);
    emit('decal', { position: base, kind: 'vortex', color: '#44b6ad', size: 4, life: 1.7, spin: -5, grow: 0.3, add: true });
    emit('decal', { position: base, kind: 'puddle', color: '#7ef0d4', size: 3, life: 1.9, delay: 0.3 });
    emit('dome', { position: base, color: '#7ef0d4', size: 2, squash: 0.6, life: 0.6 });
    seq(11, 55, () => emit('spr', { position: off(base, 0, 0.1), n: 5, tile: TILE.drop, c: ['#a7f3de', '#e0fff5', '#44b6ad', col(by).light], radius: 1.9, speed: 0.6, up: 2.4, uj: 1.4, size: 0.16, size2: 0.1, life: 1.1, grav: 1, swirl: 4.5, land: true }));
    emit('spr', { position: off(at, 0, -0.1), n: 24, tile: TILE.bubble, c: ['#e0fff5', '#a7f3de'], radius: 0.8, speed: 0.4, up: 2, uj: 1.2, size: 0.22, size2: 0.34, life: 1.7, grav: -0.2, swirl: 2.2, a: 0.9, fade: 0.5 });
    emit('beam', { position: base, color: '#44b6ad', size: 2.4, height: 1.8, life: 0.5 });
    seq(3, 150, (k) => emit('ring', { position: base, color: k % 2 ? '#a7f3de' : '#44b6ad', size: 3.4 - k * 1.2, life: 0.7 }));
    emit('shake', { amount: 0.3 });
    sfx('splash');
  },

  // Ghosts and bats swirl up out of a glowing circle
  halloween: (emit, { at, victim, sfx }) => {
    emit('decal', { position: ground(at), kind: 'rune', color: '#7bf1a8', size: 3.2, life: 1.9, spin: -1, grow: 0.3, add: true });
    emit('dome', { position: at, color: '#b36bff', size: 1.6, life: 0.5 });
    [['#d9ffe9', 0, 1.6, -0.5], ['#e2d4ff', 160, 1.3, 0.5]].forEach(([c, ms, h, dx], i) =>
      later(ms, () => emit('spr', { position: off(at, dx, 0.5), tile: TILE.ghost, c: [c], add: false, size: 0.6, size2: 1.7 - i * 0.2, life: 1.9, up: h, uj: 0, a: 0.85, rot: 0, fade: 1.2, fadeIn: 0.35 }))
    );
    seq(10, 90, () => emit('spr', { position: off(at, 0, 0.1), n: 2, tile: TILE.glow, c: ['#7bf1a8', '#b36bff', col(victim).light], radius: 0.35, speed: 0.3, up: 1.5, size: 0.3, size2: 0.05, life: 1.2, grav: -0.05, swirl: 3, a: 0.8 }));
    emit('spr', { position: off(at, 0, 0.3), n: 9, tile: TILE.bat, c: ['#1a0a24', '#2a123a'], add: false, rot: 0, radius: 0.2, speed: 2.6, up: 2.2, uj: 1, size: 0.55, size2: 0.4, life: 1.6, grav: -0.3, drag: 0.6, swirl: 1.5, a: 0.95, fade: 0.5 });
    emit('ring', { position: ground(at), color: '#7bf1a8', size: 2.6, life: 0.7 });
    emit('shake', { amount: 0.28 });
    sfx('spooky');
  },

  // A Windows-style crash screen pops up, flickers, then dissolves into blue pixels
  beta: (emit, { at, sfx }) => {
    const screen = off(at, 0, 1.5);
    emit('dome', { position: at, color: '#5fb8ff', size: 1.5, life: 0.4 });
    emit('decal', { position: screen, kind: 'bsod', size: 2.2, life: 1.5, jitter: 0.06, grow: 0.3 });
    seq(7, 70, () => emit('spr', { position: off(at, 0, 0.2), n: 3, tile: TILE.square, c: ['#0a5bc4', '#5fb8ff', '#ffffff'], rot: 0, radius: 0.7, speed: 0.8, up: 1.6, size: 0.2, size2: 0.2, life: 0.35, add: false, flick: 50 }));
    later(1050, () => {
      emit('spr', { position: screen, n: 60, tile: TILE.square, c: ['#0a5bc4', '#5fb8ff', '#ffffff', '#1b4fa0'], add: false, rot: 0, radius: 0.9, speed: 1.6, up: 0.6, uj: 1.2, size: 0.17, size2: 0.17, life: 0.9, grav: 0.8, fade: 0.5 });
      emit('shake', { amount: 0.3 });
    });
    seq(3, 130, (k) => emit('ring', { position: ground(at), color: k % 2 ? '#d6eeff' : '#5fb8ff', size: 3.2 - k * 1.1, life: 0.5 }));
    sfx('glitch');
  },

  // Everything collapses inward, then the whole table goes supernova
  dev: (emit, { at, by, sfx }) => {
    const core = off(at, 0, 0.1);
    seq(12, 32, (k) => {
      emit('spr', { position: core, n: 6, tile: TILE.glow, c: [col(by).light, '#ffffff', '#ffd166'], radius: 2.7, inward: true, speed: 7.5, size: 0.3, size2: 0.06, life: 0.4, swirl: 3.5 });
      emit('spr', { position: core, tile: TILE.glow, c: ['#ffffff'], size: 0.3 + k * 1.3, life: 0.06 });
    });
    later(420, () => {
      emit('dome', { position: core, color: '#ffffff', size: 5.2, life: 0.5 });
      emit('dome', { position: core, color: col(by).light, size: 3.4, life: 0.65, delay: 0.05 });
      emit('beam', { position: ground(at), color: '#ffffff', size: 1.1, height: 6.5, life: 0.35 });
      emit('spr', { position: core, tile: TILE.flare, c: ['#ffffff'], size: 0.8, size2: 8, life: 0.55, rot: 0 });
      emit('spr', { position: core, tile: TILE.flare, c: ['#ffd166'], size: 0.6, size2: 6, life: 0.5, rot: Math.PI / 4 });
      emit('spr', { position: core, n: 90, tile: TILE.star, c: ['#ffffff', col(by).light, '#ffd166'], sphere: true, speed: 8, size: 0.4, size2: 0.05, life: 1.1, drag: 2.2, rotv: 3 });
      emit('ring', { position: ground(at), color: '#ffffff', size: 5.4, life: 0.8 });
      emit('ring', { position: ground(at), color: col(by).main, size: 3.8, life: 0.6, delay: 0.08 });
      emit('shake', { amount: 0.55 });
      sfx('boom');
    });
  },

};

export const playKillFx = (itemId, info, { emit = fx.emit, sfx = () => {} } = {}) => {
  (KILL_FX[skinKey(itemId)] || KILL_FX.pop)(emit, { ...info, sfx });
};

export { KILL_FX };

import { SEAT_COLORS } from '../game/geometry';
import { skinKey } from '../game/catalog';
import { fx } from './fx';
import { videoFor } from './Spectacle';
import { ORES as MC_ORES } from './minecraft';
import { ANVIL, BALL } from './Props';

const col = (s) => SEAT_COLORS[s];
// Dev kit effects follow the dev's live seat color, and fall back to red anywhere there's no player
export const DEV_RED = SEAT_COLORS[0];
const rand = (a, b) => a + Math.random() * (b - a);
const off = (at, dx = 0, dy = 0, dz = 0) => [at[0] + dx, at[1] + dy, at[2] + dz];
const ground = (at, dx = 0, dz = 0) => [at[0] + dx, 0.1, at[2] + dz];
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const TILE = { glow: 0, smoke: 1, star: 2, drop: 3, petal: 4, square: 5, flame: 6, bubble: 7, ghost: 8, bat: 9, flare: 10, streak: 11, ring: 12, foot: 13, grass: 14, alert: 15 };

// Timers ride the bus clock so they pause with the frame loop and die with the scene
const timeline = (bus) => {
  const later = (ms, fn) => bus.later(ms / 1000, fn);
  const seq = (n, gap, fn, start = 0) => Array.from({ length: n }, (_, i) => later(start + i * gap, () => fn(n > 1 ? i / (n - 1) : 1, i)));
  const track = (a, b, ms, step, ease = (k) => k) => {
    const n = Math.max(2, Math.round(ms / 18));
    seq(n, ms / (n - 1), (k) => step(lerp3(a, b, ease(k)), k));
  };
  return { later, seq, track };
};

// One (emit, info) => {} per skin key; info = { at, by, victim, sfx, later, seq, track }
const KILL_FX = {
  // The victim breaks like a block: chunks bounce, flat debris rains, then XP orbs hop out and get pulled up into a level-up
  minecraft: (emit, { at, by, victim, sfx, later, seq }) => {
    const ore = MC_ORES[victim % 4];
    const rubble = ['#6f706c', '#878984', '#9a9b97', ore.main, ore.dark, ore.light];
    emit('spr', { position: at, tile: TILE.glow, c: ['#ffffff'], size: 0.5, size2: 2, life: 0.18 });
    emit('shard', { shape: 'box', position: off(at, 0, -0.1), colors: rubble, n: 22, speed: 2.6, up: 3.8, size: 0.15, life: 2, bounce: 0.38, spin: 7 });
    emit('spr', { position: at, n: 40, px: true, tile: TILE.square, c: rubble, rot: 0, speed: 2.2, up: 2.8, size: 0.2, size2: 0.13, life: 1, grav: 1.4, land: true, fade: 0.3 });
    emit('spr', { position: off(at, 0, -0.15), n: 12, px: true, tile: TILE.smoke, c: ['#c9cbbd', '#ecebdf', '#a9ab9f'], speed: 1.1, up: 0.5, size: 0.5, size2: 1.2, life: 0.7, a: 0.7, drag: 2.2 });
    emit('ring', { position: ground(at), color: '#eef7d2', size: 1.9, life: 0.35 });
    emit('shake', { amount: 0.2 });
    sfx('crunch');
    const top = off(at, 0, 1.55);
    const ORBS = 7;
    for (let i = 0; i < ORBS; i++) {
      const angle = (i / ORBS) * Math.PI * 2 + 0.4;
      const reach = 0.65 + (i % 3) * 0.18;
      const rest = [at[0] + Math.cos(angle) * reach, 0.18, at[2] + Math.sin(angle) * reach];
      seq(44, 26, (k) => {
        let p;
        if (k < 0.34) {
          const u = k / 0.34;
          const hop = u < 0.78 ? Math.sin((u / 0.78) * Math.PI) * 0.85 : Math.sin(((u - 0.78) / 0.22) * Math.PI) * 0.12;
          p = [at[0] + (rest[0] - at[0]) * u, at[1] + (rest[1] - at[1]) * u + hop, at[2] + (rest[2] - at[2]) * u];
        } else if (k < 0.55) p = [rest[0], rest[1] + Math.abs(Math.sin(k * 40 + i)) * 0.06, rest[2]];
        else {
          const u = ((k - 0.55) / 0.45) ** 2;
          p = [rest[0] + (top[0] - rest[0]) * u, rest[1] + (top[1] - rest[1]) * u + Math.sin(u * Math.PI) * 0.35, rest[2] + (top[2] - rest[2]) * u];
        }
        const pulse = 0.85 + 0.15 * Math.sin(k * 30 + i);
        emit('spr', { position: p, tile: TILE.glow, c: [i % 2 ? '#d8ff4a' : '#86ff3a'], size: 0.5 * pulse, life: 0.07, jitter: 0, fadeIn: 0.01, a: 0.85 });
        emit('spr', { position: p, px: true, tile: TILE.square, c: [k % 0.2 < 0.1 ? '#f2ffb0' : '#c8f53c'], rot: 0, size: 0.17, life: 0.06, jitter: 0, fadeIn: 0.01 });
        if (k === 1) sfx('xp', i);
      }, 260 + i * 70);
    }
    later(260 + (ORBS - 1) * 70 + 43 * 26 + 40, () => {
      emit('spr', { position: top, tile: TILE.flare, c: ['#f4ffb8'], size: 0.4, size2: 2.6, life: 0.32, rot: 0 });
      emit('spr', { position: top, n: 28, px: true, tile: TILE.square, c: ['#c8ff5a', '#86ff3a', '#fff7a0', col(by).light], sphere: true, rot: 0, speed: 2.6, size: 0.16, size2: 0.06, life: 0.9, drag: 1.6, grav: 0.4 });
      emit('ring', { position: ground(at), color: '#b6ff5a', size: 2.6, life: 0.5 });
      sfx('levelUp');
    });
  },
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
  fountain: (emit, { at, by, seq, later }) => {
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
  splash: (emit, { at, by, sfx, later }) => {
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
  sparkler: (emit, { at, by, sfx, later, track }) => {
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

  // A pinhole opens up and the marble zips off like a balloon somebody let go of
  deflate: (emit, { at, victim, sfx }) => {
    emit('spr', { position: at, n: 10, tile: TILE.smoke, c: ['#f4f4f4', '#dfe5e8', col(victim).light], add: false, speed: 1.6, up: 0.6, size: 0.25, size2: 0.9, life: 0.6, a: 0.7, drag: 2.2 });
    emit('spr', { position: at, n: 6, tile: TILE.streak, c: ['#ffffff'], sphere: true, speed: 3, size: 0.4, size2: 0.05, life: 0.3, drag: 2 });
    sfx('wheeze');
  },

  // A vaudeville cane hooks the marble from the wings and drags it off, to a sad trombone
  stage: (emit, { at, across, sfx, later }) => {
    emit('cane', { position: at, across: across || [at[0] >= 0 ? 1 : -1, 0, 0] });
    later(440, () => {
      emit('spr', { position: at, n: 12, tile: TILE.smoke, c: ['#d9cdb8', '#bfb39e'], add: false, speed: 1.4, up: 0.4, size: 0.3, size2: 0.9, life: 0.7, a: 0.6, drag: 2 });
      emit('shake', { amount: 0.14 });
    });
    sfx('trombone');
  },

  // Electric discharge arcing around the marble
  volt: (emit, { at, by, sfx, later, seq }) => {
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
  bloom: (emit, { at, seq }) => {
    const base = ground(at);
    emit('decal', { position: base, kind: 'flower', color: '#ff8fcb', size: 3.2, life: 2, spin: 0.35, grow: 0.05 });
    emit('spr', { position: at, n: 24, tile: TILE.petal, c: ['#ff9ad5', '#ffc1e3', '#fff0f7', '#ff6fb5'], add: false, radius: 0.15, speed: 1.8, up: 2.8, uj: 1.4, size: 0.34, size2: 0.28, life: 2, grav: 0.2, drag: 0.9, rotv: 1.6, a: 0.95, fade: 0.6 });
    emit('spr', { position: at, n: 7, tile: TILE.petal, c: ['#7bd88f', '#4fb06a'], add: false, speed: 1.6, up: 2.4, size: 0.28, size2: 0.22, life: 1.8, grav: 0.22, drag: 0.9, rotv: 1.6, fade: 0.6 });
    seq(6, 120, () => emit('spr', { position: off(at, 0, 0.1), n: 2, tile: TILE.glow, c: ['#fff3a8', '#ffe27a'], radius: 0.7, speed: 0.3, up: 1.6, size: 0.16, size2: 0, life: 1.2, grav: -0.1, a: 0.8 }));
    emit('ring', { position: base, color: '#ff9ad5', size: 2.4, life: 0.6 });
    emit('shake', { amount: 0.18 });
  },

  // Icy comet streaks in from the sky and leaves stardust
  comet: (emit, { at, by, sfx, later, track }) => {
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
  vortex: (emit, { at, victim, sfx, later, seq }) => {
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
  tempest: (emit, { at, by, sfx, later, seq }) => {
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
  phoenix: (emit, { at, sfx, later, seq }) => {
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
  meteor: (emit, { at, sfx, later, seq, track }) => {
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
  pixel: (emit, { at, by, sfx, seq }) => {
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
  supporter: (emit, { at, by, sfx, seq }) => {
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

  lucky: (emit, { at, sfx, seq }) => {
    const base = ground(at);
    const gold = ['#fff3b8', '#ffd166', '#f0b93a', '#c48a1c'];
    emit('dome', { position: at, color: '#ffd166', size: 1.6, life: 0.45 });
    emit('decal', { position: base, kind: 'scorch', color: '#f0b93a', size: 3, life: 1.6, grow: 0.4, add: true });
    emit('shard', { shape: 'box', position: off(at, 0, 0.1), colors: gold, n: 30, speed: 2.4, up: 5, size: 0.11, life: 1.9, bounce: 0.5, spin: 9 });
    seq(8, 60, (k, i) => emit('spr', { position: off(at, 0, 0.2), n: 4, tile: TILE.ring, c: i % 3 ? gold : ['#7dffb4', '#0e7a43'], rot: 0, speed: 2.2, up: 3.4, uj: 1.4, size: 0.2, size2: 0.16, life: 1.2, grav: 1.4, land: true, flick: 10 }));
    emit('spr', { position: at, n: 26, tile: TILE.star, c: ['#ffffff', '#fff3b8', '#7dffb4'], sphere: true, speed: 3, up: 1.6, size: 0.26, size2: 0, life: 1.1, drag: 1, flick: 24 });
    emit('beam', { position: base, color: '#ffd166', size: 1.8, height: 2.2, life: 0.55 });
    seq(2, 140, (k) => emit('ring', { position: base, color: k ? '#7dffb4' : '#ffd166', size: 3 - k, life: 0.6 }));
    emit('shake', { amount: 0.3 });
    sfx('twinkle');
  },

  // Ghosts and bats swirl up out of a glowing circle
  halloween: (emit, { at, victim, sfx, later, seq }) => {
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
  beta: (emit, { at, sfx, later, seq }) => {
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

  // Crosshair snaps onto the victim, a tracer comes in from somewhere far away, the helmet flies off
  defuse: (emit, { at, sfx, later }) => {
    const base = ground(at);
    emit('decal', { position: off(base, 0, 0.01), kind: 'crosshair', color: '#7dff8a', size: 1.5, grow: 2.6, angle: 0, life: 0.75, add: true });
    later(260, () => {
      emit('bolt', { from: off(at, -7.5, 5.5, -6), to: at, color: '#ffe9a0', radius: 0.014, life: 0.12, jag: 0, branches: 0 });
      emit('spr', { position: at, tile: TILE.flare, c: ['#ffffff'], size: 0.4, size2: 2.6, life: 0.18, rot: 0 });
      emit('shard', { shape: 'helmet', position: off(at, 0, 0.15), colors: ['#5d6b45'], n: 1, speed: 1.6, up: 6, size: 0.42, life: 1.7, bounce: 0.35, spin: 12 });
      emit('shard', { position: at, colors: ['#e8e2d8', '#c8ab7c', '#ffffff'], n: 14, speed: 3, up: 2.6, size: 0.07, life: 1.1, bounce: 0.4 });
      emit('spr', { position: at, n: 12, tile: TILE.smoke, c: ['#d8c49c', '#bfa77c'], add: false, speed: 1.6, up: 0.6, size: 0.4, size2: 1.3, life: 0.8, a: 0.6, drag: 2 });
      emit('spr', { position: at, n: 10, tile: TILE.star, c: ['#fff3c0', '#ffffff'], sphere: true, speed: 3.2, size: 0.25, size2: 0.02, life: 0.35, drag: 2, flick: 40 });
      emit('decal', { position: off(at, 0, 1.6), kind: 'headshot', size: 1.1, grow: 0.5, life: 1.3 });
      emit('ring', { position: base, color: '#ffffff', size: 1.6, life: 0.3 });
      emit('shake', { amount: 0.32 });
      sfx('onetap');
    });
  },

  // Janky green screen cop car crash, chroma keyed over the table
  // Confetti and curly streamers out of a party popper
  popper: (emit, { at, by, sfx }) => {
    const hues = ['#ff5f8f', '#ffd23f', '#3fd8ff', '#7bf1a8', '#b36bff', col(by).light];
    emit('spr', { position: at, tile: TILE.glow, c: ['#ffffff'], size: 0.4, size2: 1.6, life: 0.15 });
    emit('spr', { position: at, n: 70, tile: TILE.square, c: hues, add: false, speed: 2.8, up: 4.6, uj: 1.5, size: 0.26, size2: 0.2, life: 1.8, grav: 0.55, drag: 1.2, swirl: 2, rotv: 9, land: true, fade: 0.5 });
    emit('spr', { position: at, n: 14, tile: TILE.streak, c: hues, add: false, speed: 3, up: 3.8, size: 0.7, size2: 0.55, life: 1.2, grav: 0.4, drag: 1.4, rotv: 6, swirl: 3 });
    emit('shake', { amount: 0.1 });
    sfx('pop');
  },

  // An anvil drops out of the sky, pancakes the victim, then hauls itself back up
  anvil: (emit, { at, sfx, later }) => {
    const base = ground(at);
    emit('anvil', { position: base });
    later(ANVIL.drop * 1000, () => {
      emit('spr', { position: off(base, 0, 0.1), n: 16, tile: TILE.smoke, c: ['#e4ddd0', '#c9c0b0'], add: false, radius: 0.4, speed: 2.2, up: 0.3, size: 0.4, size2: 1.1, life: 0.8, a: 0.7, drag: 2.4 });
      emit('ring', { position: base, color: '#ffffff', size: 2.2, life: 0.35 });
      emit('decal', { position: base, kind: 'cracks', size: 1.8, life: 1.6, grow: 0.6 });
      emit('spr', { position: off(base, 0, 0.95), n: 5, tile: TILE.star, c: ['#ffe27a', '#ffffff'], radius: 0.4, speed: 0.2, size: 0.3, size2: 0.25, life: 1.1, swirl: 6, rotv: 4 });
      emit('shake', { amount: 0.45 });
      sfx('thud');
    });
    later((ANVIL.drop + ANVIL.hold + ANVIL.lift) * 1000 + 30, () => sfx('boing'));
  },

  // The claw grabs, wobbles, drops the marble once for show, then grabs it for real
  claw: (emit, { at, sfx, later }) => {
    const base = ground(at);
    emit('claw', { position: [at[0], 0.07, at[2]] });
    sfx('servo');
    later(650, () => sfx('clack'));
    later(1550, () => sfx('squeak'));
    later(1850, () => {
      emit('spr', { position: base, n: 8, tile: TILE.smoke, c: ['#e4ddd0'], add: false, speed: 1.2, up: 0.3, size: 0.25, size2: 0.7, life: 0.5, a: 0.5, drag: 2 });
      sfx('clack');
    });
    later(2550, () => sfx('servo'));
  },

  // The capturing marble is the ball: it swallows the victim, rocks three times, and clicks shut
  wild: (emit, { at, sfx, later }) => {
    const spot = [at[0], 0.4, at[2]];
    sfx('whip');
    emit('dome', { position: spot, color: '#ff4a4a', size: 0.9, life: 0.35 });
    emit('spr', { position: spot, n: 16, tile: TILE.glow, c: ['#ff6a6a', '#ffffff'], radius: 0.6, inward: true, speed: 1.8, size: 0.25, size2: 0.05, life: BALL.absorb });
    later(BALL.absorb * 1000, () => {
      emit('ring', { position: ground(at), color: '#f6d889', size: 1.6, life: 0.5 });
      sfx('zap');
    });
    BALL.shakes.forEach((t) => later((t + BALL.shake * 0.25) * 1000, () => {
      emit('spr', { position: ground(at), n: 3, tile: TILE.smoke, c: ['#e4ddd0'], add: false, speed: 0.6, up: 0.2, size: 0.18, size2: 0.45, life: 0.4, a: 0.35, drag: 2 });
      sfx('clack');
    }));
    later(BALL.click * 1000, () => {
      emit('ring', { position: ground(at), color: '#82ffc0', size: 2.3, life: 0.6 });
      emit('spr', { position: off(spot, 0, 0.25), n: 12, tile: TILE.star, c: ['#ffe5a1', '#ffffff', '#82ffc0'], sphere: true, speed: 1.8, size: 0.35, size2: 0.1, life: 0.8, drag: 1.5, rotv: 5 });
      sfx('ping');
    });
  },

  police: (emit, { at }) => {
    emit('video', { src: '/fx/police-crash.mp4', position: off(at, 0, -0.3), size: 2.8, rate: 1.4, from: 0.5, trim: 0.25 });
    emit('shake', { amount: 0.15 });
  },

  // A black hole looms over the victim and drinks it down, then slams shut with one deep VWOMP and leaves nothing
  dev: (emit, { at, victim, color, victimColor, sfx, later, seq }) => {
    const core = off(at, 0, 0.3);
    const base = ground(at);
    const c = color || DEV_RED;
    const v = victimColor || col(victim);
    const prey = [v.main, v.light, '#ffffff'];
    emit('hole', { position: core, size: 0.75, life: 1.56, grow: 0.6, shrink: 0.1, disk: 1.4, spin: 1.8, color: c });
    emit('warp', { position: base, size: 4.4, life: 1.55, amp: 0.04, width: 0.2, well: 0.7, glow: 0.3, color: c.main });
    emit('decal', { position: base, kind: 'vortex', color: c.main, size: 4.8, life: 1.5, spin: 7, grow: 0.15, add: true });
    for (let s = 0; s < 5; s++) {
      const a0 = (s / 5) * Math.PI * 2;
      const lift = 0.3 + (s % 3) * 0.35;
      seq(30, 40, (k) => {
        const r = 3.4 * (1 - k) ** 1.4 + 0.08;
        const a = a0 + k * k * 7;
        const p = [core[0] + Math.cos(a) * r, core[1] + lift * (1 - k) * Math.sin(k * 9 + s), core[2] + Math.sin(a) * r];
        emit('spr', { position: p, tile: TILE.glow, c: [prey[s % 3]], size: 0.42 * (1 - k * 0.6), size2: 0.05, life: 0.28, jitter: 0, a: 0.9 });
        emit('spr', { position: p, tile: TILE.streak, c: [c.light, '#ffffff'], size: 0.5, size2: 0.1, life: 0.18, rot: -a, jitter: 0 });
      }, 60 + s * 70);
    }
    seq(18, 70, () => emit('spr', { position: core, n: 6, tile: TILE.glow, c: prey.concat(c.light), radius: 3.8, inward: true, speed: 5.8, size: 0.3, size2: 0.04, life: 0.65, swirl: 6 }));
    seq(12, 110, (k) => emit('shake', { amount: 0.04 + k * 0.22 }));
    sfx('singularity');
    later(1500, () => {
      emit('warp', { position: base, size: 15, life: 1.4, amp: 0.34, width: 0.07, chroma: 0.6, glow: 0.2, color: c.main });
      emit('shake', { amount: 0.75 });
      sfx('vwomp');
    });
  },

};

const CLIPS = { police: '/fx/police-crash.mp4' };
export const warmKillFx = (itemId) => CLIPS[skinKey(itemId)] && videoFor(CLIPS[skinKey(itemId)]);

export const playKillFx = (itemId, info, { bus = fx, sfx = () => {} } = {}) => {
  (KILL_FX[skinKey(itemId)] || KILL_FX.pop)(bus.emit, { ...info, sfx, ...timeline(bus) });
};

export { KILL_FX };

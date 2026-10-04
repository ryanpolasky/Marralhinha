import { SEAT_COLORS } from '../game/geometry';
import { skinKey } from '../game/catalog';
import { fx } from './fx';
import { TILE } from './killfx';

const col = (s) => SEAT_COLORS[s];
const rand = (a, b) => a + Math.random() * (b - a);
const HUES = ['#ff5f5f', '#ffb35f', '#ffe94d', '#7bf1a8', '#5fb8ff', '#b36bff', '#ff4fd8'];
const NYAN = ['#ff3a3a', '#ff9a2e', '#ffe82e', '#4ddb4d', '#2e9bff', '#8a5bff'];
const PIXEL = ['#2fe6ff', '#ff4fd8', '#ffe94d', '#8a6bff'];
const snap = (v) => Math.round(v / 0.1) * 0.1;
const down = (p, dy = 0.15) => [p[0], Math.max(0.1, p[1] - dy), p[2]];

let tick = 0;

// Called every ~0.34 units of hop travel with info = { by, prev, n }, so keep each call cheap
const TRAILS = {
  // kicked-up dust
  dust: (emit, p) => {
    emit('spr', { position: down(p), n: 2, tile: TILE.smoke, c: ['#cbb79b', '#a4957f'], add: false, speed: 0.35, up: 0.4, size: 0.26, size2: 0.7, life: 0.55, a: 0.35, drag: 1.6 });
  },

  // gold star motes
  sparkle: (emit, p, { by }) => {
    emit('spr', { position: p, n: 2, tile: TILE.star, c: ['#ffe38a', '#ffffff', col(by).light], speed: 0.3, up: 0.3, size: 0.3, size2: 0.02, life: 0.7, grav: 0.15, drag: 1, flick: 20 });
  },

  // dark cinders popping off a smoulder
  ember: (emit, p) => {
    emit('spr', { position: p, n: 2, tile: TILE.flare, c: ['#ffb45a', '#ff7a2a'], c2: ['#5a1a08'], speed: 0.5, up: 1.4, uj: 0.8, size: 0.2, size2: 0.02, life: 0.8, grav: 0.5, drag: 0.5, flick: 30 });
    emit('spr', { position: down(p, 0.05), tile: TILE.smoke, c: ['#3a2a24', '#5a4a42'], add: false, speed: 0.2, up: 0.6, size: 0.2, size2: 0.6, life: 0.9, a: 0.4, drag: 1 });
  },

  // clumps of foam in assorted sizes
  bubbles: (emit, p) => {
    emit('spr', { position: p, n: 3, tile: TILE.bubble, c: ['#ffffff', '#ffd9f2', '#d9f0ff'], add: false, speed: 0.35, up: 0.5, uj: 0.5, size: 0.14, size2: 0.34, life: 1, grav: -0.1, drag: 0.7, a: 0.85, jitter: 0.12 });
  },

  // petals shed along the path
  petals: (emit, p) => {
    emit('spr', { position: p, tile: TILE.petal, c: ['#ff9ad5', '#ffc1e3', '#fff0f7'], add: false, speed: 0.3, up: 0.3, size: 0.26, size2: 0.2, life: 1.1, grav: 0.25, drag: 0.8, rotv: 3, fade: 0.7 });
  },

  // snowflakes drifting down through the hop
  snow: (emit, p) => {
    emit('spr', { position: [p[0], p[1] + 0.5, p[2]], n: 2, tile: TILE.star, c: ['#ffffff', '#dff1ff'], add: false, speed: 0.25, size: 0.16, size2: 0.1, life: 1, grav: 0.35, vel: [rand(-0.3, 0.3), -0.5, 0], drag: 0.4, a: 0.9 });
  },

  // tiny lightning arcs chaining back along the path
  sparks: (emit, p, { prev }) => {
    emit('spr', { position: p, tile: TILE.star, c: ['#9feaff', '#ffe94d'], size: 0.22, size2: 0, life: 0.4, flick: 45 });
    if (prev) emit('bolt', { from: prev, to: p, color: '#7fdcff', radius: 0.012, life: 0.14, jag: 0.1, branches: 0 });
  },

  // slow green fireflies that pulse as they drift
  wisp: (emit, p) => {
    emit('spr', { position: p, tile: TILE.glow, c: ['#d8ff7a', '#9bff9b'], size: 0.34, size2: 0.2, life: 1.6, speed: 0.2, up: 0.25, swirl: 1.8, drag: 0.5, flick: 8, a: 0.9 });
    emit('spr', { position: p, tile: TILE.flare, c: ['#ffffff'], size: 0.12, size2: 0, life: 1.2, speed: 0.15, up: 0.2, swirl: 1.8, flick: 8 });
  },

  // a flat six-band ribbon laid down behind the marble, with twinkling stars
  rainbow: (emit, p, { prev, n }) => {
    const from = prev || p;
    const len = Math.hypot(p[0] - from[0], p[2] - from[2]) || 1;
    const dx = (p[0] - from[0]) / len;
    const dz = (p[2] - from[2]) / len;
    const wave = n % 2 ? 0.045 : -0.045;
    const steps = Math.max(1, Math.round(len / 0.09));
    for (let k = 0; k < steps; k++) {
      const t = (k + 0.5) / steps;
      NYAN.forEach((c, i) => {
        const side = (i - 2.5) * 0.1 + wave;
        emit('spr', { position: [from[0] + (p[0] - from[0]) * t - dz * side, p[1], from[2] + (p[2] - from[2]) * t + dx * side], tile: TILE.square, c: [c], add: false, rot: 0, size: 0.26, size2: 0.26, life: 0.9, fade: 0.35, jitter: 0 });
      });
    }
    emit('spr', { position: [p[0], p[1] + 0.12, p[2]], tile: TILE.star, c: ['#ffffff', '#fff3a0'], radius: 0.3, speed: 0.1, size: 0.2, size2: 0.05, life: 0.6, flick: 24, rotv: 0 });
  },

  // proper phoenix fire licking off the marble
  flame: (emit, p) => {
    emit('spr', { position: p, n: 2, tile: TILE.flame, c: ['#fff3b0', '#ffd166', '#ff9a3c'], c2: ['#8a2a0a'], speed: 0.2, up: 1.2, uj: 0.6, size: 0.5, size2: 0.1, life: 0.6, grav: -0.3, drag: 0.8 });
  },

  // pixelated squares that dissolve mid-flight
  glitch: (emit, p) => {
    emit('spr', { position: p, n: 2, tile: TILE.square, c: ['#2fe6ff', '#ff4fd8', '#ffffff'], add: false, rot: 0, speed: 0.6, up: 0.5, size: 0.2, size2: 0.2, life: 0.5, flick: 50, drag: 1.5, fade: 0.4 });
  },

  // nebula motes orbiting the path with star glitter
  galaxy: (emit, p) => {
    emit('spr', { position: p, tile: TILE.glow, c: ['#b36bff', '#5fb8ff', '#ff4fd8'], size: 0.4, size2: 0.1, life: 0.9, swirl: 2.5, a: 0.7 });
    emit('spr', { position: p, tile: TILE.star, c: ['#ffffff', '#e3c9ff'], size: 0.2, size2: 0, life: 0.9, flick: 22, grav: -0.05 });
  },

  // icy tail streaks fanning out behind
  comet: (emit, p) => {
    emit('spr', { position: p, n: 2, tile: TILE.streak, c: ['#e8f7ff', '#bfe9ff'], size: 0.6, size2: 0.05, life: 0.5, speed: 0.3, a: 0.9 });
    emit('spr', { position: p, tile: TILE.glow, c: ['#8fd4ff'], size: 0.45, size2: 0, life: 0.7, a: 0.6 });
  },

  // expanding color rings, hue cycling along the path
  spectrum: (emit, p, { n }) => {
    const hue = HUES[n % HUES.length];
    emit('spr', { position: p, tile: TILE.ring, c: [hue], size: 0.1, size2: 0.9, life: 0.55, rot: 0 });
    emit('spr', { position: p, tile: TILE.flare, c: [hue, '#ffffff'], size: 0.3, size2: 0.05, life: 0.4 });
  },

  // seafoam ripples and drops
  supporter: (emit, p) => {
    emit('spr', { position: down(p, 0.05), tile: TILE.ring, c: ['#a7f3de', '#44b6ad'], size: 0.15, size2: 0.8, life: 0.8, rot: 0, a: 0.8 });
    emit('spr', { position: p, n: 2, tile: TILE.drop, c: ['#a7f3de', '#e0fff5', '#44b6ad'], speed: 0.4, up: 0.9, size: 0.2, size2: 0.12, life: 0.8, grav: 0.8, land: true, a: 0.9 });
  },

  // wisps and the occasional bat
  halloween: (emit, p, { n }) => {
    emit('spr', { position: p, tile: TILE.ghost, c: ['#d9ffe9', '#e2d4ff'], add: false, rot: 0, size: 0.45, size2: 0.55, life: 1.3, up: 0.45, uj: 0, a: 0.7, drag: 0.7, fade: 1.6, fadeIn: 0.35, jitter: 0 });
    if (n % 6 === 0) emit('spr', { position: p, tile: TILE.bat, c: ['#2a123a'], add: false, rot: 0, speed: 1.4, up: 1.2, size: 0.45, size2: 0.35, life: 1.2, grav: -0.2, swirl: 2, a: 0.9 });
  },

  // wire segments with a square handle at each hop
  beta: (emit, p, { prev }) => {
    emit('spr', { position: p, tile: TILE.square, c: ['#d6eeff', '#5fb8ff'], add: false, rot: 0, size: 0.2, size2: 0.2, life: 0.7, fade: 0.6 });
    if (prev) emit('bolt', { from: prev, to: p, color: '#5fb8ff', radius: 0.01, life: 0.5, jag: 0, branches: 0 });
  },

  // accretion: embers spiral in toward the marble and wink out
  dev: (emit, p) => {
    emit('spr', { position: p, n: 3, tile: TILE.glow, c: ['#ffd166', '#ff7a3c', '#ff4a5a'], radius: 0.55, inward: true, speed: 1.1, size: 0.24, size2: 0.04, life: 0.5, swirl: 4 });
    emit('spr', { position: p, tile: TILE.flare, c: ['#ffffff'], size: 0.22, size2: 0, life: 0.35 });
  },

  // chunky 8-bit confetti, dithered and quantized like the rest of the arcade set
  arcade: (emit, p, { n }) => {
    const at = [snap(p[0]), p[1], snap(p[2])];
    emit('spr', { position: at, n: 3, px: true, add: false, tile: TILE.square, c: PIXEL, rot: 0, speed: 0.5, up: 0.7, uj: 0.5, size: 0.3, size2: 0.2, life: 0.7, grav: 0.8, drag: 0.5, jitter: 0.1 });
    if (n % 3 === 0) emit('spr', { position: at, px: true, add: false, tile: TILE.star, c: ['#ffe94d', '#ffffff'], rot: 0, size: 0.5, size2: 0.3, life: 0.6, up: 0.4 });
  },
};

export const playTrail = (itemId, pos, info = {}, { emit = fx.emit } = {}) => {
  (TRAILS[skinKey(itemId)] || TRAILS.dust)(emit, pos, { ...info, n: tick++ });
};

export { TRAILS };

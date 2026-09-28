import * as THREE from 'three';
import { SEAT_COLORS } from '../game/geometry';
import { skinKey } from '../game/catalog';
import { makeCanvas, seeded, finish, makeWoodCanvas, makeFeltTexture, makeSwirlCanvas, finishMarble } from './textures';

const cache = new Map();
const cached = (key, build) => {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
};

const mix = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
const TAU = Math.PI * 2;

function wavyLine(ctx, { y0, amp, k, phase, width, color, alpha = 1, w = 512 }) {
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const y = y0 + Math.sin((x / w) * TAU * k + phase) * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function veins(ctx, rand, { count, color, width, alpha, w, h, steps = 40 }) {
  for (let i = 0; i < count; i++) {
    let x = rand() * w;
    let y = rand() * h;
    let angle = rand() * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      angle += (rand() - 0.5) * 0.9;
      x += Math.cos(angle) * 14;
      y += Math.sin(angle) * 14;
      ctx.lineTo(x, y);
    }
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (0.4 + rand());
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function stars(ctx, rand, { count, w, h, color = '#ffffff' }) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.3 + rand() * 0.7;
    ctx.fillStyle = color;
    const r = rand() < 0.08 ? 1.8 : 0.5 + rand() * 0.9;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function nebula(ctx, rand, { colors, count, w, h, alpha = 0.35 }) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 30 + rand() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colors[i % colors.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

const MARBLES = {
  classic: (c, seat) => ({ map: finishMarble(makeSwirlCanvas(c, 11 + seat * 7)), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 }),
  gloss: (c) => {
    const [canvas, ctx] = makeCanvas(256, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, c.dark);
    g.addColorStop(0.5, c.main);
    g.addColorStop(1, c.dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    return { map: finishMarble(canvas), roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02 };
  },
  clay: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(40 + seat);
    ctx.fillStyle = mix(c.main, '#8a7f76', 0.25);
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${rand() * 0.25})` : `rgba(0,0,0,${rand() * 0.3})`;
      ctx.fillRect(rand() * 512, rand() * 256, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
    return { map: finishMarble(canvas), roughness: 0.85, clearcoat: 0 };
  },
  stripes: (c) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    ctx.fillStyle = '#fff5ec';
    ctx.fillRect(0, 0, 512, 256);
    for (let i = -2; i < 10; i++) wavyLine(ctx, { y0: i * 34, amp: 26, k: 1, phase: 0, width: 17, color: i % 2 ? c.main : c.dark });
    return { map: finishMarble(canvas), roughness: 0.12, clearcoat: 1 };
  },
  pearl: (c) => ({
    color: mix(c.main, '#ffffff', 0.5),
    roughness: 0.22,
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [200, 650],
    sheen: 1,
    sheenColor: new THREE.Color(c.light),
  }),
  metal: (c) => ({ color: mix(c.main, '#ffffff', 0.15), metalness: 1, roughness: 0.14, envMapIntensity: 1.7 }),
  stone: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(70 + seat);
    ctx.fillStyle = mix(c.main, '#ffffff', 0.45);
    ctx.fillRect(0, 0, 512, 256);
    veins(ctx, rand, { count: 14, color: c.dark, width: 3, alpha: 0.7, w: 512, h: 256 });
    veins(ctx, rand, { count: 10, color: '#ffffff', width: 2, alpha: 0.6, w: 512, h: 256 });
    return { map: finishMarble(canvas), roughness: 0.25, clearcoat: 0.8 };
  },
  galaxy: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(90 + seat);
    ctx.fillStyle = '#070617';
    ctx.fillRect(0, 0, 512, 256);
    nebula(ctx, rand, { colors: [c.main, c.light, '#6a3cff'], count: 26, w: 512, h: 256 });
    stars(ctx, rand, { count: 420, w: 512, h: 256 });
    const tex = finishMarble(canvas);
    return { map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.08, clearcoat: 1 };
  },
  lava: (c, seat) => {
    const rand = seeded(110 + seat);
    const [rock, rctx] = makeCanvas(512, 256);
    rctx.fillStyle = '#1b110d';
    rctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 1800; i++) {
      rctx.fillStyle = `rgba(${rand() > 0.5 ? '70,50,40' : '0,0,0'},${rand() * 0.5})`;
      rctx.fillRect(rand() * 512, rand() * 256, 2 + rand() * 4, 2 + rand() * 4);
    }
    const [glow, gctx] = makeCanvas(512, 256);
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, 512, 256);
    [rctx, gctx].forEach((ctx, i) => {
      const r = seeded(120 + seat);
      ctx.shadowColor = c.light;
      ctx.shadowBlur = i ? 8 : 4;
      veins(ctx, r, { count: 16, color: i ? '#ffffff' : c.main, width: 4, alpha: 1, w: 512, h: 256, steps: 30 });
      ctx.shadowBlur = 0;
    });
    return {
      map: finishMarble(rock),
      emissiveMap: finishMarble(glow),
      emissive: c.light,
      emissiveIntensity: 1.6,
      roughness: 0.7,
      animate: (m, t) => (m.emissiveIntensity = 1.3 + Math.sin(t * 2.2 + seat) * 0.6),
    };
  },
  frost: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(130 + seat);
    ctx.fillStyle = mix(c.light, '#ffffff', 0.55);
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 70; i++) {
      const x = rand() * 512;
      const y = rand() * 256;
      const len = 10 + rand() * 30;
      ctx.strokeStyle = `rgba(255,255,255,${0.4 + rand() * 0.5})`;
      ctx.lineWidth = 1 + rand() * 1.5;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    return { map: finishMarble(canvas), roughness: 0.08, clearcoat: 1, iridescence: 0.5, transparent: true, opacity: 0.93 };
  },
  gold: (c, seat) => {
    const rand = seeded(150 + seat);
    const [canvas, ctx] = makeCanvas(512, 256);
    const [mr, mctx] = makeCanvas(512, 256);
    ctx.fillStyle = c.dark;
    ctx.fillRect(0, 0, 512, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, c.dark);
    g.addColorStop(0.5, c.main);
    g.addColorStop(1, c.dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    mctx.fillStyle = 'rgb(0,28,0)';
    mctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 90; i++) {
      const x = rand() * 512;
      const y = rand() * 256;
      const r = 4 + rand() * 14;
      const points = Array.from({ length: 5 + Math.floor(rand() * 3) }, (_, k) => {
        const a = (k / 6) * TAU + rand() * 0.6;
        const d = r * (0.5 + rand() * 0.6);
        return [x + Math.cos(a) * d, y + Math.sin(a) * d];
      });
      [
        [ctx, rand() > 0.5 ? '#f6cf5c' : '#e0a93a'],
        [mctx, 'rgb(0,70,255)'],
      ].forEach(([cx, fill]) => {
        cx.beginPath();
        points.forEach(([px, py], k) => (k ? cx.lineTo(px, py) : cx.moveTo(px, py)));
        cx.closePath();
        cx.fillStyle = fill;
        cx.fill();
      });
    }
    const metal = finishMarble(mr);
    metal.colorSpace = THREE.NoColorSpace;
    return { map: finishMarble(canvas), metalnessMap: metal, roughnessMap: metal, metalness: 1, roughness: 1, clearcoat: 1, envMapIntensity: 1.5 };
  },
  holo: (c) => ({
    color: mix(c.main, '#ffffff', 0.3),
    metalness: 0.55,
    roughness: 0.1,
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 2.1,
    iridescenceThicknessRange: [100, 900],
    envMapIntensity: 1.6,
  }),
  storm: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(170 + seat);
    ctx.fillStyle = mix(c.dark, '#000000', 0.45);
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 9; i++) {
      wavyLine(ctx, { y0: 20 + rand() * 216, amp: 20 + rand() * 50, k: 1 + Math.floor(rand() * 3), phase: rand() * TAU, width: 4 + rand() * 18, color: [c.main, c.light, '#ffffff'][i % 3], alpha: 0.35 + rand() * 0.5 });
    }
    const tex = finishMarble(canvas);
    return {
      map: tex,
      emissiveMap: tex,
      emissive: '#ffffff',
      emissiveIntensity: 0.6,
      roughness: 0.1,
      clearcoat: 1,
      animate: (m, t) => (tex.offset.x = (t * 0.07 + seat * 0.25) % 1),
    };
  },
};

export function marbleSkin(itemId, seat) {
  const key = MARBLES[skinKey(itemId)] ? skinKey(itemId) : 'classic';
  return cached(`marble:${key}:${seat}`, () => {
    const { animate, ...params } = MARBLES[key](SEAT_COLORS[seat], seat);
    const material = new THREE.MeshPhysicalMaterial({ metalness: 0, envMapIntensity: 1.3, ...params });
    return { material, animate: animate ? (t) => animate(material, t) : null };
  });
}

const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.24], [0.73, 0.24], [0.27, 0.5], [0.73, 0.5], [0.27, 0.76], [0.73, 0.76]],
};

const DICE = {
  ivory: { bg: '#fbf4e4', pip: '#23160b', one: '#c62828', roughness: 0.32 },
  ebony: { bg: '#1d1a18', pip: '#f5efe3', one: '#ff4b3e', roughness: 0.25 },
  ruby: { bg: '#b8182a', pip: '#ffffff', one: '#ffffff', roughness: 0.14, clearcoat: 1 },
  sky: { bg: '#3d9be0', pip: '#ffffff', one: '#ffffff', roughness: 0.2, clearcoat: 0.6 },
  wood: { bg: 'wood', pip: '#2b1608', one: '#2b1608', roughness: 0.6 },
  jade: { bg: 'jade', pip: '#f0fff4', one: '#f0fff4', roughness: 0.1, clearcoat: 1 },
  obsidian: { bg: '#121014', pip: '#f3c24f', one: '#f3c24f', roughness: 0.06, clearcoat: 1 },
  glow: { bg: '#10141a', pip: '#5dff9d', one: '#ff5dcf', roughness: 0.3, glow: 1.6 },
  gold: { bg: 'gold', pip: '#3b2400', one: '#3b2400', roughness: 0.22, metalness: 0.95 },
  galaxy: { bg: 'galaxy', pip: '#ffffff', one: '#ffd166', roughness: 0.12, clearcoat: 1, glow: 1.1 },
};

function dieBackground(ctx, style, size, value) {
  const rand = seeded(200 + value);
  if (style === 'wood') ctx.drawImage(makeWoodCanvas({ base: '#b9824a', grain: '80,40,15', seed: 30 + value, size: 256 }), 0, 0);
  else if (style === 'jade') {
    ctx.fillStyle = '#3a9a69';
    ctx.fillRect(0, 0, size, size);
    nebula(ctx, rand, { colors: ['#9fe8bf', '#1f6b45'], count: 14, w: size, h: size, alpha: 0.4 });
  } else if (style === 'gold') {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#fff0b0');
    g.addColorStop(0.5, '#e0b24a');
    g.addColorStop(1, '#a8741c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else if (style === 'galaxy') {
    ctx.fillStyle = '#0b0820';
    ctx.fillRect(0, 0, size, size);
    nebula(ctx, rand, { colors: ['#6a3cff', '#ff4fd8', '#2fd2ff'], count: 10, w: size, h: size });
    stars(ctx, rand, { count: 90, w: size, h: size });
  } else {
    ctx.fillStyle = style;
    ctx.fillRect(0, 0, size, size);
  }
}

function drawPips(ctx, value, size, color) {
  const r = value === 1 ? 30 : 21;
  PIPS[value].forEach(([x, y]) => {
    const g = ctx.createRadialGradient(x * size - 4, y * size - 5, 2, x * size, y * size, r);
    g.addColorStop(0, mix(color, '#ffffff', 0.3));
    g.addColorStop(1, mix(color, '#000000', 0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x * size, y * size, r, 0, TAU);
    ctx.fill();
  });
}

const DIE_FACE_ORDER = [2, 5, 1, 6, 3, 4];

export function diceSkin(itemId) {
  const key = DICE[skinKey(itemId)] ? skinKey(itemId) : 'ivory';
  return cached(`dice:${key}`, () => {
    const spec = DICE[key];
    return DIE_FACE_ORDER.map((value) => {
      const size = 256;
      const [canvas, ctx] = makeCanvas(size, size);
      dieBackground(ctx, spec.bg, size, value);
      drawPips(ctx, value, size, value === 1 ? spec.one : spec.pip);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      const params = { map, roughness: spec.roughness, metalness: spec.metalness || 0, clearcoat: spec.clearcoat || 0 };
      if (spec.glow) {
        const [glow, gctx] = makeCanvas(size, size);
        gctx.fillStyle = '#000';
        gctx.fillRect(0, 0, size, size);
        drawPips(gctx, value, size, value === 1 ? spec.one : spec.pip);
        Object.assign(params, { emissiveMap: new THREE.CanvasTexture(glow), emissive: '#ffffff', emissiveIntensity: spec.glow });
        params.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
      return new THREE.MeshPhysicalMaterial(params);
    });
  });
}

const WOODS = {
  oak: { base: '#c9894a', grain: '96,52,20', dish: '#a86a35', felt: '#1c4d44' },
  pine: { base: '#e3b97c', grain: '150,95,40', dish: '#c9955a', felt: '#27553a' },
  walnut: { base: '#6e4428', grain: '35,18,8', dish: '#553219', felt: '#1d3f4f' },
  cherry: { base: '#a8522f', grain: '70,25,10', dish: '#8a3f22', felt: '#3f1d2b' },
  driftwood: { base: '#b8b2a6', grain: '85,88,95', dish: '#9d978b', felt: '#1f3b4d' },
};

function bambooCanvas() {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rand = seeded(5);
  for (let x = 0; x < 1024; x += 64) {
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0, '#b9a95a');
    g.addColorStop(0.5, '#e4d58c');
    g.addColorStop(1, '#a8984c');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 64, 1024);
    for (let n = 0; n < 4; n++) {
      const y = (rand() * 1024) | 0;
      ctx.fillStyle = 'rgba(90,70,20,0.45)';
      ctx.fillRect(x, y, 64, 5);
    }
  }
  return canvas;
}

function azulejoCanvas() {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const T = 128;
  for (let ty = 0; ty < 8; ty++) {
    for (let tx = 0; tx < 8; tx++) {
      const x = tx * T;
      const y = ty * T;
      ctx.fillStyle = '#f4f1e8';
      ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = '#1f4f9a';
      ctx.fillStyle = '#2a63b8';
      ctx.lineWidth = 5;
      ctx.strokeRect(x + 6, y + 6, T - 12, T - 12);
      ctx.save();
      ctx.translate(x + T / 2, y + T / 2);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -26, 11, 24, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-44, -44, 16, 0, Math.PI / 2);
        ctx.lineTo(-44, -44);
        ctx.fill();
      }
      ctx.fillStyle = '#f4c542';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y, T, 2);
      ctx.fillRect(x, y, 2, T);
    }
  }
  return canvas;
}

function stoneCanvas({ base, vein, count, seed, dots = 0 }) {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.06})`;
    ctx.fillRect(rand() * 1024, rand() * 1024, 2 + rand() * 5, 2 + rand() * 5);
  }
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(rand() * 1024, rand() * 1024, 1 + rand() * 4, 0, TAU);
    ctx.fill();
  }
  veins(ctx, rand, { count, color: vein, width: 3, alpha: 0.55, w: 1024, h: 1024, steps: 70 });
  return canvas;
}

function neonCanvases() {
  const [base, bctx] = makeCanvas(1024, 1024);
  const [glow, gctx] = makeCanvas(1024, 1024);
  bctx.fillStyle = '#120a24';
  bctx.fillRect(0, 0, 1024, 1024);
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, 1024, 1024);
  [bctx, gctx].forEach((ctx) => {
    for (let i = 0; i <= 1024; i += 64) {
      ctx.fillStyle = i % 128 ? '#ff3fd2' : '#2fe6ff';
      ctx.globalAlpha = ctx === bctx ? 0.35 : 1;
      ctx.fillRect(i - 1, 0, 3, 1024);
      ctx.fillRect(0, i - 1, 1024, 3);
    }
    ctx.globalAlpha = 1;
  });
  return [base, glow];
}

const SPECIAL_BOARDS = {
  bamboo: () => ({ canvas: bambooCanvas(), repeat: 0.07, roughness: 0.45, dish: '#a8984c', felt: '#23443a', cup: '#3d3212' }),
  azulejo: () => ({ canvas: azulejoCanvas(), repeat: 0.11, roughness: 0.18, clearcoat: 1, dish: '#2a63b8', felt: '#102a4a', cup: '#16335e' }),
  basalt: () => ({ canvas: stoneCanvas({ base: '#2c2b2d', vein: '#4a4648', count: 6, seed: 9, dots: 900 }), repeat: 0.06, roughness: 0.92, dish: '#3a3638', felt: '#2b1d17', cup: '#0e0d0e' }),
  stone: () => ({ canvas: stoneCanvas({ base: '#ecebe8', vein: '#8d8d95', count: 26, seed: 21 }), repeat: 0.05, roughness: 0.14, clearcoat: 0.7, dish: '#d8d6d1', felt: '#233139', cup: '#5c5c62' }),
  lacquer: () => ({ color: '#121014', roughness: 0.12, clearcoat: 1, dish: '#1b1719', felt: '#4a0f16', cup: '#050405', accent: { color: '#ffcf5a', metalness: 1, roughness: 0.18 } }),
  neon: () => {
    const [base, glow] = neonCanvases();
    return { canvas: base, glowCanvas: glow, repeat: 0.06, roughness: 0.35, dish: '#1a0f33', felt: '#07061a', cup: '#05030c', accent: { color: '#2fe6ff', emissive: '#2fe6ff', emissiveIntensity: 1.4, roughness: 0.3 } };
  },
};

export function boardSkin(itemId) {
  const key = skinKey(itemId);
  const resolved = WOODS[key] || SPECIAL_BOARDS[key] ? key : 'oak';
  return cached(`board:${resolved}`, () => {
    const wood = WOODS[resolved];
    const spec = wood ? { canvas: makeWoodCanvas(wood), repeat: 0.055, roughness: 0.48, dish: wood.dish, felt: wood.felt, cup: '#3a220f' } : SPECIAL_BOARDS[resolved]();
    const boardParams = { roughness: spec.roughness, clearcoat: spec.clearcoat || 0, metalness: 0.02 };
    if (spec.canvas) {
      const map = finish(spec.canvas);
      map.repeat.set(spec.repeat, spec.repeat);
      boardParams.map = map;
    } else boardParams.color = spec.color;
    if (spec.glowCanvas) {
      const glow = finish(spec.glowCanvas);
      glow.repeat.set(spec.repeat, spec.repeat);
      Object.assign(boardParams, { emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0.9 });
    }
    const dishParams = { color: spec.dish, roughness: 0.5, clearcoat: spec.clearcoat || 0 };
    if (wood) {
      const dishMap = finish(makeWoodCanvas({ base: spec.dish, grain: '40,25,15', seed: 21 }));
      dishMap.repeat.set(0.2, 0.2);
      Object.assign(dishParams, { map: dishMap, color: '#ffffff' });
    }
    return {
      board: new THREE.MeshPhysicalMaterial(boardParams),
      dish: new THREE.MeshPhysicalMaterial(dishParams),
      cup: new THREE.MeshStandardMaterial({ color: spec.cup, roughness: 0.95, side: THREE.DoubleSide }),
      brass: new THREE.MeshStandardMaterial({ color: '#e0b05a', metalness: 0.85, roughness: 0.28, polygonOffset: true, polygonOffsetFactor: -2, ...(spec.accent || {}) }),
      felt: makeFeltTexture(spec.felt),
    };
  });
}

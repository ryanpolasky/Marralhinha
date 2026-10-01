import * as THREE from 'three';
import { SEAT_COLORS, rotate, layoutFor } from '../game/geometry';
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

const crisp = (tex) => {
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 1;
  return tex;
};

// 8-bit post step: 2px ordered dither plus a 6-level-per-channel palette, run on the final pixel color
const ARCADE_GLSL = `
float arcadeBayer(vec2 p) {
  p = mod(floor(p), 4.0);
  vec2 lo = mod(p, 2.0);
  vec2 hi = floor(p / 2.0);
  return (4.0 * mod(2.0 * lo.x + 3.0 * lo.y, 4.0) + mod(2.0 * hi.x + 3.0 * hi.y, 4.0)) / 16.0;
}
vec3 arcadeQuant(vec3 c) {
  float d = arcadeBayer(gl_FragCoord.xy * 0.5) - 0.5;
  return floor(clamp(c, 0.0, 1.0) * 5.0 + d * 0.85 + 0.5) / 5.0;
}`;
const ARCADE_POST = '#include <dithering_fragment>\ngl_FragColor.rgb = arcadeQuant(gl_FragColor.rgb);';

const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
const STAR = ['0001000', '0001000', '1111111', '0111110', '0011100', '0110110', '1100011'];
const COIN = ['00111100', '01111110', '11110011', '11110011', '11110011', '11110011', '01111110', '00111100'];

function pixelRows(ctx, rows, x0, y0, color) {
  ctx.fillStyle = color;
  rows.forEach((row, y) => [...row].forEach((bit, x) => bit === '1' && ctx.fillRect(x0 + x, y0 + y, 1, 1)));
}

function arcadeMarbleCanvases(c, seat) {
  const [base, bctx] = makeCanvas(64, 32);
  const [glow, gctx] = makeCanvas(64, 32);
  const rand = seeded(88 + seat);
  for (let y = 0; y < 32; y += 4) for (let x = 0; x < 64; x += 4) {
    bctx.fillStyle = (x + y) % 8 ? '#150a30' : '#1d1042';
    bctx.fillRect(x, y, 4, 4);
  }
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, 64, 32);
  for (let x = 0; x < 64; x++) {
    const y = 14 + Math.round(Math.sin((x / 64) * TAU * 2) * 5);
    [[-1, c.light], [0, c.main], [1, c.main], [2, c.dark]].forEach(([dy, color]) => {
      bctx.fillStyle = color;
      bctx.fillRect(x, y + dy, 1, 1);
    });
    gctx.fillStyle = c.light;
    gctx.fillRect(x, y - 1, 1, 1);
    gctx.fillStyle = c.main;
    gctx.fillRect(x, y, 1, 1);
  }
  [4, 36].forEach((x, i) => {
    [[bctx, '#150a30'], [gctx, '#000']].forEach(([ctx, bg]) => {
      ctx.fillStyle = bg;
      ctx.fillRect(x - 1, 9 + i * 2, 10, 10);
      pixelRows(ctx, i ? STAR : HEART, x + 1, 10 + i * 2, i ? '#ffe94d' : '#ffffff');
    });
  });
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rand() * 64);
    const y = Math.floor(rand() * 32);
    [bctx, gctx].forEach((ctx) => {
      ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#2fe6ff';
      ctx.fillRect(x, y, 1, 1);
    });
  }
  return [base, glow];
}

const MARBLES = {
  arcade: (c, seat) => {
    const [base, glow] = arcadeMarbleCanvases(c, seat);
    const map = crisp(finishMarble(base));
    const emissiveMap = crisp(finishMarble(glow));
    const uniforms = { uTime: { value: 0 }, uRim: { value: new THREE.Color(c.light) } };
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform vec3 uRim;\n${ARCADE_GLSL}`)
        .replace('#include <emissivemap_fragment>', `{
          vec2 uv = vEmissiveMapUv;
          vec3 lit = texture2D(emissiveMap, uv).rgb;
          float tick = floor(uTime * 6.0);
          float blink = mod(tick + floor(uv.x * 8.0), 4.0) < 1.0 ? 0.3 : 1.0;
          float scan = step(0.5, fract(uv.y * 16.0 - tick / 16.0));
          float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.0);
          totalEmissiveRadiance = lit * blink * (0.7 + 0.5 * scan) + uRim * floor(rim * 3.0) / 3.0 * 0.7;
        }`)
        .replace('#include <dithering_fragment>', ARCADE_POST);
    };
    return {
      map,
      emissiveMap,
      emissive: '#ffffff',
      emissiveIntensity: 1,
      roughness: 0.35,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      onBeforeCompile,
      customProgramCacheKey: () => 'marble-arcade-8bit',
      animate: (m, t) => (uniforms.uTime.value = reducedMotion?.matches ? 0 : t + seat * 0.7),
    };
  },
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
    ctx.fillStyle = mix(c.main, '#ffffff', 0.15);
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 18; i++) {
      const x = rand() * 512;
      const y = rand() * 256;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 40 + rand() * 90);
      const tone = i % 3 === 0 ? c.dark : i % 3 === 1 ? c.light : c.main;
      g.addColorStop(0, tone);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
    }
    ctx.globalAlpha = 1;
    veins(ctx, rand, { count: 14, color: c.dark, width: 3, alpha: 0.85, w: 512, h: 256 });
    veins(ctx, rand, { count: 7, color: '#ffffff', width: 1.4, alpha: 0.45, w: 512, h: 256 });
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
    const ice = mix(c.main, '#9fdcff', 0.14);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, mix(c.dark, '#0a2a44', 0.35));
    g.addColorStop(0.5, ice);
    g.addColorStop(1, mix(c.dark, '#0a2a44', 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 14; i++) {
      const x = rand() * 512;
      const y = 30 + rand() * 196;
      const r = 30 + rand() * 70;
      const color = i % 3 ? mix(c.dark, '#06243a', 0.3) : mix(c.main, '#bfe9ff', 0.45);
      [x - 512, x, x + 512].forEach((px) => {
        const blob = ctx.createRadialGradient(px, y, 0, px, y, r);
        blob.addColorStop(0, color);
        blob.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = blob;
        ctx.fillRect(px - r, y - r, r * 2, r * 2);
      });
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    const fern = (x, y, angle, len, depth) => {
      if (depth === 0 || len < 2) return;
      const x2 = x + Math.cos(angle) * len;
      const y2 = y + Math.sin(angle) * len;
      ctx.lineWidth = 0.6 + depth * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      for (let i = 1; i <= 3; i++) {
        const bx = x + ((x2 - x) * i) / 4;
        const by = y + ((y2 - y) * i) / 4;
        fern(bx, by, angle + 1.05, len * 0.42, depth - 1);
        fern(bx, by, angle - 1.05, len * 0.42, depth - 1);
      }
      fern(x2, y2, angle + (rand() - 0.5) * 0.4, len * 0.62, depth - 1);
    };
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(232, 248, 255, ${0.35 + rand() * 0.35})`;
      fern(40 + rand() * 432, 30 + rand() * 196, rand() * TAU, 20 + rand() * 22, 3);
    }
    veins(ctx, rand, { count: 6, color: '#e8f8ff', width: 1, alpha: 0.45, w: 512, h: 256, steps: 16 });
    stars(ctx, rand, { count: 120, w: 512, h: 256, color: '#f2fbff' });
    return { map: finishMarble(canvas), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.2, envMapIntensity: 1.2 };
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
  dots: (c) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    ctx.fillStyle = c.main;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#fff8ee';
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) {
        ctx.beginPath();
        ctx.arc(col * 64 + (row % 2) * 32, 22 + row * 42, 13, 0, TAU);
        ctx.fill();
      }
    }
    return { map: finishMarble(canvas), roughness: 0.1, clearcoat: 1 };
  },
  camo: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(180 + seat);
    ctx.fillStyle = mix(c.main, '#6b6a3a', 0.35);
    ctx.fillRect(0, 0, 512, 256);
    const tones = [c.dark, mix(c.main, '#2d2a1a', 0.5), mix(c.light, '#8a8a5a', 0.4), '#2b2a20'];
    for (let i = 0; i < 46; i++) {
      const x = rand() * 512;
      const y = rand() * 256;
      ctx.fillStyle = tones[i % tones.length];
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const r = 18 + rand() * 34;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7);
      }
      ctx.closePath();
      [-512, 0, 512].forEach((dx) => {
        ctx.save();
        ctx.translate(dx, 0);
        ctx.fill();
        ctx.restore();
      });
    }
    return { map: finishMarble(canvas), roughness: 0.65, clearcoat: 0.2 };
  },
  honey: (c) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const amber = mix(c.main, '#f0a020', 0.45);
    ctx.fillStyle = amber;
    ctx.fillRect(0, 0, 512, 256);
    const R = 22;
    const w = Math.sqrt(3) * R;
    ctx.strokeStyle = mix(c.dark, '#7a4a05', 0.5);
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    for (let row = -1; row < 8; row++) {
      for (let col = -1; col < 14; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0);
        const cy = row * R * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + Math.PI / 6;
          ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(255,220,120,${((row * 7 + col * 3) % 5) * 0.05})`;
        ctx.fill();
        ctx.stroke();
      }
    }
    return { map: finishMarble(canvas), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 };
  },
  tiger: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(190 + seat);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, c.dark);
    g.addColorStop(0.5, mix(c.main, '#c98a2a', 0.35));
    g.addColorStop(1, c.dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 16; i++) {
      wavyLine(ctx, { y0: 10 + i * 16 + rand() * 8, amp: 6 + rand() * 12, k: 2 + Math.floor(rand() * 3), phase: rand() * TAU, width: 3 + rand() * 9, color: i % 3 === 0 ? '#1a0f05' : i % 3 === 1 ? mix(c.light, '#ffd27a', 0.6) : c.dark, alpha: 0.55 + rand() * 0.4 });
    }
    return { map: finishMarble(canvas), roughness: 0.18, clearcoat: 0.9, sheen: 0.6, sheenColor: new THREE.Color('#ffd27a') };
  },
  bubble: (c) => ({
    color: mix(c.light, '#ffffff', 0.55),
    transparent: true,
    opacity: 0.58,
    roughness: 0,
    clearcoat: 1,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 720],
    envMapIntensity: 2,
    specularIntensity: 1,
    depthWrite: true,
  }),
  aurora: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const rand = seeded(210 + seat);
    ctx.fillStyle = '#060b1c';
    ctx.fillRect(0, 0, 512, 256);
    stars(ctx, rand, { count: 160, w: 512, h: 256 });
    ctx.globalCompositeOperation = 'lighter';
    const colors = ['#2fd2a0', c.main, '#6a3cff', '#2fe6ff', c.light];
    for (let i = 0; i < 12; i++) {
      wavyLine(ctx, { y0: 40 + rand() * 176, amp: 14 + rand() * 30, k: 1 + Math.floor(rand() * 2), phase: rand() * TAU, width: 22 + rand() * 40, color: colors[i % colors.length], alpha: 0.22 + rand() * 0.2 });
    }
    ctx.globalCompositeOperation = 'source-over';
    const tex = finishMarble(canvas);
    return { map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.75, roughness: 0.08, clearcoat: 1, animate: (m, t) => (tex.offset.x = (t * 0.035 + seat * 0.3) % 1) };
  },
  eye: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const [glow, gctx] = makeCanvas(512, 256);
    const rand = seeded(230 + seat);
    // Tinted sclera with seat-colored veins: even the "white" of the eye says whose marble it is
    ctx.fillStyle = mix(c.light, '#f3efe6', 0.55);
    ctx.fillRect(0, 0, 512, 256);
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, 512, 256);
    veins(ctx, rand, { count: 22, color: c.dark, width: 1.6, alpha: 0.5, w: 512, h: 256, steps: 24 });
    veins(ctx, rand, { count: 10, color: '#c94a4a', width: 1.1, alpha: 0.3, w: 512, h: 256, steps: 20 });
    // Two eyes, front and back, so the marble never rolls to a blank side
    const iris = 78;
    const cy = 128;
    [128, 384].forEach((cx) => {
      [ctx, gctx].forEach((x, i) => {
        const g = x.createRadialGradient(cx, cy, 8, cx, cy, iris);
        g.addColorStop(0, i ? c.light : mix(c.light, '#ffffff', 0.2));
        g.addColorStop(0.55, c.main);
        g.addColorStop(1, i ? '#000000' : c.dark);
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, iris, 0, TAU);
        x.fill();
      });
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, iris, 0, TAU);
      ctx.clip();
      for (let i = 0; i < 90; i++) {
        const a = rand() * TAU;
        ctx.strokeStyle = i % 4 ? mix(c.light, '#ffd27a', 0.5) : c.dark;
        ctx.globalAlpha = 0.25 + rand() * 0.5;
        ctx.lineWidth = 1 + rand() * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
        ctx.lineTo(cx + Math.cos(a) * (iris - 6), cy + Math.sin(a) * (iris - 6));
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#15080a';
      ctx.beginPath();
      ctx.arc(cx, cy, iris - 2, 0, TAU);
      ctx.stroke();
      [ctx, gctx].forEach((x) => {
        x.fillStyle = '#05030a';
        x.beginPath();
        x.ellipse(cx, cy, 11, 54, 0, 0, TAU);
        x.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(cx - 29, cy - 34, 10, 17, -0.5, 0, TAU);
      ctx.fill();
    });
    return {
      map: finishMarble(canvas),
      emissiveMap: finishMarble(glow),
      emissive: '#ffffff',
      emissiveIntensity: 0.5,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      animate: (m, t) => (m.emissiveIntensity = 0.45 + Math.max(0, Math.sin(t * 1.3 + seat)) ** 8 * 0.9),
    };
  },
  // The star takes the seat color, so yellow is literally the Sun and blue burns like a hot young star
  sol: (c, seat) => {
    const uniforms = {
      uTime: { value: 0 },
      uFlare: { value: 0 },
      uHot: { value: new THREE.Color(mix(c.light, '#fff6e0', 0.35)) },
      uMid: { value: new THREE.Color(c.main) },
      uCool: { value: new THREE.Color(mix(c.dark, '#000000', 0.4)) },
    };
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSolPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSolPosition = normalize(position);');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uFlare;
          uniform vec3 uHot;
          uniform vec3 uMid;
          uniform vec3 uCool;
          varying vec3 vSolPosition;
          vec3 solHash3(vec3 p) { p = fract(p * vec3(0.1031, 0.103, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
          float solNoise(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(mix(solHash3(i).x, solHash3(i + vec3(1.0, 0.0, 0.0)).x, f.x), mix(solHash3(i + vec3(0.0, 1.0, 0.0)).x, solHash3(i + vec3(1.0, 1.0, 0.0)).x, f.x), f.y),
              mix(mix(solHash3(i + vec3(0.0, 0.0, 1.0)).x, solHash3(i + vec3(1.0, 0.0, 1.0)).x, f.x), mix(solHash3(i + vec3(0.0, 1.0, 1.0)).x, solHash3(i + vec3(1.0, 1.0, 1.0)).x, f.x), f.y),
              f.z);
          }
          float solFbm(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) { v += a * solNoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
            return v;
          }
          vec2 solCells(vec3 p, float t) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            float f1 = 8.0;
            float f2 = 8.0;
            for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
              vec3 g = vec3(float(x), float(y), float(z));
              vec3 h = solHash3(i + g);
              float d = length(g + 0.5 + 0.38 * sin(t * (0.5 + h * 0.9) + h * 6.2831) - f);
              if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
            }
            return vec2(f1, f2);
          }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `{
            vec3 p = normalize(vSolPosition);
            float spin = uTime * (0.14 - 0.05 * p.y * p.y);
            vec3 q = vec3(cos(spin) * p.x - sin(spin) * p.z, p.y, sin(spin) * p.x + cos(spin) * p.z);
            float convect = solFbm(q * 2.4 + vec3(0.0, uTime * 0.025, 0.0));
            vec3 warped = q * 15.0 + (vec3(solFbm(q * 4.0), solFbm(q * 4.0 + 5.2), solFbm(q * 4.0 + 9.7)) - 0.5) * 1.6;
            vec2 cells = solCells(warped, uTime * 0.9);
            float gran = (1.0 - smoothstep(0.1, 0.95, cells.x)) * smoothstep(0.0, 0.4, cells.y - cells.x);
            gran = 0.5 + 0.5 * gran * (0.8 + 0.4 * solNoise(q * 34.0 + uTime * 0.4));
            float belt = 1.0 - smoothstep(0.12, 0.3, abs(abs(p.y) - 0.32));
            float region = solFbm(q * 3.2 + 7.3);
            float umbra = smoothstep(0.64, 0.69, region) * belt;
            float penumbra = smoothstep(0.57, 0.64, region) * belt;
            float faculae = smoothstep(0.5, 0.57, region) * (1.0 - penumbra) * belt;
            vec3 flareAt = normalize(vec3(0.55, 0.33, 0.77));
            float flare = exp(-dot(q - flareAt, q - flareAt) / 0.012) * uFlare;
            float facing = max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
            float limb = 0.3 + 0.7 * pow(facing, 0.9);
            float heat = gran * (0.55 + 0.75 * convect);
            heat = heat * (1.0 - penumbra * 0.45 - umbra * 0.5) + faculae * 0.18 + flare * 0.9;
            heat *= limb;
            vec3 col = mix(uCool, uMid, smoothstep(0.1, 0.6, heat));
            col = mix(col, uHot, smoothstep(0.85, 1.2, heat));
            float rim = pow(1.0 - facing, 3.5);
            float licks = solFbm(vec3(p.x * 5.0, p.y * 5.0 - uTime * 0.5, p.z * 5.0));
            diffuseColor.rgb = col * 0.08;
            totalEmissiveRadiance = col * (0.12 + heat * 0.95) + uHot * pow(facing, 5.0) * 0.18 + uMid * rim * (0.4 + licks * 1.2) * (1.0 + uFlare * 0.8);
          }`
        );
    };
    return {
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 1,
      roughness: 0.4,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15,
      onBeforeCompile,
      customProgramCacheKey: () => 'marble-sol-star',
      animate: (m, t) => {
        const frozen = reducedMotion?.matches;
        uniforms.uTime.value = frozen ? 0 : t + seat * 1.9;
        const phase = (t * 0.12 + seat * 0.3) % 1;
        uniforms.uFlare.value = frozen ? 0 : phase < 0.04 ? phase / 0.04 : Math.max(0, 1 - (phase - 0.04) / 0.35);
      },
    };
  },
  // Dev set: black obsidian glass cracked open, seat-colored light leaking out of every fissure (reads from any angle)
  dev: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const [glow, gctx] = makeCanvas(512, 256);
    const rand = seeded(250 + seat);
    ctx.fillStyle = '#0a0709';
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(255,74,90,${rand() * 0.05})`;
      ctx.fillRect(rand() * 512, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
    }
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, 512, 256);
    // Cracks wrap around the seam so the sphere has no bald side
    const crack = (x, alpha, width, color) => {
      x.lineCap = 'round';
      x.lineJoin = 'round';
      [-512, 0, 512].forEach((dx) => {
        const r = seeded(250 + seat);
        for (let i = 0; i < 9; i++) {
          let px = r() * 512 + dx;
          let py = 20 + r() * 216;
          let angle = r() * TAU;
          x.beginPath();
          x.moveTo(px, py);
          for (let s = 0; s < 26; s++) {
            angle += (r() - 0.5) * 1.1;
            px += Math.cos(angle) * 12;
            py += Math.sin(angle) * 7;
            x.lineTo(px, py);
          }
          x.globalAlpha = alpha * (0.6 + r() * 0.4);
          x.strokeStyle = color;
          x.lineWidth = width * (0.5 + r());
          x.stroke();
        }
      });
      x.globalAlpha = 1;
    };
    crack(ctx, 0.35, 9, '#ff4a5a');
    crack(ctx, 0.95, 2.6, c.light);
    crack(gctx, 0.45, 10, '#ff4a5a');
    crack(gctx, 1, 2.6, mix(c.light, '#ffffff', 0.35));
    const map = finishMarble(canvas);
    const emissiveMap = finishMarble(glow);
    emissiveMap.wrapT = THREE.RepeatWrapping;
    // Shader patch: light pulses race along the cracks, a slower layer of light drifts underneath
    // (fake depth), and an event-horizon rim in the seat color wraps the silhouette from every angle
    const uniforms = { uTime: { value: 0 }, uFlare: { value: 0 }, uRim: { value: new THREE.Color(mix(c.light, '#ff4a5a', 0.35)) } };
    const onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSingularityPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSingularityPosition = normalize(position);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFlare;\nuniform vec3 uRim;\nvarying vec3 vSingularityPosition;')
        .replace(
          '#include <emissivemap_fragment>',
          `{
            vec2 uv = vEmissiveMapUv;
            vec3 cracks = texture2D( emissiveMap, uv ).rgb;
            float p1 = pow( 0.5 + 0.5 * sin( ( uv.x * 3.0 - uv.y * 1.5 ) * 6.2831 - uTime * 2.4 ), 10.0 );
            float p2 = pow( 0.5 + 0.5 * sin( ( uv.x * 2.0 + uv.y * 2.5 ) * 6.2831 + uTime * 1.7 ), 12.0 );
            float pulse = 0.2 + 0.6 * max( p1, p2 );
            vec3 deep = texture2D( emissiveMap, vec2( uv.x + uTime * 0.08, uv.y + sin( uTime * 0.4 ) * 0.02 ) ).rgb;
            vec3 p = normalize(vSingularityPosition);
            float spin = uTime * 0.85;
            p.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p.xz;
            p.xy = mat2(0.8, -0.6, 0.6, 0.8) * p.xy;
            float angle = atan(p.z, p.x);
            float orbit = abs(p.y + 0.22 * sin(angle * 3.0 - uTime * 1.6));
            float band = 1.0 - smoothstep(0.035, 0.19, orbit);
            float core = 1.0 - smoothstep(0.008, 0.035, orbit);
            float crossOrbit = abs(p.x + 0.3 * sin(p.z * 4.0 + uTime * 1.3));
            float crossBand = 1.0 - smoothstep(0.025, 0.1, crossOrbit);
            float stream = 0.55 + 0.45 * sin(angle * 5.0 + uTime * 4.0);
            float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.2);
            vec3 energy = mix(uRim, vec3(1.0, 0.12, 0.025), 0.3 + 0.2 * sin(angle + uTime));
            diffuseColor.rgb = mix(vec3(0.008, 0.003, 0.015), energy * 0.12, band);
            totalEmissiveRadiance = cracks * pulse + deep * 0.12
              + energy * band * (0.9 + stream * 1.5)
              + vec3(1.0, 0.72, 0.3) * (core * 0.9 + crossBand * 0.65)
              + uRim * rim * (0.8 + uFlare * 0.45);
          }`
        );
    };
    return {
      map,
      emissiveMap,
      emissive: '#ffffff',
      emissiveIntensity: 1,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      onBeforeCompile,
      customProgramCacheKey: () => 'marble-dev-orbits',
      animate: (m, t) => {
        uniforms.uTime.value = t + seat * 1.9;
        // A flare every few seconds, sharp attack and slow decay
        const phase = (t * 0.45 + seat * 0.3) % 1;
        uniforms.uFlare.value = phase < 0.08 ? phase / 0.08 : Math.max(0, 1 - (phase - 0.08) / 0.3);
      },
    };
  },
  supporter: (c, seat) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    const [glow, gctx] = makeCanvas(512, 256);
    const rand = seeded(313 + seat);
    const water = ctx.createLinearGradient(0, 0, 0, 256);
    water.addColorStop(0, '#082d3c');
    water.addColorStop(0.5, mix(c.main, '#44b6ad', 0.55));
    water.addColorStop(1, '#082d3c');
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, 512, 256);
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 13; i++) {
      const line = { y0: i * 24 - 22, amp: 11 + rand() * 18, k: 1 + Math.floor(rand() * 2), phase: rand() * TAU, w: 512 };
      wavyLine(ctx, { ...line, width: 7 + rand() * 9, color: i % 3 ? c.light : '#e0fff5', alpha: 0.28 });
      wavyLine(gctx, { ...line, width: 2.5, color: i % 3 ? c.main : '#b9fff0', alpha: 0.65 });
    }
    for (let i = 0; i < 115; i++) {
      ctx.fillStyle = rand() > 0.6 ? 'rgba(241,255,246,0.6)' : 'rgba(152,236,215,0.35)';
      const x = rand() * 512;
      const y = rand() * 256;
      const radius = 0.4 + rand() * 1.5;
      for (const dx of [-512, 0, 512]) {
        ctx.beginPath();
        ctx.arc(x + dx, y, radius, 0, TAU);
        ctx.fill();
      }
    }
    const map = finishMarble(canvas);
    const emissiveMap = finishMarble(glow);
    const uniforms = { uTide: { value: 0 }, uTideColor: { value: new THREE.Color(c.light) } };
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTide;\nuniform vec3 uTideColor;')
        .replace('#include <emissivemap_fragment>', `{
          vec2 uv = vEmissiveMapUv;
          float tideU = uv.x * 6.28318530718;
          float ripple = sin(tideU * 2.0 - uTide);
          vec2 drift = vec2(uTide * 0.075, 0.018 * sin(tideU * 2.0 - uTide * 1.5));
          vec3 currents = texture2D(emissiveMap, uv + drift).rgb;
          float ribbon = pow(0.5 + 0.5 * sin(uv.y * 25.0 + ripple * 1.5 - uTide * 2.4), 12.0);
          float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 2.7);
          float sparkle = pow(max(sin(tideU * 5.0 + uv.y * 31.0 - uTide * 4.0), 0.0), 30.0) * ribbon;
          totalEmissiveRadiance = currents * (0.5 + ribbon * 1.3) + uTideColor * (ribbon * 0.3 + rim * 0.5 + sparkle * 0.25);
        }`);
    };
    return { map, emissiveMap, emissive: c.light, emissiveIntensity: 0.48, roughness: 0.09, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.36,
      onBeforeCompile, customProgramCacheKey: () => 'marble-supporter-tide',
      animate: (m, t) => { uniforms.uTide.value = reducedMotion?.matches ? 0 : t + seat * 1.7; } };
  },
  // Beta set: a blueprint glass sphere drafted in wireframe, with a seat-colored scan ring sweeping it
  beta: (c, seat) => {
    const W = 1024;
    const H = 512;
    const [canvas, ctx] = makeCanvas(W, H);
    const [glow, gctx] = makeCanvas(W, H);
    const rand = seeded(270 + seat);
    ctx.fillStyle = mix(c.main, '#123a7a', 0.55);
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = 40 + rand() * 120;
      const color = rand() > 0.5 ? mix(c.light, '#3f7fd0', 0.6) : mix(c.dark, '#0b2a5e', 0.5);
      [x - W, x, x + W].forEach((px) => softBlob(ctx, px, y, r, color, 0.2));
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= W; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, H);
      ctx.moveTo(0, i);
      ctx.lineTo(W, i);
      ctx.stroke();
    }
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, W, H);
    [ctx, gctx].forEach((x, i) => {
      x.strokeStyle = i ? '#d6eeff' : 'rgba(225,242,255,0.6)';
      x.fillStyle = x.strokeStyle;
      for (let m = 0; m < 16; m++) {
        x.lineWidth = m % 4 ? 2 : 3.5;
        x.setLineDash(m % 4 ? [] : [26, 8, 4, 8]);
        x.beginPath();
        x.moveTo(m * 64 + 0.5, 0);
        x.lineTo(m * 64 + 0.5, H);
        x.stroke();
      }
      for (let p = 1; p < 8; p++) {
        x.lineWidth = p === 4 ? 4 : 2;
        x.setLineDash(p === 4 ? [26, 8, 4, 8] : []);
        x.beginPath();
        x.moveTo(0, p * 64);
        x.lineTo(W, p * 64);
        x.stroke();
      }
      x.setLineDash([]);
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(70, 220);
      x.lineTo(186, 220);
      [[70, 1], [186, -1]].forEach(([ax, d]) => {
        x.moveTo(ax + d * 14, 214);
        x.lineTo(ax, 220);
        x.lineTo(ax + d * 14, 226);
      });
      x.stroke();
      x.textAlign = 'center';
      x.font = '700 26px Consolas, "Courier New", monospace';
      x.fillText('Ø16', 128, 210);
      x.font = '700 30px Consolas, "Courier New", monospace';
      x.fillText('PROTOTYPE', 640, 300);
      x.font = '600 20px Consolas, "Courier New", monospace';
      x.fillText('REV B', 640, 372);
      x.fillText('v0.1-beta', 384, 300);
    });
    const uniforms = { uTime: { value: 0 }, uScan: { value: new THREE.Color(c.light) } };
    const onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vProtoPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProtoPos = normalize(position);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uScan;\nvarying vec3 vProtoPos;')
        .replace('#include <emissivemap_fragment>', `{
          vec3 lines = texture2D(emissiveMap, vEmissiveMapUv).rgb;
          float d = normalize(vProtoPos).y - sin(uTime * 0.9) * 1.02;
          float band = exp(-d * d / 0.0025);
          float wake = exp(-d * d / 0.08);
          float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 2.6);
          totalEmissiveRadiance = lines * (0.28 + wake * 0.9 + band * 2.0) + uScan * band * 0.6 + vec3(0.5, 0.82, 1.0) * rim * 0.35;
        }`);
    };
    return {
      map: finishMarble(canvas),
      emissiveMap: finishMarble(glow),
      emissive: '#ffffff',
      emissiveIntensity: 1,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      onBeforeCompile,
      customProgramCacheKey: () => 'marble-beta-scan',
      animate: (m, t) => (uniforms.uTime.value = t + seat * 1.3),
    };
  },
};

export function marbleSkin(itemId, seat) {
  const key = MARBLES[skinKey(itemId)] ? skinKey(itemId) : 'classic';
  return cached(`marble:${key}:${seat}`, () => {
    const { animate, ...params } = MARBLES[key](SEAT_COLORS[seat], seat);
    const material = new THREE.MeshPhysicalMaterial({ metalness: 0, envMapIntensity: 1.3, ...params });
    return { material, animate: animate ? (t) => animate(material, key === 'dev' ? performance.now() / 1000 : t) : null };
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
  jade: { bg: 'jade', pip: '#0d3320', one: '#0d3320', roughness: 0.1, clearcoat: 1 },
  obsidian: { bg: '#121014', pip: '#f3c24f', one: '#f3c24f', roughness: 0.06, clearcoat: 1 },
  glow: { bg: '#10141a', pip: '#5dff9d', one: '#ff5dcf', roughness: 0.3, glow: 1.6 },
  gold: { bg: 'gold', pip: '#3b2400', one: '#3b2400', roughness: 0.22, metalness: 0.95 },
  galaxy: { bg: 'galaxy', pip: '#ffffff', one: '#ffd166', roughness: 0.12, clearcoat: 1, glow: 1.1 },
  mint: { bg: '#8fe3c4', pip: '#0f4d3a', one: '#ff6b8a', roughness: 0.18, clearcoat: 0.8 },
  lilac: { bg: '#b79cff', pip: '#2d1a5e', one: '#ffffff', roughness: 0.18, clearcoat: 0.8 },
  marble: { bg: 'marble', pip: '#2a2a30', one: '#b8182a', roughness: 0.1, clearcoat: 1 },
  copper: { bg: 'copper', pip: '#2b1a10', one: '#2b1a10', roughness: 0.3, metalness: 0.9 },
  lava: { bg: 'lava', pip: '#ffd27a', one: '#ffffff', roughness: 0.45, glow: 1.4 },
  candy: { bg: 'candy', pip: '#b8182a', one: '#1e7a4f', roughness: 0.08, clearcoat: 1 },
  holo: { bg: '#151b40', pip: '#0b1020', one: '#0b1020', roughness: 0.16, clearcoat: 1, extra: { metalness: 0.2, iridescence: 0.8, iridescenceIOR: 1.4, iridescenceThicknessRange: [160, 500], envMapIntensity: 1.2 } },
  dev: { bg: 'dev', pip: '#ff4a5a', one: '#ffd166', roughness: 0.06, clearcoat: 1, glow: 1.8 },
  beta: { bg: 'beta', pip: '#ffffff', one: '#ffd166', roughness: 0.3, clearcoat: 0.5 },
  supporter: { bg: 'supporter', pip: '#125058', one: '#125058', roughness: 0.14, metalness: 0.36, clearcoat: 1, extra: { iridescence: 0.26, envMapIntensity: 1.4 } },
  arcade: { bg: 'arcade', pip: '#ffe94d', one: '#ff4fd8', roughness: 0.4, clearcoat: 0.3 },
  lucky: { bg: 'lucky', pip: '#0e7a43', one: '#0e7a43', roughness: 0.32, metalness: 0.85, clearcoat: 1 },
};

const ANIMATED_DICE = ['dev', 'holo', 'lucky', 'supporter', 'arcade'];

function grid(ctx, size, step, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
}

function dieBackground(ctx, style, size, value) {
  const rand = seeded(200 + value);
  if (style === 'wood') ctx.drawImage(makeWoodCanvas({ base: '#b9824a', grain: '80,40,15', seed: 30 + value, size: 256 }), 0, 0);
  else if (style === 'jade') {
    ctx.fillStyle = '#2e7d54';
    ctx.fillRect(0, 0, size, size);
    nebula(ctx, rand, { colors: ['#7ccfa0', '#1b5c3a'], count: 14, w: size, h: size, alpha: 0.35 });
  } else if (style === 'marble') {
    ctx.fillStyle = '#efece6';
    ctx.fillRect(0, 0, size, size);
    veins(ctx, rand, { count: 7, color: '#8d8d95', width: 2.5, alpha: 0.6, w: size, h: size, steps: 30 });
    veins(ctx, rand, { count: 4, color: '#c8b98a', width: 1.5, alpha: 0.4, w: size, h: size, steps: 30 });
  } else if (style === 'copper') {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#f0b48a');
    g.addColorStop(0.5, '#b8652f');
    g.addColorStop(1, '#6e3a1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    nebula(ctx, rand, { colors: ['#3fa08a', '#1f6b60'], count: 5, w: size, h: size, alpha: 0.18 });
  } else if (style === 'lava') {
    ctx.fillStyle = '#1b110d';
    ctx.fillRect(0, 0, size, size);
    ctx.shadowColor = '#ff7a1a';
    ctx.shadowBlur = 10;
    veins(ctx, rand, { count: 9, color: '#ff8a3d', width: 3, alpha: 1, w: size, h: size, steps: 22 });
    ctx.shadowBlur = 0;
  } else if (style === 'candy') {
    ctx.fillStyle = '#fff6f0';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#e4283c';
    for (let i = -size; i < size * 2; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 22, 0);
      ctx.lineTo(i + 22 + size, size);
      ctx.lineTo(i + size, size);
      ctx.closePath();
      ctx.fill();
    }
  } else if (style === 'arcade') {
    const px = size / 32;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const ring = Math.min(x, y, 31 - x, 31 - y);
      const corner = (x < 4 || x > 27) && (y < 4 || y > 27);
      ctx.fillStyle = ring === 2 || ring === 3 ? (corner ? '#ff4fd8' : '#2fe6ff') : ring < 2 ? '#0a0520' : (x + y) % 2 ? '#140a2e' : '#1b0f40';
      ctx.fillRect(x * px, y * px, px, px);
    }
  } else if (style === 'dev') {
    // Obsidian with a thin molten frame; the pips do the glowing
    ctx.fillStyle = '#0a0709';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,74,90,${rand() * 0.05})`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 3, 1 + rand() * 3);
    }
    ctx.strokeStyle = 'rgba(255,74,90,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, size - 32, size - 32);
    ctx.strokeStyle = 'rgba(255,209,102,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 24, size - 48, size - 48);
  } else if (style === 'beta') {
    ctx.fillStyle = '#1b4fa0';
    ctx.fillRect(0, 0, size, size);
    grid(ctx, size, 16, 'rgba(255,255,255,0.14)');
    grid(ctx, size, 64, 'rgba(255,255,255,0.32)');
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(20, 20, size - 40, size - 40);
    ctx.setLineDash([]);
  } else if (style === 'supporter') {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#f6fff4');
    g.addColorStop(0.5, '#b7e5df');
    g.addColorStop(1, '#65979e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(9,58,67,0.62)';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    ctx.strokeStyle = 'rgba(247,255,242,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(17, 17, size - 34, size - 34);
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 + rand() * 0.35})`;
      ctx.fillRect(rand() * size, rand() * size, 0.5 + rand() * 1.4, 0.5 + rand() * 1.4);
    }
  } else if (style === 'lucky') {
    // Warmer, deeper gold than Solid Gold, packed with glitter flecks and a champagne inset border
    const g = ctx.createRadialGradient(size * 0.35, size * 0.3, 10, size * 0.5, size * 0.5, size * 0.75);
    g.addColorStop(0, '#fff3b8');
    g.addColorStop(0.45, '#f0b93a');
    g.addColorStop(0.8, '#b07512');
    g.addColorStop(1, '#7a4d08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
      const bright = rand();
      ctx.fillStyle = bright > 0.7 ? `rgba(255,255,240,${0.4 + rand() * 0.6})` : `rgba(${bright > 0.35 ? '255,214,110' : '120,70,5'},${0.25 + rand() * 0.45})`;
      const s = 0.8 + rand() * 1.8;
      ctx.fillRect(rand() * size, rand() * size, s, s);
    }
    ctx.strokeStyle = 'rgba(255,246,208,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, size - 28, size - 28);
    ctx.strokeStyle = 'rgba(122,77,8,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(21, 21, size - 42, size - 42);
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

function blockPips(ctx, value, size, color, lit = true) {
  const step = size / 32;
  const r = value === 1 ? 32 : 24;
  PIPS[value].forEach(([x, y]) => {
    const x0 = Math.round((x * size - r) / step) * step;
    const y0 = Math.round((y * size - r) / step) * step;
    const w = Math.round((r * 2) / step) * step;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, w, w);
    if (!lit) return;
    ctx.fillStyle = mix(color, '#ffffff', 0.55);
    ctx.fillRect(x0, y0, w, step);
    ctx.fillRect(x0, y0, step, w);
    ctx.fillStyle = mix(color, '#000000', 0.4);
    ctx.fillRect(x0, y0 + w - step, w, step);
    ctx.fillRect(x0 + w - step, y0, step, w);
  });
}

const DIE_FACE_ORDER = [2, 5, 1, 6, 3, 4];

export function diceSkin(itemId) {
  const key = DICE[skinKey(itemId)] ? skinKey(itemId) : 'ivory';
  return cached(`dice:${key}`, () => {
    const spec = DICE[key];
    const time = { value: 0 };
    return DIE_FACE_ORDER.map((value) => {
      const size = 256;
      const [canvas, ctx] = makeCanvas(size, size);
      dieBackground(ctx, spec.bg, size, value);
      (key === 'arcade' ? blockPips : drawPips)(ctx, value, size, value === 1 ? spec.one : spec.pip);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      if (key === 'arcade') crisp(map);
      const params = { map, roughness: spec.roughness, metalness: spec.metalness || 0, clearcoat: spec.clearcoat || 0, ...(spec.extra || {}) };
      if (spec.glow) {
        const [glow, gctx] = makeCanvas(size, size);
        gctx.fillStyle = '#000';
        gctx.fillRect(0, 0, size, size);
        drawPips(gctx, value, size, value === 1 ? spec.one : spec.pip);
        Object.assign(params, { emissiveMap: new THREE.CanvasTexture(glow), emissive: '#ffffff', emissiveIntensity: spec.glow });
        params.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
      if (ANIMATED_DICE.includes(key)) {
        const [mask, mctx] = makeCanvas(size, size);
        mctx.fillStyle = '#000';
        mctx.fillRect(0, 0, size, size);
        mctx.fillStyle = '#fff';
        if (key === 'arcade') blockPips(mctx, value, size, '#fff', false);
        else PIPS[value].forEach(([x, y]) => {
          mctx.beginPath();
          mctx.arc(x * size, y * size, value === 1 ? 30 : 21, 0, TAU);
          mctx.fill();
        });
        params.emissiveMap?.dispose();
        params.emissiveMap = new THREE.CanvasTexture(mask);
        params.emissive = '#ffffff';
        params.emissiveIntensity = 1;
      }
      const material = new THREE.MeshPhysicalMaterial(params);
      if (ANIMATED_DICE.includes(key)) {
        material.userData.skinTime = time;
        if (key === 'supporter' || key === 'arcade') material.userData.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        material.customProgramCacheKey = () => `dice-${key}-animated`;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uSkinTime = time;
          shader.uniforms.uFacePhase = { value: value * 0.73 };
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nuniform float uSkinTime;\nuniform float uFacePhase;${key === 'arcade' ? ARCADE_GLSL : ''}`)
            .replace('#include <dithering_fragment>', key === 'arcade' ? ARCADE_POST : '#include <dithering_fragment>')
            .replace('#include <emissivemap_fragment>', key === 'arcade' ? `{
              vec2 uv = vEmissiveMapUv;
              float pip = texture2D(emissiveMap, uv).r;
              vec2 p = uv - 0.5;
              float edge = max(abs(p.x), abs(p.y));
              float rail = step(abs(edge - 0.406), 0.031);
              float seg = floor((atan(p.y, p.x) / 6.283185 + 0.5) * 16.0);
              float chase = mod(seg - floor(uSkinTime * 8.0), 16.0) < 4.0 ? 1.0 : 0.0;
              vec3 pipColor = mod(floor(uSkinTime * 2.0 + uFacePhase), 2.0) < 1.0 ? vec3(1.0, 0.91, 0.3) : vec3(1.0, 1.0, 0.85);
              totalEmissiveRadiance = (1.0 - pip) * rail * mix(vec3(1.0, 0.31, 0.85) * 0.25, vec3(0.18, 0.9, 1.0) * 2.2, chase)
                + pip * pipColor * 0.9;
            }` : key === 'supporter' ? `{
              vec2 uv = vEmissiveMapUv;
              float pip = texture2D(emissiveMap, uv).r;
              vec2 p = uv - 0.5;
              float edge = max(abs(p.x), abs(p.y));
              float rail = 1.0 - smoothstep(0.008, 0.03, abs(edge - 0.428));
              float angle = atan(p.y, p.x);
              float runner = pow(0.5 + 0.5 * sin(angle * 2.0 - uSkinTime * 2.0 + uFacePhase), 9.0);
              float caustic = pow(0.5 + 0.5 * sin(uv.y * 19.0 + sin(uv.x * 13.0 - uSkinTime) - uSkinTime * 1.65 + uFacePhase), 14.0);
              float face = 1.0 - smoothstep(0.24, 0.37, edge);
              vec3 seaGlass = vec3(0.27, 0.88, 0.73);
              totalEmissiveRadiance = (1.0 - pip) * (seaGlass * rail * (0.25 + runner * 1.8)
                + vec3(0.74, 1.0, 0.89) * rail * runner * 0.4 + seaGlass * caustic * face * 0.28);
            }` : key === 'lucky' ? `{
              vec2 uv = vEmissiveMapUv;
              float pip = texture2D(emissiveMap, uv).r;
              vec2 g = uv * 42.0;
              vec2 cell = floor(g);
              vec2 local = fract(g) - 0.5;
              float h = fract(sin(dot(cell + uFacePhase * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
              float h2 = fract(h * 91.7);
              float twinkle = pow(max(sin(uSkinTime * (1.4 + h2 * 2.6) + h * 6.283185), 0.0), 16.0);
              float star = max(1.0 - smoothstep(0.0, 0.05, abs(local.x)) , 1.0 - smoothstep(0.0, 0.05, abs(local.y))) * (1.0 - smoothstep(0.1, 0.45, length(local)));
              float dotm = 1.0 - smoothstep(0.05, 0.2, length(local));
              float sparkle = step(0.86, h) * twinkle * max(star, dotm);
              float sweep = pow(0.5 + 0.5 * sin((uv.x + uv.y) * 3.0 - uSkinTime * 1.2 + uFacePhase), 24.0);
              totalEmissiveRadiance = (1.0 - pip) * (vec3(1.0, 0.9, 0.62) * sparkle * 2.4 + vec3(1.0, 0.78, 0.35) * sweep * 0.22)
                + pip * vec3(0.04, 0.5, 0.24) * (0.3 + 0.2 * sin(uSkinTime * 2.0 + uFacePhase));
            }` : key === 'dev' ? `{
              vec2 uv = vEmissiveMapUv;
              vec2 p = uv - 0.5;
              float pip = texture2D(emissiveMap, uv).r;
              float edge = max(abs(p.x), abs(p.y));
              float rail = 1.0 - smoothstep(0.006, 0.022, abs(edge - 0.423));
              float angle = atan(p.y, p.x);
              float runner = pow(0.5 + 0.5 * sin(angle * 2.0 - uSkinTime * 3.0 + uFacePhase), 6.0);
              float scan = pow(0.5 + 0.5 * sin(uv.y * 6.283185 - uSkinTime * 2.0 + uFacePhase), 18.0);
              vec2 cell = abs(fract(uv * 8.0) - 0.5);
              float circuit = (1.0 - smoothstep(0.025, 0.075, min(cell.x, cell.y))) * smoothstep(0.18, 0.32, edge);
              vec3 red = vec3(1.0, 0.028, 0.065);
              vec3 gold = vec3(1.0, 0.55, 0.13);
              diffuseColor.rgb = vec3(0.014, 0.004, 0.01);
              totalEmissiveRadiance = (1.0 - pip) * (red * rail * (0.4 + runner * 2.8)
                + gold * rail * runner * 1.5 + red * circuit * (0.07 + scan * 0.7))
                + pip * vec3(1.0, 0.72, 0.38) * 1.25;
            }` : `{
              vec2 uv = vEmissiveMapUv;
              float pip = texture2D(emissiveMap, uv).r;
              vec2 grid = uv * 3.0;
              vec2 cell = floor(grid);
              vec2 local = fract(grid);
              float triangle = step(local.x, local.y);
              float viewRim = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
              float hue = dot(cell, vec2(0.13, 0.19)) + triangle * 0.09 + uFacePhase * 0.11 + uSkinTime * 0.055 + viewRim * 0.2;
              vec3 spectrum = 0.5 + 0.5 * cos(6.283185 * (hue + vec3(0.0, 0.333333, 0.666667)));
              float facet = 0.55 + 0.3 * triangle + 0.15 * sin(uSkinTime + dot(cell, vec2(1.7, 2.3)));
              float seam = 1.0 - smoothstep(0.012, 0.04, abs(local.x - local.y));
              vec3 crystal = mix(spectrum, vec3(0.85, 0.92, 1.0), 0.12) * facet;
              diffuseColor.rgb = mix(crystal, vec3(0.006, 0.009, 0.018), pip);
              totalEmissiveRadiance = (1.0 - pip) * (crystal * 0.3 + spectrum * seam * 0.16);
            }`);
        };
      }
      return material;
    });
  });
}

export function animateDiceSkin(materials) {
  const time = materials[0]?.userData.skinTime;
  if (time) time.value = materials[0].userData.reducedMotion?.matches ? 0 : performance.now() / 1000;
}

const WOODS = {
  oak: { base: '#c9894a', grain: '96,52,20', dish: '#a86a35', felt: '#1c4d44' },
  pine: { base: '#e3b97c', grain: '150,95,40', dish: '#c9955a', felt: '#27553a' },
  walnut: { base: '#6e4428', grain: '35,18,8', dish: '#553219', felt: '#1d3f4f' },
  cherry: { base: '#a8522f', grain: '70,25,10', dish: '#8a3f22', felt: '#3f1d2b' },
  driftwood: { base: '#b8b2a6', grain: '85,88,95', dish: '#9d978b', felt: '#1f3b4d' },
  mahogany: { base: '#7a2e22', grain: '40,12,8', dish: '#5e2018', felt: '#1d3a2e' },
  ash: { base: '#d9cdb8', grain: '120,105,85', dish: '#bfb39e', felt: '#2b3d4a' },
};

function corkCanvas() {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rand = seeded(17);
  ctx.fillStyle = '#c9a26b';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() > 0.5 ? `rgba(120,80,35,${0.1 + rand() * 0.35})` : `rgba(240,215,160,${rand() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 1024, rand() * 1024, 2 + rand() * 9, 1.5 + rand() * 5, rand() * TAU, 0, TAU);
    ctx.fill();
  }
  return canvas;
}

function terrazzoCanvas() {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rand = seeded(23);
  ctx.fillStyle = '#34373b';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.07})`;
    ctx.fillRect(rand() * 1024, rand() * 1024, 2 + rand() * 4, 2 + rand() * 4);
  }
  // Muted chips on dark concrete so no seat color, especially yellow, can hide in the floor
  const chips = ['#b9b4aa', '#b9b4aa', '#8e949a', '#8e949a', '#17191c', '#17191c', '#9a5a46', '#5d7a80', '#7f7392'];
  for (let i = 0; i < 1100; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const r = 3 + rand() * rand() * 18;
    ctx.fillStyle = chips[Math.floor(rand() * chips.length)];
    ctx.globalAlpha = 0.55 + rand() * 0.35;
    ctx.beginPath();
    for (let k = 0; k < 5 + Math.floor(rand() * 3); k++) {
      const a = (k / 7) * TAU + rand() * 0.7;
      ctx.lineTo(x + Math.cos(a) * r * (0.5 + rand() * 0.6), y + Math.sin(a) * r * (0.5 + rand() * 0.6));
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function oceanCanvases() {
  const [base, bctx] = makeCanvas(1024, 1024);
  const [glow, gctx] = makeCanvas(1024, 1024);
  const rand = seeded(31);
  const g = bctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, '#0b3d6b');
  g.addColorStop(0.5, '#0d5c8a');
  g.addColorStop(1, '#083152');
  bctx.fillStyle = g;
  bctx.fillRect(0, 0, 1024, 1024);
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 40; i++) {
    const spec = { y0: rand() * 1024, amp: 20 + rand() * 60, k: 2 + Math.floor(rand() * 4), phase: rand() * TAU, width: 2 + rand() * 6, w: 1024 };
    wavyLine(bctx, { ...spec, color: '#8fe3ff', alpha: 0.18 + rand() * 0.25 });
    wavyLine(gctx, { ...spec, color: '#5fd0ff', alpha: 0.35 + rand() * 0.4 });
  }
  return [base, glow];
}

function auroraCanvases() {
  const [base, bctx] = makeCanvas(1024, 1024);
  const [glow, gctx] = makeCanvas(1024, 1024);
  const rand = seeded(37);
  bctx.fillStyle = '#070a1e';
  bctx.fillRect(0, 0, 1024, 1024);
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, 1024, 1024);
  stars(bctx, rand, { count: 900, w: 1024, h: 1024 });
  stars(gctx, seeded(37), { count: 900, w: 1024, h: 1024 });
  const colors = ['#2fd2a0', '#6a3cff', '#2fe6ff', '#b36bff', '#5dff9d'];
  [bctx, gctx].forEach((ctx, i) => {
    const r = seeded(41);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
      wavyLine(ctx, { y0: r() * 1024, amp: 40 + r() * 120, k: 1 + Math.floor(r() * 2), phase: r() * TAU, width: 60 + r() * 140, color: colors[k % colors.length], alpha: i ? 0.22 : 0.16, w: 1024 });
    }
    ctx.globalCompositeOperation = 'source-over';
  });
  return [base, glow];
}

// Both exclusive boards paint their art aligned to the board itself: canvas center is the center hole, one board unit is BOARD_R of the texture
const BOARD_R = 0.05;
const PLOT_CYCLE = 42;

function roundedCross(w, l, radius) {
  const corners = [[-w, -l], [w, -l], [w, -w], [l, -w], [l, w], [w, w], [w, l], [-w, l], [-w, w], [-l, w], [-l, -w], [-w, -w]];
  const pts = [];
  corners.forEach((p, i) => {
    const toward = (b) => {
      const len = Math.hypot(b[0] - p[0], b[1] - p[1]);
      return [p[0] + ((b[0] - p[0]) / len) * radius, p[1] + ((b[1] - p[1]) / len) * radius];
    };
    const a = toward(corners[(i + 11) % 12]);
    const b = toward(corners[(i + 1) % 12]);
    for (let s = 0; s <= 6; s++) {
      const u = s / 6;
      pts.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * p[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * p[1] + u * u * b[1]]);
    }
  });
  return [...pts, pts[0]];
}

function circlePts(cx, cy, r, a0 = 0, a1 = TAU) {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 0.04));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

function tracePath(ctx, pts, S, R) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(S / 2 + x * R * S, S / 2 + y * R * S) : ctx.moveTo(S / 2 + x * R * S, S / 2 + y * R * S)));
}

function softBlob(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// Only the nebula lives in the canvas; the shader does the lensing, disk, stars and everything that moves
function horizonCanvas() {
  const S = 1024;
  const k = BOARD_R * S;
  const C = S / 2;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(61);
  ctx.fillStyle = '#060102';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) softBlob(ctx, rand() * S, rand() * S, (2 + rand() * 4) * k, ['#4e0c10', '#2a0608', '#5a1408', '#3a0a12'][i % 4], 0.35);
  [0, Math.PI].forEach((offset) => {
    for (let s = 0; s < 260; s++) {
      const u = s / 260;
      const rr = 0.8 + u * 10;
      const ang = offset + Math.log(rr / 0.8) * 2.1 + (rand() - 0.5) * 0.5;
      const spread = (rand() - 0.5) * rr * 0.18;
      const x = C + (Math.cos(ang) * rr - Math.sin(ang) * spread) * k;
      const y = C + (Math.sin(ang) * rr + Math.cos(ang) * spread) * k;
      const palette = u < 0.12 ? ['#ff9a4a', '#ff4a3a'] : u < 0.4 ? ['#e0302a', '#b8141e', '#ff6a3a'] : ['#c0202a', '#8a1018', '#d8402a', '#6a0a14'];
      softBlob(ctx, x, y, (0.35 + rand() * 0.9) * (0.6 + u) * k, palette[s % palette.length], 0.2 * (1 - u * 0.55));
    }
  });
  ctx.globalCompositeOperation = 'source-over';
  [0, Math.PI].forEach((offset) => {
    for (let s = 0; s < 140; s++) {
      const u = s / 140;
      const rr = 1 + u * 9;
      const ang = offset + 0.42 + Math.log(rr / 0.8) * 2.1 + (rand() - 0.5) * 0.25;
      softBlob(ctx, C + Math.cos(ang) * rr * k, C + Math.sin(ang) * rr * k, (0.2 + rand() * 0.5) * (0.5 + u) * k, '#020106', 0.55);
    }
  });
  ctx.globalCompositeOperation = 'lighter';
  softBlob(ctx, C, C, 3 * k, '#ff6a2a', 0.22);
  softBlob(ctx, C, C, 1.3 * k, '#ffc890', 0.3);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.7 ? '255,200,170' : '170,190,255'},${rand() * 0.35})`;
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

// Data texture, read premultiplied: red is a halo around each track hole, green its place in the lap, blue the hull line and constellations
function horizonData(layout) {
  const S = 1024;
  const k = BOARD_R * S;
  const [canvas, ctx] = makeCanvas(S, S);
  const px = (x, y) => [S / 2 + x * k, S / 2 + y * k];
  layout.RING.forEach(([r, c], i) => {
    const [x, y] = px(c, r);
    const color = `255,${Math.round((i / layout.RING.length) * 255)},0`;
    const g = ctx.createRadialGradient(x, y, 0.36 * k, x, y, 0.52 * k);
    g.addColorStop(0, `rgba(${color},1)`);
    g.addColorStop(0.3, `rgba(${color},0.8)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 0.52 * k, 0, TAU);
    ctx.fill();
  });
  const { halfWidth: W, halfLength: L, homeRows } = layout.spec;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  [[0.16, 0.22], [0.05, 0.9]].forEach(([width, alpha]) => {
    ctx.strokeStyle = `rgba(0,0,255,${alpha})`;
    ctx.lineWidth = width * k;
    tracePath(ctx, roundedCross(W - 0.15, L - 0.15, 0.5), S, BOARD_R);
    ctx.stroke();
  });
  const rand = seeded(83);
  const lo = Math.min(...homeRows) - 0.3;
  const hi = L - 1.25;
  for (let seat = 0; seat < 4; seat++) {
    [1, -1].forEach((side) => {
      const n = 4 + Math.floor(rand() * 3);
      const pts = Array.from({ length: n }, (_, i) => {
        const [r, c] = rotate([lo + ((i + 0.2 + rand() * 0.6) / n) * (hi - lo), side * (0.75 + rand() * 0.65)], seat);
        return px(c, r);
      });
      ctx.strokeStyle = 'rgba(0,0,255,0.45)';
      ctx.lineWidth = 0.025 * k;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,255,1)';
      pts.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, y, (0.035 + (i % 3) * 0.015) * k, 0, TAU);
        ctx.fill();
      });
    });
  }
  return canvas;
}

function horizonDish(layout) {
  const S = 512;
  const { dishR, baseOffsets } = layout.spec;
  const R = 0.5 / (dishR + 0.1);
  const k = R * S;
  const C = S / 2;
  const [base, bctx] = makeCanvas(S, S);
  const [glow, gctx] = makeCanvas(S, S);
  const rand = seeded(97);
  bctx.fillStyle = '#080203';
  bctx.fillRect(0, 0, S, S);
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, S, S);
  bctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) softBlob(bctx, C + (rand() - 0.5) * 2 * dishR * k, C + (rand() - 0.5) * 2 * dishR * k, (0.5 + rand()) * k, ['#581418', '#3a0a0c', '#5a1a0a'][i % 3], 0.45);
  bctx.globalCompositeOperation = 'source-over';
  stars(bctx, seeded(98), { count: 260, w: S, h: S });
  stars(gctx, seeded(98), { count: 260, w: S, h: S });
  const orbit = Math.max(...baseOffsets.map(([a, b]) => Math.hypot(a, b)));
  const orbits = [[orbit, 0.5, [10, 7], 0.8, '#ffd08a'], [orbit * 0.5, 0.3, [3, 6], 3.4, '#ff8a6a'], [dishR - 0.35, 0.22, [10, 7], 5.1, '#8fd8ff']];
  orbits.forEach(([r, alpha, dash, a, color]) => {
    [bctx, gctx].forEach((ctx) => {
      ctx.strokeStyle = `rgba(255,120,100,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.arc(C, C, r * k, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      softBlob(ctx, C + Math.cos(a) * r * k, C + Math.sin(a) * r * k, 0.14 * k, color, 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(C + Math.cos(a) * r * k, C + Math.sin(a) * r * k, 0.035 * k, 0, TAU);
      ctx.fill();
    });
  });
  return [base, glow, R];
}

function spaceFeltCanvas() {
  const S = 1024;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(73);
  ctx.fillStyle = '#070102';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 80 + rand() * 220;
    const color = ['#3a0a0c', '#220406', '#3a1006'][i % 3];
    [-S, 0, S].forEach((dx) => [-S, 0, S].forEach((dy) => softBlob(ctx, x + dx, y + dy, r, color, 0.3)));
  }
  ctx.globalCompositeOperation = 'source-over';
  stars(ctx, rand, { count: 1600, w: S, h: S });
  return canvas;
}

const SKIN_NOISE_GLSL = `
float skHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 skHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float skHash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float skNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(skHash3(i), skHash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(skHash3(i + vec3(0.0, 1.0, 0.0)), skHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(skHash3(i + vec3(0.0, 0.0, 1.0)), skHash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(skHash3(i + vec3(0.0, 1.0, 1.0)), skHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float skFbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * skNoise3(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec2 skRot(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec3 skStars(vec2 p, float scale, float density, float t, float spikes) {
  vec2 g = p * scale;
  float px = fwidth(g.x) * 0.7;
  vec2 id = floor(g);
  float h = skHash(id + scale * 3.1);
  vec2 d = fract(g) - 0.5 - (skHash2(id + scale * 1.7) - 0.5) * 0.6;
  float h2 = fract(h * 113.7);
  float size = mix(0.03, 0.08, h2 * h2);
  float s = max(size, px);
  float core = exp(-dot(d, d) / (s * s)) * (size * size) / (s * s);
  float w = max(0.01, px);
  float spike = spikes * (exp(-abs(d.x) / w) + exp(-abs(d.y) / w)) * exp(-length(d) * 6.0) * h2;
  float tw = 0.6 + 0.4 * sin(t * (0.7 + h2 * 3.0) + h * 40.0);
  vec3 tint = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.82, 0.62), fract(h * 57.3));
  return tint * (core * 1.6 + spike * 0.45) * tw * step(h, density);
}
`;

// Nebula infall uses two crossfaded flow phases so the spiral never winds itself into noise
const HORIZON_SHADER = `{
  vec2 uvB = vEmissiveMapUv;
  vec2 q = (uvB - 0.5) / ${BOARD_R};
  float t = uSkinTime;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float top = smoothstep(0.6, 0.95, vSkinTop);
  float gwT = mod(t, 11.0);
  float gw = exp(-pow((r - 0.55 - gwT * 2.6) / 0.45, 2.0)) * exp(-gwT * 0.3);
  float lens = 1.15 / max(r * r, 0.16) * (1.0 - smoothstep(5.0, 10.0, r));
  vec2 ql = q * (1.0 - lens) + q / max(r, 0.001) * gw * 0.07;
  float mag = clamp(1.0 / abs(1.0 - lens * lens), 1.0, 3.5);
  float inflow = 1.0 - smoothstep(1.0, 8.0, r);
  float f1 = fract(t / 9.0);
  float f2 = fract(t / 9.0 + 0.5);
  float w1 = 1.0 - abs(2.0 * f1 - 1.0);
  float spin = 1.1 * inflow / max(r * 0.35, 0.3);
  vec2 n1 = skRot(ql, -f1 * spin) * (1.0 + f1 * 0.22 * inflow);
  vec2 n2 = skRot(ql, -f2 * spin) * (1.0 + f2 * 0.22 * inflow);
  vec3 neb = mix(texture2D(map, 0.5 + n2 * ${BOARD_R}).rgb, texture2D(map, 0.5 + n1 * ${BOARD_R}).rgb, w1);
  vec3 stars = skStars(ql, 2.4, 0.6, t, 0.0) * 0.5 + skStars(ql + 13.7, 0.95, 0.4, t, 0.0) * 0.9 + skStars(ql + 41.3, 0.32, 0.3, t, 1.0) * 1.4;
  stars *= mag * (1.0 + gw * 1.5);
  vec3 disk = vec3(0.0);
  if (r < 3.0) {
    float d1 = fract(t / 5.0);
    float d2 = fract(t / 5.0 + 0.5);
    float dw = 1.0 - abs(2.0 * d1 - 1.0);
    float omega = 5.75 / pow(max(r, 0.55), 1.5);
    float a1 = ang - omega * d1;
    float a2 = ang - omega * d2;
    float s1 = skFbm3(vec3(cos(a1) * 2.2, sin(a1) * 2.2, r * 7.0));
    float s2 = skFbm3(vec3(cos(a2) * 2.2, sin(a2) * 2.2, r * 7.0 + 3.7));
    float n = pow(clamp((mix(s2, s1, dw) - 0.3) * 2.4, 0.0, 1.0), 2.0);
    float lanes = 0.85 + 0.15 * sin(r * 22.0 + n * 6.0);
    float heat = clamp(1.0 - (r - 0.6) / 2.1, 0.0, 1.0);
    vec3 col = mix(vec3(0.45, 0.02, 0.04), vec3(0.9, 0.08, 0.08), smoothstep(0.0, 0.45, heat));
    col = mix(col, vec3(1.0, 0.36, 0.06), smoothstep(0.4, 0.78, heat));
    col = mix(col, vec3(1.0, 0.86, 0.62), smoothstep(0.8, 1.0, heat));
    float body = smoothstep(0.56, 0.72, r) * (1.0 - smoothstep(1.2, 2.8, r));
    disk = col * body * (0.06 + n * 3.2) * lanes * (0.7 + 0.5 * sin(ang + 0.8));
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float rr = 0.78 + fi * 0.36;
      float da = mod(ang - t * 1.15 / pow(rr, 1.5) - fi * 2.1 + 3.14159265, 6.2831853) - 3.14159265;
      float spread = da < 0.0 ? 0.6 : 0.12;
      disk += vec3(1.0, 0.78, 0.5) * exp(-pow((r - rr) / 0.05, 2.0)) * exp(-pow(da * rr / spread, 2.0)) * 1.4;
    }
    disk += vec3(1.0, 0.9, 0.75) * exp(-pow((r - 0.62) / 0.025, 2.0)) * (1.3 + 0.4 * sin(t * 3.0 + ang * 2.0));
  }
  vec4 dat = texture2D(emissiveMap, uvB);
  vec3 dd = dat.rgb / max(dat.a, 0.001);
  float age = fract(t / 16.0 - dd.g);
  float trail = pow(1.0 - age, 10.0);
  float head = pow(1.0 - age, 90.0);
  vec3 halo = vec3(1.0, 0.22, 0.18) * 0.16 * (0.75 + 0.25 * sin(t * 1.7 + dd.g * 120.0))
    + mix(vec3(0.95, 0.16, 0.1), vec3(1.0, 0.62, 0.25), trail) * trail * 1.1
    + vec3(1.0, 0.92, 0.8) * head * 2.0;
  float sheen = pow(0.5 + 0.5 * sin(ang * 3.0 - t * 0.7 + r * 0.6), 6.0);
  vec3 hull = vec3(1.0, 0.35, 0.28) * (0.22 + 0.55 * sheen + gw * 0.9);
  vec3 meteors = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float period = 7.0 + fi * 4.0;
    float tt = t + fi * 3.1;
    float cyc = floor(tt / period);
    float prog = (tt - cyc * period) / 1.4;
    if (prog < 1.0) {
      float a = skHash(vec2(cyc, fi * 7.13 + 1.0)) * 6.2831853;
      vec2 dirM = vec2(cos(a), sin(a));
      vec2 rel = ql - ((skHash2(vec2(fi + 3.7, cyc)) - 0.5) * 12.0 - dirM * 4.0 + dirM * prog * 10.0);
      float along = dot(rel, dirM);
      float across = dot(rel, vec2(-dirM.y, dirM.x));
      float streak = step(along, 0.0) * max(0.0, 1.0 + along / 2.2);
      meteors += vec3(0.85, 0.9, 1.0) * (streak * streak * exp(-pow(across / 0.03, 2.0)) + exp(-dot(rel, rel) / 0.004) * 1.5) * sin(prog * 3.14159265) * 1.4;
    }
  }
  float shadow = smoothstep(0.5, 0.6, r);
  vec3 em = (neb * (0.8 + gw * 0.6) + stars + meteors) * shadow + disk + vec3(1.0, 0.25, 0.2) * gw * 0.1
    + halo * dat.a * dd.r + hull * dat.a * dd.b;
  diffuseColor.rgb = mix(vec3(0.02, 0.004, 0.006), neb * 0.2 * shadow, top);
  totalEmissiveRadiance = mix(vec3(0.05, 0.01, 0.012), em, top);
}`;

// Each stroke stores when it gets inked (16 bits over green/blue, red is ink weight) so the shader can replay the plot
function makePlotter() {
  const items = [];
  return {
    items,
    path: (target, pts, opts = {}) => items.push({ target, pts, w: 0.016, level: 1, ...opts }),
    text: (target, str, at, opts = {}) => items.push({ target, str, at, size: 0.09, angle: 0, level: 1, ...opts }),
  };
}

const pathLength = (pts) => pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
const textEnd = ({ str, at, size, angle }) => [at[0] + Math.cos(angle) * str.length * size * 0.55, at[1] + Math.sin(angle) * str.length * size * 0.55];

function schedulePlot(items) {
  let cost = 0;
  let prev = null;
  items.forEach((item) => {
    const start = item.str ? item.at : item.pts[0];
    if (prev) cost += prev.target === item.target ? Math.hypot(start[0] - prev.end[0], start[1] - prev.end[1]) * 0.1 : 2;
    item.len = item.str ? item.str.length * 0.16 : pathLength(item.pts);
    item.t0 = cost;
    cost += item.len;
    prev = { target: item.target, end: item.str ? textEnd(item) : item.pts[item.pts.length - 1] };
  });
  const scale = 0.95 / cost;
  const keys = [];
  items.forEach((item) => {
    item.t0 *= scale;
    item.span = item.len * scale;
    const pts = item.str ? [item.at, textEnd(item)] : item.pts;
    const total = item.str ? 1 : item.len || 1;
    let acc = 0;
    pts.forEach((p, i) => {
      if (i) acc += item.str ? 1 : Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      keys.push({ t: item.t0 + (acc / total) * item.span, x: p[0], y: p[1], target: item.target });
    });
  });
  return keys;
}

function penAt(keys, phase, pens) {
  Object.values(pens).forEach((pen) => (pen.value.z = 0));
  if (phase < keys[0].t || phase >= keys[keys.length - 1].t) return;
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= phase) lo = mid;
    else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  if (a.target !== b.target) return;
  const u = b.t > a.t ? (phase - a.t) / (b.t - a.t) : 0;
  pens[a.target].value.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 1);
}

const plotColor = (level, t) => {
  const v = Math.min(65535, Math.max(0, Math.round(t * 65535)));
  return `rgb(${Math.round(level * 255)},${v >> 8},${v & 255})`;
};
const PLOT_FONT = 'Consolas, "Courier New", monospace';

function renderPlot(ctx, items, target, S, R) {
  const k = R * S;
  const px = ([x, y]) => [S / 2 + x * k, S / 2 + y * k];
  ctx.lineCap = 'round';
  items.filter((item) => item.target === target).forEach((item) => {
    if (item.str) {
      ctx.save();
      ctx.translate(...px(item.at));
      ctx.rotate(item.angle);
      ctx.font = `600 ${item.size * k}px ${PLOT_FONT}`;
      const width = ctx.measureText(item.str).width || 1;
      let off = 0;
      [...item.str].forEach((ch) => {
        ctx.fillStyle = plotColor(item.level, item.t0 + (off / width) * item.span);
        ctx.fillText(ch, off, 0);
        off += ctx.measureText(ch).width;
      });
      ctx.restore();
      return;
    }
    ctx.lineWidth = item.w * k;
    const period = item.dash ? item.dash.reduce((a, b) => a + b, 0) : 0;
    let acc = 0;
    item.pts.forEach((p, i) => {
      if (!i) return;
      const q = item.pts[i - 1];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      const n = Math.max(1, Math.ceil(d / 0.05));
      for (let j = 0; j < n; j++) {
        const s = acc + (d * (j + 0.5)) / n;
        if (item.dash) {
          let m = s % period;
          let idx = 0;
          while (m > item.dash[idx]) m -= item.dash[idx++];
          if (idx % 2) continue;
        }
        const lerp = (f) => [q[0] + (p[0] - q[0]) * f, q[1] + (p[1] - q[1]) * f];
        ctx.strokeStyle = plotColor(item.level, item.t0 + (s / (item.len || 1)) * item.span);
        ctx.beginPath();
        ctx.moveTo(...px(lerp(j / n)));
        ctx.lineTo(...px(lerp((j + 1) / n)));
        ctx.stroke();
      }
      acc += d;
    });
  });
}

const DASH_DOT = [0.4, 0.09, 0.04, 0.09];
const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]];
const arrowHead = (tip, dir, size = 0.07) => {
  const n = [-dir[1], dir[0]];
  return [-1, 0, 1].map((s) => (s ? [tip[0] - dir[0] * size + n[0] * size * 0.4 * s, tip[1] - dir[1] * size + n[1] * size * 0.4 * s] : tip));
};

function hatch(f, u0, v0, u1, v1, step) {
  for (let d = u0 - v1; d < u1 - v0; d += step) {
    const lo = Math.max(v0, u0 - d);
    const hi = Math.min(v1, u1 - d);
    if (hi > lo) f.path([[d + lo, lo], [d + hi, hi]], { w: 0.01, level: 0.55 });
  }
}

function dimension(f, u0, u1, v, label, ext = 0.1) {
  f.path([[u0, v - ext], [u0, v + ext]], { w: 0.01, level: 0.55 });
  f.path([[u1, v - ext], [u1, v + ext]], { w: 0.01, level: 0.55 });
  f.path([[u0, v], [u1, v]], { w: 0.01 });
  f.path(arrowHead([u0, v], [-1, 0]), { w: 0.012 });
  f.path(arrowHead([u1, v], [1, 0]), { w: 0.012 });
  if (label) f.text(label, (u0 + u1) / 2, v - 0.035, { size: 0.07, center: true });
}

// The free strips beside each home row; v runs across the strip, f.inward points toward the home row
const BLUEPRINT_BANDS = [
  {
    len: 2.8,
    draw: (f) => {
      f.path(rect(0, -0.36, 2.8, 0.36), { w: 0.024 });
      f.path([[0, -0.07], [2.8, -0.07]], { w: 0.012 });
      f.path([[0, 0.15], [2.8, 0.15]], { w: 0.012 });
      f.path([[1.75, -0.07], [1.75, 0.36]], { w: 0.012 });
      f.path([[2.3, 0.15], [2.3, 0.36]], { w: 0.012 });
      f.text('MARRALHINHA ONLINE', 0.12, -0.15, { size: 0.15 });
      f.text('BOARD ASSY.', 0.1, 0.08);
      f.text('DRN R.P.', 1.84, 0.08, { size: 0.08 });
      f.text('DWG MRL-001', 0.1, 0.3, { size: 0.08 });
      f.text('REV B', 1.84, 0.3, { size: 0.08 });
      f.text('1:1', 2.4, 0.3, { size: 0.08 });
    },
  },
  {
    len: 0,
    draw: (f) => {
      const us = f.spec.homeRows.map((r) => r - f.lo).sort((a, b) => a - b);
      for (let i = 1; i < us.length; i++) dimension(f, us[i - 1], us[i], f.inward * 0.26, '1.00', 0.07);
      dimension(f, us[0], us[us.length - 1], -f.inward * 0.12, (us.length - 1).toFixed(2), 0.07);
      f.text(`HOME ROW, ${us.length} PL.`, us[0], -f.inward * 0.3, { size: 0.075 });
    },
  },
  {
    len: 1.5,
    draw: (f) => {
      f.path(rect(0, -0.36, 1.5, 0.36), { w: 0.014, level: 0.55 });
      f.text('NOTES:', 0.08, -0.22, { size: 0.1 });
      ['1. HOLES Ø0.74 THRU', '2. BREAK SHARP EDGES', '3. DO NOT SCALE', '4. ROLL HIGH'].forEach((s, i) => f.text(s, 0.12, -0.07 + i * 0.12, { size: 0.075 }));
    },
  },
  {
    len: 2.5,
    draw: (f) => {
      const v0 = -0.14;
      const v1 = 0.1;
      const cu = 1.25;
      const cr = 0.2;
      [[0.25, cu - cr], [cu + cr, 2.25]].forEach(([a, b]) => {
        f.path(rect(a, v0, b, v1), { w: 0.016 });
        hatch(f, a, v0, b, v1, 0.06);
      });
      f.path(circlePts(cu, v0, cr, 0, Math.PI), { w: 0.016 });
      f.path([[cu - cr, v1], [cu + cr, v1]], { w: 0.016 });
      f.path(circlePts(cu, v0 + 0.02, 0.16), { w: 0.01, level: 0.55, dash: [0.05, 0.035] });
      [[0.08, 1], [2.42, -1]].forEach(([u, d]) => {
        f.path([[u, -0.3], [u, 0.24]], { w: 0.016, dash: [0.1, 0.05] });
        f.path([[u, -0.3], [u + d * 0.12, -0.3]], { w: 0.014 });
        f.path(arrowHead([u + d * 0.12, -0.3], [d, 0], 0.06), { w: 0.014 });
        f.text('A', u + (d > 0 ? 0.04 : -0.1), -0.17, { size: 0.09 });
      });
      f.text('SECTION A-A', cu, 0.3, { size: 0.085, center: true });
    },
  },
  {
    len: 2.7,
    draw: (f) => {
      const vs = [-0.36, -0.12, 0.12, 0.36];
      const us = [0, 0.38, 2.05, 2.7];
      vs.forEach((v, i) => f.path([[0, v], [2.7, v]], { w: i % 3 ? 0.012 : 0.02 }));
      us.forEach((u, i) => f.path([[u, -0.36], [u, 0.36]], { w: i % 3 ? 0.012 : 0.02 }));
      [['REV', 'DESCRIPTION', 'BY'], ['A', 'FIRST DRAFT', 'R.P.'], ['B', 'BETA BUILD', 'YOU']].forEach((row, r) =>
        row.forEach((s, c) => f.text(s, us[c] + 0.07, vs[r] + 0.165, { size: 0.08, level: r ? 1 : 0.7 }))
      );
    },
  },
  {
    len: 2.4,
    draw: (f) => {
      const cu = 0.42;
      const r = 0.27;
      f.path(circlePts(cu, 0, r), { w: 0.02 });
      f.path(circlePts(cu, 0, r * 0.62, 3.6, 5.2), { w: 0.012, level: 0.55 });
      f.path(Array.from({ length: 21 }, (_, i) => [cu + (i / 10 - 1) * r * 0.8, Math.sin((i / 10 - 1) * Math.PI) * 0.08]), { w: 0.012, level: 0.55 });
      f.path([[cu - 0.36, 0], [cu + 0.36, 0]], { w: 0.01, level: 0.55, dash: [0.12, 0.04, 0.03, 0.04] });
      f.path([[cu, -0.34], [cu, 0.34]], { w: 0.01, level: 0.55, dash: [0.12, 0.04, 0.03, 0.04] });
      const e = [cu + Math.cos(-0.8) * r, Math.sin(-0.8) * r];
      const lead = [0.95, -0.26];
      const len = Math.hypot(e[0] - lead[0], e[1] - lead[1]);
      f.path([e, lead, [1.6, -0.26]], { w: 0.01 });
      f.path(arrowHead(e, [(e[0] - lead[0]) / len, (e[1] - lead[1]) / len], 0.06), { w: 0.012 });
      f.text('Ø0.60', 1.0, -0.3, { size: 0.08 });
      f.text('MARBLE, GLASS', 0.9, 0.04, { size: 0.08 });
      f.text(`QTY ${f.spec.marbles * 4}`, 0.9, 0.18, { size: 0.08 });
    },
  },
  {
    len: 2.3,
    draw: (f) => {
      const c = 0.4;
      const h = 0.22;
      const top = -h + 0.04;
      const bottom = h + 0.04;
      f.path(rect(c - h, top, c + h, bottom), { w: 0.018 });
      f.path([[c - h, top], [c - h + 0.1, top - 0.1], [c + h + 0.1, top - 0.1], [c + h + 0.1, bottom - 0.1], [c + h, bottom]], { w: 0.014 });
      f.path([[c + h, top], [c + h + 0.1, top - 0.1]], { w: 0.014 });
      [[-0.11, -0.11], [0.11, -0.11], [0, 0], [-0.11, 0.11], [0.11, 0.11]].forEach(([du, dv]) => f.path(circlePts(c + du, 0.04 + dv, 0.035), { w: 0.012 }));
      dimension(f, c - h, c + h, 0.33, null, 0.04);
      f.text('0.44', c + h + 0.06, 0.355, { size: 0.07 });
      f.text('DIE, D6', 0.85, -0.04);
      f.text('FAIR. PROBABLY.', 0.85, 0.12, { size: 0.075 });
    },
  },
  {
    len: 2.2,
    draw: (f) => {
      const c = 0.36;
      f.path(circlePts(c, 0, 0.26), { w: 0.014 });
      f.path(circlePts(c, 0, 0.2), { w: 0.01, level: 0.55 });
      f.path([[c + 0.33, 0], [c + 0.05, 0.07], [c - 0.22, 0], [c + 0.05, -0.07], [c + 0.33, 0]], { w: 0.014 });
      f.path([[c, -0.3], [c, 0.3]], { w: 0.01, level: 0.55 });
      f.text('N', c + 0.36, 0.03);
      f.path(rect(1.05, -0.04, 2.05, 0.04), { w: 0.012 });
      [1.3, 1.55, 1.8].forEach((u) => f.path([[u, -0.04], [u, 0.04]], { w: 0.01 }));
      hatch(f, 1.05, -0.04, 1.3, 0.04, 0.03);
      hatch(f, 1.55, -0.04, 1.8, 0.04, 0.03);
      f.text('0', 1.03, 0.17, { size: 0.07 });
      f.text('1', 2.02, 0.17, { size: 0.07 });
      f.text('SCALE: 1 PITCH', 1.05, -0.12, { size: 0.075 });
    },
  },
];

function blueprintDraft(layout) {
  const { spec } = layout;
  const W = spec.halfWidth;
  const L = spec.halfLength;
  const plot = makePlotter();
  const board = (pts, opts) => plot.path('board', pts, opts);
  board(roundedCross(W - 0.16, L - 0.16, 0.5), { w: 0.034 });
  board(roundedCross(W - 0.27, L - 0.27, 0.4), { w: 0.012, level: 0.55 });
  board([[-(L - 0.4), 0], [L - 0.4, 0]], { w: 0.012, level: 0.55, dash: DASH_DOT });
  board([[0, -(L - 0.4)], [0, L - 0.4]], { w: 0.012, level: 0.55, dash: DASH_DOT });
  board(circlePts(0, 0, 0.62), { w: 0.03 });
  board(circlePts(0, 0, 0.95), { w: 0.012, level: 0.55, dash: [0.1, 0.07] });
  board(circlePts(0, 0, 1.3), { w: 0.02 });
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180;
    const len = d % 45 === 0 ? 0.24 : d % 15 === 0 ? 0.15 : 0.07;
    board([[Math.cos(a) * 1.3, Math.sin(a) * 1.3], [Math.cos(a) * (1.3 + len), Math.sin(a) * (1.3 + len)]], { w: 0.012, level: d % 15 ? 0.55 : 1 });
  }
  [1, 3, 5, 7].forEach((o) => {
    const a = (o * Math.PI) / 4;
    board([[Math.cos(a) * 0.62, Math.sin(a) * 0.62], [Math.cos(a) * 2.3, Math.sin(a) * 2.3]], { w: 0.012, level: 0.55, dash: [0.12, 0.08] });
  });
  plot.text('board', 'R1.30', [0.62, -1.62]);
  // Every track hole in play order, with a chevron in each gap pointing the way marbles travel
  layout.RING.forEach(([r, c], i) => {
    board(circlePts(c, r, 0.44), { w: 0.012, level: 0.55 });
    const [nr, nc] = layout.RING[(i + 1) % layout.RING.length];
    const d = [nc - c, nr - r];
    const m = [(c + nc) / 2, (r + nr) / 2];
    board([[m[0] - d[0] * 0.035 - d[1] * 0.05, m[1] - d[1] * 0.035 + d[0] * 0.05], [m[0] + d[0] * 0.035, m[1] + d[1] * 0.035], [m[0] - d[0] * 0.035 + d[1] * 0.05, m[1] - d[1] * 0.035 - d[0] * 0.05]], { w: 0.014 });
  });
  const lo = Math.min(...spec.homeRows) - 0.45;
  const bandLen = L - 1.2 - lo;
  const P = (seat, a, b) => {
    const [r, c] = rotate([a, b], seat);
    return [c, r];
  };
  for (let seat = 0; seat < 4; seat++) {
    board([P(seat, lo + 0.45, 0.6), P(seat, Math.max(...spec.homeRows), 0.6)], { w: 0.012, level: 0.55 });
    spec.homeRows.forEach((row) => board([P(seat, row, 0.52), P(seat, row, 0.68)], { w: 0.012 }));
  }
  let stamp = null;
  BLUEPRINT_BANDS.forEach((content, idx) => {
    const seat = idx >> 1;
    const side = idx % 2 ? -1 : 1;
    const O = P(seat, lo, side * 1.11);
    const U = P(seat, 1, 0);
    const V = [-U[1], U[0]];
    const off = content.len ? Math.max(0, (bandLen - content.len) / 2) : 0;
    const at = (u, v) => [O[0] + (u + off) * U[0] + v * V[0], O[1] + (u + off) * U[1] + v * V[1]];
    const angle = Math.atan2(U[1], U[0]);
    content.draw({
      spec,
      lo,
      inward: side,
      path: (pts, opts) => board(pts.map(([u, v]) => at(u, v)), opts),
      text: (str, u, v, opts = {}) => {
        const size = opts.size ?? 0.09;
        plot.text('board', str, at(u - (opts.center ? (str.length * size * 0.55) / 2 : 0), v), { ...opts, size, angle });
      },
    });
    // The approval stamp lands on the revision table at the very end of every pass
    if (idx === 4) stamp = { at: at(content.len / 2 + 0.25, 0.02), angle: angle - 0.1 };
  });
  const D = spec.dishR;
  const dish = (pts, opts) => plot.path('dish', pts, opts);
  dish(circlePts(0, 0, D - 0.3), { w: 0.024 });
  for (let d = 0; d < 360; d += 10) {
    const a = (d * Math.PI) / 180;
    const len = d % 30 ? 0.07 : 0.14;
    dish([[Math.cos(a) * (D - 0.3), Math.sin(a) * (D - 0.3)], [Math.cos(a) * (D - 0.3 - len), Math.sin(a) * (D - 0.3 - len)]], { w: 0.012, level: d % 30 ? 0.55 : 1 });
  }
  dish([[-(D - 0.5), 0], [D - 0.5, 0]], { w: 0.012, level: 0.55, dash: DASH_DOT });
  dish([[0, -(D - 0.5)], [0, D - 0.5]], { w: 0.012, level: 0.55, dash: DASH_DOT });
  // One texture serves all four trays, so hole callouts only go on when the layout looks the same from every seat
  const offsets = spec.baseOffsets.map(([r, c]) => [c, r]);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  if (offsets.every(([x, y]) => offsets.some(([x2, y2]) => near(x2, y) && near(y2, -x)))) {
    offsets.forEach(([x, y]) => dish(circlePts(x, y, 0.44), { w: 0.012, level: 0.55 }));
    const orbit = Math.max(...offsets.map(([x, y]) => Math.hypot(x, y)));
    if (orbit) dish(circlePts(0, 0, orbit), { w: 0.01, level: 0.55, dash: [0.1, 0.07] });
    plot.text('dish', 'DETAIL B', [-0.24, D - 0.6], { size: 0.1 });
  }
  return { items: plot.items, keys: schedulePlot(plot.items), stamp };
}

function drawStamp(ctx, { at, angle }, S) {
  const k = BOARD_R * S;
  const rand = seeded(29);
  const w = 1.9 * k;
  const h = 0.62 * k;
  ctx.save();
  ctx.translate(S / 2 + at[0] * k, S / 2 + at[1] * k);
  ctx.rotate(angle);
  const ink = plotColor(0.2, 0.955);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 0.05 * k;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 0.08 * k);
  ctx.stroke();
  ctx.lineWidth = 0.02 * k;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 0.07 * k, -h / 2 + 0.07 * k, w - 0.14 * k, h - 0.14 * k, 0.05 * k);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `800 ${0.24 * k}px ${PLOT_FONT}`;
  ctx.fillText('APPROVED', 0, 0.02 * k);
  ctx.font = `700 ${0.1 * k}px ${PLOT_FONT}`;
  ctx.fillText('BETA TESTED · THANK YOU', 0, 0.19 * k);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + rand() * 0.7})`;
    ctx.beginPath();
    ctx.arc((rand() - 0.5) * w, (rand() - 0.5) * h, (0.004 + rand() * 0.016) * k, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function cyanotype(ctx, S, k, rand) {
  ctx.fillStyle = '#16407f';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 80; i++) softBlob(ctx, rand() * S, rand() * S, (1.5 + rand() * 4) * k, rand() > 0.5 ? '#2a62ad' : '#0c2a60', 0.16);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const a = rand() * TAU;
    const len = 2 + rand() * 8;
    ctx.strokeStyle = `rgba(200,228,255,${0.02 + rand() * 0.06})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

function paperGrid(ctx, S, k, extent) {
  for (let n = -extent * 4; n <= extent * 4; n++) {
    const p = S / 2 + n * k * 0.25;
    ctx.strokeStyle = n % 4 ? 'rgba(175,215,255,0.07)' : 'rgba(175,215,255,0.17)';
    ctx.lineWidth = n % 4 ? 1 : 1.4;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }
}

function blueprintPaper(layout) {
  const S = 1024;
  const k = BOARD_R * S;
  const { halfWidth: W, halfLength: L } = layout.spec;
  const [canvas, ctx] = makeCanvas(S, S);
  cyanotype(ctx, S, k, seeded(53));
  paperGrid(ctx, S, k, 10);
  [0, L / 2, -L / 2].forEach((at) => {
    const p = S / 2 + at * k;
    [[2.5, 'rgba(4,16,44,0.28)', 5], [-1, 'rgba(210,235,255,0.16)', 1.5]].forEach(([off, color, width]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p + off, 0);
      ctx.lineTo(p + off, S);
      ctx.moveTo(0, p + off);
      ctx.lineTo(S, p + off);
      ctx.stroke();
    });
  });
  ctx.lineJoin = 'round';
  [[1, 0.1], [0.6, 0.12], [0.3, 0.16]].forEach(([width, alpha]) => {
    ctx.strokeStyle = `rgba(6,18,48,${alpha})`;
    ctx.lineWidth = width * k;
    tracePath(ctx, roundedCross(W, L, 0.65), S, BOARD_R);
    ctx.stroke();
  });
  return canvas;
}

function blueprintCanvases(layout) {
  const draft = blueprintDraft(layout);
  const [lines, ctx] = makeCanvas(2048, 2048);
  drawStamp(ctx, draft.stamp, 2048);
  renderPlot(ctx, draft.items, 'board', 2048, BOARD_R);
  const dishRepeat = 0.5 / (layout.spec.dishR + 0.1);
  const [dishLines, dctx] = makeCanvas(1024, 1024);
  renderPlot(dctx, draft.items, 'dish', 1024, dishRepeat);
  const [dishPaper, pctx] = makeCanvas(512, 512);
  cyanotype(pctx, 512, dishRepeat * 512, seeded(59));
  paperGrid(pctx, 512, dishRepeat * 512, Math.ceil(layout.spec.dishR) + 1);
  [[0.5, 0.12], [0.25, 0.16]].forEach(([width, alpha]) => {
    pctx.strokeStyle = `rgba(6,18,48,${alpha})`;
    pctx.lineWidth = width * dishRepeat * 512;
    pctx.beginPath();
    pctx.arc(256, 256, layout.spec.dishR * dishRepeat * 512, 0, TAU);
    pctx.stroke();
  });
  return { paper: blueprintPaper(layout), lines, dishPaper, dishLines, dishRepeat, keys: draft.keys };
}

const blueprintShader = (R) => `{
  vec2 uvB = vEmissiveMapUv;
  float top = smoothstep(0.6, 0.95, vSkinTop);
  vec4 dat = texture2D(emissiveMap, uvB);
  vec3 dd = dat.rgb / max(dat.a, 0.001);
  float when = (floor(dd.g * 255.0 + 0.5) * 256.0 + floor(dd.b * 255.0 + 0.5)) / 65535.0;
  float age = fract(uSkinTime / ${PLOT_CYCLE.toFixed(1)} - when);
  float isInk = step(0.35, dd.r);
  float line = dat.a * dd.r * isInk;
  float seal = dat.a * (1.0 - isInk);
  float ink = pow(1.0 - age, 6.0);
  float tip = pow(1.0 - age, 1800.0);
  vec2 q = (uvB - 0.5) / ${R.toFixed(5)};
  vec2 dp = q - uPen.xy;
  float pr2 = dot(dp, dp);
  float px = max(fwidth(q.x), 0.004);
  float hair = (exp(-abs(dp.x) / px) * step(abs(dp.y), 0.22) + exp(-abs(dp.y) / px) * step(abs(dp.x), 0.22)) * smoothstep(0.004, 0.012, pr2);
  vec3 chalk = vec3(0.8, 0.93, 1.0);
  vec3 em = chalk * line * (0.3 + ink * 1.25) + vec3(1.0) * line * tip * 2.2
    + uPen.z * (vec3(1.0) * exp(-pr2 / 0.0012) * 2.4 + vec3(0.45, 0.8, 1.0) * (exp(-pr2 / 0.45) * 0.2 + hair * 0.5))
    + vec3(1.0, 0.25, 0.3) * seal * pow(1.0 - age, 30.0) * 1.5;
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(0.86, 0.2, 0.24), seal * 0.85 * top), chalk, line * 0.45 * top);
  totalEmissiveRadiance = em * top;
}`;

// Sits on a green self-healing cutting mat instead of more blue felt
function cuttingMatCanvas() {
  const S = 1024;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(19);
  ctx.fillStyle = '#1e5944';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${rand() * 0.04})` : `rgba(0,0,0,${rand() * 0.08})`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let i = 0; i <= 16; i++) {
    const p = i * 64;
    ctx.strokeStyle = i % 4 ? 'rgba(214,240,226,0.2)' : 'rgba(240,226,150,0.42)';
    ctx.lineWidth = i % 4 ? 1.5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(214,240,226,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(S, S);
  ctx.moveTo(S, 0);
  ctx.lineTo(0, S);
  ctx.stroke();
  return canvas;
}

const TRACK_HOLE_R = 0.37;

function roundRectPath(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

function moonLitPath(ctx, r, f) {
  ctx.beginPath();
  if (f > 0.97) ctx.arc(0, 0, r, 0, TAU);
  else {
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    if (f < 0.5) ctx.ellipse(0, 0, Math.max(r * (1 - 2 * f), 0.001), r, 0, Math.PI / 2, -Math.PI / 2, true);
    else ctx.ellipse(0, 0, Math.max(r * (2 * f - 1), 0.001), r, 0, Math.PI / 2, Math.PI * 1.5, false);
  }
  ctx.closePath();
}

function drawMoonPhase(ctx, data, x, y, r, f, rand) {
  ctx.save();
  ctx.translate(x, y);
  if (!data) {
    softBlob(ctx, 0, 0, r * 2.8, '#8fe0d6', 0.1 + f * 0.2);
    ctx.fillStyle = '#071d2c';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  }
  if (f > 0.03) {
    moonLitPath(ctx, r, f);
    if (data) {
      ctx.fillStyle = 'rgba(0,0,255,0.85)';
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 1.1);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#9fd8da');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      moonLitPath(ctx, r, f);
      ctx.clip();
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(70,130,150,0.3)';
        ctx.beginPath();
        ctx.arc((rand() - 0.5) * r * 1.5, (rand() - 0.5) * r * 1.5, r * (0.07 + rand() * 0.13), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.strokeStyle = data ? 'rgba(0,0,255,0.6)' : 'rgba(205,244,238,0.75)';
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function resampleLoop(pts, step) {
  const out = [];
  let need = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const tx = (bx - ax) / len;
    const ty = (by - ay) / len;
    let d = need;
    for (; d < len; d += step) out.push({ x: ax + tx * d, y: ay + ty * d, tx, ty });
    need = d - len;
  }
  return out;
}

function scallopEdge(ctx, pts, step, radius) {
  resampleLoop(pts, step).forEach(({ x, y, tx, ty }) => {
    let nx = -ty;
    let ny = tx;
    if (-nx * x - ny * y < 0) {
      nx = -nx;
      ny = -ny;
    }
    const a = Math.atan2(ny, nx);
    ctx.beginPath();
    ctx.arc(x, y, radius, a - Math.PI / 2, a + Math.PI / 2);
    ctx.stroke();
  });
}

// Overlapping concentric circles drawn top to bottom leave only the upper arcs showing, which is the classic wave scale
function seigaiha(ctx, data, x0, x1, y0, y1, r) {
  const rows = Math.ceil((y1 - y0) / (r / 2)) + 3;
  for (let j = -1; j < rows; j++) {
    const cy = y0 + (j * r) / 2;
    const off = j % 2 ? r : 0;
    for (let cx = x0 - 2 * r + off; cx < x1 + 2 * r; cx += 2 * r) {
      [1, 0.68, 0.36].forEach((s, i) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r * s, 0, TAU);
        if (data) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = i % 2 ? '#0d4457' : '#08293a';
          ctx.fill();
        }
        ctx.strokeStyle = data ? 'rgba(0,0,255,0.5)' : 'rgba(190,236,229,0.32)';
        ctx.lineWidth = 0.014;
        ctx.stroke();
      });
    }
  }
}

function paintMoonInlay(ctx, data, layout, rand) {
  const S = 1024;
  const k = BOARD_R * S;
  const silver = (a) => (data ? `rgba(0,0,255,${a})` : `rgba(208,245,239,${a})`);
  const { halfWidth: W, halfLength: L, homeRows } = layout.spec;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, S / 2, S / 2);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const hull = roundedCross(W - 0.1, L - 0.1, 0.5);
  ctx.strokeStyle = silver(0.9);
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = silver(data ? 0.5 : 0.6);
  ctx.lineWidth = 0.018;
  scallopEdge(ctx, hull, 0.24, 0.12);

  [[0.82, [0.07, 0.05]], [1.42, []]].forEach(([rad, dash]) => {
    ctx.setLineDash(dash);
    ctx.strokeStyle = silver(0.55);
    ctx.lineWidth = dash.length ? 0.016 : 0.022;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, TAU);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.strokeStyle = silver(0.6);
  ctx.lineWidth = 0.012;
  for (let i = 0; i < 96; i++) {
    const a = (i * TAU) / 96;
    const out = 1.42 + (i % 12 === 0 ? 0.17 : i % 4 === 0 ? 0.1 : 0.05);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 1.42, Math.sin(a) * 1.42);
    ctx.lineTo(Math.cos(a) * out, Math.sin(a) * out);
    ctx.stroke();
  }
  [false, true].forEach((major) => {
    for (let i = major ? 0 : 1; i < 8; i += 2) {
      const a = (i * Math.PI) / 4;
      const len = major ? 2.05 : 1.2;
      const rb = major ? 0.62 : 0.5;
      const spread = major ? 0.3 : 0.26;
      const tip = [Math.cos(a) * len, Math.sin(a) * len];
      [[a + spread, '#c6ece7', 0.55], [a - spread, '#0c4556', 0.9]].forEach(([b, fill, alpha], side) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tip[0], tip[1]);
        ctx.lineTo(Math.cos(b) * rb, Math.sin(b) * rb);
        ctx.closePath();
        if (!data || !side) {
          ctx.fillStyle = data ? 'rgba(0,0,255,0.45)' : fill;
          ctx.globalAlpha = data ? 1 : alpha;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = silver(0.55);
        ctx.lineWidth = 0.012;
        ctx.stroke();
      });
    }
  });

  const uLo = Math.min(...homeRows) - 0.35;
  const uHi = L - 1.4;
  for (let seat = 0; seat < 4; seat++) {
    ctx.save();
    ctx.rotate((-seat * Math.PI) / 2);
    [1, -1].forEach((side) => {
      const x0 = side > 0 ? 0.68 : -1.38;
      const x1 = side > 0 ? 1.38 : -0.68;
      ctx.save();
      roundRectPath(ctx, x0, uLo, x1, uHi, 0.12);
      ctx.clip();
      if (!data) {
        ctx.fillStyle = '#06222f';
        ctx.fillRect(x0, uLo, x1 - x0, uHi - uLo);
      }
      seigaiha(ctx, data, x0, x1, uLo, uHi, 0.14);
      ctx.restore();
      roundRectPath(ctx, x0, uLo, x1, uHi, 0.12);
      ctx.strokeStyle = silver(0.75);
      ctx.lineWidth = 0.022;
      ctx.stroke();
      homeRows.forEach((row, i) => {
        drawMoonPhase(ctx, data, side * 1.03, row, 0.24, i / (homeRows.length - 1), rand);
        if (i < homeRows.length - 1) {
          const y = row - 0.5;
          const x = side * 1.03;
          ctx.fillStyle = silver(0.85);
          ctx.beginPath();
          ctx.moveTo(x, y - 0.075);
          ctx.lineTo(x + 0.028, y);
          ctx.lineTo(x, y + 0.075);
          ctx.lineTo(x - 0.028, y);
          ctx.closePath();
          ctx.fill();
        }
      });
    });
    ctx.restore();
  }
  ctx.restore();
}

// Data texture: red is a halo around each hole (green its id), blue is anything the shader should make shimmer
function moonwakeBoard(layout) {
  const S = 1024;
  const k = BOARD_R * S;
  const C = S / 2;
  const [base, b] = makeCanvas(S, S);
  const [data, d] = makeCanvas(S, S);
  const rand = seeded(359);
  const sea = b.createRadialGradient(C, C, 0, C, C, 9.5 * k);
  sea.addColorStop(0, '#11586a');
  sea.addColorStop(0.35, '#0a3a4e');
  sea.addColorStop(0.75, '#072638');
  sea.addColorStop(1, '#04141f');
  b.fillStyle = sea;
  b.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) softBlob(b, rand() * S, rand() * S, (1.5 + rand() * 3.5) * k, i % 3 ? '#0b3447' : '#03101d', 0.3);
  for (let i = 0; i < 26; i++) wavyLine(b, { y0: rand() * S, amp: 14 + rand() * 34, k: 1 + Math.floor(rand() * 3), phase: rand() * TAU, width: 1.4 + rand() * 2, color: '#8fd8d0', alpha: 0.05 + rand() * 0.07, w: S });
  softBlob(b, C, C, 2.6 * k, '#6fc9c4', 0.22);

  const holes = [...layout.RING, ...layout.HOME.flat()];
  b.save();
  b.setTransform(k, 0, 0, k, C, C);
  holes.forEach(([r, c]) => {
    b.strokeStyle = 'rgba(150,235,220,0.34)';
    b.lineWidth = 0.028;
    b.beginPath();
    b.arc(c, r, TRACK_HOLE_R + 0.07, 0, TAU);
    b.stroke();
    b.strokeStyle = 'rgba(150,235,220,0.26)';
    b.lineWidth = 0.012;
    b.beginPath();
    b.arc(c, r, TRACK_HOLE_R + 0.15, 0, TAU);
    b.stroke();
  });
  b.restore();

  holes.forEach(([r, c], i) => {
    const x = C + c * k;
    const y = C + r * k;
    const color = `255,${(i * 37) % 256},0`;
    const g = d.createRadialGradient(x, y, 0.36 * k, x, y, 0.58 * k);
    g.addColorStop(0, `rgba(${color},1)`);
    g.addColorStop(0.3, `rgba(${color},0.8)`);
    g.addColorStop(1, `rgba(${color},0)`);
    d.fillStyle = g;
    d.beginPath();
    d.arc(x, y, 0.58 * k, 0, TAU);
    d.fill();
  });
  paintMoonInlay(b, false, layout, rand);
  paintMoonInlay(d, true, layout, rand);
  return [base, data];
}

function moonDish(layout) {
  const S = 512;
  const { dishR } = layout.spec;
  const R = 0.5 / (dishR + 0.1);
  const k = R * S;
  const C = S / 2;
  const [base, b] = makeCanvas(S, S);
  const [glow, g] = makeCanvas(S, S);
  const rand = seeded(113);
  const bowl = b.createRadialGradient(C, C, 0, C, C, (dishR + 0.1) * k);
  bowl.addColorStop(0, '#1d6c78');
  bowl.addColorStop(0.6, '#0e4455');
  bowl.addColorStop(1, '#07242f');
  b.fillStyle = bowl;
  b.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 10; i++) softBlob(b, C + (rand() - 0.5) * 2 * dishR * k, C + (rand() - 0.5) * 2 * dishR * k, (0.5 + rand() * 0.8) * k, '#0a2f3d', 0.4);
  [[b, 0.16], [g, 0.55]].forEach(([ctx, strength]) => {
    const r2 = seeded(114);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, C, C);
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const rr = 0.3 + i * 0.18;
      for (let s = 0; s < 2 + Math.floor(r2() * 3); s++) {
        const a0 = r2() * TAU;
        ctx.strokeStyle = `rgba(165,238,226,${strength * (1 - i * 0.05)})`;
        ctx.lineWidth = 0.018 + r2() * 0.012;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a0 + 0.7 + r2() * 1.4);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = `rgba(208,245,239,${strength * 2})`;
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, dishR - 0.28, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const x = (r2() - 0.5) * 2 * dishR;
      const y = (r2() - 0.5) * 2 * dishR;
      if (Math.hypot(x, y) > dishR - 0.4) continue;
      ctx.fillStyle = `rgba(225,255,250,${strength * 3})`;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.06);
      ctx.lineTo(x + 0.02, y);
      ctx.lineTo(x, y + 0.06);
      ctx.lineTo(x - 0.02, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  });
  return [base, glow, R];
}

function moonFeltCanvas() {
  const S = 1024;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(367);
  ctx.fillStyle = '#04111d';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 90 + rand() * 230;
    const color = ['#0a2c3b', '#06202e', '#0b3a46'][i % 3];
    [-S, 0, S].forEach((dx) => [-S, 0, S].forEach((dy) => softBlob(ctx, x + dx, y + dy, r, color, 0.32)));
  }
  for (let i = 0; i < 22; i++) {
    const line = { y0: rand() * S, amp: 10 + rand() * 26, k: 1 + Math.floor(rand() * 3), phase: rand() * TAU, width: 1.2 + rand() * 1.6, color: '#7fd0cc', alpha: 0.05 + rand() * 0.07, w: S };
    [-S, 0, S].forEach((dy) => wavyLine(ctx, { ...line, y0: line.y0 + dy }));
  }
  for (let i = 0; i < 520; i++) {
    ctx.fillStyle = `rgba(205,245,238,${rand() * 0.5})`;
    ctx.fillRect(rand() * S, rand() * S, rand() > 0.9 ? 2 : 1, rand() > 0.9 ? 2 : 1);
  }
  return canvas;
}

// A lighthouse beam sweeps from the center, lighting the tide lines, glints and hole collars as it passes
const MOONWAKE_SHADER = `{
  vec2 uvB = vEmissiveMapUv;
  vec2 q = (uvB - 0.5) / ${BOARD_R};
  float t = uSkinTime;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float top = smoothstep(0.6, 0.95, vSkinTop);
  vec4 dat = texture2D(emissiveMap, uvB);
  vec3 dd = dat.rgb / max(dat.a, 0.001);
  float inlay = dat.a * dd.b;
  float collar = dat.a * dd.r;
  float moon = exp(-r * r / 7.0) * 0.6 + exp(-r * r / 45.0) * 0.3;
  float sweep = t * 0.42;
  float d1 = abs(mod(ang - sweep + 3.14159265, 6.2831853) - 3.14159265);
  float d2 = abs(mod(ang - sweep, 6.2831853) - 3.14159265);
  float beam = exp(-d1 * d1 / 0.02) + 0.45 * exp(-d2 * d2 / 0.02);
  float reach = smoothstep(0.8, 2.6, r) * (1.0 - smoothstep(8.5, 12.0, r));
  float haze = 0.7 + 0.3 * skFbm3(vec3(q * 0.7, t * 0.15));
  float lit = beam * reach * haze;
  float hgt = dot(q, vec2(0.34, 0.94)) * 0.62 + (skNoise3(vec3(q * 0.17 + 3.1, t * 0.03)) - 0.5) * 3.6 + (skNoise3(vec3(q * 0.36, t * 0.05)) - 0.5) * 0.9 - t * 0.12;
  float dl = abs(fract(hgt + 0.5) - 0.5);
  float tide = 1.0 - smoothstep(0.0, max(fwidth(hgt) * 1.3, 0.05), dl);
  float band = 1.0 - smoothstep(0.0, 0.24, dl);
  float glints = (skStars(q + vec2(t * 0.1, t * 0.04), 2.6, 0.55, t * 2.2, 0.0).g * 2.0 + skStars(q + 31.7, 1.15, 0.35, t * 1.6, 1.0).g * 1.7) * (0.25 + moon * 1.4 + lit * 1.8) * (0.3 + 0.7 * band);
  float pk = skStars(q + vec2(77.0, -t * 0.09), 1.7, 0.4, t * 1.3, 0.0).g;
  vec3 plankton = vec3(0.1, 0.95, 0.78) * pk * 1.7 * smoothstep(2.0, 6.5, r) * (0.55 + lit * 2.2);
  vec3 water = vec3(0.6, 0.92, 0.92) * tide * (0.07 + moon * 0.26 + lit * 0.6) + vec3(0.85, 1.0, 0.97) * glints + plankton + vec3(0.3, 0.75, 0.8) * (moon * 0.12 + lit * 0.08);
  float sheen = pow(0.5 + 0.5 * sin(dot(q, vec2(0.7, 0.55)) * 1.3 - t * 0.9), 5.0);
  vec3 silver = mix(vec3(0.8, 0.97, 0.95), diffuseColor.rgb * 1.7, 0.5);
  float age = fract(t / 7.0 + dd.g * 3.0);
  float ripple = exp(-pow((dat.a - (1.0 - age)) / 0.1, 2.0)) * (1.0 - age) * step(0.2, dd.r);
  vec3 halo = vec3(0.3, 0.95, 0.82) * collar * (0.07 + 0.05 * sin(t * 1.2 + dd.g * 40.0)) + vec3(0.8, 1.0, 0.96) * collar * lit * 1.1 + vec3(0.5, 1.0, 0.9) * ripple * 0.4;
  vec3 em = water * (1.0 - 0.65 * inlay) + silver * inlay * (0.2 + 0.4 * sheen + lit * 1.5 + moon * 0.5) + halo;
  totalEmissiveRadiance = em * top;
}`;

const moonDishShader = (R) => `{
  vec2 uvB = vEmissiveMapUv;
  vec2 q = (uvB - 0.5) / ${R.toFixed(5)};
  float t = uSkinTime;
  float r = length(q);
  float top = smoothstep(0.6, 0.95, vSkinTop);
  vec3 etched = texture2D(emissiveMap, uvB).rgb;
  float rip = pow(0.5 + 0.5 * sin(r * 11.0 - t * 1.5), 8.0) * (1.0 - smoothstep(0.3, 2.3, r));
  float gl = skStars(q + vec2(t * 0.05, 0.0), 2.6, 0.5, t * 2.0, 0.0).g * 2.0;
  vec3 em = etched * (0.5 + 0.4 * sin(t * 0.7 + r * 2.5)) + vec3(0.3, 0.8, 0.82) * rip * 0.2 + vec3(0.85, 1.0, 0.96) * gl * (0.3 + 0.7 * rip);
  totalEmissiveRadiance = em * top;
}`;

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
      ctx.fillStyle = '#d7d0bd';
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
      ctx.fillStyle = '#e5b63c';
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

const ARCADE_SHAPES = [
  ['11111', '10001', '10001', '10001', '11111'],
  ['00100', '01110', '11111'],
  ['1000001', '0100010', '0010100', '0001000'],
  ['00100', '00100', '11111', '00100', '00100'],
  ['00100', '01110', '11111', '01110', '00100'],
  ['11', '11'],
  STAR,
  COIN,
];

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function pixelCanvas(S, paint) {
  const [canvas, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    img.data.set([...paint(x, y), 255], i);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const ditherBand = (bands, v, x, y) => bands[Math.max(0, Math.min(bands.length - 1, Math.floor(v + BAYER4[(y & 3) * 4 + (x & 3)] - 0.5)))];

// 8 texels per board unit so every hole sits in its own 8x8 tile. Data: red = track tile, green = track order, blue = tile frame
function arcadeBoard(layout) {
  const S = 160;
  const C = S / 2;
  const k = BOARD_R * S;
  const ring = new Map(layout.RING.map(([r, c], i) => [`${r},${c}`, i]));
  const bands = ['#2a1160', '#1f0c4a', '#170838', '#10052a', '#0a031d'].map(hexRgb);
  const [line, dot, fill, frame] = ['#160a3a', '#4a2aa0', '#140a36', '#1f6f8a'].map(hexRgb);
  const at = (x, y) => {
    const c = (x + 0.5 - C) / k;
    const r = (y + 0.5 - C) / k;
    const i = ring.get(`${Math.round(r)},${Math.round(c)}`);
    return { c, r, i, edge: Math.max(Math.abs(c - Math.round(c)), Math.abs(r - Math.round(r))) > 0.375 };
  };
  const base = pixelCanvas(S, (x, y) => {
    const { c, r, i, edge } = at(x, y);
    if (i !== undefined) return edge ? frame : fill;
    const gx = (((x - C) % 8) + 8) % 8 === 4;
    const gy = (((y - C) % 8) + 8) % 8 === 4;
    if (gx && gy) return dot;
    if (gx || gy) return line;
    return ditherBand(bands, Math.hypot(c, r) / 2.2, x, y);
  });
  const data = pixelCanvas(S, (x, y) => {
    const { i, edge } = at(x, y);
    return i === undefined ? [0, 0, 0] : [255, Math.round((i / layout.RING.length) * 255), edge ? 255 : 0];
  });
  return [base, data];
}

function arcadeDish(layout) {
  const { dishR } = layout.spec;
  const S = Math.ceil(16 * (dishR + 0.1));
  const C = S / 2;
  const bands = ['#3a1470', '#2a0f5c', '#1d0a45', '#140733', '#0d0526'].map(hexRgb);
  const base = pixelCanvas(S, (x, y) => ditherBand(bands, (Math.hypot(x + 0.5 - C, y + 0.5 - C) / 8 / dishR) * 4, x, y));
  const [glow, g] = makeCanvas(4, 4);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 4, 4);
  return [base, glow, 8 / S];
}

function arcadeCarpetCanvas() {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(404);
  ctx.fillStyle = '#0a0520';
  ctx.fillRect(0, 0, S, S);
  const colors = ['#2fe6ff', '#ff4fd8', '#ffe94d', '#ff8a3d', '#8a6bff'];
  for (let i = 0; i < 80; i++) {
    const shape = ARCADE_SHAPES[Math.floor(rand() * ARCADE_SHAPES.length)];
    ctx.setTransform(2, 0, 0, 2, Math.floor(rand() * (S - 20)), Math.floor(rand() * (S - 20)));
    pixelRows(ctx, shape, 0, 0, mix(colors[Math.floor(rand() * colors.length)], '#0a0520', 0.4));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

const ARCADE_PAL_GLSL = `
vec3 arcadePal(float i) {
  i = mod(floor(i), 4.0);
  return i < 1.0 ? vec3(0.18, 0.9, 1.0) : i < 2.0 ? vec3(1.0, 0.31, 0.85) : i < 3.0 ? vec3(1.0, 0.91, 0.3) : vec3(0.55, 0.42, 1.0);
}`;

const ARCADE_BOARD_SHADER = `{
  vec2 uvB = vEmissiveMapUv;
  vec2 q = (uvB - 0.5) / ${BOARD_R};
  q.y = -q.y;
  vec2 px = (floor(q * 8.0) + 0.5) / 8.0;
  float t = uSkinTime;
  float tick = floor(t * 12.0) / 12.0;
  float top = smoothstep(0.6, 0.95, vSkinTop);
  vec4 dat = texture2D(emissiveMap, uvB);
  float tile = step(0.5, dat.r);
  float frame = step(0.5, dat.b);
  float run = dat.g * 4.0 - tick * 0.35;
  float tail = floor(pow(1.0 - fract(run), 3.0) * 4.0) / 4.0;
  vec3 lane = vec3(0.1, 0.55, 0.75) * (0.02 + frame * 0.14) + arcadePal(floor(run)) * tail * tail * (0.1 + frame * 0.5);
  float sunR = 1.45;
  float d = length(px);
  float cut = px.y > 0.0 ? step(0.25 + px.y * 0.25, fract(px.y * 2.5 - tick * 0.6)) : 1.0;
  float sy = smoothstep(-sunR, sunR, px.y);
  vec3 sun = step(d, sunR) * cut * mix(mix(vec3(1.0, 0.75, 0.05), vec3(1.0, 0.1, 0.4), smoothstep(0.0, 0.6, sy)), vec3(0.45, 0.05, 0.6), smoothstep(0.6, 1.0, sy));
  float halo = step(d, sunR + 0.25) * step(sunR, d) * (0.5 + 0.5 * step(0.5, fract(t * 1.5)));
  float cheb = max(abs(px.x), abs(px.y));
  float w = fract(t * 0.16);
  float pulse = step(abs(cheb - (sunR + 0.4 + w * 8.0)), 0.07) * (1.0 - w);
  vec2 gp = fract(px);
  vec2 gl = step(abs(gp - 0.5625), vec2(0.01));
  float grid = max(gl.x, gl.y);
  float node = gl.x * gl.y;
  float h = fract(sin(dot(floor(q * 8.0), vec2(12.9898, 78.233))) * 43758.5453);
  float star = step(0.995, h) * step(0.6, fract(t * (0.4 + h) + h * 9.0)) * (1.0 - grid);
  vec3 field = sun * 0.5 + vec3(1.0, 0.2, 0.7) * halo * 0.2 + arcadePal(floor(t * 0.16) + 1.0) * pulse * 0.7
    + vec3(0.35, 0.18, 0.9) * (node * 0.25 + grid * pulse * 0.6) + vec3(0.7, 0.8, 1.0) * star * 0.6;
  totalEmissiveRadiance = mix(vec3(1.0, 0.31, 0.85) * 0.4, mix(field, lane, tile), top);
}`;

const arcadeDishShader = (R, dishR) => `{
  vec2 q = (vEmissiveMapUv - 0.5) / ${R.toFixed(5)};
  vec2 px = (floor(q * 8.0) + 0.5) / 8.0;
  float t = uSkinTime;
  float top = smoothstep(0.6, 0.95, vSkinTop);
  float slot = floor((atan(px.y, px.x) / 6.2831853 + 0.5) * 16.0);
  float sa = (slot + 0.5) / 16.0 * 6.2831853 - 3.14159265;
  float bulb = step(length(px - vec2(cos(sa), sin(sa)) * ${(dishR - 0.3).toFixed(3)}), 0.12);
  float lit = mod(slot - floor(t * 8.0), 4.0) < 1.0 ? 1.0 : 0.12;
  float w = fract(t * 0.4);
  float wave = step(abs(length(px) - w * ${(dishR - 0.5).toFixed(3)}), 0.07) * (1.0 - w);
  totalEmissiveRadiance = (arcadePal(slot) * bulb * lit * 1.6 + vec3(0.18, 0.9, 1.0) * wave * 0.6) * top;
}`;

const SPECIAL_BOARDS = {
  arcade: (layout) => {
    const [base, data] = arcadeBoard(layout);
    const [dishBase, dishGlow, dishRepeat] = arcadeDish(layout);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const cores = ['#2fe6ff', '#ff4fd8', '#ffe94d', '#8a6bff'].map((c) => new THREE.Color(c));
    return {
      canvas: base, glowCanvas: data, glowData: true, repeat: BOARD_R, pixel: true, roughness: 0.55, clearcoat: 0.35,
      dishCanvas: dishBase, dishGlowCanvas: dishGlow, dishRepeat,
      dish: '#1d0a45', feltCanvas: arcadeCarpetCanvas(), cup: '#07021a', core: '#2fe6ff',
      accent: { color: '#2fe6ff', emissive: '#2fe6ff', emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 },
      shaderCommon: ARCADE_GLSL + ARCADE_PAL_GLSL,
      shader: ARCADE_BOARD_SHADER,
      dishShader: arcadeDishShader(dishRepeat, layout.spec.dishR),
      post: true,
      animate: (mats, t) => mats.core.color.copy(cores[Math.floor((still?.matches ? 0 : t) * 2) % 4]),
    };
  },
  bamboo: () => ({ canvas: bambooCanvas(), repeat: 0.07, roughness: 0.45, dish: '#a8984c', felt: '#23443a', cup: '#3d3212' }),
  azulejo: () => ({ canvas: azulejoCanvas(), repeat: 1 / 8, offset: 9 / 16, roughness: 0.38, clearcoat: 0.35, dish: '#2a63b8', felt: '#102a4a', cup: '#0e2046' }),
  basalt: () => ({ canvas: stoneCanvas({ base: '#2c2b2d', vein: '#4a4648', count: 6, seed: 9, dots: 900 }), repeat: 0.06, roughness: 0.92, dish: '#3a3638', felt: '#2b1d17', cup: '#0e0d0e' }),
  stone: () => ({ canvas: stoneCanvas({ base: '#c6bfb1', vein: '#7d7c86', count: 26, seed: 21 }), repeat: 0.05, roughness: 0.38, clearcoat: 0.26, dish: '#ada697', felt: '#233139', cup: '#45454b' }),
  lacquer: () => ({ color: '#121014', roughness: 0.12, clearcoat: 1, dish: '#1b1719', felt: '#4a0f16', cup: '#050405', accent: { color: '#ffcf5a', metalness: 1, roughness: 0.18 } }),
  neon: () => {
    const [base, glow] = neonCanvases();
    return { canvas: base, glowCanvas: glow, repeat: 0.06, roughness: 0.35, dish: '#1a0f33', felt: '#07061a', cup: '#05030c', accent: { color: '#2fe6ff', emissive: '#2fe6ff', emissiveIntensity: 1.4, roughness: 0.3 } };
  },
  cork: () => ({ canvas: corkCanvas(), repeat: 0.08, roughness: 0.85, dish: '#a8834f', felt: '#2b4a3a', cup: '#4a3418' }),
  slate: () => ({ canvas: stoneCanvas({ base: '#3a3f47', vein: '#7d8794', count: 12, seed: 33, dots: 300 }), repeat: 0.06, roughness: 0.9, dish: '#2e333a', felt: '#1f2a24', cup: '#15181c', accent: { color: '#e8edf2', metalness: 0.2, roughness: 0.6 } }),
  terrazzo: () => ({ canvas: terrazzoCanvas(), repeat: 0.07, roughness: 0.48, clearcoat: 0.16, dish: '#2b2e32', felt: '#2b3a44', cup: '#141618', accent: { color: '#d9d4ca', metalness: 0.3, roughness: 0.4 } }),
  ocean: () => {
    const [base, glow] = oceanCanvases();
    return { canvas: base, glowCanvas: glow, glowIntensity: 0.55, repeat: 0.05, roughness: 0.08, clearcoat: 1, dish: '#0b3d6b', felt: '#061c33', cup: '#031424', accent: { color: '#8fe3ff', emissive: '#3fc1b0', emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.25 } };
  },
  aurora: () => {
    const [base, glow] = auroraCanvases();
    return { canvas: base, glowCanvas: glow, glowIntensity: 1, repeat: 0.05, roughness: 0.25, clearcoat: 0.8, dish: '#0e1233', felt: '#04061a', cup: '#03040f', accent: { color: '#8cf2e2', emissive: '#2fd2a0', emissiveIntensity: 1.1, roughness: 0.3 } };
  },
  dev: (layout) => {
    const [dishCanvas, dishGlowCanvas, dishRepeat] = horizonDish(layout);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    return {
      canvas: horizonCanvas(), glowCanvas: horizonData(layout), glowData: true, repeat: BOARD_R, roughness: 0.45, clearcoat: 0.35,
      dishCanvas, dishGlowCanvas, dishRepeat,
      dish: '#0d0405', feltCanvas: spaceFeltCanvas(), cup: '#0a0203', cupGlow: '#260806', core: '#000000',
      accent: { color: '#d9a55a', emissive: '#ff7a20', emissiveIntensity: 0.3, metalness: 1, roughness: 0.25 },
      shaderCommon: SKIN_NOISE_GLSL,
      shader: HORIZON_SHADER,
      animate: (mats, t) => {
        const time = still?.matches ? 0 : t;
        mats.dish.map.rotation = mats.dish.emissiveMap.rotation = time * 0.035;
        // The photon ring flashes as each gravitational wave leaves the hole
        mats.brass.emissiveIntensity = 0.25 + 1.2 * Math.exp(-(time % 11) * 1.8);
      },
    };
  },
  beta: (layout) => {
    const draft = blueprintCanvases(layout);
    const boardPen = { value: new THREE.Vector3() };
    const dishPen = { value: new THREE.Vector3() };
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    return {
      canvas: draft.paper, glowCanvas: draft.lines, glowData: true, repeat: BOARD_R, roughness: 0.62,
      dishCanvas: draft.dishPaper, dishGlowCanvas: draft.dishLines, dishGlowData: true, dishRepeat: draft.dishRepeat,
      dish: '#16407f', feltCanvas: cuttingMatCanvas(), cup: '#0b1d3f',
      accent: { color: '#aebccb', metalness: 0.85, roughness: 0.38 },
      shaderCommon: 'uniform vec3 uPen;',
      shader: blueprintShader(BOARD_R),
      uniforms: { uPen: boardPen },
      dishShader: blueprintShader(draft.dishRepeat),
      dishUniforms: { uPen: dishPen },
      animate: (mats, t) => penAt(draft.keys, still?.matches ? -1 : (t / PLOT_CYCLE) % 1, { board: boardPen, dish: dishPen }),
    };
  },
  supporter: (layout) => {
    const [base, data] = moonwakeBoard(layout);
    const [dishBase, dishGlow, dishRepeat] = moonDish(layout);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const coreDim = new THREE.Color('#0c3b46');
    const coreBright = new THREE.Color('#bff3e6');
    return {
      canvas: base, glowCanvas: data, glowData: true, repeat: BOARD_R, roughness: 0.5, params: { specularIntensity: 0.22 },
      dishCanvas: dishBase, dishGlowCanvas: dishGlow, dishRepeat,
      dish: '#174b56', feltCanvas: moonFeltCanvas(), cup: '#061b26', core: '#0c3b46',
      accent: { color: '#6fa89f', metalness: 0.4, roughness: 0.5, emissive: '#5fa89b', emissiveIntensity: 0.12 },
      shaderCommon: SKIN_NOISE_GLSL,
      shader: MOONWAKE_SHADER,
      dishShader: moonDishShader(dishRepeat),
      animate: (mats, t) => {
        const time = still?.matches ? 0 : t;
        mats.core.color.lerpColors(coreDim, coreBright, 0.5 + 0.5 * Math.sin(time * 0.6));
        mats.brass.emissiveIntensity = 0.14 + 0.08 * Math.sin(time * 0.45);
      },
    };
  },
};

const LAYOUT_BOARDS = new Set(['dev', 'beta', 'supporter', 'arcade']);

function patchSkinShader(material, { body, common = '', uniforms = {}, key, post = false }) {
  const time = { value: 0 };
  material.userData.skinTime = time;
  material.userData.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uSkinTime: time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSkinTop;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinTop = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSkinTime;\nvarying float vSkinTop;\n${common}`)
      .replace('#include <emissivemap_fragment>', body)
      .replace('#include <dithering_fragment>', post ? ARCADE_POST : '#include <dithering_fragment>');
  };
}

function glowTexture(canvas, repeat, data, pixel) {
  const tex = finish(canvas);
  if (pixel) crisp(tex);
  tex.repeat.set(repeat, repeat);
  tex.offset.set(0.5, 0.5);
  if (data) {
    tex.colorSpace = THREE.NoColorSpace;
    tex.premultiplyAlpha = true;
  }
  return tex;
}

export function boardSkin(itemId, layout = layoutFor('classic')) {
  const key = skinKey(itemId);
  const resolved = WOODS[key] || SPECIAL_BOARDS[key] ? key : 'oak';
  const variant = LAYOUT_BOARDS.has(resolved) ? `-${layout.spec.id}` : '';
  return cached(`board:${resolved}${variant}`, () => {
    const wood = WOODS[resolved];
    const spec = wood ? { canvas: makeWoodCanvas(wood), repeat: 0.055, roughness: 0.48, dish: wood.dish, felt: wood.felt, cup: '#3a220f' } : SPECIAL_BOARDS[resolved](layout);
    const boardParams = { roughness: spec.roughness, clearcoat: spec.clearcoat || 0, metalness: 0.02, ...spec.params };
    if (spec.canvas) {
      const map = finish(spec.canvas);
      if (spec.pixel) crisp(map);
      map.repeat.set(spec.repeat, spec.repeat);
      map.offset.set(spec.offset ?? 0.5, spec.offset ?? 0.5);
      boardParams.map = map;
    } else boardParams.color = spec.color;
    if (spec.glowCanvas) Object.assign(boardParams, { emissiveMap: glowTexture(spec.glowCanvas, spec.repeat, spec.glowData, spec.pixel), emissive: '#ffffff', emissiveIntensity: spec.glowIntensity ?? 0.9 });
    const dishParams = { color: spec.dish, roughness: 0.5, clearcoat: spec.clearcoat || 0 };
    if (wood) {
      const dishMap = finish(makeWoodCanvas({ base: spec.dish, grain: '40,25,15', seed: 21 }));
      dishMap.repeat.set(0.2, 0.2);
      dishMap.offset.set(0.5, 0.5);
      Object.assign(dishParams, { map: dishMap, color: '#ffffff' });
    } else if (spec.dishCanvas) {
      Object.assign(dishParams, { map: glowTexture(spec.dishCanvas, spec.dishRepeat, false, spec.pixel), color: '#ffffff' });
      if (spec.dishGlowCanvas) Object.assign(dishParams, { emissiveMap: glowTexture(spec.dishGlowCanvas, spec.dishRepeat, spec.dishGlowData), emissive: '#ffffff', emissiveIntensity: 1 });
    }
    const board = new THREE.MeshPhysicalMaterial(boardParams);
    if (spec.shader) patchSkinShader(board, { body: spec.shader, common: spec.shaderCommon, uniforms: spec.uniforms, post: spec.post, key: `board-${resolved}${variant}-animated` });
    const dish = new THREE.MeshPhysicalMaterial(dishParams);
    if (spec.dishShader) patchSkinShader(dish, { body: spec.dishShader, common: spec.shaderCommon, uniforms: spec.dishUniforms, post: spec.post, key: `dish-${resolved}${variant}-animated` });
    const mats = {
      board,
      dish,
      cup: new THREE.MeshStandardMaterial({ color: spec.cup, roughness: 0.95, side: THREE.DoubleSide, ...(spec.cupGlow ? { emissive: spec.cupGlow } : {}) }),
      brass: new THREE.MeshStandardMaterial({ color: '#e0b05a', metalness: 0.85, roughness: 0.28, polygonOffset: true, polygonOffsetFactor: -2, ...(spec.accent || {}) }),
      felt: spec.feltCanvas ? finish(spec.feltCanvas, 10) : makeFeltTexture(spec.felt),
    };
    if (spec.core) mats.core = new THREE.MeshBasicMaterial({ color: spec.core });
    if (spec.animate) mats.animate = spec.animate;
    return mats;
  });
}

export function animateBoardSkin(materials, t) {
  [materials.board, materials.dish].forEach((m) => {
    const time = m.userData.skinTime;
    if (time) time.value = m.userData.reducedMotion?.matches ? 0 : t;
  });
  materials.animate?.(materials, t);
}

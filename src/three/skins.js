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
  beta: (c) => {
    const [canvas, ctx] = makeCanvas(512, 256);
    ctx.fillStyle = mix(c.main, '#1b4fa0', 0.55);
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
    }
    for (let i = 0; i <= 256; i += 16) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    [[128, 128, 70], [384, 128, 70]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r - 20, y);
      ctx.lineTo(x + r + 20, y);
      ctx.moveTo(x, y - r - 20);
      ctx.lineTo(x, y + r + 20);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.font = '700 18px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('v0.1-beta', 200, 250);
    ctx.fillText('Ø 16', 100, 40);
    ctx.fillText('rev. B', 360, 40);
    return { map: finishMarble(canvas), roughness: 0.3, clearcoat: 0.7 };
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
  jade: { bg: 'jade', pip: '#f0fff4', one: '#f0fff4', roughness: 0.1, clearcoat: 1 },
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
};

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
    ctx.fillStyle = '#3a9a69';
    ctx.fillRect(0, 0, size, size);
    nebula(ctx, rand, { colors: ['#9fe8bf', '#1f6b45'], count: 14, w: size, h: size, alpha: 0.4 });
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
    const time = { value: 0 };
    return DIE_FACE_ORDER.map((value) => {
      const size = 256;
      const [canvas, ctx] = makeCanvas(size, size);
      dieBackground(ctx, spec.bg, size, value);
      drawPips(ctx, value, size, value === 1 ? spec.one : spec.pip);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      const params = { map, roughness: spec.roughness, metalness: spec.metalness || 0, clearcoat: spec.clearcoat || 0, ...(spec.extra || {}) };
      if (spec.glow) {
        const [glow, gctx] = makeCanvas(size, size);
        gctx.fillStyle = '#000';
        gctx.fillRect(0, 0, size, size);
        drawPips(gctx, value, size, value === 1 ? spec.one : spec.pip);
        Object.assign(params, { emissiveMap: new THREE.CanvasTexture(glow), emissive: '#ffffff', emissiveIntensity: spec.glow });
        params.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
      if (key === 'dev' || key === 'holo') {
        const [mask, mctx] = makeCanvas(size, size);
        mctx.fillStyle = '#000';
        mctx.fillRect(0, 0, size, size);
        mctx.fillStyle = '#fff';
        PIPS[value].forEach(([x, y]) => {
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
      if (key === 'dev' || key === 'holo') {
        material.userData.skinTime = time;
        material.customProgramCacheKey = () => `dice-${key}-animated`;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uSkinTime = time;
          shader.uniforms.uFacePhase = { value: value * 0.73 };
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uSkinTime;\nuniform float uFacePhase;')
            .replace('#include <emissivemap_fragment>', key === 'dev' ? `{
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
  if (time) time.value = performance.now() / 1000;
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
  ctx.fillStyle = '#efe9df';
  ctx.fillRect(0, 0, 1024, 1024);
  const chips = ['#e03a3e', '#2a6fcf', '#f0b428', '#3e9b62', '#2b2b2b', '#b36bff', '#ff8a3d', '#ffffff'];
  for (let i = 0; i < 700; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const r = 5 + rand() * 20;
    ctx.fillStyle = chips[Math.floor(rand() * chips.length)];
    ctx.globalAlpha = 0.8 + rand() * 0.2;
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

// Dev board: black obsidian glass with sparse molten circuit traces. Dark and calm so holes and marbles stay readable.
function mainframeCanvases() {
  const S = 1024;
  const [base, bctx] = makeCanvas(S, S);
  const [glow, gctx] = makeCanvas(S, S);
  const rand = seeded(47);
  bctx.fillStyle = '#0b090c';
  bctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    bctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${rand() * 0.035})` : `rgba(255,74,90,${rand() * 0.06})`;
    bctx.fillRect(rand() * S, rand() * S, 2 + rand() * 6, 1 + rand() * 2);
  }
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, S, S);
  // Traces on a 64px grid with 45-degree bends; drawn shifted so they tile seamlessly
  const G = 64;
  const traces = [];
  for (let i = 0; i < 26; i++) {
    const pts = [];
    let x = Math.round((rand() * S) / G) * G;
    let y = Math.round((rand() * S) / G) * G;
    let dir = Math.floor(rand() * 4);
    pts.push([x, y]);
    for (let s = 0; s < 4 + Math.floor(rand() * 5); s++) {
      const len = G * (1 + Math.floor(rand() * 4));
      if (rand() < 0.4) dir = (dir + (rand() < 0.5 ? 1 : 7)) % 8;
      const a = (dir * Math.PI) / 4;
      x += Math.round(Math.cos(a)) * len;
      y += Math.round(Math.sin(a)) * len;
      pts.push([x, y]);
    }
    traces.push(pts);
  }
  const draw = (ctx, color, width, alpha, nodeColor) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    [-S, 0, S].forEach((dx) =>
      [-S, 0, S].forEach((dy) => {
        traces.forEach((pts) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
          ctx.stroke();
          const [ex, ey] = pts[pts.length - 1];
          const [sx0, sy0] = pts[0];
          ctx.fillStyle = nodeColor;
          [[ex, ey], [sx0, sy0]].forEach(([nx, ny]) => {
            ctx.beginPath();
            ctx.arc(nx + dx, ny + dy, width * 1.6, 0, TAU);
            ctx.fill();
          });
        });
      })
    );
    ctx.globalAlpha = 1;
  };
  draw(bctx, 'rgba(255,74,90,0.32)', 5, 1, 'rgba(255,209,102,0.6)');
  draw(gctx, '#ff4a5a', 5, 0.75, '#ffd166');
  return [base, glow];
}

function blueprintCanvas() {
  const [canvas, ctx] = makeCanvas(1024, 1024);
  ctx.fillStyle = '#1b4fa0';
  ctx.fillRect(0, 0, 1024, 1024);
  grid(ctx, 1024, 32, 'rgba(255,255,255,0.12)');
  grid(ctx, 1024, 128, 'rgba(255,255,255,0.3)', 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  [[256, 256, 150], [768, 768, 150], [768, 256, 90], [256, 768, 90]].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r - 30, y);
    ctx.lineTo(x + r + 30, y);
    ctx.moveTo(x, y - r - 30);
    ctx.lineTo(x, y + r + 30);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.font = '700 30px Consolas, "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('MARRALHINHA  rev. B  scale 1:1', 60, 530);
  ctx.fillText('Ø 0.74  ×  64 holes', 560, 530);
  ctx.fillText('BETA BUILD', 60, 1000);
  return canvas;
}

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
  cork: () => ({ canvas: corkCanvas(), repeat: 0.08, roughness: 0.85, dish: '#a8834f', felt: '#2b4a3a', cup: '#4a3418' }),
  slate: () => ({ canvas: stoneCanvas({ base: '#3a3f47', vein: '#7d8794', count: 12, seed: 33, dots: 300 }), repeat: 0.06, roughness: 0.9, dish: '#2e333a', felt: '#1f2a24', cup: '#15181c', accent: { color: '#e8edf2', metalness: 0.2, roughness: 0.6 } }),
  terrazzo: () => ({ canvas: terrazzoCanvas(), repeat: 0.07, roughness: 0.2, clearcoat: 0.6, dish: '#e4ddd0', felt: '#2b3a44', cup: '#6b655c', accent: { color: '#2b2b2b', metalness: 0.3, roughness: 0.4 } }),
  ocean: () => {
    const [base, glow] = oceanCanvases();
    return { canvas: base, glowCanvas: glow, glowIntensity: 0.55, repeat: 0.05, roughness: 0.08, clearcoat: 1, dish: '#0b3d6b', felt: '#061c33', cup: '#031424', accent: { color: '#8fe3ff', emissive: '#3fc1b0', emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.25 } };
  },
  aurora: () => {
    const [base, glow] = auroraCanvases();
    return { canvas: base, glowCanvas: glow, glowIntensity: 1, repeat: 0.05, roughness: 0.25, clearcoat: 0.8, dish: '#0e1233', felt: '#04061a', cup: '#03040f', accent: { color: '#8cf2e2', emissive: '#2fd2a0', emissiveIntensity: 1.1, roughness: 0.3 } };
  },
  dev: () => {
    const [base, glow] = mainframeCanvases();
    return { canvas: base, glowCanvas: glow, glowIntensity: 0.9, repeat: 0.045, roughness: 0.16, clearcoat: 1, dish: '#170d11', felt: '#12090c', cup: '#050305', accent: { color: '#ff4a5a', emissive: '#ff4a5a', emissiveIntensity: 1.5, roughness: 0.25 } };
  },
  beta: () => ({ canvas: blueprintCanvas(), repeat: 0.06, roughness: 0.55, dish: '#16408a', felt: '#0f2c5c', cup: '#0a1f45', accent: { color: '#ffffff', metalness: 0.1, roughness: 0.5 } }),
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
      map.offset.set(0.5, 0.5);
      boardParams.map = map;
    } else boardParams.color = spec.color;
    if (spec.glowCanvas) {
      const glow = finish(spec.glowCanvas);
      glow.repeat.set(spec.repeat, spec.repeat);
      glow.offset.set(0.5, 0.5);
      Object.assign(boardParams, { emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: spec.glowIntensity ?? 0.9 });
    }
    const dishParams = { color: spec.dish, roughness: 0.5, clearcoat: spec.clearcoat || 0 };
    if (wood) {
      const dishMap = finish(makeWoodCanvas({ base: spec.dish, grain: '40,25,15', seed: 21 }));
      dishMap.repeat.set(0.2, 0.2);
      dishMap.offset.set(0.5, 0.5);
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

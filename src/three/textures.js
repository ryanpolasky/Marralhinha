import * as THREE from 'three';

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

export function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function finish(canvas, repeat = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeWoodTexture(options) {
  return finish(makeWoodCanvas(options));
}

export function makeWoodCanvas({ base = '#c9894a', grain = '96,52,20', seed = 7, size = 1024 } = {}) {
  const [canvas, ctx] = makeCanvas(size, size);
  const rand = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const wrapped = (draw) => [-size, 0, size].forEach(draw);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(${grain},${0.02 + rand() * 0.07})`;
    const y = rand() * size;
    const h = 8 + rand() * 70;
    wrapped((dy) => ctx.fillRect(0, y + dy, size, h));
  }
  for (let i = 0; i < 320; i++) {
    const y0 = rand() * size;
    const amp = 2 + rand() * 14;
    const k1 = 1 + Math.floor(rand() * 3);
    const k2 = 3 + Math.floor(rand() * 5);
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(${grain},${0.04 + rand() * 0.2})`;
    ctx.lineWidth = 0.5 + rand() * 2.4;
    wrapped((dy) => {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 6) {
        const a = (x / size) * Math.PI * 2;
        const y = y0 + dy + Math.sin(a * k1 + p1) * amp + Math.sin(a * k2 + p2) * amp * 0.25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
  return canvas;
}

// The speckles don't depend on the felt color, so they're painted once and stamped onto each felt
let feltSpeckles = null;
function speckleLayer() {
  if (feltSpeckles) return feltSpeckles;
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = seeded(3);
  for (let i = 0; i < 26000; i++) {
    const light = rand() > 0.5;
    ctx.fillStyle = light ? `rgba(120,200,170,${rand() * 0.07})` : `rgba(0,0,0,${rand() * 0.12})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  feltSpeckles = canvas;
  return canvas;
}

export function makeFeltTexture(color = '#1c4d44') {
  const [canvas, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(speckleLayer(), 0, 0);
  return finish(canvas, 10);
}

export function makeMarbleTexture(colors, seed = 11) {
  return finishMarble(makeSwirlCanvas(colors, seed));
}

export function finishMarble(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function makeSwirlCanvas({ main, light, dark }, seed = 11) {
  const [canvas, ctx] = makeCanvas(512, 256);
  const rand = seeded(seed);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, dark);
  g.addColorStop(0.5, main);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const bands = [
    [light, 0.7, 30],
    ['#ffffff', 0.35, 8],
    [dark, 0.45, 18],
  ];
  bands.forEach(([color, alpha, width]) => {
    const y0 = 60 + rand() * 136;
    const amp = 20 + rand() * 40;
    const k = 1 + Math.floor(rand() * 2);
    const phase = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 4) {
      const y = y0 + Math.sin((x / 512) * Math.PI * 2 * k + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  return canvas;
}

export function makeNumberTexture(value, color) {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.font = '700 200px Fredoka, "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 26;
  ctx.strokeStyle = 'rgba(10, 20, 24, 0.85)';
  ctx.strokeText(String(value), 128, 140);
  ctx.fillStyle = color;
  ctx.fillText(String(value), 128, 140);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Blood for the dev hit: a lumpy pool (fills the hole the marble left) and a spray flung along +x, away from the shooter
let splats = null;
export function bloodTextures() {
  if (splats) return splats;
  const rand = seeded(29);
  const blood = (ctx, cx, cy, r) => {
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#8e1220');
    g.addColorStop(0.6, '#640814');
    g.addColorStop(1, '#3d040b');
    return g;
  };
  const lump = (ctx, cx, cy, r, bumps) => {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const wob = 1 + bumps.reduce((sum, [k, amp, ph]) => sum + Math.sin(a * k + ph) * amp, 0);
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob);
    }
    ctx.fillStyle = blood(ctx, cx, cy, r * 1.2);
    ctx.fill();
  };
  const wobble = () => [3, 5, 7, 11].map((k) => [k, (0.05 + rand() * 0.07) * (k < 6 ? 1.4 : 0.7), rand() * Math.PI * 2]);

  const [poolCanvas, pool] = makeCanvas(512, 512);
  lump(pool, 256, 256, 170, wobble());
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const d = 150 + rand() * 50;
    lump(pool, 256 + Math.cos(a) * d, 256 + Math.sin(a) * d, 26 + rand() * 30, wobble());
  }
  pool.globalAlpha = 0.35;
  pool.fillStyle = '#c23040';
  pool.beginPath();
  pool.ellipse(215, 205, 70, 34, -0.6, 0, Math.PI * 2);
  pool.fill();

  const [sprayCanvas, spray] = makeCanvas(1024, 512);
  for (let i = 0; i < 70; i++) {
    const t = rand() ** 1.6;
    const x = 40 + t * 940;
    const y = 256 + (rand() - 0.5) * (60 + t * 360);
    const r = (1 - t) * 16 + 3 + rand() * 5;
    spray.fillStyle = blood(spray, x, y, r);
    spray.beginPath();
    spray.ellipse(x, y, r * (1.4 + t * 2.2), r, Math.atan2(y - 256, x) * 0.6, 0, Math.PI * 2);
    spray.fill();
  }
  splats = [poolCanvas, sprayCanvas].map((canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
  return splats;
}

export const BUBBLE_ASPECT = 288 / 512;

// Comic speech bubble with the tail at the bottom middle; long lines wrap to three and shrink to fit
export function makeBubbleTexture(text, color) {
  const [canvas, ctx] = makeCanvas(512, 288);
  const wrap = (size) => {
    ctx.font = `600 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
    const lines = [];
    text.split(/\s+/).forEach((word) => {
      const last = lines[lines.length - 1];
      if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= 420) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
    });
    return lines;
  };
  let size = 46;
  let lines = wrap(size);
  while (lines.length > 3 && size > 26) lines = wrap((size -= 4));
  const lineH = size * 1.15;
  const width = Math.max(180, Math.min(496, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 60));
  const height = Math.min(228, lines.length * lineH + 44);
  const x = (512 - width) / 2;
  const y = 232 - height;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 36);
  ctx.moveTo(234, 230);
  ctx.lineTo(256, 282);
  ctx.lineTo(282, 230);
  ctx.fillStyle = '#fffdf6';
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(238, 224, 40, 12);
  ctx.fillStyle = '#14181c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.slice(0, 3).forEach((line, i) => ctx.fillText(line, 256, y + height / 2 + (i - (Math.min(3, lines.length) - 1) / 2) * lineH, 440));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeLabelTexture(text, color) {
  const [canvas, ctx] = makeCanvas(512, 128);
  ctx.font = '600 58px Fredoka, "Trebuchet MS", sans-serif';
  const width = Math.min(500, ctx.measureText(text).width + 70);
  const x = (512 - width) / 2;
  ctx.fillStyle = 'rgba(10, 24, 28, 0.78)';
  ctx.beginPath();
  ctx.roundRect(x, 18, width, 92, 46);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#fff6e6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66, 440);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

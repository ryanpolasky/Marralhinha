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
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(${grain},${0.02 + rand() * 0.07})`;
    ctx.fillRect(0, rand() * size, size, 8 + rand() * 70);
  }
  for (let i = 0; i < 320; i++) {
    const y0 = rand() * size;
    const amp = 2 + rand() * 14;
    const k1 = 1 + Math.floor(rand() * 3);
    const k2 = 3 + Math.floor(rand() * 5);
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 6) {
      const a = (x / size) * Math.PI * 2;
      const y = y0 + Math.sin(a * k1 + p1) * amp + Math.sin(a * k2 + p2) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${grain},${0.04 + rand() * 0.2})`;
    ctx.lineWidth = 0.5 + rand() * 2.4;
    ctx.stroke();
  }
  return canvas;
}

export function makeFeltTexture(color = '#1c4d44') {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = seeded(3);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const light = rand() > 0.5;
    ctx.fillStyle = light ? `rgba(120,200,170,${rand() * 0.07})` : `rgba(0,0,0,${rand() * 0.12})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
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

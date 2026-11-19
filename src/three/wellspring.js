import * as THREE from 'three';

// Wellspring src/art.ts: default palette and pickup/spell bitmap art.
export const WELL = ['#07070a', '#f4efe6', '#f0354b', '#2b2a35'];
const GEM = ['..+..', '.+#+.', '+#+++', '.+++.', '..+..'];
export const WELL_FLAMES = [
  ['...+...', '..++...', '..+++..', '.++#++.', '.+###+.', '.+###+.', '..+++..'],
  ['....+..', '...++..', '..+++..', '.++#++.', '.+###+.', '.+###+.', '..+++..'],
  ['..+....', '..++.+.', '..+++..', '.+++++.', '.+#+#+.', '.+###+.', '..+++..'],
];
export const WELL_GEM = GEM;
export const WELL_MISSILE = ['.+.', '.+.', '+#+', '+#+', '+#+', '.+.'];
const sheets = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function sprite(name, rect, palette, draw) {
  if (!sheets.has(name)) {
    const image = new Image();
    const entry = { image, ready: false, pending: [] };
    sheets.set(name, entry);
    image.onload = () => { entry.ready = true; entry.pending.splice(0).forEach((run) => run()); };
    image.onerror = () => { entry.pending.length = 0; };
    image.src = `/wellspring/${name}.png`;
  }
  const entry = sheets.get(name);
  const run = () => {
    const [x, y, w, h] = rect;
    const c = canvas(w, h), g = c.getContext('2d');
    g.drawImage(entry.image, x, y, w, h, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const source = WELL.map(rgb), target = typeof palette === 'function' ? null : palette.map(rgb);
    for (let i = 0; i < data.data.length; i += 4) {
      if (!data.data[i + 3]) continue;
      const distances = source.map((p) => p.reduce((d, v, k) => d + (v - data.data[i + k]) ** 2, 0));
      const ink = distances.indexOf(Math.min(...distances));
      data.data.set(target ? target[ink] : rgb(palette(ink, (i / 4) % w, Math.floor(i / 4 / w))), i);
    }
    g.putImageData(data, 0, 0); draw(c);
  };
  if (entry.ready) run(); else entry.pending.push(run);
}

export function wellSpriteMask({ data, width, height }) {
  const stride = width + 2, mask = new Uint8Array(stride * (height + 2));
  for (let y = 0; y < height; y++) {
    let left = width, right = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]) { left = Math.min(left, x); right = x; }
    }
    if (right < left) continue;
    for (let row = y; row <= y + 2; row++) mask.fill(1, row * stride + left, row * stride + right + 3);
  }
  return mask;
}

export function wellGem(ctx, x, y, scale = 1, accent = WELL[2]) {
  GEM.forEach((row, j) => [...row].forEach((v, i) => {
    if (v === '.') return;
    ctx.fillStyle = v === '#' ? WELL[1] : accent;
    ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
  }));
}

export function wellMarble(c) {
  const tones = [.28, .55, .83, 1].map((v) => `#${new THREE.Color(c.main).multiplyScalar(v).getHexString()}`);
  const frames = Array.from({ length: 32 }, (_, frame) => {
    const image = canvas(128, 64), g = image.getContext('2d');
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      let band = y < 12 || y > 56 ? 1 : y > 44 ? 2 : 3;
      const sy = (y + frame * 2) % 64, row = Math.floor(sy / 8);
      if (sy % 8 === 7 || (x + (row % 2) * 8) % 16 === 15) band = 0;
      else if ((x + (row % 2) * 8) % 16 < 3) band = 2;
      g.fillStyle = tones[band]; g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 4; i++) wellGem(g, i * 32 + 8, (i * 17 + frame * 2) % 64, 2, tones[1]);
    return image;
  });
  const map = new THREE.CanvasTexture(frames[0]);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let lastFrame = 0;
  return {
    map, roughness: 1, clearcoat: 0, specularIntensity: 0, envMapIntensity: 0, toneMapped: false,
    onBeforeCompile: (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>');
    },
    customProgramCacheKey: () => 'wellspring-freefall-ink',
    animate: (material, t) => {
      const frame = motion?.matches ? 0 : Math.floor(t * 8) % frames.length;
      if (frame === lastFrame) return;
      map.image = frames[frame]; map.needsUpdate = true; lastFrame = frame;
    },
  };
}

// Wellspring src/level.ts chunk(): staggered 8px brick courses and chipped mortar.
function hash(a, b, s = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function wellDecorationMask(layout) {
  const holes = [[0, 0], ...layout.RING, ...layout.HOME.flat(), ...layout.BASE.flat()];
  const mask = new Uint8Array(128 * 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const r = (y + .5 - 64) / 32, c = (x + .5 - 64) / 32;
    // Includes the bevel, lip, and half a pixel diagonal, not just the hole's bore.
    const homeStrip = layout.HOME.some((lane) => lane.some(([hr, hc]) => Math.abs(r - hr) < .6 && Math.abs(c - hc) < .6));
    if (!homeStrip && Math.max(Math.abs(r), Math.abs(c)) <= 1.84 && holes.every(([hr, hc]) => Math.hypot(r - hr, c - hc) > .6)) mask[y * 128 + x] = 1;
  }
  return mask;
}

function circle(g, x, y, radius, color) {
  g.fillStyle = color;
  for (let r = -radius; r <= radius; r++) {
    const width = Math.floor(Math.sqrt(radius * radius - r * r));
    g.fillRect(x - width, y + r, width * 2 + 1, 1);
  }
}

function centerFrame(frame, mask) {
  const image = canvas(128, 128), g = image.getContext('2d');
  g.imageSmoothingEnabled = false;
    circle(g, 64, 64, 57, WELL[0]);
    for (let y = 7; y < 122; y++) for (let x = 7; x < 122; x++) {
      const radius = Math.hypot(x - 64, y - 64), angle = Math.atan2(y - 64, x - 64);
      if (radius < 22 || radius > 56) continue;
      const ring = Math.floor((56 - radius) / 8), mortar = (56 - radius) % 8 < 1.5 || ((angle + Math.PI) * (12 - ring * 2) / Math.PI + ring * .5) % 1 < .09;
      g.fillStyle = mortar ? WELL[0] : ['#aaa499', '#716c69', '#494650', WELL[3], '#17151e'][ring];
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 7; i++) {
      const depth = ((frame + i * 3) % 16) / 16, angle = i * 2.4;
      const radius = 44 - depth * 23;
      wellGem(g, Math.round(62 + Math.cos(angle) * radius), Math.round(62 + Math.sin(angle) * radius), 1, i % 2 ? WELL[3] : WELL[2]);
    }
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return image;
}

export function wellBoard(layout) {
  const image = canvas(256, 256), g = image.getContext('2d'), center = 128, k = 12.8;
  g.fillStyle = WELL[3]; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const row = y >> 2, bx = (x + (row & 1) * 4) >> 3, hb = hash(bx, row, 7);
    const vm = ((x + (row & 1) * 4) & 7) === 7, hm = (y & 3) === 3;
    const mortar = (hm && hb < .8) || (vm && !hm && hb < .62) || (hb > .93 && ((x + (row & 1) * 4) & 7) === 3 && (y & 3) === 1);
    g.fillStyle = mortar ? WELL[0] : hb > .65 ? '#514c59' : '#3d3947'; g.fillRect(x, y, 1, 1);
  }
  for (const [r, c] of [...layout.RING, ...layout.HOME.flat()]) {
    const x = Math.round(center + c * k), y = Math.round(center + r * k);
    g.fillStyle = WELL[0]; g.fillRect(x - 5, y - 5, 11, 11);
    g.strokeStyle = WELL[1]; g.strokeRect(x - 5.5, y - 5.5, 11, 11);
  }
  const mask = canvas(128, 128), mg = mask.getContext('2d');
  mg.fillStyle = '#ffffff';
  wellDecorationMask(layout).forEach((allowed, i) => { if (allowed) mg.fillRect(i % 128, Math.floor(i / 128), 1, 1); });
  const frames = Array.from({ length: 16 }, (_, i) => centerFrame(i, mask));
  const centerImage = canvas(128, 128), cg = centerImage.getContext('2d');
  const centerMap = new THREE.CanvasTexture(centerImage);
  centerMap.colorSpace = THREE.SRGBColorSpace;
  centerMap.magFilter = centerMap.minFilter = THREE.NearestFilter;
  centerMap.generateMipmaps = false;
  let lastFrame = -1;
  const arm = canvas(1024, 1024), ag = arm.getContext('2d'), armMap = new THREE.CanvasTexture(arm);
  armMap.colorSpace = THREE.SRGBColorSpace; armMap.magFilter = armMap.minFilter = THREE.NearestFilter;
  armMap.generateMipmaps = false;
  sprite('minion', [1, 1, 9, 13], WELL, (stamp) => {
    const backed = canvas(stamp.width + 2, stamp.height + 2), bg = backed.getContext('2d');
    const mask = wellSpriteMask(stamp.getContext('2d').getImageData(0, 0, stamp.width, stamp.height));
    bg.fillStyle = WELL[0];
    mask.forEach((filled, i) => { if (filled) bg.fillRect(i % backed.width, Math.floor(i / backed.width), 1, 1); });
    bg.drawImage(stamp, 1, 1);
    ag.imageSmoothingEnabled = false;
    ag.drawImage(backed, 544, 652, 44, 60);
    armMap.needsUpdate = true;
  });
  return {
    canvas: image, repeat: .05, pixel: true, side: WELL[3], dish: WELL[3], felt: WELL[0], cup: WELL[0],
    roughness: .65, clearcoat: .2, params: { specularIntensity: .3, clearcoatRoughness: .3 },
    accent: { color: WELL[3], metalness: 0, roughness: .8 },
    shaderCommon: 'uniform sampler2D uWellCenter;\nuniform sampler2D uWellArm;', uniforms: { uWellCenter: { value: centerMap }, uWellArm: { value: armMap } },
    shader: `{
      vec2 q = vSkinPos.xz;
      if (vSkinTop > 0.95) {
        vec4 imp = texture2D(uWellArm, vec2(q.x, -q.y) / 20.0 + 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, imp.rgb, imp.a);
      }
      if (vSkinTop > 0.95 && max(abs(q.x), abs(q.y)) < 2.0) {
        vec4 art = texture2D(uWellCenter, vec2(q.x, -q.y) / 4.0 + 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, art.rgb, art.a);
        totalEmissiveRadiance = art.rgb * art.a * 0.15;
      }
    }`,
    animate: (materials) => {
      const frame = Math.floor((materials.board.userData.skinTime?.value || 0) * 8) % 16;
      if (frame === lastFrame) return;
      cg.clearRect(0, 0, 128, 128); cg.drawImage(frames[frame], 0, 0);
      centerMap.needsUpdate = true; lastFrame = frame;
    },
  };
}

export function wellPips(ctx, value, size, positions) {
  ctx.fillStyle = WELL[0]; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = WELL[3]; ctx.lineWidth = 8; ctx.strokeRect(12, 12, size - 24, size - 24);
  positions.forEach(([x, y]) => wellGem(ctx, Math.round(x * size) - 25, Math.round(y * size) - 25, 10));
}

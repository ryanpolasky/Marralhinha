import { makeCanvas, seeded } from './textures';

// Shades sit within a few percent of each other on purpose: the texel noise should read as material, not confetti
export const BLOCK_PALETTES = {
  grass: ['#5f9a3a', '#639f3d', '#5c963a', '#66a340', '#619c3c'],
  dirt: ['#8a6342', '#8f6845', '#866040', '#926b48'],
  stone: ['#7e7f7a', '#838480', '#7a7b76', '#86877f'],
  cobble: ['#7a7c78', '#80827e', '#767874', '#858783'],
  planks: ['#b48c54', '#b89058', '#b08851', '#bb935c'],
  spruce: ['#7d5b36', '#815f39', '#795733', '#85633c'],
  roof: ['#6e4c2c', '#72502f', '#6a4829', '#75532f'],
  leaves: ['#3f7a2e', '#427f31', '#3c742c', '#448334'],
  bark: ['#5a4229', '#5e4630', '#564027', '#604832'],
  sand: ['#dccf9f', '#dfd3a4', '#d9cc9b', '#e2d6a8'],
  gravel: ['#7c7673', '#827c79', '#777170', '#86807c'],
  wool: ['#ebebe6', '#efefeb', '#e6e6e1', '#f2f2ee'],
};

export const ORES = [
  { name: 'redstone', dark: '#5c0a0a', main: '#c81818', light: '#ff5a4a' },
  { name: 'lapis', dark: '#0b2266', main: '#2350c8', light: '#6a98ff' },
  { name: 'gold', dark: '#7a5208', main: '#e8b82a', light: '#fff3a0' },
  { name: 'emerald', dark: '#0a4a26', main: '#17b85a', light: '#8affc0' },
];

const pick = (rand, palette) => palette[Math.floor(rand() * palette.length)];

function noise(ctx, rand, palette, x0 = 0, y0 = 0, w = 16, h = 16) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    ctx.fillStyle = pick(rand, palette);
    ctx.fillRect(x, y, 1, 1);
  }
}

const px = (ctx, x, y, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
};

const rect = (ctx, x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

const CHEST = ['#a87a3c', '#ad7f40', '#a37538', '#b08243'];

// Material noise inside a one-pixel frame, the way furniture blocks are outlined
function framed(ctx, rand, palette, edge) {
  noise(ctx, rand, palette);
  rect(ctx, 0, 0, 16, 1, edge);
  rect(ctx, 0, 15, 16, 1, edge);
  rect(ctx, 0, 0, 1, 16, edge);
  rect(ctx, 15, 0, 1, 16, edge);
}

// Cells around a few seeds, mortar where two cells meet: reads as rounded cobbles at 16px
function cobble(ctx, rand, palette, mortar) {
  const seeds = Array.from({ length: 11 }, () => [rand() * 16, rand() * 16, pick(rand, palette)]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = seeds.map(([sx, sy, c]) => {
      const dx = Math.min(Math.abs(x - sx), 16 - Math.abs(x - sx));
      const dy = Math.min(Math.abs(y - sy), 16 - Math.abs(y - sy));
      return [dx * dx + dy * dy, c];
    }).sort((a, b) => a[0] - b[0]);
    const edge = Math.sqrt(d[1][0]) - Math.sqrt(d[0][0]) < 1.1;
    px(ctx, x, y, edge ? mortar : rand() > 0.9 ? '#8d8f8b' : d[0][1]);
  }
}

const ORE_SHAPES = [
  [[1, 0, 1], [2, 0, 2], [0, 1, 1], [1, 1, 1], [2, 1, 0], [1, 2, 0]],
  [[0, 0, 1], [1, 0, 2], [0, 1, 0], [1, 1, 1], [2, 1, 1]],
  [[1, 0, 2], [0, 1, 1], [1, 1, 1], [2, 1, 1], [1, 2, 0]],
  [[0, 0, 2], [1, 0, 1], [1, 1, 0], [3, 1, 1]],
];
const ORE_SPOTS = [[2, 2], [9, 1], [12, 6], [5, 7], [1, 11], [8, 11], [12, 13]];

// One 16px ore block; the glow canvas lights only the ore pixels
export function oreBlockCanvases(seat, customOre = null) {
  const ore = customOre ? { name: 'custom', dark: customOre.dark, main: customOre.main, light: customOre.light } : ORES[seat % ORES.length];
  const [base, ctx] = makeCanvas(16, 16);
  const [glow, light] = makeCanvas(16, 16);
  const rand = seeded(311 + seat * 47);
  noise(ctx, rand, BLOCK_PALETTES.stone);
  for (let i = 0; i < 9; i++) px(ctx, Math.floor(rand() * 16), Math.floor(rand() * 16), '#5a5b57');
  light.fillStyle = '#000';
  light.fillRect(0, 0, 16, 16);
  const shapeFor = (i) => (ore.name === 'emerald' ? ORE_SHAPES[2] : ore.name === 'redstone' ? ORE_SHAPES[i % 2 ? 3 : 1] : ORE_SHAPES[i % 2]);
  ORE_SPOTS.forEach(([cx, cy], i) => shapeFor(i).forEach(([dx, dy, tone]) => {
    const x = (cx + dx) % 16;
    const y = (cy + dy) % 16;
    px(ctx, x, y, [ore.dark, ore.main, ore.light][tone]);
    if (tone) px(light, x, y, tone === 2 ? ore.light : ore.main);
  }));
  return [base, glow];
}

const TEXTURES = {
  grass: (ctx, rand) => noise(ctx, rand, BLOCK_PALETTES.grass),
  dirt: (ctx, rand) => noise(ctx, rand, BLOCK_PALETTES.dirt),
  grassSide: (ctx, rand) => {
    noise(ctx, rand, BLOCK_PALETTES.dirt);
    for (let x = 0; x < 16; x++) {
      const drip = 3 + (rand() > 0.6 ? 1 : 0) + (rand() > 0.85 ? 1 : 0);
      noise(ctx, rand, BLOCK_PALETTES.grass, x, 0, 1, drip);
    }
  },
  stone: (ctx, rand) => noise(ctx, rand, BLOCK_PALETTES.stone),
  cobble: (ctx, rand) => cobble(ctx, rand, BLOCK_PALETTES.cobble, '#626460'),
  planks: (ctx, rand) => {
    noise(ctx, rand, BLOCK_PALETTES.planks);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (y % 4 === 3 || (y % 4 !== 3 && x === (Math.floor(y / 4) % 2 ? 4 : 11))) px(ctx, x, y, '#90703f');
    }
  },
  spruce: (ctx, rand) => {
    noise(ctx, rand, BLOCK_PALETTES.spruce);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (y % 4 === 3 || (y % 4 !== 3 && x === (Math.floor(y / 4) % 2 ? 4 : 11))) px(ctx, x, y, '#5e4126');
    }
  },
  roof: (ctx, rand) => {
    noise(ctx, rand, BLOCK_PALETTES.roof);
    for (let x = 0; x < 16; x++) [3, 7, 11, 15].forEach((y) => px(ctx, x, y, '#573b21'));
  },
  logSide: (ctx, rand) => {
    for (let x = 0; x < 16; x++) {
      const col = x % 3 === 0 ? '#4c3722' : pick(rand, BLOCK_PALETTES.bark);
      for (let y = 0; y < 16; y++) px(ctx, x, y, rand() > 0.85 ? pick(rand, BLOCK_PALETTES.bark) : col);
    }
  },
  logTop: (ctx, rand) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(ctx, x, y, ring > 6.5 ? pick(rand, BLOCK_PALETTES.bark) : Math.floor(ring) % 2 ? '#b8935a' : '#9c7742');
    }
  },
  leaves: (ctx, rand) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (rand() > 0.2) px(ctx, x, y, pick(rand, BLOCK_PALETTES.leaves));
  },
  mossy: (ctx, rand) => {
    cobble(ctx, rand, BLOCK_PALETTES.cobble, '#626460');
    for (let i = 0; i < 40; i++) px(ctx, Math.floor(rand() * 16), Math.floor(rand() * 16), pick(rand, ['#6f8a4a', '#6b8546']));
  },
  sand: (ctx, rand) => noise(ctx, rand, BLOCK_PALETTES.sand),
  gravel: (ctx, rand) => noise(ctx, rand, BLOCK_PALETTES.gravel),
  wool: (ctx, rand) => noise(ctx, rand, BLOCK_PALETTES.wool),
  farmland: (ctx, rand) => {
    noise(ctx, rand, ['#5a3b22', '#5e3f25', '#563820']);
    for (let x = 0; x < 16; x++) [1, 5, 9, 13].forEach((y) => px(ctx, x, y, '#47301b'));
  },
  water: (ctx, rand) => {
    noise(ctx, rand, ['#3566c0', '#396bc6', '#3262ba']);
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(rand() * 14);
      const y = Math.floor(rand() * 16);
      ['#5f8ad8', '#6f98e0', '#5f8ad8'].forEach((c, k) => px(ctx, x + k, y, c));
    }
  },
  glass: (ctx) => {
    ctx.fillStyle = '#dff3ff';
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    [[3, 4], [4, 3], [5, 2], [10, 12], [11, 11]].forEach(([x, y]) => px(ctx, x, y, '#ffffff'));
  },
  rail: (ctx) => {
    for (let y = 1; y < 16; y += 4) {
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(1, y, 14, 2);
    }
    ctx.fillStyle = '#9a9b97';
    ctx.fillRect(3, 0, 2, 16);
    ctx.fillRect(11, 0, 2, 16);
    ctx.fillStyle = '#c9cac5';
    ctx.fillRect(3, 0, 1, 16);
    ctx.fillRect(11, 0, 1, 16);
  },
  craftTop: (ctx, rand) => {
    TEXTURES.planks(ctx, rand);
    ctx.fillStyle = '#4e3418';
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    [5, 10].forEach((p) => {
      ctx.fillRect(p, 1, 1, 14);
      ctx.fillRect(1, p, 14, 1);
    });
  },
  craftSide: (ctx, rand) => {
    TEXTURES.planks(ctx, rand);
    ctx.fillStyle = '#3d2a14';
    ctx.fillRect(0, 0, 16, 3);
    ctx.fillStyle = '#9a9b97';
    ctx.fillRect(3, 6, 1, 7);
    ctx.fillRect(2, 6, 3, 2);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(11, 7, 1, 6);
    ctx.fillStyle = '#c9cac5';
    ctx.fillRect(10, 5, 4, 2);
  },
  chestTop: (ctx, rand) => framed(ctx, rand, CHEST, '#5a3a18'),
  chestSide: (ctx, rand) => {
    framed(ctx, rand, CHEST, '#5a3a18');
    rect(ctx, 1, 5, 14, 1, '#5a3a18');
  },
  chestFront: (ctx, rand) => {
    TEXTURES.chestSide(ctx, rand);
    rect(ctx, 7, 4, 2, 4, '#c9cac5');
    rect(ctx, 7, 6, 2, 1, '#6e706b');
  },
  furnaceTop: (ctx, rand) => {
    framed(ctx, rand, BLOCK_PALETTES.stone, '#62645f');
    rect(ctx, 3, 3, 10, 10, '#8a8c86');
    noise(ctx, rand, BLOCK_PALETTES.stone, 4, 4, 8, 8);
  },
  furnaceSide: (ctx, rand) => {
    framed(ctx, rand, BLOCK_PALETTES.stone, '#62645f');
    rect(ctx, 1, 1, 14, 2, '#6c6e69');
  },
  furnaceFront: (ctx, rand) => {
    TEXTURES.furnaceSide(ctx, rand);
    rect(ctx, 4, 4, 8, 1, '#4f514c');
    rect(ctx, 3, 8, 10, 6, '#4f514c');
    rect(ctx, 4, 9, 8, 4, '#232422');
    rect(ctx, 4, 12, 8, 1, '#363734');
  },
  tuft: (ctx, rand) => {
    for (let i = 0; i < 7; i++) {
      const x = 1 + Math.floor(rand() * 14);
      const h = 5 + Math.floor(rand() * 8);
      for (let y = 16 - h; y < 16; y++) px(ctx, x + (y < 16 - h / 2 && rand() > 0.6 ? 1 : 0), y, pick(rand, BLOCK_PALETTES.grass));
    }
  },
  poppy: (ctx) => {
    ctx.fillStyle = '#3f7a2a';
    ctx.fillRect(7, 8, 2, 8);
    ctx.fillRect(5, 11, 2, 1);
    [[6, 4], [7, 4], [8, 4], [9, 4], [6, 5], [9, 5], [6, 6], [7, 6], [8, 6], [9, 6], [7, 3], [8, 3]].forEach(([x, y]) => px(ctx, x, y, '#d42a20'));
    px(ctx, 7, 5, '#2a1208');
    px(ctx, 8, 5, '#2a1208');
  },
  dandelion: (ctx) => {
    ctx.fillStyle = '#3f7a2a';
    ctx.fillRect(7, 9, 2, 7);
    ctx.fillRect(9, 12, 2, 1);
    [[7, 6], [8, 6], [6, 7], [7, 7], [8, 7], [9, 7], [7, 8], [8, 8]].forEach(([x, y]) => px(ctx, x, y, '#f4d23a'));
    px(ctx, 7, 7, '#fff3a0');
  },
  wheat: (ctx, rand) => {
    for (let i = 0; i < 5; i++) {
      const x = 1 + i * 3;
      for (let y = 4; y < 16; y++) px(ctx, x, y, y < 9 ? (rand() > 0.5 ? '#d8b84a' : '#c49a2e') : '#9a8a2a');
    }
  },
  sprout: (ctx, rand) => {
    for (let i = 0; i < 5; i++) {
      const x = 1 + i * 3;
      for (let y = 9; y < 16; y++) px(ctx, x, y, rand() > 0.4 ? '#4f9a2c' : '#6ab33a');
    }
  },
};

export function blockCanvas(kind, seed = 731) {
  const [canvas, ctx] = makeCanvas(16, 16);
  const rand = seeded(seed);
  if (kind.startsWith('ore')) return oreBlockCanvases(+kind.slice(3))[0];
  (TEXTURES[kind] || TEXTURES.stone)(ctx, rand);
  return canvas;
}

// A few grass variants, so neither the board nor the table tiles into a visible pattern
const grassVariants = () => Array.from({ length: 6 }, (_, i) => blockCanvas('grass', 731 + i * 37));

const SLOT = ['#9c7643', '#a07a46', '#a47e49', '#9f7945'];

// A 3x3 block crafting table top: dark frame, nine bevelled slots, the center hole landing in the middle one
function craftingTable(ctx, rand, x0, y0) {
  rect(ctx, x0, y0, 48, 48, '#4e3418');
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = x0 + 2 + col * 15;
    const y = y0 + 2 + row * 15;
    noise(ctx, rand, SLOT, x, y, 14, 14);
    rect(ctx, x, y, 14, 1, '#6e5029');
    rect(ctx, x, y, 1, 14, '#6e5029');
    rect(ctx, x + 1, y + 13, 13, 1, '#c29c62');
    rect(ctx, x + 13, y + 1, 1, 13, '#c29c62');
  }
}

// An oak deck, block for block: oak planks with the track laid in darker spruce, and a crafting table in the middle
export function firstNightCanvas(layout) {
  const [canvas, ctx] = makeCanvas(320, 320);
  const rand = seeded(1201);
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 320; y += 16) for (let x = 0; x < 320; x += 16) ctx.drawImage(blockCanvas('planks', 700 + Math.floor(rand() * 5)), x, y);
  layout.RING.forEach(([r, c], i) => ctx.drawImage(blockCanvas('spruce', 400 + (i % 5)), 160 + c * 16 - 8, 160 - r * 16 - 8));
  craftingTable(ctx, rand, 136, 136);
  return canvas;
}

// Growth rings for the tray tops, one pixel per sixteenth of a unit so they match the board's blocks
export function stumpCanvas(dishR) {
  const S = Math.ceil((dishR * 2 + 0.6) * 16);
  const [canvas, ctx] = makeCanvas(S, S);
  const rand = seeded(77);
  const mid = S / 2;
  const edge = dishR * 16;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - mid, y + 0.5 - mid) + (rand() - 0.5) * 0.8;
    const bark = d > edge - 2.5;
    const ring = Math.floor(d / 2.6) % 2;
    px(ctx, x, y, bark ? pick(rand, BLOCK_PALETTES.bark) : ring ? pick(rand, ['#b58f56', '#b9935a']) : pick(rand, ['#a68149', '#aa854d']));
  }
  return [canvas, 1 / (S / 16)];
}

export function grassFieldCanvas() {
  const [canvas, ctx] = makeCanvas(64, 64);
  const grass = grassVariants();
  const rand = seeded(909);
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) ctx.drawImage(pick(rand, grass), x, y);
  return canvas;
}

// Flat pixel clouds: a handful of slabs each, drawn from a seeded blob
export function cloudShapes(count, seed = 404) {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const cells = [];
    const w = 4 + Math.floor(rand() * 3);
    const d = 2 + Math.floor(rand() * 2);
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if (rand() > 0.22 || (x > 0 && x < w - 1)) cells.push([x - w / 2 + 0.5, z - d / 2 + 0.5]);
    return { cells, x: (i % 2 ? 1 : -1) * (15.5 + rand() * 5), z: -24 + (i / count) * 48 + rand() * 4, y: 7 + rand() * 1.5, speed: 0.35 + rand() * 0.2 };
  });
}

// Die faces are crafting grids on a 32px grid: a plank top, a dark frame and nine inset slots
export function workbenchFace(ctx, size, value) {
  const p = size / 32;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(blockCanvas('planks', 960 + value), 0, 0, size, size);
  ctx.fillStyle = '#4e3418';
  ctx.fillRect(0, 0, size, p * 2);
  ctx.fillRect(0, size - p * 2, size, p * 2);
  ctx.fillRect(0, 0, p * 2, size);
  ctx.fillRect(size - p * 2, 0, p * 2, size);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = (2 + col * 10) * p;
    const y = (2 + row * 10) * p;
    ctx.fillStyle = '#9a7443';
    ctx.fillRect(x, y, p * 8, p * 8);
    ctx.fillStyle = '#b48c54';
    ctx.fillRect(x + p, y + p, p * 7, p * 7);
    ctx.fillStyle = '#a7804b';
    ctx.fillRect(x + p, y + p, p * 6, p * 6);
  }
}

const GEM = ['.000000.', '02211110', '02111110', '01111110', '01111110', '01111110', '01111110', '.000000.'];

// Pip spots already sit on a 3x3 grid, so each pip becomes a gem in its crafting slot
export function workbenchPips(ctx, pips, size, color) {
  const p = size / 32;
  const tones = color === '#fff' ? ['#fff', '#fff', '#fff'] : [color.dark, color.main, color.light];
  pips.forEach(([px, py]) => {
    const col = Math.round((px - 0.27) / 0.23);
    const row = Math.round((py - 0.27) / 0.23);
    const x0 = (2 + col * 10) * p;
    const y0 = (2 + row * 10) * p;
    GEM.forEach((line, y) => [...line].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = tones[+ch];
      ctx.fillRect(x0 + x * p, y0 + y * p, p, p);
    }));
  });
}

export function minecraftScenery(layout) {
  const edge = Math.max(layout.spec.halfLength + 1.6, Math.max(...layout.spec.baseCenter) + layout.spec.dishR + 1.7);
  return [
    { kind: 'grove', at: [-edge, -edge] },
    { kind: 'house', at: [edge, -edge] },
    { kind: 'mine', at: [-edge, edge] },
    { kind: 'farm', at: [edge, edge] },
  ];
}

// True when a footprint centered at (x, z) stays clear of the board cross, the trays and the die spots
export function clearOfPlay(layout, x, z, hw = 0.25, hd = hw) {
  const w = layout.spec.halfWidth + 0.2;
  const l = layout.spec.halfLength + 0.2;
  const offCross = (Math.abs(x) - hw > w || Math.abs(z) - hd > l) && (Math.abs(x) - hw > l || Math.abs(z) - hd > w);
  const gap = ([r, c]) => Math.hypot(Math.max(0, Math.abs(c - x) - hw), Math.max(0, Math.abs(r - z) - hd));
  return offCross && layout.BASE_TRAY.every((p) => gap(p) > layout.spec.dishR + 0.2) && layout.DIE_SPOT.every((p) => gap(p) > 0.85);
}

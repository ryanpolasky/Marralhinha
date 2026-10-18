const SEAT_COLORS = [
  { id: 'red', name: 'Red', main: '#e03a3e', light: '#ff8a8a', dark: '#8c1116', classicSeat: 0 },
  { id: 'blue', name: 'Blue', main: '#2f7de1', light: '#8cc2ff', dark: '#123f7a', classicSeat: 1 },
  { id: 'yellow', name: 'Yellow', main: '#f4b400', light: '#ffe38a', dark: '#8a6100', classicSeat: 2 },
  { id: 'green', name: 'Green', main: '#2e9e55', light: '#8ee0a8', dark: '#12532a', classicSeat: 3 },
];

const COLOR_PALETTE = [
  ...SEAT_COLORS,
  { id: 'violet', name: 'Violet', main: '#8b4dff', light: '#c9adff', dark: '#3f1690' },
  { id: 'pink', name: 'Bubblegum', main: '#f0489a', light: '#ffa3d0', dark: '#84144c' },
  { id: 'orange', name: 'Tangerine', main: '#f26a1b', light: '#ffb788', dark: '#8a3104' },
  { id: 'teal', name: 'Teal', main: '#16b5a5', light: '#84f2e6', dark: '#085c53' },
  { id: 'cyan', name: 'Sky', main: '#18a8e8', light: '#92dfff', dark: '#094e73' },
  { id: 'lime', name: 'Lime', main: '#7ec81e', light: '#c7f285', dark: '#3b6607' },
  { id: 'magenta', name: 'Orchid', main: '#c83ce0', light: '#eea0fc', dark: '#661278' },
  { id: 'coral', name: 'Coral', main: '#ff5d47', light: '#ffb0a3', dark: '#8c2214' },
  { id: 'indigo', name: 'Indigo', main: '#4f52e8', light: '#a5a7ff', dark: '#1f217d' },
  { id: 'mint', name: 'Mint', main: '#2fd483', light: '#9ff5c8', dark: '#0f683c' },
  { id: 'gold', name: 'Honey', main: '#d98a16', light: '#ffd080', dark: '#6e4004' },
  { id: 'slate', name: 'Silver', main: '#8699ad', light: '#d0dce8', dark: '#384452' },
  { id: 'obsidian', name: 'Obsidian', main: '#1a1c24', light: '#687086', dark: '#07080c' },
  { id: 'ghost', name: 'Ghost', main: '#eef2f8', light: '#ffffff', dark: '#8a95a8' },
];

const COLOR_BY_ID = Object.fromEntries(COLOR_PALETTE.map((c) => [c.id, c]));

const RAINBOW = { id: 'rainbow', name: 'Rainbow', main: '#e03a3e', light: '#ff8a8a', dark: '#8c1116', rainbow: true };

const TABLE_PALETTES = [
  { id: 'classic', name: 'Classic', desc: 'Red, Blue, Yellow & Green', colors: [null, null, null, null] },
  { id: 'neon', name: 'Neon', desc: 'Orchid, Sky, Lime & Tangerine', colors: ['magenta', 'cyan', 'lime', 'orange'] },
  { id: 'candy', name: 'Candy', desc: 'Bubblegum, Indigo, Honey & Mint', colors: ['pink', 'indigo', 'gold', 'mint'] },
  { id: 'dusk', name: 'Dusk', desc: 'Violet, Coral, Mint & Obsidian', colors: ['violet', 'coral', 'mint', 'obsidian'] },
  { id: 'eclipse', name: 'Eclipse', desc: 'Obsidian, Tangerine, Ghost & Indigo', colors: ['obsidian', 'orange', 'ghost', 'indigo'] },
];

const TABLE_PALETTE_BY_ID = Object.fromEntries(TABLE_PALETTES.map((p) => [p.id, p]));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function normalizeHex(hex) {
  if (typeof hex !== 'string') return null;
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toLowerCase()}`;
  }
  return null;
}

function hexToRgb(hex) {
  const full = (normalizeHex(hex) || '#e03a3e').slice(1);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

function rgbToHex([r, g, b]) {
  const byte = (v) => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [toSrgb(lr), toSrgb(lg), toSrgb(lb)];
}

function hexToOklch(hex) {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, h };
}

function oklchToHex({ L, C, h }) {
  const rad = (h * Math.PI) / 180;
  const rgb = oklabToRgb([L, Math.cos(rad) * C, Math.sin(rad) * C]);
  return rgbToHex(rgb.map((v) => clamp(v, 0, 1)));
}

function colorDistance(a, b) {
  const hexA = typeof a === 'string' ? a : a?.main;
  const hexB = typeof b === 'string' ? b : b?.main;
  if (!hexA || !hexB) return 100;
  const [L1, a1, b1] = rgbToOklab(hexToRgb(hexA));
  const [L2, a2, b2] = rgbToOklab(hexToRgb(hexB));
  return Math.round(Math.hypot((L1 - L2) * 0.85, (a1 - a2) * 1.15, (b1 - b2) * 1.15) * 1000) / 10;
}

function nearestNamedColor(hex) {
  let best = COLOR_PALETTE[0];
  let bestDist = Infinity;
  for (const entry of COLOR_PALETTE) {
    const d = colorDistance(hex, entry.main);
    if (d < bestDist) {
      bestDist = d;
      best = entry;
    }
  }
  return { entry: best, distance: bestDist };
}

// Unrestricted hex -> triplet for Dev & host overrides: keeps exact main hex and derives light/dark highlights
function rawTripletFromHex(hex, customName = null) {
  const main = normalizeHex(hex);
  if (!main) return null;
  const { L, C, h } = hexToOklch(main);
  const light = oklchToHex({ L: clamp(Math.max(L + 0.22, 0.38), 0.35, 0.96), C: C * 0.72, h });
  const dark = oklchToHex({ L: clamp(Math.min(L - 0.22, 0.62), 0.06, 0.65), C: C * 0.88, h });
  const nearest = nearestNamedColor(main);
  const name = customName ? String(customName).slice(0, 20) : nearest.distance < 4 ? nearest.entry.name : main.toUpperCase();
  return { id: `hex:${main}`, name, main, light, dark, custom: true };
}

function resolveColorSpec(spec) {
  if (spec === null || spec === undefined || spec === '' || spec === 'classic') return null;
  if (spec === 'rainbow' || spec?.id === 'rainbow') return { ...RAINBOW };
  if (typeof spec === 'string') {
    if (COLOR_BY_ID[spec]) return { ...COLOR_BY_ID[spec] };
    return rawTripletFromHex(spec);
  }
  if (typeof spec === 'object' && spec.main) {
    if (COLOR_BY_ID[spec.id]) return { ...COLOR_BY_ID[spec.id] };
    return rawTripletFromHex(spec.main, spec.name);
  }
  return null;
}

module.exports = {
  SEAT_COLORS,
  COLOR_PALETTE,
  COLOR_BY_ID,
  RAINBOW,
  TABLE_PALETTES,
  TABLE_PALETTE_BY_ID,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToOklab,
  oklabToRgb,
  hexToOklch,
  oklchToHex,
  colorDistance,
  nearestNamedColor,
  rawTripletFromHex,
  resolveColorSpec,
};

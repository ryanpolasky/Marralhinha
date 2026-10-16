import { SEAT_COLORS } from './geometry';
import shared from '../shared/colors';

export const CLASSIC_IDS = ['red', 'blue', 'yellow', 'green'];
export const COLOR_PALETTE = shared.COLOR_PALETTE;
export const COLOR_BY_ID = shared.COLOR_BY_ID;
export const TABLE_PALETTES = shared.TABLE_PALETTES;
export const TABLE_PALETTE_BY_ID = shared.TABLE_PALETTE_BY_ID;
export const hexToRgb = shared.hexToRgb;
export const rgbToHex = shared.rgbToHex;
export const rgbToOklab = shared.rgbToOklab;
export const oklabToRgb = shared.oklabToRgb;
export const hexToOklch = shared.hexToOklch;
export const oklchToHex = shared.oklchToHex;
export const colorDistance = shared.colorDistance;
export const nearestNamedColor = shared.nearestNamedColor;
export const rawTripletFromHex = shared.rawTripletFromHex;
export const resolveColorSpec = shared.resolveColorSpec;

export const MIN_LOBBY_DIST = 18;
export const GOOD_LOBBY_DIST = 25;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

const CVD_MATRICES = {
  none: null,
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulateCvdHex(hex, mode = 'none') {
  const mat = CVD_MATRICES[mode];
  if (!mat) return hex;
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const out = mat.map(([mr, mg, mb]) => toSrgb(clamp(mr * r + mg * g + mb * b, 0, 1)));
  return rgbToHex(out);
}

export function tripletFromHex(hex, customName = null) {
  const raw = hexToOklch(hex);
  const L = clamp(raw.L, 0.46, 0.78);
  const C = clamp(raw.C, 0.02, 0.27);
  const h = raw.h;
  const main = oklchToHex({ L, C, h });
  const light = oklchToHex({ L: clamp(L + 0.19, 0.72, 0.91), C: C * 0.68, h });
  const dark = oklchToHex({ L: clamp(L - 0.24, 0.22, 0.46), C: clamp(C * 0.88, 0.02, 0.22), h });
  const nearest = nearestNamedColor(main);
  const name = customName || (nearest.distance < 8 ? nearest.entry.name : `Custom ${nearest.entry.name}`);
  return { id: `custom:${main}`, name, main, light, dark, custom: true, rawHex: hex };
}

export function resolveSpecToTriplet(spec, seat = 0) {
  if (!spec || spec === 'classic') return { ...SEAT_COLORS[seat], id: CLASSIC_IDS[seat], classicSeat: seat };
  if (typeof spec === 'string') {
    if (COLOR_BY_ID[spec]) return COLOR_BY_ID[spec];
    if (spec.startsWith('#')) return rawTripletFromHex(spec);
  }
  if (typeof spec === 'object' && spec.main) {
    if (spec.light && spec.dark) return spec;
    return rawTripletFromHex(spec.main, spec.name);
  }
  return { ...SEAT_COLORS[seat], id: CLASSIC_IDS[seat], classicSeat: seat };
}

export function colorsOfRoom(room) {
  const src = room?.colors || room?.game?.colors;
  return [0, 1, 2, 3].map((s) => src?.[s] || room?.seats?.[s]?.color || SEAT_COLORS[s]);
}

export function lobbyPairwiseMatrix(colors, cvd = 'none') {
  const projected = colors.map((c) => (cvd === 'none' ? c.main : simulateCvdHex(c.main, cvd)));
  const pairs = [];
  let minPair = null;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const dist = colorDistance(projected[i], projected[j]);
      const pair = { a: i, b: j, dist, clash: dist < MIN_LOBBY_DIST, close: dist < GOOD_LOBBY_DIST };
      pairs.push(pair);
      if (!minPair || dist < minPair.dist) minPair = pair;
    }
  }
  return { pairs, minPair };
}

export function paletteAvailability(seat, colors, minDist = MIN_LOBBY_DIST) {
  const others = colors.map((c, idx) => ({ seat: idx, color: c })).filter((o) => o.seat !== seat);
  return COLOR_PALETTE.map((swatch) => {
    let closest = null;
    for (const o of others) {
      const dist = colorDistance(swatch.main, o.color.main);
      if (!closest || dist < closest.dist) closest = { seat: o.seat, color: o.color, dist };
    }
    const exactSeat = others.find((o) => o.color.id === swatch.id || colorDistance(swatch.main, o.color.main) < 3);
    const conflict = closest && closest.dist < minDist ? closest : null;
    return {
      swatch,
      takenBy: exactSeat ? exactSeat.seat : null,
      conflictSeat: conflict ? conflict.seat : null,
      minDist: closest ? closest.dist : 100,
      available: !conflict,
    };
  });
}

export function nudgeColorToDistinct(hex, otherColors, minDist = MIN_LOBBY_DIST) {
  const base = tripletFromHex(hex);
  const distToAll = (candidateHex) => Math.min(100, ...otherColors.map((o) => colorDistance(candidateHex, o.main)));
  if (distToAll(base.main) >= minDist) return { triplet: base, nudged: false, deltaE: 0 };

  const start = hexToOklch(base.main);
  let best = null;
  const lOffsets = [0, 0.08, -0.08, 0.14, -0.14];
  const cCandidates = [Math.max(start.C, 0.16), Math.max(start.C, 0.21)];
  for (let step = 6; step <= 180; step += 6) {
    for (const dir of [1, -1]) {
      const h = (start.h + dir * step + 360) % 360;
      for (const dL of lOffsets) {
        for (const C of cCandidates) {
          const L = clamp(start.L + dL, 0.48, 0.77);
          const candidateHex = oklchToHex({ L, C, h });
          const clear = distToAll(candidateHex);
          if (clear >= minDist) {
            const cost = colorDistance(base.main, candidateHex);
            if (!best || cost < best.cost) best = { hex: candidateHex, cost };
          }
        }
      }
    }
    if (best && best.cost < 18) break;
  }
  if (!best) {
    const fallback = COLOR_PALETTE.map((p) => ({ p, clear: distToAll(p.main) })).sort((a, b) => b.clear - a.clear)[0].p;
    return { triplet: fallback, nudged: true, deltaE: colorDistance(base.main, fallback.main) };
  }
  const triplet = tripletFromHex(best.hex);
  return { triplet, nudged: true, deltaE: best.cost };
}

export function resolveLobbyColors(requests, { priorityOrder = [0, 1, 2, 3], strategy = 'nudge', minDist = MIN_LOBBY_DIST } = {}) {
  const resolved = new Array(4);
  const report = new Array(4);
  const locked = [];

  for (const seat of priorityOrder) {
    const wanted = resolveSpecToTriplet(requests[seat], seat);
    let closest = null;
    for (const prev of locked) {
      const d = colorDistance(wanted.main, prev.color.main);
      if (!closest || d < closest.dist) closest = { seat: prev.seat, color: prev.color, dist: d };
    }
    if (!closest || closest.dist >= minDist) {
      resolved[seat] = wanted;
      locked.push({ seat, color: wanted });
      report[seat] = { seat, requested: wanted, final: wanted, status: 'kept', collidedWith: null, distBefore: closest ? closest.dist : 100, distAfter: closest ? closest.dist : 100 };
      continue;
    }

    let final = wanted;
    let status = 'nudged';
    if (strategy === 'nudge') {
      const nudged = nudgeColorToDistinct(wanted.main, locked.map((l) => l.color), minDist);
      final = nudged.triplet;
      status = 'nudged';
    } else if (strategy === 'palette') {
      const candidates = COLOR_PALETTE
        .map((sw) => ({
          sw,
          clear: Math.min(...locked.map((l) => colorDistance(sw.main, l.color.main))),
          drift: colorDistance(wanted.main, sw.main),
        }))
        .filter((c) => c.clear >= minDist)
        .sort((a, b) => a.drift - b.drift);
      final = candidates[0]?.sw || COLOR_PALETTE[seat];
      status = 'swapped';
    } else {
      const classicCandidates = [seat, 0, 1, 2, 3]
        .map((s) => COLOR_PALETTE[s])
        .filter((sw) => Math.min(...locked.map((l) => colorDistance(sw.main, l.color.main))) >= minDist);
      final = classicCandidates[0] || nudgeColorToDistinct(SEAT_COLORS[seat].main, locked.map((l) => l.color), minDist).triplet;
      status = 'classic';
    }
    const distAfter = Math.min(...locked.map((l) => colorDistance(final.main, l.color.main)));
    resolved[seat] = final;
    locked.push({ seat, color: final });
    report[seat] = { seat, requested: wanted, final, status, collidedWith: closest.seat, distBefore: closest.dist, distAfter };
  }

  return { colors: resolved, report };
}

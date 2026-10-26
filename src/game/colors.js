import { SEAT_COLORS } from './geometry';
import shared from '../shared/colors';

export const CLASSIC_IDS = shared.CLASSIC_IDS;
export const COLOR_PALETTE = shared.COLOR_PALETTE;
export const COLOR_BY_ID = shared.COLOR_BY_ID;
export const RAINBOW = shared.RAINBOW;
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

export const MIN_LOBBY_DIST = shared.MIN_LOBBY_DIST;
export const GOOD_LOBBY_DIST = shared.GOOD_LOBBY_DIST;
export const tripletFromHex = shared.tripletFromHex;
export const resolveSpecToTriplet = shared.resolveSpecToTriplet;
export const paletteAvailability = shared.paletteAvailability;
export const nudgeColorToDistinct = shared.nudgeColorToDistinct;
export const resolveLobbyColors = shared.resolveLobbyColors;

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

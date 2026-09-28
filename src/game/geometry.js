// Keep this ring layout in sync with server/game/rules.js

export const SEATS = [0, 1, 2, 3];

export const SEAT_COLORS = [
  { name: 'Red', main: '#e03a3e', light: '#ff8a8a', dark: '#8c1116' },
  { name: 'Blue', main: '#2f7de1', light: '#8cc2ff', dark: '#123f7a' },
  { name: 'Yellow', main: '#f4b400', light: '#ffe38a', dark: '#8a6100' },
  { name: 'Green', main: '#2e9e55', light: '#8ee0a8', dark: '#12532a' },
];

const BOTTOM_ARM = [
  [8, 0], [8, 1], [8, 2],
  [7, 2], [6, 2], [5, 2], [4, 2], [3, 2],
  [2, 2],
  [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
  [2, 8], [1, 8],
];

const BASE_CENTER = 5.8;
const BASE_OFFSETS = [[-1.1, -1.1], [-1.1, 1.1], [0, 0], [1.1, -1.1], [1.1, 1.1]];

export function rotate([r, c], times) {
  let point = [r, c];
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) point = [-point[1], point[0]];
  return point;
}

export const RING = Array.from({ length: 64 }, (_, i) => rotate(BOTTOM_ARM[i % 16], Math.floor(i / 16)));
export const HOME = SEATS.map((s) => [0, 1, 2, 3, 4].map((slot) => rotate([7 - slot, 0], s)));
export const BASE = SEATS.map((s) => BASE_OFFSETS.map(([dr, dc]) => rotate([BASE_CENTER + dr, BASE_CENTER + dc], s)));
export const BASE_TRAY = SEATS.map((s) => rotate([BASE_CENTER, BASE_CENTER], s));
export const CENTER = [0, 0];
export const DIE_SPOT = SEATS.map((s) => rotate([9.9, 5.4], s));
export const DIE_THROW_FROM = SEATS.map((s) => rotate([15, 9], s));

export const entryIdx = (seat) => (seat * 16 + 2) % 64;
export const tipIdx = (seat) => seat * 16;
export const INNER_CORNERS = [8, 24, 40, 56];

export function positionOf(seat, pos, marble) {
  if (pos.zone === 'base') return BASE[seat][marble];
  if (pos.zone === 'track') return RING[pos.idx];
  if (pos.zone === 'home') return HOME[seat][pos.slot];
  return CENTER;
}

import BOARDS from '../shared/boards.json';

export const SEATS = [0, 1, 2, 3];
export const SEAT_COLORS = [
  { name: 'Red', main: '#e03a3e', light: '#ff8a8a', dark: '#8c1116' },
  { name: 'Blue', main: '#2f7de1', light: '#8cc2ff', dark: '#123f7a' },
  { name: 'Yellow', main: '#f4b400', light: '#ffe38a', dark: '#8a6100' },
  { name: 'Green', main: '#2e9e55', light: '#8ee0a8', dark: '#12532a' },
];
export const CENTER = [0, 0];
export function rotate([r, c], times) {
  let point = [r, c];
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) point = [-point[1], point[0]];
  return point;
}

const makeLayout = (spec) => {
  const ring = [];
  for (let seat = 0; seat < 4; seat++) spec.armShape.forEach((point, i) => ring.push(rotate(point, seat)));
  return {
    spec,
    RING: ring,
    BOTTOM_ARM: spec.armShape,
    HOME: [0, 1, 2, 3].map((seat) => spec.homeRows.map((r) => rotate([r, 0], seat))),
    BASE: [0, 1, 2, 3].map((seat) => spec.baseOffsets.map((offset) => rotate([spec.baseCenter[0] + offset[0], spec.baseCenter[1] + offset[1]], seat))),
    BASE_TRAY: [0, 1, 2, 3].map((seat) => rotate(spec.baseCenter, seat)),
    DIE_SPOT: [0, 1, 2, 3].map((seat) => rotate(spec.dieSpot, seat)),
    DIE_THROW_FROM: [0, 1, 2, 3].map((seat) => rotate(spec.dieThrowFrom, seat)),
    INNER_CORNERS: [...spec.corners, spec.exit],
  };
};

export const LAYOUTS = Object.fromEntries(Object.values(BOARDS).map((spec) => [spec.id, makeLayout(spec)]));
export const layoutFor = (variant = 'classic') => LAYOUTS[variant] || LAYOUTS.classic;
const CLASSIC = layoutFor('classic');

export const BOTTOM_ARM = CLASSIC.BOTTOM_ARM;
export const RING = CLASSIC.RING;
export const HOME = CLASSIC.HOME;
export const BASE = CLASSIC.BASE;
export const BASE_TRAY = CLASSIC.BASE_TRAY;
export const DIE_SPOT = CLASSIC.DIE_SPOT;
export const DIE_THROW_FROM = CLASSIC.DIE_THROW_FROM;
export const INNER_CORNERS = CLASSIC.INNER_CORNERS;
export const entryIdx = (seat, layout = CLASSIC) => (seat * layout.spec.arm + layout.spec.entry) % layout.spec.trackLen;
export const tipIdx = (seat, layout = CLASSIC) => seat * layout.spec.arm;

// seat is across from their 4 o'clock base; pos is the server's abstract marble position
export const positionIn = (seat, pos, marble, layout = CLASSIC) => {
  if (pos.zone === 'base') return layout.BASE[seat][marble];
  if (pos.zone === 'center') return [0, 0];
  if (pos.zone === 'home') return layout.HOME[seat][pos.slot];
  return layout.RING[pos.idx];
};
export const positionOf = (seat, pos, marble) => positionIn(seat, pos, marble, CLASSIC);

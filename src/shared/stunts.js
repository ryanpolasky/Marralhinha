const BOARDS = require('./boards.json');

const STUNT_KINDS = ['flash', 'rocky', 'ufo', 'dice'];
const DICE_STORM_COUNT = 50;
const DIE_SIZE = 0.85;
const MARBLE_R = 0.335;
const BOARD_BEVEL = 0.12;
const MARBLE_CLEARANCE = MARBLE_R + DIE_SIZE * 0.72 + 0.08;
const DIE_CLEARANCE = DIE_SIZE * 1.24;
const BOARD_EDGE_INSET = DIE_SIZE * 0.66;
const TABLE_EDGE_CLEARANCE = DIE_SIZE * 0.75 + BOARD_BEVEL + 0.06;

// Beats in seconds; the server, the 3D scene and the HUD all run off these
const FLASH = { pin: 0.35, toss: 0.9, land: 1.7, bounce: 2.05, bang: 2.9, white: 2.2, fade: 5, end: 10.5 };
// Close encounter: the saucer takes the marble (board), two Greys examine it (lab), a cutaway to the toaster incident
// (kitchen), back to the lab to laugh, poke and eject it, then the saucer dumps it back on the board
const UFO = {
  push: 0.3,
  arrive: 1.2,
  lock: 3.0,
  beam: 3.6,
  lift: 4.0,
  aboard: 6.4,
  toLab: 6.9,
  specimen: 7.3,
  ball: 11.0,
  menace: 13.5,
  toaster: 16.8,
  freeze: 18.0,
  whipOut: 19.5,
  kitchen: 19.7,
  leader: 20.5,
  tick: 23.2,
  thinking: 23.6,
  ding: 26.1,
  armed: 26.3,
  pew: 26.9,
  abort: 28.7,
  whipBack: 31.1,
  lab2: 31.3,
  classic: 31.8,
  cried: 34.3,
  cord: 37.0,
  pokeIt: 39.7,
  poke1: 42.2,
  poke2: 42.9,
  poke3: 43.6,
  nothing: 44.5,
  tossIt: 47.0,
  button: 49.1,
  drop: 49.4,
  board2: 49.8,
  eject: 50.1,
  land: 50.9,
  leave: 51.5,
  stamp: 52.1,
  fade: 55.6,
  end: 56.2,
};
const ROCKY_SPEED = 5.2;
const ROCKY_CELEBRATE = 6.4;
const ROCKY_JUMPS = 4;

const rockyTiming = (cells) => {
  // Lines the start of the run up with the beat kicking in on Gonna Fly Now
  const intro = 11;
  const run = Math.min(17, Math.max(9, cells / ROCKY_SPEED));
  const celebrate = intro + run;
  // End of the first round of jumps; the celebration itself loops until the bit is cut
  const settle = celebrate + ROCKY_CELEBRATE;
  return { intro, run, celebrate, settle };
};

// Every cell from where the marble stands round the track and up its home row; short trips get a bonus lap
function rockyPath(seat, marble, marbles, variant) {
  const spec = BOARDS[variant] || BOARDS.classic;
  const L = spec.trackLen;
  const entry = (seat * spec.arm + spec.entry) % L;
  const pos = marbles[seat][marble];
  const cells = [];
  let p = 0;
  if (pos.zone === 'track') p = (pos.idx - entry + L) % L;
  else {
    if (pos.zone === 'center') p = (spec.exit - spec.entry + L) % L;
    cells.push({ zone: 'track', idx: (entry + p) % L });
  }
  const steps = spec.lastTrack - p + (spec.lastTrack - p < L / 2 ? L : 0);
  for (let i = 1; i <= steps; i++) cells.push({ zone: 'track', idx: (entry + p + i) % L });
  const taken = new Set(marbles[seat].filter((m, i) => i !== marble && m.zone === 'home').map((m) => m.slot));
  let deepest = spec.home - 1;
  while (deepest > 0 && taken.has(deepest)) deepest--;
  for (let slot = 0; slot <= deepest; slot++) cells.push({ zone: 'home', slot });
  return cells;
}

const rotate = ([r, c], times) => {
  let pt = [r, c];
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) pt = [-pt[1], pt[0]];
  return pt;
};

const boardLayouts = {};
function layoutOf(variant = 'classic') {
  const spec = BOARDS[variant] || BOARDS.classic;
  if (!boardLayouts[spec.id]) {
    const ring = [];
    for (let s = 0; s < 4; s++) spec.armShape.forEach((pt) => ring.push(rotate(pt, s)));
    boardLayouts[spec.id] = {
      spec,
      ring,
      home: [0, 1, 2, 3].map((s) => spec.homeRows.map((r) => rotate([r, 0], s))),
      base: [0, 1, 2, 3].map((s) => spec.baseOffsets.map(([dr, dc]) => rotate([spec.baseCenter[0] + dr, spec.baseCenter[1] + dc], s))),
    };
  }
  return boardLayouts[spec.id];
}

function marbleXZ(seat, pos, marble, variant = 'classic') {
  const l = layoutOf(variant);
  const [r, c] = pos.zone === 'base' ? l.base[seat][marble] : pos.zone === 'center' ? [0, 0] : pos.zone === 'home' ? l.home[seat][pos.slot] : l.ring[pos.idx];
  return [c, r];
}

function roundBoxSDF(x, z, hx, hz, r) {
  const qx = Math.abs(x) - hx + r;
  const qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

function boardCrossSDF(x, z, variant = 'classic') {
  const spec = typeof variant === 'object' ? variant : BOARDS[variant] || BOARDS.classic;
  const W = spec.halfWidth;
  const L = spec.halfLength;
  const r = Math.min(0.65, W * 0.35);
  return Math.min(roundBoxSDF(x, z, W, L, r), roundBoxSDF(x, z, L, W, r));
}

function dishSDF(x, z, variant = 'classic') {
  const spec = typeof variant === 'object' ? variant : BOARDS[variant] || BOARDS.classic;
  const b = spec.baseCenter[0];
  return Math.hypot(Math.abs(x) - b, Math.abs(z) - b) - spec.dishR;
}

function boardSurfaceY(x, z, variant = 'classic', tableY = -0.66) {
  const spec = typeof variant === 'object' ? variant : BOARDS[variant] || BOARDS.classic;
  const d = Math.min(boardCrossSDF(x, z, spec), dishSDF(x, z, spec));
  if (d <= 0) return 0;
  if (d >= 0.24) return tableY;
  const t = d / 0.24;
  return tableY * t * t * (3 - 2 * t);
}

const clearOfMarbles = (x, z, marbles) => marbles.every(([mx, mz]) => Math.hypot(x - mx, z - mz) >= MARBLE_CLEARANCE);
const clearOfDice = (x, z, dice, skipId = null) => dice.every((d) => d.id === skipId || Math.hypot(x - d.x, z - d.z) >= DIE_CLEARANCE);

const validBoardSpot = (x, z, spec, marbles, dice, skipId = null) =>
  boardCrossSDF(x, z, spec) <= -BOARD_EDGE_INSET && clearOfMarbles(x, z, marbles) && clearOfDice(x, z, dice, skipId);

const validTableSpot = (x, z, spec, marbles, dice, skipId = null) => {
  const reach = spec.halfLength + 4.3;
  const box = spec.halfLength + 3.8;
  return (
    Math.abs(x) <= box &&
    Math.abs(z) <= box &&
    Math.hypot(x, z) <= reach &&
    boardCrossSDF(x, z, spec) >= TABLE_EDGE_CLEARANCE &&
    dishSDF(x, z, spec) >= TABLE_EDGE_CLEARANCE &&
    clearOfMarbles(x, z, marbles) &&
    clearOfDice(x, z, dice, skipId)
  );
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function rollStuntDice(seat, marbles, variant = 'classic', rng = () => 1 + Math.floor(Math.random() * 6), count = DICE_STORM_COUNT) {
  const spec = BOARDS[variant] || BOARDS.classic;
  const marbleSpots = (marbles || []).flatMap((row, s) => (row || []).map((pos, m) => marbleXZ(s, pos, m, spec.id)));
  const placed = [];
  const boardTarget = Math.min(count, spec.id === 'blitz' ? 14 : 18);
  const L = spec.halfLength;
  const tableBox = L + 3.8;

  const pickBest = (sampleFn, validFn, attempts = 28) => {
    let best = null;
    for (let i = 0; i < attempts; i++) {
      const [x, z] = sampleFn();
      if (!validFn(x, z)) continue;
      const minDist = placed.length ? Math.min(...placed.map((d) => Math.hypot(x - d.x, z - d.z))) : 10;
      const score = minDist * (0.85 + Math.random() * 0.3);
      if (!best || score > best.score) best = { x: round2(x), z: round2(z), score };
    }
    return best;
  };

  for (let i = 0; i < boardTarget; i++) {
    const spot = pickBest(
      () => [(Math.random() * 2 - 1) * (L - 0.5), (Math.random() * 2 - 1) * (L - 0.5)],
      (x, z) => validBoardSpot(x, z, spec, marbleSpots, placed)
    );
    if (spot) placed.push({ x: spot.x, z: spot.z, onBoard: true });
  }

  while (placed.length < count) {
    const spot =
      pickBest(
        () => [(Math.random() * 2 - 1) * tableBox, (Math.random() * 2 - 1) * tableBox],
        (x, z) => validTableSpot(x, z, spec, marbleSpots, placed),
        36
      ) ||
      pickBest(
        () => [(Math.random() * 2 - 1) * (tableBox + 1.5), (Math.random() * 2 - 1) * (tableBox + 1.5)],
        (x, z) => boardCrossSDF(x, z, spec) >= TABLE_EDGE_CLEARANCE && dishSDF(x, z, spec) >= TABLE_EDGE_CLEARANCE && clearOfDice(x, z, placed),
        80
      );
    if (!spot) break;
    placed.push({ x: spot.x, z: spot.z, onBoard: false });
  }

  const [outR, outC] = rotate([1, 0], seat);
  const outX = outC;
  const outZ = outR;
  const latX = outR;
  const latZ = -outC;

  const values = placed.map(() => rng());
  for (let i = 0; i < values.length && values.filter((v) => v === 1 || v === 6).length < 6; i += 3) {
    values[i] = i % 2 === 0 ? 6 : 1;
  }

  return placed.map((p, i) => {
    const lat = (p.x * latX + p.z * latZ) * 0.65 + (Math.random() - 0.5) * 3.2;
    const dist = L + 6.4 + Math.random() * 2.8;
    const fromX = round2(outX * dist + latX * lat);
    const fromZ = round2(outZ * dist + latZ * lat);
    return {
      id: i,
      die: values[i],
      x: p.x,
      z: p.z,
      fromX,
      fromZ,
      onBoard: p.onBoard,
      yaw: round2(Math.random() * Math.PI * 2),
      delay: round2((i / Math.max(1, placed.length - 1)) * 0.42),
      height: round2(2.3 + Math.random() * 1.4),
    };
  });
}

function nudgeStuntDice(stunt, marbles, variant = 'classic', extraCells = []) {
  if (!stunt?.dice) return;
  const spec = BOARDS[variant] || BOARDS.classic;
  const marbleSpots = [
    ...(marbles || []).flatMap((row, s) => (row || []).map((pos, m) => marbleXZ(s, pos, m, spec.id))),
    ...extraCells.map(({ seat, cell, marble }) => marbleXZ(seat, cell, marble, spec.id)),
  ];
  const live = stunt.dice.filter((d) => !d.burnedAt);
  live.forEach((d) => {
    if (clearOfMarbles(d.x, d.z, marbleSpots)) return;
    for (let r = 0.8; r <= 8; r += 0.45) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + (d.id % 7) * 0.3;
        const nx = round2(d.x + Math.cos(a) * r);
        const nz = round2(d.z + Math.sin(a) * r);
        if (validBoardSpot(nx, nz, spec, marbleSpots, live, d.id)) {
          d.x = nx;
          d.z = nz;
          d.onBoard = true;
          return;
        }
        if (validTableSpot(nx, nz, spec, marbleSpots, live, d.id)) {
          d.x = nx;
          d.z = nz;
          d.onBoard = false;
          return;
        }
      }
    }
  });
}

const stuntSeconds = (stunt) => (stunt.kind === 'rocky' || stunt.kind === 'dice' ? Infinity : stunt.kind === 'ufo' ? UFO.end : FLASH.end);

// ms until a timed bit is over, so bots don't move marbles that are busy being abducted
const stuntHoldMs = (stunts, now = Date.now()) =>
  Math.max(0, ...(stunts || []).map((s) => (s.cutAt || !Number.isFinite(stuntSeconds(s)) ? 0 : s.t + stuntSeconds(s) * 1000 - now)));

module.exports = {
  STUNT_KINDS,
  DICE_STORM_COUNT,
  DIE_SIZE,
  MARBLE_CLEARANCE,
  DIE_CLEARANCE,
  FLASH,
  UFO,
  ROCKY_JUMPS,
  ROCKY_CELEBRATE,
  rockyTiming,
  rockyPath,
  boardCrossSDF,
  dishSDF,
  boardSurfaceY,
  rollStuntDice,
  nudgeStuntDice,
  stuntSeconds,
  stuntHoldMs,
};

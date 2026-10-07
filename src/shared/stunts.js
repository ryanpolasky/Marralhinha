const BOARDS = require('./boards.json');

const STUNT_KINDS = ['flash', 'rocky'];

// Beats in seconds; the server, the 3D scene and the HUD all run off these
const FLASH = { pin: 0.35, toss: 0.9, land: 1.7, bounce: 2.05, bang: 2.9, white: 2.2, fade: 5, end: 10.5 };
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

const stuntSeconds = (stunt) => (stunt.kind === 'rocky' ? Infinity : FLASH.end);

module.exports = { STUNT_KINDS, FLASH, ROCKY_JUMPS, ROCKY_CELEBRATE, rockyTiming, rockyPath, stuntSeconds };

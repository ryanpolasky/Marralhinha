import { layoutFor, positionIn } from './geometry';

// Beats of the bit in seconds; the 3D scene and the HUD both run off these
// camera push (done ~2.3s), first line, line gone and gun out, beat, shot, beat, gun away, second line.
// The orbit, rain and grim grade then hold until the hit is undone
export const HIT = { push: 0.1, pushDur: 2.2, say: 2.6, sayEnd: 4.7, gun: 5, shot: 6.4, knock: 1, orbit: 6.8, rip: 7.1, gunOut: 7.4, quip: 8, quipEnd: 12.5 };
export const LINE_MAX = 80;
export const UNDO_S = 1.4;

const starts = new Map();
export const nowS = () => performance.now() / 1000;
// Ages are relative to when the server sent the state, so first sight pins one start time for every component
const startOf = (key, age) => {
  if (!starts.has(key)) starts.set(key, nowS() - (age || 0) / 1000);
  return starts.get(key);
};
export const hitClock = (hit, now = nowS()) => now - startOf(hit.id, hit.age);
export const undoClock = (hit, now = nowS()) => (hit.undone ? now - startOf(`${hit.id}:undo`, hit.undoneAge) : null);

export const clamp01 = (x) => Math.min(1, Math.max(0, x));

// 0 standing, 1 knocked flat; rewinds back to 0 over the undo
export function downAmount(hit, now = nowS()) {
  const k = clamp01((hitClock(hit, now) - HIT.shot) / HIT.knock);
  const u = undoClock(hit, now);
  return u === null ? k : k * (1 - clamp01(u / UNDO_S));
}

export const liveHits = (hits) => (hits || []).filter((h) => !h.undone);
export const downMarbles = (game) => new Set(liveHits(game.hits).filter((h) => samePos(h.victimAt, game.marbles[h.victim][h.victimMarble])).map((h) => `${h.victim}:${h.victimMarble}`));

export const samePos = (a, b) => !a || !b || (a.zone === b.zone && a.idx === b.idx && a.slot === b.slot);

// Board-space [x, z] spots for the bit, from where both marbles stood when the trigger was pulled (byAt / victimAt)
const geos = new Map();
export function hitGeo(hit, board) {
  if (!geos.has(hit.id)) {
    const layout = layoutFor(board.variant);
    const xz = ([r, c]) => [c, r];
    const from = xz(positionIn(hit.by, hit.byAt || board.marbles[hit.by][hit.byMarble], hit.byMarble, layout));
    const to = xz(positionIn(hit.victim, hit.victimAt || board.marbles[hit.victim][hit.victimMarble], hit.victimMarble, layout));
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const dir = len > 1e-3 ? [(to[0] - from[0]) / len, (to[1] - from[1]) / len] : [1, 0];
    geos.set(hit.id, { from, to, dir, rest: xz(layout.BASE[hit.victim][hit.victimMarble]) });
  }
  return geos.get(hit.id);
}

const ZONE = { base: 'Base', center: 'Center', home: 'Home' };
export function marbleLabel(game, seat, m) {
  const pos = game.marbles[seat][m];
  if (pos.zone !== 'track') return `${ZONE[pos.zone]}${pos.zone === 'home' ? ` ${pos.slot + 1}` : ''}`;
  const { spec } = layoutFor(game.variant);
  return `${((pos.idx - (seat * spec.arm + spec.entry)) % spec.trackLen + spec.trackLen) % spec.trackLen + 1} steps out`;
}

// Closest pair of marbles between the two seats, skipping anyone already down and preferring marbles out on the board
export function pickShot(game, by, victim) {
  const layout = layoutFor(game.variant);
  const down = downMarbles(game);
  const spots = (seat) => {
    const all = (game.marbles[seat] || []).map((pos, m) => ({ m, pos, at: positionIn(seat, pos, m, layout) })).filter(({ m }) => !down.has(`${seat}:${m}`));
    const out = all.filter((s) => s.pos.zone !== 'base');
    return out.length ? out : all;
  };
  let best = null;
  spots(by).forEach((a) =>
    spots(victim).forEach((b) => {
      const d = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
      if (!best || d < best.d) best = { d, byMarble: a.m, victimMarble: b.m };
    })
  );
  return best && { by, byMarble: best.byMarble, victim, victimMarble: best.victimMarble };
}

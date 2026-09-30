const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./rules');
const { chooseMove } = require('./bot');

const seats = (n) => [0, 1, 2, 3].map((s) => (s < n ? { name: `P${s}` } : null));
const track = (idx) => ({ zone: 'track', idx });
const home = (slot) => ({ zone: 'home', slot });
const rotate = ([r, c], times) => {
  let point = [r, c];
  for (let i = 0; i < times % 4; i++) point = [-point[1], point[0]];
  return point;
};
const ringFor = (spec) => [0, 1, 2, 3].flatMap((seat) => spec.armShape.map((p) => rotate(p, seat)));

function blitz(n = 2, turn = 0) {
  const rolls = [4, 1, 2, 3];
  let i = 0;
  const state = rules.createGame(seats(n), { rng: () => rolls[i++ % rolls.length], variant: 'blitz' });
  state.turn = turn;
  return state;
}

test('blitz board spec has a real, connected 40-cell ring', () => {
  const spec = rules.BOARDS.blitz;
  const ring = ringFor(spec);
  assert.equal(ring.length, spec.trackLen);
  assert.equal(spec.trackLen, spec.arm * 4);
  assert.equal(new Set(ring.map(([r, c]) => `${r},${c}`)).size, spec.trackLen);
  for (const seat of [0, 1, 2, 3]) {
    const end = ring[seat * spec.arm + spec.arm - 1];
    const next = ring[((seat + 1) % 4) * spec.arm];
    assert.equal(Math.abs(end[0] - next[0]) + Math.abs(end[1] - next[1]), 1, `arm ${seat} joins arm ${(seat + 1) % 4}`);
  }
  assert.deepEqual(rules.entryCorners(0, spec), [5, 15, 25]);
  assert.equal(rules.exitCorner(0, spec), 35, 'the corner is cell 5 of the previous 10-cell arm');
  assert.equal(spec.lastTrack, spec.trackLen - 2);
});

test('blitz marbles enter home from the last track cell and three marbles win', () => {
  const state = blitz();
  assert.equal(state.variant, 'blitz');
  assert.equal(state.marbles[0].length, 3);
  assert.deepEqual(rules.entryCorners(0, state.spec), [5, 15, 25]);

  state.marbles[0][0] = track(rules.idxOf(0, rules.BOARDS.blitz.lastTrack, state.spec));
  rules.roll(state, () => 1);
  assert.deepEqual(state.legalMoves[0].to, home(0));
  rules.move(state, state.legalMoves[0].id);
  assert.deepEqual(state.marbles[0][0], home(0));

  const done = blitz();
  done.marbles[0] = [home(1), home(2), track(rules.idxOf(0, rules.BOARDS.blitz.lastTrack, done.spec))];
  rules.roll(done, () => 1);
  rules.move(done, done.legalMoves[0].id);
  assert.equal(done.phase, 'over');
  assert.deepEqual(done.winners, [0]);
});

test('blitz keeps captures and center shortcuts on its own corners', () => {
  const state = blitz();
  state.marbles[0][0] = track(25);
  rules.roll(state, () => 6);
  const shortcut = state.legalMoves.find((m) => m.kind === 'enterCenter');
  assert.ok(shortcut, 'the third far corner enters the center');
  rules.move(state, shortcut.id);
  assert.deepEqual(state.marbles[0][0], { zone: 'center' });

  state.turn = 0;
  rules.roll(state, () => 1);
  const out = state.legalMoves.find((m) => m.kind === 'exitCenter');
  assert.deepEqual(out.to, track(35));

  const capture = blitz(2, 1);
  capture.marbles[1][0] = track(12);
  capture.marbles[0][0] = track(15);
  rules.roll(capture, () => 3);
  const mv = capture.legalMoves.find((m) => m.seat === 1);
  assert.equal(mv.capture.seat, 0);
});

test('blitz bot games finish', () => {
  for (const teams of [false, true]) {
    const state = rules.createGame(seats(4), { teams, variant: 'blitz' });
    let turns = 0;
    while (state.phase !== 'over' && turns++ < 20000) {
      if (state.phase === 'roll') rules.roll(state);
      else rules.move(state, chooseMove(state).id);
    }
    assert.equal(state.phase, 'over', teams ? 'teams game finished' : 'solo game finished');
  }
});

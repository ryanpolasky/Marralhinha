const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../src/shared/rules');
const { chooseMove } = require('../../src/shared/bot');

const seats = (n) => [0, 1, 2, 3].map((s) => (s < n ? { name: `P${s}` } : null));
const fixed = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const track = (idx) => ({ zone: 'track', idx });
const home = (slot) => ({ zone: 'home', slot });
const base = { zone: 'base' };

function setup(n = 2, turn = 0, options = {}) {
  const state = rules.createGame(seats(n), { rng: fixed(6, 1, 2, 3), ...options });
  state.turn = turn;
  return state;
}

function rollWith(state, die) {
  return rules.roll(state, () => die);
}

test('roll-off picks the highest roller and re-rolls ties', () => {
  const state = rules.createGame(seats(3), { rng: fixed(5, 5, 2, 3, 6) });
  assert.equal(state.turn, 1);
  assert.equal(state.mode, 'solo');
});

test('four players play free-for-all unless teams are switched on', () => {
  assert.equal(rules.createGame(seats(4)).mode, 'solo');
  assert.equal(rules.createGame(seats(4), { teams: true }).mode, 'teams');
  assert.equal(rules.createGame(seats(3), { teams: true }).mode, 'solo', 'teams need all four seats');
});

test('in free-for-all, the player across the board is fair game', () => {
  const state = setup(4);
  state.marbles[0][0] = track(10);
  state.marbles[2][0] = track(12);
  rollWith(state, 2);
  assert.equal(state.legalMoves.find((m) => m.marble === 0).capture.seat, 2);
});

test('a marble on a shortcut corner can keep going around the track instead', () => {
  const state = setup();
  const corner = rules.entryCorners(0)[0];
  state.marbles[0][0] = track(corner);
  state.marbles[1][0] = track(corner + 3);
  rollWith(state, 3);
  const step = state.legalMoves.find((m) => m.marble === 0 && m.kind === 'step');
  assert.ok(step, 'stepping off the corner is allowed');
  assert.equal(step.capture.seat, 1);

  state.phase = 'roll';
  state.turn = 0;
  state.marbles[1][0] = base;
  rollWith(state, 6);
  assert.deepEqual(state.legalMoves.filter((m) => m.marble === 0).map((m) => m.kind).sort(), ['enterCenter', 'step'], 'a 1 or 6 offers both paths');
});

test('marbles leave the base only on 1 or 6', () => {
  const state = setup();
  rollWith(state, 3);
  assert.equal(state.phase, 'roll');
  assert.equal(state.turn, 1, 'no moves on a 3 passes the turn');

  state.turn = 0;
  rollWith(state, 1);
  assert.deepEqual(state.legalMoves.map((m) => m.kind), ['enter']);
  rules.move(state, 0);
  assert.deepEqual(state.marbles[0][0], track(rules.entryIdx(0)));
  assert.equal(state.turn, 1);
});

test('a 6 grants another roll, even with no legal move', () => {
  const state = setup();
  state.marbles[0] = [home(0), home(4), home(3), home(2), home(1)];
  state.marbles[0][0] = track(rules.idxOf(0, rules.LAST_TRACK));
  rollWith(state, 6);
  assert.equal(state.lastRoll.noMoves, true);
  assert.equal(state.turn, 0);

  const s2 = setup();
  rollWith(s2, 6);
  rules.move(s2, 0);
  assert.equal(s2.turn, 0);
  assert.equal(s2.phase, 'roll');
});

test('landing on an opponent captures it, landing on your own marble is illegal', () => {
  const state = setup();
  state.marbles[0][0] = track(10);
  state.marbles[0][1] = track(14);
  state.marbles[1][0] = track(13);
  rollWith(state, 3);
  const onto = state.legalMoves.find((m) => m.marble === 0);
  assert.equal(onto.capture.seat, 1);
  rules.move(state, onto.id);
  assert.deepEqual(state.marbles[1][0], base);

  const s2 = setup();
  s2.marbles[0][0] = track(10);
  s2.marbles[0][1] = track(14);
  rollWith(s2, 4);
  assert.equal(s2.legalMoves.find((m) => m.marble === 0), undefined);
});

test('marbles of the same player may not overtake each other, but may pass opponents', () => {
  const state = setup();
  state.marbles[0][0] = track(10);
  state.marbles[0][1] = track(12);
  state.marbles[2][0] = track(11);
  rollWith(state, 5);
  assert.deepEqual(state.legalMoves.map((m) => m.marble), [1]);

  const s2 = setup();
  s2.marbles[0][0] = track(10);
  s2.marbles[2][0] = track(12);
  rollWith(s2, 5);
  assert.deepEqual(s2.legalMoves.find((m) => m.marble === 0).to, track(15));
});

test('entering the base is blocked by your partner but captures an opponent', () => {
  const state = setup(4, 0, { teams: true });
  state.marbles[2][0] = track(rules.entryIdx(0));
  rollWith(state, 6);
  assert.equal(state.legalMoves.some((m) => m.kind === 'enter'), false);

  const s2 = setup(4);
  s2.marbles[1][0] = track(rules.entryIdx(0));
  rollWith(s2, 1);
  const enter = s2.legalMoves.find((m) => m.kind === 'enter');
  assert.equal(enter.capture.seat, 1);
});

test('marbles turn into home at their own tip and need exact rolls', () => {
  const state = setup();
  state.marbles[0][0] = track(rules.idxOf(0, rules.LAST_TRACK - 1));
  rollWith(state, 3);
  assert.deepEqual(state.legalMoves[0].to, home(1));

  const s2 = setup();
  s2.marbles[0][0] = track(rules.idxOf(0, rules.LAST_TRACK));
  rollWith(s2, 6);
  assert.equal(s2.legalMoves.some((m) => m.marble === 0), false, 'overshooting home is not allowed');

  const s3 = setup();
  s3.marbles[0][0] = home(1);
  s3.marbles[0][1] = track(rules.idxOf(0, rules.LAST_TRACK));
  rollWith(s3, 3);
  assert.equal(s3.legalMoves.some((m) => m.marble === 1), false, 'cannot jump own marbles inside home');
});

test('center shortcut: enter from the three far corners with 1/6, exit to the corner nearest home', () => {
  const state = setup();
  const [c1, c2, c3] = rules.entryCorners(0);
  assert.deepEqual([c1, c2, c3], [8, 24, 40]);
  assert.equal(rules.exitCorner(0), 56);

  state.marbles[0][0] = track(24);
  rollWith(state, 6);
  const kinds = state.legalMoves.filter((m) => m.marble === 0).map((m) => m.kind).sort();
  assert.deepEqual(kinds, ['enterCenter', 'step']);
  rules.move(state, state.legalMoves.find((m) => m.kind === 'enterCenter').id);
  assert.deepEqual(state.marbles[0][0], { zone: 'center' });

  rollWith(state, 4);
  assert.equal(state.legalMoves.some((m) => m.marble === 0), false, 'need 1 or 6 to leave the center');

  state.turn = 0;
  rollWith(state, 1);
  const exit = state.legalMoves.find((m) => m.kind === 'exitCenter');
  assert.deepEqual(exit.to, track(56));

  const s2 = setup();
  s2.marbles[0][0] = track(56);
  rollWith(s2, 1);
  assert.equal(s2.legalMoves.some((m) => m.kind === 'enterCenter'), false, 'own exit corner is not an entrance');
});

test('an opponent sitting in the center gets captured', () => {
  const state = setup();
  state.marbles[0][0] = track(8);
  state.marbles[1][0] = { zone: 'center' };
  rollWith(state, 1);
  const mv = state.legalMoves.find((m) => m.kind === 'enterCenter');
  assert.equal(mv.capture.seat, 1);
});

test('teams: a finished player moves their partner\'s marbles; both finished wins', () => {
  const state = setup(4, 0, { teams: true });
  state.marbles[0] = [home(0), home(1), home(2), home(3), home(4)];
  state.marbles[2] = [home(1), home(2), home(3), home(4), track(rules.idxOf(2, rules.LAST_TRACK))];
  assert.equal(rules.controlledSeat(state), 2);
  rollWith(state, 1);
  assert.equal(state.legalMoves[0].seat, 2);
  rules.move(state, state.legalMoves[0].id);
  assert.equal(state.phase, 'over');
  assert.deepEqual(state.winners, [0, 2]);
});

test('solo: first player with all marbles home wins', () => {
  const state = setup(3);
  state.marbles[1] = [home(1), home(2), home(3), home(4), track(rules.idxOf(1, rules.LAST_TRACK))];
  state.turn = 1;
  rollWith(state, 1);
  rules.move(state, state.legalMoves[0].id);
  assert.deepEqual(state.winners, [1]);
});

test('bots can play full games to completion', () => {
  for (const [n, teams] of [[2, false], [3, false], [4, false], [4, true]]) {
    const state = rules.createGame(seats(n), { teams });
    let turns = 0;
    while (state.phase !== 'over' && turns++ < 20000) {
      if (state.phase === 'roll') rules.roll(state);
      else rules.move(state, chooseMove(state).id);
    }
    assert.equal(state.phase, 'over', `${n}-player game finished`);
    const total = (key) => state.stats.reduce((sum, s) => sum + s[key], 0);
    assert.equal(total('captures'), total('captured'), 'every capture has a victim');
    assert.ok(total('rolls') > 0 && total('pips') >= total('rolls'));
    for (const seat of state.active) {
      const cells = state.marbles[seat].filter((p) => p.zone !== 'base').map((p) => JSON.stringify(p));
      assert.equal(new Set(cells).size, cells.length, 'no two marbles of a player share a hole');
    }
  }
});

const { randomInt } = require('crypto');
const BOARDS = require('../../src/shared/boards.json');

const CLASSIC = BOARDS.classic;
const specOf = (state) => state?.spec || CLASSIC;
const boardSpec = (variant = 'classic') => {
  const spec = BOARDS[variant];
  if (!spec) throw new Error('Unknown board variant');
  return spec;
};

const TRACK_LEN = CLASSIC.trackLen;
const ARM = CLASSIC.arm;
const MARBLES = CLASSIC.marbles;
const HOME_LEN = CLASSIC.home;
const LAST_TRACK = CLASSIC.lastTrack;
const LOG_LIMIT = 100;

const entryIdx = (seat, spec = CLASSIC) => (seat * spec.arm + spec.entry) % spec.trackLen;
const exitCorner = (seat, spec = CLASSIC) => (seat * spec.arm + spec.exit) % spec.trackLen;
const entryCorners = (seat, spec = CLASSIC) => spec.corners.map((o) => (seat * spec.arm + o) % spec.trackLen);
const progressOf = (seat, idx, spec = CLASSIC) => (idx - entryIdx(seat, spec) + spec.trackLen) % spec.trackLen;
const idxOf = (seat, progress, spec = CLASSIC) => (entryIdx(seat, spec) + progress) % spec.trackLen;
const partnerOf = (seat) => (seat + 2) % 4;

const cellKey = (seat, pos) => {
  if (pos.zone === 'track') return `t${pos.idx}`;
  if (pos.zone === 'center') return 'c';
  if (pos.zone === 'home') return `h${seat}-${pos.slot}`;
  return null;
};

const rollDie = () => randomInt(1, 7);

// `starter` skips the dice roll-off: { seat, reason: 'wheel' | 'winner' }. The starter also lends their board to the table.
function createGame(seats, { rng = rollDie, teams = false, starter = null, boardSeat = null, variant = 'classic' } = {}) {
  const spec = boardSpec(variant);
  const active = [0, 1, 2, 3].filter((s) => seats[s]);
  if (active.length < 2) throw new Error('Need at least 2 players');
  const state = {
    variant: spec.id,
    spec,
    mode: teams && active.length === 4 ? 'teams' : 'solo',
    active,
    names: seats.map((p) => (p ? p.name : null)),
    marbles: [0, 1, 2, 3].map((s) => (seats[s] ? Array.from({ length: spec.marbles }, () => ({ zone: 'base' })) : [])),
    turn: null,
    phase: 'roll',
    die: null,
    lastRoll: null,
    lastMove: null,
    legalMoves: [],
    winners: null,
    startedAt: Date.now(),
    log: [],
    stats: [0, 1, 2, 3].map(() => ({ rolls: 0, pips: 0, sixes: 0, captures: 0, captured: 0, shortcuts: 0 })),
    pick: null,
    boardSeat: null,
  };
  if (starter && active.includes(starter.seat)) {
    state.turn = starter.seat;
    state.pick = { seat: starter.seat, reason: starter.reason, t: Date.now() };
    const who = state.names[starter.seat];
    const board = boardSeat !== null && active.includes(boardSeat) ? boardSeat : starter.seat;
    const boardName = board === starter.seat ? 'their' : `${state.names[board]}'s`;
    addLog(state, starter.reason === 'winner' ? `${who} won last round, so ${who} starts on ${boardName} board` : `The wheel lands on ${who}! ${who} starts and we play on ${boardName} board`, starter.seat);
  } else state.turn = rollOff(state, rng);
  state.boardSeat = boardSeat !== null && active.includes(boardSeat) ? boardSeat : state.turn;
  return state;
}

function rollOff(state, rng) {
  let contenders = state.active;
  for (;;) {
    const rolls = contenders.map((s) => [s, rng()]);
    addLog(state, `Roll-off: ${rolls.map(([s, d]) => `${state.names[s]} ${d}`).join(', ')}`);
    const best = Math.max(...rolls.map(([, d]) => d));
    contenders = rolls.filter(([, d]) => d === best).map(([s]) => s);
    if (contenders.length === 1) {
      addLog(state, `${state.names[contenders[0]]} starts!`, contenders[0]);
      return contenders[0];
    }
  }
}

function pushLog(state, entry) {
  state.log.push(entry);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

function addLog(state, text, seat = null) {
  pushLog(state, { text, seat, t: Date.now() });
}

const isFinished = (state, seat) => state.marbles[seat].length > 0 && state.marbles[seat].every((p) => p.zone === 'home');

const isFriendly = (state, owner, seat) => seat === owner || (state.mode === 'teams' && seat === partnerOf(owner));

function controlledSeat(state) {
  const seat = state.turn;
  return state.mode === 'teams' && isFinished(state, seat) ? partnerOf(seat) : seat;
}

function occupancy(state) {
  const map = new Map();
  state.active.forEach((seat) =>
    state.marbles[seat].forEach((pos, marble) => {
      const key = cellKey(seat, pos);
      if (key) map.set(key, { seat, marble });
    })
  );
  return map;
}

function stepPath(seat, pos, n, spec = CLASSIC) {
  const cells = [];
  let { zone } = pos;
  let progress = zone === 'track' ? progressOf(seat, pos.idx, spec) : null;
  let slot = zone === 'home' ? pos.slot : null;
  for (let i = 0; i < n; i++) {
    if (zone === 'track') {
      if (progress >= spec.lastTrack) {
        zone = 'home';
        slot = 0;
      } else progress++;
    } else if (++slot >= spec.home) return null;
    cells.push(zone === 'track' ? { zone, idx: idxOf(seat, progress, spec) } : { zone, slot });
  }
  return cells;
}

function computeLegalMoves(state) {
  if (state.phase !== 'move') return [];
  const owner = controlledSeat(state);
  const spec = specOf(state);
  const { die } = state;
  const occ = occupancy(state);
  const oneOrSix = die === 1 || die === 6;
  const moves = [];

  const tryLand = (marble, kind, to, from, path = [to]) => {
    const hit = occ.get(cellKey(owner, to));
    if (hit && isFriendly(state, owner, hit.seat)) return;
    moves.push({ seat: owner, marble, kind, from, to, path, capture: hit || null });
  };

  let baseOffered = false;
  state.marbles[owner].forEach((pos, marble) => {
    if (pos.zone === 'base') {
      if (!oneOrSix || baseOffered) return;
      baseOffered = true;
      tryLand(marble, 'enter', { zone: 'track', idx: entryIdx(owner, spec) }, pos);
    } else if (pos.zone === 'center') {
      if (oneOrSix) tryLand(marble, 'exitCenter', { zone: 'track', idx: exitCorner(owner, spec) }, pos);
    } else {
      const path = stepPath(owner, pos, die, spec);
      const blocked = !path || path.slice(0, -1).some((cell) => occ.get(cellKey(owner, cell))?.seat === owner);
      if (!blocked) tryLand(marble, 'step', path[path.length - 1], pos, path);
      if (oneOrSix && pos.zone === 'track' && entryCorners(owner, spec).includes(pos.idx)) {
        tryLand(marble, 'enterCenter', { zone: 'center' }, pos);
      }
    }
  });
  return moves.map((m, id) => ({ ...m, id }));
}

function nextSeat(state, from) {
  for (let i = 1; i <= 4; i++) {
    const seat = (from + i) % 4;
    if (state.active.includes(seat)) return seat;
  }
  return from;
}

function endTurn(state, rollAgain) {
  state.phase = 'roll';
  state.legalMoves = [];
  if (!rollAgain) state.turn = nextSeat(state, state.turn);
}

function roll(state, rng = rollDie) {
  if (state.phase !== 'roll') throw new Error('Not time to roll');
  const die = rng();
  state.die = die;
  const stats = state.stats[state.turn];
  stats.rolls++;
  stats.pips += die;
  if (die === 6) stats.sixes++;
  state.phase = 'move';
  state.legalMoves = computeLegalMoves(state);
  const noMoves = state.legalMoves.length === 0;
  state.lastRoll = { seat: state.turn, die, noMoves, t: Date.now() };
  const helping = controlledSeat(state) !== state.turn ? ` (for ${state.names[controlledSeat(state)]})` : '';
  addLog(state, `${state.names[state.turn]} rolled a ${die}${helping}${noMoves ? ' — no moves' : ''}`, state.turn);
  if (noMoves) endTurn(state, die === 6);
  return state;
}

function move(state, moveId) {
  if (state.phase !== 'move') throw new Error('Not time to move');
  const mv = state.legalMoves.find((m) => m.id === moveId);
  if (!mv) throw new Error('Illegal move');
  const { seat, marble, to, capture } = mv;
  state.marbles[seat][marble] = to;
  if (capture) {
    state.marbles[capture.seat][capture.marble] = { zone: 'base' };
    state.stats[state.turn].captures++;
    state.stats[capture.seat].captured++;
  }
  if (mv.kind === 'enterCenter') state.stats[state.turn].shortcuts++;
  state.lastMove = { seat, marble, kind: mv.kind, from: mv.from, to, path: mv.path, capture, t: Date.now() };

  const who = state.names[seat];
  const verb = { enter: 'brought a marble into play', enterCenter: 'jumped into the center', exitCenter: 'took the shortcut out of the center', step: `moved ${state.die}` }[mv.kind];
  addLog(state, `${who} ${verb}${to.zone === 'home' && mv.from.zone !== 'home' ? ' — reached home!' : ''}${capture ? ` and captured ${state.names[capture.seat]}!` : ''}`, seat);

  if (isFinished(state, seat) && mv.from.zone !== 'home') addLog(state, `${who} has all ${specOf(state).marbles} marbles home!`, seat);

  const winners = findWinners(state);
  if (winners) {
    state.winners = winners;
    state.phase = 'over';
    state.legalMoves = [];
    addLog(state, `${winners.map((s) => state.names[s]).join(' & ')} win${winners.length === 1 ? 's' : ''}!`, winners[0]);
    return state;
  }
  endTurn(state, state.die === 6);
  return state;
}

function findWinners(state) {
  if (state.mode === 'teams') {
    for (const seat of [0, 1]) {
      if (isFinished(state, seat) && isFinished(state, partnerOf(seat))) return [seat, partnerOf(seat)];
    }
    return null;
  }
  const done = state.active.find((s) => isFinished(state, s));
  return done === undefined ? null : [done];
}

module.exports = {
  BOARDS,
  CLASSIC,
  specOf,
  boardSpec,
  TRACK_LEN,
  ARM,
  MARBLES,
  HOME_LEN,
  LAST_TRACK,
  entryIdx,
  exitCorner,
  entryCorners,
  progressOf,
  idxOf,
  partnerOf,
  createGame,
  computeLegalMoves,
  controlledSeat,
  isFinished,
  roll,
  move,
  addLog,
  pushLog,
};

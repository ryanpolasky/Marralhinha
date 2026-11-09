import timing from '../shared/timing';
import rules from '../shared/rules';

export function movesForMarble(moves, seat, marble, pos) {
  return moves.filter((m) => m.seat === seat && (m.marble === marble || (m.kind === 'enter' && pos.zone === 'base')));
}

export const { START_WHEEL_MS, START_WHEEL_SPIN_MS, START_WINNER_MS, TURN_SECONDS } = timing;
export const { partnerOf, coverFor } = rules;

export const ROLL_REVEAL_MS = 1050;
// Pass & play: how long a dead roll stays on screen before the turn (and camera) moves on
export const NO_MOVES_HOLD_MS = 1800;
// Pass & play: the marble finishes its hops, then a beat, then the board turns to the next player
export const HANDOFF_BEAT_MS = 900;
export const handoffMs = (mv) => timing.moveAnimMs(mv) + HANDOFF_BEAT_MS;
// How long a ping arrow stays on the board
export const PING_LIFE_MS = 3000;
export const startPendingFor = (game, now = Date.now()) => {
  if (!game?.pick) return 0;
  const total = game.pick.reason === 'wheel' ? START_WHEEL_MS : START_WINNER_MS;
  return Math.max(0, total - (now - game.pick.t));
};

export const homeCount = (marbles) => marbles.filter((p) => p.zone === 'home').length;

export const coveringTurn = (game, seats, mySeat) => !!game && mySeat >= 0 && !!seats[mySeat] && rules.coverFor(game, seats, game.turn) === seats[mySeat];

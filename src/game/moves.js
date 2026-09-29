export function movesForMarble(moves, seat, marble, pos) {
  return moves.filter((m) => m.seat === seat && (m.marble === marble || (m.kind === 'enter' && pos.zone === 'base')));
}

export const ROLL_REVEAL_MS = 1050;
// The "who starts" wheel: spin, then hold on the result (server bots wait this long too, see START_WHEEL_MS in server/rooms.js)
export const START_WHEEL_MS = 8500;
export const START_WHEEL_SPIN_MS = 4300;
export const START_WINNER_MS = 2200;
// Time a connected player gets per roll/move before the game plays for them (see TURN_MS in server/rooms.js)
export const TURN_MS = 30000;
export const startPendingFor = (game, now = Date.now()) => {
  if (!game?.pick) return 0;
  const total = game.pick.reason === 'wheel' ? START_WHEEL_MS : START_WINNER_MS;
  return Math.max(0, total - (now - game.pick.t));
};

export const homeCount = (marbles) => marbles.filter((p) => p.zone === 'home').length;
export const partnerOf = (seat) => (seat + 2) % 4;

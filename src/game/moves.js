export function movesForMarble(moves, seat, marble, pos) {
  return moves.filter((m) => m.seat === seat && (m.marble === marble || (m.kind === 'enter' && pos.zone === 'base')));
}

export const ROLL_REVEAL_MS = 1050;
// The "who starts" wheel: spin, then hold on the result (server bots wait this long too, see START_WHEEL_MS in server/rooms.js)
export const START_WHEEL_MS = 8500;
export const START_WHEEL_SPIN_MS = 4300;
export const START_WINNER_MS = 2200;
// Turn timer choices the host can pick in the lobby; null means no limit (see TURN_SECONDS_OPTIONS in server/rooms.js)
export const TURN_SECONDS = [15, 20, 25, 30, 35, 40, 45, null];
// How long a ping arrow stays on the board
export const PING_LIFE_MS = 3000;
export const startPendingFor = (game, now = Date.now()) => {
  if (!game?.pick) return 0;
  const total = game.pick.reason === 'wheel' ? START_WHEEL_MS : START_WINNER_MS;
  return Math.max(0, total - (now - game.pick.t));
};

export const homeCount = (marbles) => marbles.filter((p) => p.zone === 'home').length;
export const partnerOf = (seat) => (seat + 2) % 4;

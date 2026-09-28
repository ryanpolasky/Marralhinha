export function movesForMarble(moves, seat, marble, pos) {
  return moves.filter((m) => m.seat === seat && (m.marble === marble || (m.kind === 'enter' && pos.zone === 'base')));
}

export const ROLL_REVEAL_MS = 1050;

export const homeCount = (marbles) => marbles.filter((p) => p.zone === 'home').length;
export const partnerOf = (seat) => (seat + 2) % 4;

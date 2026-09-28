const { TRACK_LEN, LAST_TRACK, progressOf, entryIdx, exitCorner, isFinished, partnerOf } = require('./rules');

const CENTER_VALUE = 48;

function effectiveProgress(seat, pos) {
  if (pos.zone === 'base') return -8;
  if (pos.zone === 'center') return CENTER_VALUE;
  if (pos.zone === 'home') return LAST_TRACK + 1 + pos.slot;
  return progressOf(seat, pos.idx);
}

function threatAt(state, owner, pos) {
  if (pos.zone === 'home' || pos.zone === 'base') return 0;
  let threats = 0;
  state.active.forEach((seat) => {
    if (seat === owner || (state.mode === 'teams' && seat === partnerOf(owner)) || isFinished(state, seat)) return;
    state.marbles[seat].forEach((opp) => {
      if (pos.zone === 'center') {
        if (opp.zone === 'track') threats += 0.3;
        return;
      }
      if (opp.zone === 'track') {
        const dist = (pos.idx - opp.idx + TRACK_LEN) % TRACK_LEN;
        const oppProgress = progressOf(seat, opp.idx);
        if (dist >= 1 && dist <= 6 && oppProgress + dist <= LAST_TRACK) threats += 1;
      } else if (opp.zone === 'base' && pos.idx === entryIdx(seat)) threats += 0.7;
      else if (opp.zone === 'center' && pos.idx === exitCorner(seat)) threats += 0.6;
    });
  });
  return threats;
}

function scoreMove(state, mv) {
  const { seat } = mv;
  let score = effectiveProgress(seat, mv.to) - effectiveProgress(seat, mv.from);
  if (mv.capture) score += 60 + Math.max(0, effectiveProgress(mv.capture.seat, state.marbles[mv.capture.seat][mv.capture.marble])) / 2;
  if (mv.kind === 'enter') score += 35;
  if (mv.to.zone === 'home' && mv.from.zone !== 'home') score += 40;
  score += threatAt(state, seat, mv.from) * 14 - threatAt(state, seat, mv.to) * 16;
  if (mv.from.zone === 'track' && mv.from.idx === entryIdx(seat) && state.marbles[seat].some((p) => p.zone === 'base')) score += 6;
  return score + Math.random() * 2;
}

function chooseMove(state) {
  let best = null;
  let bestScore = -Infinity;
  state.legalMoves.forEach((mv) => {
    const score = scoreMove(state, mv);
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  });
  return best;
}

module.exports = { chooseMove };

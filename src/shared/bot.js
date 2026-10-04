const { specOf, progressOf, entryIdx, exitCorner, isFinished, partnerOf } = require('./rules');

function effectiveProgress(seat, pos, spec) {
  if (pos.zone === 'base') return -Math.round(spec.arm / 2);
  if (pos.zone === 'center') return Math.round(spec.trackLen * 0.75);
  if (pos.zone === 'home') return spec.lastTrack + 1 + pos.slot;
  return progressOf(seat, pos.idx, spec);
}

function threatAt(state, owner, pos, spec) {
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
        const dist = (pos.idx - opp.idx + spec.trackLen) % spec.trackLen;
        const oppProgress = progressOf(seat, opp.idx, spec);
        if (dist >= 1 && dist <= 6 && oppProgress + dist <= spec.lastTrack) threats += 1;
      } else if (opp.zone === 'base' && pos.idx === entryIdx(seat, spec)) threats += 0.7;
      else if (opp.zone === 'center' && pos.idx === exitCorner(seat, spec)) threats += 0.6;
    });
  });
  return threats;
}

function scoreMove(state, mv) {
  const spec = specOf(state);
  const { seat } = mv;
  let score = effectiveProgress(seat, mv.to, spec) - effectiveProgress(seat, mv.from, spec);
  if (mv.capture) score += 60 + Math.max(0, effectiveProgress(mv.capture.seat, state.marbles[mv.capture.seat][mv.capture.marble], spec)) / 2;
  if (mv.kind === 'enter') score += 35;
  if (mv.to.zone === 'home' && mv.from.zone !== 'home') score += 40;
  score += threatAt(state, seat, mv.from, spec) * 14 - threatAt(state, seat, mv.to, spec) * 16;
  if (mv.from.zone === 'track' && mv.from.idx === entryIdx(seat, spec) && state.marbles[seat].some((p) => p.zone === 'base')) score += 6;
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

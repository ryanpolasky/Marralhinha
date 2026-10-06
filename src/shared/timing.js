// How long the client shows the "who starts" wheel; bots wait for it (keep in sync with START_WHEEL_MS in src/game/moves.js)
const START_WHEEL_MS = 8500;
const START_WINNER_MS = 2200;

// Bots wait for the dice and marble animations to finish before acting
function animationMs(game, now = Date.now()) {
  const recent = (event) => event && now - event.t < 250;
  let ms = 0;
  if (recent(game.lastRoll)) ms = 1300;
  if (recent(game.lastMove)) ms = Math.max(ms, 350 + game.lastMove.path.length * 190 + (game.lastMove.capture ? 700 : 0));
  if (game.pick) {
    const introMs = game.pick.reason === 'wheel' ? START_WHEEL_MS : START_WINNER_MS;
    if (now - game.pick.t < introMs) ms = Math.max(ms, introMs - (now - game.pick.t));
  }
  return ms;
}

module.exports = { START_WHEEL_MS, START_WINNER_MS, animationMs };

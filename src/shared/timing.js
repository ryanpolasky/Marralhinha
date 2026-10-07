const START_WHEEL_MS = 8500;
const START_WHEEL_SPIN_MS = 4300;
const START_WINNER_MS = 2200;
// null means no limit
const TURN_SECONDS = [15, 20, 25, 30, 35, 40, 45, null];
const TURN_SECONDS_DEFAULT = 30;

const moveAnimMs = (mv) => 350 + (mv.path?.length || 1) * 190 + (mv.capture ? 700 : 0);

// Bots wait for the dice and marble animations to finish before acting
function animationMs(game, now = Date.now()) {
  const recent = (event) => event && now - event.t < 250;
  let ms = 0;
  if (recent(game.lastRoll)) ms = 1300;
  if (recent(game.lastMove)) ms = Math.max(ms, moveAnimMs(game.lastMove));
  if (game.pick) {
    const introMs = game.pick.reason === 'wheel' ? START_WHEEL_MS : START_WINNER_MS;
    if (now - game.pick.t < introMs) ms = Math.max(ms, introMs - (now - game.pick.t));
  }
  return ms;
}

module.exports = { START_WHEEL_MS, START_WHEEL_SPIN_MS, START_WINNER_MS, TURN_SECONDS, TURN_SECONDS_DEFAULT, moveAnimMs, animationMs };

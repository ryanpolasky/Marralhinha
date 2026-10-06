import { useEffect, useRef, useState } from 'react';
import { NO_MOVES_HOLD_MS, ROLL_REVEAL_MS, handoffMs, startPendingFor } from './moves';

// [rolling, stuck]: the dice are still tumbling, then (with holdStuck) a beat to read a dead roll before the turn moves on
export function useRollPending(lastRoll, holdStuck = false) {
  const [pending, setPending] = useState(null);
  const seen = useRef(lastRoll?.t);
  const t = lastRoll?.t;
  const stuck = holdStuck && !!lastRoll?.noMoves;
  useEffect(() => {
    if (!t || t === seen.current) return undefined;
    seen.current = t;
    setPending({ t, phase: 'rolling' });
    const timers = [setTimeout(() => setPending((p) => (p?.t === t ? (stuck ? { t, phase: 'stuck' } : null) : p)), ROLL_REVEAL_MS)];
    if (stuck) timers.push(setTimeout(() => setPending((p) => (p?.t === t ? null : p)), ROLL_REVEAL_MS + NO_MOVES_HOLD_MS));
    return () => timers.forEach(clearTimeout);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  // A brand new roll counts as rolling on its very first render, before the effect has caught up
  const phase = t && t !== seen.current ? 'rolling' : pending && pending.t === t ? pending.phase : null;
  return [phase === 'rolling', phase === 'stuck'];
}

// True while a turn-ending move plays out before handing over to the next human (ends early if someone rolls)
export function useHandoff(game, seats, enabled = false) {
  const [held, setHeld] = useState(null);
  const mv = game?.lastMove;
  const t = mv?.t;
  const seen = useRef(t);
  const handsOver = enabled && !!mv && game.phase === 'roll' && game.turn !== game.lastRoll?.seat && !!seats?.[game.turn] && !seats[game.turn].isBot;
  useEffect(() => {
    if (!t || t === seen.current) return undefined;
    seen.current = t;
    if (!handsOver) return undefined;
    setHeld({ t, roll: game.lastRoll?.t });
    const timer = setTimeout(() => setHeld((h) => (h?.t === t ? null : h)), handoffMs(mv));
    return () => clearTimeout(timer);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  if (t && t !== seen.current) return handsOver;
  return !!held && held.t === t && held.roll === game?.lastRoll?.t;
}

// True while the "who starts" intro plays for a freshly started game
export function useStartPending(game) {
  const remaining = startPendingFor(game);
  const pickT = game?.pick?.t;
  const [dismissed, setDismissed] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => tick((n) => n + 1), remaining + 20);
    return () => clearTimeout(timer);
  }, [remaining, pickT]);
  return [remaining > 0 && dismissed !== pickT, () => setDismissed(pickT)];
}

import { renderHook } from '@testing-library/react';
import { useHandoff, useRollPending } from './pending';

const seats = [{ id: 'a' }, null, { id: 'b' }, null];
const rolled = { phase: 'move', turn: 0, lastRoll: { seat: 0, die: 3, t: 1 }, lastMove: null };
const moved = { phase: 'roll', turn: 2, lastRoll: { seat: 0, die: 3, t: 1 }, lastMove: { seat: 0, marble: 0, path: [1, 2, 3], t: 2 } };

test('a turn-ending move holds the handoff on the very first render', () => {
  const seen = [];
  const { result, rerender } = renderHook(({ game }) => seen.push(useHandoff(game, seats, true)) && seen[seen.length - 1], { initialProps: { game: rolled } });
  rerender({ game: moved });
  expect(seen[1]).toBe(true);
  expect(result.current).toBe(true);
});

test('no handoff when the next seat is a bot', () => {
  const botNext = [{ id: 'a' }, null, { id: 'b', isBot: true }, null];
  const { result, rerender } = renderHook(({ game }) => useHandoff(game, botNext, true), { initialProps: { game: rolled } });
  rerender({ game: moved });
  expect(result.current).toBe(false);
});

test('a fresh roll counts as rolling before its effect runs', () => {
  const seen = [];
  const { rerender } = renderHook(({ roll }) => seen.push(useRollPending(roll, true)[0]), { initialProps: { roll: null } });
  rerender({ roll: { seat: 0, die: 2, noMoves: true, t: 5 } });
  expect(seen[1]).toBe(true);
});

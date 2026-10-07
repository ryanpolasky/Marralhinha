import { coveringTurn, handoffMs, HANDOFF_BEAT_MS } from './moves';

const away = { id: 'a', away: true, connected: true, coveredBy: 'b' };
const game = { mode: 'teams', turn: 0, phase: 'roll' };

test('covering a partner needs you present, like the server', () => {
  expect(coveringTurn(game, [away, null, { id: 'b', connected: true }, null], 2)).toBe(true);
  expect(coveringTurn(game, [away, null, { id: 'b', connected: true, idle: true }, null], 2)).toBe(false);
  expect(coveringTurn(game, [away, null, { id: 'b', connected: true }, null], 1)).toBe(false);
  expect(coveringTurn(game, [away, null, { id: 'b', connected: true }, null], -1)).toBe(false);
});

test('handoff waits for the move animation plus a beat', () => {
  expect(handoffMs({ path: [1, 2, 3] })).toBe(350 + 3 * 190 + HANDOFF_BEAT_MS);
  expect(handoffMs({ path: [1], capture: {} })).toBe(350 + 190 + 700 + HANDOFF_BEAT_MS);
});

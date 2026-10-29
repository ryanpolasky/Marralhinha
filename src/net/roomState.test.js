import { mergeRoomState } from './roomState';

test('keeps the previous log when the next game state omits it', () => {
  const prev = { game: { log: [{ text: 'Earlier' }] } };
  const next = { code: 'ROOM', game: { turn: 1 } };
  expect(mergeRoomState(prev, next)).toEqual({ ...next, game: { turn: 1, log: prev.game.log } });
});

test('passes through the next state when its game log is present', () => {
  const next = { code: 'ROOM', game: { turn: 1, log: [{ text: 'Latest' }] } };
  expect(mergeRoomState({ game: { log: [{ text: 'Earlier' }] } }, next)).toBe(next);
});

test('uses an empty log when there is no previous game state', () => {
  const next = { code: 'ROOM', game: { turn: 1 } };
  expect(mergeRoomState(null, next)).toEqual({ ...next, game: { turn: 1, log: [] } });
});

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

test('applies a log patch and removes it from the merged state', () => {
  const previousLog = [{ text: 'Earlier' }, { text: 'Earlier still' }];
  const next = { code: 'ROOM', game: { turn: 1, logPatch: { drop: 0, add: [{ text: 'Latest' }] } } };
  expect(mergeRoomState({ game: { log: previousLog } }, next)).toEqual({
    code: 'ROOM',
    game: { turn: 1, log: [...previousLog, { text: 'Latest' }] },
  });
});

test('applies a patch over a log trimmed to the limit', () => {
  const previousLog = Array.from({ length: 100 }, (_, i) => ({ text: `Entry ${i}` }));
  const next = { game: { logPatch: { drop: 1, add: [{ text: 'New entry' }] } } };
  expect(mergeRoomState({ game: { log: previousLog } }, next).game.log).toEqual([
    ...previousLog.slice(1),
    { text: 'New entry' },
  ]);
});

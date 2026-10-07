import { pickShot } from './hits';

const base = { zone: 'base' };
const track = (idx) => ({ zone: 'track', idx });

test('pickShot lines up the closest pair out on the board and skips marbles already down', () => {
  const game = { variant: 'classic', marbles: [[base, track(10), track(30)], [track(12), track(50), base]], hits: [] };
  expect(pickShot(game, 0, 1)).toEqual({ by: 0, byMarble: 1, victim: 1, victimMarble: 0 });
  game.hits = [{ id: 'h', victim: 1, victimMarble: 0, undone: false }];
  expect(pickShot(game, 0, 1).victimMarble).toBe(1);
  game.hits[0].undone = true;
  expect(pickShot(game, 0, 1).victimMarble).toBe(0);
});

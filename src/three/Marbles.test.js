import { planMove } from './Marbles';

const track = (idx) => ({ zone: 'track', idx });
const base = { zone: 'base' };

test('a marble hopping past another taps on top of it instead of passing through', () => {
  const board = {
    active: [0, 1],
    marbles: [
      [track(14), base, base, base, base],
      [track(12), base, base, base, base],
    ],
  };
  const lastMove = { seat: 0, marble: 0, kind: 'step', from: track(10), to: track(14), path: [11, 12, 13, 14].map(track), capture: null, t: 1 };
  const hops = planMove(lastMove, board)['0-0'];

  expect(hops.map((h) => h.tap)).toEqual([false, true, false, false]);
  expect(hops[1].to.y).toBeGreaterThan(hops[0].to.y + 0.5);
  expect(hops[3].to.y).toBe(hops[0].to.y);
});

test('landing on an opponent is a capture, not a tap', () => {
  const board = {
    active: [0, 1],
    marbles: [
      [track(13), base, base, base, base],
      [base, base, base, base, base],
    ],
  };
  const lastMove = { seat: 0, marble: 0, kind: 'step', from: track(11), to: track(13), path: [12, 13].map(track), capture: { seat: 1, marble: 0 }, t: 2 };
  const plans = planMove(lastMove, board);

  expect(plans['0-0'].some((h) => h.tap)).toBe(false);
  expect(plans['1-0'][0].impact).toBeTruthy();
});

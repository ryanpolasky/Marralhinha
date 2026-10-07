import shared from '../shared/stunts';
import { layoutFor } from './geometry';
import { knockOffset, rockyKnocks, rockyPose, rockyTiming } from './stunts';

test('a Rocky run leaves its spot, finishes on the deepest free home slot, and celebrates there until cut', () => {
  const layout = layoutFor('classic');
  const marbles = [[{ zone: 'base' }, { zone: 'home', slot: 4 }, { zone: 'base' }, { zone: 'base' }, { zone: 'base' }]];
  const path = shared.rockyPath(0, 0, marbles, 'classic');
  expect(path.at(-1)).toEqual({ zone: 'home', slot: 3 });
  const stunt = { id: 'r', kind: 'rocky', seat: 0, marble: 0, at: marbles[0][0], path };
  const time = rockyTiming(path.length);
  const [r, c] = layout.BASE[0][0];
  const start = rockyPose(stunt, layout, 0.01);
  expect([start.pos.x, start.pos.z]).toEqual([expect.closeTo(c, 1), expect.closeTo(r, 1)]);
  const [hr, hc] = layout.HOME[0][3];
  const end = rockyPose(stunt, layout, time.celebrate + 0.01);
  expect([end.pos.x, end.pos.z]).toEqual([expect.closeTo(hc, 1), expect.closeTo(hr, 1)]);
  const later = rockyPose(stunt, layout, time.settle + 600);
  expect([later.pos.x, later.pos.z, later.legs, later.arms]).toEqual([expect.closeTo(hc, 1), expect.closeTo(hr, 1), 1, 'up']);
  const shrinking = rockyPose({ ...stunt, id: 'r1', cut: true, cutAge: 300 }, layout, time.settle + 600);
  expect(shrinking.legs).toBeGreaterThan(0);
  expect(shrinking.legs).toBeLessThan(1);
  expect(rockyPose({ ...stunt, id: 'r2', cut: true, cutAge: 2000 }, layout, 3)).toBeNull();
});

test('marbles on the route get knocked in the order the runner reaches them and drop back before it settles', () => {
  const layout = layoutFor('classic');
  const marbles = [[{ zone: 'base' }, { zone: 'base' }], [{ zone: 'track', idx: 30 }, { zone: 'base' }], [{ zone: 'track', idx: 10 }, { zone: 'center' }]];
  const path = shared.rockyPath(0, 0, marbles, 'classic');
  const stunt = { id: 'k', kind: 'rocky', seat: 0, marble: 0, at: marbles[0][0], path };
  const knocks = rockyKnocks(stunt, layout, marbles);
  expect(knocks.map((k) => [k.seat, k.marble])).toEqual([[2, 0], [1, 0]]);
  const time = rockyTiming(path.length);
  expect(knocks[0].t).toBeGreaterThan(time.intro);
  expect(knocks[1].t).toBeGreaterThan(knocks[0].t);
  expect(knocks.every((k) => k.t < time.celebrate && k.back < time.settle)).toBe(true);
  expect(knockOffset(knocks[0], knocks[0].t + 2).visible).toBe(false);
  expect(knockOffset(knocks[0], time.settle + 1)).toBeNull();
});

test('a marble already close to home gets a bonus lap', () => {
  const marbles = [[{ zone: 'track', idx: 58 }]];
  expect(shared.rockyPath(0, 0, marbles, 'classic').length).toBe(62 - 56 + 64 + 5);
});

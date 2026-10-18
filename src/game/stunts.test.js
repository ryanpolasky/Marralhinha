import shared from '../shared/stunts';
import { computeAwards } from './fun';
import { layoutFor, positionIn } from './geometry';
import { UFO, UFO_SCRIPT, boardSurfaceY, knockOffset, rockyKnocks, rockyPose, rockyTiming, ufoPhase, ufoSway, ufoTalking } from './stunts';

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

test('the close encounter lifts the star into the hatch, hides it for the lab scenes, spits it back and lands it', () => {
  const rising = ufoSway((UFO.lift + UFO.aboard) / 2, true, 0);
  expect(rising.visible).toBe(true);
  expect(rising.y).toBeGreaterThan(0.5);
  expect(rising.spin).toBe(true);

  expect(ufoSway(UFO.toLab + 1, true, 0).visible).toBe(false);
  expect(ufoSway(UFO.kitchen + 1, true, 0).visible).toBe(false);

  const falling = ufoSway((UFO.eject + UFO.land) / 2, true, 0);
  expect(falling.visible).toBe(true);
  expect(falling.y).toBeGreaterThan(0.2);

  const landed = ufoSway(UFO.end + 0.5, true, 0);
  expect(landed.visible).toBe(true);
  expect(landed.y).toBe(0);

  const bystander = ufoSway(UFO.lift, false, 3);
  expect(bystander.visible).toBe(true);
  expect(Math.abs(bystander.x)).toBeLessThan(0.05);
  expect(ufoSway(UFO.land + 0.2, false, 0).y).toBeGreaterThan(0.05);
});

test('the script keeps one Grey talking at a time and every line lands inside a lab or kitchen scene', () => {
  UFO_SCRIPT.forEach((line, i) => {
    expect(line.until).toBeGreaterThan(line.at);
    expect(line.until - line.at).toBeGreaterThanOrEqual(2.25);
    expect(line.until - line.at).toBeGreaterThanOrEqual(line.text.length / 13);
    expect(['lab', 'kitchen']).toContain(ufoPhase(line.at));
    expect(ufoPhase(line.until - 0.01)).toBe(ufoPhase(line.at));
    UFO_SCRIPT.slice(i + 1).forEach((other) => expect(other.at >= line.until || other.until <= line.at).toBe(true));
  });
  expect(ufoTalking(0, UFO.specimen + 0.5)).toBe(true);
  expect(ufoTalking(1, UFO.specimen + 0.5)).toBe(false);
});

test('a timed bit holds the bots until it is over; Rocky and cut bits do not', () => {
  const now = 1000000;
  expect(shared.stuntHoldMs([{ kind: 'ufo', t: now - 5000 }], now)).toBe(Math.round((UFO.end - 5) * 1000));
  expect(shared.stuntHoldMs([{ kind: 'ufo', t: now - 5000, cutAt: now - 100 }], now)).toBe(0);
  expect(shared.stuntHoldMs([{ kind: 'rocky', t: now - 5000 }], now)).toBe(0);
  expect(shared.stuntHoldMs([], now)).toBe(0);
  expect(shared.stuntHoldMs([{ kind: 'flash', t: now - 60000 }], now)).toBe(0);
});

test('dice storm rolls 50 dice across the board and table without landing on marbles or overlapping', () => {
  const layout = layoutFor('classic');
  const marbles = [
    [{ zone: 'track', idx: 2 }, { zone: 'track', idx: 8 }, { zone: 'home', slot: 2 }, { zone: 'base' }, { zone: 'base' }],
    [{ zone: 'center' }, { zone: 'track', idx: 24 }, { zone: 'base' }, { zone: 'base' }, { zone: 'base' }],
    [{ zone: 'track', idx: 36 }, { zone: 'home', slot: 0 }, { zone: 'base' }, { zone: 'base' }, { zone: 'base' }],
    [{ zone: 'track', idx: 50 }, { zone: 'base' }, { zone: 'base' }, { zone: 'base' }, { zone: 'base' }],
  ];
  const dice = shared.rollStuntDice(0, marbles, 'classic');
  expect(dice).toHaveLength(shared.DICE_STORM_COUNT);
  const onBoard = dice.filter((d) => d.onBoard);
  const offBoard = dice.filter((d) => !d.onBoard);
  expect(onBoard.length).toBeGreaterThanOrEqual(10);
  expect(offBoard.length).toBeGreaterThanOrEqual(25);

  const marbleSpots = marbles.flatMap((row, s) =>
    row.map((pos, m) => {
      const [r, c] = positionIn(s, pos, m, layout);
      return [c, r];
    })
  );
  dice.forEach((d, i) => {
    expect(d.die).toBeGreaterThanOrEqual(1);
    expect(d.die).toBeLessThanOrEqual(6);
    if (d.onBoard) expect(boardSurfaceY(d.x, d.z, 'classic', -0.66)).toBe(0);
    else expect(boardSurfaceY(d.x, d.z, 'classic', -0.66)).toBe(-0.66);
    marbleSpots.forEach(([mx, mz]) => {
      expect(Math.hypot(d.x - mx, d.z - mz)).toBeGreaterThanOrEqual(shared.MARBLE_CLEARANCE - 0.02);
    });
    dice.slice(i + 1).forEach((other) => {
      expect(Math.hypot(d.x - other.x, d.z - other.z)).toBeGreaterThanOrEqual(shared.DIE_CLEARANCE - 0.02);
    });
  });
});

test('computeAwards pulls unique awards from the pool and caps each player at 2', () => {
  const game = {
    active: [0, 1, 2, 3],
    stats: [
      { rolls: 10, pips: 52, sixes: 6, captures: 4, captured: 0, shortcuts: 3, evictions: 2, longestCenter: 5, heartbreaks: 2, bestStreak: 3, noMoves: 0, steps: 40 },
      { rolls: 10, pips: 25, sixes: 1, captures: 1, captured: 4, shortcuts: 0, evictions: 0, longestCenter: 0, heartbreaks: 0, bestStreak: 1, noMoves: 4, steps: 10 },
      { rolls: 10, pips: 35, sixes: 2, captures: 4, captured: 1, shortcuts: 3, evictions: 0, longestCenter: 0, heartbreaks: 2, bestStreak: 1, noMoves: 1, steps: 20 },
      { rolls: 10, pips: 26, sixes: 0, captures: 0, captured: 4, shortcuts: 0, evictions: 2, longestCenter: 5, heartbreaks: 0, bestStreak: 0, noMoves: 4, steps: 12 },
    ],
  };
  const awards = computeAwards(game);
  const titles = awards.map((a) => a.title);
  expect(new Set(titles).size).toBe(titles.length);
  for (const seat of game.active) {
    const mine = awards.filter((a) => a.seat === seat);
    expect(mine.length).toBeLessThanOrEqual(2);
    expect(mine.length).toBeGreaterThanOrEqual(1);
  }
});

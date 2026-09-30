import { layoutFor, positionIn, entryIdx, tipIdx } from './geometry';

test('the shared blitz layout builds the same connected 40-cell board as the rules', () => {
  const blitz = layoutFor('blitz');
  expect(blitz.RING).toHaveLength(40);
  expect(new Set(blitz.RING.map(([r, c]) => `${r},${c}`)).size).toBe(40);
  for (let seat = 0; seat < 4; seat += 1) {
    const end = blitz.RING[seat * 10 + 9];
    const next = blitz.RING[((seat + 1) % 4) * 10];
    expect(Math.abs(end[0] - next[0]) + Math.abs(end[1] - next[1])).toBe(1);
  }
  expect(blitz.INNER_CORNERS).toEqual([5, 15, 25, 35]);
  expect(entryIdx(0, blitz)).toBe(2);
  expect(tipIdx(0, blitz)).toBe(0);
});

test('blitz positions use three bases, three home holes and the smaller ring', () => {
  const blitz = layoutFor('blitz');
  expect(blitz.BASE.every((base) => base.length === 3)).toBe(true);
  expect(blitz.HOME.every((home) => home.length === 3)).toBe(true);
  expect(positionIn(0, { zone: 'track', idx: 35 }, 0, blitz)).toEqual([2, -2]);
  expect(positionIn(0, { zone: 'home', slot: 2 }, 0, blitz)).toEqual([2, 0]);
  expect(positionIn(0, { zone: 'base' }, 2, blitz)).toEqual(blitz.BASE[0][2]);
});

test('blitz holes, trays and dice fit the physical board without overlap', () => {
  const { spec, RING, HOME, BASE, BASE_TRAY, DIE_SPOT } = layoutFor('blitz');
  for (const [r, c] of [...RING, ...HOME.flat()]) {
    expect(Math.max(Math.abs(r), Math.abs(c)) + 0.5).toBeLessThanOrEqual(spec.halfLength);
    expect(Math.min(Math.abs(r), Math.abs(c)) + 0.5).toBeLessThanOrEqual(spec.halfWidth);
  }
  for (let seat = 0; seat < 4; seat += 1) {
    const [r, c] = BASE_TRAY[seat];
    expect(Math.min(Math.abs(r), Math.abs(c)) - spec.dishR).toBeGreaterThan(spec.halfWidth);
    for (const [br, bc] of BASE[seat]) expect(Math.hypot(br - r, bc - c) + 0.37).toBeLessThan(spec.dishR);
    const [dr, dc] = DIE_SPOT[seat];
    expect(Math.hypot(dr - r, dc - c)).toBeGreaterThan(spec.dishR + 0.12 + 0.85 * 0.75 + 0.08);
  }
});

test('classic remains the unchanged default layout', () => {
  const classic = layoutFor();
  expect(classic.RING).toHaveLength(64);
  expect(classic.BASE[0]).toHaveLength(5);
  expect(classic.HOME[0]).toHaveLength(5);
  expect(classic.INNER_CORNERS).toEqual([8, 24, 40, 56]);
});

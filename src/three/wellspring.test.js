import * as THREE from 'three';
import { wellDecorationMask, wellMarble, wellBoard, wellSpriteMask } from './wellspring';
import { layoutFor, SEAT_COLORS } from '../game/geometry';
import { ITEMS, DROPPABLE, SETS } from '../game/catalog';
import { KILL_FX, TILE } from './killfx';
import { TRAILS } from './trails';

test('sprite backing fills open rib gaps and adds exactly one pixel of dark outline', () => {
  const data = new Uint8ClampedArray(3 * 3 * 4);
  ['#.#', '#.#', '.#.'].forEach((row, y) => [...row].forEach((ink, x) => { data[(y * 3 + x) * 4 + 3] = ink === '#' ? 255 : 0; }));
  const mask = wellSpriteMask({ data, width: 3, height: 3 });
  expect(Array.from({ length: 5 }, (_, y) => [...mask.slice(y * 5, y * 5 + 5)].join(''))).toEqual(['11111', '11111', '11111', '11111', '01110']);
});

test('sprite backing leaves an empty or missing sprite transparent', () => {
  expect([...wellSpriteMask({ data: new Uint8ClampedArray(36), width: 3, height: 3 })].every((v) => v === 0)).toBe(true);
  expect([...wellSpriteMask({ data: [], width: 0, height: 0 })]).toEqual([0, 0, 0, 0]);
});

test.each(['classic', 'blitz'])('%s decorative mask clears every hole, bevel, lip and home stretch', (variant) => {
  const layout = layoutFor(variant);
  const holes = [[0, 0], ...layout.RING, ...layout.HOME.flat(), ...layout.BASE.flat()];
  const mask = wellDecorationMask(layout);
  expect(mask.length).toBe(128 * 128);
  expect(mask.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(8000);
  let clearance = Infinity, stripOverlap = 0;
  mask.forEach((allowed, i) => {
    if (!allowed) return;
    const r = (Math.floor(i / 128) + .5 - 64) / 32, c = (i % 128 + .5 - 64) / 32;
    holes.forEach(([hr, hc]) => { clearance = Math.min(clearance, Math.hypot(r - hr, c - hc) - Math.SQRT2 / 64); });
    layout.HOME.flat().forEach(([hr, hc]) => { if (Math.abs(r - hr) < .6 && Math.abs(c - hc) < .6) stripOverlap++; });
  });
  expect(clearance).toBeGreaterThan(.57);
  expect(stripOverlap).toBe(0);
});

test('empty tracks still reserve the central hole', () => {
  const mask = wellDecorationMask({ RING: [], HOME: [], BASE: [] });
  expect(mask[64 * 128 + 64]).toBe(0);
  expect(mask[32 * 128 + 64]).toBe(1);
  expect(mask[0]).toBe(0);
});

test('only the canonical Wellspring marble remains in the six-piece set', () => {
  for (const variant of ['a', 'b', 'c', 'd']) {
    expect(ITEMS[`marble.wellspring_${variant}`]).toBeUndefined();
    expect(ITEMS[`board.wellspring_${variant}`]).toBeUndefined();
  }
  expect(ITEMS['marble.wellspring'].name).toBe('Rough Cut');
  expect(DROPPABLE.some((item) => item.id === 'marble.wellspring')).toBe(true);
  expect(SETS.wellspring.items).toHaveLength(6);
});

test('Rough Cut bypasses smooth lighting and the canonical board masks its animated frame layer', () => {
  const ctx = new Proxy({}, { get: () => () => {} });
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  try {
      for (const color of SEAT_COLORS) {
        const spec = wellMarble(color);
        expect(spec.map.magFilter).toBe(THREE.NearestFilter);
        expect(spec.map.minFilter).toBe(THREE.NearestFilter);
        expect(spec.toneMapped).toBe(false);
        expect(spec.specularIntensity).toBe(0);
        expect(spec.flatShading).toBe(true);
        expect(spec.geometry.name).toBe('WellspringDiamond');
        expect(spec.upright).toBe(true);
        const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <opaque_fragment>' };
        spec.onBeforeCompile(shader);
        expect(shader.fragmentShader).toContain('outgoingLight = diffuseColor.rgb;');
        spec.animate(null, 3.375);
        expect(shader.uniforms.uWellTwinkle.value).toBe(.5);
        spec.animate(null, 1);
        expect(shader.uniforms.uWellTwinkle.value).toBe(-1);
      }
    for (const variant of ['classic', 'blitz']) {
      const spec = wellBoard(layoutFor(variant));
      const texture = spec.uniforms.uWellCenter.value;
      const materials = { board: { userData: { skinTime: { value: 0 } } } };
      spec.animate(materials);
      const version = texture.version;
      materials.board.userData.skinTime.value = 1;
      spec.animate(materials);
      expect(texture.version).toBeGreaterThan(version);
      const held = texture.version;
      spec.animate(materials);
      expect(texture.version).toBe(held);
    }
  } finally {
    getContext.mockRestore();
  }
});

test('Rough Cut freezes its surface animation for reduced motion', () => {
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => () => {} }));
  const old = window.matchMedia;
  window.matchMedia = () => ({ matches: true });
  try {
    const spec = wellMarble(SEAT_COLORS[0]);
    spec.animate(null, 3.375);
    expect(spec.userData.wellTwinkle.value).toBe(-1);
  } finally { getContext.mockRestore(); window.matchMedia = old; }
});

test('Rough Cut rests clean and shows a tiny camera-aligned plus for only two of 32 frames', () => {
  const frames = [];
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const rectangles = [];
    frames.push(rectangles);
    return { fillStyle: '', fillRect(x, y, width, height) { rectangles.push({ color: this.fillStyle, x, y, width, height }); } };
  });
  try {
    const spec = wellMarble(SEAT_COLORS[0]);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(8);
    expect(frames[0].some(({ color }) => color === '#f4efe6')).toBe(false);
    expect(spec.userData.wellTwinkle.value).toBe(-1);
    let active = 0;
    for (let frame = 0; frame < 32; frame++) {
      spec.animate(null, frame / 8);
      if (spec.userData.wellTwinkle.value >= 0) active++;
    }
    expect(active).toBe(2);
    expect(3 * .045 / 2).toBeLessThan(.15);
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <opaque_fragment>' };
    spec.onBeforeCompile(shader);
    expect(shader.fragmentShader).toContain('abs(pixel.x) < 0.5 && abs(pixel.y) < 1.5');
    expect(shader.fragmentShader).toContain('abs(pixel.y) < 0.5 && abs(pixel.x) < 1.5');
  } finally { getContext.mockRestore(); }
});

test('Stomp is one short gem burst with one upward soul and no delayed echo', () => {
  const emit = jest.fn(), seq = jest.fn(), later = jest.fn(), sfx = jest.fn();
  KILL_FX.wellspring(emit, { at: [1, 0.4, 2], by: 0, victim: 1, seq, later, sfx });
  const sprites = emit.mock.calls.filter(([type]) => type === 'spr').map(([, data]) => data);
  expect(sprites.map((s) => s.tile)).toEqual([TILE.smoke, TILE.square, TILE.wellGem, TILE.wellSoul]);
  expect(sprites.every((s) => s.px && s.life * 1.25 <= 1)).toBe(true);
  expect(sprites[2].c).toContain(SEAT_COLORS[1].main);
  expect(sprites[3].up).toBeGreaterThan(0);
  expect(seq).not.toHaveBeenCalled(); expect(later).not.toHaveBeenCalled();
});

test.each([{ bumps: [] }, { bumps: [[0, 1]] }])('Magic Missile remains on the hop arc and above obstacles $bumps', ({ bumps }) => {
  const emit = jest.fn();
  TRAILS.wellspring(emit, [0, 0.7, 0.9], { by: 2, prev: [0, 0.6, 1.2], n: 0, bumps });
  const missiles = emit.mock.calls.map(([, s]) => s).filter((s) => s.tile === TILE.wellMissile);
  expect(missiles).toHaveLength(3);
  missiles.forEach((s) => {
    expect(s.position[1]).toBeGreaterThanOrEqual(0.6);
    expect(s.px).toBe(true);
    expect(s.c[0] === '#f4efe6' || s.c[0] === SEAT_COLORS[2].main).toBe(true);
  });
});

test('Magic Missile tolerates its first stationary sample without a previous point', () => {
  const emit = jest.fn();
  TRAILS.wellspring(emit, [0, 0.1, 0], {});
  expect(emit).toHaveBeenCalled();
  emit.mock.calls.forEach(([, s]) => expect([...s.position, s.rot].every(Number.isFinite)).toBe(true));
});

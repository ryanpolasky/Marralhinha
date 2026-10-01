import { planMove } from './Marbles';
import { marbleSkin, diceSkin, animateDiceSkin, boardSkin, animateBoardSkin } from './skins';
import { layoutFor } from '../game/geometry';

const track = (idx) => ({ zone: 'track', idx });
const base = { zone: 'base' };

test('Supporter materials animate their accents without animating pip colors under reduced motion', () => {
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => target[key] || (() => {}) });
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const originalMatchMedia = window.matchMedia;
  const motion = { matches: false };
  window.matchMedia = () => motion;
  try {
    const marble = marbleSkin('marble.supporter', 0);
    const marbleShader = { uniforms: {}, fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    marble.material.onBeforeCompile(marbleShader);
    expect(marbleShader.fragmentShader).toContain('uTideColor');
    expect(marbleShader.fragmentShader).toContain('totalEmissiveRadiance');
    expect(marbleShader.fragmentShader).toContain('float tideU = uv.x * 6.28318530718;');
    expect(marbleShader.fragmentShader).toContain('tideU * 2.0');
    expect(marbleShader.fragmentShader).toContain('tideU * 5.0');
    marble.animate(3);
    expect(marbleShader.uniforms.uTide.value).toBe(3);

    const dice = diceSkin('dice.supporter');
    expect(dice).toHaveLength(6);
    for (const material of dice) {
      const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
      material.onBeforeCompile(shader);
      expect(shader.fragmentShader).toContain('1.0 - pip');
      expect(shader.fragmentShader).toContain('uSkinTime');
      expect(material.customProgramCacheKey()).toBe('dice-supporter-animated');
    }
    animateDiceSkin(dice);
    expect(dice[0].userData.skinTime.value).toBeGreaterThan(0);
    motion.matches = true;
    marble.animate(4);
    animateDiceSkin(dice);
    expect(marbleShader.uniforms.uTide.value).toBe(0);
    expect(dice[0].userData.skinTime.value).toBe(0);
  } finally {
    getContext.mockRestore();
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
    else delete window.matchMedia;
  }
});

test('Halloween skins build for every slot and keep their motion behind reduced-motion', () => {
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => target[key] || (() => {}) });
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const originalMatchMedia = window.matchMedia;
  const motion = { matches: false };
  window.matchMedia = () => motion;
  try {
    const marble = marbleSkin('marble.halloween', 1);
    const marbleShader = { uniforms: {}, fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    marble.material.onBeforeCompile(marbleShader);
    expect(marbleShader.fragmentShader).toContain('skFbm3');
    expect(marbleShader.fragmentShader).toContain('totalEmissiveRadiance');
    marble.animate(2);
    expect(marbleShader.uniforms.uTime.value).toBeGreaterThan(0);
    motion.matches = true;
    marble.animate(2);
    expect(marbleShader.uniforms.uTime.value).toBe(0);

    const dice = diceSkin('dice.halloween');
    expect(dice).toHaveLength(6);
    const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    dice[0].onBeforeCompile(shader);
    expect(shader.fragmentShader).toContain('skFbm3');
    expect(shader.fragmentShader).toContain('1.0 - pip');
    expect(dice[0].customProgramCacheKey()).toBe('dice-halloween-animated');

    const board = boardSkin('board.halloween', layoutFor('classic'));
    expect(board.board.map).toBeTruthy();
    expect(board.board.emissiveMap).toBeTruthy();
    expect(board.dish.emissiveMap).toBeTruthy();
    expect(board.core).toBeTruthy();
    expect(() => animateBoardSkin(board, 3)).not.toThrow();
    expect(boardSkin('board.halloween', layoutFor('blitz')).board).not.toBe(board.board);
  } finally {
    getContext.mockRestore();
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
    else delete window.matchMedia;
  }
});

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

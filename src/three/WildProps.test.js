import * as THREE from 'three';
import { routeScenery } from './WildProps';
import { clearOfPlay } from './minecraft';
import { layoutFor } from '../game/geometry';
import { ITEMS } from '../game/catalog';
import { marbleSkin, diceSkin, animateDiceSkin, boardSkin, animateBoardSkin } from './skins';
import { KILL_FX } from './killfx';
import { BALL, ballRock } from './Props';
import { victimPlan, planMove } from './Marbles';
import { TRAILS } from './trails';

test.each(['classic', 'blitz'])('Route 1 scenery leaves the %s track, trays and dice clear', (variant) => {
  const layout = layoutFor(variant);
  const scenery = routeScenery(layout);
  expect(scenery).toEqual(routeScenery(layout));
  expect(scenery.trees).toHaveLength(18);
  expect(scenery.grass.length).toBeGreaterThan(40);
  expect(scenery.flowers.length).toBeGreaterThan(20);
  scenery.trees.forEach(({ x, z, size }) => expect(clearOfPlay(layout, x, z, size + 0.2)).toBe(true));
  [...scenery.grass, ...scenery.flowers].forEach(({ x, z }) => expect(clearOfPlay(layout, x, z, 0.28)).toBe(true));
  scenery.rocks.forEach(({ x, z, size }) => expect(clearOfPlay(layout, x, z, size)).toBe(true));
  expect(clearOfPlay(layout, scenery.sign.x, scenery.sign.z, 0.8, 0.2)).toBe(true);
});

test('Wild Encounter has six mythic pieces without an entitlement requirement', () => {
  const items = Object.values(ITEMS).filter((item) => item.set === 'wild');
  expect(items.map((item) => item.slot).sort()).toEqual(['board', 'dice', 'fx', 'marble', 'nameplate', 'trail']);
  expect(items.every((item) => item.rarity === 'mythic' && !item.tag)).toBe(true);
});

test('capture enamel, die screen and route wind respect reduced motion on both board sizes', () => {
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => target[key] || (() => {}) });
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const originalMatchMedia = window.matchMedia;
  const motion = { matches: false };
  window.matchMedia = () => motion;
  try {
    const marbles = [0, 1, 2, 3].map((seat) => marbleSkin('marble.wild', seat));
    expect(new Set(marbles.map((skin) => skin.material))).toHaveProperty('size', 4);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    marbles[0].material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('vCapturePos = normalize(position)');
    expect(shader.fragmentShader).toContain('float bezel');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance');
    marbles[0].animate(3);
    expect(shader.uniforms.uCaptureTime.value).toBe(3);
    const dice = diceSkin('dice.wild');
    expect(dice).toHaveLength(6);
    const dieShader = { uniforms: {}, fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    dice[0].onBeforeCompile(dieShader);
    expect(dieShader.fragmentShader).toContain('float screen');
    animateDiceSkin(dice);
    expect(dice[0].userData.skinTime.value).toBeGreaterThan(0);
    const boards = ['classic', 'blitz'].map((variant) => boardSkin('board.wild', layoutFor(variant)));
    expect(boards[0].board).not.toBe(boards[1].board);
    boards.forEach((board) => {
      expect(new Set(board.dishes).size).toBe(4);
      expect(board.dishSide).toBeTruthy();
      animateBoardSkin(board, 3);
      expect(board.board.userData.skinTime.value).toBe(3);
    });
    motion.matches = true;
    marbles[0].animate(5);
    animateDiceSkin(dice);
    expect(shader.uniforms.uCaptureTime.value).toBe(0);
    expect(dice[0].userData.skinTime.value).toBe(0);
    boards.forEach((board) => {
      animateBoardSkin(board, 5);
      expect(board.board.userData.skinTime.value).toBe(0);
    });
  } finally {
    getContext.mockRestore();
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
    else delete window.matchMedia;
  }
});

test('the capturing marble swallows the victim, rocks three times and clicks, with no extra ball', () => {
  const spot = new THREE.Vector3(1, 0.07, 2);
  const home = new THREE.Vector3(5, 0.07, 5);
  const plan = victimPlan('wild', spot, home, {});
  expect(plan.slice(0, 2).reduce((time, segment) => time + segment.dur, 0)).toBeCloseTo(BALL.pop);
  expect(plan.slice(0, 3).every((segment) => segment.scale[0] < 0.1)).toBe(true);
  expect(plan[plan.length - 1]).toMatchObject({ to: home, final: true, scale: [1, 1, 1] });
  expect(ballRock(BALL.shakes[0] - 0.1)).toBe(0);
  expect(Math.abs(ballRock(BALL.shakes[1] + BALL.shake * 0.25))).toBeGreaterThan(0.05);
  expect(ballRock(BALL.click)).toBe(0);

  const track = (idx) => ({ zone: 'track', idx });
  const base = { zone: 'base' };
  const board = { active: [0, 1], marbles: [[track(13), base, base, base, base], [base, base, base, base, base]] };
  const move = { seat: 0, marble: 0, kind: 'step', from: track(11), to: track(13), path: [12, 13].map(track), capture: { seat: 1, marble: 0 }, t: 2 };
  const attacker = planMove(move, board, undefined, ['fx.wild'])['0-0'];
  expect(attacker[attacker.length - 1]).toMatchObject({ rock: true, quiet: true, dur: BALL.pop });
  expect(planMove(move, board, undefined, ['fx.anvil'])['0-0'].some((segment) => segment.rock)).toBe(false);

  const emit = jest.fn();
  const sfx = jest.fn();
  const events = [];
  KILL_FX.wild(emit, { at: spot.toArray(), sfx, later: (ms, fn) => events.push({ ms, fn }) });
  events.sort((a, b) => a.ms - b.ms).forEach(({ fn }) => fn());
  expect(emit.mock.calls.some(([type]) => type === 'gotcha')).toBe(false);
  expect(sfx.mock.calls.map(([sound]) => sound)).toEqual(['whip', 'zap', 'clack', 'clack', 'clack', 'ping']);
});

test('tall grass stays tidy and only startles when hopping onto another marble', () => {
  const emit = jest.fn();
  const alerts = () => emit.mock.calls.filter(([, data]) => data.tile === 15);
  TRAILS.wild(emit, [0, 0.1, 3], { n: 4, prev: [0, 0.1, 3.3], bumps: [[0, 1]] });
  expect(emit).toHaveBeenCalledTimes(1);
  expect(alerts()).toHaveLength(0);
  TRAILS.wild(emit, [0, 0.5, 1.1], { n: 5, prev: [0, 0.5, 1.45], bumps: [[0, 1]] });
  expect(alerts()).toHaveLength(1);
  expect(alerts()[0][1].position).toEqual([0, 1.45, 1]);
  TRAILS.wild(emit, [0, 0.5, 0.9], { n: 6, prev: [0, 0.5, 1.1], bumps: [[0, 1]] });
  expect(alerts()).toHaveLength(1);
});

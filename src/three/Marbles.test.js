import * as THREE from 'three';
import { planMove } from './Marbles';
import { marbleSkin, diceSkin, animateDiceSkin, boardSkin, animateBoardSkin, devTintAngle, devTintSat } from './skins';
import { layoutFor } from '../game/geometry';
import { ITEMS } from '../game/catalog';
import { campsiteBlocks } from './MinecraftProps';
import { KILL_FX, DEV_RED } from './killfx';
import { TRAILS } from './trails';
import { diskFrame, holeEnvelope } from './Gravity';

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

test('Defuse skins give every seat its own gem and every tray its own art on both board sizes', () => {
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => target[key] || (() => {}) });
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  try {
    const gems = [0, 1, 2, 3].map((seat) => marbleSkin('marble.defuse', seat));
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>' };
    gems[0].material.onBeforeCompile(shader);
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = gemCol');
    expect(shader.vertexShader).toContain('vGemPos');
    expect(new Set(gems.map((g) => g.material)).size).toBe(4);

    const dice = diceSkin('dice.defuse');
    const dieShader = { uniforms: {}, fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    dice[0].onBeforeCompile(dieShader);
    expect(dieShader.fragmentShader).toContain('lcd.r');

    const classic = boardSkin('board.defuse', layoutFor('classic'));
    const blitz = boardSkin('board.defuse', layoutFor('blitz'));
    expect(new Set(classic.dishes).size).toBe(4);
    expect(classic.surfaces).toHaveLength(5);
    expect(blitz.board).not.toBe(classic.board);
    expect(() => animateBoardSkin(blitz, 3)).not.toThrow();
  } finally {
    getContext.mockRestore();
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

test('Minecraft materials are distinct, pixel filtered, and motion safe on both board sizes', () => {
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => target[key] || (() => {}) });
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const originalMatchMedia = window.matchMedia;
  const motion = { matches: false };
  window.matchMedia = () => motion;
  try {
    const ores = [0, 1, 2, 3].map((seat) => marbleSkin('marble.minecraft', seat));
    expect(new Set(ores.map((ore) => ore.material)).size).toBe(4);
    expect(new Set(ores.map((ore) => ore.material.map)).size).toBe(4);
    expect(ores[0].material.map.image.width).toBe(16);
    const pixelMipped = (tex) => tex.magFilter === THREE.NearestFilter && tex.minFilter === THREE.NearestMipmapLinearFilter && tex.generateMipmaps;
    expect(pixelMipped(ores[0].material.map)).toBe(true);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>' };
    ores[0].material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('vOrePos = position');
    expect(shader.fragmentShader).toContain('texture2D(map, oreUv)');
    expect(shader.fragmentShader).toContain('texture2D(emissiveMap, oreUv)');
    ores[0].animate(1.1);
    expect(shader.uniforms.uOreGlow.value).toBeGreaterThan(0.35);
    motion.matches = true;
    ores[0].animate(1.1);
    expect(shader.uniforms.uOreGlow.value).toBe(0.35);
    motion.matches = false;

    const dice = diceSkin('dice.minecraft');
    expect(dice).toHaveLength(6);
    expect(pixelMipped(dice[0].map)).toBe(true);
    expect(pixelMipped(dice[0].emissiveMap)).toBe(true);
    expect(dice[0].customProgramCacheKey()).toBe('dice-minecraft-animated');
    motion.matches = true;
    animateDiceSkin(dice);
    expect(dice[0].userData.skinTime.value).toBe(0);

    const classic = boardSkin('board.minecraft', layoutFor('classic'));
    const blitz = boardSkin('board.minecraft', layoutFor('blitz'));
    expect(classic.board).not.toBe(blitz.board);
    expect([classic.board.map, classic.dish.map, classic.felt].every(pixelMipped)).toBe(true);
    expect(classic.felt.userData.tileSize).toBe(4);
    expect(classic.core).toBeUndefined();
    const dishShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    classic.dish.onBeforeCompile(dishShader);
    expect(dishShader.fragmentShader).toContain('length(vSkinPos.xz) - 2.20');
    expect(dishShader.uniforms.uPlank.value).toBeTruthy();
    const boardShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
    classic.board.onBeforeCompile(boardShader);
    expect(boardShader.fragmentShader).toContain('abs(vSkinPos.z) - 8.75');
    expect(boardShader.fragmentShader).toContain('texture2D(uBark');
    expect(boardShader.fragmentShader).toContain('texture2D(uPlank');
    expect(pixelMipped(classic.cup.map)).toBe(true);
    const cupShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>' };
    classic.cup.onBeforeCompile(cupShader);
    expect(cupShader.vertexShader).toContain('instanceMatrix * cupPos');
    expect(cupShader.fragmentShader).toContain('texture2D(map, vCupPos.xz)');
    expect(() => animateBoardSkin(blitz, 3)).not.toThrow();
  } finally {
    getContext.mockRestore();
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
    else delete window.matchMedia;
  }
});

test('the Minecraft set registers all six mythic slots without paid entitlements', () => {
  const set = Object.values(ITEMS).filter((item) => item.id.endsWith('.minecraft'));
  expect(set.map((item) => item.slot).sort()).toEqual(['board', 'dice', 'fx', 'marble', 'nameplate', 'trail']);
  expect(set.every((item) => item.rarity === 'mythic' && !item.tag)).toBe(true);
});

test.each(['classic', 'blitz'])('Minecraft scenery keeps every block off the %s board, trays, and die spots', (variant) => {
  const layout = layoutFor(variant);
  const { blocks, plants, torches, sheep, chickens, bees, clouds } = campsiteBlocks(layout);
  expect(torches).toHaveLength(6);
  expect(sheep).toHaveLength(1);
  expect(chickens).toHaveLength(2);
  expect(bees).toHaveLength(2);
  expect(clouds.every((c) => Math.abs(c.x) > 15 && c.cells.length >= 4)).toBe(true);
  expect(blocks.leaves.length).toBeGreaterThan(40);
  expect(blocks.roof.length).toBeGreaterThan(20);
  expect(['ore0', 'ore1', 'ore2', 'ore3'].every((ore) => blocks[ore]?.length)).toBe(true);
  expect(plants.tuft.length).toBeGreaterThan(40);
  const sheepReach = sheep.map(({ at: [x, z], rx, rz }) => ({ at: [x, 0, z], size: [rx * 2 + 0.7, 1, rz * 2 + 0.7] }));
  const chickenReach = chickens.map(({ at: [x, z] }) => ({ at: [x, 0, z], size: [0.5, 1, 0.5] }));
  const beeReach = bees.map(({ at: [x, , z], rx, rz }) => ({ at: [x, 0, z], size: [rx * 2 + 0.3, 1, rz * 2 + 0.3] }));
  [...Object.values(blocks).flat(), ...Object.values(plants).flat(), ...sheepReach, ...chickenReach, ...beeReach].forEach(({ at: [x, , z], size: [w, , d] }) => {
    const hw = layout.spec.halfWidth + 0.2;
    const hl = layout.spec.halfLength + 0.2;
    expect(Math.abs(x) - w / 2 > hw || Math.abs(z) - d / 2 > hl).toBe(true);
    expect(Math.abs(x) - w / 2 > hl || Math.abs(z) - d / 2 > hw).toBe(true);
    layout.BASE_TRAY.forEach(([r, c]) => {
      const gap = Math.hypot(Math.max(0, Math.abs(c - x) - w / 2), Math.max(0, Math.abs(r - z) - d / 2));
      expect(gap).toBeGreaterThan(layout.spec.dishR + 0.2);
    });
    layout.DIE_SPOT.forEach(([r, c]) => {
      const gap = Math.hypot(Math.max(0, Math.abs(c - x) - w / 2), Math.max(0, Math.abs(r - z) - d / 2));
      expect(gap).toBeGreaterThan(0.85);
    });
  });
});

test('Minecraft capture and trail emit pixel fragments and XP without falling back to other skins', () => {
  const emit = jest.fn();
  const sfx = jest.fn();
  const seq = (n, gap, fn) => Array.from({ length: n }, (_, i) => fn(i / (n - 1), i));
  KILL_FX.minecraft(emit, { at: [1, 0.4, 2], by: 0, victim: 1, sfx, later: (ms, fn) => fn(), seq });
  const types = emit.mock.calls.map(([type]) => type);
  expect(types).toContain('shard');
  expect(emit.mock.calls.find(([type]) => type === 'shard')[1]).toMatchObject({ shape: 'box', colors: expect.arrayContaining(['#2350c8']) });
  const orbPath = emit.mock.calls.filter(([, d]) => d.px && d.life === 0.06);
  expect(orbPath).toHaveLength(7 * 44);
  expect(Math.max(...orbPath.map(([, d]) => d.position[1]))).toBeCloseTo(1.95, 1);
  expect(sfx.mock.calls.map(([name]) => name)).toEqual(['crunch', ...Array(7).fill('xp'), 'levelUp']);
  expect(sfx.mock.calls.filter(([name]) => name === 'xp').map(([, step]) => step)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  emit.mockClear();
  TRAILS.minecraft(emit, [1, 0.4, 2], { n: 0 });
  expect(emit).toHaveBeenCalledTimes(4);
  expect(emit.mock.calls[1][1]).toMatchObject({ px: true, jitter: 0, uj: 0 });
  emit.mockClear();
  TRAILS.minecraft(emit, [1, 0.4, 2], { n: 1 });
  expect(emit).toHaveBeenCalledTimes(3);
});

test('Singularity marble swaps its sphere for the lensing aura', () => {
  expect(marbleSkin('marble.dev', 2).aura).toBe('singularity');
});

test('a singularity grows in, holds and collapses, and its disk stays nearly edge-on to the camera', () => {
  expect(holeEnvelope(-0.1, 1, 0.3, 0.2)).toBe(0);
  expect(holeEnvelope(0.5, 1, 0.3, 0.2)).toBe(1);
  expect(holeEnvelope(0.9, 1, 0.3, 0.2)).toBeLessThan(1);
  expect(holeEnvelope(1, 1, 0.3, 0.2)).toBe(0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 34, 34);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const [n, e1, e2] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  diskFrame(camera, 0, n, e1, e2);
  const view = new THREE.Vector3();
  camera.getWorldDirection(view);
  expect(Math.abs(n.dot(view))).toBeLessThan(0.45);
  expect(n.dot(e1)).toBeCloseTo(0);
  expect(n.dot(e2)).toBeCloseTo(0);
  expect(e1.length()).toBeCloseTo(1);
});

test('Accretion trail ripples without spawning holes, and the Supernova kill ends on a single vwomp', () => {
  const emit = jest.fn();
  const types = () => emit.mock.calls.map(([type]) => type);
  TRAILS.dev(emit, [1, 0.4, 2], { by: 0, n: 0 });
  expect(types()).toContain('warp');
  expect(types()).not.toContain('hole');
  emit.mockClear();
  TRAILS.dev(emit, [1, 0.4, 2], { by: 0, n: 1 });
  expect(types()).not.toContain('warp');
  emit.mockClear();
  const sfx = jest.fn();
  const seq = (n, gap, fn) => Array.from({ length: n }, (_, i) => fn(n > 1 ? i / (n - 1) : 1, i));
  KILL_FX.dev(emit, { at: [1, 0.4, 2], by: 0, victim: 1, sfx, later: (ms, fn) => fn(), seq });
  expect(emit.mock.calls.filter(([type]) => type === 'hole')).toHaveLength(1);
  expect(Math.max(...emit.mock.calls.filter(([type]) => type === 'warp').map(([, d]) => d.size))).toBeGreaterThan(10);
  expect(types()).not.toEqual(expect.arrayContaining(['bolt']));
  expect(types()).not.toContain('dome');
  expect(sfx.mock.calls.map(([name]) => name)).toEqual(['singularity', 'vwomp']);
});

test('Dev kit effects take the live seat color and fall back to red with no player', () => {
  const purple = { main: '#8b4dff', light: '#c7a8ff', dark: '#3d1a80' };
  const emit = jest.fn();
  const seq = (n, gap, fn) => Array.from({ length: n }, (_, i) => fn(n > 1 ? i / (n - 1) : 1, i));
  const holeColor = () => emit.mock.calls.find(([type]) => type === 'hole')[1].color;
  KILL_FX.dev(emit, { at: [0, 0.4, 0], by: 2, victim: 1, color: purple, sfx: () => {}, later: () => {}, seq });
  expect(holeColor()).toBe(purple);
  emit.mockClear();
  KILL_FX.dev(emit, { at: [0, 0.4, 0], by: 2, victim: 1, sfx: () => {}, later: () => {}, seq });
  expect(holeColor()).toBe(DEV_RED);
  emit.mockClear();
  TRAILS.dev(emit, [0, 0.4, 0], { by: 2, n: 0, color: purple });
  expect(emit.mock.calls.find(([type]) => type === 'warp')[1].color).toBe(purple.light);
  expect(devTintAngle(null)).toBe(0);
  expect(Math.abs(devTintAngle(DEV_RED))).toBeLessThan(0.2);
  expect(Math.abs(devTintAngle(purple))).toBeGreaterThan(1);
  expect(devTintSat(null)).toBe(1);
  expect(devTintSat(DEV_RED)).toBe(1);
  expect(devTintSat({ main: '#2e9e55' })).toBe(1);
  expect(devTintSat({ main: '#eef2f8' })).toBeLessThan(0.15);
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

import { act, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { useWarmed } from './warm';

const mockLink = { ready: true };
const mockProgram = { isReady: () => mockLink.ready, getUniforms: jest.fn() };
const mockFlush = jest.fn();
const mockGl = { getContext: () => ({ flush: mockFlush }), compile: jest.fn(), initTexture: jest.fn(), properties: { get: () => ({ programs: new Map([['variant', mockProgram]]) }) } };
jest.mock('@react-three/fiber', () => ({ useThree: (select) => select({ gl: mockGl, scene: {}, camera: {} }) }));

const skins = {
  a: { material: new THREE.MeshBasicMaterial() },
  b: { material: new THREE.MeshBasicMaterial({ map: new THREE.Texture() }) },
};
const probe = (skin) => new THREE.Mesh(new THREE.BufferGeometry(), skin.material);
const tick = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
  mockLink.ready = true;
  [mockGl.compile, mockGl.initTexture, mockProgram.getUniforms, mockFlush].forEach((fn) => fn.mockClear());
});

test('the first skin shows at once, a swap waits for its programs to link and its textures to upload', async () => {
  const onSwap = jest.fn();
  const { result, rerender } = renderHook(({ k }) => useWarmed(k, () => skins[k], probe, onSwap), { initialProps: { k: 'a' } });
  expect(result.current).toBe(skins.a);
  expect(mockGl.compile).not.toHaveBeenCalled();

  mockLink.ready = false;
  rerender({ k: 'b' });
  await tick(60);
  expect(mockGl.compile).toHaveBeenCalledTimes(1);
  expect(mockFlush).toHaveBeenCalledTimes(1);
  expect(result.current).toBe(skins.a);
  expect(mockProgram.getUniforms).not.toHaveBeenCalled();

  mockLink.ready = true;
  await waitFor(() => expect(result.current).toBe(skins.b));
  expect(mockProgram.getUniforms).toHaveBeenCalledTimes(1);
  expect(mockGl.initTexture).toHaveBeenCalledWith(skins.b.material.map);
  expect(onSwap).toHaveBeenCalledTimes(1);
});

test('changing back before the swap lands keeps the old skin for good', async () => {
  const onSwap = jest.fn();
  const { result, rerender } = renderHook(({ k }) => useWarmed(k, () => skins[k], probe, onSwap), { initialProps: { k: 'a' } });
  mockLink.ready = false;
  rerender({ k: 'b' });
  await tick(30);
  rerender({ k: 'a' });
  mockLink.ready = true;
  await tick(80);
  expect(result.current).toBe(skins.a);
  expect(onSwap).not.toHaveBeenCalled();
});

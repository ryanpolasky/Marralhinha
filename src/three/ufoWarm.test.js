import * as THREE from 'three';
import { compileInto, warmSet } from './ufoWarm';

const renderer = () => {
  let target = null;
  return {
    getRenderTarget: () => target,
    setRenderTarget: jest.fn((next) => (target = next)),
    compileAsync: jest.fn(() => Promise.resolve()),
    initTexture: jest.fn(),
    render: jest.fn(),
  };
};

test('precompiling an offscreen variant restores the active target before awaiting the GPU', async () => {
  const gl = renderer();
  const previous = new THREE.WebGLRenderTarget(1, 1);
  const target = new THREE.WebGLRenderTarget(1, 1);
  gl.setRenderTarget(previous);
  let done;
  gl.compileAsync.mockImplementation(() => new Promise((resolve) => (done = resolve)));
  const result = compileInto(gl, new THREE.Scene(), new THREE.Camera(), target);
  expect(gl.getRenderTarget()).toBe(previous);
  done();
  await result;
});

test('warming hidden sets uploads textures and compiles both output variants without changing the live scene', async () => {
  const gl = renderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight());
  const source = new THREE.Group();
  source.name = 'ufo-lab-set';
  source.visible = false;
  source.add(new THREE.PointLight());
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const dispose = jest.spyOn(material, 'dispose');
  source.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  scene.add(source);
  const other = new THREE.Group();
  other.name = 'ufo-saucer-set';
  other.add(new THREE.SpotLight());
  scene.add(other);
  await warmSet(gl, scene, new THREE.PerspectiveCamera(), source);
  expect(source.visible).toBe(false);
  expect(source.parent).toBe(scene);
  expect(gl.initTexture).toHaveBeenCalledWith(texture);
  expect(gl.compileAsync).toHaveBeenCalledTimes(2);
  const scratch = gl.compileAsync.mock.calls[0][0];
  const lights = [];
  scratch.traverse((o) => o.isLight && lights.push(o.type));
  expect(lights.sort()).toEqual(['HemisphereLight', 'PointLight']);
  expect(gl.render).toHaveBeenCalledTimes(1);
  expect(gl.getRenderTarget()).toBeNull();
  expect(dispose).not.toHaveBeenCalled();
});

test('cancelling during compilation skips the warm draw', async () => {
  const gl = renderer();
  await warmSet(gl, new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.Group(), () => true);
  expect(gl.render).not.toHaveBeenCalled();
});

test('a compile failure still restores the render target', () => {
  const gl = renderer();
  gl.compileAsync.mockImplementation(() => { throw new Error('context lost'); });
  expect(() => compileInto(gl, new THREE.Scene(), new THREE.Camera(), {})).toThrow('context lost');
  expect(gl.getRenderTarget()).toBeNull();
});

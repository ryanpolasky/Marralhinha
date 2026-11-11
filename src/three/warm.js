import { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';

const WARM_CAP_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capped = (work) => Promise.race([work, sleep(WARM_CAP_MS)]).catch(() => {});

const materialsOf = (root) => {
  const found = new Set();
  root.traverse((o) => [o.material].flat().forEach((m) => m && found.add(m)));
  return [...found];
};

// A material has one program per variant it's drawn in (instanced or not, say)
const programsOf = (gl, materials) => [...new Set(materials.flatMap((m) => [...(gl.properties.get(m).programs?.values() || [])]))];

// Resolves once every program has linked; polls the driver, never waits on it
export async function linked(gl, materials) {
  while (programsOf(gl, materials).some((p) => !p.isReady())) await sleep(10);
}

// First use fetches every uniform location and a first draw uploads every texture, so both are paid here, a task at a time
async function settle(gl, materials) {
  await linked(gl, materials);
  for (const program of programsOf(gl, materials)) {
    program.getUniforms();
    await sleep(0);
  }
  for (const m of materials) {
    const textures = Object.values(m).filter((v) => v?.isTexture);
    textures.forEach((t) => gl.initTexture(t));
    if (textures.length) await sleep(0);
  }
}

// Builds programs against the live scene's lights, fog and env; compile traverses hidden objects too
export function warmObject(gl, scene, camera, root) {
  gl.compile(root, camera, scene);
  // Nothing links until the commands reach the GPU, and a paused table has no frames to carry them
  gl.getContext().flush();
  return settle(gl, materialsOf(root));
}

// What's shown trails what's wanted: a new value only lands once its probe has linked and uploaded, so a swap never stalls a frame
export function useWarmed(key, build, probe, onSwap) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const shown = useRef(null);
  if (!shown.current) shown.current = { key, value: build() };
  const [, bump] = useState(0);
  useEffect(() => {
    if (shown.current.key === key) return undefined;
    let alive = true;
    const value = build();
    capped(Promise.resolve().then(() => warmObject(gl, scene, camera, probe(value)))).then(() => {
      if (!alive) return;
      shown.current = { key, value };
      bump((n) => n + 1);
      onSwap?.();
    });
    return () => {
      alive = false;
    };
  }, [key, gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown.current.value;
}

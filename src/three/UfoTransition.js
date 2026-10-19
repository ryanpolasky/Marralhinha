import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ufoTransition } from '../game/ufoMotion';
import { compileInto, onIdle, screenTarget } from './ufoWarm';

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const FRAGMENT = `
uniform sampler2D before;
uniform sampler2D after;
uniform float blend;
uniform float ripple;
uniform float time;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  uv.x += sin(vUv.y * 80.0 + time * 5.0) * ripple;
  uv.y += sin(vUv.x * 45.0 + time * 3.0) * ripple * 0.25;
  uv = clamp(uv, vec2(0.001), vec2(0.999));
  gl_FragColor = mix(texture2D(before, uv), texture2D(after, uv), blend);
}`;

export default function UfoTransition({ clock, onWarm }) {
  const { gl, scene, camera } = useThree();
  const captured = useRef(null);
  const motion = useRef(null);
  const pass = useMemo(() => {
    const before = screenTarget(1, 1);
    const after = screenTarget(1, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        before: { value: before.texture },
        after: { value: after.texture },
        blend: { value: 0 },
        ripple: { value: 0 },
        time: { value: 0 },
      },
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    return { before, after, material, geometry, scene, camera: new THREE.Camera(), size: new THREE.Vector2() };
  }, []);

  useEffect(() => {
    let stopped = false;
    const cancel = onIdle(() => {
      if (stopped) return;
      gl.getDrawingBufferSize(pass.size);
      pass.size.multiplyScalar(Math.min(1, 1920 / Math.max(pass.size.x, pass.size.y))).floor();
      pass.before.setSize(pass.size.x, pass.size.y);
      pass.after.setSize(pass.size.x, pass.size.y);
      gl.initRenderTarget(pass.before);
      gl.initRenderTarget(pass.after);
      const tiny = screenTarget();
      Promise.all([
        compileInto(gl, pass.scene, pass.camera),
        compileInto(gl, scene, camera, tiny),
      ]).then(() => {
        if (stopped) return;
        const previous = gl.getRenderTarget();
        try {
          gl.setRenderTarget(tiny);
          gl.render(scene, camera);
          gl.setRenderTarget(null);
        } finally {
          gl.setRenderTarget(previous);
        }
      }).catch((error) => console.warn('UFO transition prewarm failed', error)).finally(() => {
        tiny.dispose();
        if (!stopped) onWarm?.();
      });
    });
    return () => {
      stopped = true;
      cancel();
    };
  }, [gl, scene, camera, pass, onWarm]);

  useEffect(() => {
    motion.current = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
    return () => {
      pass.before.dispose();
      pass.after.dispose();
      pass.material.dispose();
      pass.geometry.dispose();
    };
  }, [pass]);

  useFrame(({ scene, camera }) => {
    const t = clock();
    const transition = t === null ? null : ufoTransition(t, motion.current?.matches);
    if (!transition || (t >= transition.cut && captured.current !== transition.cut)) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }
    gl.getDrawingBufferSize(pass.size);
    pass.size.multiplyScalar(Math.min(1, 1920 / Math.max(pass.size.x, pass.size.y))).floor();
    if (pass.before.width !== pass.size.x || pass.before.height !== pass.size.y) {
      pass.before.setSize(pass.size.x, pass.size.y);
      pass.after.setSize(pass.size.x, pass.size.y);
      captured.current = null;
      if (t >= transition.cut) {
        gl.setRenderTarget(null);
        gl.render(scene, camera);
        return;
      }
    }
    const entering = t < transition.cut;
    gl.setRenderTarget(entering ? pass.before : pass.after);
    gl.render(scene, camera);
    if (entering) captured.current = transition.cut;
    const { uniforms } = pass.material;
    uniforms.after.value = entering ? pass.before.texture : pass.after.texture;
    uniforms.blend.value = transition.blend;
    uniforms.ripple.value = transition.ripple;
    uniforms.time.value = t;
    gl.setRenderTarget(null);
    gl.render(pass.scene, pass.camera);
  }, 1);

  return null;
}

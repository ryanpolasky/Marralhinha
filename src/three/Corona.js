import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEAT_COLORS } from '../game/geometry';
import { mix } from './skins';

const PLANE = new THREE.PlaneGeometry(1, 1);
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

const coronaMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uEdge: { value: 0.31 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uHot;
      uniform vec3 uMid;
      uniform float uEdge;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 d = vUv - 0.5;
        float r = length(d) * 2.0;
        float a = atan(d.y, d.x);
        float ring = a * 2.5465;
        float tongues = n(vec2(ring * 3.0, r * 4.0 - uTime * 0.9)) * 0.65 + n(vec2(ring * 7.0 + 3.1, r * 9.0 - uTime * 1.7)) * 0.35;
        float out_ = max(r - uEdge, 0.0) / (1.0 - uEdge);
        float reach = mix(0.35, 1.0, tongues);
        float edge = smoothstep(uEdge - 0.03, uEdge + 0.02, r);
        float glow = pow(max(1.0 - out_ / reach, 0.0), 2.2) * edge;
        float halo = exp(-out_ * 5.0) * edge;
        vec3 col = mix(uMid, uHot, clamp(halo * 0.6, 0.0, 1.0));
        float alpha = min(glow * 0.6 + halo * 0.32, 0.7);
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

export function SolCorona({ size = 0.335, color = SEAT_COLORS[0], seed = 0 }) {
  const mesh = useRef();
  const material = useMemo(coronaMaterial, []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uHot.value.set(mix(color.light, '#fff6e0', 0.5));
    material.uniforms.uMid.value.set(color.main);
  }, [material, color]);
  useFrame(({ camera, clock }) => {
    const m = mesh.current;
    if (!m?.parent) return;
    material.uniforms.uTime.value = clock.elapsedTime + seed * 2.3;
    m.parent.getWorldQuaternion(_q).invert();
    m.quaternion.copy(_q).multiply(camera.quaternion);
    m.parent.getWorldPosition(_p);
    const dist = _c.copy(camera.position).sub(_p).length();
    const off = size * 1.05;
    m.position.copy(_c.normalize().multiplyScalar(off).applyQuaternion(_q));
    material.uniforms.uEdge.value = (dist - off) / (1.6 * Math.sqrt(Math.max(dist * dist - size * size, 1e-4)));
  });
  return <mesh ref={mesh} geometry={PLANE} material={material} scale={size * 3.2} renderOrder={2} />;
}

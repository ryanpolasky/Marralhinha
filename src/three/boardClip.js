import * as THREE from 'three';

// Shared description of the board silhouette (a plus shape) so floor effects can fade out at its edge
export const makeBoardClip = () => {
  const clip = {
    uniforms: { uBoardInv: { value: new THREE.Matrix4() }, uHalf: { value: new THREE.Vector2(2.75, 8.75) }, uOrigin: { value: new THREE.Vector2() } },
    test: (x, z) => {
      const { x: w, y: l } = clip.uniforms.uHalf.value;
      const px = Math.abs(x + clip.uniforms.uOrigin.value.x);
      const pz = Math.abs(z + clip.uniforms.uOrigin.value.y);
      return (px <= w && pz <= l) || (px <= l && pz <= w);
    },
  };
  return clip;
};

const FUNC = `
varying vec3 vBoardPos;
uniform vec2 uHalf;
uniform vec2 uOrigin;
float roundBox(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float boardFade(vec3 q) {
  vec2 p = q.xz + uOrigin;
  float r = min(0.65, uHalf.x * 0.35);
  float d = min(roundBox(p, uHalf, r), roundBox(p, uHalf.yx, r));
  return mix(1.0, 1.0 - smoothstep(0.12, 0.28, d), step(q.y, 0.6));
}`;

// Multiplies a basic material's alpha by the board silhouette; only affects things near floor level
export const clipToBoard = (material, clip) => {
  if (!clip) return;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, clip.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBoardPos;\nuniform mat4 uBoardInv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBoardPos = (uBoardInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FUNC}`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= boardFade(vBoardPos);');
  };
  material.customProgramCacheKey = () => 'board-clip';
  material.needsUpdate = true;
};

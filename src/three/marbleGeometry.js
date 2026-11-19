import * as THREE from 'three';

export const MARBLE_R = 0.335;
export const MARBLE_GEO = new THREE.SphereGeometry(MARBLE_R, 40, 24);
export const GEM_GEO = new THREE.BufferGeometry();
GEM_GEO.name = 'WellspringCutGem';
export const GEM_FACET_TONES = [];
const positions = [], uvs = [];
const ring = (radius, y) => Array.from({ length: 8 }, (_, i) => {
  const angle = (i + .5) * Math.PI / 4;
  return new THREE.Vector3(Math.cos(angle) * radius * MARBLE_R, y * MARBLE_R, Math.sin(angle) * radius * MARBLE_R);
});
const table = ring(.38, 1), crown = ring(.95, .3), girdle = ring(.95, .2);
function facet(a, b, c, tone) {
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  if (normal.dot(a.clone().add(b).add(c)) < 0) [b, c] = [c, b];
  const face = GEM_FACET_TONES.length;
  [a, b, c].forEach((v, i) => {
    positions.push(...v.toArray());
    const [x, y] = [[1, 1], [15, 1], [8, 14]][i];
    uvs.push(((face % 8) * 16 + x) / 128, 1 - (Math.floor(face / 8) * 16 + y) / 96);
  });
  GEM_FACET_TONES.push(tone);
}
// Wellspring art.ts gem/bigGem: a broad shoulder over a tapering pavilion.
for (let i = 0; i < 8; i++) {
  const j = (i + 1) % 8;
  facet(new THREE.Vector3(0, MARBLE_R, 0), table[i], table[j], 4);
  facet(table[i], crown[i], crown[j], [3, 2, 1, 2, 3, 2, 1, 2][i]);
  facet(table[i], crown[j], table[j], [2, 3, 2, 1, 2, 3, 2, 1][i]);
  facet(crown[i], girdle[i], girdle[j], 1);
  facet(crown[i], girdle[j], crown[j], 1);
  facet(girdle[i], new THREE.Vector3(0, -MARBLE_R, 0), girdle[j], i % 3);
}
GEM_GEO.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
GEM_GEO.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
GEM_GEO.computeVertexNormals();

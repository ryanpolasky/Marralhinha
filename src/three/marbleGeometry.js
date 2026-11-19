import * as THREE from 'three';

export const MARBLE_R = 0.335;
export const MARBLE_GEO = new THREE.SphereGeometry(MARBLE_R, 40, 24);
export const GEM_GEO = new THREE.OctahedronGeometry(MARBLE_R, 0);
GEM_GEO.name = 'WellspringDiamond';
export const GEM_FACET_TONES = [3, 1, 0, 2, 2, 0, 1, 4];
const uv = GEM_GEO.attributes.uv;
for (let face = 0; face < 8; face++) {
  [[1, 1], [15, 1], [8, 14]].forEach(([x, y], vertex) => uv.setXY(face * 3 + vertex, (face * 16 + x) / 128, 1 - y / 16));
}

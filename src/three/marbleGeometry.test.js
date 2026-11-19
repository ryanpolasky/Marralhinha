import * as THREE from 'three';
import { GEM_GEO, GEM_FACET_TONES, MARBLE_GEO, MARBLE_R } from './marbleGeometry';
import { buildProbes } from './StaticWarmer';
import { hopPosition, wellContact, wellRebound, worldOf } from './Marbles';
import { layoutFor } from '../game/geometry';

test('the gem shares sphere seating and contact bounds without protruding into adjacent holes', () => {
  GEM_GEO.computeBoundingBox();
  GEM_GEO.computeBoundingSphere();
  expect(GEM_GEO.boundingBox.min.y).toBeCloseTo(-MARBLE_R, 7);
  expect(GEM_GEO.boundingBox.max.y).toBeCloseTo(MARBLE_R, 7);
  expect(GEM_GEO.boundingSphere.radius).toBeCloseTo(MARBLE_R, 7);
  const positions = GEM_GEO.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThanOrEqual(MARBLE_R + 1e-7);
  }
  expect(positions.count / 3).toBe(8);
  const top = Array.from({ length: positions.count }, (_, i) => i).filter(i => Math.abs(positions.getY(i) - MARBLE_R) < 1e-7);
  expect(top.length).toBe(4);
  expect(top.every(i => Math.hypot(positions.getX(i), positions.getZ(i)) < 1e-7)).toBe(true);
  const highlight = new THREE.Vector3();
  for (let face = 0; face < GEM_FACET_TONES.length; face++) {
    if (GEM_FACET_TONES[face] !== 4) continue;
    for (let vertex = 0; vertex < 3; vertex++) highlight.add(new THREE.Vector3().fromBufferAttribute(positions, face * 3 + vertex));
  }
  expect(highlight.x).toBeLessThan(0);
  expect(highlight.y).toBeGreaterThan(0);
  expect(highlight.z).toBeGreaterThan(0);
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    expect(Math.abs(y) < 1e-7 || Math.abs(Math.abs(y) - MARBLE_R) < 1e-7).toBe(true);
  }
  const uv = GEM_GEO.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    expect(uv.getX(i)).toBeGreaterThan(0);
    expect(uv.getX(i)).toBeLessThan(1);
    expect(uv.getY(i)).toBeGreaterThan(0);
    expect(uv.getY(i)).toBeLessThan(1);
  }
});

test.each(['classic', 'blitz'])('gem/sphere Stomps touch actual victim tops and settle into %s holes', (variant) => {
  for (const victim of [GEM_GEO, MARBLE_GEO]) {
    victim.computeBoundingBox();
    const hole = worldOf(0, { zone: 'track', idx: 13 }, 0, layoutFor(variant));
    const contact = wellContact(hole);
    expect(contact.y + GEM_GEO.boundingBox.min.y).toBeCloseTo(hole.y + victim.boundingBox.max.y, 7);
    const [rise, settle] = wellRebound(hole);
    expect(hopPosition(contact, rise, 1).y).toBeGreaterThan(contact.y + MARBLE_R * 2);
    expect(hopPosition(rise.to, settle, 1).equals(hole)).toBe(true);
  }
});

test('the gem is raycastable from above and uses the same geometry in StaticWarmer', () => {
  const material = new THREE.MeshPhysicalMaterial({ userData: { marbleGeometry: 'gem' } });
  const mesh = new THREE.Mesh(GEM_GEO, material);
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(.02, 2, .02), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  const probes = buildProbes([material, new THREE.MeshBasicMaterial()]);
  expect(probes.children[0].geometry).toBe(GEM_GEO);
  expect(probes.children[0].material).toBe(material);
});

import * as THREE from 'three';
import { GEM_GEO, MARBLE_GEO, MARBLE_R } from './marbleGeometry';
import { buildProbes } from './StaticWarmer';
import { hopPosition, wellContact, wellRebound, worldOf } from './Marbles';
import { layoutFor } from '../game/geometry';

test('the gem shares sphere seating and contact bounds without protruding into adjacent holes', () => {
  GEM_GEO.computeBoundingBox();
  GEM_GEO.computeBoundingSphere();
  expect(GEM_GEO.boundingBox.min.y).toBeCloseTo(-MARBLE_R, 7);
  expect(GEM_GEO.boundingBox.max.y).toBeCloseTo(MARBLE_R, 7);
  expect(GEM_GEO.boundingSphere.radius).toBeLessThanOrEqual(MARBLE_R * 1.07);
  const positions = GEM_GEO.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThanOrEqual(MARBLE_R);
  }
  expect(positions.count / 3).toBe(48);
  const top = Array.from({ length: positions.count }, (_, i) => i).filter(i => Math.abs(positions.getY(i) - MARBLE_R) < 1e-7);
  expect(top.length).toBeGreaterThan(8);
  expect(top.some(i => Math.hypot(positions.getX(i), positions.getZ(i)) > MARBLE_R * .3)).toBe(true);
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

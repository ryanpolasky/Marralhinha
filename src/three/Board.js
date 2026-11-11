import React, { useLayoutEffect, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SEATS, SEAT_COLORS, CENTER, entryIdx, layoutFor } from '../game/geometry';
import { makeLabelTexture } from './textures';
import { boardSkin, animateBoardSkin, tintTable } from './skins';
import { skinKey } from '../game/catalog';
import DefuseProps from './DefuseProps';
import PicnicProps from './PicnicProps';
import MinecraftProps from './MinecraftProps';
import WildProps from './WildProps';
import TrainProps from './TrainProps';
import BucketModel from './BucketModel';
import { onBoardSkinWarm } from '../game/skinWarm';
import { fx } from './fx';
import { sfx } from '../game/sound';
import { useRainbow } from '../game/rainbow';
import { linked, warmObject } from './warm';

export const HOLE_R = 0.37;
const CENTER_R = HOLE_R;
const DEPTH = 0.42;
const BEVEL = 0.12;
export const TABLE_Y = -(DEPTH + BEVEL * 2);
export const DISH_R = 2.2;
export const DISH_BEVEL = BEVEL;
const CLASSIC_LAYOUT = layoutFor('classic');
const WATER_BOARD_Y = 0.006;

function WaterDamageFX({ layout }) {
  const drops = useRef([]);
  const splashes = useRef([]);
  const splashRings = useRef([]);
  const crowns = useRef([]);
  const leaks = useMemo(() => {
    const { halfWidth: w, halfLength: l } = layout.spec;
    const o = w * 0.56;
    return [[o, l - 1.2], [l - 1.2, -o], [-o, -l + 1.2], [l + 0.5, w + 0.5]];
  }, [layout]);
  const sched = useMemo(() => leaks.map((_, i) => ({ start: -10, next: 0.4 + i * 0.9 })), [leaks]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    leaks.forEach(([x, z], i) => {
      const s = sched[i];
      if (t >= s.next) {
        s.start = t;
        s.next = t + (Math.random() < 0.22 ? 0.32 + Math.random() * 0.25 : 1.2 + Math.random() * 3.4);
      }
      const cycle = t - s.start;
      const targetY = i === 3 ? TABLE_Y + 0.66 : WATER_BOARD_Y;
      const drop = drops.current[i];
      if (drop) {
        const p = Math.min(1, cycle / 0.45);
        drop.visible = cycle < 0.45;
        drop.position.set(x, 2.5 + (targetY - 2.5) * p * p, z);
        drop.scale.set(0.024, 0.11, 0.024);
      }
      const hit = cycle - 0.45;
      const splash = splashes.current[i];
      if (splash) {
        const live = hit >= 0 && hit < 1.1;
        splash.visible = live;
        if (live) {
          splash.position.set(x, targetY + 0.004, z);
          const [ringA, ringB] = splashRings.current[i] || [];
          const k = hit / 1.1;
          const k2 = Math.max(0, (hit - 0.2) / 0.9);
          if (ringA) { ringA.scale.setScalar(0.12 + k * 1.15); ringA.material.opacity = (1 - k) * (1 - k) * 0.85; }
          if (ringB) { ringB.scale.setScalar(0.06 + k2 * 0.8); ringB.material.opacity = (1 - k2) * (1 - k2) * 0.6 * (hit > 0.2 ? 1 : 0); }
          const crown = crowns.current[i];
          if (crown) {
            const c = Math.min(1, hit / 0.22);
            crown.visible = hit < 0.22;
            crown.scale.set(0.6 + c * 0.7, 1 - c * 0.7, 0.6 + c * 0.7);
          }
        }
      }
    });
  });
  return (
    <group>
      {leaks.map(([x, z], i) => {
        return (
        <React.Fragment key={i}>
          <mesh ref={(m) => { drops.current[i] = m; }} position={[x, 2.5, z]}>
            <capsuleGeometry args={[0.022, 0.2, 3, 6]} />
            <meshPhysicalMaterial color="#c9e5ec" roughness={0.08} metalness={0.02} clearcoat={1} />
          </mesh>
          <group ref={(m) => { splashes.current[i] = m; }} visible={false}>
            {[0, 1].map((j) => (
              <mesh key={j} ref={(m) => { splashRings.current[i] = splashRings.current[i] || []; splashRings.current[i][j] = m; }} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.2, j ? 0.225 : 0.235, 48]} />
                <meshPhysicalMaterial color="#5f7a82" transparent opacity={0} roughness={0.04} clearcoat={1} clearcoatRoughness={0.03} envMapIntensity={1.6} depthWrite={false} />
              </mesh>
            ))}
            <group ref={(m) => { crowns.current[i] = m; }}>
              {Array.from({ length: 6 }, (_, j) => {
                const a = (j / 6) * Math.PI * 2;
                return (
                  <mesh key={j} position={[Math.cos(a) * 0.12, 0.05 + (j % 2) * 0.03, Math.sin(a) * 0.12]} scale={[0.02, 0.05, 0.02]}>
                    <sphereGeometry args={[1, 8, 8]} />
                    <meshPhysicalMaterial color="#8fb0b8" roughness={0.05} clearcoat={1} />
                  </mesh>
                );
              })}
            </group>
          </group>
        </React.Fragment>
      );})}
    </group>
  );
}

const sx = ([r, c]) => [c, -r];

function roundedPolygon(shape, points, radius) {
  points.forEach((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const toward = (a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      return [a[0] + (dx / len) * radius, a[1] + (dy / len) * radius];
    };
    const start = toward(p, prev);
    const end = toward(p, next);
    if (i === 0) shape.moveTo(...start);
    else shape.lineTo(...start);
    shape.quadraticCurveTo(p[0], p[1], ...end);
  });
  shape.closePath();
}

// Holes have to wind counter-clockwise or three.js culls their walls and you can see the table through them
function holePath([x, y], r) {
  const path = new THREE.Path();
  path.absarc(x, y, r, 0, Math.PI * 2, false);
  return path;
}

function flatten(geometry) {
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -(DEPTH + BEVEL), 0);
  return geometry;
}

const EXTRUDE = { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: 0.09, bevelSegments: 3, curveSegments: 22 };

function buildBoardGeometry(layout) {
  const { halfWidth: W, halfLength: L } = layout.spec;
  const cross = [[-W, -L], [W, -L], [W, -W], [L, -W], [L, W], [W, W], [W, L], [-W, L], [-W, W], [-L, W], [-L, -W], [-W, -W]];
  const shape = new THREE.Shape();
  roundedPolygon(shape, cross.map(([x, y]) => [x, -y]), Math.min(0.65, W * 0.35));
  [...layout.RING, ...layout.HOME.flat()].forEach((p) => shape.holes.push(holePath(sx(p), HOLE_R)));
  shape.holes.push(holePath(sx(CENTER), CENTER_R));
  return flatten(new THREE.ExtrudeGeometry(shape, EXTRUDE));
}

function buildDishGeometry(seat, layout) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, layout.spec.dishR, 0, Math.PI * 2, false);
  const [tr, tc] = layout.BASE_TRAY[seat];
  layout.BASE[seat].forEach(([r, c]) => shape.holes.push(holePath([c - tc, -(r - tr)], HOLE_R)));
  return flatten(new THREE.ExtrudeGeometry(shape, { ...EXTRUDE, curveSegments: 40 }));
}

function buildBlanketGeometry(layout) {
  const h = layout.spec.halfLength * 1.72;
  const shape = new THREE.Shape();
  roundedPolygon(shape, [[-h, -h], [h, -h], [h, h], [-h, h]], h * 0.22);
  return new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2);
}

function buildHomeStripGeometry(layout) {
  const rows = layout.spec.homeRows;
  const edge = HOLE_R + 0.09;
  const end = rows[0] + edge;
  const start = rows[rows.length - 1] - edge;
  const shape = new THREE.Shape();
  roundedPolygon(shape, [[-edge, -start], [edge, -start], [edge, -end], [-edge, -end]], 0.4);
  rows.forEach((r) => shape.holes.push(holePath([0, -r], HOLE_R + 0.03)));
  return new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2);
}

// Extruding the board is slow and previews remount it on every pick, so each layout is built once and shared
const geometryCache = new Map();
const layoutGeometries = (layout) => {
  const id = layout.spec.id;
  if (!geometryCache.has(id)) {
    geometryCache.set(id, {
      board: buildBoardGeometry(layout),
      dishes: SEATS.map((s) => buildDishGeometry(s, layout)),
      strip: buildHomeStripGeometry(layout),
      blanket: buildBlanketGeometry(layout),
    });
  }
  return geometryCache.get(id);
};

// The seat color follows the bevel into the hole; neutral holes keep their original bowls
const DIVOT_LIPPED_GEO = new THREE.LatheGeometry([
  [0.405, 0.007], [0.368, 0.007], [0.36, -0.002], [0.316, -0.015],
  [0.284, -0.058], [0.273, -0.119], [0.27, -0.17], [0.25, -0.24],
  [0.23, -0.287],
].map(([x, y]) => new THREE.Vector2(x, y)), 28);
const DIVOT_PLAIN_GEO = new THREE.SphereGeometry(HOLE_R - 0.08, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);

// One instanced mesh per hole set
function Divots({ points, geometry, material, color, y = 0 }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    points.forEach(([r, c], i) => ref.current.setMatrixAt(i, m.makeTranslation(c, y, r)));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [points, y]);
  return (
    <instancedMesh key={points.length} ref={ref} args={[geometry, null, points.length]} {...(material ? { material } : {})} receiveShadow>
      {!material && <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />}
    </instancedMesh>
  );
}

const Ring = ({ at, inner, outer, color, material, y = 0.004 }) => (
  <mesh position={[at[1], y, at[0]]} rotation-x={-Math.PI / 2} material={material}>
    <ringGeometry args={[inner, outer, 40]} />
    {!material && <meshStandardMaterial color={color} roughness={0.45} polygonOffset polygonOffsetFactor={-2} />}
  </mesh>
);

function NameTag({ name, color, position }) {
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const texture = useMemo(() => makeLabelTexture(name, color), [name, color, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[3.2, 0.8, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

const mixHex = (a, b, t) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')}`;
const seatColor = (c, active) => (active ? c.main : mixHex(c.main, '#4a3a2c', 0.74));

function Dish({ seat, color = SEAT_COLORS[seat], geometry, material, side, active, isTurn, name, layout }) {
  const rimRef = useRef();
  const [r, c] = layout.BASE_TRAY[seat];
  const dishR = layout.spec.dishR;
  useFrame(({ clock }) => {
    const mat = rimRef.current.material;
    mat.emissiveIntensity = isTurn ? 0.6 + Math.sin(clock.elapsedTime * 4) * 0.4 : active ? 0.12 : 0;
  });
  return (
    <group>
      <group position={[c, 0, r]}>
        <mesh geometry={geometry} material={side ? [material, side] : material} castShadow receiveShadow />
        <mesh ref={rimRef} position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[dishR - 0.2, dishR - 0.04, 64]} />
          <meshStandardMaterial color={seatColor(color, active)} emissive={color.main} emissiveIntensity={0} roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      </group>
      {active && name && <NameTag name={name} color={color.baseMain || color.main} position={[c, 1.45, r]} />}
    </group>
  );
}

function TurnGem({ turn, colors = SEAT_COLORS, layout }) {
  const ref = useRef();
  const mat = useRef();
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }, dt) => {
    const g = ref.current;
    if (turn === null || turn === undefined) {
      g.visible = false;
      return;
    }
    const [r, c] = layout.BASE_TRAY[turn];
    if (!g.visible) g.position.set(c, 2, r);
    g.visible = true;
    const k = 1 - Math.exp(-dt * 5);
    g.position.x += (c - g.position.x) * k;
    g.position.z += (r - g.position.z) * k;
    g.position.y = 2.5 + Math.sin(clock.elapsedTime * 2.5) * 0.2;
    g.rotation.y += dt * 1.6;
    mat.current.color.lerp(color.set((colors[turn] || SEAT_COLORS[turn]).main), k);
    mat.current.emissive.copy(mat.current.color);
  });
  return (
    <mesh ref={ref} visible={false} scale={[1, 1.7, 1]} castShadow>
      <octahedronGeometry args={[0.36, 0]} />
      <meshPhysicalMaterial ref={mat} roughness={0.1} clearcoat={1} emissiveIntensity={0.55} flatShading />
    </mesh>
  );
}

const TABLE_R = 1200;

function Table({ materials }) {
  const texture = materials.felt;
  const material = useMemo(() => {
    const map = texture.clone();
    const repeat = TABLE_R * 2 / (texture.userData.tileSize || 12);
    map.repeat.set(repeat, repeat);
    map.needsUpdate = true;
    return tintTable(new THREE.MeshStandardMaterial({ map, roughness: 0.95 }), materials);
  }, [texture, materials]);
  useEffect(() => () => {
    material.map.dispose();
    material.dispose();
  }, [material]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, TABLE_Y, 0]} material={material} receiveShadow>
      <circleGeometry args={[TABLE_R, 96]} />
    </mesh>
  );
}

// Boards that dress the table around them, not just the board itself
const BOARD_PROPS = { defuse: DefuseProps, picnic: PicnicProps, minecraft: MinecraftProps, wild: WildProps, train: TrainProps };
export const hasBoardProps = (id) => !!BOARD_PROPS[skinKey(id)];

const SWAP_MS = 150;
const WAVE_S = 0.9;
const WAVE_R = 13;

// Program compile only needs the material, so a plane stands in for the real board mesh
const WARM_GEO = new THREE.PlaneGeometry(1, 1);
const LINK_CAP_MS = 4000;
const boardMaterials = (mats) => [...new Set([...mats.surfaces, mats.side, mats.dishSide, mats.core, mats.cup, mats.brass].filter(Boolean))];
export const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 900 }) : setTimeout(fn, 80));

// Glowing shockwave that sweeps out from the center while the board skin changes underneath it
function SwapWave({ wave }) {
  const ring = useRef();
  const flash = useRef();
  const start = useRef(null);
  useEffect(() => {
    start.current = wave ? null : undefined;
  }, [wave]);
  useFrame(({ clock }) => {
    if (start.current === undefined) {
      ring.current.visible = flash.current.visible = false;
      return;
    }
    if (start.current === null) start.current = clock.elapsedTime;
    const t = (clock.elapsedTime - start.current) / WAVE_S;
    if (t >= 1) {
      start.current = undefined;
      return;
    }
    const eased = 1 - (1 - t) ** 3;
    ring.current.visible = flash.current.visible = true;
    ring.current.scale.setScalar(0.3 + eased * WAVE_R);
    ring.current.material.opacity = (1 - t) ** 1.5;
    flash.current.scale.setScalar(1 + eased * 6);
    flash.current.material.opacity = Math.max(0, 0.7 - t * 2.2);
  });
  return (
    <group position-y={0.06}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} visible={false} renderOrder={11}>
        <ringGeometry args={[0.86, 1, 96]} />
        <meshBasicMaterial color="#ffe7a3" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={flash} rotation-x={-Math.PI / 2} visible={false} renderOrder={11}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial color="#fff6d8" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

// The shown skin trails the requested one: it's fully built and compiled first, then the wave plays
// and the swap lands under the flash, so picking a new board never stalls a frame mid-animation.
// Previews (table=false) show as soon as their skin is ready: particles share a global bus and would
// spray onto the main board
function useSkinTransition(skin, animate, prepare) {
  const [shown, setShown] = useState(() => (animate ? skin : null));
  const [wave, setWave] = useState(0);
  useEffect(() => {
    if (skin === shown) return undefined;
    let dead = false;
    let timer;
    Promise.resolve()
      .then(() => new Promise((r) => requestAnimationFrame(r)))
      .then(() => prepare(skin))
      .catch(() => {})
      .then(() => {
        if (dead) return;
        // No show on the very first skin (page load), only on real swaps
        if (!animate || !shown) {
          setShown(skin);
          return;
        }
        setWave((w) => w + 1);
        sfx.boardSwap();
        fx.emit('burst', { position: [0, 0.3, 0], colors: ['#ffd166', '#fff3b0', '#ffffff'], count: 80, speed: 9, up: 2.5, size: 0.09, gravity: 0.35, life: 1.1, spread: 1.4 });
        timer = setTimeout(() => {
          if (!dead) setShown(skin);
        }, SWAP_MS);
      });
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [skin]); // eslint-disable-line react-hooks/exhaustive-deps
  return [shown, wave];
}

export default function Board({ active, names, turn, showNames, skin, colors: seatPalette = SEAT_COLORS, ownerSeat = -1, table = true, preview = false, layout = CLASSIC_LAYOUT }) {
  const colors = useRainbow(seatPalette);
  const tint = ownerSeat >= 0 ? colors[ownerSeat] || null : null;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  // Builds the skin's canvases (cache-hit after the first), compiles its shader programs against this
  // scene's lights/fog/env, and uploads its textures: everything a swap frame would otherwise stall on
  const warmed = useRef(new Set());
  const uploaded = useRef(new Set());
  const mounted = useRef(true);
  // Prop sets mount hidden on warm instead of at the swap: mount is when their canvases paint and
  // materials compile, so doing it early (then a visibility flip) keeps the swap frame free of stalls
  const mountedProps = useRef(new Set());
  const propsGroups = useRef({});
  const [, propsBumped] = useState(0);
  useEffect(() => () => { mounted.current = false; }, []);
  const prepareSkin = useCallback(
    async (id) => {
      const key = `${id}:${layout.spec.id}`;
      let mats;
      try {
        mats = boardSkin(id, layout);
      } catch {
        return;
      }
      if (!warmed.current.has(key)) {
        warmed.current.add(key);
        const scratch = new THREE.Scene();
        const probe = (m, instanced = false) => {
          const mesh = instanced ? new THREE.InstancedMesh(WARM_GEO, m, 1) : new THREE.Mesh(WARM_GEO, m);
          mesh.castShadow = mesh.receiveShadow = true;
          scratch.add(mesh);
        };
        boardMaterials(mats).forEach((m) => probe(m));
        // Cups and brass also sit in the instanced hole sets, which is its own program
        [mats.cup, mats.brass].forEach((m) => probe(m, true));
        gl.compile(scratch, camera, scene);
      }
      const propsKey = table && BOARD_PROPS[skinKey(id)] ? skinKey(id) : null;
      if (propsKey && !mountedProps.current.has(propsKey)) {
        mountedProps.current.add(propsKey);
        propsBumped((n) => n + 1);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!mounted.current) return;
        const group = propsGroups.current[propsKey];
        // compile traverses invisible objects too, so the hidden set links against the real scene lights and uploads while still hidden
        if (group) await warmObject(gl, scene, camera, group).catch(() => {});
        if (!mounted.current) return;
      }
      if (!uploaded.current.has(key)) {
        uploaded.current.add(key);
        mats.surfaces.forEach((m) => [m.map, m.emissiveMap].forEach((t) => t && gl.initTexture(t)));
      }
      // Best-effort wait for parallel shader compile; capped so an unmount can't spin forever
      return Promise.race([linked(gl, boardMaterials(mats)), new Promise((r) => setTimeout(r, LINK_CAP_MS))]);
    },
    [gl, scene, camera, layout, table]
  );

  // DOM pickers announce hover through the bridge; only the real table board answers
  useEffect(() => (table ? onBoardSkinWarm((id) => id && prepareSkin(id)) : undefined), [table, prepareSkin]);

  const [shownSkin, wave] = useSkinTransition(skin, table, prepareSkin);
  const materials = useMemo(() => (shownSkin === null ? null : boardSkin(shownSkin, layout)), [shownSkin, layout]);
  useFrame(({ clock }) => materials && animateBoardSkin(materials, clock.elapsedTime, tint));
  const { board: boardGeometry, dishes: dishGeometries, strip: stripGeometry, blanket: blanketGeometry } = layoutGeometries(layout);
  const seatHoles = useMemo(
    () => SEATS.map((s) => [[...layout.RING[entryIdx(s, layout)]], ...layout.HOME[s], ...layout.BASE[s]]),
    [layout]
  );
  const plainHoles = useMemo(() => {
    const entries = new Set(SEATS.map((s) => entryIdx(s, layout)));
    return layout.RING.filter((_, i) => !entries.has(i));
  }, [layout]);
  const accentHoles = useMemo(() => [...layout.INNER_CORNERS.map((i) => layout.RING[i]), CENTER], [layout]);

  if (!materials) return <group />;
  const liveProps = table && skinKey(shownSkin);
  const propKeys = table ? new Set(mountedProps.current) : new Set();
  if (BOARD_PROPS[liveProps]) propKeys.add(liveProps);

  return (
    <group>
      {table && !materials.noTable && <Table materials={materials} />}
      {table && skinKey(shownSkin) === 'unlucky' && (
        <group position={[layout.spec.halfLength + 0.5, TABLE_Y, layout.spec.halfWidth + 0.5]}>
          <BucketModel scale={1.5} />
        </group>
      )}
      {table && skinKey(shownSkin) === 'unlucky' && <WaterDamageFX layout={layout} />}
      {materials.blanket && <mesh geometry={blanketGeometry} material={materials.blanket} position={[0, TABLE_Y + 0.02, 0]} receiveShadow />}
      {[...propKeys].map((key) => {
        const Props = BOARD_PROPS[key];
        return (
          <group key={key} ref={(el) => (propsGroups.current[key] = el)} visible={key === liveProps}>
            <Props layout={layout} y={TABLE_Y} preview={preview} />
          </group>
        );
      })}
      <mesh geometry={boardGeometry} material={materials.side ? [materials.board, materials.side] : materials.board} castShadow receiveShadow />
      <Divots points={plainHoles} geometry={DIVOT_PLAIN_GEO} material={materials.cup} y={-BEVEL * 0.9} />
      <mesh position={[CENTER[1], -BEVEL * 0.9, CENTER[0]]} material={materials.core || materials.cup} receiveShadow>
        <sphereGeometry args={[CENTER_R - 0.08, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>

      {SEATS.map((s) => {
        const seated = active.includes(s);
        const col = colors?.[s] || SEAT_COLORS[s];
        return (
          <group key={s}>
            <Divots points={seatHoles[s]} geometry={DIVOT_PLAIN_GEO} material={materials.cup} y={-BEVEL * 0.9} />
            <Divots points={seatHoles[s]} geometry={DIVOT_LIPPED_GEO} color={seatColor(col, seated)} />
            <mesh geometry={stripGeometry} rotation-y={(s * Math.PI) / 2} position-y={0.003}>
              <meshStandardMaterial color={seatColor(col, seated)} roughness={0.5} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
            <Ring at={layout.RING[entryIdx(s, layout)]} inner={HOLE_R + 0.03} outer={HOLE_R + 0.09} color={seatColor(col, seated)} />
            <Dish seat={s} color={col} geometry={dishGeometries[s]} material={materials.dishes[s]} side={materials.dishSide} active={seated} isTurn={turn === s} name={showNames ? names[s] : null} layout={layout} />
          </group>
        );
      })}

      <Divots points={accentHoles} geometry={DIVOT_LIPPED_GEO} material={materials.brass} />
      {layout.INNER_CORNERS.map((i) => {
        const [r, c] = layout.RING[i];
        return (
          <group key={i}>
            <Ring at={layout.RING[i]} inner={HOLE_R + 0.03} outer={HOLE_R + 0.12} material={materials.brass} />
            {[0.3, 0.5, 0.7].map((t) => (
              <mesh key={t} position={[c * t, 0.01, r * t]} rotation-x={-Math.PI / 2} rotation-z={Math.PI / 4} material={materials.brass}>
                <planeGeometry args={[0.14, 0.14]} />
              </mesh>
            ))}
          </group>
        );
      })}
      <Ring at={CENTER} inner={CENTER_R + 0.03} outer={CENTER_R + 0.16} material={materials.brass} />
      <TurnGem turn={turn ?? null} colors={colors} layout={layout} />
      {table && <SwapWave wave={wave} />}
    </group>
  );
}

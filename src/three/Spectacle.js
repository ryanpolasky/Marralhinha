import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { fx } from './fx';
import { ARCADE_GLSL } from './skins';
import { clipToBoard } from './boardClip';

const T = 64;
const FLOOR = 0.08;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

const makeAtlas = () => {
  const c = document.createElement('canvas');
  c.width = c.height = T * 4;
  const g = c.getContext('2d');
  const tile = (i, fn) => {
    g.save();
    g.translate((i % 4) * T + T / 2, Math.floor(i / 4) * T + T / 2);
    g.beginPath();
    g.rect(-T / 2, -T / 2, T, T);
    g.clip();
    fn();
    g.restore();
  };
  const radial = (stops, r = T / 2) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`));
    return gr;
  };
  const disc = (stops, r) => {
    g.fillStyle = radial(stops, r);
    g.fillRect(-T / 2, -T / 2, T, T);
  };
  const white = 'rgba(255,255,255,1)';

  tile(0, () => disc([[0, 1], [0.25, 0.6], [0.6, 0.15], [1, 0]]));
  tile(1, () => {
    for (let i = 0; i < 9; i++) {
      g.save();
      g.translate(rand(-13, 13), rand(-13, 13));
      g.fillStyle = radial([[0, 0.38], [1, 0]], rand(14, 22));
      g.fillRect(-T, -T, T * 2, T * 2);
      g.restore();
    }
  });
  tile(2, () => {
    disc([[0, 0.9], [0.18, 0.35], [0.45, 0]]);
    g.fillStyle = white;
    g.beginPath();
    [[0, -31], [3, -3], [31, 0], [3, 3], [0, 31], [-3, 3], [-31, 0], [-3, -3]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.fill();
  });
  tile(3, () => disc([[0, 1], [0.7, 1], [1, 0]], 12));
  tile(4, () => {
    const lg = g.createLinearGradient(0, -28, 0, 26);
    lg.addColorStop(0, 'rgba(255,255,255,0.65)');
    lg.addColorStop(1, white);
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, -28);
    g.bezierCurveTo(17, -14, 14, 14, 0, 26);
    g.bezierCurveTo(-14, 14, -17, -14, 0, -28);
    g.fill();
  });
  tile(5, () => {
    g.fillStyle = white;
    g.fillRect(-14, -14, 28, 28);
  });
  tile(6, () => {
    g.fillStyle = radial([[0, 1], [0.45, 0.85], [1, 0.05]], 28);
    g.beginPath();
    g.moveTo(0, -30);
    g.bezierCurveTo(19, -8, 21, 14, 0, 27);
    g.bezierCurveTo(-21, 14, -19, -8, 0, -30);
    g.fill();
  });
  tile(7, () => {
    g.fillStyle = radial([[0, 0.05], [0.8, 0.2], [1, 0.5]], 24);
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = white;
    g.beginPath();
    g.arc(-9, -9, 4.5, 0, Math.PI * 2);
    g.fill();
  });
  tile(8, () => {
    g.fillStyle = white;
    g.shadowColor = white;
    g.shadowBlur = 5;
    g.beginPath();
    g.arc(0, -6, 19, Math.PI, 0);
    [[19, 26], [10, 18], [0, 26], [-10, 18], [-19, 26]].forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.ellipse(-7, -7, 3.6, 5.5, 0, 0, Math.PI * 2);
    g.ellipse(7, -7, 3.6, 5.5, 0, 0, Math.PI * 2);
    g.moveTo(3, 6);
    g.ellipse(0, 6, 3.4, 4.5, 0, 0, Math.PI * 2);
    g.fill();
  });
  tile(9, () => {
    g.fillStyle = white;
    [1, -1].forEach((s) => {
      g.save();
      g.scale(s, 1);
      g.beginPath();
      g.moveTo(0, -4);
      g.quadraticCurveTo(12, -24, 30, -12);
      g.quadraticCurveTo(22, -6, 25, 6);
      g.quadraticCurveTo(15, 0, 11, 11);
      g.quadraticCurveTo(5, 3, 0, 9);
      g.fill();
      g.restore();
    });
    g.beginPath();
    g.ellipse(0, 1, 5, 9, 0, 0, Math.PI * 2);
    g.moveTo(-5, -6);
    g.lineTo(-4, -15);
    g.lineTo(0, -8);
    g.lineTo(4, -15);
    g.lineTo(5, -6);
    g.fill();
  });
  tile(10, () => {
    disc([[0, 1], [0.12, 0.5], [0.4, 0]]);
    [0, Math.PI / 2].forEach((a) => {
      g.save();
      g.rotate(a);
      const lg = g.createLinearGradient(-32, 0, 32, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, white);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.fillRect(-32, -1.6, 64, 3.2);
      g.restore();
    });
  });
  tile(11, () => {
    g.scale(1, 0.16);
    g.fillStyle = radial([[0, 1], [0.5, 0.55], [1, 0]], 32);
    g.fillRect(-32, -200, 64, 400);
  });
  tile(12, () => {
    g.strokeStyle = white;
    g.lineWidth = 4;
    g.shadowColor = white;
    g.shadowBlur = 6;
    g.beginPath();
    g.arc(0, 0, 21, 0, Math.PI * 2);
    g.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
};

let atlasCache = null;
const sharedAtlas = () => atlasCache || (atlasCache = makeAtlas());

// Next dead slot from the cursor, so busy pools only steal live slots when truly full
const claim = (pool, cursor) => {
  for (let k = 0; k < pool.length; k++) {
    const i = (cursor.current + k) % pool.length;
    if (!pool[i].alive) {
      cursor.current = (i + 1) % pool.length;
      return i;
    }
  }
  const i = cursor.current;
  cursor.current = (i + 1) % pool.length;
  return i;
};

const SPRITE_VERT = `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aTile;
attribute float aRot;
uniform float uScale;
varying vec3 vC;
varying float vA;
varying float vT;
varying float vR;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
  vC = aColor; vA = aAlpha; vT = aTile; vR = aRot;
}`;

const spriteFrag = (pixel) => `
${pixel ? ARCADE_GLSL : ''}
uniform sampler2D uMap;
varying vec3 vC;
varying float vA;
varying float vT;
varying float vR;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vR), s = sin(vR);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  bool outside = p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0;
  ${pixel ? 'p = (floor(clamp(p, 0.0, 0.999) * 8.0) + 0.5) / 8.0;' : ''}
  float col = mod(vT, 4.0);
  float row = floor(vT / 4.0);
  vec2 uv = vec2((col + p.x) / 4.0, 1.0 - (row + p.y) / 4.0);
  vec4 t = ${pixel ? 'texture2DLodEXT(uMap, uv, 0.0)' : 'texture2D(uMap, uv)'};
  float a = t.a * vA;
  ${pixel ? 'a = step(arcadeBayer(gl_FragCoord.xy * 0.5) * 0.9 + 0.05, a);' : ''}
  if (outside || a < 0.003) discard;
  gl_FragColor = vec4(vC * t.rgb, a);
  #include <colorspace_fragment>
  ${pixel ? 'gl_FragColor.rgb = arcadeQuant(gl_FragColor.rgb);' : ''}
}`;

const SPRITES = 900;
const SPRITE_ATTRS = [['position', 3], ['aColor', 3], ['aSize', 1], ['aAlpha', 1], ['aTile', 1], ['aRot', 1]];

function SpriteLayer({ bus, atlas, clip = null, additive = false, pixel = false }) {
  const { gl, camera, size } = useThree();
  const live = useRef(0);
  const cursor = useRef(0);
  const sim = useMemo(
    () =>
      Array.from({ length: SPRITES }, () => ({
        alive: false,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        age: 0, life: 1, s0: 0.2, s1: 0.2, a: 1, fade: 1, fin: 0.06, flick: 0, phase: 0,
        grav: 0, drag: 0, rot: 0, rotv: 0, swirl: 0, cx: 0, cz: 0, tile: 0, land: false,
        c0: new THREE.Color(), c1: new THREE.Color(),
      })),
    []
  );
  const tmp = useMemo(() => new THREE.Color(), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    SPRITE_ATTRS.forEach(([name, n]) => g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(SPRITES * n), n).setUsage(THREE.DynamicDrawUsage)));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: atlas }, uScale: { value: 1 } },
        vertexShader: SPRITE_VERT,
        fragmentShader: spriteFrag(pixel),
        transparent: true,
        depthWrite: false,
        depthTest: additive,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [atlas, additive, pixel]
  );

  useEffect(
    () => () => {
      geo.dispose();
      material.dispose();
    },
    [geo, material]
  );

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'spr' || !!d.px !== pixel || (!pixel && (d.add !== false) !== additive)) return;
        live.current = 1;
        const { position, n = 1, tile = 0, c = ['#ffffff'], c2 = null, speed = 0, up = 0, uj = null, sphere = false, vel = [0, 0, 0], size: s0 = 0.3, size2 = s0, life = 0.6, grav = 0, drag = 0, rot = null, rotv = 0, radius = 0, inward = false, swirl = 0, a = 1, fade = 1, fadeIn = 0.06, flick = 0, land = false, jitter = 0.05 } = d;
        for (let i = 0; i < n; i++) {
          const p = sim[claim(sim, cursor)];
          const th = Math.random() * Math.PI * 2;
          const sp = speed * (0.45 + Math.random() * 0.55);
          let hv = 1;
          let vy = up + (Math.random() - 0.5) * 2 * (uj ?? up) * 0.5;
          if (sphere) {
            const u = Math.random() * 2 - 1;
            hv = Math.sqrt(1 - u * u);
            vy = u * sp + up;
          }
          const dir = inward ? -1 : 1;
          p.alive = true;
          p.x = position[0] + Math.cos(th) * radius + rand(-jitter, jitter);
          p.y = position[1] + rand(-jitter, jitter);
          p.z = position[2] + Math.sin(th) * radius + rand(-jitter, jitter);
          p.vx = Math.cos(th) * sp * hv * dir + vel[0];
          p.vy = vy + vel[1];
          p.vz = Math.sin(th) * sp * hv * dir + vel[2];
          p.age = 0;
          p.life = life * rand(0.75, 1.25);
          p.s0 = s0 * rand(0.8, 1.2);
          p.s1 = size2 * (p.s0 / s0);
          p.a = a;
          p.fade = fade;
          p.fin = fadeIn;
          p.flick = flick;
          p.phase = Math.random() * 6.28;
          p.grav = grav;
          p.drag = drag;
          p.rot = rot === null ? Math.random() * 6.28 : rot;
          p.rotv = rotv * rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1);
          p.swirl = swirl;
          p.cx = position[0];
          p.cz = position[2];
          p.tile = tile;
          p.land = land;
          p.c0.set(c[i % c.length]);
          p.c1.set(c2 ? c2[i % c2.length] : c[i % c.length]);
        }
      }),
    [bus, sim, additive, pixel]
  );

  useFrame((_, rawDt) => {
    if (!live.current) return;
    let j = 0;
    const dt = Math.min(rawDt, 0.05);
    material.uniforms.uScale.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const pos = geo.attributes.position.array;
    const col = geo.attributes.aColor.array;
    const sz = geo.attributes.aSize.array;
    const al = geo.attributes.aAlpha.array;
    const tl = geo.attributes.aTile.array;
    const rt = geo.attributes.aRot.array;
    for (let i = 0; i < SPRITES; i++) {
      const p = sim[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vy -= 9 * p.grav * dt;
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f;
        p.vy *= f;
        p.vz *= f;
      }
      if (p.swirl) {
        const ang = p.swirl * dt;
        const dx = p.x - p.cx;
        const dz = p.z - p.cz;
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        p.x = p.cx + dx * cs - dz * sn;
        p.z = p.cz + dx * sn + dz * cs;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rotv * dt;
      if (p.land && p.y < (!clip || clip.test(p.x, p.z) ? FLOOR : -2)) {
        p.alive = false;
        continue;
      }
      const k = p.age / p.life;
      const e = 1 - (1 - k) * (1 - k);
      pos[j * 3] = p.x;
      pos[j * 3 + 1] = p.y;
      pos[j * 3 + 2] = p.z;
      tmp.copy(p.c0).lerp(p.c1, k);
      col[j * 3] = tmp.r;
      col[j * 3 + 1] = tmp.g;
      col[j * 3 + 2] = tmp.b;
      sz[j] = p.s0 + (p.s1 - p.s0) * e;
      al[j] = p.a * Math.min(1, p.age / p.fin) * Math.pow(1 - k, p.fade) * (p.flick ? 0.55 + 0.45 * Math.sin(p.age * p.flick + p.phase) : 1);
      tl[j] = p.tile;
      rt[j] = p.rot;
      j++;
    }
    live.current = j;
    geo.setDrawRange(0, j);
    if (!j) return;
    SPRITE_ATTRS.forEach(([n, size]) => {
      const a = geo.attributes[n];
      a.clearUpdateRanges();
      a.addUpdateRange(0, j * size);
      a.needsUpdate = true;
    });
  });

  return <points geometry={geo} material={material} frustumCulled={false} renderOrder={additive ? 3 : 2} />;
}

const DOME_VERT = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const DOME_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSolid;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  gl_FragColor = vec4(uColor, clamp(f * 0.95 + 0.1 + uSolid, 0.0, 1.0) * uOpacity);
  #include <colorspace_fragment>
}`;

const DOMES = 8;

function Domes({ bus }) {
  const geo = useMemo(() => new THREE.SphereGeometry(1, 32, 18), []);
  const state = useMemo(() => Array.from({ length: DOMES }, () => ({ alive: false, t: 0, life: 0.4, size: 1, squash: 1, from: 0.1, collapse: false, opacity: 1 })), []);
  const mats = useMemo(
    () =>
      state.map(
        () =>
          new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uSolid: { value: 0 } },
            vertexShader: DOME_VERT,
            fragmentShader: DOME_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          })
      ),
    [state]
  );
  const meshes = useRef([]);

  useEffect(
    () => () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
    },
    [geo, mats]
  );

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'dome') return;
        const i = Math.max(0, state.findIndex((s) => !s.alive));
        const s = state[i];
        const add = d.add !== false;
        Object.assign(s, { alive: true, t: -(d.delay || 0), life: d.life || 0.4, size: d.size || 1, squash: d.squash ?? 1, from: d.from ?? 0.1, collapse: !!d.collapse, opacity: d.opacity ?? 1 });
        const m = mats[i];
        m.uniforms.uColor.value.set(d.color || '#ffffff');
        m.uniforms.uSolid.value = add ? 0 : d.solid ?? 0.55;
        m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
        meshes.current[i]?.position.set(d.position[0], d.position[1], d.position[2]);
      }),
    [bus, state, mats]
  );

  useFrame((_, dt) => {
    state.forEach((s, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      if (s.alive) {
        s.t += dt;
        if (s.t >= s.life) s.alive = false;
      }
      mesh.visible = s.alive && s.t >= 0;
      if (!mesh.visible) return;
      const k = Math.min(1, s.t / s.life);
      const e = s.collapse ? 1 - k * k : 1 - (1 - k) ** 3;
      const r = s.collapse ? s.size * e : s.size * (s.from + (1 - s.from) * e);
      mesh.scale.set(r, r * s.squash, r);
      mats[i].uniforms.uOpacity.value = s.opacity * (s.collapse ? Math.min(1, k * 4) * (1 - k * 0.4) : (1 - k) ** 1.4);
    });
  });

  return (
    <group>
      {state.map((_, i) => (
        <mesh key={i} ref={(m) => (meshes.current[i] = m)} geometry={geo} material={mats[i]} visible={false} renderOrder={4} />
      ))}
    </group>
  );
}

const jagged = (from, to, jag, n) => {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const side = new THREE.Vector3(1, 0, 0).cross(dir).lengthSq() > 0.01 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const u = dir.clone().cross(side).normalize();
  const v = dir.clone().cross(u).normalize();
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = a.clone().lerp(b, i / n);
    if (i && i < n) p.addScaledVector(u, rand(-jag, jag)).addScaledVector(v, rand(-jag, jag));
    return p;
  });
};

const STRANDS = 48;
const STRAND_PTS = 40;
const STRAND_SIDES = 5;
const STRAND_LAYERS = [[1, 1], [4, 0.4]];

const strandGeometry = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STRAND_PTS * STRAND_SIDES * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < STRAND_PTS - 1; i++) {
    for (let k = 0; k < STRAND_SIDES; k++) {
      const a = i * STRAND_SIDES + k;
      const b = i * STRAND_SIDES + ((k + 1) % STRAND_SIDES);
      idx.push(a, a + STRAND_SIDES, b, b, a + STRAND_SIDES, b + STRAND_SIDES);
    }
  }
  g.setIndex(idx);
  g.setDrawRange(0, 0);
  return g;
};

const WHITE = new THREE.Color('#ffffff');
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);
const tan = new THREE.Vector3();
const nu = new THREE.Vector3();
const nv = new THREE.Vector3();
const samples = Array.from({ length: STRAND_PTS }, () => new THREE.Vector3());

const writeStrand = (geos, pts, radius) => {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15);
  const n = Math.min(STRAND_PTS, pts.length * 3 + 1);
  for (let i = 0; i < n; i++) curve.getPoint(i / (n - 1), samples[i]);
  geos.forEach((g, layer) => {
    const r = radius * STRAND_LAYERS[layer][0];
    const arr = g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      tan.subVectors(samples[Math.min(i + 1, n - 1)], samples[Math.max(i - 1, 0)]).normalize();
      nu.crossVectors(tan, Math.abs(tan.y) < 0.9 ? UP : SIDE).normalize();
      nv.crossVectors(tan, nu);
      for (let k = 0; k < STRAND_SIDES; k++) {
        const a = (k / STRAND_SIDES) * Math.PI * 2;
        const c = Math.cos(a) * r;
        const s = Math.sin(a) * r;
        const o = (i * STRAND_SIDES + k) * 3;
        arr[o] = samples[i].x + nu.x * c + nv.x * s;
        arr[o + 1] = samples[i].y + nu.y * c + nv.y * s;
        arr[o + 2] = samples[i].z + nu.z * c + nv.z * s;
      }
    }
    g.attributes.position.clearUpdateRanges();
    g.attributes.position.addUpdateRange(0, n * STRAND_SIDES * 3);
    g.attributes.position.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * STRAND_SIDES * 6);
  });
};

function Bolts({ bus }) {
  const cursor = useRef(0);
  const { group, strands } = useMemo(() => {
    const g = new THREE.Group();
    const list = Array.from({ length: STRANDS }, () => {
      const geos = STRAND_LAYERS.map(strandGeometry);
      const meshes = geos.map((geo) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        m.visible = false;
        m.frustumCulled = false;
        g.add(m);
        return m;
      });
      return { alive: false, t: 0, life: 0.2, geos, meshes };
    });
    return { group: g, strands: list };
  }, []);

  useEffect(
    () => () =>
      strands.forEach((s) =>
        s.meshes.forEach((m) => {
          m.geometry.dispose();
          m.material.dispose();
        })
      ),
    [strands]
  );

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'bolt') return;
        const { from, to, color = '#bfefff', radius = 0.03, life = 0.2, jag = 0.3, branches = 1, delay = 0 } = d;
        const add = (pts, r) => {
          const s = strands[claim(strands, cursor)];
          Object.assign(s, { alive: true, t: -delay, life });
          writeStrand(s.geos, pts, r);
          s.meshes[0].material.color.set(color).lerp(WHITE, 0.75);
          s.meshes[1].material.color.set(color);
          s.meshes.forEach((m) => (m.visible = false));
        };
        const segs = Math.max(8, Math.round(new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to)) * 2.2));
        const main = jagged(from, to, jag, segs);
        add(main, radius);
        for (let i = 0; i < branches; i++) {
          const at = main[Math.floor(rand(2, main.length - 3))];
          const end = at.clone().add(new THREE.Vector3(rand(-1, 1), rand(-0.9, -0.2), rand(-1, 1)).multiplyScalar(rand(0.8, 1.8)));
          end.y = Math.max(end.y, 0.1);
          add(jagged(at.toArray(), end.toArray(), jag * 0.6, 6), radius * 0.55);
        }
      }),
    [bus, strands]
  );

  useFrame((_, dt) => {
    strands.forEach((s) => {
      if (!s.alive) return;
      s.t += dt;
      if (s.t >= s.life) {
        s.alive = false;
        s.meshes.forEach((m) => (m.visible = false));
        return;
      }
      const k = Math.max(0, s.t / s.life);
      const flicker = 0.45 + Math.random() * 0.55;
      s.meshes.forEach((m, j) => {
        m.visible = s.t >= 0;
        m.material.opacity = STRAND_LAYERS[j][1] * flicker * (1 - k * k);
      });
    });
  });

  return <primitive object={group} />;
}

const SHARDS = 220;

function Shards({ bus, clip = null }) {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const kinds = useMemo(
    () =>
      ['tetra', 'box'].map((shape) => ({
        shape,
        cursor: { current: 0 },
        live: 1,
        mesh: null,
        pool: Array.from({ length: SHARDS }, () => ({ alive: false, shown: true, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), age: 0, life: 1, size: 0.1, grav: 1, bounce: 0.45 })),
      })),
    []
  );

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'shard') return;
        const kind = kinds[d.shape === 'box' ? 1 : 0];
        if (!kind.mesh) return;
        kind.live = 1;
        const { position, colors, n = 12, speed = 3, up = 3, size = 0.1, life = 1.4, grav = 1, bounce = 0.45, spin = 9 } = d;
        for (let i = 0; i < n; i++) {
          const idx = claim(kind.pool, kind.cursor);
          const s = kind.pool[idx];
          const th = Math.random() * Math.PI * 2;
          const sp = speed * rand(0.35, 1);
          s.alive = true;
          s.age = 0;
          s.life = life * rand(0.7, 1.2);
          s.size = size * rand(0.6, 1.4);
          s.grav = grav;
          s.bounce = bounce;
          s.p.set(position[0] + rand(-0.12, 0.12), position[1], position[2] + rand(-0.12, 0.12));
          s.v.set(Math.cos(th) * sp, up * rand(0.5, 1.3), Math.sin(th) * sp);
          s.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
          s.w.set(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin));
          kind.mesh.setColorAt(idx, color.set(colors[i % colors.length]));
        }
        kind.mesh.instanceColor.needsUpdate = true;
      }),
    [bus, kinds, color]
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    kinds.forEach((kind) => {
      if (!kind.mesh || !kind.live) return;
      let alive = 0;
      kind.pool.forEach((s, i) => {
        if (!s.alive && !s.shown) return;
        if (s.alive) {
          s.age += dt;
          if (s.age >= s.life) s.alive = false;
          s.v.y -= 9 * s.grav * dt;
          s.p.addScaledVector(s.v, dt);
          s.r.addScaledVector(s.w, dt);
          const floor = FLOOR + s.size * 0.5;
          if (s.p.y < floor && (!clip || clip.test(s.p.x, s.p.z))) {
            s.p.y = floor;
            s.v.y = Math.abs(s.v.y) * s.bounce;
            s.v.x *= 0.7;
            s.v.z *= 0.7;
            s.w.multiplyScalar(0.6);
          }
        }
        s.shown = s.alive;
        if (s.alive) alive++;
        const k = s.alive ? s.age / s.life : 1;
        dummy.position.copy(s.p);
        dummy.rotation.set(s.r.x, s.r.y, s.r.z);
        dummy.scale.setScalar(s.alive ? s.size * Math.min(1, (1 - k) * 3.2) : 0);
        dummy.updateMatrix();
        kind.mesh.setMatrixAt(i, dummy.matrix);
      });
      kind.live = alive;
      kind.mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group>
      <instancedMesh ref={(m) => (kinds[0].mesh = m)} args={[null, null, SHARDS]} frustumCulled={false}>
        <tetrahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.22} metalness={0.15} flatShading />
      </instancedMesh>
      <instancedMesh ref={(m) => (kinds[1].mesh = m)} args={[null, null, SHARDS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.45} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}

const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const DECALS = {
  scorch: [256, 256, (g, w) => {
    const c = w / 2;
    let gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(8,4,2,0.92)');
    gr.addColorStop(0.55, 'rgba(14,8,4,0.7)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 6.28;
      const r = rand(0.25, 0.9) * c;
      g.fillStyle = `rgba(255,${Math.floor(rand(90, 170))},40,${rand(0.2, 0.7)})`;
      g.beginPath();
      g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, rand(1, 3), 0, 6.28);
      g.fill();
    }
  }],
  cracks: [256, 256, (g, w) => {
    const c = w / 2;
    g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      let a = (i / 11) * 6.28 + rand(-0.2, 0.2);
      let x = c;
      let y = c;
      const pts = [[x, y]];
      for (let s = 0; s < 6; s++) {
        a += rand(-0.5, 0.5);
        const l = rand(0.1, 0.2) * c;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l;
        pts.push([x, y]);
      }
      [[9, 'rgba(255,130,40,0.55)'], [3.5, 'rgba(255,200,90,0.9)'], [1.4, 'rgba(10,6,4,1)']].forEach(([lw, st]) => {
        g.strokeStyle = st;
        g.lineWidth = lw;
        g.beginPath();
        pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.stroke();
      });
    }
  }],
  puddle: [256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = 'rgba(120,200,255,0.4)';
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * 6.28;
      const r = c * 0.85 * (0.82 + Math.sin(a * 5) * 0.08 + Math.sin(a * 3 + 1) * 0.07);
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.fill();
    g.strokeStyle = 'rgba(230,248,255,0.85)';
    g.lineWidth = 3;
    g.stroke();
    g.strokeStyle = 'rgba(230,248,255,0.4)';
    g.beginPath();
    g.arc(c, c, c * 0.45, 0, 6.28);
    g.stroke();
  }],
  rune: [256, 256, (g, w) => {
    const c = w / 2;
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineWidth = 3;
    [0.92, 0.78, 0.44].forEach((r) => {
      g.beginPath();
      g.arc(c, c, c * r, 0, 6.28);
      g.stroke();
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.28;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78);
      g.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
      g.stroke();
    }
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 * 2.5 - 1.57;
      g.lineTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78);
    }
    g.closePath();
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28 + 0.2;
      g.beginPath();
      g.arc(c + Math.cos(a) * c * 0.62, c + Math.sin(a) * c * 0.62, 4, 0, 6.28);
      g.fill();
    }
  }],
  flower: [256, 256, (g, w) => {
    const c = w / 2;
    g.translate(c, c);
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 8; i++) {
        g.save();
        g.rotate((i / 8) * 6.28 + ring * 0.39);
        const len = c * (ring ? 0.7 : 0.95);
        const lg = g.createLinearGradient(0, 0, 0, -len);
        lg.addColorStop(0, ring ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)');
        lg.addColorStop(1, ring ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.8)');
        g.fillStyle = lg;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(len * 0.3, -len * 0.3, len * 0.28, -len * 0.85, 0, -len);
        g.bezierCurveTo(-len * 0.28, -len * 0.85, -len * 0.3, -len * 0.3, 0, 0);
        g.fill();
        g.restore();
      }
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, c * 0.14, 0, 6.28);
    g.fill();
  }],
  vortex: [256, 256, (g, w) => {
    const c = w / 2;
    g.translate(c, c);
    g.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      const a0 = (arm / 4) * 6.28;
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const a = a0 + t * 4.2;
        const r = (0.08 + t * 0.9) * c;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const lg = g.createRadialGradient(0, 0, 0, 0, 0, c);
      lg.addColorStop(0, 'rgba(255,255,255,0.1)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = lg;
      g.lineWidth = 9;
      g.stroke();
    }
  }],
  pixels: [256, 256, (g, w) => {
    const cell = 16;
    const palette = ['#2fe6ff', '#ff4fd8', '#ffe94d', '#ffffff'];
    for (let y = 0; y < w; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const d = Math.hypot(x + 8 - w / 2, y + 8 - w / 2) / (w / 2);
        if (d < 1 && Math.random() < 0.9 - d * 0.55) {
          g.fillStyle = palette[Math.floor(Math.random() * 4)];
          g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        }
      }
    }
  }],
  bsod: [512, 352, (g, w, h) => {
    g.fillStyle = '#0a5bc4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = '120px "Segoe UI", Arial, sans-serif';
    g.fillText(':(', 36, 150);
    g.font = '24px "Segoe UI", Arial, sans-serif';
    g.fillText('Your marble ran into a problem', 36, 206);
    g.fillText('and stopped responding.', 36, 238);
    g.font = '20px "Segoe UI", Arial, sans-serif';
    g.fillText('0% complete', 36, 288);
    g.font = '14px Consolas, monospace';
    g.fillText('Stop code: MARBLE_CAPTURED', 36, 322);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(w - 120, h - 120, 84, 84);
    g.fillStyle = '#0a5bc4';
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if ((x * 3 + y * 5 + x * y) % 3 === 0) g.fillRect(w - 114 + x * 11.5, h - 114 + y * 11.5, 10, 10);
  }],
};

const PANELS = { bsod: 512 / 352 };
const DECAL_POOL = 6;
const decalCache = {};
const decalTexture = (kind) => decalCache[kind] || (decalCache[kind] = canvasTex(...DECALS[kind]));

function Decals({ bus, clip = null }) {
  const { camera } = useThree();
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const state = useMemo(() => Array.from({ length: DECAL_POOL }, () => ({ alive: false, t: 0, life: 1, size: 1, spin: 0, angle: 0, grow: 0.3, kind: 'scorch', billboard: false, base: 1, jitter: 0, home: [0, 0, 0] })), []);
  const mats = useMemo(
    () =>
      state.map(() => {
        const m = new THREE.MeshBasicMaterial({ map: decalTexture('scorch'), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
        clipToBoard(m, clip);
        return m;
      }),
    [state, clip]
  );
  const meshes = useRef([]);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useEffect(
    () => () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
    },
    [geo, mats]
  );

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'decal') return;
        const i = Math.max(0, state.findIndex((s) => !s.alive));
        const s = state[i];
        const kind = d.kind;
        const billboard = kind in PANELS;
        Object.assign(s, { alive: true, t: -(d.delay || 0), life: d.life || 1.5, size: d.size || 2, spin: d.spin || 0, angle: Math.random() * 6.28, grow: d.grow ?? 0.3, kind, billboard, base: d.opacity ?? 1, jitter: d.jitter || 0, home: d.position });
        const m = mats[i];
        m.map = decalTexture(kind);
        m.color.set(d.color || '#ffffff');
        m.blending = d.add ? THREE.AdditiveBlending : THREE.NormalBlending;
        const mesh = meshes.current[i];
        if (mesh) {
          mesh.position.set(d.position[0], d.position[1], d.position[2]);
          mesh.rotation.set(billboard ? 0 : -Math.PI / 2, 0, 0);
        }
      }),
    [bus, state, mats]
  );

  useFrame((_, dt) => {
    state.forEach((s, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      if (s.alive) {
        s.t += dt;
        if (s.t >= s.life) s.alive = false;
      }
      mesh.visible = s.alive && s.t >= 0;
      if (!mesh.visible) return;
      const k = s.t / s.life;
      const pop = Math.min(1, s.t / 0.22);
      const sc = s.size * (s.grow + (1 - s.grow) * (1 - (1 - pop) ** 3));
      const aspect = PANELS[s.kind] || 1;
      mesh.scale.set(sc * aspect, sc, 1);
      if (s.billboard) {
        mesh.parent.getWorldQuaternion(q).invert().multiply(camera.quaternion);
        mesh.quaternion.copy(q);
        const jit = Math.random() < 0.18 ? s.jitter : 0;
        mesh.position.set(s.home[0] + rand(-jit, jit), s.home[1] + rand(-jit, jit) * 0.5, s.home[2]);
        mesh.visible = !(Math.random() < 0.06 && k > 0.2);
      } else {
        mesh.rotation.z = s.angle + s.spin * s.t;
      }
      mats[i].opacity = s.base * Math.min(1, s.t / 0.08) * (k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1);
    });
  });

  return (
    <group>
      {state.map((_, i) => (
        <mesh key={i} ref={(m) => (meshes.current[i] = m)} geometry={geo} material={mats[i]} visible={false} renderOrder={1} />
      ))}
    </group>
  );
}

const VIDEO_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const VIDEO_FRAG = `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float spill = t.g - max(t.r, t.b);
  float key = spill / max(t.g, 0.004);
  float a = (1.0 - smoothstep(0.3, 0.6, key)) * uOpacity;
  vec2 q = abs(vUv - 0.5) - vec2(0.5 - 0.22);
  a *= 1.0 - smoothstep(0.0, 0.05, length(max(q, 0.0)) - 0.22);
  if (a < 0.01) discard;
  t.g = min(t.g, max(t.r, t.b) + 0.02);
  gl_FragColor = vec4(t.rgb, a);
  #include <colorspace_fragment>
}`;

const videoCache = {};
const videoFor = (src) => {
  if (!videoCache[src]) {
    const el = document.createElement('video');
    Object.assign(el, { src, muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    videoCache[src] = { el, tex };
  }
  return videoCache[src];
};

// Green screen clip played on a camera-facing quad with the green keyed out
function VideoClip({ bus }) {
  const { camera } = useThree();
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ uniforms: { uMap: { value: null }, uOpacity: { value: 1 } }, vertexShader: VIDEO_VERT, fragmentShader: VIDEO_FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    []
  );
  const mesh = useRef();
  const clip = useRef(null);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useEffect(
    () => () => {
      clip.current?.el.pause();
      geo.dispose();
      mat.dispose();
    },
    [geo, mat]
  );

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'video') return;
        const { el, tex } = videoFor(d.src);
        const start = () => {
          el.currentTime = d.from || 0;
          el.playbackRate = d.rate || 1;
          el.play().catch(() => {});
        };
        clip.current = { el, size: d.size || 6, home: d.position, trim: d.trim || 0, t: -(d.delay || 0), started: false };
        mat.uniforms.uMap.value = tex;
        if (!d.delay) {
          clip.current.started = true;
          start();
        } else clip.current.start = start;
      }),
    [bus, mat]
  );

  useFrame((_, dt) => {
    const c = clip.current;
    const m = mesh.current;
    if (!c || !m) return;
    if (!c.started) {
      c.t += Math.min(dt, 0.05);
      if (c.t < 0) return void (m.visible = false);
      c.started = true;
      c.start();
    }
    const { el } = c;
    const done = el.ended || (el.duration > 0 && el.currentTime >= el.duration - c.trim);
    const ready = !el.seeking && el.readyState >= 2 && el.videoWidth > 0 && !done;
    m.visible = ready;
    if (done) {
      el.pause();
      clip.current = null;
    }
    if (!ready) return;
    const aspect = el.videoWidth / el.videoHeight;
    m.scale.set(c.size * aspect, c.size, 1);
    m.parent.getWorldQuaternion(q).invert().multiply(camera.quaternion);
    m.quaternion.copy(q);
    m.position.set(...c.home);
  });

  return <mesh ref={mesh} geometry={geo} material={mat} visible={false} renderOrder={6} frustumCulled={false} />;
}

// Compiles hidden pooled meshes and uploads textures on mount so the first kill doesn't hitch
export const useWarmup = () => {
  const { gl, camera, scene } = useThree();
  const root = useRef();
  useEffect(() => {
    gl.compile(root.current, camera, scene);
  }, [gl, camera, scene]);
  return root;
};

// Everything the kill effects need beyond plain bursts: billboard sprites, domes, lightning, solid shards and floor decals
export default function Spectacle({ bus = fx, clip = null }) {
  const { gl } = useThree();
  const atlas = sharedAtlas();
  const root = useWarmup();
  useEffect(() => {
    [atlas, ...Object.keys(DECALS).map(decalTexture)].forEach((t) => gl.initTexture(t));
  }, [gl, atlas]);
  useFrame((_, dt) => bus.tick(Math.min(dt, 0.05)));
  return (
    <group ref={root}>
      <Decals bus={bus} clip={clip} />
      <Shards bus={bus} clip={clip} />
      <Domes bus={bus} />
      <Bolts bus={bus} />
      <VideoClip bus={bus} />
      <SpriteLayer bus={bus} atlas={atlas} clip={clip} />
      <SpriteLayer bus={bus} atlas={atlas} clip={clip} additive />
      <SpriteLayer bus={bus} atlas={atlas} clip={clip} pixel />
    </group>
  );
}

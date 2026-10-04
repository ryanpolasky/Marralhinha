import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { fx } from './fx';

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
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
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

const SPRITE_FRAG = `
uniform sampler2D uMap;
varying vec3 vC;
varying float vA;
varying float vT;
varying float vR;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vR), s = sin(vR);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  float col = mod(vT, 4.0);
  float row = floor(vT / 4.0);
  vec4 t = texture2D(uMap, vec2((col + p.x) / 4.0, 1.0 - (row + p.y) / 4.0));
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.003) discard;
  #include <colorspace_fragment>
}`;

const SPRITES = 900;

function SpriteLayer({ bus, atlas, additive = false }) {
  const { gl, camera, size } = useThree();
  const live = useRef(0);
  const cursor = useRef(0);
  const sim = useMemo(
    () =>
      Array.from({ length: SPRITES }, () => ({
        alive: false,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        age: 0, life: 1, s0: 0.2, s1: 0.2, a: 1, fade: 1, flick: 0, phase: 0,
        grav: 0, drag: 0, rot: 0, rotv: 0, swirl: 0, cx: 0, cz: 0, tile: 0, land: false,
        c0: new THREE.Color(), c1: new THREE.Color(),
      })),
    []
  );
  const tmp = useMemo(() => new THREE.Color(), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const attr = (name, n) => g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(SPRITES * n), n).setUsage(THREE.DynamicDrawUsage));
    attr('position', 3);
    attr('aColor', 3);
    attr('aSize', 1);
    attr('aAlpha', 1);
    attr('aTile', 1);
    attr('aRot', 1);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: atlas }, uScale: { value: 1 } },
        vertexShader: SPRITE_VERT,
        fragmentShader: SPRITE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [atlas, additive]
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
        if (type !== 'spr' || (d.add !== false) !== additive) return;
        live.current = 1;
        const { position, n = 1, tile = 0, c = ['#ffffff'], c2 = null, speed = 0, up = 0, uj = null, sphere = false, vel = [0, 0, 0], size: s0 = 0.3, size2 = s0, life = 0.6, grav = 0, drag = 0, rot = null, rotv = 0, radius = 0, inward = false, swirl = 0, a = 1, fade = 1, flick = 0, land = false, jitter = 0.05 } = d;
        for (let i = 0; i < n; i++) {
          const p = sim[cursor.current];
          cursor.current = (cursor.current + 1) % SPRITES;
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
    [bus, sim, additive]
  );

  useFrame((_, rawDt) => {
    if (!live.current) return;
    let alive = 0;
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
      if (p.alive) {
        p.age += dt;
        if (p.age >= p.life) p.alive = false;
        else {
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
          if (p.land && p.y < FLOOR) p.alive = false;
        }
      }
      if (!p.alive) {
        sz[i] = 0;
        al[i] = 0;
        continue;
      }
      alive++;
      const k = p.age / p.life;
      const e = 1 - (1 - k) * (1 - k);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      tmp.copy(p.c0).lerp(p.c1, k);
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
      sz[i] = p.s0 + (p.s1 - p.s0) * e;
      al[i] = p.a * Math.min(1, p.age / 0.06) * Math.pow(1 - k, p.fade) * (p.flick ? 0.55 + 0.45 * Math.sin(p.age * p.flick + p.phase) : 1);
      tl[i] = p.tile;
      rt[i] = p.rot;
    }
    live.current = alive;
    ['position', 'aColor', 'aSize', 'aAlpha', 'aTile', 'aRot'].forEach((n) => (geo.attributes[n].needsUpdate = true));
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

function Bolts({ bus }) {
  const root = useRef();
  const live = useRef([]);

  useEffect(() => {
    const kill = (b) => {
      root.current?.remove(b.group);
      b.group.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    };
    const off = bus.on((type, d) => {
      if (type !== 'bolt' || !root.current) return;
      const { from, to, color = '#bfefff', radius = 0.03, life = 0.2, jag = 0.3, branches = 1, delay = 0 } = d;
      const group = new THREE.Group();
      const core = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.75);
      const mats = [];
      const add = (pts, r) => {
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15);
        [[r, core, 1], [r * 4, new THREE.Color(color), 0.4]].forEach(([rad, c, o]) => {
          const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
          m.userData.base = o;
          mats.push(m);
          group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, rad, 5, false), m));
        });
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
      group.visible = false;
      root.current.add(group);
      live.current.push({ group, mats, t: -delay, life });
    });
    return () => {
      off();
      live.current.forEach(kill);
      live.current = [];
    };
  }, [bus]);

  useFrame((_, dt) => {
    live.current = live.current.filter((b) => {
      b.t += dt;
      if (b.t >= b.life) {
        root.current.remove(b.group);
        b.group.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        return false;
      }
      b.group.visible = b.t >= 0;
      const k = Math.max(0, b.t / b.life);
      const flicker = 0.45 + Math.random() * 0.55;
      b.mats.forEach((m) => (m.opacity = m.userData.base * flicker * (1 - k * k)));
      return true;
    });
  });

  return <group ref={root} />;
}

const SHARDS = 220;

function Shards({ bus }) {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const kinds = useMemo(
    () =>
      ['tetra', 'box'].map((shape) => ({
        shape,
        cursor: 0,
        live: 1,
        mesh: null,
        pool: Array.from({ length: SHARDS }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), age: 0, life: 1, size: 0.1, grav: 1, bounce: 0.45 })),
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
          const idx = kind.cursor;
          const s = kind.pool[idx];
          kind.cursor = (idx + 1) % SHARDS;
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
        if (s.alive) {
          s.age += dt;
          if (s.age >= s.life) s.alive = false;
          s.v.y -= 9 * s.grav * dt;
          s.p.addScaledVector(s.v, dt);
          s.r.addScaledVector(s.w, dt);
          const floor = FLOOR + s.size * 0.5;
          if (s.p.y < floor) {
            s.p.y = floor;
            s.v.y = Math.abs(s.v.y) * s.bounce;
            s.v.x *= 0.7;
            s.v.z *= 0.7;
            s.w.multiplyScalar(0.6);
          }
        }
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

function Decals({ bus }) {
  const { camera } = useThree();
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const textures = useRef({});
  const state = useMemo(() => Array.from({ length: DECAL_POOL }, () => ({ alive: false, t: 0, life: 1, size: 1, spin: 0, angle: 0, grow: 0.3, kind: 'scorch', billboard: false, base: 1, jitter: 0, home: [0, 0, 0] })), []);
  const mats = useMemo(() => state.map(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide })), [state]);
  const meshes = useRef([]);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useEffect(() => {
    const texs = textures.current;
    return () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      Object.values(texs).forEach((t) => t.dispose());
    };
  }, [geo, mats]);

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'decal') return;
        const i = Math.max(0, state.findIndex((s) => !s.alive));
        const s = state[i];
        const kind = d.kind;
        if (!textures.current[kind]) {
          const [w, h, draw] = DECALS[kind];
          textures.current[kind] = canvasTex(w, h, draw);
        }
        const billboard = kind in PANELS;
        Object.assign(s, { alive: true, t: -(d.delay || 0), life: d.life || 1.5, size: d.size || 2, spin: d.spin || 0, angle: Math.random() * 6.28, grow: d.grow ?? 0.3, kind, billboard, base: d.opacity ?? 1, jitter: d.jitter || 0, home: d.position });
        const m = mats[i];
        m.map = textures.current[kind];
        m.color.set(d.color || '#ffffff');
        m.blending = d.add ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
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

// Everything the kill effects need beyond plain bursts: billboard sprites, domes, lightning, solid shards and floor decals
export default function Spectacle({ bus = fx }) {
  const atlas = useMemo(makeAtlas, []);
  useEffect(() => () => atlas.dispose(), [atlas]);
  return (
    <group>
      <Decals bus={bus} />
      <Shards bus={bus} />
      <Domes bus={bus} />
      <Bolts bus={bus} />
      <SpriteLayer bus={bus} atlas={atlas} />
      <SpriteLayer bus={bus} atlas={atlas} additive />
    </group>
  );
}

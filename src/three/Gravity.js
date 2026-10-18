import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SEAT_COLORS } from '../game/geometry';
import { fx } from './fx';

// Lenses bend a copy of the frame taken right before the first one draws, so there's no second scene pass
const grabs = new WeakMap();
const _size = new THREE.Vector2();
export const grabFrame = (renderer) => {
  if (renderer.getRenderTarget() !== null) return null;
  let g = grabs.get(renderer);
  if (!g) grabs.set(renderer, (g = { texture: null, frame: -1 }));
  if (g.frame === renderer.info.render.frame) return g.texture;
  renderer.getDrawingBufferSize(_size);
  const w = Math.max(1, Math.floor(_size.x));
  const h = Math.max(1, Math.floor(_size.y));
  if (!g.texture || g.texture.image.width !== w || g.texture.image.height !== h) {
    g.texture?.dispose();
    g.texture = new THREE.FramebufferTexture(w, h);
    g.texture.minFilter = g.texture.magFilter = THREE.LinearFilter;
    if (renderer.getContextAttributes?.()?.alpha === false) g.texture.format = THREE.RGBFormat;
  }
  renderer.copyFramebufferToTexture(g.texture);
  g.frame = renderer.info.render.frame;
  return g.texture;
};

const lensMesh = (geometry, material, renderOrder = -1) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.onBeforeRender = (renderer) => {
    if (material.uniforms.uWarp?.value === 0) return;
    const t = grabFrame(renderer);
    if (t) material.uniforms.uFrame.value = t;
  };
  return mesh;
};

const GRAB_GLSL = `
uniform mat4 projectionMatrix;
uniform sampler2D uFrame;
vec4 toClip(vec3 w) { return projectionMatrix * viewMatrix * vec4(w, 1.0); }
vec4 grab(vec3 w) {
  vec4 c = toClip(w);
  return texture2D(uFrame, clamp(c.xy / c.w * 0.5 + 0.5, 0.001, 0.999));
}`;

const NOISE_GLSL = `
float bhHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bhNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bhHash(i), bhHash(i + vec2(1.0, 0.0)), f.x), mix(bhHash(i + vec2(0.0, 1.0)), bhHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float bhFbm(vec2 p) {
  float s = 0.0;
  float a = 0.55;
  for (int i = 0; i < 3; i++) {
    s += a * bhNoise(p);
    p = p * 2.07 + 3.7;
    a *= 0.5;
  }
  return s;
}`;

const HOLE_VERT = `
uniform float uUnit;
uniform float uBound;
uniform float uFront;
varying vec3 vWorld;
varying vec3 vCenter;
void main() {
  vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - c;
  float d = length(toCam);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 ahead = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 p0 = c + toCam / d * min(uFront, d * 0.5);
  float scale = dot(p0 - cameraPosition, ahead) / max(dot(c - cameraPosition, ahead), 1e-3);
  vWorld = p0 + (right * position.x + up * position.y) * uBound * uUnit * 1.15 * scale;
  vCenter = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

// Rays bent through a Schwarzschild well in horizon units, with a Doppler-beamed disk and the frame lensed behind it
const HOLE_FRAG = `
uniform float uTime;
uniform float uUnit;
uniform float uBound;
uniform float uLens;
uniform float uDisk;
uniform float uGlow;
uniform float uFade;
uniform float uWarp;
uniform vec3 uNormal;
uniform vec3 uE1;
uniform vec3 uE2;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uCool;
varying vec3 vWorld;
varying vec3 vCenter;
${GRAB_GLSL}
${NOISE_GLSL}
const float RIN = 2.6;
const float ROUT = 6.4;
const float BCRIT = 2.598;
vec2 bhSpin(vec2 q, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * q.x - s * q.y, s * q.x + c * q.y);
}
// Keplerian shear on two clocks, crossfaded so the spiral never winds itself into static
float diskGrain(vec2 q, float rr) {
  float w = 1.7 * pow(RIN / rr, 1.5);
  float p1 = fract(uTime * 0.11);
  float p2 = fract(uTime * 0.11 + 0.5);
  float n1 = bhFbm(bhSpin(q, -p1 * 9.0 * w) * 1.4);
  float n2 = bhFbm(bhSpin(q, -p2 * 9.0 * w) * 1.4 + 11.0);
  float n = mix(n2, n1, 1.0 - abs(2.0 * p1 - 1.0));
  return (0.62 + 0.38 * sin(rr * 7.5 + n * 5.0)) * (0.45 + 1.1 * n);
}
vec3 starfield(vec3 d) {
  vec3 p = d * 70.0;
  float h = fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float star = step(0.93, h) * smoothstep(0.5, 0.0, length(fract(p) - 0.5)) * (h - 0.93) * 16.0;
  float neb = bhFbm(d.xy * 3.0 + d.z * 2.0);
  return vec3(star) + mix(uCool, uMid, neb) * neb * neb * 0.4;
}
void main() {
  vec3 ro = (cameraPosition - vCenter) / uUnit;
  vec3 rd = normalize(vWorld - cameraPosition);
  float bImp = length(cross(ro, rd));
  float rim = bImp / uBound;
  if (rim > 1.0) discard;
  float bq = dot(ro, rd);
  float disc = bq * bq - (dot(ro, ro) - uBound * uBound);
  vec3 pos = ro + rd * max(-bq - sqrt(max(disc, 0.0)), 0.0);
  vec3 dir = rd;
  vec3 glow = vec3(0.0);
  float seen = 1.0;
  float minR = 1e4;
  bool fell = false;
  // Without lensing, rays that pass wide of the disk can't hit anything, so skip the march
  bool wide = uWarp < 0.001 && bImp > ROUT + 0.4;
  if (wide) minR = bImp;
  for (int i = 0; i < 120; i++) {
    if (wide) break;
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    minR = min(minR, r);
    if (r < 1.0) { fell = true; break; }
    if (r > uBound + 0.05 && dot(pos, dir) > 0.0) break;
    float dt = clamp(0.1 * r, 0.035, 0.8);
    vec3 h = cross(pos, dir);
    vec3 prev = pos;
    dir = normalize(dir - 1.5 * dot(h, h) * pos / (r2 * r2 * r) * dt);
    pos += dir * dt;
    float a = dot(prev, uNormal);
    float b = dot(pos, uNormal);
    if (uDisk > 0.0 && a * b < 0.0 && seen > 0.02) {
      vec3 hit = mix(prev, pos, a / (a - b));
      float rr = length(hit);
      if (rr > RIN * 0.9 && rr < ROUT) {
        float heat = pow(RIN / rr, 1.1);
        float beta = sqrt(0.5 / rr);
        float toward = dot(normalize(cross(uNormal, hit)), -dir);
        float shift = sqrt(1.0 - beta * beta) / (1.0 - beta * toward) * sqrt(max(1.0 - 1.0 / rr, 0.0));
        float edge = smoothstep(RIN * 0.9, RIN * 1.2, rr) * (1.0 - smoothstep(ROUT * 0.55, ROUT, rr));
        float grain = diskGrain(vec2(dot(hit, uE1), dot(hit, uE2)), rr);
        float temp = heat * shift;
        vec3 ramp = mix(uCool, uMid, smoothstep(0.2, 0.55, temp));
        ramp = mix(ramp, uHot, smoothstep(0.55, 0.95, temp));
        ramp = mix(ramp, vec3(1.0), smoothstep(0.95, 1.5, temp));
        glow += ramp * (0.3 + 2.6 * heat * heat) * pow(shift, 3.0) * grain * edge * uDisk * seen;
        seen *= 1.0 - 0.7 * edge * clamp(grain, 0.0, 1.0);
      }
    }
  }
  float aa = fwidth(bImp) * 0.8 + 1e-3;
  float open = fell ? 0.0 : smoothstep(BCRIT - aa, BCRIT + aa, bImp);
  if (!fell) glow += uGlow * (uHot * exp(-pow((minR - 1.5) * 4.0, 2.0)) * 0.85 + uMid * exp(-(minR - 1.5) * 1.1) * 0.6);

  vec3 bg = vec3(0.0);
  float bgA = 0.0;
  float moved = 0.0;
  if (!fell && uWarp > 0.001) {
    vec3 nv = normalize(cameraPosition - vCenter);
    vec3 plane = vCenter - nv * uLens;
    vec3 exitW = vCenter + pos * uUnit;
    float den = dot(dir, nv);
    vec3 bent = exitW + dir * (den < -0.05 ? dot(plane - exitW, nv) / den : uLens);
    vec3 straight = cameraPosition + rd * (dot(plane - cameraPosition, nv) / dot(rd, nv));
    vec3 delta = (bent - straight) * (1.0 - smoothstep(0.45, 0.95, rim)) * uWarp;
    vec4 g = grab(straight + delta);
    bg = vec3(grab(straight + delta * 1.035).r, g.g, grab(straight + delta * 0.965).b);
    bgA = g.a;
    vec4 c0 = toClip(straight);
    vec4 c1 = toClip(straight + delta);
    moved = smoothstep(0.0005, 0.003, length(c1.xy / c1.w - c0.xy / c0.w));
    vec3 stars = starfield(dir) * (1.0 - bgA);
    bg += stars;
    bgA = max(bgA, min(1.0, max(stars.r, max(stars.g, stars.b))));
  }

  gl_FragColor = vec4(glow, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 lit = gl_FragColor.rgb;
  float fade = (1.0 - smoothstep(0.88, 1.0, rim)) * uFade;
  float rep = open * moved;
  float alpha = clamp(max(1.0 - open, rep * bgA) + max(lit.r, max(lit.g, lit.b)), 0.0, 1.0);
  gl_FragColor = vec4((bg * rep + lit) * fade, alpha * fade);
}`;

const WARP_VERT = `
varying vec3 vWorld;
varying vec3 vCenter;
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WARP_FRAG = `
uniform float uK;
uniform float uAmp;
uniform float uWidth;
uniform float uWell;
uniform float uChroma;
uniform float uGlow;
uniform float uOpacity;
uniform vec3 uColor;
varying vec3 vWorld;
varying vec3 vCenter;
varying vec2 vLocal;
${GRAB_GLSL}
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  vec3 radial = vWorld - vCenter;
  radial.y = 0.0;
  float rl = length(radial);
  radial = rl > 1e-5 ? radial / rl : vec3(0.0);
  float x = (r - uK) / uWidth;
  float env = exp(-x * x);
  float edge = 1.0 - smoothstep(0.7, 1.0, r);
  float ripple = sin(x * 2.4) * env * (1.0 - uK * 0.6);
  float well = r * (1.0 - r) * (1.0 - r) * 6.75;
  float disp = (uAmp * ripple + uWell * well) * edge;
  vec3 d = radial * disp;
  vec4 g = grab(vWorld + d);
  vec3 bg = vec3(grab(vWorld + d * (1.0 + uChroma * 0.3)).r, g.g, grab(vWorld + d * (1.0 - uChroma * 0.3)).b);
  vec4 c0 = toClip(vWorld);
  vec4 c1 = toClip(vWorld + d);
  float rep = smoothstep(0.0005, 0.003, length(c1.xy / c1.w - c0.xy / c0.w));
  gl_FragColor = vec4(uColor * env * uGlow * edge * (1.0 - uK), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 lit = gl_FragColor.rgb;
  float alpha = clamp(rep * g.a + max(lit.r, max(lit.g, lit.b)), 0.0, 1.0);
  gl_FragColor = vec4((bg * rep + lit) * uOpacity, alpha * uOpacity);
}`;

export const CARD_GEO = new THREE.PlaneGeometry(2, 2);
const WARP_GEO = new THREE.PlaneGeometry(2, 2);

const HOT = new THREE.Color('#fff4d6');
export const BCRIT = 2.598;
export const HOLE_BOUND = 9;

export const paintHole = (u, c = SEAT_COLORS[0]) => {
  u.uHot.value.set(c.light).lerp(HOT, 0.55);
  u.uMid.value.set(c.main);
  u.uCool.value.set(c.dark);
};

export const holeMaterial = () => {
  const uniforms = {
    uFrame: { value: null },
    uTime: { value: 0 },
    uUnit: { value: 0.1 },
    uBound: { value: HOLE_BOUND },
    uFront: { value: 0.5 },
    uLens: { value: 0.8 },
    uDisk: { value: 1 },
    uGlow: { value: 1 },
    uFade: { value: 1 },
    uWarp: { value: 1 },
    uNormal: { value: new THREE.Vector3(0, 1, 0) },
    uE1: { value: new THREE.Vector3(1, 0, 0) },
    uE2: { value: new THREE.Vector3(0, 0, 1) },
    uHot: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uCool: { value: new THREE.Color() },
  };
  paintHole(uniforms);
  return new THREE.ShaderMaterial({ uniforms, vertexShader: HOLE_VERT, fragmentShader: HOLE_FRAG, transparent: true, premultipliedAlpha: true, depthWrite: false });
};

const warpMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uFrame: { value: null },
      uK: { value: 0 },
      uAmp: { value: 0 },
      uWidth: { value: 0.1 },
      uWell: { value: 0 },
      uChroma: { value: 0 },
      uGlow: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color() },
    },
    vertexShader: WARP_VERT,
    fragmentShader: WARP_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);
const _wobble = new THREE.Vector3();

// The disk leans with the camera so it's always seen nearly edge-on, like in the films
export const diskFrame = (camera, t, n, e1, e2) => {
  n.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(0.8).add(_wobble.set(0.16 * Math.sin(t * 0.31), 0.4, 0.16 * Math.cos(t * 0.23))).normalize();
  e1.crossVectors(n, Math.abs(n.y) < 0.9 ? WORLD_UP : WORLD_X).normalize();
  e2.crossVectors(n, e1);
};

export const holeEnvelope = (t, life, grow, shrink) => {
  if (t < 0 || t >= life) return 0;
  const g = 1 - (1 - Math.min(1, t / grow)) ** 3;
  const tail = Math.max(0, (t - (life - shrink)) / shrink);
  return g * (1 - tail * tail);
};

const slot = (pool) => {
  const free = pool.findIndex((s) => !s.alive);
  if (free >= 0) return free;
  return pool.reduce((best, s, i) => (s.t / s.life > pool[best].t / pool[best].life ? i : best), 0);
};

const HOLES = 8;

export function Holes({ bus = fx }) {
  const { camera } = useThree();
  const pool = useMemo(
    () =>
      Array.from({ length: HOLES }, () => {
        const material = holeMaterial();
        const mesh = lensMesh(CARD_GEO, material);
        mesh.visible = false;
        return { mesh, material, alive: false, t: 0, life: 1, grow: 0.3, shrink: 0.2, size: 0.5, disk: 1, spin: 1, phase: 0 };
      }),
    []
  );
  const group = useMemo(() => {
    const g = new THREE.Group();
    pool.forEach((s) => g.add(s.mesh));
    return g;
  }, [pool]);
  useEffect(() => () => pool.forEach((s) => s.material.dispose()), [pool]);

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'hole') return;
        const s = pool[slot(pool)];
        Object.assign(s, { alive: true, t: -(d.delay || 0), life: d.life || 1, grow: d.grow || 0.3, shrink: d.shrink || 0.2, size: d.size || 0.5, disk: d.disk ?? 1, spin: d.spin ?? 1.6, phase: Math.random() * 40 });
        paintHole(s.material.uniforms, d.color || SEAT_COLORS[0]);
        s.mesh.position.set(d.position[0], d.position[1], d.position[2]);
      }),
    [bus, pool]
  );

  useFrame((_, dt) => {
    pool.forEach((s) => {
      if (!s.alive) return;
      s.t += dt;
      if (s.t >= s.life) s.alive = false;
      const e = s.alive ? holeEnvelope(s.t, s.life, s.grow, s.shrink) : 0;
      s.mesh.visible = e > 0.01;
      if (!s.mesh.visible) return;
      const u = s.material.uniforms;
      u.uTime.value = s.phase + s.t * s.spin;
      u.uUnit.value = (s.size * e) / BCRIT;
      u.uFront.value = s.size * e * 1.6;
      u.uLens.value = s.size * 2.4;
      u.uDisk.value = s.disk * (0.6 + 0.6 * e);
      u.uGlow.value = 0.8 + 0.6 * e;
      u.uFade.value = Math.min(1, s.t / 0.06);
      diskFrame(camera, u.uTime.value, u.uNormal.value, u.uE1.value, u.uE2.value);
    });
  });

  return <primitive object={group} />;
}

const WARPS = 12;

export function Warps({ bus = fx }) {
  const pool = useMemo(
    () =>
      Array.from({ length: WARPS }, () => {
        const material = warpMaterial();
        const mesh = lensMesh(WARP_GEO, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        return { mesh, material, alive: false, t: 0, life: 1, size: 1, amp: 0.1, well: 0, glow: 0 };
      }),
    []
  );
  const group = useMemo(() => {
    const g = new THREE.Group();
    pool.forEach((s) => g.add(s.mesh));
    return g;
  }, [pool]);
  useEffect(() => () => pool.forEach((s) => s.material.dispose()), [pool]);

  useEffect(
    () =>
      bus.on((type, d) => {
        if (type !== 'warp') return;
        const s = pool[slot(pool)];
        Object.assign(s, { alive: true, t: -(d.delay || 0), life: d.life || 1, size: d.size || 2, amp: d.amp ?? 0.1, well: d.well || 0, glow: d.glow || 0 });
        const u = s.material.uniforms;
        u.uWidth.value = d.width || 0.12;
        u.uChroma.value = d.chroma || 0;
        u.uColor.value.set(d.color || '#ffffff');
        s.mesh.position.set(d.position[0], d.position[1] ?? 0.03, d.position[2]);
        s.mesh.scale.set(s.size, s.size, 1);
      }),
    [bus, pool]
  );

  useFrame((_, dt) => {
    pool.forEach((s) => {
      if (!s.alive) return;
      s.t += dt;
      if (s.t >= s.life) s.alive = false;
      s.mesh.visible = s.alive && s.t >= 0;
      if (!s.mesh.visible) return;
      const k = s.t / s.life;
      const u = s.material.uniforms;
      u.uK.value = 1 - (1 - k) ** 2;
      u.uAmp.value = s.amp;
      u.uWell.value = s.well * Math.sin(Math.PI * Math.min(1, k * 1.15));
      u.uGlow.value = s.glow;
      u.uOpacity.value = Math.min(1, s.t / 0.05) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    });
  });

  return <primitive object={group} />;
}

const GLASS_GEO = new THREE.SphereGeometry(1, 48, 32);
const MARBLE_BOUND = 6.8;

// Clear glass that only shows itself at the rim and in reflections
const glassMaterial = () => {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, transparent: true, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\ngl_FragColor.a = mix(0.02, 0.6, pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.0));'
    );
  };
  m.customProgramCacheKey = () => 'singularity-glass';
  return m;
};

// A black hole in a glass marble; energy eases between idle (~0.3) and moving (1)
export function SingularityAura({ size = 0.335, color = SEAT_COLORS[0], energy = null, seed = 0 }) {
  const { camera } = useThree();
  const { material, glass, root, shell } = useMemo(() => {
    const material = holeMaterial();
    material.uniforms.uWarp.value = 0;
    material.uniforms.uBound.value = MARBLE_BOUND;
    const glass = glassMaterial();
    const shell = new THREE.Mesh(GLASS_GEO, glass);
    shell.renderOrder = 1;
    const root = new THREE.Group();
    root.add(lensMesh(CARD_GEO, material, 0), shell);
    return { material, glass, root, shell };
  }, []);
  useEffect(
    () => () => {
      material.dispose();
      glass.dispose();
    },
    [material, glass]
  );
  useEffect(() => shell.scale.setScalar(size), [shell, size]);
  useEffect(() => paintHole(material.uniforms, color), [material, color]);
  const clock = useRef(seed * 3.7);

  useFrame((_, dt) => {
    const e = energy?.current ?? 0.5;
    clock.current += Math.min(dt, 0.05) * (0.7 + 0.9 * e);
    const u = material.uniforms;
    u.uTime.value = clock.current;
    u.uUnit.value = (size * 0.95) / MARBLE_BOUND / 1.15;
    u.uFront.value = size * 0.3;
    u.uDisk.value = 1.1 + 0.9 * e;
    u.uGlow.value = 0.6 + 0.7 * e;
    diskFrame(camera, clock.current, u.uNormal.value, u.uE1.value, u.uE2.value);
  });

  return <primitive object={root} />;
}

export const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

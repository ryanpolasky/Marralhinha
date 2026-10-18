import * as THREE from 'three';

export function onIdle(fn) {
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(fn, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 80);
  return () => clearTimeout(id);
}

// Three only gives offscreen targets the screen's tone mapping and sRGB blending when they're flagged as XR output
export function screenTarget(width = 16, height = 16) {
  const target = new THREE.WebGLRenderTarget(width, height);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.isXRRenderTarget = true;
  return target;
}

export function compileInto(gl, scene, camera, target = null) {
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(target);
  try {
    return gl.compileAsync(scene, camera);
  } finally {
    gl.setRenderTarget(previous);
  }
}

export async function warmSet(gl, scene, camera, source, cancelled = () => false) {
  const scratch = new THREE.Scene();
  scratch.environment = scene.environment;
  scratch.environmentIntensity = scene.environmentIntensity;
  scratch.fog = scene.fog;
  source.updateWorldMatrix(true, true);
  const model = source.clone(true);
  source.matrixWorld.decompose(model.position, model.quaternion, model.scale);
  model.traverse((o) => {
    o.visible = true;
    o.frustumCulled = false;
  });
  scratch.add(model);
  scene.traverseVisible((o) => {
    if (!o.isLight) return;
    for (let parent = o.parent; parent; parent = parent.parent) {
      if (/^ufo-.*-set$/.test(parent.name)) return;
    }
    scratch.add(o.clone());
  });
  const target = screenTarget();
  const view = camera.clone();
  source.getWorldPosition(view.position);
  view.position.add(new THREE.Vector3(0, 2, 7));
  view.lookAt(model.position);
  view.clearViewOffset();
  const textures = new Set();
  model.traverse((o) => {
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    materials.forEach((m) => Object.values(m).forEach((v) => v?.isTexture && textures.add(v)));
  });
  try {
    textures.forEach((texture) => gl.initTexture(texture));
    await Promise.all([
      compileInto(gl, scratch, view),
      compileInto(gl, scratch, view, target),
    ]);
    if (cancelled()) return;
    const previous = gl.getRenderTarget();
    try {
      gl.setRenderTarget(target);
      gl.render(scratch, view);
    } finally {
      gl.setRenderTarget(previous);
    }
  } finally {
    target.dispose();
    scratch.traverse((o) => o.isLight && o.shadow?.dispose());
  }
}

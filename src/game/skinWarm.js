// DOM pickers can't reach into the canvas, so they announce intent here instead: warmBoardSkin(id)
// prebuilds one skin, warmBoardSkin() queues them all on idle. The live 3D board listens and does
// the canvas painting, shader compile and texture upload ahead of the swap.
const warmers = new Set();

export const onBoardSkinWarm = (fn) => {
  warmers.add(fn);
  return () => warmers.delete(fn);
};

export const warmBoardSkin = (id = null) => warmers.forEach((fn) => fn(id));

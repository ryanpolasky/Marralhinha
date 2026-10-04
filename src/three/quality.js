// `max` is how the table used to render, `balanced` ships; compare them on #preview/quality
export const QUALITY = {
  max: { dpr: 2, shadowSize: 2048, msaa: 'always', glass: true },
  balanced: { dpr: 1.5, shadowSize: 1024, msaa: 'low-dpr', glass: false },
};

export const quality = QUALITY.balanced;

export const renderDpr = (q) => Math.min(window.devicePixelRatio || 1, q.dpr);

// MSAA buys little once the canvas renders at 1.5x or more
export const antialiasFor = (q) => q.msaa === 'always' || (q.msaa === 'low-dpr' && renderDpr(q) < 1.5);

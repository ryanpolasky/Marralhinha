import { useMemo, useSyncExternalStore } from 'react';
import { oklchToHex } from './colors';

export const RAINBOW_PERIOD_MS = 10000;
const TICK_MS = 50;

export const rainbowHue = (now = Date.now()) => ((now % RAINBOW_PERIOD_MS) / RAINBOW_PERIOD_MS) * 360;

export const rainbowTriplet = (base, now = Date.now()) => {
  const h = rainbowHue(now);
  return {
    ...base,
    baseMain: base.baseMain || base.main,
    main: oklchToHex({ L: 0.68, C: 0.2, h }),
    light: oklchToHex({ L: 0.86, C: 0.11, h }),
    dark: oklchToHex({ L: 0.4, C: 0.14, h }),
  };
};

let tick = 0;
let timer = null;
const listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  if (!timer) {
    timer = setInterval(() => {
      tick++;
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearInterval(timer);
      timer = null;
    }
  };
};
const idle = () => () => {};

const useTick = (live) => useSyncExternalStore(live ? subscribe : idle, () => (live ? tick : 0));

export function useRainbow(colors) {
  const live = !!colors?.some((c) => c?.rainbow);
  const t = useTick(live);
  return useMemo(() => (live ? colors.map((c) => (c?.rainbow ? rainbowTriplet(c) : c)) : colors), [colors, live, t]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useRainbowColor(color) {
  const live = !!color?.rainbow;
  const t = useTick(live);
  return useMemo(() => (live ? rainbowTriplet(color) : color), [color, live, t]); // eslint-disable-line react-hooks/exhaustive-deps
}

import { useEffect, useState } from 'react';

const KEY = 'marralhinha:settings';
const LEGACY_MUTE_KEY = 'marralhinha:muted';
const DEFAULTS = { sound: 0.5, music: 0.5, autoRoll: false };

function load() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    // The old standalone mute button became "sounds at 0%"
    if (localStorage.getItem(LEGACY_MUTE_KEY) === '1') stored.sound = 0;
    localStorage.removeItem(LEGACY_MUTE_KEY);
  } catch {}
  return { ...DEFAULTS, ...stored };
}

let settings = load();
const listeners = new Set();

export const getSettings = () => settings;

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  listeners.forEach((fn) => fn(settings));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  const [value, setValue] = useState(settings);
  useEffect(() => onSettingsChange(setValue), []);
  return value;
}

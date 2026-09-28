import { useEffect, useState } from 'react';

const KEY = 'marralhinha:settings';
const DEFAULTS = { sound: 0.8, music: 0.6, autoRoll: false };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
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

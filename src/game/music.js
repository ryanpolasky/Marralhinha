import { getSettings, onSettingsChange } from './settings';

const MUSIC_GAIN = 0.5;

let track = null;
let hidden = false;
let duck = 1;
let duckTimer = null;
let fadeFrame = null;

const targetVolume = () => MUSIC_GAIN * getSettings().music * duck;

function applySettings() {
  if (!track) return;
  cancelAnimationFrame(fadeFrame);
  track.volume = targetVolume();
  if (hidden || getSettings().music <= 0) {
    track.pause();
  } else if (track.paused) {
    track.play().catch((error) => console.warn('Background music playback failed', error));
  }
}

function fadeTo(volume, ms) {
  if (!track) return;
  cancelAnimationFrame(fadeFrame);
  const from = track.volume;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    track.volume = Math.max(0, Math.min(1, from + (volume - from) * t));
    if (t < 1) fadeFrame = requestAnimationFrame(step);
  };
  fadeFrame = requestAnimationFrame(step);
}

// Softens the music under a fanfare (e.g. the win jingle), then fades it back
export function duckMusic(ms = 3000, level = 0.25) {
  if (!track) return;
  clearTimeout(duckTimer);
  duck = level;
  fadeTo(targetVolume(), 250);
  duckTimer = setTimeout(() => {
    duck = 1;
    fadeTo(targetVolume(), 1200);
  }, ms);
}

// Called on every user gesture: if an earlier play() was blocked by autoplay rules, the next gesture retries it
export function startMusic() {
  if (track) return applySettings();
  track = new Audio(`${process.env.PUBLIC_URL}/audio/marralhinha.mp3`);
  track.loop = true;
  track.preload = 'auto';
  applySettings();
  onSettingsChange(applySettings);
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    applySettings();
  });
}

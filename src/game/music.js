import { getSettings, onSettingsChange } from './settings';

const MUSIC_GAIN = 0.5;

let track = null;
let hidden = false;

function applySettings() {
  if (!track) return;
  track.volume = MUSIC_GAIN * getSettings().music;
  if (hidden || getSettings().music <= 0) {
    track.pause();
  } else if (track.paused) {
    track.play().catch((error) => console.warn('Background music playback failed', error));
  }
}

export function startMusic() {
  if (track) return;
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

import { getSettings, onSettingsChange } from './settings';

const BASE_GAIN = 0.55;

let ctx = null;
let master = null;

onSettingsChange((s) => {
  if (master) master.gain.value = BASE_GAIN * s.sound;
});

// One AudioContext shared by sound effects and music; created lazily on the first user gesture
export function audioContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = BASE_GAIN * getSettings().sound;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function audio() {
  if (getSettings().sound <= 0) return null;
  return audioContext();
}

export const unlockAudio = () => audioContext();

function tone({ freq, to = null, type = 'sine', dur = 0.15, vol = 0.2, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuffer = null;
function noise({ dur = 0.05, vol = 0.2, freq = 2000, to = null, q = 1.2, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t0);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

const jitter = (n, amt) => n * (1 + (Math.random() - 0.5) * amt);

export const sfx = {
  hop: () => {
    tone({ freq: jitter(2100, 0.2), type: 'triangle', dur: 0.05, vol: 0.07 });
    noise({ dur: 0.03, vol: 0.08, freq: 3500 });
  },
  clack: () => {
    tone({ freq: jitter(3300, 0.08), type: 'triangle', dur: 0.06, vol: 0.15 });
    tone({ freq: jitter(4700, 0.08), dur: 0.08, vol: 0.09, delay: 0.014 });
    noise({ dur: 0.022, vol: 0.2, freq: 6200, q: 1.6 });
    noise({ dur: 0.018, vol: 0.1, freq: 5200, q: 2, delay: 0.014 });
  },
  land: () => {
    tone({ freq: jitter(2600, 0.1), dur: 0.12, vol: 0.12 });
    tone({ freq: jitter(3900, 0.1), dur: 0.07, vol: 0.06 });
    noise({ dur: 0.04, vol: 0.12, freq: 4000 });
  },
  dice: () => {
    const hits = [0, 0.13, 0.3, 0.45, 0.58, 0.68, 0.76, 0.82];
    hits.forEach((d, i) => {
      noise({ dur: 0.05, vol: 0.28 * (1 - i / 10), freq: jitter(1600, 0.5), q: 2, delay: d });
      tone({ freq: jitter(700, 0.4), type: 'triangle', dur: 0.04, vol: 0.06, delay: d });
    });
  },
  // kind: 'mine' (you captured), 'victim' (you got captured) or 'other' (someone else's fight)
  capture: (kind = 'other') => {
    noise({ dur: 0.45, vol: 0.25, freq: 600, to: 3000, q: 0.8 });
    tone({ freq: 180, to: 45, type: 'sine', dur: 0.35, vol: kind === 'other' ? 0.25 : 0.35 });
    tone({ freq: 880, to: 220, type: 'square', dur: 0.25, vol: 0.04, delay: 0.05 });
    if (kind === 'mine') [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.12, delay: 0.18 + i * 0.06 }));
    if (kind === 'victim') {
      tone({ freq: 330, to: 220, type: 'triangle', dur: 0.3, vol: 0.13, delay: 0.25 });
      tone({ freq: 247, to: 147, type: 'triangle', dur: 0.5, vol: 0.13, delay: 0.55 });
    }
  },
  ping: (type = 'look', team = false) => {
    const vol = team ? 0.08 : 0.11;
    if (type === 'danger') [880, 660].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.12, vol: vol * 0.7, delay: i * 0.12 }));
    else if (type === 'ack') tone({ freq: 1320, type: 'triangle', dur: 0.08, vol: vol * 0.8 });
    else [1175, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.1, vol, delay: i * 0.06 }));
  },
  boardSwap: () => {
    noise({ dur: 0.7, vol: 0.14, freq: 500, to: 4200, q: 0.6 });
    [659, 988, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.07, delay: 0.12 + i * 0.07 }));
  },
  tick: (urgent = false) => {
    tone({ freq: urgent ? 1400 : 1000, type: 'square', dur: 0.035, vol: urgent ? 0.07 : 0.045 });
    noise({ dur: 0.02, vol: 0.06, freq: 3000, q: 3 });
  },
  pop: () => tone({ freq: 420, to: 980, dur: 0.13, vol: 0.18 }),
  home: () => [784, 988, 1319].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.14, delay: i * 0.08 })),
  turn: () => [880, 1319].forEach((f, i) => tone({ freq: f, dur: 0.35, vol: 0.13, delay: i * 0.12 })),
  six: () => [1047, 1319, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.1, delay: i * 0.05 })),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.16, delay: i * 0.13 }));
    [523, 659, 784, 1047].forEach((f) => tone({ freq: f, type: 'sine', dur: 1.2, vol: 0.08, delay: 0.6 }));
  },
  lose: () => [392, 330, 262].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.13, delay: i * 0.2 })),
  click: () => tone({ freq: 1200, dur: 0.04, vol: 0.06 }),
  coins: () => [1568, 2093, 2637].forEach((f, i) => tone({ freq: jitter(f, 0.03), type: 'triangle', dur: 0.09, vol: 0.08, delay: i * 0.05 })),
  boxShake: () => {
    for (let i = 0; i < 10; i++) {
      noise({ dur: 0.06, vol: 0.12 + i * 0.015, freq: jitter(900 + i * 80, 0.2), q: 3, delay: i * 0.12 });
      tone({ freq: 180 + i * 25, type: 'triangle', dur: 0.05, vol: 0.05, delay: i * 0.12 });
    }
    tone({ freq: 220, to: 880, type: 'sawtooth', dur: 1.2, vol: 0.03 });
  },
  reveal: (rarity) => {
    const notes = { common: [523, 659], rare: [523, 659, 784], epic: [523, 659, 784, 1047], legendary: [523, 659, 784, 1047, 1319, 1568], mythic: [392, 523, 659, 784, 1047, 1319, 1568, 2093] }[rarity] || [523];
    noise({ dur: 0.35, vol: 0.2, freq: 2500, to: 600, q: 0.7 });
    notes.forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.4, vol: 0.14, delay: 0.05 + i * 0.09 }));
    if (['epic', 'legendary', 'mythic'].includes(rarity)) notes.forEach((f) => tone({ freq: f / 2, type: 'sine', dur: 1.6, vol: 0.06, delay: 0.5 }));
    if (rarity === 'mythic') {
      tone({ freq: 65, to: 98, type: 'sawtooth', dur: 2.2, vol: 0.05, delay: 0.1 });
      [1047, 1319, 1568, 2093].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 1.2, vol: 0.05, delay: 1.0 + i * 0.12 }));
    }
  },
};

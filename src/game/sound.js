import { getSettings, onSettingsChange } from './settings';

const BASE_GAIN = 0.55;

let ctx = null;
let master = null;
let muffler = null;
let clear = null;

onSettingsChange((s) => {
  if (master) master.gain.value = BASE_GAIN * s.sound;
  if (clear) clear.gain.value = BASE_GAIN * s.sound;
});

// One AudioContext shared by sound effects and music; created lazily on the first user gesture
export function audioContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = BASE_GAIN * getSettings().sound;
    muffler = ctx.createBiquadFilter();
    muffler.type = 'lowpass';
    muffler.frequency.value = 20000;
    master.connect(muffler).connect(ctx.destination);
    // Skips the muffler, so the flashbang ring cuts through while everything else is underwater
    clear = ctx.createGain();
    clear.gain.value = BASE_GAIN * getSettings().sound;
    clear.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function audio() {
  if (getSettings().sound <= 0) return null;
  return audioContext();
}

export const unlockAudio = () => audioContext();

function tone({ freq, to = null, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, attack = 0.006, out = null }) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(out || master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A steady tone that holds at full volume before it fades, unlike tone() which starts dying right away
function ring({ freq, vol, hold, fade, delay = 0, type = 'sine', out = null }) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
  gain.gain.setValueAtTime(vol, t0 + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + hold + fade);
  osc.connect(gain).connect(out || master);
  osc.start(t0);
  osc.stop(t0 + hold + fade + 0.05);
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

// Recorded clips are decoded into the same AudioContext as every other effect, so they unlock and mix the same way
const samples = {};
const decoded = {};
export function loadSample(name) {
  const ac = audioContext();
  if (!ac) return Promise.resolve(null);
  samples[name] ??= fetch(`${process.env.PUBLIC_URL}/audio/${name}.mp3`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => new Promise((resolve, reject) => ac.decodeAudioData(data, resolve, reject)))
    .then((buffer) => (decoded[name] = buffer))
    .catch((error) => {
      console.warn(`Couldn't load ${name}.mp3`, error);
      delete samples[name];
      return null;
    });
  return samples[name];
}

// Plays right away if decoded; otherwise the fallback covers this time and the clip is ready for the next
function sample(name, vol = 1, fallback = null) {
  const ac = audio();
  if (!ac) return;
  const buffer = decoded[name];
  if (!buffer) {
    loadSample(name);
    fallback?.();
    return;
  }
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  src.buffer = buffer;
  gain.gain.value = vol;
  src.connect(gain).connect(master);
  src.start();
}

// Seconds into a clip where it first gets loud, so a hit in the file can be lined up with a beat
const onsets = {};
function onsetOf(name, buffer) {
  if (onsets[name] == null) {
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    let i = 0;
    while (i < data.length && Math.abs(data[i]) < peak * 0.25) i++;
    onsets[name] = Math.max(0, i / buffer.sampleRate - 0.01);
  }
  return onsets[name];
}

// Where flashbang.mp3 has settled into a clean, steady ring (seconds into the file), and roughly how long a loop to cut from it
const RING_FROM = 1.5;
const RING_LEN = 0.1;
const XFADE = 0.03;

const rmsAt = (x, s, len) => {
  let e = 0;
  for (let i = s; i < s + len; i++) e += x[i] * x[i];
  return Math.sqrt(e / len) || 1e-6;
};

// A loop of the ring whose length lands on a matching cycle, its own decay flattened out and the seam crossfaded, so it sustains with no click or pulse
let ringLoop = null;
function ringLoopOf(ac, buffer) {
  if (ringLoop?.source === buffer) return ringLoop;
  const sr = buffer.sampleRate;
  const a = Math.round(RING_FROM * sr);
  const probe = buffer.getChannelData(0);
  const n = Math.round(0.03 * sr);
  let best = { r: -2, lag: Math.round(RING_LEN * sr) };
  for (let lag = best.lag - 120; lag <= best.lag + 120; lag++) {
    let c = 0;
    let e0 = 0;
    let e1 = 0;
    for (let i = a; i < a + n; i++) {
      c += probe[i] * probe[i + lag];
      e0 += probe[i] * probe[i];
      e1 += probe[i + lag] * probe[i + lag];
    }
    const r = c / Math.sqrt(e0 * e1 + 1e-12);
    if (r > best.r) best = { r, lag };
  }
  const { lag } = best;
  const f = Math.round(XFADE * sr);
  const w = Math.round(0.02 * sr);
  const g = rmsAt(probe, a, w) / rmsAt(probe, a + lag - w, w);
  const loop = ac.createBuffer(buffer.numberOfChannels, lag, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const x = buffer.getChannelData(ch);
    const out = loop.getChannelData(ch);
    for (let i = 0; i < lag; i++) out[i] = (i < f ? x[a + i] * (i / f) + x[a + lag + i] * g * (1 - i / f) : x[a + i]) * g ** (i / lag);
  }
  ringLoop = { source: buffer, loop, at: (a + lag) / sr };
  return ringLoop;
}

// The recorded bang from its first transient, running straight into the looped ring, which holds then fades with the whiteout; false if not loaded yet
function flashClip({ vol = 1, hold, fade, out }) {
  const ac = audio();
  const buffer = decoded.flashbang;
  if (!ac || !buffer) {
    loadSample('flashbang');
    return false;
  }
  const from = onsetOf('flashbang', buffer);
  const { loop, at } = ringLoopOf(ac, buffer);
  const t0 = ac.currentTime + 0.02;
  const switchAt = t0 + (at - from);
  const end = t0 + hold + fade;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.setValueAtTime(vol, t0 + hold);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  gain.gain.linearRampToValueAtTime(0, end + 0.05);
  gain.connect(out);
  const head = ac.createBufferSource();
  head.buffer = buffer;
  head.connect(gain);
  head.start(t0, from, at - from);
  const ring = ac.createBufferSource();
  ring.buffer = loop;
  ring.loop = true;
  ring.connect(gain);
  ring.start(switchAt);
  ring.stop(end + 0.1);
  flashBus.sources = [head, ring];
  return true;
}

// Bus for the last flashbang's own audio, so cutting the bit can silence it
let flashBus = null;

// Pulls the table back out from underwater and kills any flashbang still ringing
export function stopFlashbang(fade = 0.3) {
  if (!ctx) return;
  const t = ctx.currentTime;
  muffler.frequency.cancelScheduledValues(t);
  muffler.frequency.setValueAtTime(muffler.frequency.value, t);
  muffler.frequency.exponentialRampToValueAtTime(20000, t + fade);
  if (!flashBus) return;
  const bus = flashBus;
  flashBus = null;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setValueAtTime(bus.gain.value, t);
  bus.gain.linearRampToValueAtTime(0, t + fade);
  (bus.sources || []).forEach((src) => src.stop(t + fade + 0.05));
  setTimeout(() => bus.disconnect(), (fade + 0.1) * 1000);
}

// A bus whose fade-out cuts off whatever was scheduled into it
function fader(ac, vol = 1) {
  const bus = ac.createGain();
  bus.gain.value = vol;
  bus.connect(master);
  const stop = (fade = 0.8) => {
    const t = ac.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => bus.disconnect(), (fade + 0.1) * 1000);
  };
  return { bus, stop };
}

// A longer clip that can start partway in (so late joiners stay on the beat) and fade out on demand; resolves to its stop()
export function playClip(name, { vol = 1, offset = 0, fallback = null } = {}) {
  return loadSample(name).then((buffer) => {
    const ac = audio();
    if (!ac) return () => {};
    if (!buffer) return fallback?.(ac) || (() => {});
    const at = typeof offset === 'function' ? offset() : offset;
    if (at >= buffer.duration) return () => {};
    const { bus, stop } = fader(ac, vol);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(bus);
    src.start(0, Math.max(0, at));
    return stop;
  });
}

// Stand-in brass for Gonna Fly Now when the real track isn't in public/audio
const A4 = 440;
const note = (semis) => A4 * 2 ** (semis / 12);
const FANFARE = [
  [0, 0.17], [0, 0.17], [4, 0.66], [2, 0.17], [2, 0.17], [5, 0.66], [4, 0.17], [4, 0.17], [7, 0.66], [5, 0.25], [4, 0.25], [2, 0.25], [0, 1.1],
];
export function fanfare(ac, bars = 4) {
  const { bus, stop } = fader(ac, 1);
  const barLen = FANFARE.reduce((sum, [, dur]) => sum + dur, 0) + 0.3;
  for (let bar = 0; bar < bars; bar++) {
    const lift = bar % 2 ? 2 : 0;
    const start = 0.05 + bar * barLen;
    let at = start;
    for (const [semis, dur] of FANFARE) {
      tone({ freq: note(semis + lift), type: 'sawtooth', dur: dur * 0.95, vol: 0.05, delay: at, attack: 0.02, out: bus });
      tone({ freq: note(semis + lift - 12), type: 'square', dur: dur * 0.9, vol: 0.025, delay: at, attack: 0.02, out: bus });
      at += dur;
    }
    for (let i = 0; i * 0.6 < barLen - 0.3; i++) tone({ freq: note(lift - 24 + (i % 2 ? 7 : 0)), type: 'triangle', dur: 0.5, vol: 0.08, delay: start + i * 0.6, out: bus });
  }
  return stop;
}

// Everything but the clear bus goes underwater, then surfaces over `sec`
export function muffle(sec = 6, delay = 0.06) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  muffler.frequency.cancelScheduledValues(t);
  muffler.frequency.setValueAtTime(260, t);
  muffler.frequency.setValueAtTime(260, t + sec * 0.35);
  muffler.frequency.exponentialRampToValueAtTime(20000, t + sec);
}

// Looping rain bed for the hit; a long noise buffer so the loop point doesn't flutter
let rain = null;
let rainBuffer = null;
export function setRain(on) {
  const ac = audio();
  if (on && !rain && ac) {
    if (!rainBuffer) {
      rainBuffer = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
      const data = rainBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = rainBuffer;
    src.loop = true;
    const high = ac.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 500;
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 2600;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ac.currentTime + 2.5);
    src.connect(high).connect(low).connect(gain).connect(master);
    src.start();
    rain = { src, gain };
  } else if (!on && rain) {
    const { src, gain } = rain;
    rain = null;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.stop(t + 1.3);
  }
}

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
  // Kill-effect accents; the base capture thump always plays too
  zap: () => {
    noise({ dur: 0.16, vol: 0.22, freq: 5200, to: 900, q: 1.4 });
    tone({ freq: 1800, to: 300, type: 'sawtooth', dur: 0.16, vol: 0.07 });
    tone({ freq: 2900, to: 1400, type: 'square', dur: 0.08, vol: 0.05, delay: 0.03 });
  },
  splash: () => {
    noise({ dur: 0.4, vol: 0.24, freq: 2400, to: 500, q: 0.7 });
    tone({ freq: 500, to: 180, type: 'sine', dur: 0.28, vol: 0.12 });
    noise({ dur: 0.12, vol: 0.1, freq: 4200, delay: 0.2 });
  },
  spooky: () => {
    tone({ freq: 620, to: 240, type: 'sine', dur: 0.9, vol: 0.1 });
    tone({ freq: 311, to: 466, type: 'sine', dur: 0.7, vol: 0.05, delay: 0.15 });
    noise({ dur: 0.7, vol: 0.06, freq: 5000, to: 1800, q: 2.5, delay: 0.1 });
  },
  glitch: () => {
    [1600, 400, 2400, 700, 3200].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.045, vol: 0.08, delay: i * 0.05 }));
    noise({ dur: 0.2, vol: 0.12, freq: 7000, to: 2500, q: 3 });
  },
  boom: () => {
    tone({ freq: 120, to: 38, type: 'sine', dur: 0.6, vol: 0.4 });
    noise({ dur: 0.5, vol: 0.3, freq: 300, to: 1400, q: 0.6 });
  },
  twinkle: () => [1568, 2093, 2637, 3136].forEach((f, i) => tone({ freq: jitter(f, 0.04), type: 'sine', dur: 0.16, vol: 0.09, delay: i * 0.07 })),
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
  // The dev hit bit: record scratch as the music dies, the cock, the shot, a sad note, and the tape rewinding on undo
  scratch: () => {
    noise({ dur: 0.22, vol: 0.22, freq: 3200, to: 500, q: 1.1 });
    tone({ freq: 520, to: 70, type: 'sawtooth', dur: 0.4, vol: 0.04 });
  },
  cock: () => {
    [0, 0.2].forEach((d, i) => {
      noise({ dur: 0.03, vol: 0.3, freq: i ? 4200 : 2600, q: 3, delay: d });
      tone({ freq: i ? 2400 : 1500, type: 'square', dur: 0.03, vol: 0.05, delay: d });
    });
  },
  gunshot: () =>
    sample('gunshot', 1.6, () => {
      noise({ dur: 0.3, vol: 0.6, freq: 2200, to: 300, q: 0.4 });
      tone({ freq: 160, to: 35, type: 'sine', dur: 0.45, vol: 0.6 });
      noise({ dur: 1.4, vol: 0.12, freq: 700, to: 160, q: 0.5, delay: 0.06 });
    }),
  rewind: () => {
    noise({ dur: 0.9, vol: 0.12, freq: 700, to: 6000, q: 1.5 });
    tone({ freq: 180, to: 1600, type: 'sawtooth', dur: 0.9, vol: 0.04 });
    [0.15, 0.32, 0.46, 0.57, 0.66, 0.73].forEach((d) => tone({ freq: jitter(2800, 0.3), type: 'square', dur: 0.025, vol: 0.04, delay: d }));
  },
  // The flashbang bit: pin, toss, the can bouncing, then the bang with everything muffled under a ringing ear
  pin: () => {
    tone({ freq: 4200, type: 'triangle', dur: 0.3, vol: 0.06 });
    tone({ freq: 6300, dur: 0.22, vol: 0.03, delay: 0.01 });
    noise({ dur: 0.04, vol: 0.12, freq: 5200, q: 3 });
  },
  toss: () => noise({ dur: 0.32, vol: 0.09, freq: 700, to: 2600, q: 0.9 }),
  tink: (vol = 1) => {
    tone({ freq: jitter(2900, 0.1), type: 'triangle', dur: 0.09, vol: 0.1 * vol });
    tone({ freq: jitter(4400, 0.1), dur: 0.06, vol: 0.05 * vol, delay: 0.008 });
    noise({ dur: 0.03, vol: 0.12 * vol, freq: 5200, q: 2 });
  },
  // The recorded bang over everything muffled; until it's loaded, a synth crack and tinnitus whine stand in
  // hold and fade match the whiteout: the ring sits at full while the screen is white and dies away as it clears
  flashbang: ({ hold = 2.2, fade = 5 } = {}) => {
    const ac = audio();
    if (!ac) return;
    stopFlashbang(0.05);
    muffle(hold + fade + 0.3);
    const out = (flashBus = ac.createGain());
    out.connect(clear);
    if (flashClip({ hold, fade, out })) return;
    noise({ dur: 0.12, vol: 1, freq: 4200, q: 0.25 });
    noise({ dur: 0.35, vol: 0.8, freq: 1600, to: 300, q: 0.3 });
    tone({ freq: 95, to: 32, type: 'sine', dur: 0.6, vol: 0.7 });
    noise({ dur: 1.2, vol: 0.12, freq: 600, to: 150, q: 0.4, delay: 0.04 });
    ring({ freq: 3520, vol: 0.24, hold, fade, delay: 0.03, out });
    ring({ freq: 3527, vol: 0.09, hold, fade, delay: 0.03, out });
    ring({ freq: 7040, vol: 0.015, hold: hold * 0.5, fade: fade * 0.5, delay: 0.03, out });
  },
  // A crowd going up as the run ends
  cheer: () => {
    for (let i = 0; i < 14; i++) noise({ dur: 1.6, vol: 0.07, freq: jitter(1100, 0.6), q: 0.6, delay: i * 0.22 });
    [0.3, 1.1, 2].forEach((d) => tone({ freq: 2200, to: 2900, dur: 0.35, vol: 0.03, delay: d }));
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

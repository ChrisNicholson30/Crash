import { getSettings } from './settings.ts';

/**
 * Small table sounds, synthesised on the fly (no audio files to download or
 * cache). Browsers only allow audio after a tap, so the context starts on the
 * first one.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (!getSettings().sound) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    if (getSettings().sound) audio();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

function tone(freq: number, at: number, dur: number, { type = 'sine' as OscillatorType, vol = 0.3, slide = 0 } = {}) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(at: number, dur: number, { vol = 0.25, freq = 3000, q = 0.8, type = 'bandpass' as BiquadFilterType } = {}) {
  const a = audio();
  if (!a || !master) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  /** A card laid down. */
  card: () => noise(0, 0.05, { vol: 0.35, freq: 2400, q: 1.2 }),
  /** Cards dealt round the table. */
  deal: () => {
    for (let i = 0; i < 6; i++) noise(i * 0.045, 0.04, { vol: 0.22, freq: 2200 + i * 120, q: 1.4 });
  },
  /** A card taken back. */
  lift: () => noise(0, 0.06, { vol: 0.2, freq: 1500, q: 1 }),
  /** Chips pushed in. */
  chip: () => {
    tone(2600, 0, 0.06, { type: 'triangle', vol: 0.12 });
    tone(3400, 0.035, 0.07, { type: 'triangle', vol: 0.1 });
  },
  /** Hands locked in. */
  lock: () => {
    tone(420, 0, 0.09, { type: 'square', vol: 0.06 });
    tone(630, 0.07, 0.12, { type: 'square', vol: 0.05 });
  },
  /** Hands turned over. */
  flip: () => noise(0, 0.18, { vol: 0.18, freq: 900, q: 0.5, type: 'highpass' }),
  /** You took the pot. */
  win: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.22, { type: 'triangle', vol: 0.16 })),
  /** You lost the hand. */
  lose: () => tone(180, 0, 0.22, { type: 'sine', vol: 0.18, slide: 0.6 }),
  /** Someone called Crash. */
  crash: () => {
    tone(90, 0, 0.5, { type: 'sawtooth', vol: 0.22, slide: 0.4 });
    noise(0, 0.35, { vol: 0.4, freq: 400, q: 0.4, type: 'lowpass' });
  },
  /** A Crash came off. */
  crashHit: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.3, { type: 'triangle', vol: 0.15 })),
  /** A Crash missed. */
  crashMiss: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.09, 0.28, { type: 'sawtooth', vol: 0.08 })),
  /** Your move. */
  turn: () => {
    tone(880, 0, 0.12, { vol: 0.14 });
    tone(1320, 0.1, 0.18, { vol: 0.12 });
  },
  /** A message arrived. */
  message: () => tone(1180, 0, 0.09, { vol: 0.1, slide: 1.3 }),
  /** A leg, set or game won. */
  fanfare: (big = false) => {
    const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, i * 0.1, 0.35, { type: 'triangle', vol: 0.15 }));
    if (big) tone(1047, notes.length * 0.1, 0.8, { type: 'triangle', vol: 0.12 });
  },
  /** Plain button tap. */
  tap: () => tone(1400, 0, 0.03, { type: 'triangle', vol: 0.06 }),
};

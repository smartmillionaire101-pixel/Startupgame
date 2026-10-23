/**
 * Table-game sounds, synthesised on the fly (no audio files): the click of
 * ball on ball, a cushion's thud, a ball dropping into a pocket, a cue
 * strike, the thump of a kick, the net and the crowd. Silent when the
 * player has switched Sound off in Settings, or where Web Audio is missing.
 */
let ctx: AudioContext | null = null;

function sound(): boolean {
  try {
    return localStorage.getItem('runway.sound') !== '0';
  } catch {
    return true;
  }
}
function audio(): AudioContext | null {
  if (!sound() || typeof AudioContext === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/** A short burst of filtered noise. */
function noise(at: number, dur: number, freq: number, q: number, gain: number) {
  const c = audio();
  if (!c) return;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  // A tiny LCG: noise needs no quality, only to differ each sample.
  let seed = (n * 7919) >>> 0;
  for (let i = 0; i < n; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    d[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / n) ** 2;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + at);
}
/** A pitched knock that dies away. */
function knock(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  const t0 = c.currentTime + at;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const vol = (speed: number, full: number) => Math.max(0.03, Math.min(1, speed / full));

export const sfx = {
  /** Ball on ball (speed in cm/s). */
  click(speed: number, at = 0) {
    const v = vol(speed, 400);
    knock(at, 2400 + v * 900, 0.05, 0.28 * v, 'triangle');
    noise(at, 0.03, 4200, 2, 0.25 * v);
  },
  cushion(speed: number, at = 0) {
    const v = vol(speed, 350);
    knock(at, 140, 0.12, 0.35 * v);
  },
  pocket(at = 0) {
    knock(at, 220, 0.18, 0.4, 'triangle');
    knock(at + 0.09, 160, 0.22, 0.3);
  },
  cue(power: number) {
    const v = vol(power, 100);
    knock(0, 900, 0.06, 0.25 + 0.3 * v, 'triangle');
    noise(0, 0.04, 2500, 1.5, 0.2 * v);
  },
  kick(power: number) {
    knock(0, 110, 0.16, 0.5 + 0.4 * power);
    noise(0, 0.05, 900, 1, 0.35);
  },
  net(at = 0) {
    noise(at, 0.35, 1800, 0.7, 0.25);
  },
  post(at = 0) {
    knock(at, 620, 0.5, 0.35, 'square');
    knock(at, 930, 0.4, 0.2);
  },
  glove(at = 0) {
    noise(at, 0.08, 600, 1.2, 0.5);
  },
  /** A bowling ball rolling down the lane (seconds). */
  roll(dur: number) {
    noise(0, dur, 160, 0.5, 0.2);
    knock(0, 70, Math.min(1.2, dur), 0.2);
  },
  /** Pins scattering (how many fell), at `at` seconds. */
  pins(n: number, at = 0) {
    if (n <= 0) return;
    for (let k = 0; k < Math.min(n, 7); k++)
      knock(at + k * 0.035, 640 + ((k * 137) % 400), 0.14, 0.18, 'triangle');
    noise(at, 0.45, 1500, 0.7, 0.1 + 0.03 * n);
  },
  /** The crowd: a roar for a goal, a groan for a miss. */
  crowd(cheer: boolean, at = 0) {
    noise(at, cheer ? 1.6 : 0.9, cheer ? 900 : 380, 0.4, cheer ? 0.35 : 0.22);
  },
};

/** Reduce motion: the Settings switch or the system preference. */
export function reduceMotion() {
  if (typeof window === 'undefined') return false;
  try {
    const set = localStorage.getItem('runway.reduceMotion');
    if (set === '1') return true;
    if (set === '0') return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* storage blocked */
  }
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

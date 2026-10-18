/**
 * Each venue's own music: a two-bar loop per genre (./nightlife.ts), rendered
 * on the device the first time you walk into a place that plays it, the way
 * ../music.ts renders the game's soundtrack. Tempo, drum pattern, hand drums,
 * bass, chords and lead differ per genre: amapiano's log drum, highlife's
 * interlocking guitars, a darbuka and an oud in maqam hijaz in Cairo, a
 * four-to-the-floor kick in a techno warehouse, a swung ride in a jazz bar.
 * No downloads, no audio services.
 *
 * It plays while you're inside, only when Music is on (Settings, or the ♫
 * toggle), and the background track goes quiet meanwhile.
 */
import { useEffect } from 'react';
import { duckMusic } from '../music';
import { GENRES, type GenreId, type Groove } from './nightlife';

const RATE = 22_050;
const STEPS = 32;
const cache = new Map<GenreId, Float32Array>();

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A scale degree (0…, past the scale's length goes up an octave) → MIDI. */
function degree(gr: Groove, d: number, octave = 0) {
  const n = gr.scale.length;
  return gr.root + gr.scale[((d % n) + n) % n]! + 12 * (Math.floor(d / n) + octave);
}

/** Render a genre's loop (mono, RATE Hz). Pure and deterministic. */
export function renderGroove(gr: Groove): Float32Array {
  const step = 60 / gr.bpm / 4;
  const len = Math.round(STEPS * step * RATE);
  const out = new Float32Array(len);
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  const at = (s: number) => (s + (s % 2 === 1 ? gr.swing : 0)) * step;
  const put = (start: number, dur: number, f: (t: number, i: number) => number) => {
    const o = Math.round(start * RATE);
    const n = Math.floor(dur * RATE);
    for (let i = 0; i < n; i++) {
      const k = (o + i) % len;
      out[k] = out[k]! + f(i / RATE, i);
    }
  };
  const each = (pat: string, fn: (s: number, accent: boolean) => void) => {
    for (let s = 0; s < STEPS; s++) {
      const c = pat[s];
      if (c === 'x' || c === 'o') fn(s, c === 'o');
    }
  };
  const env = (t: number, a: number, d: number) => Math.min(1, t / a) * Math.exp(-t / d);

  // ---- Drums.
  each(gr.kick, (s, acc) =>
    put(at(s), 0.32, (t) => {
      const ph = 2 * Math.PI * (46 * t + (64 / 30) * (1 - Math.exp(-t * 30)));
      return Math.sin(ph) * env(t, 0.002, 0.11) * (acc ? 0.62 : 0.5);
    }),
  );
  each(gr.snare, (s) => {
    let p = 0;
    put(at(s), 0.2, (t) => {
      const n = noise();
      const hp = n - p;
      p = n;
      return (hp * 0.16 + Math.sin(2 * Math.PI * 185 * t) * 0.12) * env(t, 0.001, 0.06);
    });
  });
  each(gr.clap, (s) => {
    for (const d of [0, 0.011, 0.022])
      put(at(s) + d, 0.14, (t) => noise() * 0.12 * env(t, 0.001, d === 0.022 ? 0.05 : 0.008));
  });
  each(gr.hat, (s, open) => {
    let p = 0;
    put(at(s), open ? 0.2 : 0.05, (t) => {
      const n = noise();
      const hp = n - p;
      p = n;
      return hp * 0.05 * env(t, 0.001, open ? 0.06 : 0.012);
    });
  });
  each(gr.shaker, (s, acc) => {
    let p = 0;
    put(at(s), 0.06, (t) => {
      const n = noise();
      const hp = n - p;
      p = n;
      return hp * (acc ? 0.045 : 0.025) * Math.min(1, t / 0.008) * Math.exp(-t / 0.02);
    });
  });
  each(gr.perc, (s, acc) => {
    // Hand drums: two pitches, a little bend (a talking drum, a darbuka's doum and tak).
    const f0 = gr.percHz * (s % 3 === 0 ? 1 : 1.5) * (acc ? 1.2 : 1);
    put(at(s), 0.22, (t) => {
      const f = f0 * (1 + 0.25 * Math.exp(-t * 25));
      return Math.sin(2 * Math.PI * f * t) * 0.13 * env(t, 0.002, 0.07);
    });
  });
  // ---- Amapiano's log drum: pitched, sliding, a little overdriven.
  if (gr.log) {
    let last = 0;
    each(gr.log, (s) => {
      const c = gr.bass[s];
      if (c && /\d/.test(c)) last = Number(c);
      const f = hz(degree(gr, last, -1));
      put(at(s), 0.5, (t) => {
        const ph = 2 * Math.PI * f * (t + 0.012 * (1 - Math.exp(-t * 40)));
        return Math.tanh(Math.sin(ph) * 2.2) * 0.2 * env(t, 0.003, 0.16);
      });
    });
  }
  // ---- Bass.
  for (let s = 0; s < STEPS; s++) {
    const c = gr.bass[s];
    if (!c || !/\d/.test(c)) continue;
    let held = 1;
    while (gr.bass[s + held] === '-') held++;
    const f = hz(degree(gr, Number(c), -1));
    const dur = held * step * 0.95;
    put(at(s), dur + 0.05, (t) => {
      const ph = 2 * Math.PI * f * t;
      const e = Math.min(1, t / 0.01) * Math.min(1, Math.max(0, (dur - t) / 0.04 + 1));
      return (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * 0.17 * e * Math.exp(-t * 1.5);
    });
  }
  // ---- Chords.
  if (gr.chordVoice !== 'none') {
    const bar = 16 * step;
    gr.chords.forEach((d, b) => {
      const notes = [0, 2, 4, 6].map((k) => hz(degree(gr, d + k)));
      if (gr.chordVoice === 'pad') {
        put(b * bar, bar, (t) => {
          const e = Math.min(1, t / 0.4) * Math.min(1, (bar - t) / 0.3);
          let v = 0;
          for (const f of notes)
            v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * 2 * t);
          return v * 0.018 * e;
        });
        return;
      }
      for (let s = b * 16; s < b * 16 + 16; s++) {
        if (gr.comp[s] !== 'x') continue;
        const long = gr.chordVoice === 'piano' ? 0.9 : gr.chordVoice === 'organ' ? 0.22 : 0.12;
        put(at(s), long + 0.1, (t) => {
          let v = 0;
          for (const f of notes) {
            const ph = 2 * Math.PI * f * t;
            v +=
              gr.chordVoice === 'stab'
                ? Math.sin(ph) + Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5
                : gr.chordVoice === 'organ'
                  ? Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)
                  : Math.sin(ph) + 0.4 * Math.sin(2 * ph) * Math.exp(-t * 6);
          }
          return v * 0.03 * env(t, 0.004, long * 0.45);
        });
      }
    });
  }
  // ---- Lead.
  if (gr.lead !== 'none') {
    for (let s = 0; s < STEPS; s++) {
      const c = gr.melody[s];
      if (!c || !/\d/.test(c)) continue;
      const oct = gr.lead === 'oud' ? 0 : 1;
      const f = hz(degree(gr, Number(c), oct));
      const start = at(s);
      if (gr.lead === 'guitar' || gr.lead === 'oud') {
        // Karplus-Strong: a plucked string.
        const period = Math.max(2, Math.round(RATE / f));
        const line = new Float32Array(period);
        for (let i = 0; i < period; i++) line[i] = noise() * 0.5;
        const damp = gr.lead === 'oud' ? 0.996 : 0.992;
        let k = 0;
        put(start, gr.lead === 'oud' ? 0.7 : 0.45, () => {
          const a = line[k]!;
          const b = line[(k + 1) % period]!;
          line[k] = ((a + b) / 2) * damp;
          k = (k + 1) % period;
          return a * (gr.lead === 'oud' ? 0.3 : 0.24);
        });
        continue;
      }
      put(start, 0.5, (t) => {
        const ph = 2 * Math.PI * f * t * (gr.lead === 'saw' ? 1 + 0.004 * Math.sin(t * 30) : 1);
        switch (gr.lead) {
          case 'square':
            return (
              (Math.sin(ph) + Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5) *
              0.06 *
              env(t, 0.003, 0.09)
            );
          case 'saw': {
            let v = 0;
            for (let h = 1; h <= 6; h++) v += Math.sin(h * ph) / h;
            return v * 0.045 * env(t, 0.004, 0.12);
          }
          case 'bell':
            return (Math.sin(ph) + 0.4 * Math.sin(2.76 * ph)) * 0.06 * env(t, 0.002, 0.18);
          case 'piano':
            return (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * 0.07 * env(t, 0.003, 0.2);
          default:
            // pluck: a marimba-ish tone.
            return (Math.sin(ph) + 0.2 * Math.sin(4 * ph)) * 0.08 * env(t, 0.002, 0.07);
        }
      });
    }
  }
  // Normalize.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0) {
    const k = 0.9 / peak;
    for (let i = 0; i < len; i++) out[i] = out[i]! * k;
  }
  return out;
}

export function genreSamples(id: GenreId): Float32Array {
  let s = cache.get(id);
  if (!s) {
    s = renderGroove(GENRES[id].groove);
    cache.set(id, s);
  }
  return s;
}

/** What's playing now (for tests and the "Now playing" chip). */
let playing: GenreId | null = null;
export const venueMusicNow = () => playing;

/**
 * Play a venue's genre while the scene is open (Music on). Browsers need a
 * gesture first: walking in usually was one; otherwise the next tap starts it.
 */
export function useVenueMusic(genre: GenreId | null, enabled: boolean) {
  useEffect(() => {
    if (!genre || !enabled || typeof AudioContext === 'undefined') return;
    let context: AudioContext | undefined;
    let source: AudioBufferSourceNode | undefined;
    let gain: GainNode | undefined;
    let disposed = false;
    duckMusic(true);
    const play = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      try {
        if (!context) {
          context = new AudioContext();
          const samples = genreSamples(genre);
          const buffer = context.createBuffer(1, samples.length, RATE);
          buffer.getChannelData(0).set(samples);
          source = context.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          gain = context.createGain();
          gain.gain.setValueAtTime(0, context.currentTime);
          gain.gain.linearRampToValueAtTime(0.32, context.currentTime + 1.2);
          source.connect(gain).connect(context.destination);
          source.start();
          playing = genre;
        }
        void context.resume().catch(() => {});
      } catch {
        // Sound never stops the game.
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void context?.suspend().catch(() => {});
      else if (context) play();
    };
    document.addEventListener('pointerdown', play);
    document.addEventListener('keydown', play);
    document.addEventListener('visibilitychange', visibility);
    if (navigator.userActivation?.hasBeenActive) play();
    return () => {
      disposed = true;
      duckMusic(false);
      if (playing === genre) playing = null;
      document.removeEventListener('pointerdown', play);
      document.removeEventListener('keydown', play);
      document.removeEventListener('visibilitychange', visibility);
      const c = context;
      const s = source;
      try {
        if (c && gain) gain.gain.setTargetAtTime(0, c.currentTime, 0.08);
      } catch {
        /* closed */
      }
      setTimeout(() => {
        try {
          s?.stop();
        } catch {
          /* never started */
        }
        void c?.close().catch(() => {});
      }, 350);
    };
  }, [genre, enabled]);
}

/**
 * Seeded, splittable pseudo-random number generation.
 *
 * Every random draw in the simulation comes from here so that a world can be
 * replayed exactly from its seed and command log (see docs/adr/0002).
 * `Math.random` is banned by lint in the engine.
 */

/** 32-bit FNV-1a hash of a string. Used to derive stable sub-seeds. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Pick one element uniformly. Throws on empty input. */
  pick<T>(items: readonly T[]): T;
  /** Approximately normal draw (Irwin–Hall, 6 uniforms). */
  normal(mean?: number, sd?: number): number;
  /** Fisher–Yates shuffle returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: tiny, fast, good enough statistical quality for games. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick on empty array');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    normal: (mean = 0, sd = 1) => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return mean + (s - 3) * sd * Math.SQRT2;
    },
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
  };
  return rng;
}

/**
 * Derive an independent RNG for a named purpose. Using labelled streams means
 * adding a new random draw in one system never shifts the draws of another.
 */
export function deriveRng(worldSeed: number, ...labels: (string | number)[]): Rng {
  return createRng(hashString(`${worldSeed}:${labels.join(':')}`));
}

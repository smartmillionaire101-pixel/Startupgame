/**
 * Golf and the mall: a short course at each city's golf club and a shopping
 * mall in each city (the client stands both on the map).
 *
 * - The course: three holes per city, laid out from the city's id (the same
 *   on the server and every client), played in the golf scene. The club is
 *   the city's golf landmark (data/landmarks.ts); its till takes the green
 *   fee when it's open.
 * - The mall: its shops and what they sell are in ./mall.ts (re-exported
 *   here).
 *
 * Names are generic and of their city, never real brands.
 */
import { hashString, createRng } from '../rng.js';
import type { MarketId } from './markets.js';
import { LANDMARKS } from './landmarks.js';

// ---------------------------------------------------------------- Golf

export interface GolfHole {
  /** 1-based. */
  n: number;
  par: 3 | 4 | 5;
  /** Tee to pin, metres. */
  length: number;
  /** Where the green sits sideways from the tee line, −1 (left) … 1 (right). */
  bend: number;
  /** Bunkers by the green (0–3) and one on the fairway (par 4 and 5). */
  bunkers: number;
  /** A pond short of the green. */
  water: boolean;
}

export interface GolfCourse {
  market: MarketId;
  name: string;
  holes: GolfHole[];
  par: number;
}

export const GOLF = {
  /** The green fee for three holes, in cost-of-living units. */
  feeCol: 0.03,
  /** Hours three holes take. */
  hours: 2,
  energy: -6,
  stress: -8,
  /** Extra calm for a round at or under par. */
  goodRoundStress: -3,
  fun: 12,
  social: 6,
  /** The chance you get talking with someone worth knowing (the first rounds a month). */
  meetChance: 0.45,
  meetRoundsPerMonth: 3,
  meetWarmth: 0.18,
  /** Strokes a hole counts at most (a pick-up). */
  maxStrokes: 10,
} as const;

/** Each city's three holes, from its id: the same everywhere. */
export function golfCourse(market: MarketId): GolfCourse {
  const r = createRng(hashString(`golf-course:${market}`));
  const pars: (3 | 4 | 5)[] = r.chance(0.5) ? [4, 3, 5] : [4, 5, 3];
  const holes = pars.map((par, i) => ({
    n: i + 1,
    par,
    length: Math.round(
      par === 3 ? r.range(120, 165) : par === 4 ? r.range(255, 330) : r.range(400, 450),
    ),
    bend: Math.round(r.range(-1, 1) * 100) / 100,
    bunkers: r.int(1, 3),
    water: par !== 4 && r.chance(0.5),
  }));
  const seed = (LANDMARKS[market] ?? []).find((l) => l.kind === 'golf-club');
  return {
    market,
    name: seed?.name ?? 'City Golf Club',
    holes,
    par: holes.reduce((s, h) => s + h.par, 0),
  };
}

export * from './mall.js';

/**
 * A penalty shootout, played out: the kick (where it's aimed, how hard, how
 * much curl), the keeper's dive, the woodwork, and the shootout's own rules
 * (five each, alternating, finished early once a side can't catch up, then
 * sudden death). Distances in metres, the goal seen from the penalty spot:
 * x across the goal (0 is the middle, the posts at ±3.66), y up from the
 * ground (the crossbar at 2.44).
 */
import type { Rng } from './rng.js';

export const GOAL_HALF = 3.66;
export const GOAL_H = 2.44;
export const FOOTBALL_R = 0.11;
export const SPOT = 11;
/** Kicks each in the regulation shootout. */
export const SHOOTOUT_KICKS = 5;
/** A shootout still level after this many kicks each is a draw (stakes refunded). */
export const SHOOTOUT_MAX_EACH = 15;

export interface Kick {
  /** Where the swipe aimed on the goal line (m). */
  x: number;
  y: number;
  /** 0 … 1: how hard. */
  power: number;
  /** −1 … 1: curl (positive bends to the right as the shooter sees it). */
  curve: number;
}

export type KickOutcome =
  'goal' | 'saved' | 'post' | 'bar' | 'post-in' | 'bar-in' | 'wide' | 'over' | 'none';

export interface KickResult {
  /** Where the ball crossed the goal line (m). */
  x: number;
  y: number;
  /** m/s off the boot. */
  speed: number;
  /** Seconds from the kick to the goal line. */
  time: number;
  outcome: KickOutcome;
  goal: boolean;
}

/**
 * The keeper's five dives (as the shooter sees the goal): top left, top
 * right, stay in the middle, bottom left, bottom right; where the keeper's
 * hands end up.
 */
export const DIVES: readonly (readonly [number, number])[] = [
  [-2.75, 1.85],
  [2.75, 1.85],
  [0, 1.25],
  [-2.95, 0.45],
  [2.95, 0.45],
];
/** The keeper's hands at the kick (m). */
const READY: readonly [number, number] = [0, 1.15];

/** The dive lane nearest to a point on the goal. */
export function laneOf(x: number, y: number) {
  if (Math.abs(x) < 1.0) return 2;
  return (y > 1.2 ? 0 : 3) + (x > 0 ? 1 : 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where the keeper's hands are `t` seconds after the kick, diving to `lane`. */
export function keeperAt(lane: number, t: number): [number, number] {
  const to = DIVES[lane] ?? READY;
  // A short read of the run-up, then the dive (quick at first, then the stretch).
  const f = clamp((t - 0.06) / 0.62, 0, 1);
  const e = 1 - (1 - f) * (1 - f);
  return [READY[0] + (to[0] - READY[0]) * e, READY[1] + (to[1] - READY[1]) * e];
}

/** The ball's flight: a kick reaches the goal line where it was aimed, plus its curl. */
export function kickFlight(k: Kick) {
  const speed = 17 + 15 * clamp(k.power, 0, 1);
  return { speed, time: SPOT / speed + Math.abs(k.curve) * 0.05 };
}

/**
 * Play a kick out against a dive (`dive` −1: nobody in goal). The shooter's
 * execution wobbles more the harder they hit it; a keeper going the right way
 * reaches what's within an arm's length of their dive, and a ball on the
 * woodwork sometimes goes in.
 */
export function resolveKick(rng: Rng, k: Kick | null, dive: number): KickResult {
  if (!k) return { x: 0, y: 0, speed: 0, time: 0, outcome: 'none', goal: false };
  const power = clamp(k.power, 0, 1),
    curve = clamp(k.curve, -1, 1);
  const { speed, time } = kickFlight(k);
  const sx = 0.1 + 0.55 * power * power + Math.abs(curve) * 0.12;
  const sy = 0.08 + 0.42 * power * power;
  const x = k.x + curve * 1.1 + rng.normal(0, sx);
  // Leaning back on a full-blooded strike lifts it.
  const y = Math.max(0, k.y + Math.max(0, power - 0.82) * 1.6 + rng.normal(0, sy));
  const ax = Math.abs(x);
  const out = (outcome: KickOutcome, goal = false): KickResult => ({
    x,
    y,
    speed,
    time,
    outcome,
    goal,
  });
  if (y > GOAL_H + FOOTBALL_R) return out('over');
  if (ax > GOAL_HALF + FOOTBALL_R) return out('wide');
  // The keeper gets there first if the ball is within reach of the dive.
  if (dive >= 0) {
    const [hx, hy] = keeperAt(dive, time);
    const reach = 0.82 - Math.max(0, speed - 24) * 0.012;
    const d = Math.hypot(x - hx, y - hy);
    // A keeper diving the wrong way can still stop one down the middle with the legs.
    const legs = dive !== 2 && ax < 0.45 && y < 0.7 && rng.chance(0.45);
    // Staying big in the middle covers the body.
    const body = dive === 2 && ax < 0.75 && y < 2.0;
    if (body || legs || d < reach - 0.18) return out('saved');
    if (d < reach && rng.chance(0.55)) return out('saved');
  }
  if (ax > GOAL_HALF - FOOTBALL_R)
    return ax < GOAL_HALF && rng.chance(0.5) ? out('post-in', true) : out('post');
  if (y > GOAL_H - FOOTBALL_R)
    return y < GOAL_H && rng.chance(0.35) ? out('bar-in', true) : out('bar');
  return out('goal', true);
}

/**
 * An AI keeper reads the run-up: often the right way (better keepers more,
 * curled and full-blooded kicks less), otherwise a guess.
 */
export function aiDive(rng: Rng, k: Kick | null, skill: number) {
  const guess = rng.int(0, 4);
  if (!k) return guess;
  const read = clamp(0.22 + skill - Math.abs(k.curve) * 0.18 - k.power * 0.12, 0.08, 0.7);
  return rng.chance(read) ? laneOf(k.x + k.curve * 1.1, k.y) : guess;
}

/** An AI penalty taker: picks a side and a height, mostly well inside the frame. */
export function aiKick(rng: Rng, skill: number): Kick {
  const side = rng.chance(0.5) ? -1 : 1;
  const middle = rng.chance(0.1);
  const high = rng.chance(0.4);
  return {
    x: middle ? rng.range(-0.4, 0.4) : side * rng.range(1.9, 3.1 + skill),
    y: high ? rng.range(1.4, 2.05) : rng.range(0.2, 0.8),
    power: rng.range(0.5, 0.82),
    curve: rng.range(-0.15, 0.15),
  };
}

/**
 * Is the shootout over after these kicks? Kicks alternate (A, B, A, B…).
 * Within the first five each it ends as soon as one side can't catch up;
 * after that, at the end of a round with the sides apart, or at the cap.
 */
export function shootoutOver(goals: readonly boolean[]) {
  let a = 0,
    b = 0,
    ka = 0,
    kb = 0;
  goals.forEach((g, i) => {
    if (i % 2 === 0) {
      ka++;
      if (g) a++;
    } else {
      kb++;
      if (g) b++;
    }
  });
  if (ka <= SHOOTOUT_KICKS && kb <= SHOOTOUT_KICKS) {
    const leftA = SHOOTOUT_KICKS - ka,
      leftB = SHOOTOUT_KICKS - kb;
    if (a > b + leftB || b > a + leftA) return true;
    return ka === SHOOTOUT_KICKS && kb === SHOOTOUT_KICKS && a !== b;
  }
  if (ka === kb && a !== b) return true;
  return ka >= SHOOTOUT_MAX_EACH && kb >= SHOOTOUT_MAX_EACH;
}

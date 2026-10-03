/**
 * Stars (§10): one public 0–5 rating.
 *
 * value = anchor + good − bad, where
 *  - anchor drifts toward what real performance justifies ("real performance
 *    pulls stars toward reality over time, with or without coverage"),
 *  - good coverage fades over a few months,
 *  - bad news weighs more than good and fades slowly, so recovery is slower than the fall.
 */
import { clamp, roundTo } from './math.js';
import type { StarState } from './types.js';

export const STAR_TUNING = {
  goodFade: 0.75,
  badFade: 0.94,
  badWeight: 1.5,
  anchorPull: 0.15,
  warningThreshold: 1.5,
  historyLength: 24,
} as const;

export function newStars(initial: number): StarState {
  return { value: initial, anchor: initial, good: 0, bad: 0, history: [initial] };
}

function recompute(s: StarState) {
  s.value = roundTo(clamp(s.anchor + s.good - s.bad, 0, 5), 2);
}

/** Apply a news or conduct event. Negative deltas are weighted heavier. */
export function applyStarEvent(s: StarState, delta: number): number {
  const before = s.value;
  if (delta >= 0) s.good += delta;
  else s.bad += -delta * STAR_TUNING.badWeight;
  recompute(s);
  return roundTo(s.value - before, 2);
}

/** Monthly drift: fade coverage, pull anchor toward performance. */
export function settleStars(s: StarState, performanceRating: number) {
  s.good *= STAR_TUNING.goodFade;
  s.bad *= STAR_TUNING.badFade;
  if (s.bad < 0.01) s.bad = 0;
  if (s.good < 0.01) s.good = 0;
  s.anchor += (clamp(performanceRating, 0, 5) - s.anchor) * STAR_TUNING.anchorPull;
  recompute(s);
  s.history.push(s.value);
  if (s.history.length > STAR_TUNING.historyLength) s.history.shift();
}

export const hasPublicWarning = (s: StarState) => s.value < STAR_TUNING.warningThreshold;

/** 0.5x at 0 stars → 1x at 2.5 → 1.5x at 5: the general "stars help" multiplier. */
export const starMultiplier = (stars: number) => 0.5 + clamp(stars, 0, 5) / 5;

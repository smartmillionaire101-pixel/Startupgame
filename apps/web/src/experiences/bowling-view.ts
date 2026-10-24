/**
 * Bowling on the phone (./Bowling.tsx): the swipe turned into a ball, the
 * guide line, what a roll's result reads as, and a pin's pose as it falls.
 * Pure: the unit tests check every helper.
 */
import { OIL_END, ballLineAt, launchOf, type BowlFrame, type BowlInput } from '@runway/engine';

export interface SwipePoint {
  x: number;
  y: number;
  t: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, k = 1000) => Math.round(v * k) / k || 0;

/**
 * A swipe up the screen as a ball: where the finger started across the
 * canvas is where you let go on the foul line, the swipe's direction is the
 * line, its speed the power, and its bow the hook (a swipe that bows right
 * and comes back left hooks left, as a right-hander's ball does). Null for a
 * tap or a swipe that doesn't go up the lane.
 */
export function swipeToBowl(width: number, pts: readonly SwipePoint[]): BowlInput | null {
  if (pts.length < 2) return null;
  const a = pts[0]!,
    b = pts[pts.length - 1]!;
  const up = a.y - b.y;
  if (up < 30) return null;
  const x = clamp(((a.x - width / 2) / (width / 2)) * 0.45, -0.45, 0.45);
  // The line: the swipe's angle, gentled (a lane is long and narrow).
  const aim = clamp(Math.atan2(b.x - a.x, up) * 0.09, -0.08, 0.08);
  const tail = pts.filter((p) => p.t >= b.t - 160);
  const p0 = tail[0] ?? a;
  const dt = Math.max(16, b.t - p0.t);
  const speed = Math.hypot(b.x - p0.x, b.y - p0.y) / dt;
  const power = clamp((speed - 0.3) / 1.6, 0.05, 1);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let bow = 0;
  for (const p of pts) {
    const cross = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    if (Math.abs(cross) > Math.abs(bow)) bow = cross;
  }
  // Bowing right of the straight line (cross > 0 going up the screen): out right, hooking left.
  const spin = clamp(-(bow / len) * 4, -1, 1);
  return { x: round(x), aim: round(aim, 10000), power: round(power, 100), spin: round(spin, 100) };
}

/** The guide: the ball's line down the oil (where it's heading), as [x, z] points. */
export function guideLine(i: BowlInput, to = OIL_END, step = 0.5): [number, number][] {
  const l = launchOf(i);
  const out: [number, number][] = [];
  for (let z = 0; z <= to + 1e-9; z += step) {
    const x = ballLineAt(l, z);
    if (x === null) break;
    out.push([x, z]);
  }
  return out;
}

/** The frame of a recorded roll at `t` seconds (the last one past the end). */
export function frameAt(frames: readonly BowlFrame[], t: number): BowlFrame | null {
  if (!frames.length) return null;
  let lo = 0,
    hi = frames.length - 1;
  if (t >= frames[hi]!.t) return frames[hi]!;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo]!;
}

export type RollCall = 'strike' | 'spare' | 'gutter' | 'split' | 'pins' | 'miss';

/**
 * What a roll reads as: a strike (all ten on a fresh rack), a spare (the
 * rest on the second ball), the gutter, a split (the head pin down and two
 * pins left standing apart), a count, or a miss.
 */
export function rollCall(standing: readonly number[], knocked: readonly number[], gutter: boolean) {
  const left = standing.filter((n) => !knocked.includes(n));
  if (!left.length && knocked.length)
    return standing.length === 10 ? ('strike' as const) : ('spare' as const);
  if (gutter && !knocked.length) return 'gutter' as const;
  if (!knocked.length) return 'miss' as const;
  if (standing.includes(1) && knocked.includes(1) && isSplit(left)) return 'split' as const;
  return 'pins' as const;
}

/** Pin neighbours (touching rows): a leave with a gap between its pins is a split. */
const NEAR: Record<number, number[]> = {
  1: [2, 3, 5],
  2: [1, 4, 5, 8],
  3: [1, 5, 6, 9],
  4: [2, 7, 8],
  5: [1, 2, 3, 8, 9],
  6: [3, 9, 10],
  7: [4],
  8: [2, 4, 5],
  9: [3, 5, 6],
  10: [6],
};

export function isSplit(left: readonly number[]) {
  if (left.length < 2) return false;
  // Joined pins (through neighbours) make one group; two groups or more is a split.
  const seen = new Set<number>([left[0]!]);
  const queue = [left[0]!];
  while (queue.length) {
    const n = queue.pop()!;
    for (const m of NEAR[n] ?? [])
      if (left.includes(m) && !seen.has(m)) {
        seen.add(m);
        queue.push(m);
      }
  }
  return seen.size < left.length;
}

/**
 * A pin's tilt `since` seconds after it was knocked (0 upright … π/2 lying),
 * falling faster the harder it went.
 */
export const pinTilt = (since: number) =>
  since <= 0 ? 0 : Math.min(Math.PI / 2, (Math.PI / 2) * Math.min(1, (since / 0.32) ** 1.6));

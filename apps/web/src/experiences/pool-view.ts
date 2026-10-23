/**
 * 8-ball pool on the phone: the table's layout on screen (portrait, the
 * break end nearest you), the cue gestures turned into a stroke, and the
 * engine's own simulation replayed frame by frame for the animation. Pure:
 * the unit tests check every helper.
 */
import {
  POOL_H,
  POOL_R,
  POOL_W,
  simulatePool,
  type PoolBall,
  type PoolEvent,
  type PoolShotLog,
} from '@runway/engine';

/** The wooden rail and cushion around the cloth (cm). */
export const RAIL = 13;

export interface TableLayout {
  /** CSS px per cm. */
  scale: number;
  /** The canvas size (CSS px). */
  width: number;
  height: number;
}

/** Fit the table (long side up the screen) into `maxW` × `maxH` CSS px. */
export function tableLayout(maxW: number, maxH: number): TableLayout {
  const scale = Math.max(0.5, Math.min(maxW / (POOL_H + 2 * RAIL), maxH / (POOL_W + 2 * RAIL)));
  return {
    scale,
    width: Math.round((POOL_H + 2 * RAIL) * scale),
    height: Math.round((POOL_W + 2 * RAIL) * scale),
  };
}

/** Table (cm, x along the table) to screen (CSS px): the head of the table at the bottom. */
export function toScreen(L: TableLayout, x: number, y: number): [number, number] {
  return [(RAIL + y) * L.scale, (RAIL + POOL_W - x) * L.scale];
}
/** Screen (CSS px) to table (cm). */
export function toTable(L: TableLayout, sx: number, sy: number): [number, number] {
  return [POOL_W - (sy / L.scale - RAIL), sx / L.scale - RAIL];
}
/** A direction on the table (radians) as a screen direction (unit vector). */
export function screenDir(angle: number): [number, number] {
  // x along the table runs up the screen; y across runs right.
  return [Math.sin(angle), -Math.cos(angle)];
}

/** The aim from the cue ball towards a point on the table. */
export function aimAt(cue: { x: number; y: number }, x: number, y: number) {
  return Math.atan2(y - cue.y, x - cue.x);
}

/** How far the cue is drawn back (CSS px) for full power. */
export const FULL_PULL = 150;

/**
 * Pulling the cue back: how far the finger has moved from where it pressed,
 * measured straight back along the aim (sideways movement doesn't count).
 * Returns the power, 0 … 100.
 */
export function pullPower(
  angle: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  full = FULL_PULL,
) {
  const [dx, dy] = screenDir(angle);
  const back = -((to.x - from.x) * dx + (to.y - from.y) * dy);
  return Math.max(0, Math.min(100, (back / full) * 100));
}

/** A tap on the spin pad (−1 … 1 each way, the pad's centre is 0) as follow/draw and side. */
export function spinFromPad(px: number, py: number) {
  const d = Math.hypot(px, py);
  const k = d > 1 ? 1 / d : 1;
  return { spin: Math.round(-py * k * 100) / 100, side: Math.round(px * k * 100) / 100 };
}

/** Is this screen point on the cue stick (behind the cue ball along the aim)? */
export function onCue(
  L: TableLayout,
  cue: { x: number; y: number },
  angle: number,
  sx: number,
  sy: number,
  reach = 24,
) {
  const [cx, cy] = toScreen(L, cue.x, cue.y);
  const [dx, dy] = screenDir(angle);
  const fx = sx - cx,
    fy = sy - cy;
  const along = -(fx * dx + fy * dy);
  const across = Math.abs(fx * dy - fy * dx);
  const near = Math.hypot(fx, fy) < Math.max(26, POOL_R * L.scale * 3);
  return near || (along > 0 && along < 170 && across < reach);
}

export interface PoolFrame {
  t: number;
  balls: PoolBall[];
}

/** The logged shot replayed by the engine's own physics: frames every 1/60 s, and its sounds. */
export function poolReplay(log: PoolShotLog): { frames: PoolFrame[]; events: PoolEvent[] } {
  if (!log.before || log.vx === undefined || log.vy === undefined)
    return { frames: [], events: [] };
  const frames: PoolFrame[] = [];
  const sim = simulatePool(log.before, log.vx, log.vy, log.spin ?? 0, log.side ?? 0, (t, balls) =>
    frames.push({ t, balls: balls.map((b) => ({ ...b })) }),
  );
  return { frames, events: sim.events };
}

/** The frame showing at `t` seconds into a replay. */
export function frameAt(frames: readonly PoolFrame[], t: number): PoolFrame | null {
  if (!frames.length) return null;
  const i = Math.min(frames.length - 1, Math.max(0, Math.round(t * 60)));
  return frames[i]!;
}

/** The real ball colours: 1 yellow, 2 blue, 3 red, 4 purple, 5 orange, 6 green, 7 maroon, 8 black. */
const COLOURS = [
  '#f6f3e8',
  '#f2c21b',
  '#1c4fb8',
  '#d0282c',
  '#5b2c8c',
  '#f07c1c',
  '#11804a',
  '#7b1f24',
];
export const ballColour = (id: number) =>
  id === 8 ? '#141414' : (COLOURS[id > 8 ? id - 8 : id] ?? COLOURS[0]!);
export const isStripe = (id: number) => id >= 9 && id <= 15;

/** The diamonds (sights) on the rails, in table cm along each rail. */
export const LONG_SIGHTS = [1, 2, 3, 5, 6, 7].map((k) => (POOL_W / 8) * k);
export const SHORT_SIGHTS = [1, 2, 3].map((k) => (POOL_H / 4) * k);

/**
 * The penalty shootout on the phone: a camera behind the spot (a simple
 * perspective: the goal 11 m away), the swipe turned into a kick, and the
 * ball's flight and the keeper's dive for the animation. Pure: the unit
 * tests check every helper.
 */
import { GOAL_H, GOAL_HALF, SPOT, keeperAt, type Kick, type KickOutcome } from '@runway/engine';

export interface Camera {
  width: number;
  height: number;
  /** Focal length (px). */
  f: number;
  /** Screen y of the horizon. */
  horizon: number;
  /** Camera height (m) and distance behind the goal line (m). */
  eyeY: number;
  eyeZ: number;
}

/**
 * The kicker's run-up before the ball flies (round 7e): `lead` ms on
 * screen, the boot meeting the ball `contact` s into the kicker's animation
 * (../experiences/game-avatar3d.ts: RUN_UP + CONTACT).
 */
export const KICK_RUN = { lead: 700, contact: 0.62 } as const;

/** The kicker's time in their animation (s; below 0: ready) `ms` after the kick began on screen. */
export function kickerTime(ms: number) {
  if (ms < 0) return -1;
  if (ms < KICK_RUN.lead) return (ms / KICK_RUN.lead) * KICK_RUN.contact;
  // After the strike, in the flight's slow motion.
  return KICK_RUN.contact + ((ms - KICK_RUN.lead) / 1000) * 0.6;
}

/** Where the kicker waits, two steps back from the ball (m from the goal line). */
export const KICKER_Z = SPOT + 0.92;

/**
 * A camera that fits the goal across ~84% of the canvas, from behind and
 * above the kicker (round 7e: you take the kick): high enough that the
 * kicker waiting behind the ball stands below the goal, not in front of
 * it, and the horizon set so their boots are just inside the bottom edge.
 */
export function camera(width: number, height: number, kicker = true): Camera {
  if (!kicker) {
    // Lite (no kicker drawn): low behind the spot, the goal big in the picture.
    const z = SPOT + 4.6;
    return {
      width,
      height,
      f: (width * 0.84 * z) / (2 * GOAL_HALF),
      horizon: height * 0.3,
      eyeY: 1.45,
      eyeZ: z,
    };
  }
  const eyeZ = SPOT + 11;
  const eyeY = 3.2;
  const f = (width * 0.84 * eyeZ) / (2 * GOAL_HALF);
  const feet = (eyeY * f) / (eyeZ - KICKER_Z);
  const horizon = Math.max(height * 0.08, Math.min(height * 0.3, height - 34 - feet));
  return { width, height, f, horizon, eyeY, eyeZ };
}

/** World (x across, y up, z from the goal line towards the camera) to screen, with the scale there. */
export function project(c: Camera, x: number, y: number, z: number) {
  const depth = Math.max(0.3, c.eyeZ - z);
  const k = c.f / depth;
  return { x: c.width / 2 + x * k, y: c.horizon - (y - c.eyeY) * k, k };
}

/** A screen point back onto the goal plane (z = 0). */
export function onGoalPlane(c: Camera, sx: number, sy: number) {
  const k = c.f / c.eyeZ;
  return { x: (sx - c.width / 2) / k, y: c.eyeY + (c.horizon - sy) / k };
}

export interface SwipePoint {
  x: number;
  y: number;
  t: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A swipe as a kick: where the finger let go is where it's aimed on the
 * goal (a short swipe, released below the goal, is driven along the ground
 * the way the finger was going), its speed is the power, and its bow is the
 * curl. Null for a tap or a swipe that doesn't go forward.
 */
export function swipeToKick(c: Camera, pts: readonly SwipePoint[]): Kick | null {
  if (pts.length < 2) return null;
  const a = pts[0]!,
    b = pts[pts.length - 1]!;
  const up = a.y - b.y;
  if (up < 24) return null;
  const goalLine = project(c, 0, 0, 0).y;
  let aim = onGoalPlane(c, b.x, b.y);
  if (b.y > goalLine) {
    // Released short of the goal: carry on along the swipe to the goal line.
    const s = (a.y - goalLine) / Math.max(1, up);
    aim = { x: onGoalPlane(c, a.x + (b.x - a.x) * s, goalLine).x, y: 0.15 };
  }
  // Speed over the last part of the swipe (px per ms).
  const tail = pts.filter((p) => p.t >= b.t - 140);
  const p0 = tail[0] ?? a;
  const dt = Math.max(16, b.t - p0.t);
  const speed = Math.hypot(b.x - p0.x, b.y - p0.y) / dt;
  const power = clamp((speed - 0.35) / 1.9, 0.05, 1);
  // The bow: how far the swipe strayed from the straight line, signed.
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  let bow = 0;
  for (const p of pts) {
    const cross = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    if (Math.abs(cross) > Math.abs(bow)) bow = cross;
  }
  // A swipe bowing right (cross > 0 on screen) sends the ball out right, curling back left.
  const curve = clamp(-(bow / len) * 3.2, -1, 1);
  const curl = Math.round(curve * 100) / 100 || 0;
  return {
    x: clamp(aim.x - curl * 1.1, -6, 6),
    y: clamp(aim.y, 0, 5),
    power: Math.round(power * 100) / 100,
    curve: curl,
  };
}

/** Where a kick is heading (as the keeper would read it). */
export const kickTarget = (k: Kick) => ({ x: k.x + k.curve * 1.1, y: k.y });

/**
 * The ball at `s` (0 at the spot, 1 at the goal line, beyond for what happens
 * next) on its way to `end`, curling with `curve`: x, y, z in metres.
 */
export function ballAt(
  end: { x: number; y: number },
  curve: number,
  power: number,
  outcome: KickOutcome,
  s: number,
) {
  const lift = 0.5 * (1 - power);
  const bend = curve * 1.1;
  const flight = (q: number) => ({
    x: q * (end.x - bend) + bend * q * q,
    y: Math.max(0.11, q * end.y + lift * 4 * q * (1 - q) + 0.11 * (1 - q)),
    z: SPOT * (1 - q),
  });
  if (s <= 1 || outcome === 'none') return flight(Math.min(1, s));
  const e = flight(1);
  const after = s - 1;
  const ease = (q: number) => 1 - (1 - q) * (1 - q);
  if (outcome === 'goal' || outcome === 'post-in' || outcome === 'bar-in') {
    // Into the net: on 1.6 m, slowing, dropping.
    const q = ease(Math.min(1, after * 2.5));
    return { x: e.x * (1 + 0.08 * q), y: Math.max(0.11, e.y * (1 - 0.6 * q)), z: -1.6 * q };
  }
  if (outcome === 'saved') {
    // Parried away: out and down.
    const q = ease(Math.min(1, after * 2));
    const side = e.x === 0 ? 1 : Math.sign(e.x);
    return { x: e.x + side * 2.6 * q, y: Math.max(0.11, e.y + 0.8 * q - 1.6 * q * q), z: 1.5 * q };
  }
  if (outcome === 'post' || outcome === 'bar') {
    // Back off the woodwork into play.
    const q = ease(Math.min(1, after * 2));
    return {
      x: e.x - Math.sign(e.x || 1) * 1.6 * q,
      y: Math.max(0.11, e.y - 1.7 * q),
      z: 4.5 * q,
    };
  }
  // Wide or over: on into the stand.
  const q = Math.min(1, after * 1.4);
  return { x: e.x * (1 + 0.15 * q), y: e.y + (outcome === 'over' ? 2.2 * q : 0.2 * q), z: -6 * q };
}

/** The keeper's hands and body tilt at `t` seconds after the kick, diving to `lane` (−1: still). */
export function keeperPose(lane: number, t: number) {
  const [hx, hy] = lane < 0 ? [0, 1.15] : keeperAt(lane, t);
  // The body leans from the feet towards the hands.
  const tilt = Math.atan2(hx, Math.max(0.15, hy + 0.2));
  const lift = Math.max(0, Math.min(0.9, Math.abs(hx) * 0.22 + (hy < 0.8 ? 0.1 : 0)));
  return { hands: { x: hx, y: hy }, tilt, lift };
}

/** Where the five dive zones sit on screen (for the keeper's buttons). */
export function diveZones(c: Camera) {
  const tl = project(c, -GOAL_HALF, GOAL_H, 0),
    br = project(c, GOAL_HALF, 0, 0);
  const w = br.x - tl.x,
    h = br.y - tl.y;
  return [
    { lane: 0, x: tl.x, y: tl.y, w: w * 0.36, h: h * 0.52 },
    { lane: 1, x: tl.x + w * 0.64, y: tl.y, w: w * 0.36, h: h * 0.52 },
    { lane: 2, x: tl.x + w * 0.36, y: tl.y, w: w * 0.28, h },
    { lane: 3, x: tl.x, y: tl.y + h * 0.52, w: w * 0.36, h: h * 0.48 },
    { lane: 4, x: tl.x + w * 0.64, y: tl.y + h * 0.52, w: w * 0.36, h: h * 0.48 },
  ];
}

/** A shootout's running score: each side's kicks (true goal, false miss), in order. */
export function shootoutCard(goals: readonly boolean[]) {
  const a: boolean[] = [],
    b: boolean[] = [];
  goals.forEach((g, i) => (i % 2 === 0 ? a : b).push(g));
  return { a, b, suddenDeath: a.length > 5 || b.length > 5 || (a.length === 5 && b.length === 5) };
}

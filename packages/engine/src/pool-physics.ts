/**
 * Wave 12 §A: pool table physics, shared by the server (which decides what a
 * shot did) and the client (which animates the very same simulation).
 *
 * Deterministic by construction: a fixed time step and only + − × ÷ and
 * `Math.sqrt`, which IEEE 754 defines exactly, so every JavaScript engine
 * computes the same positions from the same shot. The server's result is
 * still the truth: the client snaps to it when the animation ends.
 *
 * The table is a 7-foot bar table in centimetres, portrait: x across
 * (0 … W), y along (0 … L). The rack sits at the top (the foot spot, y = L/4),
 * the cue ball starts at the bottom (the head spot, y = 3L/4), and "the
 * kitchen" for ball in hand is everything below the head string.
 */

export const POOL_TABLE = {
  /** Cloth width and length, cm. */
  W: 99,
  L: 198,
  /** Ball radius, cm (57 mm balls). */
  R: 2.85,
  /** Corner and side pocket capture radii (distance from the pocket point). */
  cornerPocket: 6.2,
  sidePocket: 5.2,
  /** Pocket mouths: along the rail from a corner / either side of the middle, where there is no cushion. */
  cornerMouth: 7.5,
  sideMouth: 5.4,
} as const;

const { W, L, R } = POOL_TABLE;
export const HEAD_Y = L * 0.75;
export const FOOT_Y = L * 0.25;

/** Fastest cue ball speed, cm/s, at full power. */
export const POOL_MAX_SPEED = 620;
const DT = 1 / 400;
/** Rolling resistance (cm/s²) plus a little speed-proportional drag. */
const DECEL = 32;
const DRAG = 0.42;
const CUSHION = 0.74;
const BALL_E = 0.95;
const STOP = 1.2;
const MAX_STEPS = 400 * 16;
/** Follow (+) or draw (−) after the first contact, as a share of the cue ball's speed. */
const SPIN_EFFECT = 0.42;

/** Pocket points: four corners and the two sides. */
export const POCKETS: readonly { x: number; y: number; r: number; side: boolean }[] = [
  { x: -0.6, y: -0.6, r: POOL_TABLE.cornerPocket, side: false },
  { x: W + 0.6, y: -0.6, r: POOL_TABLE.cornerPocket, side: false },
  { x: -1.6, y: L / 2, r: POOL_TABLE.sidePocket, side: true },
  { x: W + 1.6, y: L / 2, r: POOL_TABLE.sidePocket, side: true },
  { x: -0.6, y: L + 0.6, r: POOL_TABLE.cornerPocket, side: false },
  { x: W + 0.6, y: L + 0.6, r: POOL_TABLE.cornerPocket, side: false },
];

/** A ball on the table: [number (0 = cue), x, y]. */
export type PoolBall = [number, number, number];

export interface PoolShot {
  /** Aim direction (any length; normalised here). */
  dx: number;
  dy: number;
  /** 0 … 1. */
  power: number;
  /** Top (+, follow) or back (−, draw) spin, −1 … 1. */
  spin?: number;
}

export interface PoolOutcome {
  /** Balls still on the table, rounded to 0.01 cm (the cue ball too unless it went in). */
  balls: PoolBall[];
  /** Balls potted, in order, with the pocket index. */
  potted: { n: number; pocket: number }[];
  /** The first ball the cue ball touched (null: it hit nothing). */
  firstHit: number | null;
  /** Any ball hit a cushion after the first contact. */
  railAfterContact: boolean;
  /** Whether the cue ball went in. */
  scratch: boolean;
  /** Simulated time, seconds. */
  time: number;
}

export interface PoolFrame {
  t: number;
  /** [n, x, y] for every ball still on the table at that moment. */
  balls: PoolBall[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The rack: 15 balls in a triangle, apex on the foot spot, the 8 in the middle. */
export function rackBalls(order?: readonly number[]): PoolBall[] {
  // Default order: corners of the back row are one solid and one stripe.
  const seq = order ?? [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 15, 7];
  const out: PoolBall[] = [[0, W / 2, HEAD_Y]];
  const rowStep = 2 * R * 0.8660254037844386 + 0.02;
  let k = 0;
  for (let row = 0; row < 5; row++)
    for (let i = 0; i <= row; i++) {
      const x = W / 2 + (i - row / 2) * (2 * R + 0.02);
      const y = FOOT_Y - row * rowStep;
      out.push([seq[k++]!, round2(x), round2(y)]);
    }
  return out;
}

/** Is (x, y) a legal place for the cue ball (on the cloth, clear of other balls, optionally in the kitchen)? */
export function cueSpotOk(balls: readonly PoolBall[], x: number, y: number, kitchen: boolean) {
  if (!(x >= R && x <= W - R && y >= R && y <= L - R)) return false;
  if (kitchen && y < HEAD_Y) return false;
  for (const [n, bx, by] of balls) {
    if (n === 0) continue;
    const ddx = bx - x;
    const ddy = by - y;
    if (ddx * ddx + ddy * ddy < 4 * R * R) return false;
  }
  return true;
}

interface Body {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  in: boolean;
}

/**
 * Simulate one shot from `balls` (the cue ball is ball 0). `frameEvery`
 * records positions every so many steps (for the client's animation).
 */
export function simulateShot(
  balls: readonly PoolBall[],
  shot: PoolShot,
  opts: { frameEvery?: number } = {},
): PoolOutcome & { frames: PoolFrame[] } {
  const bodies: Body[] = balls.map(([n, x, y]) => ({ n, x, y, vx: 0, vy: 0, in: false }));
  const cue = bodies.find((b) => b.n === 0);
  const frames: PoolFrame[] = [];
  const potted: PoolOutcome['potted'] = [];
  let firstHit: number | null = null;
  let railAfterContact = false;
  let spin = Math.max(-1, Math.min(1, shot.spin ?? 0));
  let dirX = 0;
  let dirY = 0;
  if (cue) {
    const len = Math.sqrt(shot.dx * shot.dx + shot.dy * shot.dy);
    if (len > 1e-9) {
      dirX = shot.dx / len;
      dirY = shot.dy / len;
      const speed = Math.max(0.03, Math.min(1, shot.power)) * POOL_MAX_SPEED;
      cue.vx = dirX * speed;
      cue.vy = dirY * speed;
    }
  }
  const record = (t: number) =>
    frames.push({ t, balls: bodies.filter((b) => !b.in).map((b) => [b.n, b.x, b.y]) });
  const every = opts.frameEvery ?? 0;
  if (every) record(0);
  let step = 0;
  for (; step < MAX_STEPS; step++) {
    let moving = false;
    // Move and slow down.
    for (const b of bodies) {
      if (b.in) continue;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp === 0) continue;
      const nsp = sp - (DECEL + DRAG * sp) * DT;
      if (nsp <= STOP) {
        b.vx = 0;
        b.vy = 0;
        continue;
      }
      const k = nsp / sp;
      b.vx *= k;
      b.vy *= k;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      moving = true;
    }
    // Pockets.
    for (const b of bodies) {
      if (b.in) continue;
      for (let p = 0; p < POCKETS.length; p++) {
        const pk = POCKETS[p]!;
        const ddx = b.x - pk.x;
        const ddy = b.y - pk.y;
        if (ddx * ddx + ddy * ddy < pk.r * pk.r) {
          b.in = true;
          b.vx = 0;
          b.vy = 0;
          potted.push({ n: b.n, pocket: p });
          break;
        }
      }
      // Escaped through a mouth without reaching the point: into the nearest pocket.
      if (!b.in && (b.x < -R || b.x > W + R || b.y < -R || b.y > L + R)) {
        let best = 0;
        let bd = Infinity;
        for (let p = 0; p < POCKETS.length; p++) {
          const pk = POCKETS[p]!;
          const d = (b.x - pk.x) * (b.x - pk.x) + (b.y - pk.y) * (b.y - pk.y);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        b.in = true;
        b.vx = 0;
        b.vy = 0;
        potted.push({ n: b.n, pocket: best });
      }
    }
    // Cushions (not across a pocket mouth).
    for (const b of bodies) {
      if (b.in) continue;
      const nearCornerY = b.y < POOL_TABLE.cornerMouth || b.y > L - POOL_TABLE.cornerMouth;
      const nearCornerX = b.x < POOL_TABLE.cornerMouth || b.x > W - POOL_TABLE.cornerMouth;
      const nearSide = b.y > L / 2 - POOL_TABLE.sideMouth && b.y < L / 2 + POOL_TABLE.sideMouth;
      let hit = false;
      if (b.x < R && b.vx < 0 && !nearCornerY && !nearSide) {
        b.x = R + (R - b.x);
        b.vx = -b.vx * CUSHION;
        b.vy *= 0.97;
        hit = true;
      } else if (b.x > W - R && b.vx > 0 && !nearCornerY && !nearSide) {
        b.x = W - R - (b.x - (W - R));
        b.vx = -b.vx * CUSHION;
        b.vy *= 0.97;
        hit = true;
      }
      if (b.y < R && b.vy < 0 && !nearCornerX) {
        b.y = R + (R - b.y);
        b.vy = -b.vy * CUSHION;
        b.vx *= 0.97;
        hit = true;
      } else if (b.y > L - R && b.vy > 0 && !nearCornerX) {
        b.y = L - R - (b.y - (L - R));
        b.vy = -b.vy * CUSHION;
        b.vx *= 0.97;
        hit = true;
      }
      if (hit && firstHit !== null) railAfterContact = true;
    }
    // Ball on ball.
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      if (a.in) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const c = bodies[j]!;
        if (c.in) continue;
        const ddx = c.x - a.x;
        const ddy = c.y - a.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = ddx / d;
        const ny = ddy / d;
        const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
        // Separate overlapping balls.
        const push = (2 * R - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        c.x += nx * push;
        c.y += ny * push;
        if (rel <= 0) continue;
        const cueA = a.n === 0;
        const cueC = c.n === 0;
        const cueSpeed = cueA || cueC ? Math.sqrt(cue!.vx * cue!.vx + cue!.vy * cue!.vy) : 0;
        const imp = ((1 + BALL_E) / 2) * rel;
        a.vx -= imp * nx;
        a.vy -= imp * ny;
        c.vx += imp * nx;
        c.vy += imp * ny;
        if (firstHit === null && (cueA || cueC)) {
          firstHit = cueA ? c.n : a.n;
          if (spin !== 0 && cue) {
            cue.vx += dirX * spin * cueSpeed * SPIN_EFFECT;
            cue.vy += dirY * spin * cueSpeed * SPIN_EFFECT;
            spin = 0;
          }
        }
        moving = true;
      }
    }
    if (every && (step + 1) % every === 0) record((step + 1) * DT);
    if (!moving) break;
  }
  const time = (step + 1) * DT;
  if (every) record(time);
  return {
    balls: bodies.filter((b) => !b.in).map((b) => [b.n, round2(b.x), round2(b.y)] as PoolBall),
    potted,
    firstHit,
    railAfterContact,
    scratch: potted.some((p) => p.n === 0),
    time,
    frames,
  };
}

export const isSolid = (n: number) => n >= 1 && n <= 7;
export const isStripe = (n: number) => n >= 9 && n <= 15;

/**
 * 8-ball pool on a 9-foot table: deterministic ball physics, the rules of a
 * frame and an AI player that plans real shots.
 *
 * Units are centimetres and seconds. The playing surface is 254 × 127 cm
 * (x along the table, the head string at x = 63.5, the foot spot at
 * x = 190.5). Balls are 57.15 mm across.
 *
 * The simulation uses only + − × ÷ and square roots inside its loop (no sin,
 * cos or atan2), so every JavaScript engine plays a shot to the same bits:
 * the server's result is the law, and the client replays the very same shot
 * from the logged cue-ball velocity for its animation.
 */
import type { Rng } from './rng.js';

export const POOL_W = 254;
export const POOL_H = 127;
export const POOL_R = 2.8575;
/** Along each rail from a corner, the corner pocket's mouth (no cushion). */
export const POOL_CORNER = 8.6;
/** Half the side pocket's mouth. */
export const POOL_SIDE = 6.8;
export const POOL_HEAD_X = 63.5;
export const POOL_FOOT: readonly [number, number] = [190.5, 63.5];
export const POOL_HEAD: readonly [number, number] = [63.5, 63.5];
/** Where an object ball is aimed to drop into each pocket (just past the mouth). */
export const POOL_POCKETS: readonly (readonly [number, number])[] = [
  [-1.2, -1.2],
  [POOL_W / 2, -2.2],
  [POOL_W + 1.2, -1.2],
  [-1.2, POOL_H + 1.2],
  [POOL_W / 2, POOL_H + 2.2],
  [POOL_W + 1.2, POOL_H + 1.2],
];
/** Rolling resistance: a constant part and a part that grows with speed (cm/s²). */
const DECEL = 22;
const DRAG = 0.2;
const BALL_E = 0.95;
const RAIL_E = 0.76;
const JAW_E = 0.55;
/** A shot never runs longer than this (seconds). */
const MAX_TIME = 24;

export interface PoolBall {
  id: number;
  x: number;
  y: number;
  value: number;
  potted: boolean;
}

export type PoolEvent =
  | { t: number; kind: 'ball'; a: number; b: number; speed: number }
  | { t: number; kind: 'rail'; id: number; speed: number }
  | { t: number; kind: 'pocket'; id: number; pocket: number; speed: number };

export interface PoolSim {
  balls: PoolBall[];
  /** The id of the first ball the cue ball touched (-1: none). */
  first: number;
  /** Balls potted, in order (0 is the cue ball). */
  pots: number[];
  /** Some ball touched a cushion after the first contact. */
  rail: boolean;
  /** Seconds until everything stopped. */
  time: number;
  /** Contacts, cushions and drops, for sounds (the first 160). */
  events: PoolEvent[];
}

/** How fast a stroke at `power` (5–100) sends the cue ball, in cm/s. */
export const poolSpeed = (power: number) => {
  const p = Math.max(0, Math.min(100, power)) / 100;
  return 40 + 860 * p * p;
};

/** Cushion noses: [axis, line, from, to] (axis 'y' is a long rail at y = line). */
const RAILS: readonly ['x' | 'y', number, number, number][] = [
  ['y', 0, POOL_CORNER, POOL_W / 2 - POOL_SIDE],
  ['y', 0, POOL_W / 2 + POOL_SIDE, POOL_W - POOL_CORNER],
  ['y', POOL_H, POOL_CORNER, POOL_W / 2 - POOL_SIDE],
  ['y', POOL_H, POOL_W / 2 + POOL_SIDE, POOL_W - POOL_CORNER],
  ['x', 0, POOL_CORNER, POOL_H - POOL_CORNER],
  ['x', POOL_W, POOL_CORNER, POOL_H - POOL_CORNER],
];
/** The pocket jaws: the ends of each cushion. */
const JAWS: readonly [number, number][] = RAILS.flatMap(([axis, line, a, b]) =>
  axis === 'y'
    ? ([
        [a, line],
        [b, line],
      ] as [number, number][])
    : ([
        [line, a],
        [line, b],
      ] as [number, number][]),
);

/** Which pocket a ball dropped into, from where it left the table. */
function pocketOf(x: number, y: number) {
  const top = y < POOL_H / 2;
  const col = x < POOL_W / 3 ? 0 : x > (2 * POOL_W) / 3 ? 2 : 1;
  return (top ? 0 : 3) + col;
}

/**
 * Play one shot out. `vx, vy` is the cue ball's starting velocity (cm/s);
 * `spin` is follow (+) or draw (−) and `side` is right (+) or left (−)
 * english, both −1 … 1. `sample` (optional) sees the balls every `every`
 * seconds of play, for animation.
 */
export function simulatePool(
  start: readonly PoolBall[],
  vx: number,
  vy: number,
  spin = 0,
  side = 0,
  sample?: (t: number, balls: readonly PoolBall[]) => void,
  every = 1 / 60,
): PoolSim {
  const balls = start.map((b) => ({ ...b }));
  const n = balls.length;
  const v = balls.map(() => ({ x: 0, y: 0 }));
  const cue = balls.findIndex((b) => b.id === 0);
  if (cue >= 0) v[cue] = { x: vx, y: vy };
  const R = POOL_R,
    D = 2 * R;
  let first = -1;
  let rail = false;
  const pots: number[] = [];
  const events: PoolEvent[] = [];
  const log = (e: PoolEvent) => {
    if (events.length < 160) events.push(e);
  };
  // The cue ball: how far it has travelled (natural roll builds up), its spin.
  let travelled = 0;
  let spinLeft = spin;
  let sideLeft = side;
  let t = 0;
  let nextSample = 0;
  if (sample) {
    sample(0, balls);
    nextSample = every;
  }
  while (t < MAX_TIME) {
    let max = 0;
    for (let i = 0; i < n; i++) {
      if (balls[i]!.potted) continue;
      const s = v[i]!.x * v[i]!.x + v[i]!.y * v[i]!.y;
      if (s > max) max = s;
    }
    max = Math.sqrt(max);
    if (max < 0.6) break;
    // Small enough steps that no ball moves more than 0.35 of its radius.
    const dt = Math.min(1 / 120, (0.35 * R) / max);
    t += dt;
    for (let i = 0; i < n; i++) {
      const b = balls[i]!,
        bv = v[i]!;
      if (b.potted) continue;
      const s = Math.sqrt(bv.x * bv.x + bv.y * bv.y);
      if (s === 0) continue;
      b.x += bv.x * dt;
      b.y += bv.y * dt;
      if (i === cue && first < 0) travelled += s * dt;
      const ns = s - (DECEL + DRAG * s) * dt;
      if (ns < 0.6) {
        bv.x = 0;
        bv.y = 0;
      } else {
        bv.x = (bv.x * ns) / s;
        bv.y = (bv.y * ns) / s;
      }
      // Off the table through a pocket mouth (cushions stop it everywhere else).
      if (b.x < 0 || b.x > POOL_W || b.y < 0 || b.y > POOL_H) {
        const inMouth =
          b.y < 0 || b.y > POOL_H
            ? b.x < POOL_CORNER ||
              b.x > POOL_W - POOL_CORNER ||
              Math.abs(b.x - POOL_W / 2) < POOL_SIDE
            : b.y < POOL_CORNER || b.y > POOL_H - POOL_CORNER;
        if (inMouth) {
          b.potted = true;
          pots.push(b.id);
          log({ t, kind: 'pocket', id: b.id, pocket: pocketOf(b.x, b.y), speed: s });
          bv.x = 0;
          bv.y = 0;
          continue;
        }
        // Squeezed past a jaw numerically: back onto the cloth.
        b.x = Math.max(R, Math.min(POOL_W - R, b.x));
        b.y = Math.max(R, Math.min(POOL_H - R, b.y));
      }
      // Cushions.
      for (const [axis, line, a, z] of RAILS) {
        const along = axis === 'y' ? b.x : b.y;
        if (along < a || along > z) continue;
        const pos = axis === 'y' ? b.y : b.x;
        const dist = line === 0 ? pos : line - pos;
        if (dist >= R || dist < -R) continue;
        const sign = line === 0 ? 1 : -1; // the normal, pointing onto the table
        const vn = (axis === 'y' ? bv.y : bv.x) * sign;
        if (vn >= 0) continue;
        const speed = -vn;
        let vtx = axis === 'y' ? bv.x : 0,
          vty = axis === 'y' ? 0 : bv.y;
        vtx *= 0.97;
        vty *= 0.97;
        let nx = 0,
          ny = 0;
        if (axis === 'y') ny = sign * speed * RAIL_E;
        else nx = sign * speed * RAIL_E;
        bv.x = vtx + nx;
        bv.y = vty + ny;
        // English: the cue ball's first cushions throw it along the rail.
        if (i === cue && sideLeft !== 0) {
          const k = sideLeft * 0.32 * speed;
          if (axis === 'y') bv.x += k * -sign;
          else bv.y += k * sign;
          sideLeft *= 0.5;
          if (Math.abs(sideLeft) < 0.05) sideLeft = 0;
        }
        if (axis === 'y') b.y = line === 0 ? R : POOL_H - R;
        else b.x = line === 0 ? R : POOL_W - R;
        if (first >= 0 || i !== cue) rail = rail || first >= 0;
        log({ t, kind: 'rail', id: b.id, speed });
      }
      // Jaws: the rounded ends of the cushions at each pocket.
      for (const [jx, jy] of JAWS) {
        const dx = b.x - jx,
          dy = b.y - jy,
          d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 === 0) continue;
        const d = Math.sqrt(d2),
          nx = dx / d,
          ny = dy / d;
        const vn = bv.x * nx + bv.y * ny;
        if (vn >= 0) continue;
        bv.x -= (1 + JAW_E) * vn * nx;
        bv.y -= (1 + JAW_E) * vn * ny;
        b.x = jx + nx * R;
        b.y = jy + ny * R;
        if (first >= 0) rail = true;
        log({ t, kind: 'rail', id: b.id, speed: -vn });
      }
    }
    // Ball on ball: equal masses, nearly elastic.
    for (let i = 0; i < n; i++) {
      const a = balls[i]!;
      if (a.potted) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j]!;
        if (b.potted) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (dx > D || dx < -D || dy > D || dy < -D) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D * D || d2 === 0) continue;
        const d = Math.sqrt(d2),
          nx = dx / d,
          ny = dy / d,
          av = v[i]!,
          bv = v[j]!;
        const rel = (av.x - bv.x) * nx + (av.y - bv.y) * ny;
        if (rel > 0) {
          const preX = av.x,
            preY = av.y,
            cueHit = first < 0 && (i === cue || j === cue);
          const k = ((1 + BALL_E) / 2) * rel;
          av.x -= k * nx;
          av.y -= k * ny;
          bv.x += k * nx;
          bv.y += k * ny;
          if (cueHit) {
            first = i === cue ? b.id : a.id;
            // Follow or draw: after the first contact the cue ball's spin
            // takes it on (or back) along the line it came in on. A ball
            // struck in the middle has picked up natural roll on the way.
            const cv = i === cue ? { x: preX, y: preY } : { x: bv.x - k * nx, y: bv.y - k * ny };
            const roll = Math.min(1, travelled / 55) * 0.28;
            const fade = Math.max(0.3, 1 - travelled / 420);
            const eff = Math.max(-1, Math.min(1, spinLeft * fade + roll));
            const target = i === cue ? av : bv;
            target.x += eff * 0.55 * cv.x;
            target.y += eff * 0.55 * cv.y;
            spinLeft = 0;
          }
          log({ t, kind: 'ball', a: a.id, b: b.id, speed: rel });
        }
        const push = (D - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
    if (sample)
      while (t >= nextSample) {
        sample(nextSample, balls);
        nextSample += every;
      }
  }
  if (sample) sample(t, balls);
  return { balls, first, pots, rail, time: t, events };
}

// ---------------------------------------------------------------- The rack

export type PoolGroup = 'solids' | 'stripes';
export const inGroup = (id: number, g: PoolGroup) =>
  g === 'solids' ? id >= 1 && id <= 7 : id >= 9 && id <= 15;
export const groupOf = (id: number): PoolGroup | null =>
  id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : null;

/**
 * A racked frame: the cue ball on the head spot, the triangle's apex on the
 * foot spot, the 8 in the middle of the third row, a solid and a stripe in
 * the back corners and the rest shuffled.
 */
export function poolRack(rng: Rng): PoolBall[] {
  const solids = rng.shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = rng.shuffle([9, 10, 11, 12, 13, 14, 15]);
  const cornerSolid = solids.pop()!,
    cornerStripe = stripes.pop()!;
  const rest = rng.shuffle([...solids, ...stripes]);
  const flip = rng.chance(0.5);
  const balls: PoolBall[] = [{ id: 0, x: POOL_HEAD[0], y: POOL_HEAD[1], value: 0, potted: false }];
  const gap = 2 * POOL_R + 0.02;
  const row = gap * Math.sqrt(3) * 0.5;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c <= r; c++) {
      let id: number;
      if (r === 2 && c === 1) id = 8;
      else if (r === 4 && c === 0) id = flip ? cornerStripe : cornerSolid;
      else if (r === 4 && c === 4) id = flip ? cornerSolid : cornerStripe;
      else id = rest.pop()!;
      balls.push({
        id,
        x: POOL_FOOT[0] + r * row,
        y: POOL_FOOT[1] + (c - r / 2) * gap,
        value: id,
        potted: false,
      });
    }
  return balls.sort((a, b) => a.id - b.id);
}

/** The nearest free spot to (x, y), searched along the table's long axis then outwards. */
export function freeSpot(
  balls: readonly PoolBall[],
  self: number,
  x: number,
  y: number,
  kitchen = false,
): [number, number] {
  const R = POOL_R;
  const maxX = kitchen ? POOL_HEAD_X : POOL_W - R;
  const clampX = (q: number) => Math.max(R, Math.min(maxX, q));
  const clampY = (q: number) => Math.max(R, Math.min(POOL_H - R, q));
  const free = (px: number, py: number) =>
    balls.every(
      (o) =>
        o.id === self ||
        o.potted ||
        (o.x - px) * (o.x - px) + (o.y - py) * (o.y - py) >= (2 * R + 0.05) ** 2,
    );
  const x0 = clampX(x),
    y0 = clampY(y);
  if (free(x0, y0)) return [x0, y0];
  for (let ring = 1; ring < 60; ring++)
    for (let k = 0; k < 8 * ring; k++) {
      const a = (k / (8 * ring)) * 2 * Math.PI;
      const px = clampX(x0 + Math.cos(a) * ring * R),
        py = clampY(y0 + Math.sin(a) * ring * R);
      if (free(px, py)) return [px, py];
    }
  return [x0, y0];
}

// ---------------------------------------------------------------- Planning a shot

export interface PoolPlan {
  angle: number;
  power: number;
  spin: number;
  side: number;
  /** Where to put the cue ball first (ball in hand only). */
  cue?: { x: number; y: number };
  /** The ball and pocket it plays for (-1: a safety). */
  target: number;
  pocket: number;
}

/** Shortest distance from p to segment a–b. */
function seg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** How far a ball rolls from `speed` until it stops (cm), under the table's friction. */
export function rollDistance(speed: number) {
  let s = speed,
    d = 0;
  const dt = 1 / 120;
  while (s > 0.6) {
    d += s * dt;
    s -= (DECEL + DRAG * s) * dt;
  }
  return d;
}
/** The speed a ball needs to roll `dist` cm and still have `end` cm/s left. */
function speedFor(dist: number, end = 0) {
  let lo = end,
    hi = 1500;
  const extra = end > 0 ? rollDistance(end) : 0;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (rollDistance(mid) - extra < dist) lo = mid;
    else hi = mid;
  }
  return hi;
}
/** The stroke power (5–100) that sends the cue ball at `speed`. */
export function powerFor(speed: number) {
  const p = 100 * Math.sqrt(Math.max(0, speed - 40) / 860);
  return Math.max(5, Math.min(100, p));
}

interface Candidate {
  target: number;
  pocket: number;
  angle: number;
  power: number;
  score: number;
}

/** Every straight pot the cue ball at (cx, cy) can see, best first. */
function pots(balls: readonly PoolBall[], cx: number, cy: number, targets: readonly number[]) {
  const R = POOL_R;
  const out: Candidate[] = [];
  for (const id of targets) {
    const b = balls.find((o) => o.id === id && !o.potted);
    if (!b) continue;
    POOL_POCKETS.forEach(([px, py], pocket) => {
      const tx = px - b.x,
        ty = py - b.y,
        d2 = Math.hypot(tx, ty);
      if (d2 < 0.5) return;
      const ux = tx / d2,
        uy = ty / d2;
      // A side pocket only takes balls coming at it fairly square.
      if ((pocket === 1 || pocket === 4) && Math.abs(uy) < 0.55) return;
      const gx = b.x - ux * 2 * R,
        gy = b.y - uy * 2 * R;
      const ax = gx - cx,
        ay = gy - cy,
        d1 = Math.hypot(ax, ay);
      if (d1 < 0.5) return;
      const cut = (ax * ux + ay * uy) / d1;
      if (cut < 0.18) return;
      const blocked = balls.some(
        (o) =>
          !o.potted &&
          o.id !== 0 &&
          o.id !== b.id &&
          (seg(o.x, o.y, cx, cy, gx, gy) < 2 * R - 0.05 ||
            seg(o.x, o.y, b.x, b.y, px, py) < 2 * R - 0.05),
      );
      if (blocked) return;
      // The object ball needs pace to reach the pocket (and a little more);
      // the cue ball loses some of its pace in the cut.
      const obj = speedFor(d2 + 18, 20);
      const atImpact = obj / Math.max(0.3, cut) / ((1 + BALL_E) / 2);
      const speed = Math.min(880, speedFor(d1, atImpact));
      const score = cut * 2.2 - d1 / 260 - d2 / 200 - (pocket === 1 || pocket === 4 ? 0.25 : 0);
      out.push({
        target: id,
        pocket,
        angle: Math.atan2(ay, ax),
        power: powerFor(speed),
        score,
      });
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

const withCue = (balls: readonly PoolBall[], x: number, y: number) =>
  balls.map((b) => (b.id === 0 ? { ...b, x, y, potted: false } : { ...b }));

/** Is this shot's first contact legal (a ball on)? */
const legalFirst = (sim: PoolSim, targets: readonly number[]) => targets.includes(sim.first);

/**
 * The best shot for the player at the table: the pot that works when played
 * out (the simulation checks the ball drops and the cue ball stays up), or a
 * safe contact on a ball on when nothing is on. With ball in hand it first
 * places the cue ball behind the easiest pot.
 */
export function poolPlan(
  balls: readonly PoolBall[],
  targets: readonly number[],
  inHand: 'kitchen' | 'table' | null,
  breakShot = false,
): PoolPlan {
  const cueBall = balls.find((b) => b.id === 0)!;
  if (breakShot) {
    // Break from the head spot (or just off it), full on the apex ball.
    const cx = POOL_HEAD[0] - 8,
      cy = POOL_HEAD[1] + 6;
    const apex = balls
      .filter((b) => b.id !== 0 && !b.potted)
      .reduce((m, b) => (b.x < m.x ? b : m), balls[1]!);
    return {
      angle: Math.atan2(apex.y - cy, apex.x - cx),
      power: 100,
      spin: 0.1,
      side: 0,
      cue: inHand ? { x: cx, y: cy } : undefined,
      target: apex.id,
      pocket: -1,
    };
  }
  let cx = cueBall.x,
    cy = cueBall.y,
    placed: { x: number; y: number } | undefined;
  if (inHand) {
    // Try positions behind each ball on, along its line to each pocket.
    let best: { x: number; y: number; score: number } | null = null;
    for (const id of targets) {
      const b = balls.find((o) => o.id === id && !o.potted);
      if (!b) continue;
      POOL_POCKETS.forEach(([px, py], pocket) => {
        const tx = px - b.x,
          ty = py - b.y,
          d = Math.hypot(tx, ty);
        if ((pocket === 1 || pocket === 4) && Math.abs(ty / d) < 0.6) return;
        for (const back of [32, 55, 22]) {
          const qx = b.x - (tx / d) * (2 * POOL_R + back),
            qy = b.y - (ty / d) * (2 * POOL_R + back);
          if (qx < POOL_R + 2 || qx > POOL_W - POOL_R - 2) continue;
          if (qy < POOL_R + 2 || qy > POOL_H - POOL_R - 2) continue;
          if (inHand === 'kitchen' && qx > POOL_HEAD_X) continue;
          const [fx, fy] = freeSpot(balls, 0, qx, qy, inHand === 'kitchen');
          const c = pots(withCue(balls, fx, fy), fx, fy, [id])[0];
          if (c && (!best || c.score > best.score)) best = { x: fx, y: fy, score: c.score };
          if (c) break;
        }
      });
    }
    const spot = best ?? {
      x: inHand === 'kitchen' ? POOL_HEAD[0] : cueBall.x,
      y: POOL_HEAD[1],
    };
    const [fx, fy] = freeSpot(balls, 0, spot.x, spot.y, inHand === 'kitchen');
    cx = fx;
    cy = fy;
    placed = { x: fx, y: fy };
  }
  const table = withCue(balls, cx, cy);
  const speedOf = (p: number) => poolSpeed(p);
  // Play the most promising pots out; keep the first that drops cleanly.
  for (const c of pots(table, cx, cy, targets).slice(0, 7)) {
    for (const spin of [0, -0.35, 0.35]) {
      const s = speedOf(c.power);
      const sim = simulatePool(table, Math.cos(c.angle) * s, Math.sin(c.angle) * s, spin, 0);
      const scratch = sim.pots.includes(0);
      const eight = sim.pots.includes(8) && !targets.includes(8);
      if (legalFirst(sim, targets) && sim.pots.includes(c.target) && !scratch && !eight)
        return { ...c, power: Math.round(c.power), spin, side: 0, cue: placed };
    }
  }
  // Nothing on: a safety. Roll into the nearest ball on and send it to a cushion.
  const ons = targets
    .map((id) => table.find((b) => b.id === id && !b.potted))
    .filter((b): b is PoolBall => !!b)
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  for (const b of ons)
    for (const off of [0, 0.03, -0.03, 0.07, -0.07, 0.12, -0.12]) {
      const angle = Math.atan2(b.y - cy, b.x - cx) + off;
      for (const power of [38, 55]) {
        const s = speedOf(power);
        const sim = simulatePool(table, Math.cos(angle) * s, Math.sin(angle) * s, 0, 0);
        if (legalFirst(sim, targets) && sim.rail && !sim.pots.includes(0)) {
          const eight = sim.pots.includes(8) && !targets.includes(8);
          if (!eight)
            return { angle, power, spin: 0, side: 0, cue: placed, target: -1, pocket: -1 };
        }
      }
    }
  const near = ons[0];
  return {
    angle: near ? Math.atan2(near.y - cy, near.x - cx) : 0,
    power: 45,
    spin: 0,
    side: 0,
    cue: placed,
    target: -1,
    pocket: -1,
  };
}

/** The aiming guide: where the cue ball first touches a ball or cushion along `angle`. */
export function poolAim(balls: readonly PoolBall[], angle: number, cx?: number, cy?: number) {
  const cue = balls.find((b) => b.id === 0)!;
  const x0 = cx ?? cue.x,
    y0 = cy ?? cue.y;
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  const R = POOL_R;
  let best = Infinity,
    hit: PoolBall | null = null;
  for (const b of balls) {
    if (b.id === 0 || b.potted) continue;
    const fx = b.x - x0,
      fy = b.y - y0;
    const along = fx * ux + fy * uy;
    if (along <= 0) continue;
    const perp2 = fx * fx + fy * fy - along * along;
    if (perp2 >= 4 * R * R) continue;
    const d = along - Math.sqrt(4 * R * R - perp2);
    if (d < best) {
      best = d;
      hit = b;
    }
  }
  // The cushion line the cue ball's centre would reach.
  const wall = Math.min(
    ux > 0 ? (POOL_W - R - x0) / ux : ux < 0 ? (R - x0) / ux : Infinity,
    uy > 0 ? (POOL_H - R - y0) / uy : uy < 0 ? (R - y0) / uy : Infinity,
  );
  if (!hit || wall < best)
    return { ghost: { x: x0 + ux * wall, y: y0 + uy * wall }, ball: null, dir: null };
  const gx = x0 + ux * best,
    gy = y0 + uy * best;
  const nx = (hit.x - gx) / (2 * R),
    ny = (hit.y - gy) / (2 * R);
  return { ghost: { x: gx, y: gy }, ball: hit.id, dir: { x: nx, y: ny } };
}

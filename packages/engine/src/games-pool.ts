/**
 * Wave 12 §A: eight-ball pool, head to head. The shooter sends an aim, a
 * power and a spin; the server runs the shared physics (`pool-physics.ts`)
 * and applies the rules, so a client can never claim a pot it didn't make.
 *
 * Rules (bar rules, kept short): the break is free and the table stays open;
 * the first ball legally potted after the break gives you solids or stripes.
 * Pot one of yours and you go again. Fouls (the cue ball in a pocket, hitting
 * nothing, or hitting the wrong ball first) give the other player the cue
 * ball in hand anywhere. Clear your group, then pot the 8 to win; pot the 8
 * early (or scratch on it) and you lose. Three fouls in a row lose too.
 *
 * AI opponents aim with the ghost-ball method at the easiest pot they can see
 * and miss by an amount their skill sets, all from the game's seeded RNG.
 */
import { ensure } from './errors.js';
import { deriveRng, type Rng } from './rng.js';
import {
  HEAD_Y,
  FOOT_Y,
  POCKETS,
  POOL_TABLE,
  cueSpotOk,
  isSolid,
  isStripe,
  rackBalls,
  simulateShot,
  type PoolBall,
} from './pool-physics.js';
import type { Game, PoolShotRecord, PoolState } from './games-types.js';
import type { World } from './types.js';

export const POOL = {
  turnMs: 75_000,
  maxShots: 160,
  recent: 8,
  aiMaxRun: 24,
} as const;

const { W, L, R } = POOL_TABLE;

export interface PoolEnding {
  winners: string[];
  reason: 'eight-ball' | 'fouls' | 'score' | 'tie';
}

export function initPool(world: World, g: Game, now: number) {
  const rng = deriveRng(world.seed, 'game', g.id, 'rack');
  // The 8 in the middle, one solid and one stripe in the back corners, the rest shuffled.
  const rest = rng.shuffle([2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15]);
  const order = [rest[0]!, rest[1]!, rest[2]!, rest[3]!, 8, ...rest.slice(4), 1, 9];
  // rackBalls fills the rows from the apex: indices 10 and 14 are the back row's corners.
  const seq = [...order];
  [seq[10], seq[13]] = [seq[13]!, seq[10]!];
  const contestants = g.players.filter((p) => !p.out);
  g.pool = {
    balls: rackBalls(seq),
    groups: null,
    turn: contestants[0]!.id,
    turnAt: now,
    ballInHand: false,
    shots: 0,
    seq: 0,
    recent: [],
    fouls: {},
  };
}

const groupOf = (n: number): 'solids' | 'stripes' | null =>
  isSolid(n) ? 'solids' : isStripe(n) ? 'stripes' : null;

const inGroup = (n: number, grp: 'solids' | 'stripes') => groupOf(n) === grp;

const other = (g: Game, id: string) => g.players.find((p) => p.id !== id && !p.out) ?? null;

/** Balls of a group still on the table. */
const left = (balls: readonly PoolBall[], grp: 'solids' | 'stripes') =>
  balls.filter(([n]) => inGroup(n, grp)).length;

/** The first free spot for the cue ball, from the head spot outwards. */
export function freeCueSpot(balls: readonly PoolBall[]): [number, number] {
  for (let r = 0; r < 40; r++)
    for (const [dx, dy] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ] as const) {
      const x = W / 2 + dx * 2 * R;
      const y = HEAD_Y + dy * 2 * R;
      if (cueSpotOk(balls, x, y, false)) return [x, y];
    }
  return [W / 2, HEAD_Y];
}

function respotEight(balls: PoolBall[]) {
  for (let k = 0; k < 30; k++) {
    const y = FOOT_Y - k * 2 * R;
    if (cueSpotOk(balls, W / 2, y, false)) {
      balls.push([8, W / 2, y]);
      return;
    }
  }
  balls.push([8, W / 2, FOOT_Y]);
}

export interface PoolShotInput {
  dx: number;
  dy: number;
  power: number;
  spin?: number;
  cueX?: number;
  cueY?: number;
}

/** One shot by `by`. Returns the ending when the frame is over. */
export function poolShot(
  g: Game,
  by: string,
  input: PoolShotInput,
  now: number,
): PoolEnding | null {
  const st = g.pool!;
  ensure(st.turn === by, 'game.turn', 'It’s not your shot.');
  ensure(
    Number.isFinite(input.dx) &&
      Number.isFinite(input.dy) &&
      input.dx * input.dx + input.dy * input.dy > 1e-9,
    'game.move',
    'Aim somewhere.',
  );
  let balls = st.balls.map((b) => [...b] as PoolBall);
  // Ball in hand (or the cue ball went in last time): place it.
  if (st.ballInHand || !balls.some(([n]) => n === 0)) {
    balls = balls.filter(([n]) => n !== 0);
    let x: number;
    let y: number;
    if (input.cueX !== undefined && input.cueY !== undefined) {
      ensure(
        cueSpotOk(balls, input.cueX, input.cueY, false),
        'game.move',
        'The cue ball can’t go there.',
      );
      x = Math.round(input.cueX * 100) / 100;
      y = Math.round(input.cueY * 100) / 100;
    } else [x, y] = freeCueSpot(balls);
    balls.unshift([0, x, y]);
  }
  const spin = Math.max(-1, Math.min(1, input.spin ?? 0));
  const power = Math.max(0.05, Math.min(1, input.power));
  const before = balls.map((b) => [...b] as PoolBall);
  const out = simulateShot(balls, { dx: input.dx, dy: input.dy, power, spin });
  const isBreak = st.shots === 0;
  const mine = st.groups?.[by] ?? null;
  const onEight = mine !== null && left(before, mine) === 0;
  const objects = out.potted.map((p) => p.n).filter((n) => n !== 0);
  // Fouls.
  let foul: string | null = null;
  if (out.scratch) foul = 'scratch';
  else if (out.firstHit === null) foul = 'no-hit';
  else if (!isBreak) {
    if (mine) {
      if (onEight ? out.firstHit !== 8 : !inGroup(out.firstHit, mine)) foul = 'wrong-ball';
    } else if (out.firstHit === 8) foul = 'wrong-ball';
  }
  let ending: PoolEnding | null = null;
  const opp = other(g, by);
  const balls2 = out.balls.map((b) => [...b] as PoolBall);
  // The 8.
  if (objects.includes(8)) {
    if (isBreak && !out.scratch) respotEight(balls2);
    else if (onEight && !foul) ending = { winners: [by], reason: 'eight-ball' };
    else ending = { winners: opp ? [opp.id] : [], reason: 'eight-ball' };
  }
  // Groups: the first legal pot after the break claims one.
  if (!ending && !foul && !isBreak && !st.groups) {
    const first = objects.find((n) => n !== 8);
    if (first !== undefined && opp) {
      const grp = groupOf(first)!;
      st.groups = { [by]: grp, [opp.id]: grp === 'solids' ? 'stripes' : 'solids' };
    }
  }
  const nowMine = st.groups?.[by] ?? null;
  const pottedOwn = nowMine
    ? objects.some((n) => inGroup(n, nowMine))
    : objects.some((n) => n !== 8);
  st.fouls[by] = foul ? (st.fouls[by] ?? 0) + 1 : 0;
  if (!ending && (st.fouls[by] ?? 0) >= 3 && opp) ending = { winners: [opp.id], reason: 'fouls' };
  st.balls = balls2;
  st.seq += 1;
  st.shots += 1;
  const rec: PoolShotRecord = {
    seq: st.seq,
    by,
    before,
    dx: input.dx,
    dy: input.dy,
    power,
    spin,
    potted: out.potted.map((p) => p.n),
    foul,
  };
  st.recent.push(rec);
  if (st.recent.length > POOL.recent) st.recent.splice(0, st.recent.length - POOL.recent);
  if (ending) return ending;
  // Whose shot next.
  if (foul || !pottedOwn) {
    if (opp) st.turn = opp.id;
    st.ballInHand = !!foul;
  } else st.ballInHand = false;
  if (out.scratch) st.balls = st.balls.filter(([n]) => n !== 0);
  st.turnAt = now;
  if (st.shots >= POOL.maxShots) return poolByCount(g);
  return null;
}

/** A frame that ran too long (or was abandoned): fewer of your balls left wins. */
export function poolByCount(g: Game): PoolEnding {
  const st = g.pool!;
  const ps = g.players.filter((p) => !p.out);
  const remaining = (id: string) => {
    const grp = st.groups?.[id];
    return grp ? left(st.balls, grp) : 7;
  };
  const best = Math.min(...ps.map((p) => remaining(p.id)));
  const winners = ps.filter((p) => remaining(p.id) === best).map((p) => p.id);
  return { winners, reason: winners.length > 1 ? 'tie' : 'score' };
}

/** Balls of your group potted (8 = cleared the table). */
export function poolScores(g: Game): Record<string, number> {
  const st = g.pool!;
  const out: Record<string, number> = {};
  for (const p of g.players) {
    const grp = st.groups?.[p.id];
    out[p.id] = grp ? 7 - left(st.balls, grp) : 0;
  }
  return out;
}

// ---------------------------------------------------------------- AI

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));

/** Distance from point p to segment a–b. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return dist(px, py, ax + t * vx, ay + t * vy);
}

function clear(
  balls: readonly PoolBall[],
  skip: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  for (const [n, x, y] of balls) {
    if (skip.includes(n)) continue;
    if (segDist(x, y, ax, ay, bx, by) < 2 * R - 0.05) return false;
  }
  return true;
}

/** The AI's shot: the easiest clear pot, else a safe hit on one of its balls. */
export function aiPoolShot(g: Game, ai: { id: string; skill?: number }, rng: Rng): PoolShotInput {
  const st = g.pool!;
  const skill = ai.skill ?? 0.5;
  let balls = st.balls;
  let cueX: number | undefined;
  let cueY: number | undefined;
  if (st.ballInHand || !balls.some(([n]) => n === 0)) {
    const rest = balls.filter(([n]) => n !== 0);
    [cueX, cueY] = freeCueSpot(rest);
    balls = [[0, cueX, cueY], ...rest];
  }
  const cue = balls.find(([n]) => n === 0)!;
  if (st.shots === 0) {
    const apex = balls.find(([n, , y]) => n !== 0 && y > FOOT_Y - 1) ?? balls[1]!;
    return {
      dx: apex[1] - cue[1] + rng.normal(0, 0.6),
      dy: apex[2] - cue[2],
      power: 0.9 + 0.1 * rng.next(),
      spin: 0,
      ...(cueX !== undefined ? { cueX, cueY } : {}),
    };
  }
  const mine = st.groups?.[ai.id] ?? null;
  const targets = balls.filter(([n]) => {
    if (n === 0) return false;
    if (!mine) return n !== 8;
    return left(balls, mine) === 0 ? n === 8 : inGroup(n, mine);
  });
  let best: { dx: number; dy: number; score: number; d: number } | null = null;
  for (const [n, tx, ty] of targets) {
    for (const pk of POCKETS) {
      const px = pk.x < 0 ? 1 : pk.x > W ? W - 1 : pk.x;
      const py = pk.y < 0 ? 1 : pk.y > L ? L - 1 : pk.y;
      const td = dist(tx, ty, px, py);
      if (td < 0.01) continue;
      const ux = (px - tx) / td;
      const uy = (py - ty) / td;
      const gx = tx - ux * 2 * R;
      const gy = ty - uy * 2 * R;
      const cd = dist(cue[1], cue[2], gx, gy);
      if (cd < 0.01) continue;
      const ax = (gx - cue[1]) / cd;
      const ay = (gy - cue[2]) / cd;
      const cos = ax * ux + ay * uy;
      if (cos < 0.25) continue;
      if (!clear(balls, [0, n], cue[1], cue[2], gx, gy)) continue;
      if (!clear(balls, [0, n], tx, ty, px, py)) continue;
      const score = (cos * cos) / (1 + cd / 120 + td / 90);
      if (!best || score > best.score) best = { dx: ax, dy: ay, score, d: cd + td };
    }
  }
  const place = cueX !== undefined ? { cueX, cueY } : {};
  if (best) {
    // Miss by an angle the skill sets: nudge the aim sideways.
    const err = rng.normal(0, 1) * (0.085 * (1 - skill) + 0.006);
    return {
      dx: best.dx - best.dy * err,
      dy: best.dy + best.dx * err,
      power: Math.min(1, 0.32 + best.d / 330 + rng.range(-0.04, 0.06)),
      spin: rng.range(-0.3, 0.3),
      ...place,
    };
  }
  // Nothing clear: hit the nearest legal ball and hope.
  const near = [...targets].sort(
    (a, b) => dist(cue[1], cue[2], a[1], a[2]) - dist(cue[1], cue[2], b[1], b[2]),
  )[0];
  const tx = near ? near[1] : W / 2;
  const ty = near ? near[2] : FOOT_Y;
  return {
    dx: tx - cue[1] + rng.normal(0, 1) * (3 * (1 - skill) + 0.3),
    dy: ty - cue[2],
    power: 0.45 + 0.2 * rng.next(),
    spin: 0,
    ...place,
  };
}

/** Let AI players take their shots until it's a human's turn (or the frame ends). */
export function runPoolAi(world: World, g: Game, now: number): PoolEnding | null {
  const st = g.pool!;
  for (let k = 0; k < POOL.aiMaxRun; k++) {
    const p = g.players.find((x) => x.id === st.turn);
    if (!p?.ai) return null;
    const rng = deriveRng(world.seed, 'game', g.id, 'ai-shot', st.seq);
    const end = poolShot(g, p.id, aiPoolShot(g, p, rng), now);
    if (end) return end;
  }
  return null;
}

export function poolView(g: Game, viewerId: string, now: number) {
  const st: PoolState = g.pool!;
  return {
    balls: st.balls,
    groups: st.groups,
    turn: st.turn,
    yourTurn: st.turn === viewerId,
    turnEndsAt: st.turnAt + POOL.turnMs,
    ballInHand: st.ballInHand || !st.balls.some(([n]) => n === 0),
    shots: st.shots,
    seq: st.seq,
    recent: st.recent,
    scores: poolScores(g),
    serverNow: now,
  };
}

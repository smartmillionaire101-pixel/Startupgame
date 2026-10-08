/**
 * Wave 12 §A: football on the TV: a penalty shootout, five kicks each and
 * then sudden death. The shooter picks a spot in the goal and how hard to hit
 * it; the keeper picks where to dive. Both choose in secret and the server
 * resolves the kick: harder shots stray more (a seeded scatter), and land
 * further from a keeper's reach. Corners beat keepers but find the post.
 *
 * AI players shoot and dive from the game's seeded RNG; a sharp AI keeper
 * reads which side you like.
 */
import { ensure } from './errors.js';
import { deriveRng } from './rng.js';
import type { FootballKick, Game, GamePlayer } from './games-types.js';
import type { World } from './types.js';

export const FOOTBALL = {
  kicksEach: 5,
  maxKicks: 20,
  turnMs: 45_000,
  /** How good a human's boot is (AI players use their own skill). */
  humanSkill: 0.72,
} as const;

export interface FootballEnding {
  winners: string[];
  reason: 'score' | 'tie';
}

const contestants = (g: Game) => g.players.filter((p) => !p.out);

export function initFootball(world: World, g: Game, now: number) {
  g.football = { kicks: [], turnAt: now };
  nextKick(world, g, now);
}

function nextKick(world: World, g: Game, now: number) {
  const st = g.football!;
  const [a, b] = contestants(g);
  if (!a || !b) return;
  const i = st.kicks.length;
  const shooter = i % 2 === 0 ? a : b;
  const keeper = i % 2 === 0 ? b : a;
  const k: FootballKick = { shooter: shooter.id, keeper: keeper.id };
  st.kicks.push(k);
  st.turnAt = now;
  const rng = deriveRng(world.seed, 'game', g.id, 'ai-kick', i);
  if (shooter.ai) k.shot = aiShot(shooter, rng);
  if (keeper.ai) k.dive = aiDive(g, keeper, shooter.id, rng);
}

function aiShot(p: GamePlayer, rng: ReturnType<typeof deriveRng>) {
  const skill = p.skill ?? 0.5;
  const side = rng.chance(0.5) ? -1 : 1;
  const wide = rng.range(0.3, 0.55 + 0.35 * skill);
  return {
    x: rd(side * wide),
    y: rd(rng.range(0.08, 0.85)),
    power: rd(rng.range(0.45, 0.7 + 0.2 * skill)),
  };
}

function aiDive(g: Game, p: GamePlayer, shooterId: string, rng: ReturnType<typeof deriveRng>) {
  const skill = p.skill ?? 0.5;
  // Which way has this shooter gone before?
  const past = g.football!.kicks.filter((k) => k.shooter === shooterId && k.shot);
  const lean = past.reduce((s, k) => s + Math.sign(k.shot!.x), 0);
  let x: number;
  if (lean !== 0 && rng.chance(0.2 + 0.4 * skill)) x = Math.sign(lean) * rng.range(0.4, 0.8);
  else x = rng.pick([-0.62, 0, 0.62]) + rng.range(-0.15, 0.15);
  return { x: rd(x), y: rd(rng.range(0.15, 0.75)) };
}

const rd = (v: number) => Math.round(v * 1000) / 1000;

export function footballScores(g: Game): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of g.players) out[p.id] = 0;
  for (const k of g.football!.kicks)
    if (k.result === 'goal') out[k.shooter] = (out[k.shooter] ?? 0) + 1;
  return out;
}

/** Is the shootout decided after the kicks taken so far? */
function decided(g: Game): FootballEnding | null {
  const [a, b] = contestants(g);
  if (!a || !b) return null;
  const done = g.football!.kicks.filter((k) => k.result);
  const n = done.length;
  const sc = footballScores(g);
  const ga = sc[a.id] ?? 0;
  const gb = sc[b.id] ?? 0;
  const ka = done.filter((k) => k.shooter === a.id).length;
  const kb = done.filter((k) => k.shooter === b.id).length;
  if (n <= FOOTBALL.kicksEach * 2) {
    const remA = FOOTBALL.kicksEach - ka;
    const remB = FOOTBALL.kicksEach - kb;
    if (ga + remA < gb) return { winners: [b.id], reason: 'score' };
    if (gb + remB < ga) return { winners: [a.id], reason: 'score' };
    if (n < FOOTBALL.kicksEach * 2) return null;
  }
  // Sudden death: after each pair.
  if (ka === kb && ga !== gb) return { winners: [ga > gb ? a.id : b.id], reason: 'score' };
  if (n >= FOOTBALL.maxKicks) return { winners: [a.id, b.id], reason: 'tie' };
  return null;
}

/** Resolve the current kick once both moves are in. */
function resolve(world: World, g: Game, i: number, now: number) {
  const k = g.football!.kicks[i]!;
  const shot = k.shot!;
  const dive = k.dive!;
  const shooter = g.players.find((p) => p.id === k.shooter)!;
  const keeper = g.players.find((p) => p.id === k.keeper)!;
  const rng = deriveRng(world.seed, 'game', g.id, 'kick', i);
  const skill = shooter.ai ? (shooter.skill ?? 0.5) : FOOTBALL.humanSkill;
  const sd = 0.03 + 0.17 * shot.power * shot.power * (1.25 - skill);
  const bx = shot.x + rng.normal(0, sd);
  const by = Math.max(0.02, shot.y + rng.normal(0, sd * 0.8));
  k.ball = { x: rd(bx), y: rd(by) };
  k.at = now;
  const ax = Math.abs(bx);
  if (ax > 1.03 || by > 1.03) k.result = 'miss';
  else if (ax > 0.965 || by > 0.965) k.result = 'post';
  else {
    const keeperSkill = keeper.ai ? (keeper.skill ?? 0.5) : FOOTBALL.humanSkill;
    const reach = 0.3 - 0.17 * shot.power + 0.08 * keeperSkill + (shot.power < 0.3 ? 0.28 : 0);
    const d = Math.sqrt((bx - dive.x) * (bx - dive.x) + (by - dive.y) * (by - dive.y));
    k.result = d < reach ? 'saved' : 'goal';
  }
}

export interface KickInput {
  k: 'kick' | 'dive';
  x: number;
  y: number;
  power?: number;
}

/** A shooter's kick or a keeper's dive. Returns the ending when it's decided. */
export function footballMove(
  world: World,
  g: Game,
  by: string,
  move: KickInput,
  now: number,
): FootballEnding | null {
  const st = g.football!;
  const i = st.kicks.length - 1;
  const k = st.kicks[i]!;
  ensure(!k.result, 'game.closed', 'That kick has been taken.');
  ensure(
    Number.isFinite(move.x) && Number.isFinite(move.y),
    'game.move',
    'Pick a spot in the goal.',
  );
  const x = rd(Math.max(-1.5, Math.min(1.5, move.x)));
  const y = rd(Math.max(0, Math.min(1.5, move.y)));
  if (move.k === 'kick') {
    ensure(k.shooter === by, 'game.turn', 'You’re in goal this time.');
    ensure(!k.shot, 'game.answered', 'You’ve already shot.');
    const power = Math.max(0.05, Math.min(1, move.power ?? 0.6));
    k.shot = { x, y, power: rd(power) };
  } else {
    ensure(k.keeper === by, 'game.turn', 'You’re taking this one.');
    ensure(!k.dive, 'game.answered', 'You’ve already picked your dive.');
    k.dive = { x, y };
  }
  if (!k.shot || !k.dive) return null;
  resolve(world, g, i, now);
  const end = decided(g);
  if (end) return end;
  nextKick(world, g, now);
  return null;
}

/** Who's holding the shootout up (the current kick's missing move). */
export function footballWaitingOn(g: Game): string[] {
  const st = g.football!;
  const k = st.kicks[st.kicks.length - 1];
  if (!k || k.result) return [];
  return [...(k.shot ? [] : [k.shooter]), ...(k.dive ? [] : [k.keeper])];
}

export function footballView(g: Game, viewerId: string) {
  const st = g.football!;
  return {
    kicks: st.kicks.map((k, i) => {
      const done = !!k.result;
      const last = i === st.kicks.length - 1;
      return {
        i,
        shooter: k.shooter,
        keeper: k.keeper,
        // Moves stay secret until the kick is taken (your own you can see).
        shot: done || k.shooter === viewerId ? (k.shot ?? null) : null,
        dive: done || k.keeper === viewerId ? (k.dive ?? null) : null,
        shotIn: !!k.shot,
        diveIn: !!k.dive,
        ball: k.ball ?? null,
        result: k.result ?? null,
        current: last && !done,
      };
    }),
    scores: footballScores(g),
    turnEndsAt: st.turnAt + FOOTBALL.turnMs,
    waitingOn: footballWaitingOn(g),
  };
}

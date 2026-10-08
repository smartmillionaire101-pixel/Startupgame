/**
 * Wave 12 §A: darts at the bar. Three visits of three darts each; the highest
 * total takes the pot. You aim on the board; where the dart lands is your aim
 * plus a seeded wobble (the server throws it, so nobody can claim a 180 they
 * didn't throw). AI players go for the treble 20, steadier the better they are.
 *
 * The board in units of the double ring's outer edge (1), x right, y down.
 */
import { ensure } from './errors.js';
import { deriveRng } from './rng.js';
import type { DartThrow, Game, GamePlayer } from './games-types.js';
import type { World } from './types.js';

export const DARTS = {
  darts: 9,
  turnMs: 60_000,
  humanSkill: 0.62,
} as const;

/** Sectors clockwise from the top. */
export const DART_SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const DART_RINGS = {
  bull: 0.0374,
  outerBull: 0.0935,
  trebleIn: 0.582,
  trebleOut: 0.629,
  doubleIn: 0.953,
  doubleOut: 1,
} as const;

/** What a dart at (x, y) scores. */
export function dartScore(x: number, y: number): { score: number; label: string } {
  const r = Math.sqrt(x * x + y * y);
  if (r > DART_RINGS.doubleOut) return { score: 0, label: 'MISS' };
  if (r < DART_RINGS.bull) return { score: 50, label: 'BULL' };
  if (r < DART_RINGS.outerBull) return { score: 25, label: '25' };
  let deg = (Math.atan2(x, -y) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const n = DART_SECTORS[Math.floor((deg + 9) / 18) % 20]!;
  if (r >= DART_RINGS.trebleIn && r < DART_RINGS.trebleOut) return { score: 3 * n, label: `T${n}` };
  if (r >= DART_RINGS.doubleIn) return { score: 2 * n, label: `D${n}` };
  return { score: n, label: String(n) };
}

const rd = (v: number) => Math.round(v * 10_000) / 10_000;

export function initDarts(g: Game, now: number) {
  g.darts = { throws: {}, turnAt: {} };
  for (const p of g.players) {
    g.darts.throws[p.id] = [];
    g.darts.turnAt[p.id] = now;
  }
}

function throwDart(world: World, g: Game, p: GamePlayer, aim: { x: number; y: number }, i: number) {
  const rng = deriveRng(world.seed, 'game', g.id, 'dart', p.id, i);
  const skill = p.ai ? (p.skill ?? 0.5) : DARTS.humanSkill;
  const sd = 0.03 + 0.12 * (1 - skill);
  const hit = { x: rd(aim.x + rng.normal(0, sd)), y: rd(aim.y + rng.normal(0, sd)) };
  const s = dartScore(hit.x, hit.y);
  const t: DartThrow = { aim: { x: rd(aim.x), y: rd(aim.y) }, hit, ...s };
  g.darts!.throws[p.id]!.push(t);
  return t;
}

function aiAim(p: GamePlayer, rng: ReturnType<typeof deriveRng>) {
  const skill = p.skill ?? 0.5;
  // Treble 20 for the good ones; the fat 20 or the bull otherwise.
  if (skill >= 0.55) return { x: 0, y: -0.605 };
  return rng.chance(0.5) ? { x: 0, y: -0.78 } : { x: 0, y: 0 };
}

export const dartsTotal = (g: Game, id: string) =>
  (g.darts!.throws[id] ?? []).reduce((s, t) => s + t.score, 0);

export function dartsScores(g: Game): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of g.players) out[p.id] = dartsTotal(g, p.id);
  return out;
}

export interface DartsEnding {
  winners: string[];
  reason: 'score' | 'tie';
}

export function dartsResult(g: Game): DartsEnding {
  const ps = g.players.filter((p) => !p.out);
  const best = Math.max(...ps.map((p) => dartsTotal(g, p.id)));
  const winners = ps.filter((p) => dartsTotal(g, p.id) === best).map((p) => p.id);
  return { winners, reason: winners.length > 1 ? 'tie' : 'score' };
}

/** Throw your next dart; AI players keep pace. Returns the ending when everyone's done. */
export function dartsThrow(
  world: World,
  g: Game,
  by: string,
  aim: { x: number; y: number },
  now: number,
): { dart: DartThrow; ending: DartsEnding | null } {
  const st = g.darts!;
  const me = g.players.find((p) => p.id === by && !p.out);
  ensure(me, 'game.player', 'You’re not playing in this one.');
  ensure(Number.isFinite(aim.x) && Number.isFinite(aim.y), 'game.move', 'Aim at the board.');
  const mine = st.throws[by]!;
  ensure(mine.length < DARTS.darts, 'game.answered', 'You’ve thrown all your darts.');
  const clampAim = {
    x: Math.max(-1.3, Math.min(1.3, aim.x)),
    y: Math.max(-1.3, Math.min(1.3, aim.y)),
  };
  const dart = throwDart(world, g, me, clampAim, mine.length);
  st.turnAt[by] = now;
  const pace = Math.max(...g.players.filter((p) => !p.ai).map((p) => st.throws[p.id]!.length));
  for (const p of g.players)
    if (p.ai)
      while (st.throws[p.id]!.length < pace) {
        const i = st.throws[p.id]!.length;
        throwDart(world, g, p, aiAim(p, deriveRng(world.seed, 'game', g.id, 'ai-aim', p.id, i)), i);
      }
  const done = g.players.filter((p) => !p.out).every((p) => st.throws[p.id]!.length >= DARTS.darts);
  return { dart, ending: done ? dartsResult(g) : null };
}

export function dartsView(g: Game) {
  const st = g.darts!;
  return {
    throws: st.throws,
    scores: dartsScores(g),
    darts: DARTS.darts,
    turnEndsAt: st.turnAt,
  };
}

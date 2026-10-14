import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch.js';
import type { Command } from '../src/commands.js';
import { createWorld } from '../src/world.js';
import type { World } from '../src/types.js';
import { playerView } from '../src/views.js';
import { AUTO_QUIZ_FROM, aiCueError, aiShot } from '../src/play.js';
import { moneyByCurrency } from './helpers.js';

const T1 = AUTO_QUIZ_FROM + 3_600_000;

function run(w: World, actor: string | null, cmd: Command, now = T1) {
  const r = dispatch(w, cmd, { actorId: actor, now });
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.error.code} ${r.error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed results
  return { world: r.world, result: r.result as any };
}
const tryRun = (w: World, actor: string | null, cmd: Command, now = T1) =>
  dispatch(w, cmd, { actorId: actor, now });

function world(seed = 7) {
  let w = createWorld({ seed, now: T1, markets: ['lagos', 'london'], aiStartupsPerMarket: 6 });
  for (const id of ['host', 'ada'])
    w = run(w, id, {
      type: 'player.create',
      handle: `h_${id}`,
      name: `Player ${id}`,
      role: 'founder',
      backgroundId: 'f-engineer',
      market: 'lagos',
      company: {
        name: `${id} Labs`,
        industry: 'fintech',
        revenueModel: 'subscription',
        idea: 'Payments for market traders',
        incorporation: 'local',
      },
    }).world;
  return w;
}

function host(w: World, game: 'snooker' | 'football', stake: number) {
  const made = run(w, 'host', {
    type: 'play.create',
    game,
    venue: 'home:host',
    title: 'Me against the machine',
    stake,
  });
  return { w: made.world, id: made.result.id as string };
}

const balanceOf = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

/** Play a solo snooker frame: the human takes the shot the AI would, the AI plays on sync. */
function playSnooker(seed: number, stake: number) {
  const hosted = host(world(seed), 'snooker', stake);
  const id = hosted.id;
  let w = hosted.w;
  w = run(w, 'host', { type: 'play.ai', roomId: id }).world;
  let now = T1;
  for (let i = 0; i < 400; i++) {
    const r = w.playRooms![id]!;
    if (r.status !== 'playing') break;
    const v = playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;
    if (v.turn === 'host') {
      const s = aiShot(w, r, 'host');
      now += 3_000;
      w = run(w, 'host', { type: 'play.shot', roomId: id, round: r.round, ...s }, now).world;
    } else {
      expect(v.aiDueAt).not.toBeNull();
      now = Math.max(now, v.aiDueAt!);
      w = run(w, 'host', { type: 'play.sync', roomId: id }, now).world;
    }
  }
  return { w, id };
}

describe('snooker and football against an AI opponent', () => {
  it('only the host alone at a waiting table can call the AI', () => {
    const base = world();
    const made = run(base, 'host', {
      type: 'play.create',
      game: 'snooker',
      venue: Object.keys(base.markets.lagos!.businesses ?? {})[0]!,
      title: 'Open table',
      stake: 0,
    });
    const w = made.world,
      id = made.result.id as string;
    expect(tryRun(w, 'ada', { type: 'play.ai', roomId: id }).ok).toBe(false);
    const joined = run(w, 'ada', { type: 'play.join', roomId: id }).world;
    expect(tryRun(joined, 'host', { type: 'play.ai', roomId: id }).ok).toBe(false);
    const r = run(w, 'host', { type: 'play.ai', roomId: id, count: 3 }).world.playRooms![id]!;
    expect(r.status).toBe('playing');
    expect(r.members).toHaveLength(2);
    expect(r.ai).toHaveLength(1);
  });

  it('plays a staked snooker frame to the end: money conserved, winner takes the pot', () => {
    const stake = 1000;
    const before = world(7);
    const supply = moneyByCurrency(before);
    const hostBefore = balanceOf(before, 'host');
    const { w, id } = playSnooker(7, stake);
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(r.round).toBeGreaterThan(2);
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(w)).toEqual(supply);
    const ai = r.ai![0]!;
    if (r.winners.length === 1) {
      const winner = r.winners[0]!;
      expect([ai, 'host']).toContain(winner);
      expect(balanceOf(w, 'host')).toBe(
        winner === 'host' ? hostBefore + stake : hostBefore - stake,
      );
    } else expect(balanceOf(w, 'host')).toBe(hostBefore);
    // Deterministic: the same commands replay to the same frame.
    expect(playSnooker(7, stake).w.playRooms![id]).toEqual(r);
  });

  it('the AI is beatable: a bounded aim error, the same shot on replay', () => {
    for (const ai of ['ai_1', 'ai_2', 'ai_3', 'p_99', 'x']) {
      expect(aiCueError(ai)).toBeGreaterThanOrEqual(0.035);
      expect(aiCueError(ai)).toBeLessThan(0.06);
    }
    const hosted = host(world(5), 'snooker', 0);
    const id = hosted.id;
    let w = hosted.w;
    w = run(w, 'host', { type: 'play.ai', roomId: id }).world;
    const r = w.playRooms![id]!;
    const a = aiShot(w, r, r.ai![0]!);
    expect(aiShot(w, r, r.ai![0]!)).toEqual(a);
    expect(a.power).toBeGreaterThanOrEqual(5);
    expect(a.power).toBeLessThanOrEqual(100);
    // A perfect cue is steadier than the AI's own.
    expect(aiShot(w, r, r.ai![0]!, 0)).not.toEqual(a);
  });

  it('plays a staked penalty shootout against the AI to the end', () => {
    const stake = 500;
    const before = world(11);
    const supply = moneyByCurrency(before);
    const hosted = host(before, 'football', stake);
    const id = hosted.id;
    let w = hosted.w;
    w = run(w, 'host', { type: 'play.ai', roomId: id }).world;
    let r = w.playRooms![id]!;
    const ai = r.ai![0]!;
    expect(w.players[ai]!.ai).toBe(true);
    expect(w.accounts[r.escrow]!.balance).toBe(stake * 2);
    expect(moneyByCurrency(w)).toEqual(supply);
    let now = T1;
    for (let round = 0; round < 40 && r.status === 'playing'; round++) {
      // The AI locks in on its own after a few seconds (a sync), never seeing your choice.
      const v = playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;
      expect(v.aiDueAt).not.toBeNull();
      w = run(w, 'host', { type: 'play.sync', roomId: id }, v.aiDueAt!).world;
      expect(w.playRooms![id]!.moves[ai]).toBeDefined();
      w = run(
        w,
        'host',
        { type: 'play.penalty', roomId: id, round: r.round, lane: round % 5 },
        v.aiDueAt! + 500,
      ).world;
      r = w.playRooms![id]!;
      now = r.deadline - 20_000;
      expect(r.penalties).toHaveLength(round + 1);
    }
    expect(now).toBeGreaterThan(T1);
    expect(r.status).toBe('finished');
    expect(r.winners).toHaveLength(1);
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(w)).toEqual(supply);
    const winner = r.winners[0]!;
    // The winner paid one stake and took both.
    expect(balanceOf(w, winner)).toBe(balanceOf(before, winner) + stake);
  });

  it('answers as soon as you lock in, without waiting for its thinking time', () => {
    const hosted = host(world(3), 'football', 0);
    const id = hosted.id;
    let w = hosted.w;
    w = run(w, 'host', { type: 'play.ai', roomId: id }).world;
    w = run(w, 'host', { type: 'play.penalty', roomId: id, round: 0, lane: 2 }, T1 + 200).world;
    expect(w.playRooms![id]!.penalties).toHaveLength(1);
    expect(w.playRooms![id]!.round).toBe(1);
  });

  it('leaves quiz AI exactly as it was', () => {
    const made = run(world(), 'host', {
      type: 'play.create',
      game: 'quiz',
      venue: 'home:host',
      title: 'Quiz',
      stake: 0,
    });
    const id = made.result.id;
    const w = run(made.world, 'host', { type: 'play.ai', roomId: id }).world;
    expect(w.playRooms![id]!.ai).toHaveLength(2);
    expect(w.playRooms![id]!.last).toMatch(/joined the quiz\.$/);
  });
});

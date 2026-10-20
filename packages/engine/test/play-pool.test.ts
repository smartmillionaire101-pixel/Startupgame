import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch.js';
import type { Command } from '../src/commands.js';
import { createWorld } from '../src/world.js';
import type { World } from '../src/types.js';
import { playerView } from '../src/views.js';
import { AUTO_QUIZ_FROM, aiPoolShot, poolTargets, type PlayRoom } from '../src/play.js';
import { INVESTOR_NOTE } from '../src/releases.js';
import { POOL_HEAD_X, POOL_R, simulatePool } from '../src/pool.js';
import { createRng } from '../src/rng.js';
import {
  GOAL_HALF,
  aiKick,
  laneOf,
  resolveKick,
  shootoutOver,
  type Kick,
} from '../src/shootout.js';
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

/** A world on the investor-career release (real pool and a real shootout). */
function world(seed = 7) {
  let w = createWorld({ seed, now: T1, markets: ['lagos'], aiStartupsPerMarket: 6 });
  w = run(w, null, { type: 'system.announce', id: INVESTOR_NOTE, text: 'New release.' }).world;
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
    title: 'Against the machine',
    stake,
  });
  return { w: made.world, id: made.result.id as string };
}
const balanceOf = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const viewOf = (w: World, id: string) => playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;

/** A frame of 8-ball against the AI: the human plays the AI's own plan. */
function playFrame(seed: number, stake: number) {
  const hosted = host(world(seed), 'snooker', stake);
  const id = hosted.id;
  let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
  let now = T1;
  for (let i = 0; i < 400; i++) {
    const r = w.playRooms![id]!;
    if (r.status !== 'playing') break;
    const v = viewOf(w, id);
    now = Math.max(now, r.pool!.readyAt) + 1_000;
    if (v.turn === 'host') {
      const s = aiPoolShot(w, r, 'host');
      w = run(w, 'host', { type: 'play.shot', roomId: id, round: r.round, ...s }, now).world;
    } else {
      expect(v.aiDueAt).not.toBeNull();
      now = Math.max(now, v.aiDueAt!);
      w = run(w, 'host', { type: 'play.sync', roomId: id }, now).world;
    }
  }
  return { w, id };
}

describe('8-ball pool rooms', () => {
  it('racks 8-ball with ball in hand behind the head string for the break', () => {
    const { w, id } = host(world(), 'snooker', 0);
    const r = w.playRooms![id]!;
    expect(r.rules).toBe('pool8');
    expect(r.balls).toHaveLength(16);
    expect(r.pool!.inHand).toBe('kitchen');
    const v = viewOf(w, id);
    expect(v.rules).toBe('pool8');
    expect(v.pool!.inHand).toBe('kitchen');
  });

  it('plays a staked frame against the AI to the end: money conserved, replayable', () => {
    const stake = 1000;
    const before = world(7);
    const supply = moneyByCurrency(before);
    const hostBefore = balanceOf(before, 'host');
    const { w, id } = playFrame(7, stake);
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(r.pool!.shots).toBeGreaterThan(3);
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(w)).toEqual(supply);
    expect(r.winners).toHaveLength(1);
    const winner = r.winners[0]!;
    expect(r.members.find((m) => m.id === winner)!.score).toBe(8);
    expect(balanceOf(w, 'host')).toBe(winner === 'host' ? hostBefore + stake : hostBefore - stake);
    // Groups were taken on the way.
    expect(Object.keys(r.pool!.groups)).toHaveLength(2);
    // The same commands replay to the same frame.
    expect(playFrame(7, stake).w.playRooms![id]).toEqual(r);
  }, 120_000);

  it('replays each logged shot exactly from its starting velocity', () => {
    const hosted = host(world(3), 'snooker', 0);
    const id = hosted.id;
    let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
    const r0 = w.playRooms![id]!;
    w = run(w, 'host', {
      type: 'play.shot',
      roomId: id,
      round: 0,
      ...aiPoolShot(w, r0, 'host'),
    }).world;
    const r = w.playRooms![id]!;
    const last = r.pool!.last!;
    const sim = simulatePool(last.before!, last.vx!, last.vy!, last.spin, last.side);
    expect(sim.pots).toEqual(last.pots);
    // The table after the shot is the simulation's (re-spots aside).
    for (const b of sim.balls)
      if (!b.potted && b.id !== 8 && b.id !== 0) {
        const after = r.balls.find((x) => x.id === b.id)!;
        expect(after.x).toBe(b.x);
        expect(after.y).toBe(b.y);
      }
  });

  it('a scratch is a foul: the opponent gets ball in hand anywhere', () => {
    const hosted = host(world(5), 'snooker', 0);
    const id = hosted.id;
    let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
    // Break normally, then force a scratch on the host's next turn.
    const room = () => w.playRooms![id]!;
    let now = T1;
    for (let i = 0; i < 40 && room().status === 'playing'; i++) {
      const r = room();
      now = Math.max(now, r.pool!.readyAt) + 1_000;
      const turn = viewOf(w, id).turn;
      if (turn !== 'host') {
        now = Math.max(now, viewOf(w, id).aiDueAt!);
        w = run(w, 'host', { type: 'play.sync', roomId: id }, now).world;
        continue;
      }
      if (!r.pool!.broken) {
        w = run(
          w,
          'host',
          { type: 'play.shot', roomId: id, round: r.round, ...aiPoolShot(w, r, 'host') },
          now,
        ).world;
        continue;
      }
      // Put the cue ball near a corner and roll it straight in.
      const placed = r.pool!.inHand !== null;
      const cue = r.balls[0]!;
      const x = placed ? 10 : cue.x,
        y = placed ? 10 : cue.y;
      const angle = Math.atan2(-y, -x);
      const blocked = r.balls.some(
        (b) => b.id && !b.potted && Math.hypot(b.x - x / 2, b.y - y / 2) < Math.hypot(x, y) / 2,
      );
      if (!placed || blocked) {
        w = run(
          w,
          'host',
          { type: 'play.shot', roomId: id, round: r.round, ...aiPoolShot(w, r, 'host') },
          now,
        ).world;
        continue;
      }
      w = run(
        w,
        'host',
        { type: 'play.shot', roomId: id, round: r.round, angle, power: 30, cueX: x, cueY: y },
        now,
      ).world;
      const after = room();
      expect(after.pool!.last!.pots).toContain(0);
      expect(after.pool!.last!.call).toBe('foul-scratch');
      expect(after.pool!.inHand).toBe('table');
      expect(viewOf(w, id).turn).not.toBe('host');
      return;
    }
  }, 60_000);

  it('the break is from behind the head string; your turn only; the balls must stop first', () => {
    const hosted = host(world(9), 'snooker', 0);
    const id = hosted.id;
    let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
    let r = w.playRooms![id]!;
    // Ball in hand in the kitchen: a cue ball placed up the table comes back behind the line.
    w = run(w, 'host', {
      type: 'play.shot',
      roomId: id,
      round: 0,
      angle: 0,
      power: 100,
      cueX: 200,
      cueY: 60,
    }).world;
    r = w.playRooms![id]!;
    expect(r.pool!.last!.before![0]!.x).toBeLessThanOrEqual(POOL_HEAD_X);
    expect(r.pool!.readyAt).toBeGreaterThan(T1);
    if (viewOf(w, id).turn === 'host')
      expect(
        tryRun(w, 'host', { type: 'play.shot', roomId: id, round: r.round, angle: 0, power: 50 })
          .ok,
      ).toBe(false);
    else
      expect(
        tryRun(
          w,
          'host',
          { type: 'play.shot', roomId: id, round: r.round, angle: 0, power: 50 },
          r.pool!.readyAt + 10,
        ).ok,
      ).toBe(false);
    expect(poolTargets(r, 'host').length).toBeGreaterThan(0);
  });

  it('a timed-out turn passes with ball in hand', () => {
    const hosted = host(world(4), 'snooker', 0);
    const id = hosted.id;
    let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
    const r = w.playRooms![id]!;
    w = run(w, 'host', { type: 'play.sync', roomId: id }, r.deadline + 1).world;
    const after = w.playRooms![id]!;
    expect(after.pool!.last!.call).toBe('timeout');
    expect(after.pool!.inHand).toBe('kitchen');
    expect(viewOf(w, id).turn).not.toBe('host');
  });

  it('leaves rooms from before the release on the old snooker rules', () => {
    let w = createWorld({ seed: 2, now: T1, markets: ['lagos'], aiStartupsPerMarket: 6 });
    w = run(w, 'host', {
      type: 'player.create',
      handle: 'h_old',
      name: 'Old Timer',
      role: 'founder',
      backgroundId: 'f-engineer',
      market: 'lagos',
      company: {
        name: 'Old Labs',
        industry: 'fintech',
        revenueModel: 'subscription',
        idea: 'Payments for market traders',
        incorporation: 'local',
      },
    }).world;
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'snooker',
      venue: 'home:host',
      title: 'Old frame',
      stake: 0,
    });
    const r = made.world.playRooms![made.result.id]! as PlayRoom;
    expect(r.rules).toBeUndefined();
    expect(r.pool).toBeUndefined();
    expect(r.balls).toHaveLength(22);
  });
});

describe('the penalty shootout', () => {
  const k = (x: number, y: number, power = 0.6, curve = 0): Kick => ({ x, y, power, curve });

  it('a keeper diving the right way saves what is within reach; the wrong way, it goes in', () => {
    let saved = 0,
      scored = 0;
    for (let i = 0; i < 200; i++) {
      if (resolveKick(createRng(i), k(-2.4, 0.5, 0.4), 3).outcome === 'saved') saved++;
      if (resolveKick(createRng(i), k(-2.4, 0.5, 0.4), 1).goal) scored++;
    }
    expect(saved).toBeGreaterThan(100);
    expect(scored).toBeGreaterThan(150);
  });

  it('a top corner is out of reach, but a full-blooded one can fly over', () => {
    let goals = 0,
      over = 0;
    for (let i = 0; i < 200; i++) {
      const top = resolveKick(createRng(i), k(-3.1, 2.05, 0.45), 0);
      if (top.goal) goals++;
      if (resolveKick(createRng(i), k(-2.5, 2.1, 1), 1).outcome === 'over') over++;
    }
    expect(goals).toBeGreaterThan(80);
    expect(over).toBeGreaterThan(50);
  });

  it('hits the woodwork', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 400; i++) {
      outcomes.add(resolveKick(createRng(i), k(-GOAL_HALF, 1, 0.3), 1).outcome);
      outcomes.add(resolveKick(createRng(i), k(0.5, 2.44, 0.3), 3).outcome);
    }
    expect(outcomes).toContain('post');
    expect(outcomes).toContain('bar');
    expect([...outcomes].some((o) => o === 'post-in' || o === 'bar-in')).toBe(true);
  });

  it('curl moves the ball across the goal', () => {
    const straight = resolveKick(createRng(1), k(0, 1, 0.3, 0), -1);
    const curled = resolveKick(createRng(1), k(0, 1, 0.3, 0.8), -1);
    expect(curled.x - straight.x).toBeGreaterThan(0.6);
  });

  it('ends early when a side cannot catch up, and goes to sudden death', () => {
    // A scores 3, B misses 3: B can't catch up with two kicks left each? 3 > 0 + 2.
    expect(shootoutOver([true, false, true, false, true, false])).toBe(true);
    expect(shootoutOver([true, false, true, false])).toBe(false);
    // Level after five each: sudden death.
    const level = [true, true, true, true, false, false, true, true, true, true];
    expect(shootoutOver(level)).toBe(false);
    expect(shootoutOver([...level, true])).toBe(false);
    expect(shootoutOver([...level, true, false])).toBe(true);
    expect(shootoutOver([...level, true, true])).toBe(false);
    // Everyone scores forever: a draw at the cap.
    expect(shootoutOver(Array(30).fill(true))).toBe(true);
  });

  it('plays a staked shootout against the AI to the end with swipes: money conserved', () => {
    const stake = 500;
    const before = world(11);
    const supply = moneyByCurrency(before);
    const hosted = host(before, 'football', stake);
    const id = hosted.id;
    let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
    let r = w.playRooms![id]!;
    expect(r.rules).toBe('shootout');
    const ai = r.ai![0]!;
    const rng = createRng(3);
    let now = T1;
    for (let round = 0; round < 40 && r.status === 'playing'; round++) {
      const v = viewOf(w, id);
      now += 2_000;
      if (v.shooter === 'host') {
        // The AI keeper doesn't move until you shoot (it reads your kick).
        expect(v.aiDueAt).toBeNull();
        const kick = aiKick(rng, 0.2);
        w = run(
          w,
          'host',
          { type: 'play.penalty', roomId: id, round: r.round, lane: laneOf(kick.x, kick.y), kick },
          now,
        ).world;
      } else {
        expect(v.aiDueAt).not.toBeNull();
        now = Math.max(now, v.aiDueAt!);
        w = run(w, 'host', { type: 'play.sync', roomId: id }, now).world;
        expect(w.playRooms![id]!.moves[ai]).toBeDefined();
        w = run(
          w,
          'host',
          { type: 'play.penalty', roomId: id, round: r.round, lane: round % 5 },
          now + 500,
        ).world;
      }
      r = w.playRooms![id]!;
      expect(r.penalties).toHaveLength(round + 1);
      expect(r.penalties.at(-1)!.outcome).toBeDefined();
    }
    expect(r.status).toBe('finished');
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(w)).toEqual(supply);
    const total = r.penalties.length;
    expect(total).toBeGreaterThanOrEqual(6);
    if (r.winners.length === 1)
      expect(balanceOf(w, r.winners[0]!)).toBe(balanceOf(before, r.winners[0]!) + stake);
  });

  it('a lane from an older client still takes a kick', () => {
    const hosted = host(world(3), 'football', 0);
    const id = hosted.id;
    let w = run(hosted.w, 'host', { type: 'play.ai', roomId: id }).world;
    w = run(w, 'host', { type: 'play.penalty', roomId: id, round: 0, lane: 1 }, T1 + 200).world;
    const p = w.playRooms![id]!.penalties[0]!;
    expect(p.kick).toBeDefined();
    expect(p.shot).toBe(1);
    expect(POOL_R).toBeGreaterThan(2);
  });
});

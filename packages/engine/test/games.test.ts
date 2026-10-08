import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch.js';
import { gameView, GAMES, stakeLimit } from '../src/games.js';
import { QUIZ, quizPhase, rightSlot } from '../src/games-quiz.js';
import { QUIZ_BANK } from '../src/data/quiz-bank.js';
import { POCKETS, POOL_TABLE, rackBalls, simulateShot } from '../src/pool-physics.js';
import { dartScore } from '../src/games-darts.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  DAY,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  T0,
  tryRun,
} from './helpers.js';

const bal = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const barOf = (w: World, market = 'lagos') =>
  Object.values(w.markets[market as 'lagos']!.businesses!).find(
    (b) => (b.kind === 'bar' || b.kind === 'pub') && b.closedMonth === undefined,
  )!;
const escrow = (w: World, market = 'lagos') => w.accounts[`acc:games:${market}`]?.balance ?? 0;

function world3() {
  let w = addFounder(makeWorld(7, ['lagos', 'london']));
  w = addInvestor(w, 'u_inv', 'lagos');
  w = addInvestor(w, 'u_two', 'lagos');
  return w;
}

describe('pool physics', () => {
  it('is deterministic and keeps balls on the cloth', () => {
    const rack = rackBalls();
    expect(rack).toHaveLength(16);
    const shot = { dx: 0.02, dy: -1, power: 1 };
    const a = simulateShot(rack, shot);
    const b = simulateShot(rack, shot);
    expect(a.balls).toEqual(b.balls);
    expect(a.firstHit).not.toBeNull();
    for (const [, x, y] of a.balls) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(POOL_TABLE.W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(POOL_TABLE.L);
    }
    // The break spreads the pack.
    const moved = a.balls.filter(([n, x, y]) => {
      const was = rack.find((r) => r[0] === n);
      return was && (Math.abs(was[1] - x) > 1 || Math.abs(was[2] - y) > 1);
    });
    expect(moved.length).toBeGreaterThan(8);
  });

  it('pots a straight ball into a corner pocket', () => {
    const { R } = POOL_TABLE;
    const pk = POCKETS[0]!;
    // Object ball on the diagonal towards the top-left pocket, cue ball behind it.
    const balls: [number, number, number][] = [
      [0, 40, 40],
      [3, 20, 20],
    ];
    const out = simulateShot(balls, { dx: pk.x - 40, dy: pk.y - 40, power: 0.5 });
    expect(out.firstHit).toBe(3);
    expect(out.potted.map((p) => p.n)).toContain(3);
    expect(R).toBeGreaterThan(2);
  });

  it('records frames for the client to animate', () => {
    const out = simulateShot(rackBalls(), { dx: 0, dy: -1, power: 0.8 }, { frameEvery: 4 });
    expect(out.frames.length).toBeGreaterThan(10);
    expect(out.frames.at(-1)!.balls.length).toBe(out.balls.length);
  });
});

describe('darts board', () => {
  it('scores the board', () => {
    expect(dartScore(0, 0).label).toBe('BULL');
    expect(dartScore(0, -0.605)).toEqual({ score: 60, label: 'T20' });
    expect(dartScore(0, -0.97)).toEqual({ score: 40, label: 'D20' });
    expect(dartScore(0, 0.8)).toEqual({ score: 3, label: '3' });
    expect(dartScore(1.2, 0).label).toBe('MISS');
  });
});

describe('question bank', () => {
  it('has every question in both languages with four different answers', () => {
    expect(QUIZ_BANK.length).toBeGreaterThan(150);
    const ids = new Set<string>();
    for (const q of QUIZ_BANK) {
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      expect(new Set(q.en.slice(1)).size).toBe(4);
      expect(new Set(q.fr.slice(1)).size).toBe(4);
    }
    for (const c of ['lagos', 'london', 'nairobi', 'san-francisco', 'freetown'])
      expect(QUIZ_BANK.filter((q) => q.city === c).length).toBeGreaterThanOrEqual(4);
  });
});

describe('quiz night at a bar (AI players, a stake)', () => {
  it('scores answers on the server and pays the whole pot to the winner', () => {
    let w = world3();
    const total = moneyByCurrency(w);
    const bar = barOf(w);
    const limit = stakeLimit(w.players.u_founder!, w.markets.lagos!);
    const stake = Math.min(limit, 50_000_00);
    const before = bal(w, 'u_founder');
    const r = run(w, 'u_founder', {
      type: 'game.create',
      kind: 'quiz',
      where: 'venue',
      businessId: bar.id,
      stake,
      ai: 3,
      aiSkill: 1,
    });
    w = r.world;
    const id = r.result.gameId as string;
    let g = w.games![id]!;
    expect(g.players).toHaveLength(4);
    expect(g.pot).toBe(stake * 4);
    expect(escrow(w)).toBe(stake * 4);
    expect(bal(w, 'u_founder')).toBe(before - stake);
    // Another player in town joins.
    w = run(w, 'u_inv', { type: 'game.join', gameId: id }).world;
    w = run(w, 'u_founder', { type: 'game.start', gameId: id }, T0 + 1000).world;
    g = w.games![id]!;
    const start = g.startedAt!;
    // Too early: still counting down.
    expect(
      tryRun(
        w,
        'u_founder',
        { type: 'game.play', gameId: id, move: { k: 'answer', q: 0, choice: 0 } },
        start + 100,
      ).ok,
    ).toBe(false);
    // The founder knows everything and answers fast; the investor always picks a wrong slot.
    let now = start;
    for (let i = 0; i < g.quiz!.questions.length; i++) {
      const gq = w.games![id]!;
      now = (i === 0 ? start + QUIZ.leadMs : gq.quiz!.closeAt[i - 1]! + QUIZ.revealMs) + 400;
      expect(quizPhase(gq, now).phase).toBe('question');
      const right = rightSlot(gq.quiz!.questions[i]!);
      // While it's open, the view hides the answer and others' choices.
      const v = gameView(w, id, 'u_inv', now)!;
      expect(v.quiz!.current!.right).toBeNull();
      w = run(
        w,
        'u_founder',
        { type: 'game.play', gameId: id, move: { k: 'answer', q: i, choice: right } },
        now,
      ).world;
      const v2 = gameView(w, id, 'u_inv', now + 10)!;
      expect(v2.quiz!.current!.answers.find((a) => a.id === 'u_founder')!.choice).toBeNull();
      w = run(
        w,
        'u_inv',
        { type: 'game.play', gameId: id, move: { k: 'answer', q: i, choice: (right + 1) % 4 } },
        now + 300,
      ).world;
      // Everyone answered: the question closes early.
      expect(w.games![id]!.quiz!.closeAt[i]!).toBeLessThan(now + QUIZ.answerMs);
      // Answering twice is refused.
      expect(
        tryRun(
          w,
          'u_inv',
          { type: 'game.play', gameId: id, move: { k: 'answer', q: i, choice: right } },
          now + 400,
        ).ok,
      ).toBe(false);
    }
    g = w.games![id]!;
    const end = g.quiz!.closeAt.at(-1)! + QUIZ.revealMs + 10;
    // Before it's over, finishing is refused.
    expect(tryRun(w, 'u_founder', { type: 'game.finish', gameId: id }, end - 3000).ok).toBe(false);
    w = run(w, 'u_inv', { type: 'game.finish', gameId: id }, end).world;
    g = w.games![id]!;
    expect(g.status).toBe('settled');
    expect(g.result!.winners).toEqual(['u_founder']);
    expect(g.result!.payouts.u_founder).toBe(stake * 5);
    expect(bal(w, 'u_founder')).toBe(before - stake + stake * 5);
    expect(escrow(w)).toBe(0);
    expect(w.gameStats!.lagos!.quiz!.u_founder!.wins).toBe(1);
    expect(w.gameStats!.lagos!.quiz!.u_inv!.streak).toBe(0);
    expect(moneyByCurrency(w)).toEqual(total);
    // The review shows every answer now.
    expect(gameView(w, id, 'u_inv', end)!.quiz!.review!.length).toBe(g.quiz!.questions.length);
  });

  it('refuses stakes above the lifestyle limit or what you hold', () => {
    const w = world3();
    const bar = barOf(w);
    const limit = stakeLimit(w.players.u_founder!, w.markets.lagos!);
    const r = tryRun(w, 'u_founder', {
      type: 'game.create',
      kind: 'quiz',
      where: 'venue',
      businessId: bar.id,
      stake: limit + 1,
    });
    expect(r.ok).toBe(false);
    // Broke: the stake can't be covered.
    const w2 = structuredClone(w) as World;
    const acc = w2.accounts[w2.players.u_founder!.accounts.local]!;
    w2.accounts[w2.markets.lagos!.ext.genesis]!.balance += acc.balance;
    acc.balance = 0;
    expect(
      tryRun(w2, 'u_founder', {
        type: 'game.create',
        kind: 'quiz',
        where: 'venue',
        businessId: bar.id,
        stake: 1000,
      }).ok,
    ).toBe(false);
  });

  it('refunds every stake when a lobby is called off or goes stale', () => {
    let w = world3();
    const total = moneyByCurrency(w);
    const bar = barOf(w);
    const before = bal(w, 'u_founder');
    const r = run(w, 'u_founder', {
      type: 'game.create',
      kind: 'quiz',
      where: 'venue',
      businessId: bar.id,
      stake: 10_000,
      ai: 2,
    });
    w = run(r.world, 'u_inv', { type: 'game.join', gameId: r.result.gameId }).world;
    w = run(w, 'u_inv', { type: 'game.leave', gameId: r.result.gameId }).world;
    expect(escrow(w)).toBe(30_000);
    // Nobody starts it: the next settlement calls it off.
    w = settle(w, 'lagos', 1);
    expect(w.games![r.result.gameId]!.status).toBe('cancelled');
    expect(escrow(w)).toBe(0);
    const recent = w.accounts[w.players.u_founder!.accounts.local]!.recent;
    expect(recent.some((r) => r.memo.startsWith('Stake back') && r.amount === 10_000)).toBe(true);
    expect(before).toBeGreaterThan(0);
    expect(moneyByCurrency(w)).toEqual(total);
  });
});

describe('a quiz hosted at home with your own questions', () => {
  it('two friends play the host’s questions; the host is quizmaster', () => {
    let w = world3();
    const total = moneyByCurrency(w);
    const custom = [
      {
        q: 'What is my cat called?',
        options: ['Bisi', 'Tunde', 'Kemi', 'Femi'] as [string, string, string, string],
      },
      {
        q: 'Where did we meet?',
        options: ['Yaba', 'Ikeja', 'Lekki', 'Surulere'] as [string, string, string, string],
      },
      {
        q: 'My favourite food?',
        options: ['Jollof', 'Suya', 'Egusi', 'Amala'] as [string, string, string, string],
      },
    ];
    const r = run(w, 'u_founder', {
      type: 'game.create',
      kind: 'quiz',
      where: 'home',
      stake: 20_000,
      invite: ['u_inv', 'u_two'],
      quiz: { custom, count: 3 },
    });
    w = r.world;
    const id = r.result.gameId as string;
    expect(w.games![id]!.hostPlays).toBe(false);
    expect(w.games![id]!.players).toHaveLength(0);
    // Not invited: can't join a home game.
    w = addInvestor(w, 'u_out', 'lagos');
    expect(tryRun(w, 'u_out', { type: 'game.join', gameId: id }).ok).toBe(false);
    w = run(w, 'u_inv', { type: 'game.join', gameId: id }).world;
    w = run(w, 'u_two', { type: 'game.join', gameId: id }).world;
    expect(tryRun(w, 'u_inv', { type: 'game.start', gameId: id }, T0 + 5).ok).toBe(false);
    w = run(w, 'u_founder', { type: 'game.start', gameId: id }, T0 + 10).world;
    // The host can't answer their own questions.
    let g = w.games![id]!;
    const open0 = g.startedAt! + QUIZ.leadMs + 500;
    expect(
      tryRun(
        w,
        'u_founder',
        { type: 'game.play', gameId: id, move: { k: 'answer', q: 0, choice: 0 } },
        open0,
      ).ok,
    ).toBe(false);
    let now = open0;
    for (let i = 0; i < 3; i++) {
      g = w.games![id]!;
      const right = rightSlot(g.quiz!.questions[i]!);
      w = run(
        w,
        'u_two',
        { type: 'game.play', gameId: id, move: { k: 'answer', q: i, choice: right } },
        now,
      ).world;
      w = run(
        w,
        'u_inv',
        { type: 'game.play', gameId: id, move: { k: 'answer', q: i, choice: right } },
        now + 2000,
      ).world;
      now = w.games![id]!.quiz!.closeAt[i]! + QUIZ.revealMs + 300;
    }
    w = run(w, 'u_founder', { type: 'game.finish', gameId: id }, now + 60_000).world;
    g = w.games![id]!;
    // Both right every time, but u_two was quicker.
    expect(g.result!.winners).toEqual(['u_two']);
    expect(g.result!.payouts.u_two).toBe(40_000);
    expect(moneyByCurrency(w)).toEqual(total);
    // A rematch invites them both again.
    const re = run(w, 'u_two', { type: 'game.rematch', gameId: id }, now + 70_000);
    expect(re.world.games![id]!.rematchId).toBe(re.result.gameId);
  });
});

describe('pool against an AI player', () => {
  it('plays shot by shot on the server until someone pots the 8', () => {
    let w = world3();
    const total = moneyByCurrency(w);
    const bar = barOf(w);
    const r = run(w, 'u_founder', {
      type: 'game.create',
      kind: 'pool',
      where: 'venue',
      businessId: bar.id,
      stake: 5_000,
      ai: 1,
      aiSkill: 3,
    });
    w = r.world;
    const id = r.result.gameId as string;
    expect(w.games![id]!.status).toBe('playing');
    let now = T0 + 1000;
    for (let i = 0; i < 300 && w.games![id]!.status === 'playing'; i++) {
      const st = w.games![id]!.pool!;
      expect(st.turn).toBe('u_founder');
      const cue = st.balls.find(([n]) => n === 0) ?? [0, 49.5, 148.5];
      const target = st.balls.find(([n]) => n !== 0)!;
      w = run(
        w,
        'u_founder',
        {
          type: 'game.play',
          gameId: id,
          move: { k: 'shot', dx: target[1] - cue[1], dy: target[2] - cue[2], power: 0.55 },
        },
        (now += 5000),
      ).world;
      expect(negativeInternalAccounts(w)).toEqual([]);
    }
    const g = w.games![id]!;
    expect(g.status).toBe('settled');
    expect(g.result!.winners.length).toBeGreaterThan(0);
    // The AI took shots of its own.
    expect(g.pool!.recent.some((s) => s.by !== 'u_founder')).toBe(true);
    expect(escrow(w)).toBe(0);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('refuses a shot out of turn and a client claiming a win', () => {
    let w = world3();
    const bar = barOf(w);
    const r = run(w, 'u_founder', {
      type: 'game.create',
      kind: 'pool',
      where: 'venue',
      businessId: bar.id,
      stake: 0,
      invite: ['u_inv'],
    });
    w = run(r.world, 'u_inv', { type: 'game.join', gameId: r.result.gameId }).world;
    expect(w.games![r.result.gameId]!.status).toBe('playing');
    const shot: Command = {
      type: 'game.play',
      gameId: r.result.gameId,
      move: { k: 'shot', dx: 0, dy: -1, power: 1 },
    };
    expect(tryRun(w, 'u_inv', shot).ok).toBe(false);
    expect(tryRun(w, 'u_inv', { type: 'game.finish', gameId: r.result.gameId }).ok).toBe(false);
    // After the shot clock runs out, the waiting player can claim it.
    const late = T0 + 10 * 60_000;
    const f = run(w, 'u_inv', { type: 'game.finish', gameId: r.result.gameId }, late).world;
    expect(f.games![r.result.gameId]!.result!.winners).toEqual(['u_inv']);
    expect(f.games![r.result.gameId]!.result!.reason).toBe('timeout');
  });
});

describe('football on the TV with a guest', () => {
  it('runs a shootout from secret kicks and dives, and pays the winner', () => {
    let w = world3();
    const total = moneyByCurrency(w);
    // u_inv comes over to the founder's place.
    let r = run(w, 'u_founder', { type: 'visit.invite', toPlayerId: 'u_inv' });
    w = run(r.world, 'u_inv', { type: 'visit.accept', inviteId: r.result.inviteId }).world;
    // The guest suggests a game at the host's place.
    r = run(w, 'u_inv', {
      type: 'game.create',
      kind: 'football',
      where: 'home',
      stake: 8_000,
      invite: ['u_founder'],
    });
    w = r.world;
    const id = r.result.gameId as string;
    expect(w.games![id]!.homeOf).toBe('u_founder');
    w = run(w, 'u_founder', { type: 'game.join', gameId: id }).world;
    expect(w.games![id]!.status).toBe('playing');
    let now = T0 + 100;
    for (let i = 0; i < 30 && w.games![id]!.status === 'playing'; i++) {
      const k = w.games![id]!.football!.kicks.at(-1)!;
      // The view never shows the other side's move before the kick.
      w = run(
        w,
        k.shooter,
        { type: 'game.play', gameId: id, move: { k: 'kick', x: 0.85, y: 0.5, power: 0.6 } },
        (now += 1000),
      ).world;
      const v = gameView(w, id, k.keeper, now)!;
      expect(v.football!.kicks.at(-1)!.shot).toBeNull();
      w = run(
        w,
        k.keeper,
        { type: 'game.play', gameId: id, move: { k: 'dive', x: -0.6, y: 0.4 } },
        (now += 1000),
      ).world;
    }
    const g = w.games![id]!;
    expect(g.status).toBe('settled');
    const paid = Object.values(g.result!.payouts).reduce((a, b) => a + b, 0);
    expect(paid).toBe(16_000);
    expect(moneyByCurrency(w)).toEqual(total);
  });
});

describe('darts against an AI player', () => {
  it('throws nine darts each and the higher total wins', () => {
    let w = world3();
    const total = moneyByCurrency(w);
    const r = run(w, 'u_founder', {
      type: 'game.create',
      kind: 'darts',
      where: 'venue',
      businessId: barOf(w).id,
      stake: 3_000,
      ai: 1,
    });
    w = r.world;
    const id = r.result.gameId as string;
    for (let i = 0; i < 9; i++)
      w = run(
        w,
        'u_founder',
        { type: 'game.play', gameId: id, move: { k: 'throw', x: 0, y: -0.6 } },
        T0 + i * 1000,
      ).world;
    const g = w.games![id]!;
    expect(g.status).toBe('settled');
    expect(Object.values(g.darts!.throws).every((t) => t.length === 9)).toBe(true);
    expect(moneyByCurrency(w)).toEqual(total);
  });
});

describe('leaderboards and streaks', () => {
  it('counts wins per city and game, and a streak lifts your stars', () => {
    let w = world3();
    const bar = barOf(w);
    const stars0 = w.players.u_founder!.stars.value;
    for (let n = 0; n < 3; n++) {
      const r = run(w, 'u_founder', {
        type: 'game.create',
        kind: 'pool',
        where: 'venue',
        businessId: bar.id,
        stake: 0,
        invite: ['u_inv'],
      });
      w = run(r.world, 'u_inv', { type: 'game.join', gameId: r.result.gameId }).world;
      w = run(w, 'u_inv', { type: 'game.leave', gameId: r.result.gameId }).world; // concedes
    }
    const st = w.gameStats!.lagos!.pool!.u_founder!;
    expect(st).toMatchObject({ played: 3, wins: 3, streak: 3, best: 3 });
    expect(w.players.u_founder!.stars.value).toBeGreaterThanOrEqual(stars0);
    const view = dispatch(w, { type: 'inbox.read' }, { actorId: 'u_founder', now: T0 }).world;
    expect(view.gameStats!.lagos!.pool!.u_inv!.wins).toBe(0);
    expect(GAMES.maxActive).toBeGreaterThan(1);
    void DAY;
  });
});

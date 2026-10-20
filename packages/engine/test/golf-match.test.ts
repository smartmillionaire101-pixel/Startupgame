import { describe, expect, it } from 'vitest';
import { dispatch } from '../src/dispatch.js';
import type { Command } from '../src/commands.js';
import { createWorld } from '../src/world.js';
import type { World } from '../src/types.js';
import { playerView } from '../src/views.js';
import {
  AUTO_QUIZ_FROM,
  GOLF_AI_ACCEPT_AFTER,
  GOLF_AUTO_POWER,
  GOLF_PICKUP_OVER,
  GOLF_SHOT_MS,
  aiGolfShot,
} from '../src/play.js';
import { golfCourse } from '../src/data/leisure.js';
import { defaultAim, clubFor, hit, holeGeo, strokeRng } from '../src/golf-physics.js';
import { moneyByCurrency } from './helpers.js';

/**
 * Golf with a friend for money: the stakes go into the "Social game pot"
 * escrow (the host's on invite, the friend's on accept), the engine plays
 * every ball from the shot inputs, and the lowest total takes the pot.
 */
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
  for (const [id, market] of [
    ['host', 'lagos'],
    ['ada', 'lagos'],
    ['zed', 'lagos'],
    ['lon', 'london'],
  ] as const)
    w = run(w, id, {
      type: 'player.create',
      handle: `h_${id}`,
      name: `Player ${id}`,
      role: 'founder',
      backgroundId: 'f-engineer',
      market,
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

const balanceOf = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const options = (w: World, id = 'host') => playerView(w, id)!.me.golf.match;
const STAKE = 2_000_000; // ₦20,000

function invite(w: World, friend: string, stake = STAKE, holes?: number, now = T1) {
  const made = run(
    w,
    'host',
    {
      type: 'play.create',
      game: 'golf',
      venue: options(w).venue,
      title: 'Golf with a friend',
      stake,
      invite: friend,
      ...(holes ? { holes } : {}),
    },
    now,
  );
  return { w: made.world, id: made.result.id as string };
}

/** Play the match out: humans take the AI's line (or `human`), the AI plays on sync. */
function playOut(
  w: World,
  id: string,
  start: number,
  human?: (w: World, who: string) => Partial<Extract<Command, { type: 'play.golf' }>>,
) {
  let now = start;
  for (let i = 0; i < 300; i++) {
    const r = w.playRooms![id]!;
    if (r.status !== 'playing') break;
    const v = playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;
    const who = v.turn!;
    if (v.ai.includes(who)) {
      now = Math.max(now, v.aiDueAt!);
      w = run(w, 'host', { type: 'play.sync', roomId: id }, now).world;
    } else {
      now += 2_000;
      const s = aiGolfShot(w, r, who);
      w = run(
        w,
        who,
        {
          type: 'play.golf',
          roomId: id,
          round: r.round,
          club: s.club as 'putter',
          aim: s.aim,
          power: s.power,
          ...human?.(w, who),
        },
        now,
      ).world;
    }
  }
  return { w, now };
}

describe('golf with a friend: the invitation and the escrow', () => {
  it('offers stake chips scaled to the city, capped at a month of living costs', () => {
    const o = options(world());
    // Lagos: free, ₦5k, ₦20k, ₦50k (minor units).
    expect(o.stakes).toEqual([0, 500_000, 2_000_000, 5_000_000]);
    expect(o.maxStake).toBe(45_000_000);
    expect(o.friends.length).toBeGreaterThan(0);
    for (const f of o.friends) expect(f.handicap).toBeGreaterThanOrEqual(0);
  });

  it('the host’s stake goes into the pot on invite, the friend’s on accept; both pay their green fee', () => {
    const w0 = world();
    const fee = playerView(w0, 'host')!.me.golf.fee;
    const total0 = moneyByCurrency(w0);
    const { w: w1, id } = invite(w0, 'ada');
    const r1 = w1.playRooms![id]!;
    expect(r1.status).toBe('waiting');
    expect(balanceOf(w1, 'host')).toBe(balanceOf(w0, 'host') - STAKE);
    expect(w1.accounts[r1.escrow]!.balance).toBe(STAKE);
    expect(w1.accounts[r1.escrow]!.label).toBe('Social game pot');
    // Ada sees the invite card (and an inbox note).
    const card = playerView(w1, 'ada')!.playRooms.find((x) => x.id === id)!;
    expect(card.golf!.invite).toBe('ada');
    expect(card.pot).toBe(STAKE);
    expect(w1.inbox.ada![0]!.text).toMatch(/invites you to golf/);
    // Nobody else may take her place.
    expect(tryRun(w1, 'zed', { type: 'play.join', roomId: id }).ok).toBe(false);

    const w2 = run(w1, 'ada', { type: 'play.join', roomId: id }, T1 + 5_000).world;
    const r2 = w2.playRooms![id]!;
    expect(r2.status).toBe('playing');
    expect(w2.accounts[r2.escrow]!.balance).toBe(2 * STAKE);
    expect(balanceOf(w2, 'ada')).toBe(balanceOf(w0, 'ada') - STAKE - fee);
    expect(balanceOf(w2, 'host')).toBe(balanceOf(w0, 'host') - STAKE - fee);
    expect(r2.deadline).toBe(T1 + 5_000 + GOLF_SHOT_MS);
    expect(moneyByCurrency(w2)).toEqual(total0);
    const memos = playerView(w2, 'ada')!.accounts.local!.recent.map((x) => x.memo);
    expect(memos.join(' ')).toMatch(/Social game entry/);
    expect(memos.join(' ')).toMatch(/Green fee/);
  });

  it('a decline gives the host their stake back', () => {
    const w0 = world();
    const { w: w1, id } = invite(w0, 'ada');
    expect(tryRun(w1, 'zed', { type: 'play.decline', roomId: id }).ok).toBe(false);
    const w2 = run(w1, 'ada', { type: 'play.decline', roomId: id }).world;
    expect(w2.playRooms![id]!.status).toBe('cancelled');
    expect(balanceOf(w2, 'host')).toBe(balanceOf(w0, 'host'));
    expect(w2.accounts[w2.playRooms![id]!.escrow]!.balance).toBe(0);
    expect(w2.inbox.host![0]!.text).toMatch(/declined/);
  });

  it('no answer in 30 minutes: the room expires and the host is refunded', () => {
    const w0 = world();
    const { w: w1, id } = invite(w0, 'ada');
    const later = T1 + 31 * 60_000;
    // Any command reaching the world runs the expiry first.
    const w2 = run(w1, 'host', { type: 'play.sync', roomId: id }, later);
    expect(w2.result).toBeTruthy();
    expect(w2.world.playRooms![id]!.status).toBe('cancelled');
    expect(balanceOf(w2.world, 'host')).toBe(balanceOf(w0, 'host'));
    expect(tryRun(w2.world, 'ada', { type: 'play.join', roomId: id }, later).ok).toBe(false);
  });

  it('same city and currency, like every staked room', () => {
    const w0 = world();
    const away = tryRun(w0, 'host', {
      type: 'play.create',
      game: 'golf',
      venue: options(w0).venue,
      title: 'Golf with a friend',
      stake: STAKE,
      invite: 'lon',
    });
    expect(!away.ok && away.error.code).toBe('play.city');
    // A Londoner visiting Lagos holds pounds: a staked match needs naira.
    let w = run(w0, 'lon', { type: 'travel.fly', to: 'lagos' }).world;
    const staked = tryRun(w, 'host', {
      type: 'play.create',
      game: 'golf',
      venue: options(w).venue,
      title: 'Golf with a friend',
      stake: STAKE,
      invite: 'lon',
    });
    expect(!staked.ok && staked.error.code).toBe('play.currency');
    w = invite(w, 'lon', 0).w;
    expect(Object.values(w.playRooms!).some((r) => r.golf?.invite === 'lon')).toBe(true);
    const capped = tryRun(w0, 'host', {
      type: 'play.create',
      game: 'golf',
      venue: options(w0).venue,
      title: 'Golf with a friend',
      stake: options(w0).maxStake + 100,
      invite: 'ada',
    });
    expect(!capped.ok && capped.error.code).toBe('play.stake');
  });
});

describe('golf with a friend: the match, played out by the engine', () => {
  it('the lowest total takes the pot in one transfer ("Social game winnings")', () => {
    const w0 = world();
    const fee = playerView(w0, 'host')!.me.golf.fee;
    const total0 = moneyByCurrency(w0);
    const made = invite(w0, 'ada', STAKE, 1);
    const id = made.id;
    let w = made.w;
    w = run(w, 'ada', { type: 'play.join', roomId: id }, T1 + 1_000).world;
    // Ada plays well; the host barely touches the ball (and picks up at par + 3).
    w = playOut(w, id, T1 + 1_000, (_w, who) =>
      who === 'host' ? { power: 6, club: 'chip' } : {},
    ).w;
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    const par = golfCourse('lagos').holes[0]!.par;
    expect(r.golf!.players.host!.card).toEqual([par + GOLF_PICKUP_OVER]);
    expect(r.golf!.players.ada!.card[0]).toBeLessThan(par + GOLF_PICKUP_OVER);
    expect(r.winners).toEqual(['ada']);
    expect(w.accounts[r.escrow]!.balance).toBe(0);
    expect(balanceOf(w, 'ada')).toBe(balanceOf(w0, 'ada') - STAKE - fee + 2 * STAKE);
    expect(balanceOf(w, 'host')).toBe(balanceOf(w0, 'host') - STAKE - fee);
    const lines = playerView(w, 'ada')!.accounts.local!.recent.map(
      (x: { memo: string; amount: number }) => `${x.memo}:${x.amount}`,
    );
    expect(lines).toContain(`Social game winnings:${2 * STAKE}`);
    expect(moneyByCurrency(w)).toEqual(total0);
  });

  it('a tie returns both stakes', () => {
    const w0 = world();
    const fee = playerView(w0, 'host')!.me.golf.fee;
    const made = invite(w0, 'ada', STAKE, 2);
    const id = made.id;
    let w = made.w;
    w = run(w, 'ada', { type: 'play.join', roomId: id }, T1 + 1_000).world;
    // Both pick up every hole: par + 3 each, level.
    w = playOut(w, id, T1 + 1_000, () => ({ pickup: true })).w;
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(r.members.map((m) => m.score)).toEqual([
      r.golf!.pars[0]! + r.golf!.pars[1]! + 6,
      r.golf!.pars[0]! + r.golf!.pars[1]! + 6,
    ]);
    expect([...r.winners].sort()).toEqual(['ada', 'host']);
    expect(balanceOf(w, 'host')).toBe(balanceOf(w0, 'host') - fee);
    expect(balanceOf(w, 'ada')).toBe(balanceOf(w0, 'ada') - fee);
  });

  it('a timed-out shot clock plays a soft stroke, decided when the next command arrives', () => {
    const w0 = world();
    const made = invite(w0, 'ada', STAKE, 1);
    const id = made.id;
    let w = made.w;
    w = run(w, 'ada', { type: 'play.join', roomId: id }, T1).world;
    const late = T1 + GOLF_SHOT_MS + 1;
    // The host's shot sent after the clock: refused as late, the soft shot stands.
    const sent = run(
      w,
      'host',
      { type: 'play.golf', roomId: id, round: 0, club: 'driver', aim: 0, power: 95 },
      late,
    );
    expect(sent.result).toEqual({ late: true });
    const r = sent.world.playRooms![id]!;
    expect(r.golf!.shots).toHaveLength(1);
    const s = r.golf!.shots[0]!;
    expect(s).toMatchObject({ by: 'host', auto: 'timeout', power: GOLF_AUTO_POWER, stroke: 0 });
    expect(r.round).toBe(1);
    // The next clock runs from the old deadline: deterministic, whatever the poll timing.
    expect(r.deadline).toBe(T1 + 2 * GOLF_SHOT_MS);
    // The same command at the same time gives the very same ball.
    const again = run(w, 'ada', { type: 'play.sync', roomId: id }, late).world;
    expect(again.playRooms![id]!.golf!.shots[0]).toEqual(s);
    // A whole missed minute later: both clocks ran out, in order.
    const both = run(w, 'ada', { type: 'play.sync', roomId: id }, T1 + 2 * GOLF_SHOT_MS + 5).world;
    expect(both.playRooms![id]!.golf!.shots.map((x) => x.by)).toEqual(['host', 'ada']);
  });

  it('turns: only the player away from the hole may play; scores are never taken from the client', () => {
    const w0 = world();
    const made = invite(w0, 'ada', 0, 1);
    const id = made.id;
    let w = made.w;
    w = run(w, 'ada', { type: 'play.join', roomId: id }, T1).world;
    const wrong = tryRun(w, 'ada', {
      type: 'play.golf',
      roomId: id,
      round: 0,
      club: 'driver',
      aim: 0,
      power: 90,
    });
    expect(!wrong.ok && wrong.error.code).toBe('play.turn');
    const r0 = w.playRooms![id]!;
    const g = holeGeo(golfCourse('lagos').holes[0]!);
    const club = clubFor(g.length, 'tee');
    const aim = defaultAim(g, g.tee, club, 'tee');
    w = run(
      w,
      'host',
      { type: 'play.golf', roomId: id, round: 0, club: club.id as 'driver', aim, power: 92 },
      T1 + 1_000,
    ).world;
    const shot = w.playRooms![id]!.golf!.shots[0]!;
    // The engine's ball is the shared physics, seeded per room, player, hole and stroke.
    const expected = hit(
      g,
      g.tee,
      'tee',
      club,
      92,
      aim,
      strokeRng(`${w.seed}:${id}:host`, 0, 0),
      r0.golf!.players.host!.skill,
    );
    expect(shot.rest).toEqual(expected.rest);
    expect(shot.carry).toBe(expected.carry);
    expect(shot.lie).toBe(expected.lie);
    // Ada (still on the tee, farthest away) is next.
    expect(playerView(w, 'host')!.playRooms.find((x) => x.id === id)!.turn).toBe('ada');
  });
});

describe('golf with a friend: an AI friend', () => {
  it('accepts after a short pause, pays its stake and green fee, and plays its shots on the server', () => {
    const w0 = world();
    const total0 = moneyByCurrency(w0);
    const friend = options(w0).friends[0]!;
    const fee = playerView(w0, 'host')!.me.golf.fee;
    const made = invite(w0, friend.id, STAKE, 1);
    const id = made.id;
    let w = made.w;
    const before = balanceOf(w0, friend.id);
    // Too early: still waiting.
    w = run(w, 'host', { type: 'play.sync', roomId: id }, T1 + 1_000).world;
    expect(w.playRooms![id]!.status).toBe('waiting');
    const v = playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;
    expect(v.aiDueAt).toBe(T1 + GOLF_AI_ACCEPT_AFTER);
    expect(v.golf!.inviteHandicap).toBe(friend.handicap);
    w = run(w, 'host', { type: 'play.sync', roomId: id }, T1 + GOLF_AI_ACCEPT_AFTER).world;
    const r = w.playRooms![id]!;
    expect(r.status).toBe('playing');
    expect(r.ai).toEqual([friend.id]);
    expect(w.accounts[r.escrow]!.balance).toBe(2 * STAKE);
    expect(balanceOf(w, friend.id)).toBe(before - STAKE - fee);
    const done = playOut(w, id, T1 + GOLF_AI_ACCEPT_AFTER).w;
    const end = done.playRooms![id]!;
    expect(end.status).toBe('finished');
    expect(end.golf!.shots.some((s) => s.by === friend.id && s.auto === 'ai')).toBe(true);
    expect(done.accounts[end.escrow]!.balance).toBe(0);
    expect(moneyByCurrency(done)).toEqual(total0);
    // Replays the same.
    expect(playOut(w, id, T1 + GOLF_AI_ACCEPT_AFTER).w.playRooms![id]).toEqual(end);
  });

  it('an AI friend must hold four times the stake (the existing rule), plus its green fee', () => {
    const w0 = structuredClone(world()) as World;
    const friend = options(w0).friends[0]!;
    const fee = playerView(w0, 'host')!.me.golf.fee;
    // Leave the friend with just under four stakes and a fee.
    w0.accounts[w0.players[friend.id]!.accounts.local]!.balance = STAKE * 4 + fee - 1;
    const make = (w: World) =>
      tryRun(w, 'host', {
        type: 'play.create',
        game: 'golf',
        venue: options(w).venue,
        title: 'Golf with a friend',
        stake: STAKE,
        invite: friend.id,
      });
    const r = make(w0);
    expect(!r.ok && r.error.code).toBe('play.ai');
    w0.accounts[w0.players[friend.id]!.accounts.local]!.balance = STAKE * 4 + fee;
    expect(make(w0).ok).toBe(true);
  });
});

describe('solo golf is unchanged', () => {
  it('golf.round replays exactly as it did before the match came in', () => {
    const T0 = Date.UTC(2026, 9, 3, 12, 0, 0);
    let w = createWorld({
      seed: 42,
      now: T0,
      markets: ['lagos', 'nairobi', 'london'],
      aiStartupsPerMarket: 6,
    });
    w = run(
      w,
      'u_founder',
      {
        type: 'player.create',
        handle: 'h_u_founder',
        name: 'Ada Founder',
        role: 'founder',
        backgroundId: 'f-engineer',
        market: 'lagos',
        company: {
          name: 'Paylink',
          industry: 'fintech',
          revenueModel: 'subscription',
          idea: 'Payments for market traders',
          incorporation: 'local',
        },
      },
      T0,
    ).world;
    const start = balanceOf(w, 'u_founder');
    const cards = [
      [5, 4, 6],
      [4, 3, 5],
      [20, 1, 9],
    ];
    const out = [];
    for (const [i, strokes] of cards.entries()) {
      const r = run(w, 'u_founder', { type: 'golf.round', strokes }, T0 + (i + 1) * 60_000);
      w = r.world;
      out.push(r.result);
    }
    // The figures the engine gave at 8020a04, before golf matches existed.
    expect(out.map((r) => [r.total, r.vsPar, r.fee, r.best, r.rounds, r.met])).toEqual([
      [15, 3, 1_350_000, 3, 1, null],
      [12, 0, 1_350_000, 0, 2, null],
      [20, 8, 1_350_000, 0, 3, null],
    ]);
    expect(out[0].message).toBe(
      '3 holes at Ikoyi Golf and Polo Club: 15 (3 over par). Green fee ₦13.5k.',
    );
    expect(out[2].strokes).toEqual([10, 1, 9]);
    expect(balanceOf(w, 'u_founder')).toBe(start - 3 * 1_350_000);
    expect(w.playRooms ?? {}).toEqual({});
  });
});

describe('golf with a friend: one invitation at a time', () => {
  it('a friend already asked to another match is not free (and not offered)', () => {
    const w0 = world();
    const friend = options(w0).friends[0]!;
    const { w } = invite(w0, friend.id, 0, 1);
    expect(options(w, 'zed').friends.map((f) => f.id)).not.toContain(friend.id);
    const again = tryRun(w, 'zed', {
      type: 'play.create',
      game: 'golf',
      venue: options(w, 'zed').venue,
      title: 'Golf with a friend',
      stake: 0,
      invite: friend.id,
    });
    expect(!again.ok && again.error.code).toBe('play.busy');
  });
});

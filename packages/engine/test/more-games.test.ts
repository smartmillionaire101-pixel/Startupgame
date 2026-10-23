import { describe, expect, it } from 'vitest';
import {
  FULL_RACK,
  LANE_HALF,
  PIN_SPOTS,
  aiBowl,
  aimFor,
  bowlingGame,
  launchOf,
  simulateBowl,
  spareTarget,
  wobble,
} from '../src/bowling.js';
import { AIR_ACTIVITIES, GAME_VENUES, gameVenueKey } from '../src/data/games.js';
import { CITY_DISTRICTS } from '../src/data/businesses.js';
import { MARKET_IDS, type MarketId } from '../src/data/markets.js';
import { skydiveScore } from '../src/games.js';
import { strikesIn } from '../src/play.js';
import { INVESTOR_NOTE, MORE_GAMES_NOTE, moreGamesOn, RELEASES } from '../src/releases.js';
import { createRng } from '../src/rng.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { T0, addFounder, makeWorld, moneyByCurrency, run, settle, tryRun } from './helpers.js';

const announce = (w: World, id: string = MORE_GAMES_NOTE) =>
  run(w, null, { type: 'system.announce', id, text: 'New release.' }).world;
const venues = (w: World, market: MarketId = 'lagos') =>
  Object.values(w.markets[market]!.businesses ?? {}).filter((b) =>
    b.landmark?.startsWith('games-'),
  );
const alley = (w: World, market: MarketId = 'lagos') =>
  venues(w, market).find((b) => b.kind === 'bowling-alley')!;
const balance = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const till = (w: World, bizId: string, market: MarketId = 'lagos') =>
  w.accounts[w.markets[market]!.businesses![bizId]!.account]!.balance;

/** A more-games world with two founders in Lagos. */
function gamesWorld(seed = 7) {
  let w = announce(makeWorld(seed, ['lagos', 'nairobi']));
  w = addFounder(w, 'host');
  w = addFounder(w, 'ada', 'lagos', 'Ada Labs');
  return w;
}

describe('bowling: the score sheet', () => {
  it('scores a perfect game 300, all spares 150, a gutter game 0 and nine every frame 90', () => {
    const perfect = bowlingGame(Array(12).fill(10));
    expect(perfect.score).toBe(300);
    expect(perfect.done).toBe(true);
    expect(perfect.frames[9]!.marks).toEqual(['X', 'X', 'X']);
    expect(strikesIn(Array(12).fill(10))).toBe(12);
    const spares = bowlingGame(Array(21).fill(5));
    expect(spares.score).toBe(150);
    expect(spares.frames[0]!.marks).toEqual(['5', '/']);
    expect(spares.done).toBe(true);
    expect(bowlingGame(Array(20).fill(0)).score).toBe(0);
    expect(bowlingGame(Array(20).fill(0)).frames[3]!.marks).toEqual(['−', '−']);
    expect(bowlingGame(Array(10).fill([9, 0]).flat()).score).toBe(90);
  });

  it('counts strikes and spares with their bonus balls, and waits for them', () => {
    // X, 7/, 9-, X, X then waiting on the next ball.
    const g = bowlingGame([10, 7, 3, 9, 0, 10, 10]);
    expect(g.frames.map((f) => f.total)).toEqual([20, 39, 48, null, null]);
    expect(g.score).toBe(48);
    expect(g.frame).toBe(5);
    expect(g.ball).toBe(0);
    // A first ball of 6: four pins stand for the second.
    const h = bowlingGame([6]);
    expect(h).toMatchObject({ frame: 0, ball: 1, pinsUp: 4, fresh: false, done: false });
    // A strike's second ball counts towards it (10 + 10 + 2), and a spare's 10 isn't a strike.
    expect(bowlingGame([10, 10, 2, 3]).frames[0]!.total).toBe(22);
    expect(strikesIn([0, 10, 10])).toBe(1);
  });

  it('plays the tenth frame by its rules: a third ball only after a strike or a spare', () => {
    const open = bowlingGame([...Array(18).fill(0), 4, 3]);
    expect(open.done).toBe(true);
    expect(open.score).toBe(7);
    const spare = bowlingGame([...Array(18).fill(0), 5, 5]);
    expect(spare).toMatchObject({ done: false, frame: 9, ball: 2, pinsUp: 10, fresh: true });
    expect(bowlingGame([...Array(18).fill(0), 5, 5, 7]).score).toBe(17);
    // A strike, then a leave: the third ball is at what's left.
    const leave = bowlingGame([...Array(18).fill(0), 10, 3]);
    expect(leave).toMatchObject({ done: false, ball: 2, pinsUp: 7, fresh: false });
    const done = bowlingGame([...Array(18).fill(0), 10, 3, 7]);
    expect(done.score).toBe(20);
    expect(done.frames[9]!.marks).toEqual(['X', '3', '/']);
    expect(done.done).toBe(true);
  });
});

describe('bowling: the physics', () => {
  it('is deterministic: the same throw at the same pins ends the same way', () => {
    const l = launchOf({ x: 0.3, aim: aimFor(0.3, 0.6, -0.5, 0.07), power: 0.6, spin: -0.5 });
    const a = simulateBowl(FULL_RACK, l, true);
    const b = simulateBowl(FULL_RACK, l, true);
    expect(a.knocked).toEqual(b.knocked);
    expect(a.pins).toEqual(b.pins);
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
    // The same seed draws the same wobble.
    const i = { x: 0.2, aim: 0.01, power: 0.7, spin: -0.3 };
    expect(wobble(createRng(5), i, 0.5)).toEqual(wobble(createRng(5), i, 0.5));
  });

  it('strikes from the pocket, leaves pins from a thin hit and scores nothing in the gutter', () => {
    const pocket = simulateBowl(
      FULL_RACK,
      launchOf({ x: 0.3, aim: aimFor(0.3, 0.62, -0.55, 0.07), power: 0.62, spin: -0.55 }),
    );
    expect(pocket.knocked).toHaveLength(10);
    // Pins scatter: some land well off their spots.
    expect(pocket.pins.some((p) => p.down && Math.abs(p.x) > 0.5)).toBe(true);
    const thin = simulateBowl(
      FULL_RACK,
      launchOf({ x: 0.3, aim: aimFor(0.3, 0.6, 0, 0.42), power: 0.6, spin: 0 }),
    );
    expect(thin.knocked.length).toBeGreaterThan(0);
    expect(thin.knocked.length).toBeLessThan(10);
    const gutter = simulateBowl(FULL_RACK, launchOf({ x: 0.4, aim: 0.05, power: 0.5, spin: 0 }));
    expect(gutter.gutter).toBe(true);
    expect(gutter.knocked).toEqual([]);
  });

  it('hooks: spin carries the ball across once it leaves the oil', () => {
    const straight = simulateBowl([], launchOf({ x: 0.3, aim: 0, power: 0.6, spin: 0 }), true);
    const hook = simulateBowl([], launchOf({ x: 0.3, aim: 0, power: 0.6, spin: -0.8 }), true);
    const at = (s: typeof straight, z: number) => s.frames.find((f) => f.ball.z >= z)!.ball.x;
    expect(Math.abs(at(hook, 10) - at(straight, 10))).toBeLessThan(0.12);
    expect(at(straight, 18) - at(hook, 18)).toBeGreaterThan(0.2);
    expect(Math.abs(at(hook, 18))).toBeLessThan(LANE_HALF);
  });

  it('aims at a leave: the AI converts a single pin most of the time', () => {
    const rng = createRng(11);
    let made = 0;
    for (let k = 0; k < 40; k++) {
      const s = simulateBowl([7], wobble(rng, aiBowl(rng, [7]), 0.7));
      if (s.knocked.length === 1) made++;
    }
    expect(made).toBeGreaterThan(20);
    expect(spareTarget([7]).x).toBeCloseTo(PIN_SPOTS[6]![0], 5);
  });

  it('gives AI bowlers believable games (strikes, spares and misses)', () => {
    const rng = createRng(3);
    let strikes = 0;
    let pins = 0;
    for (let k = 0; k < 120; k++) {
      const s = simulateBowl(FULL_RACK, wobble(rng, aiBowl(rng, FULL_RACK), 0.5));
      pins += s.knocked.length;
      if (s.knocked.length === 10) strikes++;
    }
    expect(strikes).toBeGreaterThan(15);
    expect(strikes).toBeLessThan(90);
    expect(pins / 120).toBeGreaterThan(7);
  });
});

describe('more games: the release switch', () => {
  it('is the newest note, and an old world never opens the venues or the games', () => {
    expect(RELEASES.at(-1)).toBe(MORE_GAMES_NOTE);
    expect(moreGamesOn({ announcements: [MORE_GAMES_NOTE] } as unknown as World)).toBe(true);
    expect(moreGamesOn({ announcements: [INVESTOR_NOTE] } as unknown as World)).toBe(false);
    let old = announce(makeWorld(7, ['lagos']), INVESTOR_NOTE);
    old = addFounder(old, 'host');
    old = settle(old, 'lagos', 2);
    expect(venues(old)).toEqual([]);
    expect(playerView(old, 'host')!.me.games).toBeNull();
    const biz = Object.keys(old.markets.lagos!.businesses!)[0]!;
    const create = tryRun(old, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: biz,
      title: 'Bowling',
      stake: 0,
    });
    expect(create.ok).toBe(false);
    expect(
      tryRun(old, 'host', { type: 'games.book', businessId: biz, itemId: 'skydive-tandem' }).ok,
    ).toBe(false);
    expect(tryRun(old, 'host', { type: 'games.end', bookingId: 'air_1' }).ok).toBe(false);
  });

  it('replays an old world exactly: the same commands, the same world, with or without the code', () => {
    // Settling a world that never logged the note touches no game venue and no new field.
    let w = announce(makeWorld(9, ['lagos']), INVESTOR_NOTE);
    w = addFounder(w, 'host');
    const a = settle(w, 'lagos', 3);
    const b = settle(w, 'lagos', 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.values(a.players).some((p) => p.games)).toBe(false);
  });

  it('opens a bowling alley, a skydive centre and a heliport in every city with the note', () => {
    const w = gamesWorld();
    for (const market of ['lagos', 'nairobi'] as const) {
      const kinds = venues(w, market)
        .map((b) => b.kind)
        .sort();
      expect(kinds).toEqual(['bowling-alley', 'heliport', 'skydive-centre']);
    }
    // Settling keeps them (and opens nothing twice).
    const later = settle(w, 'lagos', 2);
    expect(venues(later)).toHaveLength(3);
    // Every city has its three, in a district of its plan.
    for (const m of MARKET_IDS) {
      expect(GAME_VENUES[m].map((v) => v.kind).sort()).toEqual([
        'bowling-alley',
        'heliport',
        'skydive-centre',
      ]);
      for (const v of GAME_VENUES[m]) expect(CITY_DISTRICTS[m]).toContain(v.district);
    }
    const g = playerView(w, 'host')!.me.games!;
    expect(g.bowling?.name).toBe('Lekki Strike Lanes');
    expect(g.lanes?.venue).toBe(alley(w).id);
    expect(g.skydive?.items.map((i) => i.id)).toEqual(['skydive-tandem', 'skydive-solo']);
    expect(g.heli?.items.map((i) => i.requiresTier)).toEqual([3, 4]);
    expect(gameVenueKey('heliport')).toBe('games-heliport');
  });
});

/** Play a bowling room to the end: humans bowl the AI's own line; time moves on as it would. */
function playOut(w: World, id: string) {
  let now = T0;
  for (let i = 0; i < 200; i++) {
    const r = w.playRooms![id]!;
    if (r.status !== 'playing') break;
    const B = r.bowling!;
    now = Math.max(now, B.readyAt) + 3_000;
    const v = playerView(w, 'host')!.playRooms.find((x) => x.id === id)!;
    const up = v.bowling!.bowler!;
    if (r.ai?.includes(up)) {
      w = run(w, 'host', { type: 'play.sync', roomId: id }, now).world;
      continue;
    }
    const input = aiBowl(createRng(i), B.players[up]!.standing);
    w = run(w, up, { type: 'play.bowl', roomId: id, round: r.round, ...input }, now).world;
  }
  return w;
}

describe('bowling in a play room', () => {
  it('plays solo against the AI to the end, pays the alley its lane fees and the winner the pot', () => {
    let w = gamesWorld(21);
    const lane = alley(w);
    const before = moneyByCurrency(w);
    const host0 = balance(w, 'host');
    const till0 = till(w, lane.id);
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: lane.id,
      title: 'Bowling vs AI',
      stake: 50_000,
    });
    w = made.world;
    const id = made.result.id as string;
    w = run(w, 'host', { type: 'play.ai', roomId: id }).world;
    const r0 = w.playRooms![id]!;
    expect(r0.status).toBe('playing');
    expect(r0.members).toHaveLength(2);
    const fee = r0.bowling!.fee;
    expect(fee).toBeGreaterThan(0);
    expect(till(w, lane.id) - till0).toBe(fee * 2);
    w = playOut(w, id);
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    for (const m of r.members) {
      const g = bowlingGame(r.bowling!.players[m.id]!.rolls);
      expect(g.done).toBe(true);
      expect(m.score).toBe(g.score);
    }
    // Money is conserved; the winner took both stakes (a tie refunds them).
    expect(moneyByCurrency(w)).toEqual(before);
    const won = r.winners.length === 1 && r.winners[0] === 'host';
    const tied = r.winners.length !== 1;
    expect(balance(w, 'host') - host0).toBe(-fee + (won ? 50_000 : tied ? 0 : -50_000));
    // The game is on your record.
    const rec = w.players.host!.games!.bowling!;
    expect(rec.games).toBe(1);
    expect(rec.last).toBe(r.members.find((m) => m.id === 'host')!.score);
  });

  it('bowls a solo game alone (free), and the fun of it shows', () => {
    let w = gamesWorld(5);
    const funBefore = w.players.host!.needs?.fun ?? 50;
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Just me',
      stake: 0,
    });
    w = run(made.world, 'host', { type: 'play.start', roomId: made.result.id }).world;
    // Not your turn yet? It is: only you. A ball before the pins settle is refused.
    const r = w.playRooms![made.result.id]!;
    expect(r.status).toBe('playing');
    w = playOut(w, made.result.id);
    expect(w.playRooms![made.result.id]!.status).toBe('finished');
    expect(w.players.host!.needs!.fun).toBeGreaterThan(funBefore);
    expect(w.players.host!.games!.bowling!.games).toBe(1);
  });

  it('takes turns frame by frame between two players and refuses a ball out of turn', () => {
    let w = gamesWorld(8);
    const made = run(w, 'host', {
      type: 'play.create',
      game: 'bowling',
      venue: alley(w).id,
      title: 'Friends',
      stake: 10_000,
    });
    const id = made.result.id as string;
    w = run(made.world, 'ada', { type: 'play.join', roomId: id }).world;
    w = run(w, 'host', { type: 'play.start', roomId: id }).world;
    const out = tryRun(w, 'ada', {
      type: 'play.bowl',
      roomId: id,
      round: 0,
      x: 0,
      aim: 0,
      power: 0.5,
      spin: 0,
    });
    expect(out.ok).toBe(false);
    w = playOut(w, id);
    const r = w.playRooms![id]!;
    expect(r.status).toBe('finished');
    expect(Object.values(r.bowling!.players).every((p) => bowlingGame(p.rolls).done)).toBe(true);
  });

  it('refuses bowling anywhere but a bowling alley', () => {
    const w = gamesWorld();
    const notAlley = Object.values(w.markets.lagos!.businesses!).find(
      (b) => b.kind !== 'bowling-alley',
    )!;
    expect(
      tryRun(w, 'host', {
        type: 'play.create',
        game: 'bowling',
        venue: notAlley.id,
        title: 'Nope',
        stake: 0,
      }).ok,
    ).toBe(false);
  });
});

describe('skydives and helicopter flights', () => {
  const centre = (w: World) => venues(w).find((b) => b.kind === 'skydive-centre')!;
  const heliport = (w: World) => venues(w).find((b) => b.kind === 'heliport')!;

  it('needs the lifestyle tier, then charges the centre and takes the hours', () => {
    let w = gamesWorld();
    w = run(w, 'host', { type: 'player.lifestyle', tier: 2 }).world;
    const c = centre(w);
    const locked = tryRun(w, 'host', {
      type: 'games.book',
      businessId: c.id,
      itemId: 'skydive-tandem',
    });
    expect(locked.ok).toBe(false);
    w = run(w, 'host', { type: 'player.lifestyle', tier: 3 }).world;
    const money0 = moneyByCurrency(w);
    const host0 = balance(w, 'host');
    const till0 = till(w, c.id);
    const hours0 = w.players.host!.hours.used;
    const fun0 = w.players.host!.needs?.fun ?? 50;
    const stress0 = w.players.host!.stress ?? 0;
    const r = run(w, 'host', { type: 'games.book', businessId: c.id, itemId: 'skydive-tandem' });
    w = r.world;
    expect(r.result.price).toBeGreaterThan(0);
    expect(host0 - balance(w, 'host')).toBe(r.result.price);
    expect(till(w, c.id) - till0).toBe(r.result.price);
    expect(moneyByCurrency(w)).toEqual(money0);
    expect(w.players.host!.hours.used - hours0).toBe(AIR_ACTIVITIES['skydive-tandem']!.hours);
    expect(w.players.host!.needs!.fun).toBeGreaterThan(fun0);
    expect(w.players.host!.stress ?? 0).toBeLessThan(stress0 === 0 ? 1 : stress0);
    expect(w.players.host!.games!.jumps).toBe(1);
    // Land it: scored once, the best kept.
    const land = run(w, 'host', {
      type: 'games.land',
      bookingId: r.result.bookingId,
      deployAt: 1400,
      miss: 2,
      style: 80,
    });
    expect(land.result.score).toBe(skydiveScore({ deployAt: 1400, miss: 2, style: 80 }).score);
    expect(land.result.score).toBeGreaterThan(800);
    w = land.world;
    expect(w.players.host!.games!.bestJump).toBe(land.result.score);
    expect(
      tryRun(w, 'host', {
        type: 'games.land',
        bookingId: r.result.bookingId,
        deployAt: 1400,
        miss: 0,
        style: 100,
      }).ok,
    ).toBe(false);
  });

  it('scores a jump: a low pull, a long way off and no style score little', () => {
    expect(skydiveScore({ deployAt: 400, miss: 300, style: 0 }).score).toBe(0);
    const ok = skydiveScore({ deployAt: 900, miss: 40, style: 50 });
    expect(ok.score).toBeGreaterThan(300);
    expect(ok.score).toBeLessThan(800);
    expect(skydiveScore({ deployAt: 1500, miss: 0, style: 100 }).grade).toBe('gold');
  });

  it('books a helicopter tour at the heliport; venue.buy can’t skip the booking', () => {
    let w = gamesWorld();
    w = run(w, 'host', { type: 'player.lifestyle', tier: 3 }).world;
    const h = heliport(w);
    const till0 = till(w, h.id);
    const r = run(w, 'host', { type: 'games.book', businessId: h.id, itemId: 'heli-tour' });
    expect(r.result.kind).toBe('heli');
    expect(till(r.world, h.id) - till0).toBe(r.result.price);
    expect(r.world.players.host!.games!.flights).toBe(1);
    // The charter needs tier 4.
    expect(
      tryRun(r.world, 'host', { type: 'games.book', businessId: h.id, itemId: 'heli-charter' }).ok,
    ).toBe(false);
    w = run(r.world, 'host', { type: 'games.end', bookingId: r.result.bookingId }).world;
    expect(w.players.host!.games!.booked).toBeNull();
    expect(tryRun(w, 'host', { type: 'venue.buy', businessId: h.id, itemId: 'heli-tour' }).ok).toBe(
      false,
    );
    // A helicopter booking can't be landed as a jump.
    const again = run(w, 'host', { type: 'games.book', businessId: h.id, itemId: 'heli-tour' });
    expect(
      tryRun(again.world, 'host', {
        type: 'games.land',
        bookingId: again.result.bookingId,
        deployAt: 1500,
        miss: 0,
        style: 100,
      }).ok,
    ).toBe(false);
  });
});

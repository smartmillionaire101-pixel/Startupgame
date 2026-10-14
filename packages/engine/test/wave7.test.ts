import { describe, expect, it } from 'vitest';
import { businessKind } from '../src/data/businesses.js';
import { isOpen } from '../src/economy.js';
import { col } from '../src/helpers.js';
import { scale } from '../src/money.js';
import {
  HOME_ACTS,
  HOME_ACT_IDS,
  INVITE_CAP,
  moodOf,
  needsOf,
  NEEDS_BACKFILL,
} from '../src/needs.js';
import { computeHours } from '../src/personal.js';
import { playerView } from '../src/views.js';
import type { MarketId } from '../src/data/markets.js';
import type { Player, World } from '../src/types.js';
import {
  T0,
  addFounder,
  addInvestor,
  makeWorld,
  moneyByCurrency,
  run,
  settle,
  tryRun,
} from './helpers.js';

const thaw = (w: World): World => structuredClone(w);
const bal = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;
const open = (w: World, market: MarketId = 'lagos') =>
  Object.values(w.markets[market]!.businesses ?? {}).filter(isOpen);

function person(w: World, id = 'u_p', market: MarketId = 'lagos'): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name: 'Ama Person',
    role: 'investor',
    backgroundId: 'i-first',
    market,
    investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
  }).world;
}

const act = (w: World, a: (typeof HOME_ACT_IDS)[number], id = 'u_p') =>
  run(w, id, { type: 'home.act', act: a });

describe('needs and mood (Wave 7 §A)', () => {
  it('new players start at 80; old saves read as 70', () => {
    const w = person(makeWorld(7, ['lagos']));
    expect(w.players.u_p!.needs).toEqual({ hunger: 80, hygiene: 80, fun: 80, social: 80 });
    const old = thaw(w);
    delete old.players.u_p!.needs;
    expect(needsOf(old.players.u_p!)).toEqual({
      hunger: NEEDS_BACKFILL,
      hygiene: NEEDS_BACKFILL,
      fun: NEEDS_BACKFILL,
      social: NEEDS_BACKFILL,
    });
    // The old save still settles and gets its needs written.
    const after = settle(old, 'lagos', 1);
    expect(after.players.u_p!.needs).toEqual({ hunger: 35, hygiene: 40, fun: 45, social: 50 });
    // AI players have none.
    expect(Object.values(w.players).filter((p) => p.ai && p.needs)).toHaveLength(0);
  });

  it('needs fall at each settlement, clamp at 0 and send a note under 25', () => {
    let w = person(makeWorld(7, ['lagos']));
    w = settle(w, 'lagos', 1);
    expect(w.players.u_p!.needs).toEqual({ hunger: 45, hygiene: 50, fun: 55, social: 60 });
    w = settle(w, 'lagos', 1);
    expect(w.players.u_p!.needs).toEqual({ hunger: 10, hygiene: 20, fun: 30, social: 40 });
    const notes = (w.inbox.u_p ?? []).map((i) => i.text);
    expect(notes.some((t) => t.includes('hungry'))).toBe(true);
    expect(notes.some((t) => t.includes('shower'))).toBe(true);
    w = settle(w, 'lagos', 2);
    expect(w.players.u_p!.needs).toEqual({ hunger: 0, hygiene: 0, fun: 0, social: 0 });
  });

  it('mood is the rounded average of energy and the four needs, and in the view', () => {
    const w = thaw(person(makeWorld(7, ['lagos'])));
    const p = w.players.u_p!;
    p.energy = 61;
    p.needs = { hunger: 10, hygiene: 20, fun: 30, social: 42 };
    expect(moodOf(p)).toBe(Math.round((61 + 10 + 20 + 30 + 42) / 5));
    const v = playerView(w, 'u_p')!;
    expect(v.me.mood).toBe(33);
    expect(v.me.needs).toEqual({ hunger: 10, hygiene: 20, fun: 30, social: 42 });
    expect(v.me.homeActs.sleep).toEqual({ used: 0, cap: 3, left: 3 });
    expect(v.me.homeActs.invite!.cap).toBe(INVITE_CAP);
  });

  it('mood below 30 costs 10% of hours; above 75 adds 5%', () => {
    const w = thaw(person(makeWorld(7, ['lagos'])));
    const p: Player = w.players.u_p!;
    p.energy = 80;
    p.needs = { hunger: 70, hygiene: 70, fun: 70, social: 70 };
    const base = computeHours(p);
    p.needs = { hunger: 0, hygiene: 0, fun: 0, social: 0 }; // mood 16
    expect(Math.abs(computeHours(p) - base * 0.9)).toBeLessThanOrEqual(1);
    p.needs = { hunger: 100, hygiene: 100, fun: 100, social: 100 }; // mood 96
    expect(Math.abs(computeHours(p) - base * 1.05)).toBeLessThanOrEqual(1);
    // Without needs (AI, or before the backfill), hours are unchanged.
    delete p.needs;
    p.energy = 100;
    const plain = computeHours(p);
    p.needs = { hunger: 100, hygiene: 100, fun: 100, social: 100 };
    expect(Math.abs(computeHours(p) - plain * 1.05)).toBeLessThanOrEqual(1);
  });

  it('a gloomy month means fewer hours at settlement', () => {
    let w = thaw(person(makeWorld(7, ['lagos'])));
    w.players.u_p!.needs = { hunger: 0, hygiene: 0, fun: 0, social: 0 };
    const happy = thaw(w);
    happy.players.u_p!.needs = { hunger: 100, hygiene: 100, fun: 100, social: 100 };
    w = settle(w, 'lagos', 1);
    const h = settle(happy, 'lagos', 1);
    expect(w.players.u_p!.hours.available).toBeLessThan(h.players.u_p!.hours.available);
  });
});

describe('home.act (Wave 7 §A)', () => {
  it('each act does what it says and is capped each month', () => {
    let w = thaw(person(makeWorld(7, ['lagos'])));
    w.players.u_p!.energy = 40;
    w.players.u_p!.needs = { hunger: 20, hygiene: 20, fun: 20, social: 20 };
    let r = act(w, 'sleep');
    expect(r.result.effects.energy).toBe(25);
    expect(r.world.players.u_p!.energy).toBe(65);
    expect(r.result.left).toBe(2);
    w = r.world;
    w = act(w, 'sleep').world;
    w = act(w, 'sleep').world;
    const capped = tryRun(w, 'u_p', { type: 'home.act', act: 'sleep' });
    expect(capped.ok).toBe(false);
    if (!capped.ok)
      expect(capped.error).toEqual({ code: 'home.cap', message: 'Done for this month.' });
    // A new month resets the caps.
    w = settle(w, 'lagos', 1);
    expect(tryRun(w, 'u_p', { type: 'home.act', act: 'sleep' }).ok).toBe(true);

    r = act(w, 'shower');
    expect(r.result.effects.hygiene).toBeGreaterThan(0);
    r = act(r.world, 'workout');
    expect(r.result.effects).toMatchObject({ fun: 10, hygiene: -15 });
  });

  it('every act has the cap from the table', () => {
    expect(Object.fromEntries(HOME_ACT_IDS.map((a) => [a, HOME_ACTS[a].cap]))).toEqual({
      sleep: 3,
      nap: 6,
      shower: 6,
      toilet: 10,
      cook: 6,
      snack: 10,
      tv: 6,
      game: 4,
      read: 4,
      work: 4,
      workout: 4,
    });
  });

  it('cooking buys groceries (paid to living costs); a TV makes TV more fun', () => {
    let w = thaw(person(makeWorld(7, ['lagos'])));
    w.players.u_p!.needs = { hunger: 10, hygiene: 50, fun: 10, social: 50 };
    const m = w.markets.lagos!;
    const sink = m.ext.lifestyle;
    const before = bal(w, 'u_p');
    const sinkBefore = w.accounts[sink]!.balance;
    const total = moneyByCurrency(w);
    const r = act(w, 'cook');
    expect(r.result.cost).toBe(scale(col(m), 0.02));
    expect(bal(r.world, 'u_p')).toBe(before - r.result.cost);
    expect(r.world.accounts[sink]!.balance).toBe(sinkBefore + r.result.cost);
    expect(r.world.players.u_p!.needs!.hunger).toBe(55);
    expect(moneyByCurrency(r.world)).toEqual(total);
    w = r.world;
    expect(act(w, 'tv').result.effects.fun).toBe(15);
    w = run(w, 'u_p', { type: 'home.buy', itemId: 'tv-1' }).world;
    expect(act(w, 'tv').result.effects.fun).toBe(25);
  });

  it('game and work need the slot; work counts towards the product for a founder', () => {
    let w = addFounder(makeWorld(7, ['lagos']));
    const r0 = tryRun(w, 'u_founder', { type: 'home.act', act: 'game' });
    expect(r0.ok).toBe(false);
    expect(tryRun(w, 'u_founder', { type: 'home.act', act: 'work' }).ok).toBe(false);
    w = run(w, 'u_founder', { type: 'home.buy', itemId: 'desk-1' }).world;
    const cid = w.players.u_founder!.companyIds[0]!;
    const build = w.companies[cid]!.buildHours;
    const r = act(w, 'work', 'u_founder');
    expect(r.result.built).toBe(true);
    expect(r.world.companies[cid]!.buildHours).toBe(build + 4);
    // Read adds a couple of hours for anyone.
    let p = person(makeWorld(7, ['lagos']));
    const hours = p.players.u_p!.hours.available;
    p = act(p, 'read').world;
    expect(p.players.u_p!.hours.available).toBe(hours + 2);
  });

  it('home acts need you at home', () => {
    let w = person(makeWorld(7, ['lagos', 'london']));
    w = run(w, 'u_p', { type: 'travel.fly', to: 'london' }).world;
    const r = tryRun(w, 'u_p', { type: 'home.act', act: 'nap' });
    expect(r.ok).toBe(false);
  });
});

describe('home.invite (Wave 7 §A)', () => {
  it('a player guest: social, fun, warmth, snacks paid, guest notified; cap 3', () => {
    let w = addInvestor(person(makeWorld(7, ['lagos'])), 'u_guest');
    w = thaw(w);
    w.players.u_p!.needs = { hunger: 50, hygiene: 50, fun: 20, social: 20 };
    const before = bal(w, 'u_p');
    const total = moneyByCurrency(w);
    const r = run(w, 'u_p', { type: 'home.invite', personId: 'u_guest' });
    expect(r.result.effects).toEqual({ social: 30, fun: 10 });
    expect(r.result.cost).toBe(scale(col(w.markets.lagos!), 0.03));
    expect(bal(r.world, 'u_p')).toBe(before - r.result.cost);
    expect(moneyByCurrency(r.world)).toEqual(total);
    const c = r.world.players.u_p!.contacts!.find((x) => x.refId === 'u_guest')!;
    expect(c.warmth).toBeCloseTo(0.1);
    expect(
      (r.world.inbox.u_guest ?? []).some((i) => i.text === 'Ama Person invited you over.'),
    ).toBe(true);
    // Again with the contact's chat id: warmth compounds like a meeting.
    w = run(r.world, 'u_p', { type: 'home.invite', personId: 'u_guest' }).world;
    const c2 = w.players.u_p!.contacts!.find((x) => x.refId === 'u_guest')!;
    expect(c2.warmth).toBeGreaterThan(0.1);
    w = run(w, 'u_p', { type: 'home.invite', personId: 'npc:lagos:3' }).world;
    const capped = tryRun(w, 'u_p', { type: 'home.invite', personId: 'npc:lagos:4' });
    expect(capped.ok).toBe(false);
  });

  it('regulars and fund partners must be in your city', () => {
    const w = person(makeWorld(7, ['lagos', 'london']));
    expect(tryRun(w, 'u_p', { type: 'home.invite', personId: 'npc:london:1' }).ok).toBe(false);
    const fund = Object.values(w.funds).find((f) => f.market === 'lagos')!;
    const r = run(w, 'u_p', { type: 'home.invite', personId: `fund:${fund.id}` });
    expect(r.result.guest.name).toBe(fund.partner);
    expect(tryRun(w, 'u_p', { type: 'home.invite', personId: 'nobody' }).ok).toBe(false);
  });
});

describe('food.order and delivery (Wave 7 §A)', () => {
  it('lists open food businesses cheapest first, up to 20, with no activities', () => {
    const w = person(makeWorld(7, ['lagos']));
    const v = playerView(w, 'u_p')!;
    const d = v.market.delivery;
    expect(d.length).toBeGreaterThan(0);
    expect(d.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < d.length; i++)
      expect(d[i]!.items[0]!.price).toBeGreaterThanOrEqual(d[i - 1]!.items[0]!.price);
    for (const x of d) {
      const b = w.markets.lagos!.businesses![x.businessId]!;
      expect(businessKind(b.kind)!.category).toBe('food');
      const spec = businessKind(b.kind)!.venue!.items;
      for (const it of x.items) expect(spec.find((s) => s.id === it.id)!.activity).toBeFalsy();
    }
  });

  it('pays price + 15% and feeds you when the delivery is collected', () => {
    let w = thaw(person(makeWorld(7, ['lagos'])));
    w.players.u_p!.needs = { hunger: 10, hygiene: 50, fun: 50, social: 50 };
    const d = playerView(w, 'u_p')!.market.delivery[0]!;
    const it = d.items[0]!;
    const till = w.markets.lagos!.businesses![d.businessId]!.account;
    const tillBefore = w.accounts[till]!.balance;
    const before = bal(w, 'u_p');
    const total = moneyByCurrency(w);
    const r = run(w, 'u_p', { type: 'food.order', businessId: d.businessId, itemId: it.id });
    const fee = Math.round(it.price * 0.15);
    expect(r.result.total).toBe(it.price + fee);
    expect(bal(r.world, 'u_p')).toBe(before - it.price - fee);
    expect(r.world.accounts[till]!.balance).toBe(tillBefore + it.price + fee);
    expect(r.world.players.u_p!.needs!.hunger).toBe(10);
    const delivered = run(
      r.world,
      'u_p',
      { type: 'living.collect', deliveryId: r.result.id },
      T0 + 31_000,
    );
    expect(delivered.world.players.u_p!.needs!.hunger).toBe(45);
    expect(moneyByCurrency(r.world)).toEqual(total);
    w = r.world;
  });

  it('refuses non-food businesses and activities', () => {
    const w = person(makeWorld(7, ['lagos']));
    const gym = open(w).find((b) => b.kind === 'gym');
    if (gym)
      expect(
        tryRun(w, 'u_p', { type: 'food.order', businessId: gym.id, itemId: 'session' }).ok,
      ).toBe(false);
    const pub = open(w).find((b) => ['pub', 'bar'].includes(b.kind));
    if (pub)
      expect(tryRun(w, 'u_p', { type: 'food.order', businessId: pub.id, itemId: 'pool' }).ok).toBe(
        false,
      );
  });
});

describe('venues feed your needs (Wave 7 §A)', () => {
  it('food +30 hunger; gym −10 hygiene and more fun; a meeting +20 social', () => {
    let w = addInvestor(person(makeWorld(7, ['lagos'])), 'u_guest');
    w = thaw(w);
    w.players.u_p!.needs = { hunger: 10, hygiene: 50, fun: 10, social: 10 };
    const food = open(w).find((b) => b.kind === 'restaurant')!;
    let r = run(w, 'u_p', { type: 'venue.buy', businessId: food.id, itemId: 'drink' });
    expect(r.result.needs.hunger).toBe(30);
    r = run(r.world, 'u_p', {
      type: 'venue.buy',
      businessId: food.id,
      itemId: 'lunch',
      withId: 'u_guest',
    });
    expect(r.result.needs.social).toBe(20);
    const gym = open(w).find((b) => b.kind === 'gym');
    if (gym) {
      const g = run(r.world, 'u_p', { type: 'venue.buy', businessId: gym.id, itemId: 'session' });
      expect(g.result.needs.hygiene).toBe(-10);
      expect(g.result.needs.fun).toBe(5 * 4 + 10);
    }
  });
});

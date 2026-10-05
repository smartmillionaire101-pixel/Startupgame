import { describe, expect, it } from 'vitest';
import {
  BUSINESS_KINDS,
  CITY_BUSINESSES,
  LATE_OPENINGS,
  businessKind,
} from '../src/data/businesses.js';
import { BACKGROUNDS, STARTING_RUNWAY_MONTHS } from '../src/data/characters.js';
import { FURNITURE, SELL_BACK, carsFor } from '../src/data/lifestyle-shop.js';
import { MARKET_IDS } from '../src/data/markets.js';
import { JOB_HOURS, isOpen } from '../src/economy.js';
import { col } from '../src/helpers.js';
import { scale } from '../src/money.js';
import { GIGS_PER_MONTH } from '../src/personal.js';
import { playerView } from '../src/views.js';
import type { LocalBusiness, World } from '../src/types.js';
import {
  T0,
  addFounder,
  addInvestor,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const bal = (w: World, accId: string) => w.accounts[accId]!.balance;
const personal = (w: World, id: string) => bal(w, w.players[id]!.accounts.local);
const thaw = (w: World): World => structuredClone(w);
const open = (w: World, market = 'lagos' as const) =>
  Object.values(w.markets[market]!.businesses ?? {}).filter(isOpen);
const byKind = (w: World, kind: string, market = 'lagos' as const) =>
  open(w, market).find((b) => b.kind === kind)!;

const NEW_KINDS = [
  'nightclub',
  'lounge-bar',
  'coffee-chain',
  'cinema',
  'studio-gym',
  'car-dealership',
  'furniture-store',
  'co-working',
  'art-gallery',
  'live-music',
];

describe('more to do in town (Wave 5)', () => {
  it('every city has every new kind; every kind offers jobs', () => {
    for (const k of NEW_KINDS) expect(businessKind(k), k).toBeDefined();
    for (const city of MARKET_IDS)
      for (const k of NEW_KINDS)
        expect(
          CITY_BUSINESSES[city]!.some((s) => s.kind === k),
          `${city}: ${k}`,
        ).toBe(true);
    for (const k of BUSINESS_KINDS) {
      expect(k.roles.length, k.kind).toBeGreaterThan(0);
      expect(new Set(k.roles.map((r) => r.role)).size, k.kind).toBe(k.roles.length);
      for (const r of k.roles) {
        expect(r.payCol).toBeGreaterThan(0.2);
        expect(r.payCol).toBeLessThan(1);
      }
    }
    // Clubs and cinemas have something to buy.
    expect(businessKind('nightclub')!.venue!.items.map((i) => i.id)).toContain('vip');
    expect(businessKind('cinema')!.venue!.items.map((i) => i.id)).toContain('ticket');
  });

  it('Freetown has a full roster on real streets', () => {
    const roster = CITY_BUSINESSES.freetown!;
    expect(roster.length - LATE_OPENINGS).toBeGreaterThanOrEqual(32);
    for (const s of roster) expect(s.street, s.name).toBeTruthy();
    const streets = new Set(roster.map((s) => s.street));
    for (const st of [
      'Lumley Beach Road',
      'Aberdeen',
      'Wilkinson Road',
      'Siaka Stevens Street',
      'Kissy Road',
      'Congo Cross',
      'Big Market',
    ])
      expect(streets.has(st), st).toBe(true);
    const w = makeWorld(7, ['freetown']);
    expect(open(w, 'freetown' as never).length).toBeGreaterThanOrEqual(32);
    const w2 = addFounder(w, 'u_sl', 'freetown');
    const view = playerView(w2, 'u_sl')!;
    const club = view.market.businesses.find((b) => b.kind === 'nightclub')!;
    expect(club.street).toBe('Aberdeen');
    expect(view.market.businesses.every((b) => typeof b.street === 'string')).toBe(true);
  });

  it('saved worlds get the new places at the next settlement; existing ids stay', () => {
    const w = thaw(makeWorld(42, ['lagos']));
    const m = w.markets.lagos!;
    // Pretend the world was saved before Wave 5: only the first 24 roster places exist.
    for (const b of Object.values(m.businesses!)) {
      if (b.seed < 24) continue;
      w.accounts[m.ext.genesis]!.balance += w.accounts[b.account]!.balance;
      delete w.accounts[b.account];
      delete m.businesses![b.id];
    }
    const before = Object.values(m.businesses!).map((b) => [b.id, b.name] as const);
    const total = moneyByCurrency(w);
    const after = settle(w, 'lagos', 1);
    const list = Object.values(after.markets.lagos!.businesses!);
    for (const [id, name] of before) expect(after.markets.lagos!.businesses![id]!.name).toBe(name);
    for (const k of ['nightclub', 'cinema', 'car-dealership', 'furniture-store'])
      expect(
        list.some((b) => b.kind === k && isOpen(b)),
        k,
      ).toBe(true);
    expect(moneyByCurrency(after)).toEqual(total);
    expect(negativeInternalAccounts(after)).toEqual([]);
  });
});

describe('who you are (Wave 5)', () => {
  it('stores gender when given; older clients may leave it out', () => {
    const w = run(makeWorld(42, ['lagos']), 'u_f', {
      type: 'player.create',
      handle: 'h_female',
      name: 'Amina',
      role: 'investor',
      backgroundId: 'i-exited',
      market: 'lagos',
      investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
      gender: 'female',
    }).world;
    expect(w.players.u_f!.gender).toBe('female');
    expect(playerView(w, 'u_f')!.me.gender).toBe('female');
    const w2 = addFounder(w);
    expect(playerView(w2, 'u_founder')!.me.gender).toBeNull();
  });

  it('new human players start with twice the savings', () => {
    const w = addFounder(makeWorld(42, ['lagos']));
    const bg = BACKGROUNDS.find((b) => b.id === 'f-engineer')!;
    const m = w.markets.lagos!;
    const start = Math.round(col(m) * STARTING_RUNWAY_MONTHS * bg.savingsMultiplier * 2);
    const recent = w.accounts[w.players.u_founder!.accounts.local]!.recent;
    expect(recent.find((t) => t.memo === 'Starting savings')?.amount).toBe(start);
  });
});

describe('money, not hours, for spending (Wave 5)', () => {
  it('meals with guests, event tickets and flights work with no hours left', () => {
    let w = addInvestor(addFounder(makeWorld(42, ['lagos', 'london'])), 'u_inv');
    w = thaw(w);
    for (const id of ['u_founder', 'u_inv'])
      w.players[id]!.hours.used = w.players[id]!.hours.available;
    const restaurant = byKind(w, 'restaurant');
    w = run(w, 'u_founder', {
      type: 'venue.buy',
      businessId: restaurant.id,
      itemId: 'dinner',
      withId: 'u_inv',
    }).world;
    const host = tryRun(w, 'u_inv', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Lagos Founders Night',
      venue: 'hall',
      budget: 0,
      ticket: 100_00,
    });
    // Hosting is organising work: it still takes hours.
    expect(host.ok).toBe(false);
    w = thaw(w);
    w.players.u_inv!.hours.used = 0;
    const ev = run(w, 'u_inv', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Lagos Founders Night',
      venue: 'hall',
      budget: 0,
      ticket: 100_00,
    });
    w = ev.world;
    w = run(w, 'u_founder', { type: 'event.rsvp', eventId: ev.result.eventId, going: true }).world;
    w = run(w, 'u_founder', { type: 'city.ride', mode: 'taxi', distance: 'long' }).world;
    w = run(w, 'u_founder', { type: 'travel.fly', to: 'london' }).world;
    expect(w.players.u_founder!.location?.market).toBe('london');
    expect(w.players.u_founder!.hours.used).toBe(w.players.u_founder!.hours.available);
  });

  it('a broke founder can always take the agency gig, past the monthly cap', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    const p = w.players.u_founder!;
    w.accounts[w.markets.lagos!.ext.genesis]!.balance += bal(w, p.accounts.local);
    w.accounts[p.accounts.local]!.balance = 0;
    p.gigsThisMonth = GIGS_PER_MONTH;
    p.hours.used = p.hours.available;
    const total = moneyByCurrency(w);
    const r = run(w, 'u_founder', { type: 'player.gig' });
    w = r.world;
    expect(personal(w, 'u_founder')).toBeGreaterThan(0);
    expect(moneyByCurrency(w)).toEqual(total);
    // Not broke any more: the cap applies again.
    expect(tryRun(w, 'u_founder', { type: 'player.gig' }).ok).toBe(false);
  });
});

describe('jobs (Wave 5)', () => {
  it('takes 40 hours, pays monthly from the till (taxed), one at a time, and can be quit', () => {
    let w = addFounder(makeWorld(42, ['lagos', 'london']));
    const total = moneyByCurrency(w);
    const cafe = open(w).find((b) => b.kind === 'cafe' || b.kind === 'coffee-chain')!;
    const v0 = playerView(w, 'u_founder')!;
    expect(v0.me.job).toBeNull();
    const offer = v0.market.jobs.find((j) => j.businessId === cafe.id && j.role === 'barista')!;
    expect(offer).toMatchObject({
      businessName: cafe.name,
      label: 'Barista',
      hours: JOB_HOURS,
    });
    const m = w.markets.lagos!;
    expect(offer.monthlyPay).toBe(scale(col(m), 0.3));
    const hours = w.players.u_founder!.hours.used;
    w = run(w, 'u_founder', { type: 'job.take', businessId: cafe.id, role: 'barista' }).world;
    expect(w.players.u_founder!.hours.used - hours).toBe(JOB_HOURS);
    expect(playerView(w, 'u_founder')!.me.job).toEqual({
      businessId: cafe.id,
      businessName: cafe.name,
      role: 'barista',
      label: 'Barista',
      monthlyPay: offer.monthlyPay,
      hours: JOB_HOURS,
    });
    const other = open(w).find((b) => b.id !== cafe.id && b.kind === 'restaurant')!;
    const second = tryRun(w, 'u_founder', {
      type: 'job.take',
      businessId: other.id,
      role: 'waiter',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('job.one');

    // Month end: wages from the till, taxed; next month's 40 hours are already taken.
    const s = settle(w, 'lagos', 1);
    const wage = s.accounts[s.players.u_founder!.accounts.local]!.recent!.find((t) =>
      t.memo.startsWith('Wages: Barista'),
    );
    expect(wage?.amount).toBe(offer.monthlyPay);
    expect(s.players.u_founder!.hours.used).toBe(JOB_HOURS);
    expect(moneyByCurrency(s)).toEqual(total);

    w = run(s, 'u_founder', { type: 'job.quit' }).world;
    expect(playerView(w, 'u_founder')!.me.job).toBeNull();
    expect(tryRun(w, 'u_founder', { type: 'job.quit' }).ok).toBe(false);
  });

  it('jobs are in your home city, and a closing business ends the job', () => {
    let w = addFounder(makeWorld(42, ['lagos', 'london']));
    w = run(w, 'u_founder', { type: 'travel.fly', to: 'london' }).world;
    const here = playerView(w, 'u_founder')!.here!;
    expect(here.jobs.length).toBeGreaterThan(0);
    const j = here.jobs[0]!;
    const r = tryRun(w, 'u_founder', { type: 'job.take', businessId: j.businessId, role: j.role });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('job.market');
    w = run(w, 'u_founder', { type: 'travel.fly', to: 'lagos' }).world;
    const b = open(w)[0]!;
    const role = businessKind(b.kind)!.roles[0]!.role;
    w = thaw(run(w, 'u_founder', { type: 'job.take', businessId: b.id, role }).world);
    (w.markets.lagos!.businesses![b.id] as LocalBusiness).closedMonth = w.markets.lagos!.month;
    w = settle(w, 'lagos', 1);
    expect(w.players.u_founder!.job).toBeUndefined();
    expect(w.inbox.u_founder!.some((i) => i.text.includes('lost your job'))).toBe(true);
  });
});

describe('home and car (Wave 5)', () => {
  it('furniture: paid to the furniture store, one per slot, replaced at 40% back, comfort rises', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const total = moneyByCurrency(w);
    const m = w.markets.lagos!;
    const store = byKind(w, 'furniture-store');
    const shop = playerView(w, 'u_founder')!.market.shop;
    expect(shop.furniture).toHaveLength(FURNITURE.length);
    const sofa1 = shop.furniture.find((f) => f.id === 'sofa-1')!;
    expect(sofa1).toMatchObject({ slot: 'sofa', tier: 1, price: scale(col(m), 0.25) });
    const till = bal(w, store.account);
    const before = personal(w, 'u_founder');
    w = run(w, 'u_founder', { type: 'home.buy', itemId: 'sofa-1' }).world;
    expect(bal(w, store.account)).toBe(till + sofa1.price);
    expect(personal(w, 'u_founder')).toBe(before - sofa1.price);
    expect(tryRun(w, 'u_founder', { type: 'home.buy', itemId: 'sofa-1' }).ok).toBe(false);
    const sofa2 = shop.furniture.find((f) => f.id === 'sofa-2')!;
    const mid = personal(w, 'u_founder');
    w = run(w, 'u_founder', { type: 'home.buy', itemId: 'sofa-2' }).world;
    expect(personal(w, 'u_founder')).toBe(
      mid - sofa2.price + Math.round(sofa1.price * SELL_BACK.furniture),
    );
    w = run(w, 'u_founder', { type: 'home.buy', itemId: 'bed-3' }).world;
    const home = playerView(w, 'u_founder')!.me.home;
    expect(home.items).toEqual([
      { slot: 'sofa', itemId: 'sofa-2', label: 'Comfy fabric sofa', tier: 2 },
      { slot: 'bed', itemId: 'bed-3', label: 'King bed, hotel linen', tier: 3 },
    ]);
    expect(home.comfort).toBe(Math.round((100 * 5) / 27));
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('car: bought from the dealer, sold back at 50%, running costs monthly, driving is free', () => {
    let w = addFounder(makeWorld(42, ['lagos', 'london']));
    const total = moneyByCurrency(w);
    const m = w.markets.lagos!;
    const cars = playerView(w, 'u_founder')!.market.shop.cars;
    expect(cars.map((c) => c.id)).toEqual(carsFor('lagos').map((c) => c.id));
    const bike = cars.find((c) => c.id === 'motorbike')!;
    expect(bike.label).toBe('Okada motorbike');
    expect(tryRun(w, 'u_founder', { type: 'city.ride', mode: 'drive', distance: 'long' }).ok).toBe(
      false,
    );
    const dealer = byKind(w, 'car-dealership');
    const till = bal(w, dealer.account);
    w = run(w, 'u_founder', { type: 'car.buy', modelId: 'motorbike' }).world;
    expect(bal(w, dealer.account)).toBe(till + bike.price);
    expect(playerView(w, 'u_founder')!.me.car).toEqual({
      modelId: 'motorbike',
      label: 'Okada motorbike',
      monthlyCost: bike.monthlyCost,
    });
    const before = personal(w, 'u_founder');
    const drive = run(w, 'u_founder', { type: 'city.ride', mode: 'drive', distance: 'long' });
    expect(drive.result.fare).toBe(0);
    expect(personal(drive.world, 'u_founder')).toBe(before);
    expect(playerView(w, 'u_founder')!.me.status).toBeGreaterThan(
      playerView(addFounder(makeWorld(42, ['lagos'])), 'u_founder')!.me.status,
    );
    // Running costs at month end.
    const s = settle(w, 'lagos', 1);
    expect(
      s.accounts[s.players.u_founder!.accounts.local]!.recent!.some(
        (t) => t.memo === 'Car running costs' && t.amount === -bike.monthlyCost,
      ),
    ).toBe(true);
    // Abroad: no shopping, no driving.
    let away = run(w, 'u_founder', { type: 'travel.fly', to: 'london' }).world;
    expect(tryRun(away, 'u_founder', { type: 'car.buy', modelId: 'hatchback' }).ok).toBe(false);
    expect(
      tryRun(away, 'u_founder', { type: 'city.ride', mode: 'drive', distance: 'short' }).ok,
    ).toBe(false);
    away = run(away, 'u_founder', { type: 'travel.fly', to: 'lagos' }).world;
    const mid = personal(away, 'u_founder');
    const r = run(away, 'u_founder', { type: 'car.sell' });
    expect(r.result.refund).toBe(Math.round(bike.price * SELL_BACK.car));
    expect(personal(r.world, 'u_founder')).toBe(mid + r.result.refund);
    expect(playerView(r.world, 'u_founder')!.me.car).toBeNull();
    expect(moneyByCurrency(r.world)).toEqual(total);
    expect(col(m)).toBeGreaterThan(0);
    expect(T0).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  BUSINESS_KINDS,
  CITY_BUSINESSES,
  CITY_DISTRICTS,
  LATE_OPENINGS,
  businessKind,
} from '../src/data/businesses.js';
import { MARKET_IDS } from '../src/data/markets.js';
import { ECONOMY, isOpen } from '../src/economy.js';
import { warmIntro } from '../src/events.js';
import { col } from '../src/helpers.js';
import { playerView } from '../src/views.js';
import type { Industry } from '../src/data/industries.js';
import type { LocalBusiness, World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const bal = (w: World, accId: string) => w.accounts[accId]!.balance;
const personal = (w: World, playerId: string) => bal(w, w.players[playerId]!.accounts.local);
const businesses = (w: World, market = 'lagos' as const) =>
  Object.values(w.markets[market]!.businesses ?? {});

/** An open business in Lagos that buys `sector` and has no supplier for it yet. */
function prospect(w: World, sector: Industry = 'fintech'): LocalBusiness {
  const b = businesses(w).find(
    (x) =>
      isOpen(x) &&
      (businessKind(x.kind)!.buys[sector] ?? 0) > 0 &&
      !x.suppliers.some((s) => s.sector === sector),
  );
  if (!b) throw new Error('no prospect');
  return b;
}

/** A writable copy of a world (produced worlds are frozen). */
const thaw = (w: World): World => structuredClone(w);

describe('city rosters', () => {
  it('every city has 24–48 businesses with known kinds, real districts and unique names', () => {
    const cities = [...MARKET_IDS];
    expect(cities).toContain('san-francisco');
    for (const city of cities) {
      const roster = CITY_BUSINESSES[city];
      expect(roster, city).toBeDefined();
      expect(roster!.length).toBeGreaterThanOrEqual(24);
      expect(roster!.length).toBeLessThanOrEqual(48);
      const districts = CITY_DISTRICTS[city]!;
      for (const s of roster!) {
        expect(businessKind(s.kind), `${city}: ${s.kind}`).toBeDefined();
        expect(districts, `${city}: ${s.name} in ${s.district}`).toContain(s.district);
        expect(s.owner.length).toBeGreaterThan(2);
      }
      expect(new Set(roster!.map((s) => s.name)).size).toBe(roster!.length);
      // Every district has something in it.
      for (const d of districts)
        expect(
          roster!.some((s) => s.district === d),
          `${city}/${d}`,
        ).toBe(true);
    }
  });

  it('kinds are coherent: modest buying shares, gigs and venue items priced sensibly', () => {
    expect(BUSINESS_KINDS.length).toBeGreaterThanOrEqual(30);
    for (const k of BUSINESS_KINDS) {
      const buys = Object.values(k.buys).reduce((a, b) => a + (b ?? 0), 0);
      expect(buys, k.kind).toBeGreaterThan(0);
      expect(buys, k.kind).toBeLessThan(0.12);
      expect(k.gigs.length, k.kind).toBeGreaterThan(0);
      expect(k.revenueCol[0]).toBeLessThan(k.revenueCol[1]);
      for (const it of k.venue?.items ?? []) expect(it.priceCol).toBeLessThan(0.05);
    }
  });

  it('opening a market seeds its businesses with real, funded accounts', () => {
    const w = makeWorld(42, ['lagos']);
    const list = businesses(w);
    expect(list.length).toBe(CITY_BUSINESSES.lagos!.length - LATE_OPENINGS);
    for (const b of list) {
      expect(isOpen(b)).toBe(true);
      expect(bal(w, b.account)).toBeGreaterThan(0);
      expect(w.accounts[b.account]!.external).toBe(false);
      expect(b.suppliers).toEqual([]);
    }
  });
});

describe('the monthly loop', () => {
  it('households pay businesses, businesses pay costs and buy from startups', () => {
    let w = makeWorld(42, ['lagos']);
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 12);
    const m = w.markets.lagos!;
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
    for (const b of businesses(w).filter(isOpen)) expect(b.monthlyTakings).toBeGreaterThan(0);
    expect(m.economy!.takings).toBeGreaterThan(0);
    // AI startups won accounts on their own and booked the money as revenue.
    const suppliers = businesses(w).flatMap((b) => b.suppliers);
    expect(suppliers.length).toBeGreaterThan(0);
    const companies = Object.values(w.companies).filter(
      (c) => c.market === 'lagos' && c.status === 'active',
    );
    const booked = companies.reduce(
      (a, c) =>
        a +
        (c.finance.history.at(-1)?.month === m.month
          ? (c.finance.history.at(-1)!.businessRevenue ?? 0)
          : 0),
      0,
    );
    expect(booked).toBe(m.economy!.trade);
    const buyer = companies.find((c) => (c.finance.history.at(-1)?.businessRevenue ?? 0) > 0)!;
    expect(buyer).toBeDefined();
    const pnl = buyer.finance.history.at(-1)!;
    expect(pnl.revenue).toBeGreaterThanOrEqual(pnl.businessRevenue!);
  });

  it('is deterministic', () => {
    const a = settle(makeWorld(9, ['lagos']), 'lagos', 8);
    const b = settle(makeWorld(9, ['lagos']), 'lagos', 8);
    expect(a.markets.lagos!.businesses).toEqual(b.markets.lagos!.businesses);
    expect(a.markets.lagos!.economy).toEqual(b.markets.lagos!.economy);
  });

  it('is calibrated: a few business customers matter, but trade does not swamp segment revenue', () => {
    let w = makeWorld(42, ['lagos', 'london']);
    for (const mk of ['lagos', 'london'] as const) {
      w = settle(w, mk, 24);
      const m = w.markets[mk]!;
      const c = col(m);
      const open = Object.values(m.businesses!).filter(isOpen);
      // Trade is a small slice of what businesses take in.
      const trade = m.economy!.trade;
      expect(trade / m.economy!.takings).toBeGreaterThan(0.002);
      expect(trade / m.economy!.takings).toBeLessThan(0.05);
      // One account is worth a meaningful fraction of a founder's living costs.
      const accounts = open.flatMap((b) => b.suppliers).filter((s) => s.monthlyMinor > 0);
      const avg = accounts.reduce((a, s) => a + s.monthlyMinor, 0) / accounts.length;
      expect(avg / c).toBeGreaterThan(0.05);
      expect(avg / c).toBeLessThan(2);
      // Across startups, businesses are well under a fifth of revenue.
      const cos = Object.values(w.companies).filter((x) => x.market === mk && x.ai);
      const rev = cos.reduce((a, x) => a + (x.finance.history.at(-1)?.revenue ?? 0), 0);
      const biz = cos.reduce((a, x) => a + (x.finance.history.at(-1)?.businessRevenue ?? 0), 0);
      expect(biz / rev).toBeLessThan(0.2);
      // Businesses stay solvent on average with modest margins.
      const health = open.reduce((a, b) => a + b.health, 0) / open.length;
      expect(health).toBeGreaterThan(0.4);
    }
  });

  it('closes a failing business (its cash back to genesis) and opens new ones from the roster', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    const total = moneyByCurrency(w);
    const m = w.markets.lagos!;
    const victim = businesses(w)[0]!;
    // A supplier relationship to lose.
    const cid = companyOf(w, 'u_founder').id;
    victim.suppliers.push({ companyId: cid, sector: 'fintech', monthlyMinor: 1000, since: 0 });
    // A failing business: almost no cash and costs far above its takings.
    victim.health = 0.06;
    victim.costBase = victim.base * 50;
    w.accounts[m.ext.genesis]!.balance += w.accounts[victim.account]!.balance;
    w.accounts[victim.account]!.balance = 0;
    const genesisBefore = bal(w, m.ext.genesis);
    w = settle(w, 'lagos', 1);
    const closed = w.markets.lagos!.businesses![victim.id]!;
    expect(closed.closedMonth).toBe(1);
    expect(bal(w, closed.account)).toBe(0);
    expect(bal(w, m.ext.genesis)).not.toBe(genesisBefore);
    expect(closed.suppliers).toEqual([]);
    expect(moneyByCurrency(w)).toEqual(total);
    // The founder hears about it in the monthly story.
    const story = companyOf(w, 'u_founder').story!;
    expect(story.items.some((i) => i.text.startsWith(`Lost ${victim.name}`))).toBe(true);
    // Recently closed businesses still show (as closed), then the city fills back up.
    const v = playerView(w, 'u_founder')!;
    expect(v.market.businesses.find((b) => b.id === victim.id)!.open).toBe(false);
    w = settle(w, 'lagos', 30);
    const opened = Object.values(w.markets.lagos!.businesses!).filter(
      (b) => b.openedMonth > 0 && isOpen(b),
    );
    expect(opened.length).toBeGreaterThan(0);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('seeds businesses for saved worlds that have none, and views read missing state as empty', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    delete w.markets.lagos!.businesses;
    delete w.markets.lagos!.economy;
    const v = playerView(w, 'u_founder')!;
    expect(v.market.businesses).toEqual([]);
    expect(v.market.economy).toEqual({
      businessesOpen: 0,
      takingsLastMonth: 0,
      tradeWithStartups: 0,
      gigsWorked: 0,
    });
    expect(v.companies[0]!.businessCustomers).toEqual([]);
    w = settle(w, 'lagos', 1);
    expect(businesses(w).length).toBeGreaterThan(20);
    expect(playerView(w, 'u_founder')!.market.economy.businessesOpen).toBeGreaterThan(20);
  });
});

describe('pitching businesses', () => {
  it('wins a customer: revenue next settlement, a story line and a businessCustomers entry', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const total = moneyByCurrency(w);
    const c = companyOf(w, 'u_founder');
    const b = prospect(w);
    const hours = w.players.u_founder!.hours.used;
    const view = playerView(w, 'u_founder')!.market.businesses.find((x) => x.id === b.id)!;
    expect(view.you).toEqual({ customer: false, canPitch: true, reason: null });
    const r = run(w, 'u_founder', { type: 'business.pitch', companyId: c.id, businessId: b.id });
    w = r.world;
    expect(w.players.u_founder!.hours.used - hours).toBe(ECONOMY.pitchHours);
    expect(r.result.answer).toBe('yes');
    expect(r.result.monthly).toBeGreaterThan(0);
    const after = w.markets.lagos!.businesses![b.id]!;
    expect(after.suppliers.some((s) => s.companyId === c.id)).toBe(true);
    expect(after.rapport.u_founder).toBeGreaterThan(0);
    const v = playerView(w, 'u_founder')!;
    const bv = v.market.businesses.find((x) => x.id === b.id)!;
    expect(bv.you.customer).toBe(true);
    expect(bv.buys.find((x) => x.sector === 'fintech')!.supplier).toEqual({
      companyId: c.id,
      name: c.name,
      you: true,
    });
    w = settle(w, 'lagos', 1);
    const co = companyOf(w, 'u_founder');
    const pnl = co.finance.history.at(-1)!;
    expect(pnl.businessRevenue).toBeGreaterThan(0);
    expect(pnl.revenue).toBeGreaterThanOrEqual(pnl.businessRevenue!);
    expect(co.story!.items.some((i) => i.text.startsWith(`Won ${b.name} as a customer`))).toBe(
      true,
    );
    const customers = playerView(w, 'u_founder')!.companies[0]!.businessCustomers;
    expect(customers).toEqual([{ businessId: b.id, name: b.name, monthly: pnl.businessRevenue }]);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('gives specific reasons to come back later, and is deterministic', () => {
    const w0 = thaw(addFounder(makeWorld(42, ['lagos'])));
    const c = companyOf(w0, 'u_founder');
    const b = prospect(w0);
    // Unreliable product.
    c.product.quality = 0.1;
    const r1 = run(w0, 'u_founder', { type: 'business.pitch', companyId: c.id, businessId: b.id });
    expect(r1.result.answer).toBe('later');
    expect(r1.result.reason).toMatch(/more reliable/);
    const again = run(w0, 'u_founder', {
      type: 'business.pitch',
      companyId: c.id,
      businessId: b.id,
    });
    expect(again.result).toEqual(r1.result);
    // Too expensive.
    const w1 = thaw(w0);
    const c1 = companyOf(w1, 'u_founder');
    c1.product.quality = 0.6;
    c1.price = 100 * col(w1.markets.lagos!);
    const r2 = run(w1, 'u_founder', { type: 'business.pitch', companyId: c.id, businessId: b.id });
    expect(r2.result.answer).toBe('later');
    expect(r2.result.reason).toMatch(/price under/);
  });

  it('refuses sectors they do not buy, existing customers, and a fifth pitch in a month', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    const c = companyOf(w, 'u_founder');
    c.industry = 'logistics';
    const noFintech = businesses(w).find((x) => !(businessKind(x.kind)!.buys.logistics ?? 0))!;
    const r = tryRun(w, 'u_founder', {
      type: 'business.pitch',
      companyId: c.id,
      businessId: noFintech.id,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('business.pitch');
    const v = playerView(w, 'u_founder')!.market.businesses.find((x) => x.id === noFintech.id)!;
    expect(v.you.canPitch).toBe(false);
    expect(v.you.reason).toMatch(/don’t buy logistics/);

    const targets = businesses(w).filter((x) => (businessKind(x.kind)!.buys.logistics ?? 0) > 0);
    for (const t of targets.slice(0, ECONOMY.pitchesPerMonth))
      w = run(w, 'u_founder', { type: 'business.pitch', companyId: c.id, businessId: t.id }).world;
    const fifth = tryRun(w, 'u_founder', {
      type: 'business.pitch',
      companyId: c.id,
      businessId: targets[ECONOMY.pitchesPerMonth]!.id,
    });
    expect(fifth.ok).toBe(false);
    const won = targets.find((t) =>
      w.markets.lagos!.businesses![t.id]!.suppliers.some((s) => s.companyId === c.id),
    );
    if (won) {
      const again = tryRun(w, 'u_founder', {
        type: 'business.pitch',
        companyId: c.id,
        businessId: won.id,
      });
      expect(again.ok).toBe(false);
    }
  });
});

describe('gigs at businesses', () => {
  it('pays from the business till, taxes it, spends hours and energy, and caps at 8 a month', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const total = moneyByCurrency(w);
    const m = w.markets.lagos!;
    const b = businesses(w).find((x) => x.kind === 'cafe' || x.kind === 'restaurant')!;
    const before = personal(w, 'u_founder');
    const till = bal(w, b.account);
    const energy = w.players.u_founder!.energy;
    const r = run(w, 'u_founder', { type: 'gig.take', businessId: b.id, gigId: 'shift' });
    w = r.world;
    const pay = Math.round(col(m) * businessKind(b.kind)!.gigs[0]!.payCol);
    expect(r.result.pay).toBe(pay);
    expect(r.result.short).toBe(false);
    expect(r.result.tax).toBe(Math.round(pay * m.data.tax.personalIncome));
    expect(personal(w, 'u_founder')).toBe(before + pay - r.result.tax);
    expect(bal(w, b.account)).toBe(till - pay);
    expect(w.players.u_founder!.energy).toBeLessThan(energy);
    expect(playerView(w, 'u_founder')!.market.economy.gigsWorked).toBe(1);
    for (let i = 1; i < ECONOMY.gigsPerMonth; i++)
      w = run(w, 'u_founder', { type: 'gig.take', businessId: b.id, gigId: 'shift' }).world;
    const fifth = tryRun(w, 'u_founder', { type: 'gig.take', businessId: b.id, gigId: 'shift' });
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.error.code).toBe('gig.limit');
    expect(moneyByCurrency(w)).toEqual(total);
    // The old agency gig still works next month (shared monthly count).
    w = settle(w, 'lagos', 1);
    w = run(w, 'u_founder', { type: 'player.gig' }).world;
  });

  it('pays more for a skill match, and only what a struggling business has', () => {
    const w = thaw(addFounder(makeWorld(42, ['lagos'])));
    const m = w.markets.lagos!;
    const b = businesses(w).find((x) =>
      businessKind(x.kind)!.gigs.some((g) => g.skill === 'tech'),
    )!;
    const g = businessKind(b.kind)!.gigs.find((x) => x.skill === 'tech')!;
    const view = playerView(w, 'u_founder')!.market.businesses.find((x) => x.id === b.id)!;
    const gv = view.gigs.find((x) => x.id === g.id)!;
    expect(gv.skillMatch).toBe(true); // an engineer
    expect(gv.pay).toBe(Math.round(col(m) * g.payCol * ECONOMY.skillPremium));
    // The business is nearly broke: it pays what it has, and says so.
    const left = 1000;
    const acc = w.accounts[b.account]!;
    w.accounts[m.ext.genesis]!.balance += acc.balance - left;
    acc.balance = left;
    const total = moneyByCurrency(w);
    const r = run(w, 'u_founder', { type: 'gig.take', businessId: b.id, gigId: g.id });
    expect(r.result.pay).toBe(left);
    expect(r.result.short).toBe(true);
    expect(r.result.promised).toBe(gv.pay);
    expect(r.result.message).toMatch(/could only pay/);
    expect(moneyByCurrency(r.world)).toEqual(total);
  });
});

describe('venues and meetings', () => {
  it('eating costs your own money, goes to the business and restores energy', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    w.players.u_founder!.energy = 50;
    const b = businesses(w).find((x) => x.kind === 'buka')!;
    const it = businessKind('buka')!.venue!.items[0]!;
    const price = Math.round(col(w.markets.lagos!) * it.priceCol);
    const before = personal(w, 'u_founder');
    const till = bal(w, b.account);
    const r = run(w, 'u_founder', { type: 'venue.buy', businessId: b.id, itemId: it.id });
    w = r.world;
    expect(r.result.price).toBe(price);
    expect(personal(w, 'u_founder')).toBe(before - price);
    expect(bal(w, b.account)).toBe(till + price);
    expect(w.players.u_founder!.energy).toBe(50 + it.energy!);
  });

  it('a meal with a fund partner warms the contact toward a warm intro; the inviter pays for both', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const fund = Object.values(w.funds).find((f) => f.market === 'lagos' && f.ai)!;
    expect(warmIntro(w, w.players.u_founder!, fund.id).warmth).toBe(0);
    const b = businesses(w).find((x) => x.kind === 'restaurant')!;
    const before = personal(w, 'u_founder');
    const hours = w.players.u_founder!.hours.used;
    const r = run(w, 'u_founder', {
      type: 'venue.buy',
      businessId: b.id,
      itemId: 'dinner',
      withId: fund.id,
    });
    w = r.world;
    const price = Math.round(col(w.markets.lagos!) * 0.025);
    expect(personal(w, 'u_founder')).toBe(before - price * 2);
    expect(w.players.u_founder!.hours.used - hours).toBe(ECONOMY.meetingHours);
    expect(warmIntro(w, w.players.u_founder!, fund.id).warmth).toBeGreaterThan(0.3);
    // Meeting again warms it further.
    w = run(w, 'u_founder', {
      type: 'venue.buy',
      businessId: b.id,
      itemId: 'lunch',
      withId: fund.id,
    }).world;
    expect(warmIntro(w, w.players.u_founder!, fund.id).warmth).toBeGreaterThan(r.result.warmth);
  });

  it('a meal with an AI angel warms their fund, so it counts toward a warm intro', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const angel = Object.values(w.players).find((p) => p.ai && p.angel && p.market === 'lagos')!;
    const fundId = angel.angel!.fundId;
    const b = businesses(w).find((x) => x.kind === 'restaurant')!;
    w = run(w, 'u_founder', {
      type: 'venue.buy',
      businessId: b.id,
      itemId: 'lunch',
      withId: angel.id,
    }).world;
    expect(w.players.u_founder!.contacts!.some((c) => c.id === `fund:${fundId}`)).toBe(true);
    expect(warmIntro(w, w.players.u_founder!, fundId).warmth).toBeGreaterThan(0.25);
  });

  it('a meal with another player: only the inviter spends hours; contacts and trust both ways', () => {
    let w = addInvestor(addFounder(makeWorld(42, ['lagos'])), 'u_inv');
    const b = businesses(w).find((x) => x.kind === 'cafe' || x.kind === 'restaurant')!;
    const item = businessKind(b.kind)!.venue!.items.find((x) => x.meeting)!;
    const theirs = w.players.u_inv!.hours.used;
    const theirMoney = personal(w, 'u_inv');
    w = run(w, 'u_founder', {
      type: 'venue.buy',
      businessId: b.id,
      itemId: item.id,
      withId: 'u_inv',
    }).world;
    expect(w.players.u_inv!.hours.used - theirs).toBe(0);
    expect(personal(w, 'u_inv')).toBe(theirMoney);
    expect(w.players.u_founder!.trust.u_inv).toBeGreaterThan(0);
    expect(w.players.u_inv!.trust.u_founder).toBeGreaterThan(0);
    expect(w.players.u_inv!.contacts!.some((c) => c.id === 'player:u_founder')).toBe(true);
    expect(w.players.u_founder!.contacts!.some((c) => c.id === 'player:u_inv')).toBe(true);
  });

  it('refuses meetings over things you do not share, and spending you cannot afford', () => {
    const w0 = thaw(addInvestor(addFounder(makeWorld(42, ['lagos'])), 'u_inv'));
    const barber = businesses(w0).find((x) => x.kind === 'barber')!;
    const r = tryRun(w0, 'u_founder', {
      type: 'venue.buy',
      businessId: barber.id,
      itemId: 'cut',
      withId: 'u_inv',
    });
    expect(r.ok).toBe(false);
    const acc = w0.accounts[w0.players.u_founder!.accounts.local]!;
    w0.accounts[w0.markets.lagos!.ext.genesis]!.balance += acc.balance;
    acc.balance = 0;
    const broke = tryRun(w0, 'u_founder', {
      type: 'venue.buy',
      businessId: barber.id,
      itemId: 'cut',
    });
    expect(broke.ok).toBe(false);
  });
});

describe('events at local venues', () => {
  it('a hotel or event venue hosting an event gets the venue fee', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const total = moneyByCurrency(w);
    const venue = businesses(w).find((x) => x.kind === 'event-venue' || x.kind === 'hotel')!;
    const till = bal(w, venue.account);
    const r = run(w, 'u_founder', {
      type: 'event.host',
      kind: 'founder-meetup',
      title: 'Founders at the Venue',
      venue: 'hall',
      budget: 1_000_000,
      businessId: venue.id,
    });
    w = r.world;
    expect(bal(w, venue.account)).toBe(till + r.result.cost - 1_000_000);
    expect(w.events![r.result.eventId]!.businessId).toBe(venue.id);
    expect(moneyByCurrency(w)).toEqual(total);
    const shop = businesses(w).find((x) => x.kind === 'barber')!;
    expect(
      tryRun(w, 'u_founder', {
        type: 'event.cancel',
        eventId: r.result.eventId,
      }).ok,
    ).toBe(true);
    expect(
      tryRun(w, 'u_founder', {
        type: 'event.host',
        kind: 'founder-meetup',
        title: 'Founders at the Barber',
        venue: 'hall',
        budget: 0,
        businessId: shop.id,
      }).ok,
    ).toBe(false);
  });
});

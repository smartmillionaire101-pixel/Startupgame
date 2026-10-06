import { describe, expect, it } from 'vitest';
import {
  BUSINESS_KINDS,
  CITY_BUSINESSES,
  LATE_OPENINGS,
  businessKind,
} from '../src/data/businesses.js';
import { CITY_NAME_PARTS } from '../src/data/business-names.js';
import { BACKGROUNDS, LIFESTYLE_TIERS, STARTING_RUNWAY_MONTHS } from '../src/data/characters.js';
import {
  CAR_SHOP_KINDS,
  FURNITURE_SLOTS,
  SHOP_KINDS_FOR_SLOT,
  furnitureItem,
} from '../src/data/lifestyle-shop.js';
import { MARKET_IDS } from '../src/data/markets.js';
import type { MarketId } from '../src/data/markets.js';
import { AI_STARTUPS_PER_MARKET } from '../src/world.js';
import { aiStartupTarget } from '../src/ai.js';
import { GROWTH, growthTarget, isOpen, jobPay, streetOf } from '../src/economy.js';
import { col } from '../src/helpers.js';
import { scale } from '../src/money.js';
import { MAX_COMFORT_ENERGY, comfortEnergy } from '../src/shop.js';
import { NPC_POOL, npcPerson, parseNpcId, peopleHere } from '../src/people.js';
import { lifestyleCost } from '../src/personal.js';
import { playerView } from '../src/views.js';
import type { LocalBusiness, World } from '../src/types.js';
import {
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
/** Worlds from dispatch are frozen: copy before poking at them. */
const thaw = (w: World): World => structuredClone(w);
const personal = (w: World, id: string) => bal(w, w.players[id]!.accounts.local);
const open = (w: World, market: MarketId = 'lagos') =>
  Object.values(w.markets[market]!.businesses ?? {}).filter(isOpen);
const byKind = (w: World, kind: string, market: MarketId = 'lagos') =>
  open(w, market).find((b) => b.kind === kind)!;

/** A human who isn't a founder or banker (nothing else touches their savings). */
function addPerson(
  w: World,
  id: string,
  market: MarketId = 'lagos',
  backgroundId = 'i-first',
): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`.slice(0, 20),
    name: 'Ama Person',
    role: 'investor',
    backgroundId,
    market,
    investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
  }).world;
}

describe('pace and money (Wave 6 §A1)', () => {
  it('twelve months of runway; living costs about 25% lower', () => {
    expect(STARTING_RUNWAY_MONTHS).toBe(12);
    expect(LIFESTYLE_TIERS.map((t) => t.costCol)).toEqual([0.5, 0.75, 1.35, 2.625, 5.25]);
  });

  it('every human background’s savings last 24 months at Modest with no income', () => {
    for (const bg of BACKGROUNDS) {
      const w = makeWorld(3, ['lagos']);
      const m = w.markets.lagos!;
      const r = run(w, 'u_x', {
        type: 'player.create',
        handle: 'h_saver',
        name: 'Sam Saver',
        role: bg.role,
        backgroundId: bg.id,
        market: 'lagos',
        ...(bg.role === 'founder'
          ? {
              company: {
                name: 'Savings Test',
                industry: 'fintech' as const,
                revenueModel: 'subscription' as const,
                idea: 'Testing savings',
                incorporation: 'local' as const,
              },
            }
          : {}),
        ...(bg.role === 'investor'
          ? { investor: { sectors: ['fintech' as const], stages: ['seed' as const], checkSize: 1 } }
          : {}),
        ...(bg.role === 'banker'
          ? { bank: { name: 'Saver Bank', bankType: 'microfinance' as const } }
          : {}),
      });
      const p = r.world.players.u_x!;
      expect(p.lifestyleTier).toBe(2);
      // Savings cover 24 months; founders also put one month into their company on day one.
      expect(
        personal(r.world, 'u_x') + (bg.role === 'founder' ? scale(col(m), 1) : 0),
        bg.id,
      ).toBeGreaterThanOrEqual(24 * lifestyleCost(r.world, p));
    }
  });

  it('a person with no income stays solvent at Modest for 24 months', () => {
    // The thinnest savings anyone starts with: exactly the 24-month floor.
    let w = thaw(addPerson(makeWorld(5, ['lagos']), 'u_p', 'lagos', 'i-first'));
    const acc = w.accounts[w.players.u_p!.accounts.local]!;
    const floor = 24 * lifestyleCost(w, w.players.u_p!);
    w.accounts[w.markets.lagos!.ext.genesis]!.balance += acc.balance - floor;
    acc.balance = floor;
    w = settle(w, 'lagos', 24);
    const p = w.players.u_p!;
    expect(p.credit.missedPayments).toBe(0);
    expect(p.lifestyleTier).toBe(2);
    expect(personal(w, 'u_p')).toBeGreaterThanOrEqual(0);
  });

  it('a full-time entry job at Modest leaves you slightly ahead each month, in every city', () => {
    for (const market of MARKET_IDS) {
      let w = addPerson(makeWorld(7, [market]), 'u_p', market);
      const m = w.markets[market]!;
      const entry = playerView(w, 'u_p')!
        .market.jobs.filter((j) => j.level === 'entry')
        .sort((a, z) => a.monthlyPay - z.monthlyPay)[0]!;
      expect(entry, market).toBeDefined();
      w = run(w, 'u_p', { type: 'job.take', businessId: entry.businessId, role: entry.role }).world;
      const before = personal(w, 'u_p');
      w = settle(w, market, 1);
      const gain = personal(w, 'u_p') - before;
      expect(gain, market).toBeGreaterThan(0);
      // Slightly: less than half a month of living costs.
      expect(gain, market).toBeLessThan(scale(col(m), 0.5));
      expect(w.players.u_p!.credit.missedPayments).toBe(0);
    }
  });

  it('a full-time job at Modest stays solvent for 24 months', () => {
    let w = addPerson(makeWorld(9, ['lagos']), 'u_p');
    const job = playerView(w, 'u_p')!.market.jobs.find((j) => j.level === 'entry')!;
    w = run(w, 'u_p', { type: 'job.take', businessId: job.businessId, role: job.role }).world;
    const start = personal(w, 'u_p');
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 24);
    const p = w.players.u_p!;
    expect(p.credit.missedPayments).toBe(0);
    expect(p.lifestyleTier).toBe(2);
    expect(personal(w, 'u_p')).toBeGreaterThan(start * 0.9);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('gigs pay about 30% more', () => {
    const w = addFounder(makeWorld(42, ['lagos']));
    const m = w.markets.lagos!;
    expect(playerView(w, 'u_founder')!.market.floorGig.pay).toBe(
      Math.round(m.data.floorGig.pay * 100 * 1.3),
    );
  });
});

describe('things to do (Wave 6 §A2)', () => {
  const REQUIRED: (string | string[])[] = [
    'cinema',
    'lounge',
    'furniture-store',
    'car-dealer',
    ['appliance-store', 'electronics'],
    ['spa', 'gym', 'studio-gym'],
    'football-pitch',
    ['live-music', 'karaoke'],
  ];

  it('every city opens with two nightclubs and the full set of places to go', () => {
    for (const city of MARKET_IDS) {
      const roster = CITY_BUSINESSES[city]!;
      const dayOne = roster.slice(0, roster.length - LATE_OPENINGS);
      expect(dayOne.filter((s) => s.kind === 'nightclub').length, city).toBeGreaterThanOrEqual(2);
      for (const need of REQUIRED) {
        const kinds = Array.isArray(need) ? need : [need];
        expect(
          dayOne.some((s) => kinds.includes(s.kind)),
          `${city}: ${kinds.join(' or ')}`,
        ).toBe(true);
      }
      // New seeds stand on streets already used in that city.
      const streets = new Set(roster.slice(0, 40).map((s) => s.street));
      if (city !== 'freetown')
        for (const s of roster.slice(40)) expect(streets, `${city}: ${s.name}`).toContain(s.street);
    }
    for (const coastal of ['lagos', 'accra', 'freetown', 'dubai'] as const)
      expect(CITY_BUSINESSES[coastal]!.some((s) => s.kind === 'beach-club')).toBe(true);
  });

  it('the new kinds have things to do, with fun and people to meet', () => {
    for (const k of [
      'cinema',
      'lounge',
      'karaoke',
      'arcade',
      'spa',
      'beach-club',
      'live-music',
      'football-pitch',
      'art-gallery',
    ]) {
      const spec = businessKind(k)!;
      expect(spec, k).toBeDefined();
      const acts = spec.venue!.items.filter((i) => i.activity);
      expect(acts.length, k).toBeGreaterThan(0);
      for (const a of acts) {
        expect(a.fun, k).toBeGreaterThan(0);
        expect(a.fun!, k).toBeLessThanOrEqual(10);
      }
    }
    const club = businessKind('nightclub')!.venue!.items;
    for (const id of ['entry', 'dance', 'vip', 'bottle'])
      expect(club.map((i) => i.id)).toContain(id);
    expect(club.find((i) => i.id === 'vip')!.meeting).toBe(true);
    expect(club.find((i) => i.id === 'bottle')!.meeting).toBe(true);
    expect(businessKind('football-pitch')!.venue!.items[0]!.meetChance).toBeGreaterThanOrEqual(0.4);
    for (const k of ['bar', 'pub', 'hotel', 'gym'])
      expect(
        businessKind(k)!.venue!.items.some((i) => i.activity),
        k,
      ).toBe(true);
  });

  it('dancing costs money, adds energy, and can introduce you to someone (deterministically)', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    const total = moneyByCurrency(w);
    const club = byKind(w, 'nightclub');
    const before = personal(w, 'u_founder');
    w.players.u_founder!.energy = 40;
    const r = run(w, 'u_founder', { type: 'venue.buy', businessId: club.id, itemId: 'dance' });
    w = r.world;
    expect(personal(w, 'u_founder')).toBeLessThan(before);
    expect(w.players.u_founder!.energy).toBe(44);
    expect(r.result).toHaveProperty('met');
    // Dance until you meet someone: they're a contact at warmth 0.12.
    let met = r.result.met;
    for (let i = 0; i < 30 && !met; i++) {
      const again = run(w, 'u_founder', {
        type: 'venue.buy',
        businessId: club.id,
        itemId: 'dance',
      });
      w = again.world;
      met = again.result.met;
    }
    expect(met).toBeTruthy();
    const c = w.players.u_founder!.contacts!.find((x) => x.refId === met.refId)!;
    expect(c.kind).toBe(met.kind);
    expect(c.warmth).toBeCloseTo(0.12, 2);
    // "Save contact" after meeting someone takes the Who's here id the result carries.
    expect(typeof met.personId).toBe('string');
    const saved = run(w, 'u_founder', {
      type: 'contact.save',
      personId: met.personId,
      name: met.name,
    });
    w = saved.world;
    expect(saved.result.contact.kind).toBe(met.kind);
    expect(moneyByCurrency(w)).toEqual(total);
    // Same world, same buys: same outcome.
    const w2 = thaw(addFounder(makeWorld(42, ['lagos'])));
    w2.players.u_founder!.energy = 40;
    const r2 = run(w2, 'u_founder', { type: 'venue.buy', businessId: club.id, itemId: 'dance' });
    expect(r2.result.met).toEqual(r.result.met);
  });

  it('contact.save accepts a fund partner by `fund:<id>` or by the bare fund id', () => {
    let w = thaw(addFounder(makeWorld(42, ['lagos'])));
    const fund = Object.values(w.funds).find((f) => f.market === 'lagos')!;
    const a = run(w, 'u_founder', { type: 'contact.save', personId: fund.id, name: '' });
    w = a.world;
    expect(a.result.contact.kind).toBe('fund');
    const b = run(w, 'u_founder', { type: 'contact.save', personId: `fund:${fund.id}`, name: '' });
    expect(b.result.contact.id).toBe(a.result.contact.id);
  });
});

describe('shops you walk into (Wave 6 §A3)', () => {
  it('21 slots, each sold by a showroom kind; comfort keeps the same top energy', () => {
    expect(FURNITURE_SLOTS.length).toBeGreaterThanOrEqual(20);
    for (const s of FURNITURE_SLOTS) {
      expect(SHOP_KINDS_FOR_SLOT[s].length, s).toBeGreaterThan(0);
      for (const t of [1, 2, 3]) expect(furnitureItem(`${s}-${t}`), `${s}-${t}`).toBeDefined();
    }
    expect(SHOP_KINDS_FOR_SLOT.tv).toContain('electronics');
    expect(SHOP_KINDS_FOR_SLOT.sofa).toEqual(['furniture-store']);
    expect(CAR_SHOP_KINDS).toContain('car-dealer');
    const p = thaw(addFounder(makeWorld(42, ['lagos']))).players.u_founder!;
    p.home = { items: FURNITURE_SLOTS.map((s) => ({ slot: s, itemId: `${s}-3`, paid: 1 })) };
    expect(comfortEnergy(p)).toBe(MAX_COMFORT_ENERGY);
  });

  it('power is named locally', () => {
    const w = addFounder(makeWorld(42, ['lagos', 'london']));
    const lagos = playerView(w, 'u_founder')!.market.shop.furniture.find((f) => f.id === 'power-1');
    expect(lagos!.label).toMatch(/generator/i);
  });

  it('buying in a showroom pays that business; the wrong kind of shop says no', () => {
    let w = addFounder(makeWorld(42, ['lagos']));
    const total = moneyByCurrency(w);
    const appliances = byKind(w, 'appliance-store');
    const furniture = byKind(w, 'furniture-store');
    const dealer = byKind(w, 'car-dealer');
    const view = playerView(w, 'u_founder')!.market;
    const tv = view.shop.furniture.find((f) => f.id === 'tv-1')!;
    expect(view.businesses.find((b) => b.id === appliances.id)!.sells).toEqual({
      slots: FURNITURE_SLOTS.filter((s) => SHOP_KINDS_FOR_SLOT[s].includes('appliance-store')),
    });
    expect(view.businesses.find((b) => b.id === dealer.id)!.sells).toEqual({ cars: true });
    expect(view.businesses.find((b) => b.kind === 'cafe')!.sells).toBeNull();

    const wrong = tryRun(w, 'u_founder', {
      type: 'home.buy',
      itemId: 'tv-1',
      businessId: furniture.id,
    });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe('shop.kind');
    const till = bal(w, appliances.account);
    w = run(w, 'u_founder', { type: 'home.buy', itemId: 'tv-1', businessId: appliances.id }).world;
    expect(bal(w, appliances.account)).toBe(till + tv.price);

    const noCars = tryRun(w, 'u_founder', {
      type: 'car.buy',
      modelId: 'motorbike',
      businessId: appliances.id,
    });
    expect(!noCars.ok && noCars.error.code).toBe('shop.kind');
    const bike = view.shop.cars.find((c) => c.id === 'motorbike')!;
    const dealerTill = bal(w, dealer.account);
    w = run(w, 'u_founder', { type: 'car.buy', modelId: 'motorbike', businessId: dealer.id }).world;
    expect(bal(w, dealer.account)).toBe(dealerTill + bike.price);
    // Old clients (no businessId) still work.
    w = run(w, 'u_founder', { type: 'home.buy', itemId: 'sofa-1' }).world;
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('a showroom in another city is refused', () => {
    const w = addFounder(makeWorld(42, ['lagos', 'london']));
    const shop = byKind(w, 'appliance-store', 'london');
    const r = tryRun(w, 'u_founder', { type: 'home.buy', itemId: 'tv-1', businessId: shop.id });
    expect(!r.ok && r.error.code).toBe('business.market');
  });
});

describe('more jobs (Wave 6 §A4)', () => {
  it('every kind has entry, skilled and lead roles; every role pays a living', () => {
    for (const k of BUSINESS_KINDS) {
      expect(k.roles.length, k.kind).toBeGreaterThanOrEqual(3);
      const levels = new Set(k.roles.map((r) => r.level));
      for (const l of ['entry', 'skilled', 'lead'] as const)
        expect(levels, `${k.kind} ${l}`).toContain(l);
      for (const r of k.roles) {
        expect(r.payCol, `${k.kind}/${r.role}`).toBeGreaterThanOrEqual(0.9);
        if (r.level === 'skilled') {
          expect(r.payCol).toBeGreaterThanOrEqual(1.2);
          expect(r.payCol).toBeLessThanOrEqual(2);
        }
        if (r.level === 'lead') {
          expect(r.payCol).toBeGreaterThanOrEqual(2);
          expect(r.payCol).toBeLessThanOrEqual(3);
        }
      }
    }
    for (const label of ['DJ', 'Bouncer', 'Projectionist', 'Car salesperson', 'Spa therapist'])
      expect(
        BUSINESS_KINDS.some((k) => k.roles.some((r) => r.label === label)),
        label,
      ).toBe(true);
  });

  it('at least 30 jobs in every city, best paid first', () => {
    for (const market of MARKET_IDS) {
      const w = addPerson(makeWorld(11, [market]), 'u_p', market);
      const jobs = playerView(w, 'u_p')!.market.jobs;
      expect(jobs.length, market).toBeGreaterThanOrEqual(30);
      for (let i = 1; i < jobs.length; i++)
        expect(jobs[i - 1]!.monthlyPay).toBeGreaterThanOrEqual(jobs[i]!.monthlyPay);
      const m = w.markets[market]!;
      expect(jobs.at(-1)!.monthlyPay).toBeGreaterThanOrEqual(scale(col(m), 0.9));
    }
  });

  it('human staff take part of the business’s wage bill, not on top of it', () => {
    let w = addPerson(makeWorld(13, ['lagos']), 'u_p');
    const job = playerView(w, 'u_p')!.market.jobs.find((j) => j.level === 'lead')!;
    w = run(w, 'u_p', { type: 'job.take', businessId: job.businessId, role: job.role }).world;
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 3);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
    const b = w.markets.lagos!.businesses![job.businessId]!;
    const m = w.markets.lagos!;
    const role = businessKind(b.kind)!.roles.find((r) => r.role === job.role)!;
    expect(b.lastMonth.costs).toBeGreaterThanOrEqual(jobPay(m, w.players.u_p!, role));
  });
});

describe('the city grows (Wave 6 §A5)', () => {
  it('a newcomer sees a new business open; settlements open more up to the target', () => {
    const w0 = makeWorld(21, ['freetown']);
    const n0 = open(w0, 'freetown').length;
    let w = addPerson(w0, 'u_a', 'freetown');
    const gen = open(w, 'freetown').filter((b) => b.seed === -1);
    expect(gen).toHaveLength(1);
    const g = gen[0]!;
    expect(g.gen).toBeDefined();
    expect(g.gen!.name).toBe(g.name);
    expect(CITY_BUSINESSES.freetown!.map((s) => s.district)).toContain(g.district);
    expect(streetOf(g)).toBe(g.gen!.street);
    const total = moneyByCurrency(w);
    const target = growthTarget(w, w.markets.freetown!);
    expect(target).toBe(n0 + GROWTH.perHuman);
    w = settle(w, 'freetown', 1);
    // One more generated business opens to reach the target (two per human).
    expect(open(w, 'freetown').filter((b) => b.seed === -1)).toHaveLength(2);
    expect(moneyByCurrency(w)).toEqual(total);
    const view = playerView(w, 'u_a')!.market.businesses;
    const v = view.find((b) => b.id === g.id)!;
    expect(v.isNew).toBe(true);
    expect(v.street).toBe(g.gen!.street);
    expect(view.find((b) => b.id === 'biz-freetown-0')!.isNew).toBe(false);
    expect(w.inbox.u_a!.some((i) => i.text.startsWith('New in town: '))).toBe(true);
    expect(w.markets.freetown!.humansJoined).toBe(1);
  });

  it('is deterministic and conserves money', () => {
    const play = () => {
      let w = makeWorld(23, ['lagos']);
      for (let i = 0; i < 5; i++) w = addPerson(w, `u_${i}`);
      return settle(w, 'lagos', 3);
    };
    const a = play();
    const b = play();
    expect(a).toEqual(b);
    const names = open(a)
      .filter((x) => x.seed === -1)
      .map((x) => x.name);
    expect(names.length).toBe(10);
    expect(new Set(names).size).toBe(names.length);
    const parts = CITY_NAME_PARTS.lagos;
    for (const x of open(a).filter((y) => y.seed === -1))
      expect([...parts.female, ...parts.male]).toContain(x.owner.name.split(' ')[0]);
  });

  it('opens at most three a settlement, and stops at roster + 150', () => {
    let w = makeWorld(25, ['lagos']);
    for (let i = 0; i < 5; i++) w = addPerson(w, `u_${i}`);
    const gen = (x: World) => open(x).filter((b) => b.seed === -1).length;
    expect(gen(w)).toBe(5);
    w = thaw(w);
    w.markets.lagos!.humansJoined = 500;
    const after = settle(w, 'lagos', 1);
    expect(gen(after)).toBe(8);
    expect(growthTarget(after, after.markets.lagos!)).toBe(
      CITY_BUSINESSES.lagos!.length + GROWTH.cap,
    );
  });

  it('saved worlds count the humans already there', () => {
    let w = makeWorld(27, ['lagos']);
    w = addPerson(w, 'u_a');
    w = thaw(addPerson(w, 'u_b'));
    delete w.markets.lagos!.humansJoined;
    w = addPerson(w, 'u_c');
    expect(w.markets.lagos!.humansJoined).toBe(3);
  });

  it('AI startups grow with humans (one per four, up to twenty more)', () => {
    let w = makeWorld(29, ['lagos']);
    expect(aiStartupTarget(w, 'lagos')).toBe(AI_STARTUPS_PER_MARKET);
    for (let i = 0; i < 8; i++) w = addPerson(w, `u_${i}`);
    expect(aiStartupTarget(w, 'lagos')).toBe(AI_STARTUPS_PER_MARKET + 2);
    w = thaw(w);
    for (let i = 8; i < 100; i++) w.players[`fake_${i}`] = { ...w.players.u_0!, id: `fake_${i}` };
    expect(aiStartupTarget(w, 'lagos')).toBe(AI_STARTUPS_PER_MARKET + 20);
  });
});

describe('who’s here (Wave 6 §A6)', () => {
  it('owners, staff, AI founders, angels, partners and regulars, stable for the month', () => {
    let w = addInvestor(addFounder(makeWorld(31, ['lagos'])));
    const job = playerView(w, 'u_investor')!.market.jobs.find((j) => j.level === 'entry')!;
    w = run(w, 'u_investor', {
      type: 'job.take',
      businessId: job.businessId,
      role: job.role,
    }).world;
    const m = w.markets.lagos!;
    const here = peopleHere(w, m);
    expect(peopleHere(w, m)).toEqual(here);
    for (const b of open(w)) {
      const people = here[b.id]!;
      expect(people[0]).toMatchObject({ id: `biz:${b.id}`, kind: 'owner', role: 'Owner' });
      for (const p of people) expect(['female', 'male']).toContain(p.gender);
      const spec = businessKind(b.kind)!;
      const regulars = people.filter((p) => p.kind === 'regular');
      if (spec.category === 'food' || spec.category === 'hospitality') {
        expect(regulars.length, b.kind).toBeGreaterThanOrEqual(1);
        expect(regulars.length, b.kind).toBeLessThanOrEqual(6);
      }
      for (const r of regulars) {
        expect(parseNpcId(r.id)).toMatchObject({ market: 'lagos' });
        expect(npcPerson('lagos', parseNpcId(r.id)!.n)).toEqual(r);
      }
    }
    const all = Object.values(here).flat();
    expect(all.find((p) => p.id === 'u_investor')).toMatchObject({
      kind: 'staff',
      role: job.label,
      playerId: 'u_investor',
    });
    // Each AI founder, angel and fund partner is in exactly one place.
    const aiFounders = Object.values(w.players).filter(
      (p) => p.ai && p.role === 'founder' && p.market === 'lagos' && !p.angel,
    );
    expect(aiFounders.length).toBeGreaterThan(0);
    for (const p of aiFounders) {
      const count = all.filter((x) => x.id === p.id).length;
      if (p.companyIds.some((id) => w.companies[id]?.status === 'active')) expect(count).toBe(1);
    }
    const angels = all.filter((x) => x.kind === 'angel');
    expect(angels.length).toBeGreaterThan(0);
    expect(new Set(angels.map((a) => a.id)).size).toBe(angels.length);
    expect(all.some((x) => x.kind === 'partner' && x.id.startsWith('fund:'))).toBe(true);
    // The view carries them.
    const v = playerView(w, 'u_founder')!.market.businesses;
    expect(v.find((b) => b.id === job.businessId)!.people.some((p) => p.id === 'u_investor')).toBe(
      true,
    );
    // Next month, people move around.
    const next = settle(w, 'lagos', 1);
    expect(peopleHere(next, next.markets.lagos!)).not.toEqual(here);
  });

  it('npc ids are stable and bounded', () => {
    expect(parseNpcId('npc:lagos:3')).toEqual({ market: 'lagos', n: 3 });
    expect(parseNpcId(`npc:lagos:${NPC_POOL}`)).toBeNull();
    expect(parseNpcId('npc:atlantis:1')).toBeNull();
    expect(npcPerson('freetown', 7)).toEqual(npcPerson('freetown', 7));
  });
});

describe('saving contacts (Wave 6 §A7)', () => {
  it('saves regulars, owners, partners and players; 0.3 if already met; free; removable', () => {
    let w = addInvestor(addFounder(makeWorld(33, ['lagos', 'london'])));
    const total = moneyByCurrency(w);
    const cash = personal(w, 'u_founder');
    const cafe = byKind(w, 'restaurant');
    const r = run(w, 'u_founder', { type: 'contact.save', personId: 'npc:lagos:12', name: 'Ama' });
    w = r.world;
    let c = w.players.u_founder!.contacts![0]!;
    expect(c).toMatchObject({ kind: 'local', refId: 'npc:lagos:12', warmth: 0.15 });
    w = run(w, 'u_founder', { type: 'contact.save', personId: 'npc:lagos:12', name: 'Ama' }).world;
    c = w.players.u_founder!.contacts![0]!;
    expect(c.warmth).toBe(0.3);
    expect(w.players.u_founder!.contacts!.filter((x) => x.refId === 'npc:lagos:12')).toHaveLength(
      1,
    );

    w = run(w, 'u_founder', { type: 'contact.save', personId: `biz:${cafe.id}`, name: 'x' }).world;
    expect(w.players.u_founder!.contacts![0]).toMatchObject({
      kind: 'local',
      refId: `biz:${cafe.id}`,
    });
    const fund = Object.values(w.funds).find((f) => f.market === 'lagos' && f.ai && !f.angelId)!;
    w = run(w, 'u_founder', { type: 'contact.save', personId: `fund:${fund.id}`, name: 'x' }).world;
    expect(w.players.u_founder!.contacts![0]).toMatchObject({ kind: 'fund', refId: fund.id });
    w = run(w, 'u_founder', { type: 'contact.save', personId: 'u_investor', name: 'x' }).world;
    expect(w.players.u_founder!.contacts![0]).toMatchObject({
      kind: 'player',
      refId: 'u_investor',
    });
    const ai = Object.values(w.players).find((p) => p.ai && p.role === 'founder' && !p.angel)!;
    w = run(w, 'u_founder', { type: 'contact.save', personId: ai.id, name: 'x' }).world;
    expect(w.players.u_founder!.contacts![0]).toMatchObject({ kind: 'founder', refId: ai.id });

    // Chat ids in the view.
    const contacts = playerView(w, 'u_founder')!.me.contacts;
    const chat = (ref: string) => contacts.find((x) => x.refId === ref)!.chatId;
    expect(chat('npc:lagos:12')).toBe('npc:lagos:12');
    expect(chat(`biz:${cafe.id}`)).toBe(`biz:${cafe.id}`);
    expect(chat(fund.id)).toBe(`fund:${fund.id}`);
    expect(chat('u_investor')).toBe('u_investor');
    expect(chat(ai.id)).toBe(ai.id);

    // Other cities and unknown ids are refused.
    expect(
      tryRun(w, 'u_founder', { type: 'contact.save', personId: 'npc:london:1', name: 'x' }).ok,
    ).toBe(false);
    expect(
      tryRun(w, 'u_founder', { type: 'contact.save', personId: 'npc:lagos:x', name: 'x' }).ok,
    ).toBe(false);
    expect(
      tryRun(w, 'u_founder', { type: 'contact.save', personId: 'u_founder', name: 'x' }).ok,
    ).toBe(false);
    const londonShop = byKind(w, 'cafe', 'london') ?? open(w, 'london')[0]!;
    expect(
      tryRun(w, 'u_founder', { type: 'contact.save', personId: `biz:${londonShop.id}`, name: 'x' })
        .ok,
    ).toBe(false);

    // Remove.
    const id = w.players.u_founder!.contacts![0]!.id;
    w = run(w, 'u_founder', { type: 'contact.remove', contactId: id }).world;
    expect(w.players.u_founder!.contacts!.some((x) => x.id === id)).toBe(false);
    expect(tryRun(w, 'u_founder', { type: 'contact.remove', contactId: id }).ok).toBe(false);
    expect(personal(w, 'u_founder')).toBe(cash);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('keeps 300 contacts, dropping the coldest first', () => {
    let w = thaw(addFounder(makeWorld(35, ['lagos'])));
    const p = w.players.u_founder!;
    p.contacts = Array.from({ length: 300 }, (_, i) => ({
      id: `local:npc:lagos:${i}`,
      kind: 'local' as const,
      refId: `npc:lagos:${i}`,
      name: `Person ${i}`,
      warmth: i === 150 ? 0.01 : 0.5,
      month: w.markets.lagos!.month,
    }));
    w = run(w, 'u_founder', { type: 'contact.save', personId: 'npc:lagos:400', name: 'New' }).world;
    const list = w.players.u_founder!.contacts!;
    expect(list).toHaveLength(300);
    expect(list[0]!.refId).toBe('npc:lagos:400');
    expect(list.some((x) => x.refId === 'npc:lagos:150')).toBe(false);
  });
});

describe('saved worlds (Wave 6)', () => {
  it('a world from before Wave 6 settles, grows and shows its businesses', () => {
    let w = thaw(addFounder(makeWorld(37, ['lagos'])));
    // Pretend: no growth counter, no generated businesses, no new fields.
    const m = w.markets.lagos!;
    delete m.humansJoined;
    for (const b of Object.values(m.businesses!) as LocalBusiness[]) {
      if (b.seed !== -1) continue;
      w.accounts[m.ext.genesis]!.balance += w.accounts[b.account]!.balance;
      delete w.accounts[b.account];
      delete m.businesses![b.id];
    }
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 2);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(open(w).some((b) => b.seed === -1)).toBe(true);
    const view = playerView(w, 'u_founder')!.market.businesses;
    for (const b of view) expect(Array.isArray(b.people)).toBe(true);
  });
});

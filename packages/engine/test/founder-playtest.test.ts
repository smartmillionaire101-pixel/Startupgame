/**
 * Founder play-test fixes (round six): what a new founder sees about money,
 * the journey, sales, the recap and fundraising after setting a company up
 * the way the play-test did (feedback-note world, own money in, an office).
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { forwardRunway, monthlyCosts } from '../src/company.js';
import { keptPct, passWhyText } from '../src/founderguide.js';
import { journeyView } from '../src/journey.js';
import { recapView } from '../src/recap.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { salesWithTalk } from '../src/salestalk.js';
import { valueCompany } from '../src/valuation.js';
import { playerView } from '../src/views.js';
import type { SalesDeal, World } from '../src/types.js';
import { DAY, T0, addFounder, companyOf, makeWorld, run, settle } from './helpers.js';

const F = 'u_founder';
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;
const co = (w: World) => companyOf(w, F);
const pv = (w: World) => playerView(w, F)!.companies[0]!;

/** Quick start, found, register and put half the savings in as shares. */
function funded(seed = 81, on = true): World {
  let w = makeWorld(seed, ['lagos']);
  if (on) w = announce(w);
  w = run(w, F, {
    type: 'player.quickStart',
    username: 'adaeze',
    role: 'founder',
    market: 'lagos',
  }).world;
  w = run(w, F, {
    type: 'company.found',
    company: {
      name: 'Swift Parcel',
      industry: 'logistics',
      revenueModel: 'subscription',
      idea: 'Same-day delivery for local shops',
      incorporation: 'local',
    },
  }).world;
  if (!co(w).setup) return w;
  w = run(w, F, {
    type: 'company.setup',
    companyId: co(w).id,
    action: 'register',
    incorporation: 'local',
  }).world;
  const savings = w.accounts[w.players[F]!.accounts.local]!.balance;
  return run(w, F, {
    type: 'company.contribute',
    companyId: co(w).id,
    amount: Math.round(savings / 2),
    as: 'equity',
  }).world;
}

/** …then on to the office: co-working desks (or home). */
function opened(seed = 81, office: 'cowork' | 'home' = 'cowork'): World {
  let w = funded(seed);
  w = run(w, F, { type: 'company.setup', companyId: co(w).id, action: 'next' }).world;
  return run(w, F, {
    type: 'company.setup',
    companyId: co(w).id,
    action: 'office',
    officeId: office,
  }).world;
}

describe('#3 spending and how long the money lasts', () => {
  it('count the office rent from the day the lease is signed', () => {
    const w = opened();
    const c = pv(w);
    const costs = monthlyCosts(w, co(w));
    expect(c.nextMonth!.costs).toBe(costs);
    // Rent is in next month's bill, and so in spending and the burn.
    expect(c.spending).toBe(costs);
    expect(c.burn).toBe(costs);
    expect(c.founderFinance.netBurn).toBe(costs);
    expect(c.founderFinance.cashFlowPositive).toBe(false);
    expect(c.runwayMonths).toBeCloseTo(c.cash / costs, 1);
    expect(c.founderFinance.runwayMonths).toBeCloseTo(c.cash / costs, 0);
  });

  it('count a new hire with the rent, not instead of it', () => {
    let w = opened();
    const rentOnly = pv(w).spending;
    const cand = w.markets.lagos!.talent.find((t) => t.seniority === 'junior')!;
    w = run(w, F, {
      type: 'company.offer',
      companyId: co(w).id,
      candidateId: cand.id,
      salary: Math.round(cand.ask * 1.3),
      equityBps: 0,
    }).world;
    expect(co(w).staff.length).toBe(1);
    const c = pv(w);
    expect(c.spending).toBeGreaterThan(rentOnly + co(w).staff[0]!.salary - 1);
    expect(c.runwayMonths).toBeCloseTo(forwardRunway(w, co(w)), 1);
  });

  it('a company working from home with no revenue still has costs: not "Profitable"', () => {
    const w = opened(81, 'home');
    const c = pv(w);
    expect(c.monthlyRevenue).toBe(0);
    expect(c.spending).toBeGreaterThan(0);
    expect(c.runwayMonths).not.toBeNull();
  });
});

describe('#6 own money and the fundraising chapter', () => {
  it('own money in is a funding choice, not a pitch, and chapter 3 waits for chapter 1', () => {
    const w = funded();
    const j = journeyView(w, w.players[F]!)!;
    const ch3 = j.chapters[2]!;
    expect(ch3.id).toBe('fundraising');
    const done = Object.fromEntries(ch3.steps.map((s) => [s.id, s.done]));
    expect(done['fundraising.funding']).toBe(true);
    expect(done['fundraising.pitch']).toBe(false);
    // Still setting up: no runway to speak of yet.
    expect(done['fundraising.runway']).toBe(false);
    expect(ch3.status).toBe('upcoming');
    expect(j.current).toBe(1);
    expect(w.players[F]!.milestones['founder.chapter-3']).toBeUndefined();
    expect((w.inbox[F] ?? []).some((m) => m.text.startsWith('Chapter 3 complete'))).toBe(false);
  });

  it('runway counts the rent once the office is chosen', () => {
    const w = opened();
    const ch3 = journeyView(w, w.players[F]!)!.chapters[2]!;
    const runway = ch3.steps.find((s) => s.id === 'fundraising.runway')!;
    expect(runway.progress!.have).toBe(Math.min(6, Math.floor(forwardRunway(w, co(w)))));
  });
});

// ---------------------------------------------------------------- sales

const talk = (w: World, dealId: string, action: string, extra: Record<string, unknown> = {}) =>
  run(w, F, { type: 'sales.talk', dealId, action, ...extra } as never);

/** A seeded founder in a feedback-note world with one contacted lead. */
function contacted(seed: number): { w: World; id: string } {
  const w = announce(addFounder(makeWorld(seed, ['lagos'])));
  const r = run(w, F, { type: 'sales.prospect' });
  const id = r.result.leads[0].id as string;
  return { w: run(r.world, F, { type: 'sales.advance', dealId: id, action: 'contact' }).world, id };
}

const tune = (w: World, id: string, f: (d: SalesDeal) => void) =>
  produce(w, (x) => {
    f(companyOf(x, F).deals!.find((d) => d.id === id)!);
  });

/** A won conversation on a paid pilot then a year (their best terms: trust is low). */
function wonOnPilot() {
  for (let seed = 1; seed < 20; seed++) {
    const c0 = contacted(seed);
    let w = tune(c0.w, c0.id, (d) => {
      d.customer.trust = 0.45;
      d.customer.authority = 0.9;
      d.customer.urgency = 0.9;
      d.demoScore = 0.9;
    });
    w = talk(w, c0.id, 'start').world;
    w = talk(w, c0.id, 'lead', {
      option: co(w).deals!.find((d) => d.id === c0.id)!.customer.need,
    }).world;
    w = talk(w, c0.id, 'price', { option: 'mid', discountPct: 0 }).world;
    w = talk(w, c0.id, 'terms', { option: 'pilot' }).world;
    const r = talk(w, c0.id, 'ask');
    if (r.result.won) return { w: r.world, id: c0.id };
  }
  throw new Error('no win in 20 seeds');
}

describe('#5 a won customer who leaves', () => {
  it('a pilot then a year is a commitment: they stay through it', () => {
    const { w, id } = wonOnPilot();
    const month = w.markets.lagos!.month;
    const account = co(w).salesAccounts!.find((a) => a.dealId === id)!;
    expect(account.committedUntil).toBe(month + 12);
    // Even with a terrible product, nobody committed leaves before the year is up.
    let x = produce(w, (d) => {
      const c = companyOf(d, F);
      c.product.quality = 0;
      c.hibernation = { since: month };
    });
    x = settle(x, 'lagos', 6, T0);
    expect(co(x).salesAccounts!.some((a) => a.dealId === id)).toBe(true);
  });

  it('a month-to-month customer who leaves shows in Sales, the recap and the stage tracker', () => {
    const { w } = wonOnPilot();
    // Forty month-to-month customers on a poor product: some leave each month.
    let x = produce(w, (d) => {
      const c = companyOf(d, F);
      c.product.quality = 0.2;
      const m = d.markets.lagos!.month;
      for (let i = 0; i < 40; i++)
        c.salesAccounts!.push({
          dealId: `x${i}`,
          name: `Buyer ${i}`,
          segmentKey: c.salesAccounts![0]!.segmentKey,
          monthly: 100_000,
          since: m - 1,
        });
    });
    let left: NonNullable<ReturnType<typeof co>['salesChurn']> = [];
    for (let i = 0; i < 6 && !left.length; i++) {
      x = settle(x, 'lagos', 1, T0 + i * DAY);
      const month = x.markets.lagos!.month;
      left = (co(x).salesChurn ?? []).filter((l) => l.month === month);
    }
    expect(left.length).toBeGreaterThan(0);
    expect(left[0]!.reason).toBe('reliability');
    const month = left[0]!.month;
    // The inbox says why.
    expect(
      (x.inbox[F] ?? []).some(
        (n) => n.text.startsWith(`${left[0]!.name} stopped buying`) && n.text.includes('outages'),
      ),
    ).toBe(true);
    // The recap lists them and counts them as customers who left.
    const rc = recapView(x, F, month)!.companies[0]!;
    expect(rc.deals.churned.map((d) => d.name)).toEqual(left.map((l) => l.name));
    expect(rc.churned!).toBeGreaterThanOrEqual(left.length);
    // The stage tracker's "customers kept" counts them.
    expect(keptPct(co(x))).toBeLessThan(100);
  });

  it('the deal card of a churned customer says so', () => {
    const { w, id } = wonOnPilot();
    const x = produce(w, (d) => {
      const c = companyOf(d, F);
      c.salesAccounts![0]!.committedUntil = undefined;
      c.salesAccounts![0]!.since = d.markets.lagos!.month - 1;
      c.product.quality = 0;
      c.hibernation = { since: d.markets.lagos!.month };
    });
    let y = x;
    for (let i = 0; i < 24 && co(y).salesAccounts!.length; i++)
      y = settle(y, 'lagos', 1, T0 + i * DAY);
    expect(co(y).salesAccounts).toEqual([]);
    const card = salesWithTalk(y, co(y)).deals.find((d) => d.id === id)!;
    expect(card.stage).toBe('won');
    expect(card.churned?.reason).toBe('hibernation');
    expect(salesWithTalk(y, co(y)).stats.churned).toBe(1);
  });
});

describe('#10 and #27 the conversation’s numbers', () => {
  it('before discovery the live chance is labelled a guess and the result keeps it', () => {
    const { w: w0, id } = contacted(42);
    let w = talk(w0, id, 'start').world;
    w = talk(w, id, 'lead', { option: 'tour' }).world;
    w = talk(w, id, 'price', { option: 'mid', discountPct: 0 }).world;
    const terms = salesWithTalk(w, co(w)).deals.find((d) => d.id === id)!.talk!.termsOptions[0]!;
    w = talk(w, id, 'terms', { option: terms.id }).world;
    const live = salesWithTalk(w, co(w)).deals.find((d) => d.id === id)!.talk!;
    expect(live.chanceGuess).toBe(true);
    const r = talk(w, id, 'ask');
    const res = salesWithTalk(r.world, co(r.world)).deals.find((d) => d.id === id)!.talk!.result!;
    // What you saw is kept next to the real chance the deal was decided on.
    expect(res.guess).toBe(live.chance);
    expect(res.chance).toBe(r.result.chance);
  });

  it('a lead is worth what the conversation would ask, not the list price', () => {
    const { w, id } = contacted(42);
    const s = salesWithTalk(w, co(w));
    const deal = s.deals.find((d) => d.id === id)!;
    const mid = deal.talk!.priceOptions.find((o) => o.id === 'mid')!.amount;
    expect(deal.value).toBe(mid);
    expect(deal.valueGuess).toBe(true);
    // Once a price is named in the conversation, that's its value.
    let x = talk(w, id, 'start').world;
    x = talk(x, id, 'lead', { option: 'tour' }).world;
    x = talk(x, id, 'price', { option: 'top', discountPct: 10 }).world;
    const named = salesWithTalk(x, co(x)).deals.find((d) => d.id === id)!;
    expect(named.value).toBe(named.talk!.price!.monthly);
  });
});

describe('#9 and #32 fundraising wording', () => {
  it('an early valuation says how much of it is revenue', () => {
    const w = opened();
    const v = pv(w).valuation;
    expect(v.fromRevenue).toBeGreaterThanOrEqual(0);
    expect(v.fromRevenue).toBeLessThanOrEqual(1);
    // Pre-seed with no revenue: all team and market.
    expect(v.fromRevenue).toBe(0);
    const x = produce(w, (d) => {
      const h = companyOf(d, F).finance.history;
      h.push({ ...h[h.length - 1]!, month: 0, revenue: 8_100_000, net: -1 });
    });
    const withRevenue = valueCompany(x, co(x), 'pre-seed');
    expect(withRevenue.arr).toBe(8_100_000 * 12);
    // A tiny ARR is a small share of a pre-seed price.
    expect(withRevenue.fromRevenue).toBeLessThan(0.5);
  });

  it('a pass for falling revenue says it is falling', () => {
    expect(passWhyText({ id: 'growth', values: { growth: -41.5, need: 10 } }, 'NGN')).toMatch(
      /^Revenue has been falling 41\.5% a month; we look for growth of 10%/,
    );
    expect(passWhyText({ id: 'growth', values: { growth: 3, need: 10 } }, 'NGN')).toMatch(
      /^Revenue grows 3% a month/,
    );
  });
});

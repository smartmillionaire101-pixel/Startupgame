/**
 * Founder play-test fixes (round six): what a new founder sees about money,
 * the journey, sales, the recap and fundraising after setting a company up
 * the way the play-test did (feedback-note world, own money in, an office).
 */
import { describe, expect, it } from 'vitest';
import { forwardRunway, monthlyCosts } from '../src/company.js';
import { journeyView } from '../src/journey.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { companyOf, makeWorld, run } from './helpers.js';

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

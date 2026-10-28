/**
 * Round 7 sales and the team (GAMEPLAY_NOTE): leads that fit the industry,
 * one customer count, lost deals with their real reason, and hires that do
 * their job. Worlds without the note play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { SEGMENT_BUYERS } from '../src/data/buyers.js';
import { BUSINESS_KINDS } from '../src/data/businesses.js';
import { SEGMENT_TEMPLATES, type Industry } from '../src/data/industries.js';
import { businessesOf, specOf } from '../src/economy.js';
import { FEEDBACK_NOTE, GAMEPLAY_NOTE } from '../src/releases.js';
import type { Company, SalesDeal, World } from '../src/types.js';
import { playerView } from '../src/views.js';
import { customerFacts, payingCustomers } from '../src/traction.js';
import { founderGuide } from '../src/founderguide.js';
import { customersOf } from '../src/dealflow.js';
import { recapView } from '../src/recap.js';
import { totalCustomers } from '../src/helpers.js';
import { companyOf, makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Update.' }).world;

/** A founder in London with a company in `industry` (feedback note, and the gameplay note when `on`). */
export function founder(industry: Industry, on = true, seed = 7, idea = 'Telehealth for families') {
  let w = makeWorld(seed, ['london']);
  w = announce(w, FEEDBACK_NOTE);
  if (on) w = announce(w, GAMEPLAY_NOTE);
  return run(w, F, {
    type: 'player.create',
    handle: 'h_obi',
    name: 'Obi Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'london',
    company: {
      name: 'Obi and Sidi',
      industry,
      revenueModel: 'subscription',
      idea,
      incorporation: 'local',
    },
  }).world;
}

const co = (w: World): Company => companyOf(w, F);
const target = (w: World, segs: string[]) =>
  run(w, F, { type: 'company.strategy', companyId: co(w).id, targetSegments: segs }).world;

/** Prospect every round this month, over a few months, and return all the leads. */
function leads(w: World, months = 4): { w: World; deals: SalesDeal[] } {
  const seen: SalesDeal[] = [];
  for (let mo = 0; mo < months; mo++) {
    for (let i = 0; i < 3; i++) {
      const r = tryRun(w, F, { type: 'sales.prospect' });
      if (!r.ok) break;
      w = r.world;
    }
    seen.push(...(co(w).deals ?? []).filter((d) => !seen.some((x) => x.id === d.id)));
    // Clear the board so the next month has room.
    w = produce(w, (x) => {
      companyOf(x, F).deals = [];
    });
    w = settle(w, 'london', 1);
  }
  return { w, deals: seen };
}

const kindOf = (w: World, d: SalesDeal) => {
  const b = d.customer.businessId ? businessesOf(w.markets.london!)[d.customer.businessId] : null;
  return b ? specOf(b).kind : null;
};

describe('#10 leads fit the industry', () => {
  it('maps every segment to real kinds of business, each in its own industry', () => {
    const kinds = new Set(BUSINESS_KINDS.map((k) => k.kind));
    for (const s of SEGMENT_TEMPLATES) {
      expect(SEGMENT_BUYERS[s.key], s.key).toBeDefined();
      for (const k of SEGMENT_BUYERS[s.key]!) expect(kinds.has(k), `${s.key}: ${k}`).toBe(true);
    }
  });

  it('a healthtech company never gets a spa, a gym or a co-working space as a lead', () => {
    const w0 = target(founder('healthtech'), ['healthtech.clinics', 'healthtech.employers']);
    const { w, deals } = leads(w0);
    const local = deals.filter((d) => d.customer.businessId);
    expect(local.length).toBeGreaterThan(0);
    for (const d of local) {
      const kind = kindOf(w, d)!;
      expect([
        'spa',
        'co-working',
        'gym',
        'studio-gym',
        'climbing-gym',
        'football-pitch',
      ]).not.toContain(kind);
      // The lead buys as the segment its kind is.
      expect(SEGMENT_BUYERS[d.customer.segmentKey]).toContain(kind);
    }
    expect(deals.every((d) => d.customer.segmentKey.startsWith('healthtech.'))).toBe(true);
  });

  it('a hospital or a clinic is a clinics lead, never a family', () => {
    const { w, deals } = leads(founder('healthtech'));
    for (const d of deals.filter((x) => x.customer.businessId)) {
      expect(['clinic', 'dentist', 'pharmacy', 'employer-hospital']).toContain(kindOf(w, d));
      expect(d.customer.segmentKey).toBe('healthtech.clinics');
    }
    // Families are households, named after the contact.
    for (const d of deals.filter((x) => x.customer.segmentKey === 'healthtech.families'))
      expect(d.customer.businessId).toBeUndefined();
  });

  it('can’t walk into a spa to sell healthtech, and the spa lists no healthtech spending', () => {
    const w = founder('healthtech');
    const spa = Object.values(businessesOf(w.markets.london!)).find((b) => b.kind === 'spa')!;
    expect(spa).toBeDefined();
    const r = tryRun(w, F, { type: 'sales.talk', businessId: spa.id, action: 'start' } as never);
    expect(!r.ok && r.error.message).toMatch(/don’t buy health/i);
    const view = playerView(w, F)!.market.businesses.find((b) => b.id === spa.id)!;
    expect(view.buys.map((x) => x.sector)).not.toContain('healthtech');
    expect(view.you.canPitch).toBe(false);
  });

  it('before the note, leads come as they did (any business that spends on the industry)', () => {
    const on = leads(founder('healthtech', true)).deals.map((d) => d.customer.name);
    const old = leads(founder('healthtech', false));
    expect(old.deals.map((d) => d.customer.name)).not.toEqual(on);
    // The bug the note fixes: gyms, spas and the like came as health leads.
    const kinds = old.deals.map((d) => kindOf(old.w, d)).filter(Boolean);
    expect(
      kinds.some((k) => !['clinic', 'dentist', 'pharmacy', 'employer-hospital'].includes(k!)),
    ).toBe(true);
  });
});

/** Talk a deal through with the best calls; the customer tuned to say yes. */
export function talkWin(w: World, id: string, tune = true) {
  if (co(w).deals!.find((d) => d.id === id)!.stage === 'lead')
    w = run(w, F, { type: 'sales.advance', dealId: id, action: 'contact' }).world;
  if (tune)
    w = produce(w, (x) => {
      const d = companyOf(x, F).deals!.find((y) => y.id === id)!;
      Object.assign(d.customer, { trust: 1, authority: 1, urgency: 1, current: 'nothing' });
    });
  const talk = (action: string, extra: Record<string, unknown> = {}) =>
    run(w, F, { type: 'sales.talk', dealId: id, action, ...extra } as never);
  w = talk('start').world;
  const d = co(w).deals!.find((y) => y.id === id)!;
  w = talk('lead', { option: d.customer.need }).world;
  w = talk('price', { option: 'mid', discountPct: 0 }).world;
  const best = d.talk!.termsOptions!.map((o) => ({
    o,
    p: talk('terms', { option: o }).result.chance,
  }));
  best.sort((a, b) => b.p - a.p);
  w = talk('terms', { option: best[0]!.o }).world;
  return talk('ask');
}

/** Win one deal with a local business, through the sales conversation. */
function winLocal(w: World): { w: World; deal: SalesDeal } {
  for (let tries = 0; tries < 8; tries++) {
    const r = tryRun(w, F, { type: 'sales.prospect' });
    if (r.ok) w = r.world;
    for (const d of (co(w).deals ?? []).filter(
      (x) => x.stage === 'lead' && x.customer.businessId,
    )) {
      const out = talkWin(w, d.id);
      w = out.world;
      if (out.result.won) return { w, deal: co(w).deals!.find((x) => x.id === d.id)! };
    }
    w = settle(w, 'london', 1);
  }
  throw new Error('never won a local deal');
}

describe('#14 one customer count everywhere', () => {
  it('a won sales deal is a paying customer at once, everywhere', () => {
    const w0 = target(founder('healthtech'), ['healthtech.clinics']);
    const before = customerFacts(w0, co(w0)).total;
    const { w, deal } = winLocal(w0);
    const c = co(w);
    const n = before + 1;
    expect(customerFacts(w, c).total).toBe(n);
    expect(payingCustomers(w, c)).toBe(n);
    // The stage tracker, an investor's pitch numbers and the media all say the same.
    const tasks = founderGuide(w, c).stages.flatMap((s) => s.tasks);
    expect(tasks.find((t) => t.id === 'first.customers')!.have).toBe(n);
    expect(customersOf(w, c)).toBe(n);
    // The Customers tab: the business, and the segment's paying count.
    const pv = playerView(w, F)!.companies[0]!;
    expect(pv.businessCustomers.map((b) => b.businessId)).toContain(deal.customer.businessId);
    const seg = pv.segments.find((s) => s.key === deal.customer.segmentKey)!;
    expect(seg.accounts).toBe(1);
    // The month's books and the recap count it, and the recap says it was won this month.
    const s = settle(w, 'london', 1);
    const pnl = co(s).finance.history.at(-1)!;
    expect(pnl.customers).toBe(payingCustomers(s, co(s)));
    const rc = recapView(s, F, pnl.month)!.companies.find((x) => x.id === c.id)!;
    expect(rc.customers).toBe(pnl.customers);
    expect(rc.won).toBeGreaterThanOrEqual(1);
    expect(rc.deals.won.map((d) => d.name)).toContain(deal.customer.name);
  });

  it('before the note, the funnel-only counts stay as they were', () => {
    const w = founder('healthtech', false);
    const c = co(w);
    expect(payingCustomers(w, c)).toBe(totalCustomers(c));
    expect(customersOf(w, c)).toBe(Object.values(c.segments).reduce((a, s) => a + s.paying, 0));
  });
});

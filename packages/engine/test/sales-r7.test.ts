/**
 * Round 7 sales and the team (GAMEPLAY_NOTE): leads that fit the industry,
 * one customer count, lost deals with their real reason, and hires that do
 * their job. Worlds without the note play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { SEGMENT_BUYERS } from '../src/data/buyers.js';
import { BUSINESS_KINDS } from '../src/data/businesses.js';
import { SEGMENT_TEMPLATES } from '../src/data/industries.js';
import { businessesOf, specOf } from '../src/economy.js';
import type { Company, SalesDeal, World } from '../src/types.js';
import { playerView } from '../src/views.js';
import { closeDeal, holdingBack } from '../src/sales.js';
import { salesWithTalk } from '../src/salestalk.js';
import { customerFacts, payingCustomers } from '../src/traction.js';
import { founderGuide } from '../src/founderguide.js';
import { customersOf } from '../src/dealflow.js';
import { recapView } from '../src/recap.js';
import { totalCustomers } from '../src/helpers.js';
import { companyOf, run, settle, tryRun } from './helpers.js';
import { F, founder, talkWin } from './r7-helpers.js';

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

/** One open deal in a strong company, the customer shaped by `f`, at `stage`. */
function shaped(on: boolean, f: (d: SalesDeal) => void, seed = 7) {
  let w = target(founder('healthtech', on, seed), ['healthtech.clinics']);
  const r = run(w, F, { type: 'sales.prospect' });
  w = r.world;
  const id = r.result.leads[0].id as string;
  w = run(w, F, { type: 'sales.advance', dealId: id, action: 'contact' }).world;
  w = produce(w, (x) => {
    const c = companyOf(x, F);
    Object.assign(c.product, { fit: 1, quality: 1, techDebt: 0 });
    c.product.discovery['healthtech.clinics'] = 1;
    c.stars.value = 5;
    const d = c.deals!.find((y) => y.id === id)!;
    d.demoScore = 1;
    d.revealed = true;
    Object.assign(d.customer, { trust: 1, authority: 1, urgency: 1, current: 'nothing' });
    d.price = Math.round((d.customer.budgetMin + d.customer.budgetMax) / 2);
    f(d);
  });
  return { w, id };
}

/** Ask for the deal with a given chance, rolling again (another label) until it is lost. */
function loseAt(w: World, id: string, chance: number) {
  for (let k = 0; k < 40; k++) {
    let won = false;
    const x = produce(w, (y) => {
      const c = companyOf(y, F);
      const d = c.deals!.find((z) => z.id === id)!;
      const out = closeDeal(y, y.players[F]!, c, d, y.markets.london!.month, {
        chance,
        label: `t${k}`,
      });
      won = !!out.won;
    });
    if (!won) return x;
  }
  throw new Error('never lost');
}

describe('#11 a lost deal names the one real reason', () => {
  it('says “can’t sign alone” when that is what held it back (it used to say “no budget”)', () => {
    const { w, id } = shaped(true, (d) => {
      d.customer.authority = 0;
    });
    const held = holdingBack(
      w,
      co(w),
      co(w).deals!.find((d) => d.id === id)!,
    );
    expect(held[0]!.reason).toBe('authority');
    const lost = loseAt(w, id, 0.05);
    const d = co(lost).deals!.find((x) => x.id === id)!;
    expect(d.lossReason).toBe('authority');
    // Before the note, a weak signer read as no budget.
    const old = shaped(false, (x) => {
      x.customer.authority = 0;
    });
    const od = co(loseAt(old.w, old.id, 0.05)).deals!.find((x) => x.id === old.id)!;
    expect(od.lossReason).toBe('no_budget');
  });

  it('blames product fit for a weak product, whatever the talk', () => {
    const { w, id } = shaped(true, (d) => {
      d.demoScore = 0.2;
    });
    const weak = produce(w, (x) => {
      companyOf(x, F).product.fit = 0.2;
    });
    expect(
      holdingBack(
        weak,
        co(weak),
        co(weak).deals!.find((d) => d.id === id)!,
      )[0]!.reason,
    ).toBe('missing_feature');
    const d = co(loseAt(weak, id, 0.4)).deals!.find((x) => x.id === id)!;
    expect(d.lossReason).toBe('missing_feature');
  });

  it('calls it luck only when the chance was good and nothing big held it back', () => {
    const { w, id } = shaped(true, () => {});
    const lost = loseAt(w, id, 0.85);
    const v = salesWithTalk(lost, co(lost)).deals.find((d) => d.id === id)!;
    expect(v.lossReason).toBe('luck');
    expect(v.loss!.luck).toBe(true);
    expect(v.loss!.words.en).toMatch(/close/i);
    expect(v.canRecover).toBe(true);
  });

  it('budget and timing: come back in N months, the lead stays and opens again then', () => {
    const { w, id } = shaped(true, (d) => {
      d.customer.urgency = 0;
      d.customer.trust = 1;
    });
    const lost = loseAt(w, id, 0.3);
    const d = co(lost).deals!.find((x) => x.id === id)!;
    expect(d.lossReason).toBe('timing');
    const n = d.revisit! - lost.markets.london!.month;
    expect(n).toBeGreaterThanOrEqual(1);
    const v = salesWithTalk(lost, co(lost)).deals.find((x) => x.id === id)!;
    expect(v.loss!.revisitIn).toBe(n);
    expect(v.loss!.words.en).toMatch(/month/);
    expect(v.canRecover).toBe(false);
    const r = tryRun(lost, F, { type: 'sales.advance', dealId: id, action: 'recover' });
    expect(!r.ok && r.error.code).toBe('sales.recover.later');
    // It stays on the board, and opens again at the month they named.
    let x = lost;
    for (let i = 0; i < n; i++) x = settle(x, 'london', 1);
    const back = co(x).deals!.find((y) => y.id === id)!;
    expect(back.stage).toBe('contacted');
    expect(back.revisit).toBeUndefined();
    expect(back.customer.urgency).toBeGreaterThan(0);
    expect((x.inbox[F] ?? []).some((m) => m.text.includes('ready to talk again'))).toBe(true);
  });

  it('shows what is holding the chance down before you ask, and the best chance today', () => {
    const { w, id } = shaped(true, (d) => {
      d.customer.authority = 0.1;
      d.customer.trust = 0.2;
    });
    let x = run(w, F, { type: 'sales.talk', dealId: id, action: 'start' } as never).world;
    const need = co(x).deals!.find((d) => d.id === id)!.customer.need;
    x = run(x, F, { type: 'sales.talk', dealId: id, action: 'lead', option: need } as never).world;
    const t = salesWithTalk(x, co(x)).deals.find((d) => d.id === id)!.talk!;
    expect(t.holding).not.toBeNull();
    expect(t.holding!.talk).toBe(100);
    const reasons = t.holding!.items.map((i) => i.reason);
    expect(reasons).toContain('trust');
    expect(reasons).toContain('authority');
    expect(t.holding!.best).toBeGreaterThanOrEqual(t.chance! - 0.001);
    // Before the note there's no such panel.
    const old = shaped(false, () => {});
    const y = run(old.w, F, { type: 'sales.talk', dealId: old.id, action: 'start' } as never).world;
    expect(salesWithTalk(y, co(y)).deals.find((d) => d.id === old.id)!.talk!.holding).toBeNull();
  });
});

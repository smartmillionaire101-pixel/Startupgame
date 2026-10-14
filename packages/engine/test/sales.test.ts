import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { SALES, dealPrice, salesView, winChance } from '../src/sales.js';
import { journeyView } from '../src/journey.js';
import { totalCustomers } from '../src/helpers.js';
import type { SalesDeal, World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const edit = (w: World, f: (d: World) => void) => produce(w, f);
const deals = (w: World) => companyOf(w, F).deals ?? [];
const deal = (w: World, id: string) => deals(w).find((d) => d.id === id)!;
const adv = (w: World, dealId: string, action: string, extra: Record<string, number> = {}) =>
  run(w, F, { type: 'sales.advance', dealId, action, ...extra } as never);

/** A founder with a pipeline: one prospecting round. */
function withLeads(): { w: World; id: string } {
  const w0 = addFounder(makeWorld());
  const r = run(w0, F, { type: 'sales.prospect' });
  return { w: r.world, id: r.result.leads[0].id as string };
}

/** Walk a lead to the proposal stage. */
function toProposal(w: World, id: string, price?: number): World {
  w = adv(w, id, 'contact').world;
  w = adv(w, id, 'discover').world;
  w = adv(w, id, 'demo').world;
  return adv(w, id, 'propose', price !== undefined ? { price } : {}).world;
}

/** Make the customer a pushover (or not), to test outcomes rather than dice. */
function tune(w: World, id: string, f: (d: SalesDeal) => void): World {
  return edit(w, (d) => {
    const x = companyOf(d, F).deals!.find((y) => y.id === id)!;
    f(x);
  });
}

describe('sales pipeline: prospecting', () => {
  it('finds 1–3 leads with hidden attributes, ids from a per-company counter', () => {
    const w0 = addFounder(makeWorld());
    const worldCounter = w0.nextId;
    const r = run(w0, F, { type: 'sales.prospect' });
    const list = deals(r.world);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(list.every((d) => d.stage === 'lead' && !d.revealed)).toBe(true);
    const c = companyOf(r.world, F);
    expect(list[0]!.id).toBe(`${c.id}-d1`);
    expect(r.world.nextId).toBe(worldCounter);
    // Hidden until discovery.
    const v = salesView(r.world, c);
    expect(v.deals[0]!.known.budgetMax).toBeNull();
    expect(v.deals[0]!.known.need).toBeNull();
    expect(v.deals[0]!.estimate).toBe(true);
    expect(v.deals[0]!.next?.action).toBe('contact');
  });

  it('is deterministic for the same world', () => {
    const a = run(addFounder(makeWorld()), F, { type: 'sales.prospect' }).world;
    const b = run(addFounder(makeWorld()), F, { type: 'sales.prospect' }).world;
    expect(deals(a)).toEqual(deals(b));
  });

  it('is limited per month, and resets next month', () => {
    let w = addFounder(makeWorld());
    for (let i = 0; i < SALES.prospectsPerMonth; i++) {
      const r = tryRun(w, F, { type: 'sales.prospect' });
      if (!r.ok) {
        expect(r.error.code).toBe('sales.prospect.full');
        return;
      }
      w = r.world;
    }
    const r = tryRun(w, F, { type: 'sales.prospect' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['sales.prospect.limit', 'sales.prospect.full']).toContain(r.error.code);
    w = settle(w, 'lagos', 1);
    // Next month's round is allowed again (unless the board is full).
    const c = companyOf(w, F);
    expect(salesView(w, c).prospect.used).toBe(0);
  });
});

describe('sales pipeline: stages', () => {
  it('validates stage transitions', () => {
    const { w, id } = withLeads();
    for (const action of ['discover', 'demo', 'propose', 'negotiate', 'close', 'recover']) {
      const r = tryRun(w, F, { type: 'sales.advance', dealId: id, action } as never);
      expect(r.ok, action).toBe(false);
      if (!r.ok) expect(r.error.code).toMatch(/^sales\.stage/);
    }
    const w1 = adv(w, id, 'contact').world;
    expect(deal(w1, id).stage).toBe('contacted');
    // Can't contact twice.
    expect(tryRun(w1, F, { type: 'sales.advance', dealId: id, action: 'contact' }).ok).toBe(false);
  });

  it('discovery reveals the hidden attributes and costs time and money', () => {
    const { w, id } = withLeads();
    const w1 = adv(w, id, 'contact').world;
    const c0 = companyOf(w1, F);
    const cash0 = w1.accounts[c0.account]!.balance;
    const hours0 = w1.players[F]!.hours.used;
    const r = adv(w1, id, 'discover');
    const c = companyOf(r.world, F);
    expect(r.result.revealed).toBe(true);
    expect(r.world.accounts[c.account]!.balance).toBe(cash0 - r.result.cost);
    expect(r.result.cost).toBeGreaterThan(0);
    expect(r.world.players[F]!.hours.used).toBe(hours0 + SALES.hours.discover);
    const v = salesView(r.world, c).deals.find((d) => d.id === id)!;
    expect(v.known.budgetMax).toBe(deal(r.world, id).customer.budgetMax);
    expect(v.known.need).not.toBeNull();
    expect(v.known.trust).not.toBeNull();
    expect(v.estimate).toBe(false);
    // Talking to customers counts as discovery for the journey.
    const seg = deal(r.world, id).customer.segmentKey;
    expect(c.product.discovery[seg]).toBeGreaterThan(c0.product.discovery[seg] ?? 0);
  });

  it('a demo scores the product and moves to demo', () => {
    const { w, id } = withLeads();
    const w1 = adv(adv(w, id, 'contact').world, id, 'discover').world;
    const r = adv(w1, id, 'demo');
    expect(deal(r.world, id).stage).toBe('demo');
    expect(r.result.demoScore).toBeGreaterThanOrEqual(0);
    expect(r.result.demoScore).toBeLessThanOrEqual(1);
  });

  it('price and discount move the win chance within bounds', () => {
    const { w, id } = withLeads();
    const w1 = toProposal(w, id);
    const c = companyOf(w1, F);
    const d = deal(w1, id);
    const mid = (d.customer.budgetMin + d.customer.budgetMax) / 2;
    const cheap = winChance(w1, c, d, { price: Math.round(mid * 0.5) });
    const fair = winChance(w1, c, d, { price: Math.round(mid) });
    const steep = winChance(w1, c, d, { price: Math.round(mid * 3) });
    expect(cheap).toBeGreaterThan(fair);
    expect(fair).toBeGreaterThan(steep);
    for (const p of [cheap, fair, steep]) {
      expect(p).toBeGreaterThanOrEqual(SALES.chance[0]);
      expect(p).toBeLessThanOrEqual(SALES.chance[1]);
    }
    // A discount trades margin for chance.
    const before = winChance(w1, c, d);
    const r = adv(w1, id, 'negotiate', { discountPct: 25 });
    const d2 = deal(r.world, id);
    expect(d2.stage).toBe('negotiation');
    expect(dealPrice(companyOf(r.world, F), d2)).toBeLessThan(dealPrice(c, d));
    expect(r.result.probability).toBeGreaterThan(before);
    // Bounds on the discount and on rounds.
    expect(
      tryRun(r.world, F, {
        type: 'sales.advance',
        dealId: id,
        action: 'negotiate',
        discountPct: 60,
      }).ok,
    ).toBe(false);
  });
});

describe('sales pipeline: closing', () => {
  it('a won deal becomes a paying customer: milestone, revenue and money conserved', () => {
    const { w, id } = withLeads();
    let w1 = toProposal(w, id);
    // A willing buyer with a cheap price: the chance is capped at 95%; the dice are fixed per deal.
    w1 = tune(w1, id, (d) => {
      d.customer.trust = 1;
      d.customer.authority = 1;
      d.customer.urgency = 1;
      d.customer.current = 'nothing';
      d.price = Math.max(1, Math.round(d.customer.budgetMin * 0.3));
    });
    // Drop the starter customer so the milestone and the count come from this deal.
    w1 = edit(w1, (d) => {
      const c = companyOf(d, F);
      for (const s of Object.values(c.segments)) s.paying = 0;
      delete d.players[F]!.milestones['founder.first-customer'];
    });
    const total = moneyByCurrency(w1);
    const r = tryRun(w1, F, { type: 'sales.advance', dealId: id, action: 'close' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const res = r.result as { won: boolean; monthly: number };
    expect(res.won).toBe(true);
    const c = companyOf(r.world, F);
    expect(deal(r.world, id).stage).toBe('won');
    expect(c.salesAccounts).toHaveLength(1);
    expect(totalCustomers(c)).toBe(1);
    expect(r.world.players[F]!.milestones['founder.first-customer']).toBeDefined();
    const j = journeyView(r.world, r.world.players[F]!)!;
    const step = j.chapters[0]!.steps.find((s) => s.id === 'hustle.first-customer')!;
    expect(step.done).toBe(true);

    // Billing: an invoice on B2B terms, collected within three months as revenue.
    let after = settle(r.world, 'lagos', 1);
    const owed = companyOf(after, F).finance.receivables.reduce((a, x) => a + x.amount, 0);
    expect(owed).toBeGreaterThan(0);
    after = settle(after, 'lagos', 3);
    const hist = companyOf(after, F).finance.history.slice(-4);
    expect(hist.reduce((a, h) => a + h.revenue, 0)).toBeGreaterThan(0);
    // Money is conserved and nothing is overdrawn.
    expect(moneyByCurrency(after)).toEqual(total);
    expect(negativeInternalAccounts(after)).toHaveLength(0);
  });

  it('closing is bounded randomness with an explicit loss reason and one recovery', () => {
    // Many leads, each closed at a steep price: some lose, each with a reason.
    let w = addFounder(makeWorld(7));
    let lostId: string | null = null;
    for (let round = 0; round < 3 && !lostId; round++) {
      const r = tryRun(w, F, { type: 'sales.prospect' });
      if (!r.ok) break;
      w = r.world;
      for (const d of deals(w).filter((x) => x.stage === 'lead')) {
        const steep = Math.round(d.customer.budgetMax * 2);
        w = toProposal(w, d.id, steep);
        const c = run(w, F, { type: 'sales.advance', dealId: d.id, action: 'close' });
        w = c.world;
        if (!c.result.won) {
          expect([
            'price',
            'missing_feature',
            'timing',
            'trust',
            'competitor',
            'no_budget',
          ]).toContain(c.result.lossReason);
          expect(c.result.canRecover).toBe(true);
          lostId = d.id;
          break;
        }
      }
    }
    expect(lostId).not.toBeNull();
    const id = lostId!;
    const r = adv(w, id, 'recover');
    expect(['negotiation', 'discovery']).toContain(deal(r.world, id).stage);
    expect(deal(r.world, id).recovered).toBe(true);
    // Lose again: no second recovery.
    let w2 = r.world;
    if (deal(w2, id).stage === 'discovery') {
      w2 = adv(w2, id, 'demo').world;
      w2 = adv(w2, id, 'propose', { price: deal(w2, id).customer.budgetMax * 3 }).world;
    }
    const again = adv(w2, id, 'close');
    if (!again.result.won) {
      expect(again.result.canRecover).toBe(false);
      expect(
        tryRun(again.world, F, { type: 'sales.advance', dealId: id, action: 'recover' }).ok,
      ).toBe(false);
    }
  });

  it('deals expire after their deadline at settlement; drop removes a deal', () => {
    const { w, id } = withLeads();
    const months = deal(w, id).deadline - w.markets.lagos!.month + 1;
    const after = settle(w, 'lagos', months);
    const d = deal(after, id);
    expect(d.stage).toBe('lost');
    expect(d.lossReason).toBe('timing');
    expect(d.expired).toBe(true);
    expect(tryRun(after, F, { type: 'sales.advance', dealId: id, action: 'recover' }).ok).toBe(
      false,
    );
    const other = deals(w).find((x) => x.id !== id) ?? deal(w, id);
    const dropped = run(w, F, { type: 'sales.drop', dealId: other.id }).world;
    expect(deals(dropped).some((x) => x.id === other.id)).toBe(false);
  });

  it('old worlds without a pipeline settle exactly as before', () => {
    const a = settle(addFounder(makeWorld()), 'lagos', 2);
    const c = companyOf(a, F);
    expect(c.deals).toBeUndefined();
    expect(c.salesAccounts).toBeUndefined();
  });
});

describe('sales pipeline and business pitches never double up', () => {
  it('business.pitch refuses a business you already won in the pipeline', () => {
    let w = addFounder(makeWorld());
    let id: string | undefined;
    for (let i = 0; i < SALES.prospectsPerMonth && !id; i++) {
      w = run(w, F, { type: 'sales.prospect' }).world;
      id = deals(w).find((d) => d.customer.businessId)?.id;
    }
    expect(id).toBeDefined();
    w = toProposal(w, id!);
    w = tune(w, id!, (d) => {
      d.customer.trust = 1;
      d.customer.authority = 1;
      d.customer.urgency = 1;
      d.customer.current = 'nothing';
      d.price = 1;
    });
    const r = run(w, F, { type: 'sales.advance', dealId: id!, action: 'close' });
    expect(r.result.won).toBe(true);
    const c = companyOf(r.world, F);
    const businessId = deal(r.world, id!).customer.businessId!;
    expect(c.salesAccounts![0]!.businessId).toBe(businessId);
    const pitch = tryRun(r.world, F, { type: 'business.pitch', companyId: c.id, businessId });
    expect(pitch.ok).toBe(false);
    if (!pitch.ok) {
      expect(pitch.error.code).toBe('business.pitch');
      expect(pitch.error.message).toBe('They already buy from you through a deal you signed.');
    }
  });

  it('sales.prospect skips businesses that are customers by pitch or already in a deal', () => {
    let w = addFounder(makeWorld());
    w = run(w, F, { type: 'sales.prospect' }).world;
    const first = deals(w)
      .map((d) => d.customer.businessId)
      .filter(Boolean) as string[];
    // Every other business that buys this kind of product becomes a customer by pitch
    // (business.pitch records it in the business's suppliers).
    const pitched = new Set<string>();
    w = edit(w, (d) => {
      const c = companyOf(d, F);
      const m = d.markets[c.market]!;
      for (const b of Object.values(m.businesses ?? {})) {
        if (first.includes(b.id) || b.closedMonth !== undefined) continue;
        b.suppliers = b.suppliers.filter((s) => s.sector !== c.industry);
        b.suppliers.push({ companyId: c.id, sector: c.industry, monthlyMinor: 1, since: 0 });
        pitched.add(b.id);
      }
    });
    for (let i = 1; i < SALES.prospectsPerMonth; i++) {
      const r = tryRun(w, F, { type: 'sales.prospect' });
      if (!r.ok) break;
      w = r.world;
    }
    const ids = deals(w)
      .map((d) => d.customer.businessId)
      .filter(Boolean) as string[];
    // No business twice (open deals are taken), none that already buys by pitch.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((b) => pitched.has(b))).toEqual([]);
    expect(deals(w).length).toBeGreaterThan(first.length);
  });
});

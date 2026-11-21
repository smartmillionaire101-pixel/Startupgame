/**
 * What a customer needs the product to do (DEAL_NEEDS_NOTE, round 4 player
 * feedback: "Needs: a product that fits how they work" is too vague; "it
 * will be good to know what they need my product to do").
 *
 * A lead who buys on fit names one or two real roadmap features (seeded per
 * lead), discovery reveals them with what you have shipped, a loss on
 * product fit names what is missing, and shipping it lifts the chance, so
 * "Try again" and a new demo can win the deal back. Worlds without the note
 * play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { featuresFor } from '../src/data/roadmap.js';
import { DEAL_NEEDS_NOTE, dealNeedsOn } from '../src/releases.js';
import { closeDeal, holdingBack, winChance } from '../src/sales.js';
import { salesView } from '../src/sales.js';
import type { Company, SalesDeal, World } from '../src/types.js';
import { companyOf, run, settle, tryRun } from './helpers.js';
import { F, founder } from './r7-helpers.js';

const co = (w: World): Company => companyOf(w, F);
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: DEAL_NEEDS_NOTE, text: 'Update.' }).world;
const world = (on: boolean, industry: 'agritech' | 'fintech' | 'saas' = 'agritech') => {
  const w = founder(industry);
  return on ? announce(w) : w;
};

/** Prospect every round for a few months; every lead seen. */
function leads(w: World, months = 3): { w: World; deals: SalesDeal[] } {
  const seen: SalesDeal[] = [];
  for (let mo = 0; mo < months; mo++) {
    for (let i = 0; i < 3; i++) {
      const r = tryRun(w, F, { type: 'sales.prospect' });
      if (!r.ok) break;
      w = r.world;
    }
    seen.push(...(co(w).deals ?? []).filter((d) => !seen.some((x) => x.id === d.id)));
    w = produce(w, (x) => {
      companyOf(x, F).deals = [];
    });
    w = settle(w, 'london', 1);
  }
  return { w, deals: seen };
}

/** A fit-buying lead on the board who needs `wants`, tuned so only product fit holds it back. */
function fitDeal(w: World, wants: string[]): { w: World; id: string } {
  w = run(w, F, { type: 'sales.prospect' }).world;
  const id = co(w).deals![0]!.id;
  w = produce(w, (x) => {
    const c = companyOf(x, F);
    c.deals = c.deals!.filter((d) => d.id === id);
    const d = c.deals[0]!;
    Object.assign(d.customer, {
      need: 'fit',
      wants,
      trust: 1,
      authority: 1,
      urgency: 1,
      current: 'nothing',
    });
    d.customer.budgetMin = Math.round(c.price * 0.9);
    d.customer.budgetMax = Math.round(c.price * 1.6);
    d.revealed = true;
    d.stage = 'demo';
    d.demoScore = 0.5;
  });
  return { w, id };
}

/** Ship a feature (as a release leaves it). */
const ship = (w: World, featureId: string) =>
  produce(w, (x) => {
    const r = (companyOf(x, F).roadmap ??= { projects: [], feedback: [], defects: 0, nextId: 1 });
    r.projects.push({
      id: `rp${r.nextId++}`,
      featureId,
      status: 'released',
      progress: 99,
      addedMonth: 0,
      releasedMonth: 0,
    });
  });

const deal = (w: World, id: string) => co(w).deals!.find((d) => d.id === id)!;
const card = (w: World, id: string) => salesView(w, co(w)).deals.find((d) => d.id === id)!;

describe('a lead who buys on fit names what the product must do (deal-needs note)', () => {
  it('is off without the note, and leads come exactly as before but for the named needs', () => {
    const old = leads(world(false)).deals;
    const now = leads(world(true)).deals;
    expect(dealNeedsOn(world(false))).toBe(false);
    expect(dealNeedsOn(world(true))).toBe(true);
    expect(old.some((d) => d.customer.wants)).toBe(false);
    // Their own dice: names, budgets, needs and trust are what they were.
    const strip = (d: SalesDeal) => {
      const { wants, ...rest } = d.customer;
      void wants;
      return { ...d, customer: rest };
    };
    expect(now.map(strip)).toEqual(old);
  });

  it('gives every fit-buying lead one or two real features of its industry, and nobody else any', () => {
    const { deals } = leads(world(true));
    const ids = new Set(featuresFor('agritech').map((f) => f.id));
    const fit = deals.filter((d) => d.customer.need === 'fit');
    expect(fit.length).toBeGreaterThan(0);
    for (const d of fit) {
      const wants = d.customer.wants!;
      expect(wants.length === 1 || wants.length === 2, d.customer.name).toBe(true);
      expect(new Set(wants).size).toBe(wants.length);
      for (const id of wants) expect(ids.has(id), id).toBe(true);
      // Never housekeeping: nobody needs a bug bash.
      expect(wants).not.toContain('bug-bash');
      expect(wants).not.toContain('performance');
    }
    for (const d of deals.filter((x) => x.customer.need !== 'fit'))
      expect(d.customer.wants).toBeUndefined();
    // Seeded: the same world deals the same needs.
    expect(leads(world(true)).deals.map((d) => d.customer.wants)).toEqual(
      deals.map((d) => d.customer.wants),
    );
  });

  it('shows the needs, by name and with what you have, only after discovery', () => {
    const made = fitDeal(world(true), ['offline-mode', 'sms-alerts']);
    const id = made.id;
    let w = made.w;
    w = produce(w, (x) => {
      companyOf(x, F).deals![0]!.revealed = false;
    });
    expect(card(w, id).known.wants).toBeNull();
    w = produce(w, (x) => {
      companyOf(x, F).deals![0]!.revealed = true;
    });
    w = ship(w, 'sms-alerts');
    expect(card(w, id).known.wants).toEqual([
      { id: 'offline-mode', name: 'Offline mode', have: false },
      { id: 'sms-alerts', name: 'SMS alerts', have: true },
    ]);
  });

  it('holds the chance down until the feature ships; building it lifts the chance', () => {
    const { w, id } = fitDeal(world(true), ['offline-mode']);
    const before = winChance(w, co(w), deal(w, id), { known: true });
    expect(holdingBack(w, co(w), deal(w, id), { known: true })[0]!.reason).toBe('missing_feature');
    const built = ship(w, 'offline-mode');
    const after = winChance(built, co(built), deal(built, id), { known: true });
    expect(after - before).toBeGreaterThan(0.12);
    const fitCost = (x: World) =>
      holdingBack(x, co(x), deal(x, id), { known: true }).find(
        (h) => h.reason === 'missing_feature',
      )?.cost ?? 0;
    expect(fitCost(built)).toBeLessThan(fitCost(w) / 2);
  });

  it('a loss on product fit names what is missing; build it and "Try again" stands a better chance', () => {
    const made = fitDeal(world(true), ['offline-mode', 'sms-alerts']);
    const id = made.id;
    let w = made.w;
    w = ship(w, 'sms-alerts');
    // Ask, and lose (a chance of nothing): the real reason is product fit.
    w = produce(w, (x) => {
      const c = companyOf(x, F);
      const d = c.deals!.find((y) => y.id === id)!;
      closeDeal(x, x.players[F]!, c, d, x.markets.london!.month, { chance: 0 });
    });
    expect(deal(w, id).lossReason).toBe('missing_feature');
    const lost = card(w, id);
    expect(lost.loss!.missing).toEqual([{ id: 'offline-mode', name: 'Offline mode' }]);
    const lostChance = winChance(w, co(w), deal(w, id), { known: true });

    // Build it, try again (back to discovery), show a new demo: a real chance now.
    w = ship(w, 'offline-mode');
    w = run(w, F, { type: 'sales.advance', dealId: id, action: 'recover' }).world;
    expect(deal(w, id).stage).toBe('discovery');
    w = run(w, F, { type: 'sales.advance', dealId: id, action: 'demo' }).world;
    const now = winChance(w, co(w), deal(w, id), { known: true });
    expect(now - lostChance).toBeGreaterThan(0.07);
    expect(card(w, id).known.wants!.every((x) => x.have)).toBe(true);
    // What product fit still costs is the product's general fit, not a missing feature.
    const fitCost = (x: World) =>
      holdingBack(x, co(x), deal(x, id), { known: true }).find(
        (h) => h.reason === 'missing_feature',
      )?.cost ?? 0;
    expect(fitCost(w)).toBeLessThan(0.15);
  });

  it('without named needs (an older lead), product fit is the plain fit as before', () => {
    const { w, id } = fitDeal(world(true), []);
    const plain = produce(w, (x) => {
      delete companyOf(x, F).deals![0]!.customer.wants;
    });
    expect(winChance(w, co(w), deal(w, id), { known: true })).toBe(
      winChance(plain, co(plain), deal(plain, id), { known: true }),
    );
    expect(card(plain, id).known.wants).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { supplyEffects, supplierQuality } from '../src/marketplace.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  DAY,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  T0,
  tryRun,
} from './helpers.js';

const setup = () => {
  let w = addFounder(makeWorld(41, ['lagos']), 'u_sell', 'lagos', 'Swift Rails');
  w = run(w, 'u_buy', {
    type: 'player.create',
    handle: 'buyer_one',
    name: 'Bola',
    role: 'founder',
    backgroundId: 'f-corporate',
    market: 'lagos',
    company: {
      name: 'Shop Stack',
      industry: 'ecommerce',
      revenueModel: 'subscription',
      idea: 'Restock for small shops',
      incorporation: 'local',
    },
  }).world;
  return w;
};

const listingOf = (w: World, companyId: string) =>
  Object.values(w.listings).find((l) => l.companyId === companyId)!;

describe('B2B marketplace (§6)', () => {
  it('AI startups list at around market rate so the marketplace is never empty', () => {
    let w = settle(setup(), 'lagos', 1, T0 + DAY);
    const view = playerView(w, 'u_buy')!;
    expect(view.market.listings.length).toBeGreaterThan(0);
    expect(view.market.listings.every((l) => l.price > 0 && l.uptime >= 0)).toBe(true);
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: companyOf(w, 'u_sell').id,
      title: 'Payments API',
      price: 150_000_00,
    }).world;
    expect(
      tryRun(w, 'u_sell', {
        type: 'listing.create',
        companyId: companyOf(w, 'u_sell').id,
        title: 'Again',
        price: 1,
      }).ok,
    ).toBe(false);
  });

  it('a supply contract is signed on a deal card, paid monthly, and reported as player revenue', () => {
    let w = setup();
    const seller = companyOf(w, 'u_sell');
    const buyer = companyOf(w, 'u_buy');
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: seller.id,
      title: 'Payments API',
      price: 100_000_00,
    }).world;
    const listing = listingOf(w, seller.id);
    const p = run(w, 'u_buy', {
      type: 'supply.propose',
      buyerCompanyId: buyer.id,
      listingId: listing.id,
      price: 100_000_00,
      months: 6,
    });
    w = p.world;
    expect(p.result.summary).toMatch(/supplies payments/);
    w = run(w, 'u_sell', { type: 'deal.act', dealId: p.result.dealId, action: 'accept' }).world;
    const k = Object.values(w.contracts)[0]!;
    expect(k.status).toBe('active');
    expect(k.flags).toEqual([]);
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 2, T0 + DAY);
    const last = w.companies[seller.id]!.finance.history.at(-1)!;
    expect(last.playerRevenue).toBe(100_000_00);
    expect(w.companies[buyer.id]!.finance.history.at(-1)!.suppliers).toBe(100_000_00);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
    // Buyer reviews the supplier once.
    w = run(w, 'u_buy', { type: 'supply.review', contractId: k.id, rating: 5 }).world;
    expect(tryRun(w, 'u_buy', { type: 'supply.review', contractId: k.id, rating: 4 }).ok).toBe(
      false,
    );
    expect(listingOf(w, seller.id).reviews.count).toBe(1);
  });

  it('a good supplier helps the buyer; a weak one hurts relative to the AI default', () => {
    let w = setup();
    const seller = companyOf(w, 'u_sell');
    const buyer = companyOf(w, 'u_buy');
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: seller.id,
      title: 'Payments API',
      price: 100_000_00,
    }).world;
    const p = run(w, 'u_buy', {
      type: 'supply.propose',
      buyerCompanyId: buyer.id,
      listingId: listingOf(w, seller.id).id,
      price: 100_000_00,
      months: 6,
    });
    w = run(p.world, 'u_sell', {
      type: 'deal.act',
      dealId: p.result.dealId,
      action: 'accept',
    }).world;
    const good = structuredClone(w);
    good.companies[seller.id]!.product.quality = 1;
    good.companies[seller.id]!.product.techDebt = 0;
    expect(supplierQuality(good.companies[seller.id]!)).toBeGreaterThan(0);
    expect(supplyEffects(good, good.companies[buyer.id]!).cogsMult).toBeLessThan(1);
    const bad = structuredClone(w);
    bad.companies[seller.id]!.product.quality = 0.1;
    expect(supplyEffects(bad, bad.companies[buyer.id]!).cogsMult).toBeGreaterThan(1);
  });

  it('a failed supplier disrupts its customers', () => {
    let w = setup();
    const seller = companyOf(w, 'u_sell');
    const buyer = companyOf(w, 'u_buy');
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: seller.id,
      title: 'Payments API',
      price: 50_000_00,
    }).world;
    const p = run(w, 'u_buy', {
      type: 'supply.propose',
      buyerCompanyId: buyer.id,
      listingId: listingOf(w, seller.id).id,
      price: 50_000_00,
      months: 6,
    });
    w = run(p.world, 'u_sell', {
      type: 'deal.act',
      dealId: p.result.dealId,
      action: 'accept',
    }).world;
    w = run(w, 'u_sell', { type: 'company.shutdown', companyId: seller.id }).world;
    w = settle(w, 'lagos', 1, T0 + DAY);
    expect(Object.values(w.contracts)[0]!.status).toBe('cancelled');
    expect(w.companies[buyer.id]!.supplyDisruptionMonth).toBe(1);
    expect(w.inbox.u_buy!.some((i) => /supplier .* failed/.test(i.text))).toBe(true);
  });

  it('flags related-party deals far above market, and sustained fake revenue is fraud', () => {
    let w = setup();
    // The same player founds both sides: buyer founder takes a stake in the seller.
    const seller = companyOf(w, 'u_sell');
    const buyer = companyOf(w, 'u_buy');
    w = structuredClone(w);
    w.companies[seller.id]!.capTable.holdings.u_buy = { shares: 1_000_000, kind: 'investor' };
    w.companies[seller.id]!.product.quality = 0.9;
    // Give the buyer money to pay inflated prices.
    w.accounts[buyer.account]!.balance += 500_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 500_000_000_00;
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: seller.id,
      title: 'Payments API',
      price: 20_000_000_00,
    }).world;
    const p = run(w, 'u_buy', {
      type: 'supply.propose',
      buyerCompanyId: buyer.id,
      listingId: listingOf(w, seller.id).id,
      price: 20_000_000_00,
      months: 12,
    });
    expect(p.result.summary).toMatch(/Flagged: related-party, above-market/);
    w = run(p.world, 'u_sell', {
      type: 'deal.act',
      dealId: p.result.dealId,
      action: 'accept',
    }).world;
    const starsBefore = w.companies[seller.id]!.stars.value;
    w = settle(w, 'lagos', 4, T0 + DAY);
    const s = w.companies[seller.id]!;
    expect(s.bannedFromRaising).toBe(true);
    expect(s.stars.value).toBeLessThan(starsBefore);
    expect(w.markets.lagos!.news.some((n) => /faked revenue/.test(n.headline))).toBe(true);
    const fund = Object.values(w.funds).find(
      (f) => f.market === 'lagos' && f.stages.includes('pre-seed'),
    )!;
    expect(
      tryRun(w, 'u_sell', {
        type: 'pitch.start',
        companyId: s.id,
        fundId: fund.id,
        slides: ['traction'],
        ask: 1_000_00,
      }).ok,
    ).toBe(false);
  });
});

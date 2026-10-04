import { describe, expect, it } from 'vitest';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
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

/** Founder u_f with a company; investor u_a takes a priced round with a board seat and a sale veto. */
function boardedCompany(seed = 51): World {
  let w = addInvestor(addFounder(makeWorld(seed, ['lagos']), 'u_f'), 'u_a');
  w = structuredClone(w);
  w.accounts[w.players.u_a!.accounts.local]!.balance += 100_000_000_00;
  w.accounts['ext:lagos:genesis']!.balance -= 100_000_000_00;
  const c = companyOf(w, 'u_f');
  const p = run(w, 'u_a', {
    type: 'invest.propose',
    companyId: c.id,
    instrument: 'priced',
    amount: 20_000_000_00,
    valuation: 200_000_000_00,
    proRata: true,
    boardSeat: true,
    vetoOnSale: true,
  });
  return run(p.world, 'u_f', { type: 'deal.act', dealId: p.result.dealId, action: 'accept' }).world;
}

describe('governance (§9)', () => {
  it('board seats and vetoes come from term sheets', () => {
    const w = boardedCompany();
    const c = companyOf(w, 'u_f');
    expect(c.board).toEqual(['u_a']);
    expect(c.vetoes).toEqual(['u_a']);
    expect(c.capTable.preferences).toHaveLength(1);
  });

  it('a later priced round waits for a board vote, and executes when it passes', () => {
    let w = addInvestor(boardedCompany(52), 'u_b');
    const c = companyOf(w, 'u_f');
    w = structuredClone(w);
    w.accounts[w.players.u_b!.accounts.local]!.balance += 100_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 100_000_000_00;
    const p = run(w, 'u_b', {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'priced',
      amount: 30_000_000_00,
      valuation: 400_000_000_00,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
    });
    w = run(p.world, 'u_f', { type: 'deal.act', dealId: p.result.dealId, action: 'accept' }).world;
    const deal = w.deals[p.result.dealId]!;
    expect(deal.status).toBe('open');
    expect(deal.pendingVoteId).toBeTruthy();
    const cashBefore = w.accounts[c.account]!.balance;
    expect(w.inbox.u_a!.some((i) => /Vote needed/.test(i.text))).toBe(true);
    w = run(w, 'u_a', { type: 'vote.cast', voteId: deal.pendingVoteId!, ballot: 'yes' }).world;
    expect(w.deals[deal.id]!.status).toBe('accepted');
    expect(w.accounts[c.account]!.balance - cashBefore).toBe(30_000_000_00);
  });

  it('a veto holder can block a sale', () => {
    let w = boardedCompany(53);
    w = addFounder(w, 'u_buyer', 'lagos', 'Big Buyer Co');
    const target = companyOf(w, 'u_f');
    const buyer = companyOf(w, 'u_buyer');
    w = structuredClone(w);
    w.accounts[buyer.account]!.balance += 2_000_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 2_000_000_000_00;
    const p = run(w, 'u_buyer', {
      type: 'acquire.propose',
      buyerCompanyId: buyer.id,
      targetCompanyId: target.id,
      price: 400_000_000_00,
      retention: 0,
    });
    w = run(p.world, 'u_f', { type: 'deal.act', dealId: p.result.dealId, action: 'accept' }).world;
    const vote = Object.values(w.votes).find((v) => v.kind === 'sale')!;
    expect(vote.status).toBe('open');
    w = run(w, 'u_a', { type: 'vote.cast', voteId: vote.id, ballot: 'no' }).world;
    expect(w.votes[vote.id]!.status).toBe('failed');
    expect(w.deals[p.result.dealId]!.status).toBe('declined');
    expect(w.companies[target.id]!.status).toBe('active');
  });

  it('an approved sale pays holders through the waterfall and merges the company', () => {
    let w = boardedCompany(54);
    w = addFounder(w, 'u_buyer', 'lagos', 'Big Buyer Co');
    const target = companyOf(w, 'u_f');
    const buyer = companyOf(w, 'u_buyer');
    w = structuredClone(w);
    w.accounts[buyer.account]!.balance += 2_000_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 2_000_000_000_00;
    w.companies[target.id]!.segments[w.companies[target.id]!.targetSegments[0]!]!.paying = 100;
    const total = moneyByCurrency(w);
    const investorBefore = w.accounts[w.players.u_a!.accounts.local]!.balance;
    const p = run(w, 'u_buyer', {
      type: 'acquire.propose',
      buyerCompanyId: buyer.id,
      targetCompanyId: target.id,
      price: 400_000_000_00,
      retention: 10_000_000_00,
    });
    w = run(p.world, 'u_f', { type: 'deal.act', dealId: p.result.dealId, action: 'accept' }).world;
    const vote = Object.values(w.votes).find((v) => v.kind === 'sale')!;
    w = run(w, 'u_a', { type: 'vote.cast', voteId: vote.id, ballot: 'yes' }).world;
    expect(w.deals[p.result.dealId]!.status).toBe('accepted');
    expect(w.companies[target.id]!.status).toBe('acquired');
    expect(w.accounts[w.players.u_a!.accounts.local]!.balance).toBeGreaterThan(investorBefore);
    const merged = w.companies[buyer.id]!;
    expect(Object.values(merged.segments).reduce((a, s) => a + s.paying, 0)).toBeGreaterThanOrEqual(
      80,
    );
    expect(w.players.u_buyer!.milestones['founder.first-acquisition']).toBeDefined();
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('refuses related-party sales far from market value (disguised transfers)', () => {
    let w = addFounder(makeWorld(55, ['lagos']), 'u_f');
    w = addFounder(w, 'u_buyer', 'lagos', 'Friendly Buyer');
    const target = companyOf(w, 'u_f');
    const buyer = companyOf(w, 'u_buyer');
    w = structuredClone(w);
    w.companies[target.id]!.capTable.holdings.u_buyer = { shares: 100_000, kind: 'investor' };
    w.accounts[buyer.account]!.balance += 100_000_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 100_000_000_000_00;
    const r = tryRun(w, 'u_buyer', {
      type: 'acquire.propose',
      buyerCompanyId: buyer.id,
      targetCompanyId: target.id,
      price: 90_000_000_000_00,
      retention: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('acquire.blocked');
  });

  it('the board can remove a founder CEO; the arbitrator rules on the claim', () => {
    let w = addInvestor(boardedCompany(56), 'u_b');
    const c = companyOf(w, 'u_f');
    w = structuredClone(w);
    w.companies[c.id]!.board.push('u_b');
    const r = run(w, 'u_a', { type: 'governance.removeCeo', companyId: c.id, founderId: 'u_f' });
    w = r.world;
    w = run(w, 'u_b', { type: 'vote.cast', voteId: r.result.voteId, ballot: 'yes' }).world;
    const after = w.companies[c.id]!;
    expect(after.founderIds).toEqual([]);
    expect(after.aiCeo).toBe(true);
    expect(after.capTable.holdings.u_f!.shares).toBeGreaterThan(0);
    // The removed founder files a claim; a ruling comes at the next settlement.
    w = run(w, 'u_f', { type: 'dispute.file', kind: 'wrongful-removal', refId: c.id }).world;
    expect(
      tryRun(w, 'u_f', { type: 'dispute.file', kind: 'wrongful-removal', refId: c.id }).ok,
    ).toBe(false);
    w = settle(w, 'lagos', 1, T0 + DAY);
    const d = Object.values(w.disputes)[0]!;
    expect(d.status).toBe('ruled');
    expect(d.ruling).toBeTruthy();
    expect(w.markets.lagos!.news.some((n) => /Arbitration/.test(n.headline))).toBe(true);
  });
});

describe('arbitration over broken supply contracts', () => {
  it('awards a break fee when a buyer walks out on a performing supplier', () => {
    let w = addFounder(makeWorld(57, ['lagos']), 'u_sell', 'lagos', 'Swift Rails');
    w = addFounder(w, 'u_buy', 'lagos', 'Shop Stack');
    const seller = companyOf(w, 'u_sell');
    const buyer = companyOf(w, 'u_buy');
    w = structuredClone(w);
    w.companies[seller.id]!.product.quality = 0.9;
    w.companies[seller.id]!.product.techDebt = 0;
    w.accounts[buyer.account]!.balance += 50_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 50_000_000_00;
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: seller.id,
      title: 'Payments API',
      price: 100_000_00,
    }).world;
    const listing = Object.values(w.listings).find((l) => l.companyId === seller.id)!;
    const p = run(w, 'u_buy', {
      type: 'supply.propose',
      buyerCompanyId: buyer.id,
      listingId: listing.id,
      price: 100_000_00,
      months: 12,
    });
    w = run(p.world, 'u_sell', {
      type: 'deal.act',
      dealId: p.result.dealId,
      action: 'accept',
    }).world;
    const k = Object.values(w.contracts)[0]!;
    w = run(w, 'u_buy', { type: 'supply.cancel', contractId: k.id }).world;
    w = run(w, 'u_sell', { type: 'dispute.file', kind: 'supply-breach', refId: k.id }).world;
    const sellerCash = w.accounts[seller.account]!.balance;
    w = settle(w, 'lagos', 1, T0 + DAY);
    const d = Object.values(w.disputes)[0]!;
    expect(d.award).toBe(Math.round(100_000_00 * 12 * 0.25));
    expect(d.ruling).toMatch(/break fee/);
    expect(w.accounts[seller.account]!.balance).toBeGreaterThan(sellerCash - 1);
  });

  it('only the supplier can claim, and only after an early cancellation by the buyer', () => {
    let w = addFounder(makeWorld(58, ['lagos']), 'u_sell', 'lagos', 'Swift Rails');
    w = addFounder(w, 'u_buy', 'lagos', 'Shop Stack');
    const seller = companyOf(w, 'u_sell');
    const buyer = companyOf(w, 'u_buy');
    w = run(w, 'u_sell', {
      type: 'listing.create',
      companyId: seller.id,
      title: 'Payments API',
      price: 100_000_00,
    }).world;
    const listing = Object.values(w.listings).find((l) => l.companyId === seller.id)!;
    const p = run(w, 'u_buy', {
      type: 'supply.propose',
      buyerCompanyId: buyer.id,
      listingId: listing.id,
      price: 100_000_00,
      months: 12,
    });
    w = run(p.world, 'u_sell', {
      type: 'deal.act',
      dealId: p.result.dealId,
      action: 'accept',
    }).world;
    const k = Object.values(w.contracts)[0]!;
    expect(
      tryRun(w, 'u_sell', { type: 'dispute.file', kind: 'supply-breach', refId: k.id }).ok,
    ).toBe(false);
    w = run(w, 'u_buy', { type: 'supply.cancel', contractId: k.id }).world;
    expect(
      tryRun(w, 'u_buy', { type: 'dispute.file', kind: 'supply-breach', refId: k.id }).ok,
    ).toBe(false);
  });
});

describe('cross-market acquisitions (§12, §14)', () => {
  it('buying in another market needs a trip and keeps the target trading there as a subsidiary', () => {
    let w = addFounder(makeWorld(59, ['lagos', 'nairobi']), 'u_buyer', 'lagos', 'Pan African Co');
    const buyer = companyOf(w, 'u_buyer');
    const target = Object.values(w.companies).find(
      (c) => c.ai && c.market === 'nairobi' && c.status === 'active',
    )!;
    w = structuredClone(w);
    w.accounts[buyer.account]!.balance += 900_000_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 900_000_000_000_00;
    w.accounts[w.players.u_buyer!.accounts.local]!.balance += 10_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 10_000_000_00;
    const offer = {
      type: 'acquire.propose' as const,
      buyerCompanyId: buyer.id,
      targetCompanyId: target.id,
      price: 50_000_000_000,
      retention: 0,
    };
    expect(tryRun(w, 'u_buyer', offer).ok).toBe(false);
    w = run(w, 'u_buyer', { type: 'player.travel', market: 'nairobi' }).world;
    const total = moneyByCurrency(w);
    const r = run(w, 'u_buyer', offer);
    w = r.world;
    expect(w.deals[r.result.dealId]!.status).toBe('accepted');
    const sub = w.companies[target.id]!;
    expect(sub.status).toBe('active');
    expect(sub.parentId).toBe(buyer.id);
    expect(sub.founderIds).toEqual(['u_buyer']);
    expect(sub.capTable.holdings[buyer.id]).toBeDefined();
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });
});

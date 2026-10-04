import { describe, expect, it } from 'vitest';
import { closePricedRound } from '../src/captable.js';
import { creditProfile } from '../src/credit.js';
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

const savings = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

describe('credit profiles and personal loans (§8)', () => {
  it('lends to individuals through a deal card and collects repayments monthly', () => {
    let w = addFounder(makeWorld(21, ['lagos']));
    const profile = creditProfile(w, w.players.u_founder!);
    expect(profile.score).toBeGreaterThan(20);
    expect(profile.unsecuredLimit).toBeGreaterThan(0);
    const total = moneyByCurrency(w);

    const req = run(w, 'u_founder', { type: 'player.loan', amount: 500_000_00, months: 12 });
    w = req.world;
    const deal = w.deals[req.result.dealId]!;
    expect(deal.companyId).toBeNull();
    expect(deal.summary).toMatch(/lends you/);
    const before = savings(w, 'u_founder');
    w = run(w, 'u_founder', { type: 'deal.act', dealId: deal.id, action: 'accept' }).world;
    const amount = deal.terms.kind === 'personal-loan' ? deal.terms.amount : 0;
    expect(savings(w, 'u_founder') - before).toBe(amount);
    const loan = w.players.u_founder!.loans[0]!;
    expect(loan.outstanding).toBe(amount);

    w = settle(w, 'lagos', 2, T0 + DAY);
    const after = w.players.u_founder!.loans[0]!;
    expect(after.outstanding).toBeLessThan(amount);
    expect(w.players.u_founder!.credit.onTimePayments).toBe(2);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('early repayment closes the loan and helps the credit profile', () => {
    let w = addFounder(makeWorld(22, ['lagos']));
    const req = run(w, 'u_founder', { type: 'player.loan', amount: 100_000_00, months: 6 });
    w = run(req.world, 'u_founder', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    }).world;
    const loan = w.players.u_founder!.loans[0]!;
    w = run(w, 'u_founder', {
      type: 'player.repay',
      loanId: loan.id,
      amount: loan.outstanding,
    }).world;
    expect(w.players.u_founder!.loans).toHaveLength(0);
    expect(w.players.u_founder!.credit.onTimePayments).toBe(2);
  });

  it('two missed payments is a public default that seizes pledged shares', () => {
    let w = addFounder(makeWorld(23, ['lagos']));
    const c = companyOf(w, 'u_founder');
    // Give the founder priced shares to pledge.
    w = structuredClone(w);
    closePricedRound(w.companies[c.id]!.capTable, {
      investorId: 'vc_x',
      amount: 50_000_000_00,
      preMoney: 200_000_000_00,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    const req = run(w, 'u_founder', {
      type: 'player.loan',
      amount: 50_000_000_00,
      months: 6,
      collateralCompanyId: c.id,
    });
    expect(
      w.deals[req.result.dealId]?.summary ?? req.world.deals[req.result.dealId]!.summary,
    ).toMatch(/pledged/);
    w = run(req.world, 'u_founder', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    }).world;
    // Spend the money so repayments fail.
    w = structuredClone(w);
    const acc = w.accounts[w.players.u_founder!.accounts.local]!;
    w.accounts['ext:lagos:lifestyle']!.balance += acc.balance;
    acc.balance = 0;
    w = settle(w, 'lagos', 2, T0 + DAY);
    const p = w.players.u_founder!;
    expect(p.loans).toHaveLength(0);
    expect(p.credit.defaults).toBe(1);
    expect(w.companies[c.id]!.capTable.holdings['bank:lagos']?.shares).toBeGreaterThan(0);
    expect(w.companies[c.id]!.capTable.holdings.u_founder).toBeUndefined();
    expect(w.markets.lagos!.news.some((n) => /defaults on a bank loan/.test(n.headline))).toBe(
      true,
    );
    expect(creditProfile(w, p).score).toBeLessThan(
      creditProfile(req.world, req.world.players.u_founder!).score,
    );
  });

  it('refuses to pledge shares that have no price yet', () => {
    const w = addFounder(makeWorld(24, ['lagos']));
    const c = companyOf(w, 'u_founder');
    const r = tryRun(w, 'u_founder', {
      type: 'player.loan',
      amount: 1_000_00,
      months: 6,
      collateralCompanyId: c.id,
    });
    expect(r.ok).toBe(false);
  });

  it('founders can put borrowed or saved money into their company', () => {
    let w = addFounder(makeWorld(25, ['lagos']));
    const c = companyOf(w, 'u_founder');
    const cash = w.accounts[c.account]!.balance;
    w = run(w, 'u_founder', { type: 'company.inject', companyId: c.id, amount: 100_000_00 }).world;
    expect(w.accounts[c.account]!.balance).toBe(cash + 100_000_00);
  });
});

describe('relationship capital in comebacks (§13)', () => {
  it('an orderly shutdown builds trust with backers, who hear first about the next company', () => {
    let w = addInvestor(addFounder(makeWorld(26, ['lagos'])), 'u_inv');
    const c = companyOf(w, 'u_founder');
    const propose = run(w, 'u_inv', {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount: 1_000_000_00,
      valuation: 50_000_000_00,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
    });
    w = run(propose.world, 'u_founder', {
      type: 'deal.act',
      dealId: propose.result.dealId,
      action: 'accept',
    }).world;
    const trustBefore = w.players.u_inv!.trust.u_founder ?? 0;
    w = run(w, 'u_founder', { type: 'company.shutdown', companyId: c.id }).world;
    expect(w.players.u_inv!.trust.u_founder).toBeGreaterThan(trustBefore);
    w = run(w, 'u_founder', {
      type: 'company.found',
      company: {
        name: 'Second Act',
        industry: 'saas',
        revenueModel: 'subscription',
        idea: 'Tools for shop owners',
        incorporation: 'local',
      },
    }).world;
    expect(w.inbox.u_inv!.some((i) => /whom you’ve worked with before/.test(i.text))).toBe(true);
  });
});

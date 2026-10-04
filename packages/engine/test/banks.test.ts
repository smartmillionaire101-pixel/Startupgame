import { describe, expect, it } from 'vitest';
import { bankFigures } from '../src/banks.js';
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

const addBanker = (
  w: World,
  id = 'u_bank',
  bankType: 'commercial' | 'microfinance' | 'venture-debt' | 'investment' = 'microfinance',
  backgroundId = 'b-wealthy',
) =>
  run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name: 'Bea Banker',
    role: 'banker',
    backgroundId,
    market: 'lagos',
    bank: { name: `Trust Bank ${id.slice(-3)}`, bankType },
  }).world;

const bankOf = (w: World, owner = 'u_bank') =>
  Object.values(w.banks).find((b) => b.ownerId === owner)!;

/** Overdrafts on bank operating accounts are allowed (lending out of deposits). */
const badAccounts = (w: World) =>
  negativeInternalAccounts(w).filter(
    (a) => !Object.values(w.banks).some((b) => b.account === a.id),
  );

function licensedBank(
  seed: number,
  type: 'commercial' | 'microfinance' | 'venture-debt' | 'investment' = 'microfinance',
) {
  let w = addBanker(makeWorld(seed, ['lagos']), 'u_bank', type);
  expect(bankOf(w).status).toBe('applying');
  w = settle(w, 'lagos', 2, T0 + DAY);
  return w;
}

describe('player-owned banks (§8)', () => {
  it('bankers raise capital from AI shareholders and get a licence after two months', () => {
    let w = addBanker(makeWorld(61, ['lagos']));
    const b = bankOf(w);
    expect(b.ownerShareBps).toBeGreaterThan(0);
    expect(b.ownerShareBps).toBeLessThan(10_000);
    expect(w.inbox.u_bank!.some((i) => /AI shareholders put in/.test(i.text))).toBe(true);
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 1, T0 + DAY);
    expect(bankOf(w).status).toBe('applying');
    w = settle(w, 'lagos', 1, T0 + 2 * DAY);
    expect(bankOf(w).status).toBe('licensed');
    expect(w.players.u_bank!.milestones['banker.licence']).toBeDefined();
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('refuses a licence when capital falls short of the minimum', () => {
    let w = addBanker(makeWorld(62, ['lagos']), 'u_bank', 'commercial', 'b-regulator');
    w = settle(w, 'lagos', 2, T0 + DAY);
    expect(bankOf(w).status).toBe('rejected');
    expect(w.accounts[bankOf(w).account]!.balance).toBe(0);
  });

  it('takes deposits, lends to a company on the banker’s decision, and collects interest', () => {
    let w = licensedBank(63, 'microfinance');
    w = addFounder(w, 'u_f');
    const c = companyOf(w, 'u_f');
    const b = bankOf(w);
    w = run(w, 'u_f', { type: 'account.move', account: c.id, bankId: b.id }).world;
    expect(w.accounts[c.account]!.bankId).toBe(b.id);
    const total = moneyByCurrency(w);
    const req = run(w, 'u_f', {
      type: 'company.loan',
      companyId: c.id,
      amount: 2_000_000_00,
      months: 12,
      personalGuarantee: false,
      bankId: b.id,
    });
    w = req.world;
    const deal = w.deals[req.result.dealId]!;
    expect(deal.counterparty.kind).toBe('playerbank');
    // The founder can't accept their own request; the banker decides.
    expect(tryRun(w, 'u_f', { type: 'deal.act', dealId: deal.id, action: 'accept' }).ok).toBe(
      false,
    );
    const cash = w.accounts[c.account]!.balance;
    w = run(w, 'u_bank', { type: 'deal.act', dealId: deal.id, action: 'accept' }).world;
    expect(w.accounts[c.account]!.balance - cash).toBe(2_000_000_00);
    expect(w.companies[c.id]!.finance.loans[0]!.lenderBankId).toBe(b.id);
    expect(w.players.u_bank!.milestones['banker.first-loan']).toBeDefined();
    w = settle(w, 'lagos', 2, T0 + 3 * DAY);
    const after = bankOf(w);
    expect(after.lastMonth.interestIncome).toBeGreaterThan(0);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(badAccounts(w)).toEqual([]);
    const f = bankFigures(w, after);
    expect(f.equity).toBeGreaterThan(0);
  });

  it('enforces capital rules on new loans', () => {
    let w = licensedBank(64, 'microfinance');
    w = addFounder(w, 'u_f');
    const c = companyOf(w, 'u_f');
    const req = run(w, 'u_f', {
      type: 'player.loan',
      amount: 900_000_000_00,
      months: 12,
      bankId: bankOf(w).id,
    });
    const r = tryRun(req.world, 'u_bank', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    });
    expect(r.ok).toBe(false);
    void c;
  });

  it('venture debt comes with warrants on the cap table', () => {
    let w = licensedBank(65, 'venture-debt');
    w = addFounder(w, 'u_f');
    const c = companyOf(w, 'u_f');
    w = structuredClone(w);
    w.companies[c.id]!.lastRound = 'seed';
    const req = run(w, 'u_f', {
      type: 'company.loan',
      companyId: c.id,
      amount: 1_000_000_00,
      months: 12,
      personalGuarantee: false,
      bankId: bankOf(w).id,
    });
    w = run(req.world, 'u_bank', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    }).world;
    expect(w.companies[c.id]!.capTable.holdings[`pbank:${bankOf(w).id}`]?.shares).toBeGreaterThan(
      0,
    );
  });

  it('a bank whose loans go bad is wound down; deposits are covered only up to the insured limit', () => {
    let w = licensedBank(66, 'commercial');
    w = addFounder(w, 'u_f');
    const c = companyOf(w, 'u_f');
    const b = bankOf(w);
    // A rich depositor keeps savings far above the insured limit at the bank.
    w = addFounder(w, 'u_rich', 'lagos', 'Rich Co');
    w = structuredClone(w);
    const richAcc = w.players.u_rich!.accounts.local;
    w.accounts[richAcc]!.balance += 500_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 500_000_000_00;
    w = run(w, 'u_rich', { type: 'account.move', account: 'personal', bankId: b.id }).world;
    const room = bankFigures(w, bankOf(w)).lendingRoom;
    const req = run(w, 'u_f', {
      type: 'company.loan',
      companyId: c.id,
      amount: Math.floor(room * 0.9),
      months: 24,
      personalGuarantee: false,
      bankId: b.id,
    });
    w = run(req.world, 'u_bank', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    }).world;
    const total = moneyByCurrency(w);
    // The borrower spends the money and shuts down: the loan is lost.
    w = structuredClone(w);
    const spend = w.accounts[c.account]!.balance;
    w.accounts[c.account]!.balance = 0;
    w.accounts['ext:lagos:suppliers']!.balance += spend;
    w = run(w, 'u_f', { type: 'company.shutdown', companyId: c.id }).world;
    w = settle(w, 'lagos', 1, T0 + 3 * DAY);
    expect(bankOf(w).status).toBe('failed');
    const insured = w.markets.lagos!.data.depositInsurance * 100;
    expect(w.accounts[richAcc]!.balance).toBeLessThan(500_000_000_00);
    expect(w.accounts[richAcc]!.balance).toBeGreaterThanOrEqual(insured);
    expect(w.accounts[richAcc]!.bankId).toBeNull();
    expect(w.markets.lagos!.news.some((n) => /fails; central bank steps in/.test(n.headline))).toBe(
      true,
    );
    expect(moneyByCurrency(w)).toEqual(total);
    expect(badAccounts(w)).toEqual([]);
  });

  it('the central bank lends to a bank that runs short of cash, against its loans', () => {
    let w = licensedBank(67, 'commercial');
    w = addFounder(w, 'u_f');
    w = addFounder(w, 'u_dep', 'lagos', 'Depositor Co');
    const c = companyOf(w, 'u_f');
    const b = bankOf(w);
    w = structuredClone(w);
    const dep = w.players.u_dep!.accounts.local;
    w.accounts[dep]!.balance += 200_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 200_000_000_00;
    w = run(w, 'u_dep', { type: 'account.move', account: 'personal', bankId: b.id }).world;
    // Lent well beyond its own capital but within what its loan book can back.
    const amount = Math.floor(bankFigures(w, bankOf(w)).equity * 1.5);
    const req = run(w, 'u_f', {
      type: 'company.loan',
      companyId: c.id,
      amount,
      months: 36,
      personalGuarantee: false,
      bankId: b.id,
    });
    w = run(req.world, 'u_bank', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    }).world;
    // The depositor leaves: the bank's overdraft is now past what deposits allow.
    w = run(w, 'u_dep', { type: 'account.move', account: 'personal', bankId: null }).world;
    w = settle(w, 'lagos', 1, T0 + 3 * DAY);
    const after = bankOf(w);
    expect(after.status).toBe('licensed');
    expect(after.cbLoans.length).toBeGreaterThan(0);
    expect(after.cbLoans[0]!.rateBps).toBeGreaterThan(w.markets.lagos!.data.baseRateBps);
  });

  it('investment banks earn an advisory fee on acquisitions', () => {
    let w = licensedBank(68, 'investment');
    w = addFounder(w, 'u_buyer', 'lagos', 'Buyer Co');
    const buyer = companyOf(w, 'u_buyer');
    const target = Object.values(w.companies).find((c) => c.ai && c.status === 'active')!;
    w = structuredClone(w);
    w.accounts[buyer.account]!.balance += 900_000_000_000_00;
    w.accounts['ext:lagos:genesis']!.balance -= 900_000_000_000_00;
    const bankCash = w.accounts[bankOf(w).account]!.balance;
    const r = run(w, 'u_buyer', {
      type: 'acquire.propose',
      buyerCompanyId: buyer.id,
      targetCompanyId: target.id,
      price: 500_000_000_000,
      retention: 0,
      advisorBankId: bankOf(w).id,
    });
    w = r.world;
    if (w.deals[r.result.dealId]!.status === 'accepted') {
      expect(w.accounts[bankOf(w).account]!.balance - bankCash).toBe(
        Math.round(500_000_000_000 * 0.02),
      );
      expect(bankOf(w).advised).toBe(1);
    }
  });

  it('only customers can review a bank, and dividends need surplus capital', () => {
    let w = licensedBank(69, 'microfinance');
    w = addFounder(w, 'u_f');
    const b = bankOf(w);
    expect(tryRun(w, 'u_f', { type: 'bank.review', bankId: b.id, rating: 5 }).ok).toBe(false);
    w = run(w, 'u_f', { type: 'account.move', account: 'personal', bankId: b.id }).world;
    w = run(w, 'u_f', { type: 'bank.review', bankId: b.id, rating: 5 }).world;
    expect(bankOf(w).reviews.count).toBe(1);
    expect(
      tryRun(w, 'u_bank', {
        type: 'bank.dividend',
        bankId: b.id,
        amount: w.accounts[b.account]!.balance,
      }).ok,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { fullyDiluted, ownership } from '../src/captable.js';
import { fundingSources } from '../src/journey.js';
import { closePricedRound } from '../src/captable.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const cid = (w: World) => companyOf(w, F).id;
const bal = (w: World, id: string) => w.accounts[id]!.balance;
const personal = (w: World, pid: string) => bal(w, w.players[pid]!.accounts.local);

/** A friend with no company: a founder-role player who only lives in the city. */
const addFriend = (w: World, id = 'u_friend') =>
  run(w, id, { type: 'player.quickStart', username: `n_${id}`, role: 'founder', name: 'Bo' }).world;

function base() {
  return addFriend(addInvestor(addFounder(makeWorld())));
}

describe('founder contribution: equity vs loan (§7.3)', () => {
  it('equity issues new founder shares at the current price; ownership reconciles', () => {
    const w0 = base();
    const c0 = companyOf(w0, F);
    const fd0 = fullyDiluted(c0.capTable);
    const amount = 1_000_000_00;
    const w = run(w0, F, {
      type: 'company.contribute',
      companyId: cid(w0),
      amount,
      as: 'equity',
    }).world;
    const c = companyOf(w, F);
    const added = fullyDiluted(c.capTable) - fd0;
    expect(added).toBeGreaterThan(0);
    expect(c.capTable.holdings[F]!.shares).toBe(c0.capTable.holdings[F]!.shares + added);
    expect(bal(w, c.account)).toBe(bal(w0, c0.account) + amount);
    expect(personal(w, F)).toBe(personal(w0, F) - amount);
    expect(c.founderEquity?.[F]).toBe(amount);
    expect(c.founderLoans ?? {}).toEqual({});
    const total = Object.keys(c.capTable.holdings).reduce(
      (a, h) => a + ownership(c.capTable, h),
      0,
    );
    expect(total).toBeCloseTo(1, 9);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
    expect(fundingSources(w, w.players[F]!)).toContain('founder');
  });

  it('a loan is a liability: no shares, repayable, shown on the balance sheet', () => {
    const w0 = base();
    const fd0 = fullyDiluted(companyOf(w0, F).capTable);
    const amount = 500_000_00;
    let w = run(w0, F, {
      type: 'company.contribute',
      companyId: cid(w0),
      amount,
      as: 'loan',
    }).world;
    const c = companyOf(w, F);
    expect(fullyDiluted(c.capTable)).toBe(fd0);
    expect(c.founderLoans?.[F]).toBe(amount);
    const fin = playerView(w, F)!.companies[0]!.founderFinance;
    expect(fin.balanceSheet.founderLoans).toBe(amount);
    expect(fin.balanceSheet.liabilities).toBeGreaterThanOrEqual(amount);
    // Not revenue.
    expect(c.finance.history.length).toBe(0);
    expect(c.ledgerThisMonth.playerRevenue).toBe(0);
    expect(
      tryRun(w, F, { type: 'company.repayFounder', companyId: c.id, amount: amount + 1 }).ok,
    ).toBe(false);
    const before = personal(w, F);
    w = run(w, F, { type: 'company.repayFounder', companyId: c.id, amount: 200_000_00 }).world;
    expect(companyOf(w, F).founderLoans?.[F]).toBe(300_000_00);
    expect(personal(w, F)).toBe(before + 200_000_00);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
  });

  it('a shut company repays founder loans before shareholders', () => {
    let w = base();
    w = run(w, F, {
      type: 'company.contribute',
      companyId: cid(w),
      amount: 100_000_00,
      as: 'loan',
    }).world;
    const before = personal(w, F);
    const total = moneyByCurrency(w);
    w = run(w, F, { type: 'company.shutdown', companyId: cid(w) }).world;
    expect(companyOf(w, F).founderLoans).toEqual({});
    expect(personal(w, F)).toBeGreaterThanOrEqual(before + 100_000_00);
    expect(moneyByCurrency(w)).toEqual(total);
  });
});

describe('business reserve (§7.2)', () => {
  it('transfers conserve money; reserve is excluded from available, included in total', () => {
    const w0 = base();
    const c0 = companyOf(w0, F);
    const cash0 = bal(w0, c0.account);
    let w = run(w0, F, {
      type: 'company.reserve',
      companyId: c0.id,
      amount: 1_000_00,
      dir: 'in',
    }).world;
    const c = companyOf(w, F);
    expect(c.reserve).toBeTruthy();
    const fin = playerView(w, F)!.companies[0]!.founderFinance;
    expect(fin.available).toBe(cash0 - 1_000_00);
    expect(fin.reserve).toBe(1_000_00);
    expect(fin.total).toBe(cash0);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
    expect(
      tryRun(w, F, { type: 'company.reserve', companyId: c.id, amount: 2_000_00, dir: 'out' }).ok,
    ).toBe(false);
    w = run(w, F, { type: 'company.reserve', companyId: c.id, amount: 1_000_00, dir: 'out' }).world;
    expect(bal(w, c.account)).toBe(cash0);
    expect(bal(w, c.reserve!)).toBe(0);
  });

  it('settlement releases the reserve when the month cannot be paid otherwise', () => {
    let w = base();
    const c = companyOf(w, F);
    const all = bal(w, c.account);
    w = run(w, F, { type: 'company.reserve', companyId: c.id, amount: all, dir: 'in' }).world;
    const total = moneyByCurrency(w);
    w = settle(w, 'lagos', 1);
    expect(companyOf(w, F).finance.unpaidPayroll).toBe(0);
    expect(negativeInternalAccounts(w)).toEqual([]);
    // The world's money is still conserved through settlement.
    expect(moneyByCurrency(w)).toEqual(total);
  });
});

describe('Friends & Family round', () => {
  const open = (w: World): ReturnType<typeof run> =>
    run(w, F, {
      type: 'ff.open',
      companyId: cid(w),
      target: 2_000_000_00,
      valuationCap: 50_000_000_00,
      discountPct: 20,
    });

  it('a player with any role commits; close moves money exactly once and writes SAFEs', () => {
    const w0 = base();
    const opened = open(w0);
    let w = opened.world;
    const roundId = opened.result.roundId as string;
    const escrow = w.ffRounds![roundId]!.escrow;
    // The friend (no company, founder role) and the investor both commit.
    const friend0 = personal(w, 'u_friend');
    w = run(w, 'u_friend', { type: 'ff.commit', roundId, amount: 300_000_00 }).world;
    w = run(w, 'u_investor', { type: 'ff.commit', roundId, amount: 700_000_00 }).world;
    expect(personal(w, 'u_friend')).toBe(friend0 - 300_000_00);
    expect(bal(w, escrow)).toBe(1_000_000_00);
    // Visible to the friend, and the founder can't commit to their own round.
    expect(playerView(w, 'u_friend')!.friendsRounds[0]!.yourCommitment).toBe(300_000_00);
    expect(tryRun(w, F, { type: 'ff.commit', roundId, amount: 1_000_00 }).ok).toBe(false);
    // Over the target: refused.
    expect(tryRun(w, 'u_friend', { type: 'ff.commit', roundId, amount: 1_500_000_00 }).ok).toBe(
      false,
    );
    const cash = bal(w, companyOf(w, F).account);
    w = run(w, F, { type: 'ff.close', roundId }).world;
    const c = companyOf(w, F);
    expect(bal(w, c.account)).toBe(cash + 1_000_000_00);
    expect(bal(w, escrow)).toBe(0);
    expect(c.capTable.safes.map((s) => [s.holderId, s.amount, s.discountPct])).toEqual([
      ['u_friend', 300_000_00, 20],
      ['u_investor', 700_000_00, 20],
    ]);
    expect(w.positions[`u_friend:${c.id}`]!.invested).toBe(300_000_00);
    // Exactly once.
    expect(tryRun(w, F, { type: 'ff.close', roundId }).ok).toBe(false);
    expect(tryRun(w, 'u_friend', { type: 'ff.commit', roundId, amount: 1_000_00 }).ok).toBe(false);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
    expect(fundingSources(w, w.players[F]!)).toEqual(expect.arrayContaining(['equity', 'friends']));
  });

  it('cancelling refunds every commitment; no money is taken', () => {
    const w0 = base();
    const opened = open(w0);
    const roundId = opened.result.roundId as string;
    let w = run(opened.world, 'u_friend', { type: 'ff.commit', roundId, amount: 250_000_00 }).world;
    w = run(w, F, { type: 'ff.cancel', roundId }).world;
    expect(personal(w, 'u_friend')).toBe(personal(w0, 'u_friend'));
    expect(companyOf(w, F).capTable.safes).toEqual([]);
    expect(bal(w, w.ffRounds![roundId]!.escrow)).toBe(0);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
  });

  it('AI angels commit at most twice per ask, within half the round, once a month', () => {
    const w0 = base();
    const opened = open(w0);
    const roundId = opened.result.roundId as string;
    const r = run(opened.world, F, { type: 'ff.askAi', roundId });
    let w = r.world;
    expect(r.result.yes.length + r.result.no.length).toBeLessThanOrEqual(2);
    const ai = w.ffRounds![roundId]!.commitments.filter((x) => x.ai);
    expect(ai.length).toBeLessThanOrEqual(2);
    expect(ai.reduce((a, x) => a + x.amount, 0)).toBeLessThanOrEqual(1_000_000_00);
    expect(tryRun(w, F, { type: 'ff.askAi', roundId }).ok).toBe(false);
    // Deterministic: the same ask gives the same answer.
    expect(run(opened.world, F, { type: 'ff.askAi', roundId }).result).toEqual(r.result);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
    if (ai.length) {
      w = run(w, F, { type: 'ff.close', roundId }).world;
      expect(companyOf(w, F).capTable.safes.length).toBe(ai.length);
    }
  });

  it('across worlds, some AI angels say yes and their cheques close into SAFEs', () => {
    let yes = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w0 = addFounder(makeWorld(seed));
      const opened = open(w0);
      const roundId = opened.result.roundId as string;
      const r = run(opened.world, F, { type: 'ff.askAi', roundId });
      const ai = r.world.ffRounds![roundId]!.commitments;
      expect(ai.reduce((a, x) => a + x.amount, 0)).toBeLessThanOrEqual(1_000_000_00);
      expect(moneyByCurrency(r.world)).toEqual(moneyByCurrency(w0));
      yes += ai.length;
    }
    expect(yes).toBeGreaterThan(0);
  });

  it('discount SAFEs convert at the better of cap or discount in a priced round', () => {
    const w0 = base();
    const opened = open(w0);
    const roundId = opened.result.roundId as string;
    let w = run(opened.world, 'u_friend', {
      type: 'ff.commit',
      roundId,
      amount: 1_000_000_00,
    }).world;
    w = run(w, F, { type: 'ff.close', roundId }).world;
    const ct = produce(companyOf(w, F).capTable, (d) => {
      closePricedRound(d, {
        investorId: 'vc',
        amount: 10_000_000_00,
        preMoney: 40_000_000_00,
        poolTopUpBps: 0,
        multiple: 1,
        participating: false,
      });
    });
    // Without the discount the SAFE would own ~2% (1m / 50m cap); 20% off a 40m pre beats it.
    expect(ownership(ct, 'u_friend')).toBeGreaterThan(0.02);
  });
});

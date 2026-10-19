import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { INVESTOR } from '../src/data/investor.js';
import { distributeFund } from '../src/funds.js';
import { committedTotal } from '../src/lpfunds.js';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import {
  addInvestor,
  careerWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const GP = 'u_investor';
const LP = 'u_lp';

/** A GP at rung 3 (four deals, 3.5★, cash returned) and a wealthy player LP. */
function setup(seed = 31, anchor = true) {
  let w = addInvestor(careerWorld(seed));
  w = addInvestor(w, LP);
  w = run(w, GP, { type: 'investor.tutorial', action: 'skip' }).world;
  w = run(w, LP, { type: 'investor.tutorial', action: 'skip' }).world;
  w = produce(w, (d) => {
    d.players[GP]!.stars.value = 3.5;
    const ids = Object.values(d.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active')
      .slice(0, 4)
      .map((c) => c.id);
    for (const cid of ids)
      d.positions[`${GP}:${cid}`] = {
        investorId: GP,
        companyId: cid,
        invested: 1_000_00,
        returned: 2_000_00,
        month: 0,
        writtenOff: false,
      };
  });
  w = run(w, GP, { type: 'player.seen' }).world;
  w = topUp(w, GP, 2_000_000_000_00);
  w = topUp(w, LP, 4_000_000_000_00);
  if (anchor) {
    const inv = playerView(w, GP)!.investorCareer!.invitations.find((x) => x.kind === 'anchor')!;
    w = run(w, GP, { type: 'career.invitation', invitationId: inv.id, accept: true }).world;
  }
  return w;
}

const target = (w: World) => w.players[GP]!.career!.anchor?.amount ?? 500_000_000_00;

/** Give a player more savings (from the outside world), so big LP cheques fit. */
const topUp = (w: World, id: string, amount: number) =>
  produce(w, (d) => {
    d.accounts[d.players[id]!.accounts.local]!.balance += amount;
    d.accounts[d.markets.lagos!.ext.genesis]!.balance -= amount;
  });

function launch(w: World, t: number): { world: World; fundId: string } {
  const cmd: Command = {
    type: 'fund.launch',
    sectors: ['fintech'],
    stages: ['seed'],
    checkSize: Math.round(t / 40),
    why: 'Payment rails for traders across West Africa',
    strategy: 'seed',
    target: t,
    minCommit: Math.round(t / 50),
    feeRate: 0.02,
    carry: 0.2,
    hurdle: 0,
    gpCommit: 0.02,
    termMonths: 48,
    investMonths: 24,
    keyPerson: true,
  };
  const r = run(w, GP, cmd);
  return { world: r.world, fundId: r.result.fundId };
}

const zero = (before: Record<string, number>, w: World) => {
  expect(moneyByCurrency(w)).toEqual(before);
  expect(negativeInternalAccounts(w)).toEqual([]);
};

describe('raising a fund with player LPs (Phase 4)', () => {
  it('needs rung 3', () => {
    let w = addInvestor(careerWorld(31));
    w = run(w, GP, { type: 'investor.tutorial', action: 'skip' }).world;
    const r = tryRun(w, GP, {
      type: 'fund.launch',
      sectors: ['fintech'],
      stages: ['seed'],
      checkSize: 1_000_000,
      why: 'Payment rails for traders across West Africa',
      strategy: 'seed',
      target: 1_000_000_000_00,
      minCommit: 10_000_000_00,
      feeRate: 0.02,
      carry: 0.2,
      hurdle: 0,
      gpCommit: 0.02,
      termMonths: 48,
      investMonths: 24,
      keyPerson: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('fund.rung');
  });

  it('raises with an anchor, a player LP and the GP; calls capital; can invest after the first close', () => {
    let w = setup();
    const t = target(w) * 3;
    const l = launch(w, t);
    w = l.world;
    const f0 = w.funds[l.fundId]!;
    expect(f0.lp!.stage).toBe('raising');
    expect(f0.lp!.commitments.map((c) => c.kind).sort()).toEqual(['dfi-fof', 'gp']);
    // Can't invest before the first close.
    const c = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active',
    )!;
    const early = tryRun(w, GP, {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount: 1_000_00,
      valuation: 1_000_000_00,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
      fromFund: true,
    });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe('fund.notInvesting');
    // Not enough for a first close yet (anchor a third, GP 2%).
    const tooSoon = tryRun(w, GP, { type: 'fund.close', fundId: l.fundId });
    expect(tooSoon.ok).toBe(false);
    // The player LP commits; the fund shows in their list.
    expect(playerView(w, LP)!.lpFunds!.raising.map((x) => x.id)).toContain(l.fundId);
    const lpAmount = Math.round(t * 0.3);
    w = run(w, LP, { type: 'lp.commit', fundId: l.fundId, amount: lpAmount }).world;
    w = run(w, GP, { type: 'fund.close', fundId: l.fundId }).world;
    const f = w.funds[l.fundId]!;
    expect(f.lp!.stage).toBe('investing');
    expect(f.size).toBe(committedTotal(f));
    // AI anchor paid in full; player LP and GP got their first call (a quarter).
    const anchorC = f.lp!.commitments.find((x) => x.anchor)!;
    expect(anchorC.paidIn).toBe(anchorC.committed);
    const calls = playerView(w, LP)!.lpFunds!.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]!.amount).toBe(Math.round(lpAmount / INVESTOR.fund.calls));
    w = run(w, LP, { type: 'lp.pay', callId: calls[0]!.id }).world;
    expect(w.funds[l.fundId]!.lp!.commitments.find((x) => x.playerId === LP)!.paidIn).toBe(
      calls[0]!.amount,
    );
    expect(w.players[LP]!.milestones['investor.first-call-paid']).toBeDefined();
    expect(w.players[GP]!.milestones['investor.first-close']).toBeDefined();
    // Now the fund can invest; the GP is a fund manager (rung 4).
    expect(playerView(w, GP)!.investorCareer!.current).toBe(4);
    // AI LP money came from outside; the rest moved between players and the fund.
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('autopays the next quarterly call; a missed call forfeits a quarter and bars new commitments', () => {
    let w = setup(32);
    const t = target(w) * 2;
    const l = launch(w, t);
    w = l.world;
    w = run(w, LP, { type: 'lp.commit', fundId: l.fundId, amount: Math.round(t * 0.3) }).world;
    w = run(w, GP, { type: 'fund.close', fundId: l.fundId }).world;
    const first = playerView(w, LP)!.lpFunds!.calls[0]!;
    w = run(w, LP, { type: 'lp.pay', callId: first.id }).world;
    // The LP turns autopay on: the next call is paid when it falls due.
    w = run(w, LP, { type: 'lp.autopay', fundId: l.fundId, on: true }).world;
    w = settle(w, 'lagos', INVESTOR.fund.callEveryMonths + 1);
    const c = w.funds[l.fundId]!.lp!.commitments.find((x) => x.playerId === LP)!;
    expect(c.paidIn).toBe(Math.round(c.committed / INVESTOR.fund.calls) * 2);
    // Turn autopay off and empty the account: the third call is missed.
    w = run(w, LP, { type: 'lp.autopay', fundId: l.fundId, on: false }).world;
    w = produce(w, (d) => {
      const acc = d.accounts[d.players[LP]!.accounts.local]!;
      d.accounts[d.markets.lagos!.ext.genesis]!.balance += acc.balance;
      acc.balance = 0;
    });
    const paidBefore = c.paidIn;
    const defaultsBefore = w.players[LP]!.credit.defaults;
    w = settle(w, 'lagos', INVESTOR.fund.callEveryMonths + 2);
    const after = w.funds[l.fundId]!.lp!.commitments.find((x) => x.playerId === LP)!;
    expect(after.status).toBe('defaulted');
    expect(after.paidIn).toBe(
      paidBefore - Math.round(paidBefore * INVESTOR.penalties.missedCallForfeit),
    );
    expect(w.players[LP]!.credit.defaults).toBe(defaultsBefore + 1);
    expect(playerView(w, LP)!.lpFunds!.bannedUntil).not.toBeNull();
  });

  it('a raise that never reaches its first close fails and moves no money', () => {
    let w = setup(33);
    const before = moneyByCurrency(w);
    const l = launch(w, target(w) * 4);
    w = settle(l.world, 'lagos', INVESTOR.fund.finalCloseMonths);
    const f = w.funds[l.fundId]!;
    expect(f.lp!.stage).toBe('failed');
    expect(f.lp!.commitments.every((c) => c.status === 'released')).toBe(true);
    expect(w.accounts[f.account]!.balance).toBe(0);
    expect(w.players[GP]!.investor!.fundId).toBeUndefined();
    // Settling moved other money in the city; this fund moved none.
    expect(negativeInternalAccounts(w)).toEqual([]);
    void before;
  });

  it('pays LPs their money back first, pro rata, then carry to the GP', () => {
    let w = setup(34);
    const t = target(w) * 2;
    const l = launch(w, t);
    w = l.world;
    w = run(w, LP, { type: 'lp.commit', fundId: l.fundId, amount: Math.round(t * 0.3) }).world;
    w = run(w, GP, { type: 'fund.close', fundId: l.fundId }).world;
    for (const c of playerView(w, LP)!.lpFunds!.calls)
      w = run(w, LP, { type: 'lp.pay', callId: c.id }).world;
    for (const c of playerView(w, GP)!.lpFunds!.calls)
      w = run(w, GP, { type: 'lp.pay', callId: c.id }).world;
    const f = w.funds[l.fundId]!;
    const paid = f.lp!.paidIn;
    const lpC = f.lp!.commitments.find((x) => x.playerId === LP)!;
    const lpCash = w.accounts[w.players[LP]!.accounts.local]!.balance;
    const gpCash = w.accounts[w.players[GP]!.accounts.local]!.balance;
    // Proceeds of twice what LPs paid in arrive from an exit.
    const proceeds = paid * 2;
    const out = produce(w, (d) => {
      const fund = d.funds[l.fundId]!;
      d.accounts[d.markets.lagos!.ext.lps]!.balance -= proceeds;
      d.accounts[fund.account]!.balance += proceeds;
      distributeFund(d as World, fund, proceeds, d.markets.lagos!.month);
    });
    const fo = out.funds[l.fundId]!;
    const carry = Math.round((proceeds - paid) * 0.2);
    expect(fo.lp!.carryPaid).toBe(carry);
    const lpShare = Math.floor(((proceeds - carry) * lpC.paidIn) / paid);
    const lpAfter = fo.lp!.commitments.find((x) => x.playerId === LP)!;
    expect(lpAfter.distributed).toBe(lpShare);
    const rate = out.markets.lagos!.data.tax.capitalGains;
    const tax = Math.round((lpShare - lpC.paidIn) * rate);
    expect(out.accounts[out.players[LP]!.accounts.local]!.balance - lpCash).toBe(lpShare - tax);
    expect(out.accounts[out.players[GP]!.accounts.local]!.balance).toBeGreaterThan(gpCash);
    expect(negativeInternalAccounts(out)).toEqual([]);
  });

  it('a late LP catches up on calls already made, plus a fee', () => {
    let w = setup(35);
    const t = target(w) * 2;
    const l = launch(w, t);
    w = l.world;
    w = run(w, LP, { type: 'lp.commit', fundId: l.fundId, amount: Math.round(t * 0.3) }).world;
    w = run(w, GP, { type: 'fund.close', fundId: l.fundId }).world;
    w = settle(w, 'lagos', 2);
    w = addInvestor(w, 'u_late');
    w = run(w, 'u_late', { type: 'investor.tutorial', action: 'skip' }).world;
    const amount = Math.round(t * 0.1);
    w = run(w, 'u_late', { type: 'lp.commit', fundId: l.fundId, amount }).world;
    const calls = playerView(w, 'u_late')!.lpFunds!.calls;
    expect(calls).toHaveLength(1);
    const owed = Math.round(amount / INVESTOR.fund.calls);
    const fee = Math.round(amount * INVESTOR.fund.catchUpMonthly * 2);
    expect(calls[0]!.amount).toBe(owed + fee);
    const before = moneyByCurrency(w);
    w = run(w, 'u_late', { type: 'lp.pay', callId: calls[0]!.id }).world;
    const c = w.funds[l.fundId]!.lp!.commitments.find((x) => x.playerId === 'u_late')!;
    expect(c.paidIn).toBe(owed);
    zero(before, w);
  });

  it('players can be LPs in AI funds: paid in at once, a share of exits', () => {
    let w = setup(36, false);
    const before = moneyByCurrency(w);
    const ai = Object.values(w.funds).find((f) => f.ai && !f.angelId && f.market === 'lagos')!;
    const amount = Math.round(ai.size / 4);
    const size0 = ai.size;
    w = run(w, LP, { type: 'lp.commit', fundId: ai.id, amount }).world;
    const f = w.funds[ai.id]!;
    expect(f.size).toBe(size0 + amount);
    expect(f.lp!.commitments[0]!.paidIn).toBe(amount);
    zero(before, w);
    const lpCash = w.accounts[w.players[LP]!.accounts.local]!.balance;
    const proceeds = 1_000_000_00;
    const out = produce(w, (d) => {
      const fund = d.funds[ai.id]!;
      d.accounts[fund.account]!.balance += proceeds;
      d.accounts[d.markets.lagos!.ext.lps]!.balance -= proceeds;
      distributeFund(d as World, fund, proceeds, d.markets.lagos!.month);
    });
    const share = Math.floor((proceeds * amount) / f.size);
    expect(out.funds[ai.id]!.lp!.commitments[0]!.distributed).toBe(share);
    expect(out.accounts[out.players[LP]!.accounts.local]!.balance - lpCash).toBe(share);
  });
});

import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { distributeFund } from '../src/funds.js';
import { fundMetrics } from '../src/fundops.js';
import { nextStage } from '../src/helpers.js';
import { valueCompany } from '../src/valuation.js';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import { GP, LP, setup, target, topUp } from './investor-helpers.js';
import { addInvestor, negativeInternalAccounts, run, settle, tryRun } from './helpers.js';

function launchCmd(t: number, strategy: 'seed' | 'fof' = 'seed'): Command {
  return {
    type: 'fund.launch',
    sectors: ['fintech'],
    stages: ['seed'],
    checkSize: Math.round(t / 40),
    why: 'Backing the best managers across the region',
    strategy,
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
}

function closed(w: World, gp: string, fundId: string, lpAmount: number) {
  w = run(w, LP, { type: 'lp.commit', fundId, amount: lpAmount }).world;
  w = run(w, gp, { type: 'fund.close', fundId }).world;
  for (const id of [LP, gp])
    for (const c of playerView(w, id)!.lpFunds!.calls)
      w = run(w, id, { type: 'lp.pay', callId: c.id }).world;
  w = run(w, LP, { type: 'lp.autopay', fundId, on: true }).world;
  return run(w, gp, { type: 'lp.autopay', fundId, on: true }).world;
}

describe('the family office (Phase 7)', () => {
  it('shows every track, its share and what is still to be called', () => {
    let w = setup(61);
    const t = target(w) * 3;
    const r = run(w, GP, launchCmd(t));
    w = run(r.world, LP, {
      type: 'lp.commit',
      fundId: r.result.fundId,
      amount: Math.round(t * 0.4),
    }).world;
    w = run(w, GP, { type: 'fund.close', fundId: r.result.fundId }).world;
    const fo = playerView(w, LP)!.familyOffice!;
    expect(fo.tracks.map((x) => x.id)).toEqual([
      'cash',
      'startups',
      'syndicates',
      'lp',
      'listed',
      'index',
      'property',
    ]);
    expect(fo.tracks.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 1);
    expect(fo.uncalled).toBeGreaterThan(0);
    expect(fo.funds).toHaveLength(1);
  });
});

describe('a fund of funds', () => {
  it('commits to another GP’s fund, pays its calls itself, and passes distributions on', () => {
    let w = setup(62);
    // The allocator: rung 7 opens a fund of funds.
    w = produce(w, (d) => {
      d.players[GP]!.career!.reached[7] = d.markets.lagos!.month;
    });
    const t = target(w) * 3;
    const fof = run(w, GP, launchCmd(t, 'fof'));
    w = closed(fof.world, GP, fof.result.fundId, Math.round(t * 0.4));
    const fofId = fof.result.fundId as string;
    // A second GP raises a venture fund.
    w = addInvestor(w, 'u_gp2');
    w = run(w, 'u_gp2', { type: 'investor.tutorial', action: 'skip' }).world;
    w = topUp(w, 'u_gp2', 2_000_000_000_00);
    w = produce(w, (d) => {
      d.players.u_gp2!.career!.reached[3] = d.markets.lagos!.month;
    });
    const v = run(w, 'u_gp2', launchCmd(t));
    w = v.world;
    const ventureId = v.result.fundId as string;
    // A fund of funds can't back companies.
    const c = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active',
    )!;
    const bad = tryRun(w, GP, {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount: 1_000_00,
      valuation: 1_000_000_00,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
      fromFund: true,
      fundId: fofId,
    });
    expect(bad.ok).toBe(false);
    const amount = Math.round(w.accounts[w.funds[fofId]!.account]!.balance * 0.8);
    w = run(w, GP, { type: 'fof.commit', fundId: fofId, targetFundId: ventureId, amount }).world;
    // The venture fund needs half its target for a first close: its own LP tops it up.
    w = run(w, LP, { type: 'lp.commit', fundId: ventureId, amount: Math.round(t * 0.5) }).world;
    w = run(w, 'u_gp2', { type: 'fund.close', fundId: ventureId }).world;
    // At month end the fund of funds pays its first call from its own account.
    w = settle(w, 'lagos', 1);
    const cm = w.funds[ventureId]!.lp!.commitments.find((x) => x.fundId === fofId)!;
    expect(cm.paidIn).toBe(Math.round(amount / 4));
    // Its NAV looks through to the venture fund.
    expect(fundMetrics(w, w.funds[fofId]!).holdings).toBeGreaterThan(0);
    // A distribution from the venture fund reaches the fund of funds' LPs.
    const lpCash = w.accounts[w.players[LP]!.accounts.local]!.balance;
    const proceeds = w.funds[ventureId]!.lp!.paidIn * 2;
    const out = produce(w, (d) => {
      const f = d.funds[ventureId]!;
      d.accounts[f.account]!.balance += proceeds;
      d.accounts[d.markets.lagos!.ext.lps]!.balance -= proceeds;
      distributeFund(d as World, f, proceeds, d.markets.lagos!.month);
    });
    expect(
      out.funds[ventureId]!.lp!.commitments.find((x) => x.fundId === fofId)!.distributed,
    ).toBeGreaterThan(0);
    expect(out.accounts[out.players[LP]!.accounts.local]!.balance).toBeGreaterThan(lpCash);
    expect(negativeInternalAccounts(out)).toEqual([]);
  });
});

describe('the LP advisory committee', () => {
  it('a fund investing where the GP holds a stake needs the committee’s yes', () => {
    let w = setup(63);
    const t = target(w) * 3;
    const r = run(w, GP, launchCmd(t));
    const fundId = r.result.fundId as string;
    w = closed(r.world, GP, fundId, Math.round(t * 0.4));
    const c = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active' && !x.lastRound,
    )!;
    w = produce(w, (d) => {
      d.positions[`${GP}:${c.id}`] = {
        investorId: GP,
        companyId: c.id,
        invested: 1_000_00,
        returned: 0,
        month: 0,
        writtenOff: false,
      };
      d.funds[fundId]!.sectors = [c.industry];
    });
    const model = valueCompany(w, c, nextStage(c.lastRound)).value;
    const amount = Math.round(w.funds[fundId]!.size * 0.03);
    const propose = (world: World) =>
      tryRun(world, GP, {
        type: 'invest.propose',
        companyId: c.id,
        instrument: 'safe',
        amount,
        valuation: model + amount,
        proRata: true,
        boardSeat: false,
        vetoOnSale: false,
        fromFund: true,
      });
    const r1 = propose(w);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('fund.conflict');
    // The LPs trust the GP: AI members vote yes; the player member votes too.
    w = produce(w, (d) => {
      const f = d.funds[fundId]!;
      for (const cm of f.lp!.commitments)
        f.lp!.relations[cm.id] = { trust: 0.8, reup: false, letters: 0 };
    });
    const q = run(w, GP, { type: 'fund.lpac', fundId, companyId: c.id });
    w = q.world;
    if (q.result.status === 'pending') {
      expect(playerView(w, LP)!.familyOffice!.lpacVotes).toHaveLength(1);
      w = run(w, LP, { type: 'lpac.vote', fundId, companyId: c.id, approve: true }).world;
    }
    expect(w.funds[fundId]!.lp!.lpac![0]!.status).toBe('approved');
    expect(propose(w).ok).toBe(true);
  });
});

describe('selling LP stakes and startup secondaries', () => {
  it('to an outside buyer at a discount to NAV, once the GP approves; the buyer pays what is left to call', () => {
    let w = setup(64);
    const t = target(w) * 3;
    const r = run(w, GP, launchCmd(t));
    const fundId = r.result.fundId as string;
    w = closed(r.world, GP, fundId, Math.round(t * 0.4));
    const cm = w.funds[fundId]!.lp!.commitments.find((x) => x.playerId === LP)!;
    const cash = w.accounts[w.players[LP]!.accounts.local]!.balance;
    const s = run(w, LP, { type: 'stake.sell', fundId });
    w = s.world;
    expect(s.result.price).toBeGreaterThan(0);
    // Nothing moves until the GP answers.
    expect(w.accounts[w.players[LP]!.accounts.local]!.balance).toBe(cash);
    const ask = playerView(w, GP)!.stakeConsents;
    expect(ask).toHaveLength(1);
    expect(ask[0]!.buyerName).toBe('Secondary buyer');
    expect(playerView(w, LP)!.familyOffice!.mySales[0]!.status).toBe('awaiting-gp');
    const lpOnly = tryRun(w, LP, {
      type: 'stake.consent',
      offerId: s.result.offerId,
      approve: true,
    });
    expect(lpOnly.ok).toBe(false);
    w = run(w, GP, { type: 'stake.consent', offerId: s.result.offerId, approve: true }).world;
    expect(playerView(w, GP)!.stakeConsents).toHaveLength(0);
    const received = w.accounts[w.players[LP]!.accounts.local]!.balance - cash;
    expect(received).toBeGreaterThan(0);
    expect(received).toBeLessThanOrEqual(s.result.price);
    const f = w.funds[fundId]!;
    expect(f.lp!.commitments.find((x) => x.id === cm.id)!.status).toBe('sold');
    const buyer = f.lp!.commitments.find((x) => x.kind === 'secondary')!;
    expect(buyer.paidIn).toBe(buyer.committed);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('to another qualifying player at an agreed price', () => {
    let w = setup(65);
    const t = target(w) * 3;
    const r = run(w, GP, launchCmd(t));
    const fundId = r.result.fundId as string;
    w = closed(r.world, GP, fundId, Math.round(t * 0.4));
    w = addInvestor(w, 'u_buyer');
    w = run(w, 'u_buyer', { type: 'investor.tutorial', action: 'skip' }).world;
    const o = run(w, LP, { type: 'stake.offer', fundId, buyerId: 'u_buyer', price: 1_000_000_00 });
    w = o.world;
    expect(playerView(w, 'u_buyer')!.familyOffice!.stakeOffers).toHaveLength(1);
    w = run(w, 'u_buyer', { type: 'stake.answer', offerId: o.result.offerId, accept: true }).world;
    expect(w.funds[fundId]!.lp!.commitments.some((x) => x.playerId === 'u_buyer')).toBe(false);
    w = run(w, GP, { type: 'stake.consent', offerId: o.result.offerId, approve: true }).world;
    const cm = w.funds[fundId]!.lp!.commitments.find((x) => x.playerId === 'u_buyer')!;
    expect(cm).toBeTruthy();
    expect(
      w.funds[fundId]!.lp!.commitments.some((x) => x.playerId === LP && x.kind === 'player'),
    ).toBe(false);
  });

  it('the GP can reject a sale; nothing changes hands', () => {
    let w = setup(67);
    const t = target(w) * 3;
    const r = run(w, GP, launchCmd(t));
    const fundId = r.result.fundId as string;
    w = closed(r.world, GP, fundId, Math.round(t * 0.4));
    const before = w.funds[fundId]!.lp!.commitments.map((x) => ({ ...x }));
    const s = run(w, LP, { type: 'stake.sell', fundId });
    w = run(s.world, GP, {
      type: 'stake.consent',
      offerId: s.result.offerId,
      approve: false,
    }).world;
    expect(w.stakeOffers![s.result.offerId]!.status).toBe('rejected');
    expect(w.funds[fundId]!.lp!.commitments).toEqual(before);
    expect(playerView(w, LP)!.familyOffice!.mySales[0]!.status).toBe('rejected');
  });

  it('an investor sells part of a private stake to an outside buyer, with the board’s consent', () => {
    let w = setup(66);
    const c = Object.values(w.companies).find(
      (x) => x.ai && x.market === 'lagos' && x.status === 'active' && !x.ipo,
    )!;
    w = produce(w, (d) => {
      const co = d.companies[c.id]!;
      const fd = Object.values(co.capTable.holdings).reduce((a, h) => a + h.shares, 0);
      co.capTable.holdings[LP] = { shares: Math.round(fd / 10), kind: 'investor' };
      co.capTable.lastPrice = 100;
      co.capTable.roundsRaised = Math.max(1, co.capTable.roundsRaised);
      d.positions[`${LP}:${c.id}`] = {
        investorId: LP,
        companyId: c.id,
        invested: 1_000_00,
        returned: 0,
        month: 0,
        writtenOff: false,
      };
      d.players[LP]!.career!.reached[2] = d.markets.lagos!.month;
    });
    const fo = playerView(w, LP)!.familyOffice!;
    expect(fo.secondaries.map((x) => x.companyId)).toContain(c.id);
    const r = tryRun(w, LP, { type: 'secondary.investorSell', companyId: c.id, pctBps: 5_000 });
    if (fo.secondaries.find((x) => x.companyId === c.id)!.boardOk) {
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.world.companies[c.id]!.capTable.holdings[`sec:${c.id}`]!.shares).toBeGreaterThan(
          0,
        );
        expect(r.world.positions[`${LP}:${c.id}`]!.returned).toBeGreaterThan(0);
      }
    } else expect(r.ok).toBe(false);
  });
});

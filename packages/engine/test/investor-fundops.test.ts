import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { INVESTOR } from '../src/data/investor.js';
import { fundMetrics, irr } from '../src/fundops.js';
import { nextStage } from '../src/helpers.js';
import { valueCompany } from '../src/valuation.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { GP, LP, launch, setup, target } from './investor-helpers.js';
import { addInvestor, negativeInternalAccounts, run, settle, tryRun } from './helpers.js';

/** A fund past its first close, every call paid, ready to invest. */
function closedFund(seed = 41) {
  let w = setup(seed);
  const t = target(w) * 3;
  const l = launch(w, t);
  w = l.world;
  w = run(w, LP, { type: 'lp.commit', fundId: l.fundId, amount: Math.round(t * 0.4) }).world;
  w = run(w, GP, { type: 'fund.close', fundId: l.fundId }).world;
  for (const id of [LP, GP])
    for (const c of playerView(w, id)!.lpFunds!.calls)
      w = run(w, id, { type: 'lp.pay', callId: c.id }).world;
  // Later calls are paid as they fall due.
  w = run(w, LP, { type: 'lp.autopay', fundId: l.fundId, on: true }).world;
  return { world: w, fundId: l.fundId };
}

const aiStartup = (w: World) =>
  Object.values(w.companies).find(
    (x) => x.ai && x.market === 'lagos' && x.status === 'active' && !x.ipo && !x.lastRound,
  )!;

describe('fund metrics (§8.7)', () => {
  it('IRR from known cash flows', () => {
    // 100 in, 121 back a year later: 21% a year.
    expect(irr([{ month: 0, amount: -100 }], 12, 121)).toBeCloseTo(0.21, 2);
    expect(irr([], 12, 100)).toBeNull();
  });

  it('NAV, paid-in, TVPI and DPI after the first close', () => {
    const { world: w, fundId } = closedFund();
    const m = fundMetrics(w, w.funds[fundId]!);
    expect(m.paidIn).toBeGreaterThan(0);
    expect(m.nav).toBe(m.cash);
    expect(m.dpi).toBe(0);
    expect(m.tvpi).toBeCloseTo(m.nav / m.paidIn, 2);
  });
});

describe('reserves and the investment committee (§8.3)', () => {
  it('blocks a new cheque bigger than dry powder; IC approval above the threshold', () => {
    const r0 = closedFund(42);
    let w = r0.world;
    const fundId = r0.fundId;
    const c = aiStartup(w);
    // The fund's thesis covers the company's sector.
    w = produce(w, (d) => {
      d.funds[fundId]!.sectors = [c.industry];
    });
    const f = w.funds[fundId]!;
    const model = valueCompany(w, c, nextStage(c.lastRound)).value;
    const ic = Math.round(f.size * INVESTOR.fund.icShare);
    const amount = Math.min(Math.round(model * 0.25), ic * 2);
    expect(amount).toBeGreaterThan(ic);
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
    if (!r1.ok) expect(r1.error.code).toBe('fund.ic');
    // No diligence yet: the advisers say no, with reasons.
    const no = run(w, GP, { type: 'fund.ic', fundId, companyId: c.id, amount });
    expect(no.result.status).toBe('rejected');
    expect(no.result.reasons.join(' ')).toMatch(/diligence/);
    w = run(no.world, GP, { type: 'invest.diligence', companyId: c.id, depth: 1 }).world;
    w = produce(w, (d) => {
      d.companies[c.id]!.stars.value = 3;
    });
    const yes = run(w, GP, { type: 'fund.ic', fundId, companyId: c.id, amount });
    expect(yes.result.status).toBe('approved');
    w = yes.world;
    // Earmark nearly all the cash as reserves elsewhere: no dry powder for a new deal.
    const other = Object.values(w.companies).find(
      (x) => x.market === 'lagos' && x.status === 'active' && x.id !== c.id,
    )!;
    w = produce(w, (d) => {
      d.positions[`${fundId}:${other.id}`] = {
        investorId: fundId,
        companyId: other.id,
        invested: 1,
        returned: 0,
        month: 0,
        writtenOff: false,
      };
    });
    const cash = w.accounts[w.funds[fundId]!.account]!.balance;
    w = run(w, GP, { type: 'fund.reserve', fundId, companyId: other.id, amount: cash - 1 }).world;
    const r2 = propose(w);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('fund.dryPowder');
    w = run(w, GP, { type: 'fund.reserve', fundId, companyId: other.id, amount: 0 }).world;
    const r3 = propose(w);
    expect(r3.ok).toBe(true);
  });
});

describe('LP letters, trust and re-ups (§8.3, §10.3)', () => {
  it('a letter is due each quarter; honest letters build trust, missed ones cost it', () => {
    const r0 = closedFund(43);
    let w = r0.world;
    const fundId = r0.fundId;
    w = settle(w, 'lagos', 3);
    expect(playerView(w, GP)!.lpFunds!.gp[0]!.ops!.letterDue).toBe(true);
    const trust0 = playerView(w, GP)!.lpFunds!.gp[0]!.ops!.relations[0]!.trust;
    w = run(w, GP, { type: 'fund.letter', fundId, honest: true }).world;
    const trust1 = playerView(w, GP)!.lpFunds!.gp[0]!.ops!.relations[0]!.trust;
    expect(trust1).toBeGreaterThan(trust0);
    expect((w.inbox[LP] ?? []).some((i) => i.text.includes('quarterly letter'))).toBe(true);
    // Skip the next quarter's letter.
    w = settle(w, 'lagos', 6);
    const trust2 = playerView(w, GP)!.lpFunds!.gp[0]!.ops!.relations[0]!.trust;
    expect(trust2).toBeLessThan(trust1);
  });

  it('LPs who trust the GP and see returns say they would re-up; the ladder counts them', () => {
    const r0 = closedFund(44);
    let w = r0.world;
    const fundId = r0.fundId;
    w = produce(w, (d) => {
      const f = d.funds[fundId]!;
      for (const c of f.lp!.commitments)
        f.lp!.relations[c.id] = { trust: 0.95, reup: false, letters: 4 };
      // Paper gains: the fund's cash doubles (as if marks rose).
      d.accounts[f.account]!.balance *= 2;
      d.accounts[d.markets.lagos!.ext.genesis]!.balance -= d.accounts[f.account]!.balance / 2;
    });
    w = settle(w, 'lagos', 12);
    const ops = playerView(w, GP)!.lpFunds!.gp[0]!.ops!;
    expect(ops.reups).toBeGreaterThanOrEqual(2);
    const rung5 = playerView(w, GP)!.investorCareer!.rungs.find((r) => r.n === 5)!;
    expect(rung5.requirements.find((r) => r.id === 'reups')!.have).toBeGreaterThanOrEqual(2);
  });
});

describe('fund life (§8.3)', () => {
  it('harvest after the investment period: follow-ons only, the fee steps down', () => {
    const r0 = closedFund(45);
    let w = r0.world;
    const fundId = r0.fundId;
    w = settle(w, 'lagos', INVESTOR.fund.investMonths);
    const f = w.funds[fundId]!;
    expect(f.lp!.stage).toBe('harvest');
    expect(playerView(w, GP)!.lpFunds!.gp[0]!.ops!.feeRate).toBe(f.lp!.terms.feeStepDown);
    const c = aiStartup(w);
    const r = tryRun(w, GP, {
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
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/follow-ons only/);
  });

  it('winds down at the end of its term, distributing its cash to LPs', () => {
    const r0 = closedFund(46);
    let w = r0.world;
    const fundId = r0.fundId;
    const lpCash = w.accounts[w.players[LP]!.accounts.local]!.balance;
    w = settle(w, 'lagos', INVESTOR.fund.termMonths);
    const f = w.funds[fundId]!;
    expect(f.lp!.stage).toBe('wound-down');
    expect(w.accounts[f.account]!.balance).toBe(0);
    expect(w.accounts[w.players[LP]!.accounts.local]!.balance).toBeGreaterThan(lpCash);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('LPs who trust the GP vote an extension', () => {
    const r0 = closedFund(47);
    let w = r0.world;
    const fundId = r0.fundId;
    w = run(w, GP, { type: 'fund.extend', fundId }).world;
    w = produce(w, (d) => {
      const f = d.funds[fundId]!;
      for (const c of f.lp!.commitments)
        f.lp!.relations[c.id] = { trust: 0.9, reup: false, letters: 0 };
      f.lp!.terms.termMonths = 2;
      f.lp!.terms.investMonths = 1;
    });
    w = settle(w, 'lagos', 2);
    const f = w.funds[fundId]!;
    expect(f.lp!.stage).toBe('extended');
    expect(f.lp!.terms.termMonths).toBe(2 + INVESTOR.fund.extensionMonths);
  });
});

describe('pro-rata and marks (§6.5)', () => {
  it('a holder with pro-rata is offered their share when the company raises again', () => {
    let w = addInvestor(setup(48), 'u_second');
    w = run(w, 'u_second', { type: 'investor.tutorial', action: 'skip' }).world;
    const c = aiStartup(w);
    const model = valueCompany(w, c, nextStage(c.lastRound)).value;
    const cap = playerView(w, LP)!.investorCareer!.ceiling.maxCheque;
    const first = Math.min(cap, Math.round(model * 0.05));
    w = run(w, LP, {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount: first,
      valuation: model + first,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    }).world;
    expect(w.positions[`${LP}:${c.id}`]!.proRata).toBe(true);
    const capB = playerView(w, 'u_second')!.investorCareer!.ceiling.maxCheque;
    // The next round is a later stage: the model values it afresh.
    const c2 = w.companies[c.id]!;
    const model2 = valueCompany(w, c2, nextStage(c2.lastRound)).value;
    const second = Math.min(capB, Math.round(model2 * 0.05));
    w = run(w, 'u_second', {
      type: 'invest.propose',
      companyId: c.id,
      instrument: 'safe',
      amount: second,
      valuation: model2 + second,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
    }).world;
    const offers = playerView(w, LP)!.prorata;
    expect(offers).toHaveLength(1);
    const before = w.positions[`${LP}:${c.id}`]!.invested;
    w = run(w, LP, { type: 'prorata.answer', offerId: offers[0]!.id, take: true }).world;
    expect(w.positions[`${LP}:${c.id}`]!.invested).toBe(before + offers[0]!.amount);
    expect(w.players[LP]!.milestones['investor.first-follow-on']).toBeDefined();
    // Marks are recorded for investors' positions at month end.
    w = settle(w, 'lagos', 1);
    expect(w.positions[`${LP}:${c.id}`]!.marks!.length).toBe(1);
    const p = playerView(w, LP)!.portfolio.find((x) => x.companyId === c.id)!;
    expect(p.history).toHaveLength(1);
    expect(p.moic).toBeGreaterThan(0);
  });
});

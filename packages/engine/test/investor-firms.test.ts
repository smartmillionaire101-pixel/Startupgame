import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { listedIn } from '../src/exchange.js';
import { payCarry } from '../src/lpfunds.js';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import { GP, LP, setup, target } from './investor-helpers.js';
import { moneyByCurrency, negativeInternalAccounts, run, settle, tryRun } from './helpers.js';

function launchCmd(t: number, strategy: 'seed' | 'public' = 'seed'): Command {
  return {
    type: 'fund.launch',
    sectors: ['fintech'],
    stages: ['seed'],
    checkSize: Math.round(t / 40),
    why: 'Payment rails for traders across West Africa',
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

/** A GP with a closed fund (LP commits 40%, anchor a third), calls paid. */
function withFund(seed: number, strategy: 'seed' | 'public' = 'seed') {
  let w = setup(seed);
  const t = target(w) * 3;
  const r = run(w, GP, launchCmd(t, strategy));
  const fundId = r.result.fundId as string;
  w = run(r.world, LP, { type: 'lp.commit', fundId, amount: Math.round(t * 0.4) }).world;
  w = run(w, GP, { type: 'fund.close', fundId }).world;
  for (const id of [LP, GP])
    for (const c of playerView(w, id)!.lpFunds!.calls)
      w = run(w, id, { type: 'lp.pay', callId: c.id }).world;
  w = run(w, LP, { type: 'lp.autopay', fundId, on: true }).world;
  w = run(w, GP, { type: 'lp.autopay', fundId, on: true }).world;
  return { world: w, fundId };
}

describe('the firm (Phase 6)', () => {
  it('needs a fund first', () => {
    const w = setup(51);
    const r = tryRun(w, GP, { type: 'firm.found', name: 'Ike Partners' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('firm.rung');
  });

  it('collects fees from its funds, pays its team, and the head takes the rest', () => {
    const f0 = withFund(52);
    let w = run(f0.world, GP, { type: 'firm.found', name: 'Ike Partners' }).world;
    expect(w.funds[f0.fundId]!.firmId).toBeTruthy();
    w = run(w, GP, { type: 'firm.hire', title: 'associate' }).world;
    const firm = playerView(w, GP)!.firm!.firm!;
    expect(firm.members).toHaveLength(1);
    const hours0 = w.players[GP]!.hours.available;
    const cash0 = w.accounts[w.players[GP]!.accounts.local]!.balance;
    const before = moneyByCurrency(w);
    w = settle(w, 'lagos', 1);
    // Fees reached the firm, salaries went out, the rest to the head; the account is empty.
    const after = playerView(w, GP)!.firm!.firm!;
    expect(after.cash).toBe(0);
    expect(w.funds[f0.fundId]!.lp!.feesPaid).toBeGreaterThan(0);
    expect(w.accounts[w.players[GP]!.accounts.local]!.balance).not.toBe(cash0);
    // The associate adds hours to the head.
    expect(w.players[GP]!.hours.available).toBeGreaterThanOrEqual(hours0);
    // Rung 6 counts the hire.
    const rung6 = playerView(w, GP)!.investorCareer!.rungs.find((r) => r.n === 6)!;
    expect(rung6.requirements.find((r) => r.id === 'hires')!.have).toBe(1);
    expect(negativeInternalAccounts(w)).toEqual([]);
    void before;
  });

  it('splits carry by the pool: AI partners paid out, human partners and the head taxed', () => {
    const f0 = withFund(53);
    let w = run(f0.world, GP, { type: 'firm.found', name: 'Ike Partners' }).world;
    w = run(w, GP, { type: 'firm.hire', title: 'partner' }).world;
    w = run(w, GP, { type: 'firm.invite', playerId: LP, carryShare: 0.2 }).world;
    expect(playerView(w, LP)!.firm!.invites).toHaveLength(1);
    const firmId = playerView(w, GP)!.firm!.firm!.id;
    w = run(w, LP, { type: 'firm.answer', firmId, accept: true }).world;
    const lpCash = w.accounts[w.players[LP]!.accounts.local]!.balance;
    const gpCash = w.accounts[w.players[GP]!.accounts.local]!.balance;
    const carry = 10_000_000_00;
    const out = produce(w, (d) => {
      const f = d.funds[f0.fundId]!;
      d.accounts[f.account]!.balance += carry;
      d.accounts[d.markets.lagos!.ext.lps]!.balance -= carry;
      payCarry(d as World, f, d.players[GP]!, carry, d.markets.lagos!.month);
    });
    const rate = out.markets.lagos!.data.tax.capitalGains;
    const lpShare = Math.round(carry * 0.2);
    expect(out.accounts[out.players[LP]!.accounts.local]!.balance - lpCash).toBe(
      lpShare - Math.round(lpShare * rate),
    );
    // The AI partner takes their share (half the usual partner carry), the head the rest.
    const ai = Math.round(carry * 0.1);
    const head = carry - lpShare - ai;
    expect(out.accounts[out.players[GP]!.accounts.local]!.balance - gpCash).toBe(
      head - Math.round(head * rate),
    );
    expect(negativeInternalAccounts(out)).toEqual([]);
  });

  it('a partner who asks for more carry and hears no leaves, and key-person LPs worry', () => {
    const f0 = withFund(54);
    let w = run(f0.world, GP, { type: 'firm.found', name: 'Ike Partners' }).world;
    const h = run(w, GP, { type: 'firm.hire', title: 'partner' });
    w = produce(h.world, (d) => {
      const firm = Object.values(d.firms!)[0]!;
      firm.members[0]!.ask = { carryShare: 0.15, month: d.markets.lagos!.month };
    });
    const trust0 = Object.values(w.funds[f0.fundId]!.lp!.relations).map((r) => r.trust);
    w = run(w, GP, { type: 'firm.carryAsk', memberId: h.result.memberId, accept: false }).world;
    expect(Object.values(w.firms!)[0]!.members[0]!.status).toBe('left');
    const trust1 = Object.values(w.funds[f0.fundId]!.lp!.relations).map((r) => r.trust);
    if (trust0.length) expect(trust1[0]!).toBeLessThan(trust0[0]!);
  });

  it('hands over to a human partner, who runs the funds; the founder keeps a carry share', () => {
    const f0 = withFund(55);
    let w = run(f0.world, GP, { type: 'firm.found', name: 'Ike Partners' }).world;
    w = run(w, GP, { type: 'firm.invite', playerId: LP, carryShare: 0.1 }).world;
    const firm = playerView(w, GP)!.firm!.firm!;
    w = run(w, LP, { type: 'firm.answer', firmId: firm.id, accept: true }).world;
    const memberId = playerView(w, GP)!.firm!.firm!.members.find((m) => !m.ai)!.id;
    w = run(w, GP, { type: 'firm.succession', memberId, founderCarry: 0.25 }).world;
    expect(w.funds[f0.fundId]!.managerId).toBe(LP);
    expect(w.players[GP]!.milestones['investor.succession']).toBeDefined();
    expect(playerView(w, LP)!.firm!.firm!.isHead).toBe(true);
  });

  it('Fund II needs rung 5, and its size follows the last fund and the firm’s stars', () => {
    const f0 = withFund(56);
    let w = f0.world;
    const t = w.funds[f0.fundId]!.size * 10;
    const r1 = tryRun(w, GP, launchCmd(t));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('fund.rung');
    w = produce(w, (d) => {
      d.players[GP]!.career!.reached[5] = d.markets.lagos!.month;
    });
    const r2 = tryRun(w, GP, launchCmd(t));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('fund.size');
    const cap = playerView(w, GP)!.firm!.nextFundCap!;
    const r3 = run(w, GP, launchCmd(cap));
    expect(r3.world.funds[r3.result.fundId]!.lp!.number).toBe(2);
    expect(r3.world.funds[r3.result.fundId]!.name).toMatch(/Fund II$/);
  });

  it('a crossover fund buys and sells listed shares for its LPs', () => {
    const f0 = withFund(57, 'public');
    let w = f0.world;
    const before = moneyByCurrency(w);
    const c = listedIn(w, 'lagos')[0]!;
    const r = run(w, GP, {
      type: 'shares.buy',
      companyId: c.id,
      amount: Math.round(c.ipo!.price! * 40),
      fundId: f0.fundId,
    });
    w = r.world;
    expect(w.companies[c.id]!.capTable.holdings[f0.fundId]!.shares).toBe(r.result.shares);
    expect(w.positions[`${f0.fundId}:${c.id}`]!.invested).toBe(r.result.cost);
    w = run(w, GP, {
      type: 'shares.sell',
      companyId: c.id,
      pctBps: 10_000,
      fundId: f0.fundId,
    }).world;
    expect(w.companies[c.id]!.capTable.holdings[f0.fundId]!.shares).toBe(0);
    expect(w.funds[f0.fundId]!.distributed).toBeGreaterThan(0);
    expect(negativeInternalAccounts(w)).toEqual([]);
    void before;
    // A seed fund can't.
    const seed = withFund(58);
    const bad = tryRun(seed.world, GP, {
      type: 'shares.buy',
      companyId: listedIn(seed.world, 'lagos')[0]!.id,
      amount: 10_000_000,
      fundId: seed.fundId,
    });
    expect(bad.ok).toBe(false);
  });
});

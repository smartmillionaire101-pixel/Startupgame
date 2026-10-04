import { describe, expect, it } from 'vitest';
import { closePricedRound, fullyDiluted } from '../src/captable.js';
import { playerView } from '../src/views.js';
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

describe('travel (§14)', () => {
  it('costs money and hours, and unlocks cross-market investing in the other currency', () => {
    let w = addInvestor(makeWorld(31, ['lagos', 'nairobi']), 'u_inv', 'lagos');
    const target = Object.values(w.companies).find(
      (c) => c.ai && c.market === 'nairobi' && c.status === 'active',
    )!;
    const propose = {
      type: 'invest.propose' as const,
      companyId: target.id,
      instrument: 'safe' as const,
      amount: 100_000_00,
      valuation: 1_000_000_000_00,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
    };
    expect(tryRun(w, 'u_inv', propose).ok).toBe(false);
    expect(
      tryRun(w, 'u_inv', { type: 'invest.diligence', companyId: target.id, depth: 1 }).ok,
    ).toBe(false);

    const before = savings(w, 'u_inv');
    const hoursBefore = w.players.u_inv!.hours.used;
    const total = moneyByCurrency(w);
    w = run(w, 'u_inv', { type: 'player.travel', market: 'nairobi' }).world;
    expect(savings(w, 'u_inv')).toBeLessThan(before);
    expect(w.players.u_inv!.hours.used - hoursBefore).toBe(40);
    // Nairobi companies now appear in deal flow, priced in shillings.
    const listing = playerView(w, 'u_inv')!.directory.find((c) => c.id === target.id)!;
    expect(listing.currency).toBe('KES');

    // Cross-border diligence costs 1.5x hours.
    const h = w.players.u_inv!.hours.used;
    w = run(w, 'u_inv', { type: 'invest.diligence', companyId: target.id, depth: 1 }).world;
    expect(w.players.u_inv!.hours.used - h).toBe(6);

    const r = run(w, 'u_inv', propose);
    w = r.world;
    expect(r.result.status).toBe('accepted');
    // The company received exactly KSh100k; the investor paid naira including the FX fee.
    expect(w.positions[`u_inv:${target.id}`]?.invested).toBe(100_000_00);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('lets a founder pitch another market’s investors only while visiting', () => {
    let w = addFounder(makeWorld(32, ['lagos', 'nairobi', 'london']));
    const c = companyOf(w, 'u_founder');
    // A London trip costs more than a Lagos founder's starting savings.
    expect(tryRun(w, 'u_founder', { type: 'player.travel', market: 'london' }).ok).toBe(false);
    const fund = Object.values(w.funds).find(
      (f) => f.market === 'nairobi' && f.stages.includes('pre-seed'),
    )!;
    const pitch = {
      type: 'pitch.start' as const,
      companyId: c.id,
      fundId: fund.id,
      slides: ['product'],
      ask: 10_000_000_00,
    };
    expect(tryRun(w, 'u_founder', pitch).ok).toBe(false);
    w = run(w, 'u_founder', { type: 'player.travel', market: 'nairobi' }).world;
    expect(tryRun(w, 'u_founder', pitch).ok).toBe(true);
  });
});

describe('relocation (§14)', () => {
  it('costs half of everything, which goes to the old central bank, and an AI CEO takes over', () => {
    let w = addFounder(makeWorld(33, ['lagos', 'nairobi']));
    const c = companyOf(w, 'u_founder');
    w = structuredClone(w);
    closePricedRound(w.companies[c.id]!.capTable, {
      investorId: 'vc_x',
      amount: 10_000_000_00,
      preMoney: 90_000_000_00,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    const sharesBefore = w.companies[c.id]!.capTable.holdings.u_founder!.shares;
    const cashBefore = savings(w, 'u_founder');
    const fd = fullyDiluted(w.companies[c.id]!.capTable);
    const total = moneyByCurrency(w);

    w = run(w, 'u_founder', { type: 'player.relocate', market: 'nairobi' }).world;
    const p = w.players.u_founder!;
    expect(p.market).toBe('nairobi');
    expect(w.accounts[p.accounts.local]!.currency).toBe('KES');
    // Half the naira went to the Lagos central bank; the rest arrived as shillings.
    expect(w.accounts[p.accounts.local]!.balance).toBeGreaterThan(0);
    expect(w.accounts[p.accounts.local]!.balance).toBeLessThan((cashBefore / 2 / 1530) * 129.2 + 1);
    const ct = w.companies[c.id]!.capTable;
    expect(ct.holdings.u_founder!.shares).toBe(sharesBefore - Math.floor(sharesBefore / 2));
    expect(ct.holdings['cb:lagos']!.shares).toBe(Math.floor(sharesBefore / 2));
    expect(fullyDiluted(ct)).toBe(fd);
    expect(w.companies[c.id]!.founderIds).toEqual([]);
    expect(w.companies[c.id]!.aiCeo).toBe(true);
    expect(moneyByCurrency(w)).toEqual(total);

    // The company keeps running under its AI CEO; money stays conserved.
    const t2 = moneyByCurrency(w);
    w = settle(w, 'lagos', 4, T0 + DAY);
    expect(moneyByCurrency(w)).toEqual(t2);
    expect(negativeInternalAccounts(w)).toEqual([]);
    expect(w.companies[c.id]!.finance.history.length).toBeGreaterThan(0);
  });

  it('refuses while personal loans are outstanding', () => {
    let w = addFounder(makeWorld(34, ['lagos', 'nairobi']));
    const req = run(w, 'u_founder', { type: 'player.loan', amount: 100_000_00, months: 6 });
    w = run(req.world, 'u_founder', {
      type: 'deal.act',
      dealId: req.result.dealId,
      action: 'accept',
    }).world;
    const r = tryRun(w, 'u_founder', { type: 'player.relocate', market: 'nairobi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('relocate.loans');
  });

  it('pays dividends from a profitable AI-CEO company to holders in other currencies', async () => {
    let w = addFounder(makeWorld(35, ['lagos', 'nairobi']));
    const c = companyOf(w, 'u_founder');
    w = run(w, 'u_founder', { type: 'player.relocate', market: 'nairobi' }).world;
    // Force a profitable month.
    w = structuredClone(w);
    w.companies[c.id]!.finance.history.push({
      month: 1,
      revenue: 10_000_000_00,
      playerRevenue: 0,
      suppliers: 0,
      payroll: 0,
      founderSalary: 0,
      office: 0,
      marketing: 0,
      cloud: 0,
      compliance: 0,
      interest: 0,
      tax: 0,
      net: 4_000_000_00,
      cashEnd: 0,
      customers: 10,
    });
    w.accounts[c.account]!.balance += 10_000_000_00;
    w.accounts['ext:lagos:customers']!.balance -= 10_000_000_00;
    const before = savings(w, 'u_founder');
    const { payDividends } = await import('../src/travel.js');
    payDividends(w, w.companies[c.id]!, 1);
    expect(savings(w, 'u_founder')).toBeGreaterThan(before);
    expect(w.accounts['ext:lagos:tax']!.balance).toBeGreaterThan(0);
  });
});

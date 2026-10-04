import { describe, expect, it } from 'vitest';
import { CAPITAL } from '../src/data/capital.js';
import { AI_BANKS } from '../src/data/fiction.js';
import { MARKET_IDS } from '../src/data/markets.js';
import type { MarketId } from '../src/data/markets.js';
import { checkName } from '../src/names.js';
import { upgradeWorld, CURRENT_SCHEMA } from '../src/upgrade.js';
import { playerView } from '../src/views.js';
import { createWorld } from '../src/world.js';
import type { MonthlyPnl, World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  makeWorld,
  moneyByCurrency,
  run,
  settle,
  T0,
  tryRun,
} from './helpers.js';

const allMarkets = () => {
  let w = createWorld({ seed: 9, now: T0, aiStartupsPerMarket: 1 });
  for (const id of MARKET_IDS)
    if (!w.markets[id]) w = run(w, null, { type: 'market.open', market: id }).world;
  return w;
};

/** Fund depth in USD: total of top cheques across a market's AI funds. */
const depthUsd = (w: World, id: MarketId) =>
  Object.values(w.funds)
    .filter((f) => f.market === id && f.ai)
    .reduce((a, f) => a + f.check[1] / w.markets[id]!.data.unitsPerUsd, 0);
const fundCount = (w: World, id: MarketId) =>
  Object.values(w.funds).filter((f) => f.market === id).length;

/** Make a company look established: months of trading, last month's revenue, stars. */
function establish(world: World, playerId: string, months: number, revenue: number, stars = 2) {
  const w = structuredClone(world);
  const c = companyOf(w, playerId);
  const m = w.markets[c.market]!;
  c.foundedMonth = m.month - months;
  c.stars.value = stars;
  const pnl: MonthlyPnl = {
    month: m.month,
    revenue,
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
    net: 0,
    cashEnd: 0,
    customers: 1,
  };
  c.finance.history.push(pnl);
  return w;
}

describe('capital that mirrors each market (Wave 1 §A)', () => {
  it('profiles every market; the first high-street lender keeps the old bank name', () => {
    for (const id of MARKET_IDS) {
      const p = CAPITAL[id];
      expect(p.lenders.length).toBeGreaterThanOrEqual(2);
      expect(p.sources.length).toBeGreaterThan(0);
      expect(p.lenders.find((l) => l.kind === 'high-street')!.name).toBe(AI_BANKS[id]);
      for (const l of p.lenders) {
        expect(new Set(l.products.map((x) => x.id)).size).toBe(l.products.length);
        for (const x of l.products) {
          expect(x.amountUsd[0]).toBeLessThan(x.amountUsd[1]);
          if (x.kind === 'revenue-based') expect(x.revenueShareBps && x.repayCapBps).toBeTruthy();
        }
      }
    }
    expect(CAPITAL.london.lenders.length).toBeGreaterThanOrEqual(6);
    expect(CAPITAL.london.lenders.length).toBeGreaterThan(CAPITAL.lagos.lenders.length);
    expect(CAPITAL.lagos.lenders.length).toBeGreaterThan(CAPITAL.freetown.lenders.length);
    expect(CAPITAL.london.schemes.map((s) => s.name)).toEqual(['SEIS', 'EIS']);
  });

  it('reserves lender and fund names so players cannot impersonate them', () => {
    const w = makeWorld(3, ['london']);
    const taken = w.names.london!;
    expect(checkName('Kestrel Bank', { taken }).ok).toBe(false);
    expect(checkName('Tideline Revenue Capital', { taken }).ok).toBe(false);
    expect(checkName('Barrowgate Angels', { taken }).ok).toBe(false);
  });

  it('fund depth follows the market: London > Lagos and Nairobi > Freetown', () => {
    const w = allMarkets();
    expect(fundCount(w, 'london')).toBeGreaterThan(fundCount(w, 'lagos'));
    expect(fundCount(w, 'london')).toBeGreaterThan(fundCount(w, 'nairobi'));
    expect(fundCount(w, 'lagos')).toBeGreaterThan(fundCount(w, 'freetown'));
    expect(fundCount(w, 'nairobi')).toBeGreaterThan(fundCount(w, 'freetown'));
    expect(depthUsd(w, 'london')).toBeGreaterThan(depthUsd(w, 'lagos') * 2);
    expect(depthUsd(w, 'lagos')).toBeGreaterThan(depthUsd(w, 'freetown'));
    expect(depthUsd(w, 'nairobi')).toBeGreaterThan(depthUsd(w, 'freetown'));
    // London has angel networks beyond the base six funds.
    expect(
      Object.values(w.funds).filter((f) => f.market === 'london' && /Angel/.test(f.name)),
    ).toHaveLength(3);
    for (const total of Object.values(moneyByCurrency(w))) expect(total).toBe(0);
  });

  it('declines on a deal card with the specific reason', () => {
    let w = addFounder(makeWorld(5, ['lagos']));
    const c = companyOf(w, 'u_founder');
    const r = run(w, 'u_founder', {
      type: 'company.loan',
      companyId: c.id,
      lenderId: 'eko-union',
      productId: 'working-capital',
      amount: 1_000_000_00,
      months: 12,
      personalGuarantee: false,
    });
    w = r.world;
    expect(r.result.declined).toBe(true);
    expect(r.result.reason).toBe('We lend from 12 months of trading. You have 0.');
    const d = w.deals[r.result.dealId]!;
    expect(d.status).toBe('declined');
    expect(d.history.at(-1)!.summary).toContain('Eko Union Bank');
    // The same reason is on the counter before applying.
    const view = playerView(w, 'u_founder')!;
    const product = view.market.lenders
      .find((l) => l.id === 'eko-union')!
      .products.find((p) => p.id === 'working-capital')!;
    expect(product.you).toEqual({
      eligible: false,
      reason: 'We lend from 12 months of trading. You have 0.',
      maxMinor: 0,
      companyId: c.id,
    });
    // Revenue and stars are checked too, in plain words.
    const est = establish(w, 'u_founder', 14, 1_000_00, 2);
    const low = run(est, 'u_founder', {
      type: 'company.loan',
      companyId: c.id,
      lenderId: 'eko-union',
      productId: 'working-capital',
      amount: 1_000_000_00,
      months: 12,
      personalGuarantee: true,
    });
    expect(low.result.reason).toMatch(
      /^We need ₦.* a month in revenue\. You made ₦1,000 last month\.$/,
    );
    // A founder product can't be taken as a company.
    expect(
      tryRun(w, 'u_founder', {
        type: 'company.loan',
        companyId: c.id,
        lenderId: 'delta-enterprise',
        productId: 'youth-loan',
        amount: 100_000_00,
        months: 12,
        personalGuarantee: false,
      }).ok,
    ).toBe(false);
  });

  it('counters with a smaller amount and a personal guarantee when the product needs one', () => {
    let w = addFounder(makeWorld(5, ['london']), 'u_founder', 'london');
    w = establish(w, 'u_founder', 18, 5_000_000, 2.5);
    const c = companyOf(w, 'u_founder');
    const r = run(w, 'u_founder', {
      type: 'company.loan',
      companyId: c.id,
      lenderId: 'thamesgate',
      productId: 'working-capital',
      amount: 1_000_000_000,
      months: 24,
      personalGuarantee: false,
    });
    expect(r.result.declined).toBe(false);
    const d = r.world.deals[r.result.dealId]!;
    expect(d.terms.kind).toBe('loan');
    if (d.terms.kind !== 'loan') return;
    expect(d.terms.personalGuarantee).toBe(true);
    expect(d.terms.amount).toBe(r.result.maxMinor);
    expect(d.terms.amount).toBeLessThan(1_000_000_000);
    expect(d.terms.rateBps).toBe(w.markets.london!.data.baseRateBps + 400);
    expect(r.result.message).toMatch(/personal guarantee/);
    expect(d.proposer).toEqual({ kind: 'bank', id: 'london', lenderId: 'thamesgate' });
    const before = moneyByCurrency(r.world);
    const acc = run(r.world, 'u_founder', { type: 'deal.act', dealId: d.id, action: 'accept' });
    const loan = companyOf(acc.world, 'u_founder').finance.loans[0]!;
    expect(loan.lender).toBe('Thamesgate Bank');
    expect(loan.lenderId).toBe('thamesgate');
    expect(loan.personalGuarantee).toBe('u_founder');
    expect(moneyByCurrency(acc.world)).toEqual(before);
  });

  it('meets a counter for more at its limit, keeping its rate and guarantee', () => {
    let w = addFounder(makeWorld(5, ['london']), 'u_founder', 'london');
    w = establish(w, 'u_founder', 18, 5_000_000, 2.5);
    const c = companyOf(w, 'u_founder');
    const r = run(w, 'u_founder', {
      type: 'company.loan',
      companyId: c.id,
      lenderId: 'thamesgate',
      productId: 'working-capital',
      amount: 5_000_000,
      months: 24,
      personalGuarantee: true,
    });
    const offered = r.world.deals[r.result.dealId]!.terms;
    const ctr = run(r.world, 'u_founder', {
      type: 'deal.act',
      dealId: r.result.dealId,
      action: 'counter',
      terms: { amount: 1_000_000_000 },
    });
    const d = ctr.world.deals[r.result.dealId]!;
    expect(d.status).toBe('open');
    expect(d.terms).toMatchObject({
      amount: r.result.maxMinor,
      rateBps: offered.kind === 'loan' ? offered.rateBps : -1,
      personalGuarantee: true,
    });
  });

  it('a Start Up Loan funds a pre-revenue founder in London', () => {
    let w = addFounder(makeWorld(8, ['london']), 'u_founder', 'london');
    const view = playerView(w, 'u_founder')!;
    const sul = view.market.lenders.find((l) => l.kind === 'government')!;
    const product = sul.products.find((p) => p.kind === 'startup-loan')!;
    expect(product.borrower).toBe('founder');
    expect(product.rateBps).toBe(600);
    expect(product.you.eligible).toBe(true);
    expect(product.you.reason).toBeNull();
    expect(product.you.maxMinor).toBeGreaterThanOrEqual(product.amount[0]);
    const ask = Math.min(product.you.maxMinor, 1_000_000);
    const before = moneyByCurrency(w);
    const savings = w.accounts[w.players.u_founder!.accounts.local]!.balance;
    const r = run(w, 'u_founder', {
      type: 'player.loan',
      lenderId: sul.id,
      productId: product.id,
      amount: ask,
      months: 36,
    });
    expect(r.result.declined).toBe(false);
    w = run(r.world, 'u_founder', {
      type: 'deal.act',
      dealId: r.result.dealId,
      action: 'accept',
    }).world;
    expect(w.accounts[w.players.u_founder!.accounts.local]!.balance - savings).toBe(ask);
    const loan = w.players.u_founder!.loans[0]!;
    expect(loan).toMatchObject({
      lender: 'Founders Start Up Loans',
      lenderId: 'start-up-loans',
      productId: 'start-up-loan',
      rateBps: 600,
      monthsLeft: 36,
    });
    expect(moneyByCurrency(w)).toEqual(before);
    // One per founder.
    const again = playerView(w, 'u_founder')!
      .market.lenders.find((l) => l.id === sul.id)!
      .products.find((p) => p.id === product.id)!;
    expect(again.you.eligible).toBe(false);
    expect(again.you.reason).toMatch(/already have/);
    // Repayments go out monthly at the fixed rate.
    w = settle(w, 'london', 1);
    expect(w.players.u_founder!.loans[0]!.outstanding).toBeLessThan(ask);
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('revenue-based finance repays a share of each month’s revenue up to the cap', () => {
    let w = addFounder(makeWorld(11, ['london']), 'u_founder', 'london');
    w = establish(w, 'u_founder', 8, 5_000_000, 2);
    const c = companyOf(w, 'u_founder');
    const r = run(w, 'u_founder', {
      type: 'company.loan',
      companyId: c.id,
      lenderId: 'tideline',
      productId: 'revenue-based',
      amount: 10_000_000,
      months: 12,
      personalGuarantee: false,
    });
    const d = r.world.deals[r.result.dealId]!;
    expect(d.summary).toMatch(/8% of each month’s revenue/);
    const before = moneyByCurrency(r.world);
    w = run(r.world, 'u_founder', { type: 'deal.act', dealId: d.id, action: 'accept' }).world;
    const loan = companyOf(w, 'u_founder').finance.loans[0]!;
    expect(loan.outstanding).toBe(11_000_000);
    expect(loan.revenueShareBps).toBe(800);
    w = settle(w, 'london', 1);
    const after = companyOf(w, 'u_founder');
    const pnl = after.finance.history.at(-1)!;
    expect(pnl.revenue).toBeGreaterThan(0);
    const repaid = 11_000_000 - after.finance.loans[0]!.outstanding;
    expect(repaid).toBe(Math.round((pnl.revenue * 800) / 10_000));
    expect(moneyByCurrency(w)).toEqual(before);
  });

  it('lender appetite tightens when the funding climate cools', () => {
    let w = makeWorld(4, ['london']);
    const base = w.markets.london!.lenders.kestrel!.appetite;
    const half = Object.fromEntries(
      Object.entries(w.markets.london!.multiples).map(([k, v]) => [k, v * 0.6]),
    );
    w = run(w, null, { type: 'market.data', market: 'london', multiples: half }).world;
    w = settle(w, 'london', 1);
    const now = w.markets.london!.lenders.kestrel!.appetite;
    expect(now).toBeLessThan(base);
    expect(now).toBeGreaterThanOrEqual(0.5);
  });

  it('the market view carries lenders, fund offices and the capital card', () => {
    const w = addFounder(makeWorld(2, ['london']), 'u_founder', 'london');
    const v = playerView(w, 'u_founder')!;
    expect(v.market.bankName).toBe('Albion & Weir Bank');
    expect(v.market.lenders.map((l) => l.id)).toEqual(CAPITAL.london.lenders.map((l) => l.id));
    for (const l of v.market.lenders) {
      expect(['tight', 'normal', 'loose']).toContain(l.appetite);
      expect(l.look.motif).toBeTruthy();
      for (const p of l.products) {
        expect(p.amount[0]).toBeLessThan(p.amount[1]);
        expect(Object.keys(p.you).sort()).toEqual(['companyId', 'eligible', 'maxMinor', 'reason']);
      }
    }
    for (const f of v.market.funds) {
      expect(['loft', 'tower', 'garden', 'shophouse', 'glass']).toContain(f.office.style);
      expect(f.office.floor).toBeGreaterThanOrEqual(1);
    }
    expect(playerView(w, 'u_founder')!.market.funds.map((f) => f.office)).toEqual(
      v.market.funds.map((f) => f.office),
    );
    expect(new Set(v.market.funds.map((f) => JSON.stringify(f.office))).size).toBeGreaterThan(3);
    expect(v.market.capital).toEqual({
      vcDepth: 1,
      angelDepth: 1,
      schemes: CAPITAL.london.schemes,
      sources: CAPITAL.london.sources,
    });
  });

  it('upgrades a v7 world: lenders and depth funds appear, money still sums to zero', () => {
    const w = structuredClone(makeWorld(6, ['lagos', 'london']));
    // Make it look like a v7 save: no lenders, no depth funds.
    for (const m of Object.values(w.markets)) delete (m as Partial<typeof m>).lenders;
    for (const f of Object.values(w.funds)) {
      if (!/^fund_(lagos|london)_/.test(f.id)) continue;
      const acc = w.accounts[f.account]!;
      w.accounts[w.markets[f.market]!.ext.lps]!.balance += acc.balance;
      delete w.accounts[f.account];
      delete w.funds[f.id];
    }
    for (const n of Object.keys(w.names.london!))
      if (n.includes('kestrel')) delete w.names.london![n];
    const before = fundCount(w, 'london');
    w.schemaVersion = 7;
    const up = upgradeWorld(w);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(CURRENT_SCHEMA).toBe(8);
    expect(Object.keys(up.markets.london!.lenders)).toContain('start-up-loans');
    expect(fundCount(up, 'london')).toBe(before + 5);
    expect(checkName('Kestrel Bank', { taken: up.names.london! }).ok).toBe(false);
    for (const total of Object.values(moneyByCurrency(up))) expect(total).toBe(0);
    // Upgrading twice changes nothing.
    expect(upgradeWorld(structuredClone(up))).toEqual(up);
  });
});

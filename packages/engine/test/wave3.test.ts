import { describe, expect, it } from 'vitest';
import { activeAngels, angelFundId, angelPlayerId, angelTarget } from '../src/angels.js';
import { CAPITAL } from '../src/data/capital.js';
import { AI_FUNDS, OUTLETS } from '../src/data/fiction.js';
import { MARKET_DATA, MARKET_IDS, WAVE3 } from '../src/data/markets.js';
import type { MarketId } from '../src/data/markets.js';
import { RULE_CARDS } from '../src/data/rules.js';
import { fxRate } from '../src/ledger.js';
import { playerView } from '../src/views.js';
import { createWorld } from '../src/world.js';
import type { World } from '../src/types.js';
import {
  addInvestor,
  companyOf,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  T0,
  tryRun,
} from './helpers.js';

const SF = 'san-francisco' as const;

const withSf = (seed = 11, markets: MarketId[] = ['london']): World => {
  const w = createWorld({ seed, now: T0, markets, aiStartupsPerMarket: 6 });
  return run(w, null, { type: 'market.open', market: SF }).world;
};

const addSfFounder = (w: World, id = 'u_sf'): World =>
  run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name: 'Sam Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: SF,
    company: {
      name: 'Fogline',
      industry: 'saas',
      revenueModel: 'subscription',
      idea: 'Scheduling software for clinics',
      incorporation: 'us',
    },
  }).world;

const balance = (w: World, accId: string) => w.accounts[accId]!.balance;
const zeroSums = (w: World) => {
  for (const [cur, total] of Object.entries(moneyByCurrency(w)))
    expect([cur, total]).toEqual([cur, 0]);
};

describe('San Francisco (Wave 3 §A)', () => {
  it('has complete, sourced data and opens after dubai', () => {
    expect(MARKET_IDS).toHaveLength(10);
    expect(MARKET_IDS[MARKET_IDS.indexOf('dubai') + 1]).toBe(SF);
    expect(WAVE3).toEqual([SF]);
    const d = MARKET_DATA[SF];
    expect(d.currency).toBe('USD');
    expect(d.unitsPerUsd).toBe(1);
    expect(d.timeZone).toBe('America/Los_Angeles');
    expect(d.tax.corporate).toBeCloseTo(0.298, 3);
    expect(d.depositInsurance).toBe(250_000);
    expect(d.salaries.engineer.senior).toBe(17_000);
    expect(d.costOfLiving).toBe(5_500);
    expect(d.sources.map((s) => s.input)).toEqual(
      expect.arrayContaining(['Policy rate', 'Tax rates', 'Salaries', 'Deposit insurance']),
    );
    expect(d.sources.find((s) => s.input === 'Deposit insurance')!.source).toBe('FDIC');
    expect(AI_FUNDS[SF]).toHaveLength(6);
    expect(new Set(OUTLETS[SF].map((o) => o.type)).size).toBe(6);
    expect(RULE_CARDS[SF].length).toBeGreaterThanOrEqual(6);
    const cap = CAPITAL[SF];
    expect(cap.vcDepth).toBeGreaterThan(CAPITAL.london.vcDepth);
    expect(cap.angelDepth).toBeGreaterThan(CAPITAL.london.angelDepth);
    expect(cap.schemes.map((s) => s.name)).toEqual(['QSBS', 'SBA 7(a)']);
    expect(cap.lenders.filter((l) => l.kind === 'high-street')).toHaveLength(2);
    expect(cap.lenders.map((l) => l.kind)).toEqual(
      expect.arrayContaining(['challenger', 'government', 'fintech']),
    );
    const products = cap.lenders.flatMap((l) => l.products);
    expect(products.filter((p) => p.kind === 'revenue-based')).toHaveLength(2);
    expect(products.some((p) => p.label === 'SBA 7(a) loan')).toBe(true);
  });

  it('opens by command with money conserved in every currency', () => {
    const w = withSf();
    const m = w.markets[SF]!;
    expect(m.data.currency).toBe('USD');
    expect(m.bankName).toBe('Golden Bay Bank');
    expect(Object.values(w.companies).some((c) => c.market === SF && c.ai)).toBe(true);
    expect(fxRate(w, 'USD', 'USD')).toBe(1);
    zeroSums(w);
    // A dollar market's rate is pinned at 1 even if a feed says otherwise.
    const w2 = run(w, null, { type: 'market.data', market: SF, unitsPerUsd: 1.2 }).world;
    expect(w2.markets[SF]!.data.unitsPerUsd).toBe(1);
  });

  it('an SF founder opens a company, pays costs and earns revenue in dollars', () => {
    let w = addSfFounder(withSf(12));
    const p = w.players.u_sf!;
    const c = companyOf(w, 'u_sf');
    expect(w.accounts[p.accounts.local]!.currency).toBe('USD');
    expect(w.accounts[c.account]!.currency).toBe('USD');
    // The local account already is a dollar account.
    const usd = tryRun(w, 'u_sf', { type: 'player.usdOpen' });
    expect(usd.ok).toBe(false);
    if (!usd.ok) expect(usd.error.code).toBe('usd.local');
    const before = balance(w, p.accounts.local);
    const gig = run(w, 'u_sf', { type: 'player.gig' });
    w = gig.world;
    expect(balance(w, p.accounts.local) - before).toBe(1_500_00 - Math.round(1_500_00 * 0.35));
    w = settle(w, SF, 3);
    const history = w.companies[c.id]!.finance.history;
    expect(history).toHaveLength(3);
    expect(history.some((h) => h.revenue > 0)).toBe(true);
    expect(history.every((h) => h.office + h.cloud > 0)).toBe(true);
    zeroSums(w);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('a London player travels to SF, invests in dollars, and relocates there', () => {
    let w = addInvestor(withSf(13), 'u_ldn', 'london');
    const gbp = w.players.u_ldn!.accounts.local;
    const target = Object.values(w.companies).find(
      (c) => c.ai && c.market === SF && c.status === 'active',
    )!;
    w = run(w, 'u_ldn', { type: 'player.travel', market: SF }).world;
    const cash = balance(w, target.account);
    const r = run(w, 'u_ldn', {
      type: 'invest.propose',
      companyId: target.id,
      instrument: 'safe',
      amount: 20_000_00,
      valuation: 2_000_000_00,
      proRata: false,
      boardSeat: false,
      vetoOnSale: false,
    });
    w = r.world;
    if (r.result.status === 'accepted') {
      // The company received exactly $20k; the investor paid pounds including the FX fee.
      expect(balance(w, target.account) - cash).toBe(20_000_00);
      expect(w.accounts[gbp]!.currency).toBe('GBP');
    }
    zeroSums(w);

    w = run(w, 'u_ldn', { type: 'player.relocate', market: SF, handle: 'ldn_to_sf' }).world;
    const p = w.players.u_ldn!;
    expect(p.market).toBe(SF);
    expect(w.accounts[p.accounts.local]!.currency).toBe('USD');
    expect(balance(w, p.accounts.local)).toBeGreaterThan(0);
    // Pays in dollars from now on: settle a few months of SF life.
    w = settle(w, SF, 2);
    zeroSums(w);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('a player with a dollar account relocating to SF converts dollars without a fee', () => {
    let w = addInvestor(withSf(14), 'u_usd', 'london');
    w = run(w, 'u_usd', { type: 'player.usdOpen' }).world;
    w = run(w, 'u_usd', { type: 'player.convert', direction: 'toUsd', amount: 1_000_00 }).world;
    w = run(w, 'u_usd', { type: 'player.relocate', market: SF, handle: 'usd_mover' }).world;
    const p = w.players.u_usd!;
    const usdBefore = balance(w, p.accounts.usd!);
    const localBefore = balance(w, p.accounts.local);
    const r = run(w, 'u_usd', {
      type: 'player.convert',
      direction: 'toLocal',
      amount: usdBefore,
    });
    expect(r.result.received).toBe(usdBefore);
    expect(balance(r.world, p.accounts.local)).toBe(localBefore + usdBefore);
    zeroSums(r.world);
  });
});

describe('AI angel investors as people (Wave 3 §A)', () => {
  it('creates round(4 × angelDepth) angels per market (min 2) with funds and savings', () => {
    const w = withSf(21, ['lagos', 'nairobi', 'london']);
    const expected: Record<string, number> = { lagos: 2, nairobi: 2, london: 4, [SF]: 7 };
    for (const [market, n] of Object.entries(expected)) {
      expect(angelTarget(market as MarketId)).toBe(n);
      const angels = activeAngels(w, market as MarketId);
      expect(angels).toHaveLength(n);
      for (const a of angels) {
        expect(a.ai).toBe(true);
        expect(a.role).toBe('investor');
        expect(a.name).toMatch(/\S+ \S+/);
        expect(a.stars.value).toBeGreaterThan(0);
        expect(balance(w, a.accounts.local)).toBeGreaterThan(0);
        const f = w.funds[a.angel!.fundId]!;
        expect(f.ai).toBe(true);
        expect(f.managerId).toBeNull();
        expect(f.angelId).toBe(a.id);
        expect(f.partner).toBe(a.name);
        expect(f.stages).toEqual(['pre-seed', 'seed']);
        expect(a.investor?.fundId).toBe(f.id);
      }
      expect(new Set(angels.map((a) => a.name)).size).toBe(n);
    }
    // SF angels write bigger cheques than Lagos angels, in dollars.
    const sfCheck = w.funds[angelFundId(SF, 0)]!.check[1];
    const lagosCheckUsd =
      w.funds[angelFundId('lagos', 0)]!.check[1] / MARKET_DATA.lagos.unitsPerUsd;
    expect(sfCheck).toBeGreaterThan(lagosCheckUsd);
    zeroSums(w);
  });

  it('appears in views: players with role investor, and angel funds name their angel', () => {
    const w = addSfFounder(withSf(22));
    const v = playerView(w, 'u_sf')!;
    const angels = v.players.filter((p) => p.ai);
    expect(angels).toHaveLength(7);
    for (const a of angels) {
      expect(a.role).toBe('investor');
      expect(a.angel?.fundId).toBeTruthy();
    }
    const tagged = v.market.funds.filter((f) => f.angel);
    expect(tagged).toHaveLength(7);
    for (const f of tagged) expect(angels.map((a) => a.id)).toContain(f.angel!.playerId);
    expect(v.market.funds.filter((f) => !f.angel).length).toBeGreaterThan(6);
    // Leaderboards and directory still render with AI investors around.
    expect(v.leaderboards.topInvestors.length).toBeGreaterThan(0);
  });

  it('invest in raising AI startups with SAFEs, deterministically, money conserved', () => {
    const a = settle(withSf(23), SF, 8);
    const b = settle(withSf(23), SF, 8);
    expect(b).toEqual(a);
    const angelFunds = new Set(
      Object.values(a.funds)
        .filter((f) => f.angelId && f.market === SF)
        .map((f) => f.id),
    );
    const positions = Object.values(a.positions).filter((p) => angelFunds.has(p.investorId));
    expect(positions.length).toBeGreaterThan(0);
    for (const pos of positions) {
      const c = a.companies[pos.companyId]!;
      expect(c.capTable.safes.some((s) => s.holderId === pos.investorId)).toBe(true);
    }
    zeroSums(a);
    expect(negativeInternalAccounts(a)).toEqual([]);
  });

  it('offer human founders a SAFE on a deal card they can accept', () => {
    let w = addSfFounder(withSf(24));
    const cid = companyOf(w, 'u_sf').id;
    let deal = undefined as World['deals'][string] | undefined;
    for (let i = 0; i < 12 && !deal; i++) {
      w = structuredClone(w);
      w.companies[cid]!.raising = true;
      w = settle(w, SF, 1);
      deal = Object.values(w.deals).find(
        (d) =>
          d.companyId === cid &&
          d.status === 'open' &&
          d.proposer.kind === 'fund' &&
          !!w.funds[d.proposer.id]?.angelId,
      );
    }
    expect(deal).toBeDefined();
    expect(deal!.terms.kind).toBe('investment');
    expect(w.inbox.u_sf!.some((n) => n.ref?.id === deal!.id)).toBe(true);
    const cash = balance(w, w.companies[cid]!.account);
    const r = run(w, 'u_sf', { type: 'deal.act', dealId: deal!.id, action: 'accept' });
    w = r.world;
    const t = deal!.terms as { amount: number };
    expect(balance(w, w.companies[cid]!.account) - cash).toBe(t.amount);
    expect(w.companies[cid]!.capTable.safes.some((s) => s.holderId === deal!.proposer.id)).toBe(
      true,
    );
    zeroSums(w);
  });

  it('saved worlds without angels get them at the next settlement; folded angels are replaced', () => {
    let w = structuredClone(withSf(25));
    // Simulate a pre-Wave 3 save: no angels, their money back where it came from.
    for (const p of Object.values(w.players).filter((x) => x.angel)) {
      const f = w.funds[p.angel!.fundId]!;
      const m = w.markets[p.market]!;
      w.accounts[m.ext.genesis]!.balance += balance(w, p.accounts.local);
      w.accounts[m.ext.lps]!.balance += balance(w, f.account);
      delete w.accounts[p.accounts.local];
      delete w.accounts[f.account];
      delete w.funds[f.id];
      delete w.players[p.id];
      delete w.inbox[p.id];
    }
    expect(activeAngels(w, SF)).toHaveLength(0);
    zeroSums(w);
    w = settle(w, SF, 1);
    expect(activeAngels(w, SF)).toHaveLength(7);
    expect(w.players[angelPlayerId(SF, 0)]).toBeDefined();
    zeroSums(w);

    // An angel whose fund runs dry retires and someone new takes their place.
    w = structuredClone(w);
    const f0 = w.funds[angelFundId(SF, 0)]!;
    const lps = w.markets[SF]!.ext.lps;
    w.accounts[lps]!.balance += balance(w, f0.account);
    w.accounts[f0.account]!.balance = 0;
    w = settle(w, SF, 1);
    expect(w.players[angelPlayerId(SF, 0)]!.angel!.retiredMonth).toBeDefined();
    expect(activeAngels(w, SF)).toHaveLength(7);
    expect(w.players[angelPlayerId(SF, 7)]).toBeDefined();
    expect(playerView(w, angelPlayerId(SF, 7))).not.toBeNull();
    zeroSums(w);
  });
});

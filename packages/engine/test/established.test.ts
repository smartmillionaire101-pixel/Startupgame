/**
 * Established listed companies (established.ts, feedback note): every city's
 * exchange lists 15–20 companies across its sectors, in every size and
 * shape, run by the game through the ledger. Worlds without the note keep
 * their five AI listings; worlds that had the note before them are topped
 * up at the next settlement, the same way every time.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { MARKET_IDS } from '../src/data/markets.js';
import { ESTABLISHED, ensureEstablished, establishedId } from '../src/established.js';
import { EXCHANGE_LISTINGS, ensureExchange, listedIn } from '../src/exchange.js';
import { isEstablished } from '../src/helpers.js';
import { FEEDBACK_NOTE, INVESTOR_NOTE } from '../src/releases.js';
import { playerView, leaderboards } from '../src/views.js';
import type { Company, World } from '../src/types.js';
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

const I = 'u_investor';
const CITIES = ['lagos', 'nairobi', 'london'] as const;
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Release.' }).world;
const established = (w: World, market: string) =>
  listedIn(w, market).filter((c) => isEstablished(c));

/** A world as it was before this change: the note logged, five AI listings a city. */
function noteWithoutRoster(w: World): World {
  return produce(w, (d) => {
    for (const c of Object.values(d.companies)) {
      if (!c.established) continue;
      delete d.companies[c.id];
      delete d.accounts[c.account];
      delete d.names[c.market]![c.handle];
    }
  });
}

/** What makes two rosters the same: names, sectors, profiles and prices. */
const fingerprint = (w: World) =>
  Object.values(w.companies)
    .filter((c) => c.established)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      id: c.id,
      name: c.name,
      industry: c.industry,
      profile: c.established,
      price: c.ipo?.price,
      revenue: c.finance.history.map((h) => h.revenue),
    }));

describe('established listed companies', () => {
  it('leave worlds without the feedback note exactly as before', () => {
    const w = announce(makeWorld(5, [...CITIES]), INVESTOR_NOTE);
    for (const city of CITIES) {
      expect(listedIn(w, city).length).toBeLessThanOrEqual(EXCHANGE_LISTINGS);
      expect(established(w, city)).toEqual([]);
    }
    const after = settle(w, 'lagos', 2);
    expect(Object.values(after.companies).some((c) => c.established)).toBe(false);
    expect(ensureEstablished(after, 'lagos')).toBe(0);
  });

  it('give every city 15–20 listings across a spread of sectors and shapes', () => {
    const w = announce(makeWorld(5, [...MARKET_IDS]), FEEDBACK_NOTE);
    for (const city of MARKET_IDS) {
      const listed = listedIn(w, city);
      expect(listed.length, city).toBeGreaterThanOrEqual(15);
      expect(listed.length, city).toBeLessThanOrEqual(20);
      const mine = established(w, city);
      expect(mine.length).toBe(ESTABLISHED.roster[city].length);
      expect(new Set(mine.map((c) => c.industry)).size, city).toBeGreaterThanOrEqual(6);
      expect(new Set(mine.map((c) => c.established!.kind)).size).toBe(5);
      // Some pay their way, some lose money; some grow fast, some shrink.
      const margins = mine.map((c) => c.established!.margin);
      expect(Math.min(...margins)).toBeLessThan(0);
      expect(Math.max(...margins)).toBeGreaterThan(0.1);
      const growth = mine.map((c) => c.established!.growth);
      expect(Math.max(...growth)).toBeGreaterThan(0.02);
      expect(Math.min(...growth)).toBeLessThan(0.002);
      // Sizes differ by more than ten times.
      const caps = mine.map((c) => c.capTable.lastPostMoney);
      expect(Math.max(...caps) / Math.min(...caps)).toBeGreaterThan(10);
      for (const c of mine) {
        expect(c.founderIds).toEqual([]);
        expect(c.finance.history.length).toBe(ESTABLISHED.historyMonths);
        expect(c.ipo?.status).toBe('listed');
        expect(c.name.length).toBeLessThanOrEqual(32);
      }
    }
    // The tech capital's exchange leans on software.
    const sf = established(w, 'san-francisco');
    expect(sf.filter((c) => c.industry === 'saas').length).toBeGreaterThanOrEqual(4);
  });

  it('top up a world that had the note with five listings, the same way every time', () => {
    const fresh = announce(makeWorld(5, [...CITIES]), FEEDBACK_NOTE);
    const old = noteWithoutRoster(fresh);
    for (const city of CITIES) expect(established(old, city)).toEqual([]);
    // At the next settlement…
    const a = settle(old, 'lagos', 1);
    expect(established(a, 'lagos').length).toBe(ESTABLISHED.roster.lagos.length);
    const b = settle(old, 'lagos', 1);
    expect(fingerprint(b)).toEqual(fingerprint(a));
    // …or when the exchange is next ensured (a city opening, an announcement).
    const c = produce(old, (d) => void ensureExchange(d as World, 'nairobi'));
    expect(established(c, 'nairobi').map((x) => x.id)).toEqual(
      established(fresh, 'nairobi').map((x) => x.id),
    );
    expect(fingerprint(c).filter((x) => x.id.includes('nairobi'))).toEqual(
      fingerprint(fresh).filter((x) => x.id.includes('nairobi')),
    );
    // Once there, nothing is added twice.
    expect(produce(c, (d) => void ensureEstablished(d as World, 'nairobi'))).toEqual(c);
  });

  it('trade through the ledger at month end, with prices, accounts and dividends', () => {
    let w = addInvestor(announce(makeWorld(5, [...CITIES]), FEEDBACK_NOTE), I, 'lagos');
    w = run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
    const before = moneyByCurrency(w);
    const id = establishedId('lagos', 0);
    const start = w.companies[id]!;
    w = settle(w, 'lagos', 3);
    const c = w.companies[id]!;
    expect(c.status).toBe('active');
    expect(c.finance.history.length).toBe(ESTABLISHED.historyMonths + 3);
    expect(c.ipo!.history!.length).toBe(4);
    expect(c.ipo!.price).not.toBe(start.ipo!.price);
    // A blue chip makes money and pays some of it out.
    expect(c.finance.history.slice(-3).every((h) => h.net > 0)).toBe(true);
    expect(w.accounts[c.account]!.recent.some((r) => r.memo.startsWith('Dividend'))).toBe(true);
    // No money made or lost, and no account below zero.
    expect(moneyByCurrency(w)).toEqual(before);
    expect(negativeInternalAccounts(w)).toEqual([]);
    // An investor can buy its shares like any listing.
    const r = run(w, I, { type: 'shares.buy', companyId: id, amount: 5_000_000_00 });
    expect(r.world.companies[id]!.capTable.holdings[I]!.shares).toBeGreaterThan(0);
  });

  it('never runs out of money, even losing it', () => {
    let w = announce(makeWorld(5, ['lagos']), FEEDBACK_NOTE);
    w = produce(w, (d) => {
      const c = d.companies[establishedId('lagos', 2)]!;
      c.established!.margin = -0.9;
      // Move most of its cash out (to the city's suppliers, so no money is made).
      const acc = d.accounts[c.account]!;
      d.accounts[d.markets.lagos!.ext.suppliers]!.balance += acc.balance - 1_000_00;
      acc.balance = 1_000_00;
    });
    w = settle(w, 'lagos', 3);
    expect(negativeInternalAccounts(w)).toEqual([]);
    expect(w.companies[establishedId('lagos', 2)]!.established!.margin).toBeGreaterThan(0);
  });

  it('stay out of startup life: AI founders, leaderboards, the directory, acquisitions', () => {
    let w = addFounder(announce(makeWorld(5, ['lagos']), FEEDBACK_NOTE));
    const ids = new Set(established(w, 'lagos').map((c) => c.id));
    const v = playerView(w, 'u_founder')!;
    expect(v.directory.some((c) => ids.has(c.id))).toBe(false);
    const boards = JSON.stringify(leaderboards(w, 'lagos'));
    for (const id of ids) expect(boards).not.toContain(id);
    // Listed for investors to read about.
    expect(v.capital!.market.filter((x) => ids.has(x.companyId)).length).toBe(ids.size);
    const target = [...ids][0]!;
    const mine: Company = companyOf(w, 'u_founder');
    const r = tryRun(w, 'u_founder', {
      type: 'acquire.propose',
      buyerCompanyId: mine.id,
      targetCompanyId: target,
      price: 1_000_00,
      retention: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('acquire.established');
    // A year on: none hired staff, raised money or took startup customers.
    w = settle(w, 'lagos', 12);
    for (const id of ids) {
      const c = w.companies[id]!;
      expect(c.staff).toEqual([]);
      expect(c.segments).toEqual({});
      expect(c.raising).toBe(false);
    }
  });
});

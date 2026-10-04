import { describe, expect, it } from 'vitest';
import { MARKET_DATA, MARKET_IDS, PHASE2_WAVE } from '../src/data/markets.js';
import { AI_FUNDS, OUTLETS } from '../src/data/fiction.js';
import { RULE_CARDS } from '../src/data/rules.js';
import { createWorld } from '../src/world.js';
import { upgradeWorld, CURRENT_SCHEMA } from '../src/upgrade.js';
import {
  DAY,
  T0,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

describe('Phase 2 markets (§20)', () => {
  it('has complete data, funds, newsrooms and rule cards for every market', () => {
    for (const id of MARKET_IDS) {
      const d = MARKET_DATA[id];
      expect(d.id).toBe(id);
      expect(d.unitsPerUsd).toBeGreaterThan(0);
      expect(d.salaries.engineer.senior).toBeGreaterThan(d.salaries.engineer.junior);
      expect(d.salaries.head).toBeGreaterThan(d.salaries.engineer.senior);
      expect(AI_FUNDS[id]).toHaveLength(6);
      expect(OUTLETS[id].map((o) => o.type).sort()).toEqual([
        'global',
        'national',
        'regional',
        'tabloid',
        'tech',
        'trade',
      ]);
      expect(RULE_CARDS[id].length).toBeGreaterThanOrEqual(6);
    }
  });

  it('new worlds start with the launch markets; the rest open in waves by command', () => {
    let w = createWorld({ seed: 3, now: T0, aiStartupsPerMarket: 4 });
    expect(Object.keys(w.markets)).toEqual(['lagos', 'nairobi', 'london']);
    const before = moneyByCurrency(w);
    for (const id of PHASE2_WAVE) w = run(w, null, { type: 'market.open', market: id }).world;
    expect(Object.keys(w.markets)).toHaveLength(9);
    // Six seed funds, three depth funds, two AI angels' funds (round(4 × 0.5)).
    expect(Object.values(w.funds).filter((f) => f.market === 'dubai')).toHaveLength(11);
    expect(
      Object.values(w.companies).filter((c) => c.market === 'freetown' && c.ai).length,
    ).toBeGreaterThan(0);
    expect(tryRun(w, null, { type: 'market.open', market: 'accra' }).ok).toBe(false);
    for (const c of ['NGN', 'KES', 'GBP']) expect(moneyByCurrency(w)[c]).toBe(before[c]);
  });

  it('players can join a new market and it settles with money conserved', () => {
    let w = createWorld({ seed: 4, now: T0, aiStartupsPerMarket: 4 });
    w = run(w, null, { type: 'market.open', market: 'kigali' }).world;
    w = run(w, 'u_k', {
      type: 'player.create',
      handle: 'kigali_one',
      name: 'Aline',
      role: 'founder',
      backgroundId: 'f-engineer',
      market: 'kigali',
      company: {
        name: 'Moto Ledger',
        industry: 'logistics',
        revenueModel: 'subscription',
        idea: 'Logistics for moto riders',
        incorporation: 'local',
      },
    }).world;
    const total = moneyByCurrency(w);
    w = settle(w, 'kigali', 6, T0 + DAY);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
    expect(w.markets.kigali!.month).toBe(6);
  });

  it('converts between currencies through the dollar (AED peg)', () => {
    let w = createWorld({ seed: 5, now: T0, aiStartupsPerMarket: 2 });
    w = run(w, null, { type: 'market.open', market: 'dubai' }).world;
    w = run(w, 'u_d', {
      type: 'player.create',
      handle: 'dubai_one',
      name: 'Layla',
      role: 'investor',
      backgroundId: 'i-banker',
      market: 'dubai',
      investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 100_000_00 },
    }).world;
    w = run(w, 'u_d', { type: 'player.usdOpen' }).world;
    const r = run(w, 'u_d', { type: 'player.convert', direction: 'toUsd', amount: 3_672_50 });
    expect(r.result.received).toBe(99_750);
  });

  it('upgrades older saved worlds', () => {
    const w = structuredClone(createWorld({ seed: 6, now: T0, aiStartupsPerMarket: 1 }));
    w.schemaVersion = 1;
    expect(upgradeWorld(w).schemaVersion).toBe(CURRENT_SCHEMA);
  });
});

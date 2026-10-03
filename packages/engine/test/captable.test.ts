import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  POOL_ID,
  addSafe,
  closePricedRound,
  fullyDiluted,
  grantOptions,
  newCapTable,
  ownership,
  waterfall,
} from '../src/captable.js';

const near = (a: number, b: number, tol = 0.002) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('cap table (§5, §9)', () => {
  it('a priced round gives the investor amount / post-money', () => {
    const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
    closePricedRound(ct, {
      investorId: 'vc',
      amount: 2_000_000,
      preMoney: 8_000_000,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    near(ownership(ct, 'vc'), 0.2);
    near(ownership(ct, 'f'), 0.8);
    expect(ct.lastPostMoney).toBe(10_000_000);
  });

  it('the option pool shuffle comes out of the founders, not the investor', () => {
    const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
    closePricedRound(ct, {
      investorId: 'vc',
      amount: 2_000_000,
      preMoney: 8_000_000,
      poolTopUpBps: 1000,
      multiple: 1,
      participating: false,
    });
    near(ownership(ct, 'vc'), 0.2);
    near(ownership(ct, POOL_ID), 0.1);
    near(ownership(ct, 'f'), 0.7);
  });

  it('post-money SAFEs own amount / cap after conversion (before new money)', () => {
    const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
    addSafe(ct, { holderId: 'angel', amount: 500_000, cap: 5_000_000, month: 0 });
    addSafe(ct, { holderId: 'scout', amount: 250_000, cap: 5_000_000, month: 0 });
    // Tiny priced round so we can read SAFE ownership almost directly.
    const r = closePricedRound(ct, {
      investorId: 'vc',
      amount: 1,
      preMoney: 10_000_000,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    near(ownership(ct, 'angel'), 0.1);
    near(ownership(ct, 'scout'), 0.05);
    expect(ct.safes).toHaveLength(0);
    expect(r.safeShares.angel).toBeGreaterThan(0);
    // Converted SAFEs become 1x preferred.
    expect(ct.preferences.find((p) => p.holderId === 'angel')?.invested).toBe(500_000);
  });

  it('options come from the pool first', () => {
    const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
    closePricedRound(ct, {
      investorId: 'vc',
      amount: 1_000_000,
      preMoney: 4_000_000,
      poolTopUpBps: 1000,
      multiple: 1,
      participating: false,
    });
    const before = fullyDiluted(ct);
    grantOptions(ct, 'staff1', 100);
    expect(fullyDiluted(ct)).toBe(before);
  });

  it('property: ownership always sums to 100%', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            amount: fc.integer({ min: 1_000, max: 50_000_000 }),
            pre: fc.integer({ min: 100_000, max: 500_000_000 }),
            pool: fc.integer({ min: 0, max: 1500 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (rounds) => {
          const ct = newCapTable([
            { id: 'a', bps: 6000 },
            { id: 'b', bps: 4000 },
          ]);
          rounds.forEach((r, i) =>
            closePricedRound(ct, {
              investorId: `vc${i}`,
              amount: r.amount,
              preMoney: r.pre,
              poolTopUpBps: r.pool,
              multiple: 1,
              participating: false,
            }),
          );
          const total = Object.keys(ct.holdings).reduce((s, id) => s + ownership(ct, id), 0);
          return Math.abs(total - 1) < 1e-9;
        },
      ),
    );
  });
});

describe('liquidation waterfall (§12)', () => {
  const seriesA = () => {
    const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
    closePricedRound(ct, {
      investorId: 'vc',
      amount: 2_000_000,
      preMoney: 8_000_000,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    return ct;
  };
  const get = (lines: ReturnType<typeof waterfall>, id: string) =>
    lines.find((l) => l.holderId === id)?.total ?? 0;

  it('a low exit pays the preference first; founders get far less than the headline', () => {
    const lines = waterfall(seriesA(), 3_000_000);
    expect(get(lines, 'vc')).toBe(2_000_000);
    expect(get(lines, 'f')).toBeLessThanOrEqual(1_000_000);
  });

  it('a big exit makes the investor convert to common', () => {
    const lines = waterfall(seriesA(), 50_000_000);
    near(get(lines, 'vc') / 50_000_000, 0.2, 0.001);
    expect(lines.find((l) => l.holderId === 'vc')?.converted).toBe(true);
  });

  it('participating preferred double-dips', () => {
    const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
    closePricedRound(ct, {
      investorId: 'vc',
      amount: 2_000_000,
      preMoney: 8_000_000,
      poolTopUpBps: 0,
      multiple: 1,
      participating: true,
    });
    const lines = waterfall(ct, 12_000_000);
    near(get(lines, 'vc'), 2_000_000 + 10_000_000 * 0.2, 5);
  });

  it('later rounds are senior', () => {
    const ct = seriesA();
    closePricedRound(ct, {
      investorId: 'vcB',
      amount: 5_000_000,
      preMoney: 20_000_000,
      poolTopUpBps: 0,
      multiple: 1,
      participating: false,
    });
    const lines = waterfall(ct, 6_000_000);
    expect(get(lines, 'vcB')).toBe(5_000_000);
    expect(get(lines, 'vc')).toBe(1_000_000);
    expect(get(lines, 'f')).toBe(0);
  });

  it('property: never pays out more than the proceeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e10 }), fc.boolean(), (proceeds, participating) => {
        const ct = newCapTable([{ id: 'f', bps: 10_000 }]);
        addSafe(ct, { holderId: 'angel', amount: 100_000, cap: 2_000_000, month: 0 });
        closePricedRound(ct, {
          investorId: 'vc',
          amount: 2_000_000,
          preMoney: 8_000_000,
          poolTopUpBps: 1000,
          multiple: 1,
          participating,
        });
        const paid = waterfall(ct, proceeds).reduce((a, l) => a + l.total, 0);
        return paid <= proceeds && paid >= proceeds - 1000;
      }),
    );
  });
});

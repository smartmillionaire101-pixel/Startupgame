import { describe, expect, it } from 'vitest';
import { playerView } from '../src/index.js';
import { monthlyCosts } from '../src/company.js';
import { addFounder, makeWorld } from './helpers.js';

/**
 * The company view's `nextMonth`: next payday's bill against today's cash, so
 * a founder sees a shortfall coming before staff go unpaid.
 */
describe('nextMonth (the payday warning)', () => {
  const companyOf = (w: ReturnType<typeof makeWorld>) =>
    Object.values(w.companies).find((c) => c.founderIds.includes('u_founder'))!;

  it('is nothing short while the bank covers next month', () => {
    const w = structuredClone(addFounder(makeWorld()));
    const c = companyOf(w);
    c.founderSalary = 1_000_00;
    const next = playerView(w, 'u_founder')!.companies[0]!.nextMonth!;
    expect(next.costs).toBe(monthlyCosts(w, c));
    expect(next.salaries).toBeGreaterThanOrEqual(1_000_00);
    expect(next.cash).toBe(w.accounts[c.account]!.balance);
    expect(next.short).toBe(0);
  });

  it('says how much is missing when costs beat cash and last month’s revenue', () => {
    const w = structuredClone(addFounder(makeWorld()));
    const c = companyOf(w);
    c.founderSalary = 500_000_00;
    w.accounts[c.account]!.balance = 100_000_00;
    const next = playerView(w, 'u_founder')!.companies[0]!.nextMonth!;
    expect(next.short).toBe(monthlyCosts(w, c) - 100_000_00 - next.revenue);
    expect(next.short).toBeGreaterThan(0);
  });
});

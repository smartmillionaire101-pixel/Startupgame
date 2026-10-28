import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { companyPillLine } from '../src/city/companyPill';

type C = PlayerView['companies'][number];
const company = (over: Record<string, unknown>) =>
  ({ monthlyRevenue: 0, runwayMonths: null, setup: null, ...over }) as unknown as C;

describe('the HUD’s company pill (play-test: "₦0 · Profitable" right after reserving the name)', () => {
  it('says the company is being set up until it opens', () => {
    for (const step of ['register', 'fund', 'plan', 'office'])
      expect(companyPillLine(company({ setup: { step } }))).toBe('Setting up');
  });
  it('then: no costs or sales yet, the runway, or profitable', () => {
    expect(companyPillLine(company({ setup: { step: 'done' } }))).toBe('Pre-revenue');
    expect(companyPillLine(company({ runwayMonths: 7.4, monthlyRevenue: 10 }))).toBe('7 mo');
    expect(companyPillLine(company({ monthlyRevenue: 5_000 }))).toBe('Profitable');
  });
  it('a rescue’s months come first', () => {
    expect(
      companyPillLine(company({ rescue: { level: 'danger', monthsLeft: 2 }, runwayMonths: 2 })),
    ).toBe('2 mo left');
  });
});

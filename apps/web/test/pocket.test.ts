import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { pocketOf, pocketText } from '../src/city/pocket';

/** A naira account; abroad in Accra when `rate` is given (cedi per naira, after the fee). */
const viewOf = (balance: number, rate?: number) =>
  ({
    market: { currency: rate ? 'GHS' : 'NGN' },
    accounts: { local: { balance, currency: 'NGN' } },
    spendHere: rate ? { from: 'NGN', currency: 'GHS', rate } : null,
  }) as unknown as PlayerView;

describe('your pocket where you are (play-test: "GH₵3.8m" for ₦3.78m in Accra)', () => {
  it('at home: your balance, in your currency', () => {
    const p = pocketOf(viewOf(377_823_840));
    expect(p.converted).toBe(false);
    expect(pocketText(p)).toBe('₦3.8m');
    expect(p.canPay(377_823_840)).toBe(true);
    expect(p.canPay(377_823_841)).toBe(false);
  });

  it('abroad: converted at the bank’s rate, the naira alongside', () => {
    const rate = 0.0076;
    const p = pocketOf(viewOf(377_823_840, rate), 'GHS');
    expect(p.converted).toBe(true);
    expect(p.currency).toBe('GHS');
    expect(p.balance).toBe(Math.floor((377_823_840 - 1) * rate));
    expect(pocketText(p)).toBe('≈ GH₵28.7k (₦3.8m)');
  });

  it('abroad: affordability is the engine’s rule (ceil(price / rate) + 1 of your money)', () => {
    const rate = 0.0076;
    const price = 2_500_000; // GH₵25,000
    const need = Math.ceil(price / rate) + 1;
    expect(pocketOf(viewOf(need, rate), 'GHS').canPay(price)).toBe(true);
    expect(pocketOf(viewOf(need - 1, rate), 'GHS').canPay(price)).toBe(false);
    // The converted balance agrees: what it covers is what you can buy.
    expect(pocketOf(viewOf(need, rate), 'GHS').balance).toBeGreaterThanOrEqual(price);
    expect(pocketOf(viewOf(need - 1, rate), 'GHS').balance).toBeLessThan(price);
    // A naira price (your own currency) is not converted.
    expect(pocketOf(viewOf(need, rate), 'NGN').converted).toBe(false);
  });
});

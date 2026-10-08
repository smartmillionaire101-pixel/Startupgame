import { describe, expect, it } from 'vitest';
import { amountInput, moneyExact, parseAmount, runway, titleCase } from '../src/format';

describe('format', () => {
  it('parses human amounts into minor units', () => {
    expect(parseAmount('2.5m')).toBe(250_000_000);
    expect(parseAmount('800k')).toBe(80_000_000);
    expect(parseAmount('1,200')).toBe(120_000);
    expect(parseAmount('3bn')).toBe(300_000_000_000);
    expect(parseAmount('lots')).toBeNull();
  });
  it('shows exact balances, so a small transfer is visible', () => {
    expect(moneyExact(1_143_000_000, 'NGN')).toBe('₦11,430,000');
    expect(moneyExact(1_142_494_950, 'NGN')).toBe('₦11,424,949.50');
    expect(moneyExact(123_456, 'GBP')).toBe('£1,234.56');
    expect(moneyExact(-5_000, 'USD')).toBe('-$50');
    expect(moneyExact(0, 'KES')).toBe('KSh0');
  });
  it('round-trips through the editable form', () => {
    for (const v of [250_000_000, 80_000_000, 120_000]) expect(parseAmount(amountInput(v))).toBe(v);
  });
  it('labels runway and titles', () => {
    expect(runway(null)).toBe('Profitable');
    expect(runway(5.7)).toBe('5 mo');
    expect(titleCase('series-a')).toBe('Series A');
  });
});

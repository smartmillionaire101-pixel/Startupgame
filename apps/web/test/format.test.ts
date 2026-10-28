import { describe, expect, it } from 'vitest';
import {
  amountInput,
  moneyCents,
  moneyExact,
  parseAmount,
  runway,
  stakeText,
  teamText,
  titleCase,
} from '../src/format';

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
    // Whole units only (play-test: "₦3,778,238.40" in the money pill's title).
    expect(moneyExact(377_823_840, 'NGN')).toBe('₦3,778,238');
    expect(moneyExact(2_471_160, 'NGN')).toBe('₦24,712');
    expect(moneyExact(123_456, 'GBP')).toBe('£1,235');
    // A share price keeps its pence.
    expect(moneyCents(482, 'GBP')).toBe('£4.82');
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
  it('shows a SAFE’s stake at its cap, not 0% (play-test #8)', () => {
    expect(stakeText({ ownershipPct: 2.5 })).toBe('2.5%');
    expect(stakeText({ ownershipPct: 0, safePct: 0.4 })).toBe('up to 0.4% on a SAFE');
    expect(stakeText({ ownershipPct: 1, safePct: 0.4 })).toBe('1.0% + up to 0.4% on a SAFE');
  });
  it('says “1 person”, not “1 people” (play-test #33)', () => {
    expect(teamText(1)).toBe('1 person');
    expect(teamText(3)).toBe('3 people');
  });
});

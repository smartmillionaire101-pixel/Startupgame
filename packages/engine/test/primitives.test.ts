import { describe, expect, it } from 'vitest';
import { createRng, deriveRng, hashString } from '../src/rng.js';
import { formatMoney, major } from '../src/money.js';
import { checkName, editDistance, isNearCopy, normaliseName } from '../src/names.js';
import { checkChatMessage, startersFor } from '../src/chat.js';
import { applyStarEvent, newStars, settleStars } from '../src/stars.js';
import { datesBetween, gameDate, localDate } from '../src/clock.js';

describe('rng', () => {
  it('is deterministic per seed and label', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
    expect(deriveRng(1, 'x').next()).toBe(deriveRng(1, 'x').next());
    expect(deriveRng(1, 'x').next()).not.toBe(deriveRng(1, 'y').next());
    expect(hashString('abc')).toBe(hashString('abc'));
  });
  it('stays within bounds', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      expect(r.next()).toBeLessThan(1);
    }
  });
});

describe('money', () => {
  it('formats short and sharp', () => {
    expect(formatMoney(major(50_000_000), 'NGN')).toBe('₦50m');
    expect(formatMoney(major(2_400_000), 'USD')).toBe('$2.4m');
    expect(formatMoney(major(850_000), 'GBP')).toBe('£850k');
    expect(formatMoney(major(1_200_000_000), 'KES')).toBe('KSh1.2bn');
    expect(formatMoney(major(950), 'GBP')).toBe('£950');
    expect(formatMoney(-major(20_000), 'NGN')).toBe('-₦20k');
  });
});

describe('names (§18)', () => {
  const taken = { [normaliseName('Kopaly')]: 'co_1' };
  it('accepts ordinary names', () => {
    expect(checkName('Market Mama Pay', { taken }).ok).toBe(true);
    expect(checkName('Beta Labs', { taken }).ok).toBe(true);
  });
  it('rejects near-copies of famous brands', () => {
    expect(checkName('Flutterwav', { taken }).ok).toBe(false);
    expect(checkName('Barclaze', { taken }).ok).toBe(false);
    expect(checkName('Paystack NG', { taken }).ok).toBe(false);
    expect(checkName('G00gle', { taken }).ok).toBe(false);
    expect(isNearCopy('stripe', 'stripe')).toBe(true);
  });
  it('rejects taken names and near-duplicates in the market', () => {
    expect(checkName('Kopaly', { taken })).toEqual({
      ok: false,
      reason: 'Already taken in this market.',
    });
    expect(checkName('Kopally', { taken }).ok).toBe(false);
  });
  it('rejects offensive names, including leetspeak', () => {
    expect(checkName('Sh1t Pay', { taken }).ok).toBe(false);
  });
  it('validates handles', () => {
    expect(checkName('ada_lovelace', { taken, kind: 'handle' }).ok).toBe(true);
    expect(checkName('ada lovelace', { taken, kind: 'handle' }).ok).toBe(false);
  });
  it('computes edit distance with transpositions', () => {
    expect(editDistance('abcd', 'abdc')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('chat filter (§15)', () => {
  it('allows normal talk, including amounts', () => {
    expect(
      checkChatMessage('I’m raising a seed round. Can I pitch you? We did ₦12m revenue.').ok,
    ).toBe(true);
  });
  it.each([
    ['links', 'see https://evil.example'],
    ['links', 'check mysite.com'],
    ['email', 'mail me at ada@example.com'],
    ['email', 'ada (at) example (dot) com'],
    ['phone', 'call +234 803 123 4567'],
    ['handle', 'find me @ada_builds'],
    ['off-app', 'text me on whatsapp'],
  ])('blocks %s', (_kind, text) => {
    expect(checkChatMessage(text).ok).toBe(false);
  });
  it('enforces the length limit and flags scams', () => {
    expect(checkChatMessage('x'.repeat(281)).ok).toBe(false);
    const r = checkChatMessage('Guaranteed returns of 40% if you send USDT');
    expect(r.ok && r.flagged).toBe(true);
  });
  it('has conversation starters per role pair', () => {
    expect(startersFor('founder', 'investor')[0]).toContain('seed round');
  });
});

describe('stars (§10)', () => {
  it('bad news weighs more than good, and recovery is slower than the fall', () => {
    const s = newStars(3);
    const up = applyStarEvent(s, 0.3);
    const down = applyStarEvent(s, -0.3);
    expect(Math.abs(down)).toBeGreaterThan(up);
    const after = s.value;
    settleStars(s, 3);
    const recovered = s.value - after;
    expect(recovered).toBeLessThan(Math.abs(down));
  });
  it('is clamped to 0–5', () => {
    const s = newStars(4.9);
    applyStarEvent(s, 5);
    expect(s.value).toBe(5);
    applyStarEvent(s, -50);
    expect(s.value).toBe(0);
  });
});

describe('clock (§2)', () => {
  it('uses local dates per time zone', () => {
    const t = Date.UTC(2026, 0, 1, 23, 30);
    expect(localDate(t, 'Europe/London')).toBe('2026-01-01');
    expect(localDate(t, 'Africa/Lagos')).toBe('2026-01-02');
    expect(localDate(t, 'Africa/Nairobi')).toBe('2026-01-02');
  });
  it('enumerates catch-up dates with a cap', () => {
    expect(datesBetween('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
    expect(datesBetween('2026-01-01', '2026-03-01', 7)).toHaveLength(7);
  });
  it('labels game dates', () => {
    expect(gameDate(0).label).toBe('Year 1, Month 1');
    expect(gameDate(13).label).toBe('Year 2, Month 2');
  });
});

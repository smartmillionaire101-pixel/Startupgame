import { describe, expect, it } from 'vitest';
import { BUSINESS_KINDS } from '../../../packages/engine/src/data/businesses';
import { BIZ_ICON, FALLBACK_ICON, bizIcon, placeBadge } from '../src/city/mapIcons';
import { CATEGORY_COLOR } from '../src/city/contract';

describe('map badges', () => {
  it('gives every business kind its own icon (never the fallback pin)', () => {
    const missing = BUSINESS_KINDS.map((k) => k.kind).filter(
      (k) => bizIcon(k) === FALLBACK_ICON || !BIZ_ICON[k],
    );
    expect(missing).toEqual([]);
    expect(bizIcon('no-such-kind')).toBe(FALLBACK_ICON);
  });

  it('rings a business in its category colour', () => {
    const b = placeBadge({ id: 'biz:x', kind: 'business', category: 'food', bizKind: 'cafe' });
    expect(b).toEqual({ icon: '☕', ring: CATEGORY_COLOR.food, money: false });
  });

  it('makes money places gold discs: 💰 for funds and capital, 🏦 for banks', () => {
    expect(placeBadge({ id: 'fund:a', kind: 'fund' })).toMatchObject({ icon: '💰', money: true });
    expect(placeBadge({ id: 'cap:a', kind: 'capital' })).toMatchObject({ icon: '💰', money: true });
    expect(placeBadge({ id: 'lender:a', kind: 'lender' })).toMatchObject({
      icon: '🏦',
      money: true,
    });
    expect(placeBadge({ id: 'playerbank:a', kind: 'playerbank' })).toMatchObject({
      icon: '🏦',
      money: true,
    });
    expect(
      placeBadge({
        id: 'biz:m',
        kind: 'business',
        category: 'services',
        bizKind: 'mobile-money-agent',
      }),
    ).toMatchObject({ money: true });
  });

  it('has icons for the city’s own places', () => {
    const icon = (kind: Parameters<typeof placeBadge>[0] & object) => placeBadge(kind).icon;
    expect(icon({ id: 'hub', kind: 'hub' })).toBe('🚀');
    expect(icon({ id: 'airport', kind: 'airport' })).toBe('✈️');
    expect(icon({ id: 'golf', kind: 'golf' })).toBe('⛳');
    expect(icon({ id: 'newsstand', kind: 'newsstand' })).toBe('📰');
    expect(icon({ id: 'eventhall', kind: 'eventhall' })).toBe('🎤');
    expect(icon({ id: 'stall:x', kind: 'stall' })).toBe('🧺');
    expect(placeBadge(null).icon).toBe('🧺');
  });
});

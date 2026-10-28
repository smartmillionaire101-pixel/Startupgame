import { describe, expect, it } from 'vitest';
import { NEW_MAX, newPlaces, type NewCandidate } from '../src/city/newPlaces';

/**
 * Round 7 (#26): "New" was on almost every pin. A place is new to you only
 * when it opened after you first saw the city, you haven't been in, and you first saw it
 * marked a few game days ago at most; the nearest few show.
 */
const MONTH = 30 * 60_000;
const at = (id: string, openedMonth: number, x: number): NewCandidate => ({
  id,
  openedMonth,
  x,
  y: 0,
});
const rules = (over: Partial<Parameters<typeof newPlaces>[1]> = {}) => ({
  joinMonth: 4,
  visited: new Set<string>(),
  seen: {},
  now: 1_000_000,
  monthMs: MONTH,
  at: { x: 0, y: 0 },
  ...over,
});

describe('places new to you', () => {
  it('only what opened after you first saw the city', () => {
    const c = [at('biz:old', 3, 1), at('biz:same', 4, 1), at('biz:new', 5, 1)];
    expect(newPlaces(c, rules())).toEqual(['biz:new']);
  });

  it('at most a few, the nearest first', () => {
    const c = Array.from({ length: 8 }, (_, i) => at(`biz:${i}`, 6, 10 - i));
    const shown = newPlaces(c, rules());
    expect(shown).toHaveLength(NEW_MAX);
    expect(shown).toEqual(['biz:7', 'biz:6', 'biz:5']);
  });

  it('cleared once you have been in, or a few game days after it was first marked', () => {
    const c = [at('biz:a', 6, 1), at('biz:b', 6, 2)];
    expect(newPlaces(c, rules({ visited: new Set(['biz:a']) }))).toEqual(['biz:b']);
    const day = MONTH / 30;
    expect(newPlaces(c, rules({ seen: { 'biz:a': 1_000_000 - 2 * day } }))).toContain('biz:a');
    expect(newPlaces(c, rules({ seen: { 'biz:a': 1_000_000 - 4 * day } }))).toEqual(['biz:b']);
  });
});

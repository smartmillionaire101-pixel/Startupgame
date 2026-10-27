import { describe, expect, it } from 'vitest';
import { clockText, minutesUntil, partProgress } from '../src/city/WhatNowCards';

/** Today's day bar: where the "now" marker sits and how long until a part starts. */
describe('the day bar', () => {
  it('writes the local time as HH:MM', () => {
    expect(clockText(8.72)).toBe('08:43');
    expect(clockText(0)).toBe('00:00');
    expect(clockText(23.99)).toBe('23:59');
  });

  it('places the marker inside the part you are in', () => {
    expect(partProgress(6)).toBe(0);
    expect(partProgress(8)).toBeCloseTo(0.5);
    expect(partProgress(13.5)).toBeCloseTo(0.5);
    // The night runs past midnight: 21:00 → 06:00.
    expect(partProgress(21)).toBe(0);
    expect(partProgress(1.5)).toBeCloseTo(0.5);
  });

  it('counts the wait until a later part starts', () => {
    expect(minutesUntil('morning', 8)).toBe(0);
    expect(minutesUntil('evening', 8.72)).toBe(497); // 8h 17m
    expect(minutesUntil('morning', 23)).toBe(7 * 60); // tomorrow
    expect(minutesUntil('night', 18)).toBe(3 * 60);
  });
});

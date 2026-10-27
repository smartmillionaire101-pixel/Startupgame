/**
 * Play-test #14: "two clocks: the HUD shows real time, appointments use game
 * days". The HUD reads the game clock, the one the engine books appointments
 * on, so its "now" is the same as a government office's "Now:".
 */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { DAY_MIN, MONTH_MIN, gameMinuteOf, hhmm, whenOf } from '../src/gameClock';

const MONTH_MS = 24 * 60 * 60_000;
const view = (opts: {
  month: number;
  into: number;
  now?: { month: number; day: number; hour: number; minute: number };
}) =>
  ({
    market: {
      month: opts.month,
      cityPlaces: opts.now ? { now: opts.now, places: [] } : null,
    },
    clock: {
      monthMs: MONTH_MS,
      serverNow: 1_000_000,
      nextSettlementAt: 1_000_000 + (1 - opts.into) * MONTH_MS,
    },
  }) as unknown as PlayerView;

describe('the game clock (play-test #14)', () => {
  it('splits a game minute into month, day, hour and minute like the engine', () => {
    expect(whenOf(2 * MONTH_MIN + 21 * DAY_MIN + 4 * 60 + 29)).toEqual({
      month: 2,
      day: 22,
      hour: 4,
      minute: 29,
    });
    expect(hhmm({ hour: 9, minute: 5 })).toBe('09:05');
  });

  it('starts from the engine’s own "now" (what an appointment desk shows)', () => {
    const now = { month: 2, day: 22, hour: 4, minute: 29 };
    const v = view({ month: 2, into: 0.5, now });
    expect(whenOf(gameMinuteOf(v)!)).toEqual(now);
  });

  it('works it out from the month countdown without one', () => {
    // Halfway through the month: day 16, midnight.
    expect(whenOf(gameMinuteOf(view({ month: 1, into: 0.5 }))!)).toEqual({
      month: 1,
      day: 16,
      hour: 0,
      minute: 0,
    });
  });

  it('runs on: one game day each thirtieth of the month, never past its end', () => {
    const v = view({ month: 0, into: 0, now: { month: 0, day: 1, hour: 0, minute: 0 } });
    expect(whenOf(gameMinuteOf(v, MONTH_MS / 30)!).day).toBe(2);
    const end = whenOf(gameMinuteOf(v, MONTH_MS * 2)!);
    expect(end).toEqual({ month: 0, day: 30, hour: 23, minute: 59 });
  });

  it('is null without a clock (an older server: the HUD shows the city’s time)', () => {
    expect(gameMinuteOf({ market: { month: 0 } } as unknown as PlayerView)).toBeNull();
  });
});

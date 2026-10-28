/**
 * A booked flight waits for you: flights keep the game clock (a game hour is
 * about two real minutes), so the time on a ticket can pass on the ride to the
 * airport. Booking still offers only flights to come; a ticket you hold shows
 * "Boarding now · we waited for you" past its time, never "Departed".
 */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { flightNow, gameMinuteOf } from '../src/gameClock';
import { airportSchedule, nextFlightTo } from '../src/city/travel';
import { departsOf, ticketFor, waitedFor } from '../src/city/ticket';

const at = (day: number, hour: number, minute: number) =>
  ({
    market: {
      month: 3,
      cityPlaces: { now: { month: 3, day, hour, minute }, places: [] },
    },
    clock: { monthMs: 86_400_000, serverNow: 1_000_000, nextSettlementAt: 50_000_000 },
  }) as unknown as PlayerView;

const london = {
  id: 'london',
  name: 'London',
  fare: 1000,
  hours: 6,
  done: false,
} as unknown as Parameters<typeof ticketFor>[1];

describe('a held ticket waits for you', () => {
  it('knows when its flight leaves on the game clock, and says so once that has passed', () => {
    const v = at(4, 9, 10);
    const now = flightNow(v, 'lagos');
    const t = ticketFor('lagos', london, 'NGN', 3, Date.UTC(2026, 9, 28), now, gameMinuteOf(v));
    expect(t.departs).toBeDefined();
    const departs = t.departs!;
    expect(departs).toBeGreaterThan(gameMinuteOf(v)!);
    // Before: still to come. At its time and long after (the next game day): waiting.
    expect(waitedFor(t, departs - 1, 0)).toBe(false);
    expect(waitedFor(t, departs, 0)).toBe(true);
    expect(waitedFor(t, departs + 26 * 60, 0)).toBe(true);
  });

  it('departs counts the delay, from the time of day the flight was found after', () => {
    const v = at(2, 17, 28);
    const min = gameMinuteOf(v)!;
    const now = flightNow(v, 'lagos');
    const f = nextFlightTo(airportSchedule('lagos', '3:2026-10-28'), 'accra', now)!;
    expect(departsOf(f, min, now)).toBe(min + (f.at + f.late - now));
    expect(departsOf(f, null, now)).toBeUndefined();
    expect(departsOf(null, min, now)).toBeUndefined();
  });

  it('a ticket booked elsewhere: the time on it after when the server booked it', () => {
    const booked = 3 * 24 * 60 + 23 * 60 + 50; // day 4, 23:50
    // A flight at 00:30 (just after midnight) is still to come at 23:55…
    const late = { time: '00:30', bookedMin: booked };
    expect(waitedFor(late, booked + 5, 23 * 60 + 55)).toBe(false);
    // …and waits for you from 00:30 on.
    expect(waitedFor(late, booked + 40, 30)).toBe(true);
    expect(waitedFor(late, booked + 300, 5 * 60)).toBe(true);
    // A flight at 19:30, booked at 07:00, isn't passed at noon.
    const day = { time: '19:30', bookedMin: 7 * 60 };
    expect(waitedFor(day, 12 * 60, 12 * 60)).toBe(false);
    expect(waitedFor(day, 19 * 60 + 31, 19 * 60 + 31)).toBe(true);
  });

  it('without a game clock, the time of day: passed for six hours after the time on it', () => {
    expect(waitedFor({ time: '14:20' }, null, 14 * 60 + 30)).toBe(true);
    expect(waitedFor({ time: '14:20' }, null, 14 * 60)).toBe(false);
    expect(waitedFor({ time: '00:30' }, null, 23 * 60 + 55)).toBe(false);
    expect(waitedFor({}, null, 12 * 60)).toBe(false);
    expect(waitedFor(null, 100, 100)).toBe(false);
  });
});

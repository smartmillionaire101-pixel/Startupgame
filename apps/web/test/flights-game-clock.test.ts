/**
 * Play-test: a 16:30 flight was offered, booked and boarded at 17:28 on the
 * HUD: the departures ran on the city's real time, the HUD on the game clock.
 * Flights now keep the game clock, so only those still to leave are offered.
 */
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@runway/engine';
import { flightNow } from '../src/gameClock';
import { airportSchedule, nextFlightTo } from '../src/city/travel';

const at = (hour: number, minute: number) =>
  ({
    market: {
      month: 3,
      cityPlaces: { now: { month: 3, day: 1, hour, minute }, places: [] },
    },
    clock: { monthMs: 86_400_000, serverNow: 1_000_000, nextSettlementAt: 50_000_000 },
  }) as unknown as PlayerView;

describe('departures keep the game clock', () => {
  it('the airports’ time of day is the HUD’s', () => {
    expect(flightNow(at(17, 28), 'lagos')).toBe(17 * 60 + 28);
    expect(flightNow(at(0, 5), 'lagos')).toBe(5);
  });

  it('a flight that has left is never offered', () => {
    const now = flightNow(at(17, 28), 'lagos');
    for (const day of ['3:2026-10-28', '3:2026-10-29', '7:2026-11-02']) {
      const schedule = airportSchedule('lagos', day);
      for (const to of ['accra', 'london', 'nairobi', 'dubai']) {
        const f = nextFlightTo(schedule, to, now);
        if (f) expect(f.at + f.late).toBeGreaterThan(now);
      }
    }
  });

  it('without a game clock (an older server), the city’s real time', () => {
    const v = { market: { month: 0 } } as unknown as PlayerView;
    expect(flightNow(v, 'lagos')).toBeGreaterThanOrEqual(0);
    expect(flightNow(v, 'lagos')).toBeLessThan(24 * 60);
  });
});

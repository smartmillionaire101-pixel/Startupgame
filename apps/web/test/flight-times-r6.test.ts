import { describe, expect, it } from 'vitest';
import { arrivalGreeting } from '../src/city/premium/Suite';
import { dueIn, flightHours } from '../src/city/travel';

/**
 * Play-test round 6, #38: "Good morning" on an evening flight to Accra, and
 * the Accra arrivals board had the flight landed at 17:20, before its 17:45
 * UTC departure from Lagos.
 */
describe('flight times', () => {
  it('greets you for the time of day where you land', () => {
    expect(arrivalGreeting(8, 'Leila', 'Accra')).toContain('Good morning');
    expect(arrivalGreeting(14.5, 'Leila', 'Accra')).toContain('Good afternoon');
    expect(arrivalGreeting(19.75, 'Leila', 'Accra')).toContain('Good evening');
    expect(arrivalGreeting(2, 'Leila', 'Accra')).toContain('Good evening');
  });

  it('puts a flight on the arrivals board at the time it was due there', () => {
    const now = Date.UTC(2026, 9, 27, 17, 26);
    // 18:45 in Lagos is 17:45 in Accra; about an hour in the air.
    const due = dueIn('lagos', 'accra', '18:45', now)!;
    const hours = flightHours('lagos', 'accra', 0);
    expect(hours).toBeGreaterThan(0.6);
    expect(due).toBe((17 * 60 + 45 + Math.round(hours * 60)) % 1440);
    expect(due).toBeGreaterThan(17 * 60 + 45);
    // Past midnight it wraps; nonsense in, nothing out.
    expect(dueIn('accra', 'lagos', '23:30', now)!).toBeLessThan(120);
    expect(dueIn('lagos', 'accra', 'soon', now)).toBeNull();
  });
});

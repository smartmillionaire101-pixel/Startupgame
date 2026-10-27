import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripPicker } from '../src/city/CabinPicker';
import { airportSchedule, nextFlightTo, type CabinOption } from '../src/city/travel';

/**
 * Play-test round 6, #2: a trip to Accra booked from the Travel app was one
 * way by default (a return only when even first class both ways was
 * affordable), so the way home was charged again at the Accra airport; and a
 * ticket for 12:35 still boarded at 17:29.
 */

afterEach(cleanup);

const cabin = (c: CabinOption['cabin'], price: number): CabinOption => ({
  cabin: c,
  price,
  affordable: true,
  hours: 2,
  energy: 0,
  stress: 0,
  fun: 0,
  network: 0,
  lounge: c !== 'economy',
  chauffeur: c === 'first',
});
const fares = [
  cabin('economy', 38_300_000),
  cabin('business', 134_000_000),
  cabin('first', 268_000_000),
];

function picker(balance: number, onBook = vi.fn()) {
  render(
    <TripPicker
      city="Accra"
      cabins={fares}
      hotels={[]}
      fare={38_300_000}
      currency="NGN"
      balance={balance}
      busy={false}
      returnCabins={fares}
      homeName="Lagos"
      onBook={onBook}
      onCancel={() => undefined}
    />,
  );
  return onBook;
}

describe('booking a trip abroad', () => {
  it('is a return when the cabin you start on is affordable both ways', () => {
    // ₦4.6m: first class both ways (₦5.4m) is out of reach, economy both ways isn't.
    const onBook = picker(460_000_000);
    expect((screen.getByRole('radio', { name: 'Return' }) as HTMLInputElement).checked).toBe(true);
    // Business out: the way home follows it, and both legs are on the price.
    fireEvent.click(screen.getAllByRole('radio', { name: /Business/ })[0]!);
    const book = screen.getByRole('button', { name: /Book flight/ });
    expect(book.textContent).toContain('₦2.7m');
    fireEvent.click(book);
    expect(onBook).toHaveBeenCalledWith(null, 'business', 'business');
  });

  it('never leaves you stuck: the way home you can pay for, else one way', () => {
    // Business out and back is ₦2.68m; business out and economy home fits ₦1.8m.
    const onBook = picker(180_000_000);
    expect((screen.getByRole('radio', { name: 'Return' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getAllByRole('radio', { name: /Business/ })[0]!);
    const book = screen.getByRole('button', { name: /Book flight/ });
    expect((book as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(book);
    expect(onBook).toHaveBeenCalledWith(null, 'business', 'economy');
    cleanup();
    // ₦1.4m: business one way only.
    const one = picker(140_000_000);
    fireEvent.click(screen.getAllByRole('radio', { name: /Business/ })[0]!);
    expect((screen.getByRole('radio', { name: 'One way' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Book flight/ }));
    expect(one).toHaveBeenCalledWith(null, 'business', null);
  });

  it('says so when it is one way', () => {
    picker(50_000_000);
    expect((screen.getByRole('radio', { name: 'One way' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/the flight home isn’t booked/)).toBeTruthy();
  });
});

describe('the next flight', () => {
  it('is always one still to leave', () => {
    const schedule = airportSchedule('accra', '3:2026-10-27');
    const late = 23 * 60 + 30;
    const f = nextFlightTo(schedule, 'lagos', late)!;
    expect(f.city).toBe('lagos');
    expect(f.at).toBeGreaterThan(late);
    // After midnight it reads as the early hours.
    expect(f.time).toMatch(/^00:/);
    const noon = nextFlightTo(schedule, 'lagos', 6 * 60)!;
    expect(noon.at).toBeGreaterThan(6 * 60);
  });
});

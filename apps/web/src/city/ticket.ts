/**
 * Your plane ticket: where you're flying, booked before you go to the
 * airport. A real trip runs in this order: choose where to go (see the time
 * and the fare), book, go to the airport, check in for that flight, security,
 * the gate, fly.
 *
 * Paid tickets are stored by the server. Only flight display details are cached
 * on this device. Booking charges the fare; boarding consumes the ticket without
 * another charge. Cancellation refunds the original payment.
 */
import { useSyncExternalStore } from 'react';
import { useView } from '../store';
import { destinationsOf } from './travel';
import {
  airportSchedule,
  localMinutes,
  nextFlightTo,
  scheduleDay,
  type Destination,
} from './travel';

export interface Ticket {
  /** The city you fly from (a ticket bought elsewhere doesn't count here). */
  from: string;
  to: string;
  toName: string;
  /** Minor units of your home currency. */
  fare: number;
  currency: string;
  hours: number;
  /** "14:05", the airline and flight number, when known. */
  time?: string;
  airline?: string;
  flight?: string;
  gate?: string;
}

const KEY = 'runway.ticket';
const listeners = new Set<() => void>();

function load(): Ticket | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Ticket;
    return t && typeof t.from === 'string' && typeof t.to === 'string' ? t : null;
  } catch {
    return null;
  }
}

let ticket: Ticket | null = typeof window === 'undefined' ? null : load();

export const getTicket = () => ticket;

export function setTicket(next: Ticket | null) {
  ticket = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the ticket lasts for this page.
  }
  for (const l of listeners) l();
}

export function useTicket(): Ticket | null {
  const { view } = useView();
  const cached = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getTicket,
    getTicket,
  );
  const paid = view.me.flightTicket;
  if (!paid) return null;
  const dest = destinationsOf(view).find((d) => d.id === paid.to);
  if (!dest) return null;
  const detail =
    cached?.from === paid.from && cached.to === paid.to
      ? cached
      : ticketFor(paid.from, dest, view.market.currency, view.market.month);
  return { ...detail, fare: paid.paid };
}

/** The ticket if it's for a flight out of this city to one of these destinations. */
export function ticketFrom(
  t: Ticket | null,
  here: string,
  destinations: { id: string; done: boolean }[],
): Ticket | null {
  if (!t || t.from !== here) return null;
  const d = destinations.find((x) => x.id === t.to);
  return d && !d.done ? t : null;
}

/** A seat that stays the same for a ticket. */
export function seatOf(t: Ticket): string {
  let h = 0;
  for (const c of `${t.from}>${t.to}:${t.flight ?? ''}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${8 + (h % 24)}${'ACDF'[(h >>> 5) % 4]}`;
}

/** A ticket from here to a destination on today's next flight there (as the airport board shows it). */
export function ticketFor(
  here: string,
  d: Destination,
  currency: string,
  month: number,
  now = Date.now(),
): Ticket {
  const f = nextFlightTo(
    airportSchedule(here, scheduleDay(month, now)),
    d.id,
    localMinutes(here, now),
  );
  return {
    from: here,
    to: d.id,
    toName: d.name,
    fare: d.fare,
    currency,
    hours: d.hours,
    time: f?.time,
    airline: f?.airline,
    flight: f?.flight,
    gate: f?.gate,
  };
}

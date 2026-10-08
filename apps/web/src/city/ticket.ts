/**
 * Your plane ticket: where you're flying, booked before you go to the
 * airport. A real trip runs in this order: choose where to go (see the time
 * and the fare), book, go to the airport, check in for that flight, security,
 * the gate, fly.
 *
 * Wave 12 §D: the fare is charged when you book. The engine's `travel.book`
 * takes the money and holds the ticket in the world (`view.ticket`), so the
 * Travel app, the airport and the "Fly home" buttons all read the same
 * ticket on every device; boarding (`travel.board`) doesn't charge again,
 * `travel.cancel` refunds it minus a small fee before departure, and a
 * missed flight keeps the fare.
 */
import type { Command, PlayerView } from '@runway/engine';
import { useView } from '../store';
import {
  airportSchedule,
  localMinutes,
  nextFlightTo,
  scheduleDay,
  type Destination,
  type ScheduledFlight,
} from './travel';

export interface Ticket {
  /** The city you fly from (a ticket bought elsewhere doesn't count here). */
  from: string;
  to: string;
  toName: string;
  /** What you paid, minor units of `currency` (your home currency). */
  fare: number;
  currency: string;
  /** "14:05", the airline and flight number, when known. */
  time?: string;
  airline?: string;
  flight?: string;
  gate?: string;
  /** Epoch ms of the departure. */
  departAt: number;
  /** 'missed': the flight left without you (the fare is kept). */
  status: 'valid' | 'missed';
  /** What cancelling gives back now, and the fee kept. */
  refund: number;
  fee: number;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Your ticket as the server holds it (`view.ticket`), or null. */
export function ticketOf(view: PlayerView): Ticket | null {
  const t = (view as PlayerView & { ticket?: unknown }).ticket;
  if (!isObj(t) || typeof t.from !== 'string' || typeof t.to !== 'string') return null;
  return {
    from: t.from,
    to: t.to,
    toName: str(t.toName) ?? t.to,
    fare: num(t.fare),
    currency: str(t.currency) ?? '',
    time: str(t.time),
    airline: str(t.airline),
    flight: str(t.flight),
    gate: str(t.gate),
    departAt: num(t.departAt),
    status: t.status === 'missed' ? 'missed' : 'valid',
    refund: num(t.refund),
    fee: num(t.fee),
  };
}

/** Your ticket, from the view the game holds. */
export function useTicket(): Ticket | null {
  return ticketOf(useView().view);
}

/** The ticket if it's still good for a flight out of this city to one of these destinations. */
export function ticketFrom(
  t: Ticket | null,
  here: string,
  destinations: { id: string; done: boolean }[],
): Ticket | null {
  if (!t || t.from !== here || t.status !== 'valid') return null;
  const d = destinations.find((x) => x.id === t.to);
  return d && !d.done ? t : null;
}

/** A seat that stays the same for a ticket. */
export function seatOf(t: Pick<Ticket, 'from' | 'to' | 'flight'>): string {
  let h = 0;
  for (const c of `${t.from}>${t.to}:${t.flight ?? ''}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${8 + (h % 24)}${'ACDF'[(h >>> 5) % 4]}`;
}

/** Sales close this many minutes before departure. */
export const SALES_CLOSE_MIN = 15;

/**
 * The next flight to a city you can still buy a seat on: leaving at least
 * a quarter of an hour from now (else tomorrow's first).
 */
export function nextBookable(
  schedule: ScheduledFlight[],
  to: string,
  nowMin: number,
): ScheduledFlight | null {
  return nextFlightTo(schedule, to, nowMin + SALES_CLOSE_MIN);
}

/**
 * When a scheduled flight leaves, in epoch ms: today if it hasn't gone yet
 * (with its delay), else tomorrow at that time.
 */
export function departureOf(f: ScheduledFlight, here: string, now = Date.now()): number {
  const nowMin = localMinutes(here, now);
  const due = f.at + f.late;
  const ahead = due > nowMin ? due - nowMin : 24 * 60 - nowMin + due;
  return now - (now % 60_000) + ahead * 60_000;
}

/** The `travel.book` command for a destination's next flight from here (as the board shows it). */
export function bookCommand(
  here: string,
  d: Pick<Destination, 'id'>,
  month: number,
  now = Date.now(),
  flight?: ScheduledFlight | null,
): Command {
  const f =
    flight === undefined
      ? nextBookable(airportSchedule(here, scheduleDay(month, now)), d.id, localMinutes(here, now))
      : flight;
  return {
    type: 'travel.book',
    to: d.id,
    ...(f
      ? {
          departAt: departureOf(f, here, now),
          time: f.time,
          airline: f.airline.slice(0, 40),
          flight: f.flight.slice(0, 16),
          gate: f.gate.slice(0, 8),
        }
      : {}),
  } as Command;
}

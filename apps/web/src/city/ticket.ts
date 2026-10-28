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
import { destinationsOf, sellsCabins, type CabinTier } from './travel';
import { flightPartyTo } from './companions';
import { DAY_MIN, MONTH_MIN, flightNow, gameMinuteOf, useGameClock } from '../gameClock';
import {
  airportSchedule,
  clockOf,
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
  /** Minor units of your home currency. */
  fare: number;
  currency: string;
  hours: number;
  /** "14:05", the airline and flight number, when known. */
  time?: string;
  airline?: string;
  flight?: string;
  gate?: string;
  /** Holiday with friends: your seat on the host's flight, next to theirs (from the server). */
  seat?: string;
  /** The hotel booked with the flight (from the server), when there is one. */
  hotel?: { tier: string; name: string; paid: number; id?: string };
  /**
   * The cabin (from the server): business or first, or economy when the
   * server sells cabins. Missing: an older server, economy only.
   */
  cabin?: CabinTier;
  /**
   * First-class release: the way home booked with this ticket (from the
   * server): its cabin and fare, charged as its own leg. Missing: one way.
   */
  back?: { cabin: CabinTier; fare: number };
  /** This is the flight home on a return ticket, paid when the trip was booked. */
  prepaid?: boolean;
  /**
   * When the flight leaves, as a game minute (`gameMinuteOf`), set when it's
   * booked here. Missing: an older server's clock, or booked elsewhere.
   */
  departs?: number;
  /** The game minute the server booked it (from its `bookedAt`), when `departs` isn't known. */
  bookedMin?: number;
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

const LAST_KEY = 'runway.lastFlight';
let last: Ticket | null = null;

/**
 * The last ticket put away (flown, or cancelled): Arrivals shows that flight
 * on its board, from where it came. Check `to` against where you landed.
 */
export function lastFlight(): Ticket | null {
  if (last) return last;
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    const t = raw ? (JSON.parse(raw) as Ticket) : null;
    return t && typeof t.from === 'string' && typeof t.to === 'string' ? t : null;
  } catch {
    return null;
  }
}

export function setTicket(next: Ticket | null) {
  if (!next && ticket) last = ticket;
  ticket = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
    if (!next && last) sessionStorage.setItem(LAST_KEY, JSON.stringify(last));
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
      : ticketFor(
          paid.from,
          dest,
          view.market.currency,
          view.market.month,
          undefined,
          flightNow(view, paid.from),
        );
  // The server's ticket is the truth for what was paid, hotel included.
  const hotel = (paid as { hotel?: Ticket['hotel'] }).hotel;
  // …and for the flight when it has one: friends on holiday share the host's (./companions).
  const shown = (
    paid as { flight?: { airline?: string; number?: string; time?: string; gate?: string } }
  ).flight;
  const seat = flightPartyTo(view, paid.to)?.seat;
  const cabin = paid.cabin ?? (sellsCabins(view) ? 'economy' : undefined);
  // The return leg and the prepaid flight home (first-class release).
  const ret = (paid as { return?: { cabin?: string; paid?: number } }).return;
  const back =
    ret &&
    typeof ret.paid === 'number' &&
    ['economy', 'business', 'first'].includes(String(ret.cabin))
      ? { cabin: ret.cabin as CabinTier, fare: ret.paid }
      : undefined;
  const prepaid = (paid as { prepaid?: boolean }).prepaid === true;
  // When it was booked on the game clock, for a ticket booked elsewhere (a holiday
  // friend's flight, another tab): the time on it is the one after that.
  const bookedAt = (paid as { bookedAt?: number }).bookedAt;
  const clock = clockOf(view);
  const nowMin = gameMinuteOf(view);
  const bookedMin =
    detail.departs === undefined && clock && nowMin !== null && typeof bookedAt === 'number'
      ? nowMin - Math.max(0, Math.floor(((clock.serverNow - bookedAt) / clock.monthMs) * MONTH_MIN))
      : undefined;
  return {
    ...detail,
    ...(shown?.number
      ? { time: shown.time, airline: shown.airline, flight: shown.number, gate: shown.gate }
      : {}),
    ...(seat ? { seat } : {}),
    fare: paid.paid,
    hotel: hotel ?? undefined,
    cabin,
    back,
    ...(prepaid ? { prepaid } : {}),
    ...(bookedMin !== undefined ? { bookedMin } : {}),
  };
}

/**
 * When a flight booked now leaves, as a game minute: `f` as `nextFlightTo`
 * found it after `minutes` (the time of day at game minute `at`, both from the
 * same view). Undefined without a game clock.
 */
export function departsOf(
  f: Pick<ScheduledFlight, 'at' | 'late'> | null | undefined,
  at: number | null,
  minutes: number,
): number | undefined {
  return f && at !== null ? at - minutes + f.at + f.late : undefined;
}

/** "14:05" → minutes after midnight, or null. */
function clockMin(time?: string): number | null {
  const m = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  return m ? (Number(m[1]) * 60 + Number(m[2])) % DAY_MIN : null;
}

/**
 * Has the departure time on a ticket you hold passed? A held ticket never
 * expires or goes missed: the plane leaves once you've checked in and
 * boarded, whenever that is, and the airport says "Boarding now · we waited
 * for you" instead of "Departed" (play-test: a game hour is about two real
 * minutes, so the time passed on the ride to the airport).
 *
 * `now`: the game minute (null without a game clock); `ofDay`: the time of
 * day the airports keep (`flightNow`). Without the game minute the ticket's
 * time counts as passed for six hours after it (a flight after midnight,
 * booked late in the evening, is still to come).
 */
export function waitedFor(
  ticket: Pick<Ticket, 'time' | 'departs' | 'bookedMin'> | null,
  now: number | null,
  ofDay: number,
): boolean {
  if (!ticket) return false;
  if (now !== null && ticket.departs !== undefined) return now >= ticket.departs;
  const dep = clockMin(ticket.time);
  if (dep === null) return false;
  if (now !== null && ticket.bookedMin !== undefined) {
    const b = ticket.bookedMin;
    return now >= b + ((((dep - b) % DAY_MIN) + DAY_MIN) % DAY_MIN);
  }
  return (((ofDay - dep) % DAY_MIN) + DAY_MIN) % DAY_MIN < 6 * 60;
}

/** `waitedFor` on the game clock, as it ticks. */
export function useWaitedFor(ticket: Ticket | null, marketId: string): boolean {
  const { view } = useView();
  const clock = useGameClock(view, marketId);
  return waitedFor(ticket, clock.min, Math.floor(clock.hour * 60) % DAY_MIN);
}

// The flight to choose at the ticket desk when you get to the airport ("Fly home"
// without a return ticket: the cabins and their fares are shown before anything is paid).
let deskPick: string | null = null;
export function chooseAtDesk(to: string | null) {
  deskPick = to;
}
/** The destination to open at the desk (the desk forgets it once it has opened). */
export const deskPicked = (): string | null => deskPick;

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
  if (t.seat) return t.seat;
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
  /** The time of day (minutes) to take the next flight after: the game clock's (`flightNow`). */
  minutes = localMinutes(here, now),
  /** The game minute at `minutes` (`gameMinuteOf`), to know when the flight leaves. */
  at: number | null = null,
): Ticket {
  const f = nextFlightTo(airportSchedule(here, scheduleDay(month, now)), d.id, minutes);
  const departs = departsOf(f, at, minutes);
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
    ...(departs !== undefined ? { departs } : {}),
  };
}

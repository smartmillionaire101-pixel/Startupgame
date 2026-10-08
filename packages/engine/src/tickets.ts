/**
 * Wave 12 §D: fares charged when booked.
 *
 * - `travel.book` charges the one-way fare at once (to the home market's
 *   suppliers, the same sink `travel.fly` pays) and issues a ticket held on
 *   the player: where from and to, the flight, and when it departs.
 * - Boarding with a valid ticket (`travel.board`, or `travel.fly` to the
 *   ticket's destination) flies you without charging again.
 * - `travel.cancel` before departure refunds the fare minus a small fee.
 * - A ticket expires when its flight has left: a missed flight keeps the fare.
 *
 * `travel.fly` without a ticket still charges at boarding ("Fly now", and
 * logged replays from before tickets existed behave exactly as before).
 */
import type { MarketId } from './data/markets.js';
import { ensure } from './errors.js';
import { getMarket, locationOf } from './helpers.js';
import { account, pay } from './ledger.js';
import { formatMoney } from './money.js';
import { fly, flightFare, FLIGHT_HOURS, MAX_FLIGHTS_PER_MONTH } from './travel.js';
import type { FlightTicket, Player, World } from './types.js';

/** A flight can be booked up to this far ahead. */
export const BOOK_AHEAD_MS = 36 * 3_600_000;
/** With no departure given, the flight leaves this long after booking. */
export const DEFAULT_DEPARTURE_MS = 2 * 3_600_000;
/** Boarding stays open this long after the scheduled departure (clock skew, a dash to the gate). */
export const BOARDING_GRACE_MS = 5 * 60_000;
/** Cancelling keeps this share of the fare (rounded up). */
export const CANCEL_FEE_SHARE = 0.1;

export interface BookInput {
  to: MarketId;
  departAt?: number;
  flight?: string;
  airline?: string;
  gate?: string;
  time?: string;
}

/** Has the ticket's flight left (boarding closed)? */
export const ticketExpired = (t: FlightTicket, now: number) => now > t.departAt + BOARDING_GRACE_MS;

/** The fee kept when a ticket is cancelled. */
export const cancelFee = (fare: number) => Math.min(fare, Math.ceil(fare * CANCEL_FEE_SHARE));

const flightsUsed = (world: World, p: Player) => {
  const home = getMarket(world, p.market);
  return p.flights?.month === home.month ? p.flights.count : 0;
};

/** Book a flight: the fare is charged now and a ticket is issued. */
export function book(world: World, p: Player, input: BookInput, now: number) {
  const home = getMarket(world, p.market);
  const from = locationOf(p);
  const to = input.to;
  const dest = world.markets[to];
  ensure(dest, 'travel.closed', 'That market isn’t open yet.');
  ensure(to !== from, 'travel.here', `You’re already in ${dest.data.name}.`);
  const held = p.ticket;
  ensure(
    !held || ticketExpired(held, now),
    'travel.ticket',
    `You already have a ticket to ${held ? getMarket(world, held.to).data.name : ''}. Cancel it first.`,
  );
  const goingHome = to === p.market;
  ensure(
    flightsUsed(world, p) < MAX_FLIGHTS_PER_MONTH || goingHome,
    'travel.flights',
    `That’s ${MAX_FLIGHTS_PER_MONTH} flights this month. Stay a while.`,
  );
  const departAt = input.departAt ?? now + DEFAULT_DEPARTURE_MS;
  ensure(
    departAt >= now && departAt <= now + BOOK_AHEAD_MS,
    'travel.departure',
    'That flight isn’t on sale. Choose one from today’s board.',
  );
  const fare = flightFare(world, p, to);
  const bal = Math.max(0, account(world, p.accounts.local).balance);
  // Nobody is stranded abroad: short of the fare home, you fly standby for what you have.
  const cost = goingHome ? Math.min(fare, bal) : fare;
  ensure(
    bal >= cost,
    'travel.funds',
    `The flight costs ${formatMoney(cost, home.data.currency)}; you don’t have it.`,
  );
  const memo = `Flight ticket ${getMarket(world, from).data.name} → ${dest.data.name}`;
  pay(world, p.accounts.local, home.ext.suppliers, cost, memo, home.month);
  p.ticket = {
    from,
    to,
    departAt,
    bookedAt: now,
    fare: cost,
    currency: account(world, p.accounts.local).currency,
    account: home.ext.suppliers,
    ...(input.flight ? { flight: input.flight } : {}),
    ...(input.airline ? { airline: input.airline } : {}),
    ...(input.gate ? { gate: input.gate } : {}),
    ...(input.time ? { time: input.time } : {}),
  };
  return {
    ticket: ticketView(world, p, now),
    charged: cost,
    currency: home.data.currency,
    text: `Booked: ${getMarket(world, from).data.name} → ${dest.data.name}. ${formatMoney(cost, home.data.currency)} charged.`,
  };
}

/** Board the flight on your ticket: you fly, and nothing more is charged. */
export function board(world: World, p: Player, now: number) {
  const t = p.ticket;
  ensure(t, 'travel.noticket', 'You don’t have a ticket. Book a flight first.');
  ensure(!ticketExpired(t, now), 'travel.missed', 'Your flight has left. Book another one.');
  const here = locationOf(p);
  ensure(
    t.from === here,
    'travel.ticket.from',
    `Your ticket flies from ${getMarket(world, t.from).data.name}.`,
  );
  const home = getMarket(world, p.market);
  const dest = getMarket(world, t.to);
  const used = flightsUsed(world, p);
  ensure(
    used < MAX_FLIGHTS_PER_MONTH || t.to === p.market,
    'travel.flights',
    `That’s ${MAX_FLIGHTS_PER_MONTH} flights this month. Stay a while.`,
  );
  delete p.ticket;
  p.flights = { month: home.month, count: used + 1 };
  if (t.to === p.market) delete p.location;
  else {
    p.location = { market: t.to, since: now };
    p.visited[t.to] = home.month;
  }
  return {
    cost: 0,
    fare: t.fare,
    currency: home.data.currency,
    hours: FLIGHT_HOURS,
    from: here,
    to: t.to,
    ticketUsed: true,
    location: p.location ? { market: t.to, name: dest.data.name, sinceAt: now } : null,
    text:
      t.to === p.market
        ? `Welcome home to ${dest.data.name}.`
        : `You’ve landed in ${dest.data.name}.`,
  };
}

/**
 * `travel.fly`: with a valid ticket for this flight (from here to `to`) you
 * board on it; otherwise you buy the fare at the gate, as before tickets.
 */
export function flyOrBoard(world: World, p: Player, to: MarketId, now: number) {
  const t = p.ticket;
  if (t && t.to === to && t.from === locationOf(p) && !ticketExpired(t, now))
    return board(world, p, now);
  return fly(world, p, to, now);
}

/** Cancel your ticket before it departs: the fare comes back minus a small fee. */
export function cancel(world: World, p: Player, now: number) {
  const t = p.ticket;
  ensure(t, 'travel.noticket', 'You don’t have a ticket.');
  ensure(
    !ticketExpired(t, now),
    'travel.missed',
    'That flight has left; the fare isn’t refundable.',
  );
  const home = getMarket(world, p.market);
  const fee = cancelFee(t.fare);
  const refund = t.fare - fee;
  // From the airline (the suppliers it was paid to), converted if you've moved since.
  const received = pay(
    world,
    t.account,
    p.accounts.local,
    refund,
    `Flight refund ${getMarket(world, t.from).data.name} → ${getMarket(world, t.to).data.name}`,
    home.month,
    'move',
  );
  delete p.ticket;
  const cur = account(world, p.accounts.local).currency;
  return {
    refund: received,
    fee,
    currency: cur,
    text: `Ticket cancelled. ${formatMoney(received, cur)} refunded (fee ${formatMoney(fee, t.currency)}).`,
  };
}

/** Your ticket for the client: the flight, the fare paid, and whether it's still good. */
export function ticketView(world: World, p: Player, now: number) {
  const t = p.ticket;
  if (!t) return null;
  const expired = ticketExpired(t, now);
  return {
    from: t.from,
    fromName: getMarket(world, t.from).data.name,
    to: t.to,
    toName: getMarket(world, t.to).data.name,
    departAt: t.departAt,
    bookedAt: t.bookedAt,
    fare: t.fare,
    currency: t.currency,
    flight: t.flight ?? null,
    airline: t.airline ?? null,
    gate: t.gate ?? null,
    time: t.time ?? null,
    status: expired ? ('missed' as const) : ('valid' as const),
    /** What cancelling gives back now (0 once the flight has left). */
    refund: expired ? 0 : t.fare - cancelFee(t.fare),
    fee: cancelFee(t.fare),
  };
}

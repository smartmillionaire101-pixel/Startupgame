/**
 * Travel and relocation (§14).
 *
 * - Travel: a short trip to another market costs money and hours. Nothing
 *   transfers; the player returns home. A trip is required at least once
 *   before investing or acquiring across markets, and lets a founder pitch
 *   that market's investors during the trip month.
 * - Relocation: permanent, at the cost of half of everything. The lost half
 *   goes to the central bank of the market being left. Companies left behind
 *   are run by remaining co-founders or an AI CEO, and pay dividends only
 *   while profitable.
 */
import type { MarketId } from './data/markets.js';
import { ensure } from './errors.js';
import {
  achieve,
  col,
  hoursLeft,
  holderAccount,
  getMarket,
  locationOf,
  notify,
  spendHours,
  usdToLocal,
} from './helpers.js';
import {
  forgetOwners,
  account,
  convert,
  costIn,
  keepStatement,
  openAccount,
  pay,
  payExact,
  transfer,
} from './ledger.js';
import { barsOf, bumpEnergy, bumpHealth, bumpStress } from './lifebars.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { bumpNeed, needsOf } from './needs.js';
import { bankersOn, investorOn } from './releases.js';
import { addContact } from './events.js';
import { checkName, normaliseName } from './names.js';
import { waterfall } from './captable.js';
import type { Company, HotelStay, Id, Player, TicketFlight, World } from './types.js';
import { hasVisa } from './places.js';

const TRIP_HOURS = 40;

const REGION: Record<MarketId, string> = {
  lagos: 'west-africa',
  accra: 'west-africa',
  freetown: 'west-africa',
  nairobi: 'east-africa',
  kigali: 'east-africa',
  johannesburg: 'southern-africa',
  cairo: 'north-africa',
  dubai: 'gulf',
  london: 'europe',
  'san-francisco': 'north-america',
};

/** Round-trip cost in USD: flights, a hotel and a week of meetings. */
export function tripCostUsd(from: MarketId, to: MarketId): number {
  if (REGION[from] === REGION[to]) return 500;
  const africa = (m: MarketId) => REGION[m]!.endsWith('africa');
  if (africa(from) && africa(to)) return 1_200;
  return 2_200;
}

/** Has the player ever been to this market (home counts)? */
export const hasVisited = (p: Player, market: MarketId) =>
  p.market === market || p.visited[market] !== undefined;

export { locationOf };

/**
 * Is the player in this market: home, there now (Wave 4 flights), or on a
 * trip there this month (§14 trips)?
 */
export const isVisiting = (world: World, p: Player, market: MarketId) =>
  p.market === market ||
  p.location?.market === market ||
  p.visited[market] === getMarket(world, p.market).month;

// ---------------------------------------------------------------- Flights (Wave 4)

/** Wave 5: flights cost money only (no hours). Kept for older clients. */
export const FLIGHT_HOURS = 0;
export const MAX_FLIGHTS_PER_MONTH = 6;

/** One-way fare in USD: half a round trip (§14). */
export const flightFareUsd = (from: MarketId, to: MarketId) => tripCostUsd(from, to) / 2;

/** One-way fare from where the player is now, in their home currency (minor units). */
export function flightFare(world: World, p: Player, to: MarketId): number {
  return usdToLocal(world, getMarket(world, p.market), flightFareUsd(locationOf(p), to));
}

/** Fares from where the player is to every other open market. */
export function flightsView(world: World, p: Player) {
  const here = locationOf(p);
  const fareTo: Partial<Record<MarketId, number>> = {};
  for (const id of Object.keys(world.markets) as MarketId[])
    if (id !== here) fareTo[id] = flightFare(world, p, id);
  if (!investorOn(world)) return { fareTo, hours: FLIGHT_HOURS };
  // Cabin classes (the investor release): each fare per class, and what each one does.
  const balance = Math.max(0, account(world, p.accounts.local).balance);
  const cabinTo: Partial<Record<MarketId, CabinOption[]>> = {};
  for (const id of Object.keys(fareTo) as MarketId[])
    cabinTo[id] = CABIN_CLASSES.map((cabin) => {
      const price = cabinFare(world, p, id, cabin);
      const fx = cabinEffects(cabin, here, id);
      return {
        cabin,
        price,
        // Economy home is never refused (standby for what you have).
        affordable: balance >= price || (cabin === 'economy' && id === p.market),
        hours: CABIN[cabin].hours,
        ...fx,
        network: CABIN[cabin].network,
        lounge: CABIN[cabin].lounge,
        chauffeur: CABIN[cabin].chauffeur,
      };
    });
  if (!bankersOn(world)) return { fareTo, hours: FLIGHT_HOURS, cabinTo };
  // The first-class release: the way home priced per cabin from each city (a
  // return booked with the flight out), the return you hold, the cabin you
  // flew out in, the lounge while you hold a business or first ticket, and
  // what you can still do on the business or first flight you just took.
  const returnTo: Partial<Record<MarketId, CabinOption[]>> = {};
  for (const id of Object.keys(fareTo) as MarketId[])
    if (id !== p.market)
      returnTo[id] = CABIN_CLASSES.map((cabin) => {
        const price = legFare(world, p, id, p.market, cabin);
        return {
          cabin,
          price,
          affordable: balance >= price,
          hours: CABIN[cabin].hours,
          ...cabinEffects(cabin, id, p.market),
          network: CABIN[cabin].network,
          lounge: CABIN[cabin].lounge,
          chauffeur: CABIN[cabin].chauffeur,
        };
      });
  return {
    fareTo,
    hours: FLIGHT_HOURS,
    cabinTo,
    returnTo,
    heldReturn: p.location?.returnLeg ? { ...p.location.returnLeg } : null,
    lastCabin: p.location?.cabin ?? null,
    lounge: loungeView(world, p),
    inflight: inflightView(world, p),
  };
}

// ---------------------------------------------------------------- Cabin classes

/**
 * Economy, business or first (the investor release, `investorOn`). A ticket
 * without a cabin is economy, and worlds without the note fly exactly as
 * before: no time lost to the airport and no change to how you feel on landing.
 *
 * - Economy: the fare as it always was. Queues and a cramped seat: two hours
 *   lost to the airport, and you land tired and a little stressed.
 * - Business: 3.5× the fare. Priority lanes and the lounge (an hour), a
 *   lie-flat seat: you land nearly fresh, and meet someone up front.
 * - First: 7× the fare. Private check-in, the lounge, a suite with a bed and
 *   a chauffeur on arrival: no time lost, you land rested and happy, and the
 *   people in the lounge are worth knowing. A milestone the first time.
 *
 * The effects scale with the flight's length: half on a short regional hop,
 * three quarters within Africa, in full on a long haul. Fares are set in USD
 * and charged in your home currency, like every fare.
 */
export type CabinClass = 'economy' | 'business' | 'first';
export const CABIN_CLASSES: readonly CabinClass[] = ['economy', 'business', 'first'];

export interface CabinSpec {
  /** Times the economy fare. */
  fare: number;
  /** Hours the month loses to the airport (queues, boarding). */
  hours: number;
  /** On landing, for a long haul (scaled down for shorter flights). */
  energy: number;
  stress: number;
  fun: number;
  /** Network points from the people in the lounge and up front. */
  network: number;
  lounge: boolean;
  chauffeur: boolean;
}

export const CABIN: Record<CabinClass, CabinSpec> = {
  economy: {
    fare: 1,
    hours: 2,
    energy: -10,
    stress: 5,
    fun: 0,
    network: 0,
    lounge: false,
    chauffeur: false,
  },
  business: {
    fare: 3.5,
    hours: 1,
    energy: -3,
    stress: 1,
    fun: 6,
    network: 1,
    lounge: true,
    chauffeur: false,
  },
  first: {
    fare: 7,
    hours: 0,
    energy: 6,
    stress: -6,
    fun: 14,
    network: 2,
    lounge: true,
    chauffeur: true,
  },
};

export interface CabinOption {
  cabin: CabinClass;
  /** One way, minor units of the player's home currency. */
  price: number;
  affordable: boolean;
  hours: number;
  energy: number;
  stress: number;
  fun: number;
  network: number;
  lounge: boolean;
  chauffeur: boolean;
}

/** A one-way fare in this cabin, in the player's home currency (minor units). */
export function cabinFare(world: World, p: Player, to: MarketId, cabin: CabinClass): number {
  if (cabin === 'economy') return flightFare(world, p, to);
  return usdToLocal(
    world,
    getMarket(world, p.market),
    flightFareUsd(locationOf(p), to) * CABIN[cabin].fare,
  );
}

/** One leg between any two cities in this cabin, in the player's home currency (minor units). */
export function legFare(
  world: World,
  p: Player,
  from: MarketId,
  to: MarketId,
  cabin: CabinClass,
): number {
  return usdToLocal(
    world,
    getMarket(world, p.market),
    flightFareUsd(from, to) * (cabin === 'economy' ? 1 : CABIN[cabin].fare),
  );
}

/** How long the flight is, as a share of a long haul (short hop, within Africa, long haul). */
const haulOf = (from: MarketId, to: MarketId) => {
  const usd = tripCostUsd(from, to);
  return usd <= 500 ? 0.5 : usd <= 1_200 ? 0.75 : 1;
};

/** What landing in this cabin does to energy, stress and fun. */
export function cabinEffects(cabin: CabinClass, from: MarketId, to: MarketId) {
  const k = haulOf(from, to);
  const c = CABIN[cabin];
  return {
    energy: Math.round(c.energy * k),
    stress: Math.round(c.stress * k),
    fun: Math.round(c.fun * k),
  };
}

const CABIN_NAME: Record<CabinClass, string> = {
  economy: 'Economy',
  business: 'Business',
  first: 'First class',
};

/**
 * On landing (investor release, humans only): the cabin's time, how you feel
 * and who you met. Never refuses: with too few hours left it uses what's left.
 */
function landIn(world: World, p: Player, cabin: CabinClass, from: MarketId, to: MarketId) {
  const c = CABIN[cabin];
  const fx = cabinEffects(cabin, from, to);
  const hours = Math.round(Math.min(c.hours, Math.max(0, hoursLeft(p))) * 100) / 100;
  p.hours.used += hours;
  const energy = fx.energy ? Math.round(bumpEnergy(p, fx.energy)) : 0;
  const stress = fx.stress ? Math.round(bumpStress(p, fx.stress)) : 0;
  const fun = fx.fun ? bumpNeed(p, 'fun', fx.fun) : 0;
  if (c.network) p.network = Math.min(100, p.network + c.network);
  const month = getMarket(world, p.market).month;
  if (cabin === 'first') achieve(world, p, 'lifestyle.first-class', 'Flew first class', month);
  if (cabin === 'business')
    achieve(world, p, 'lifestyle.business-class', 'Flew business class', month);
  return {
    cabin,
    hours,
    energy,
    stress,
    fun,
    network: c.network,
    lounge: c.lounge,
    chauffeur: c.chauffeur,
    bars: barsOf(p),
  };
}

/** One line on how the flight went, for the landing message. */
function landingLine(l: { cabin: CabinClass; energy: number; chauffeur: boolean }) {
  const feel =
    l.cabin === 'first'
      ? 'You slept in a real bed and step off rested.'
      : l.cabin === 'business'
        ? 'You lay flat for most of it and land fairly fresh.'
        : 'A cramped seat: you land tired.';
  const energy = l.energy ? ` Energy ${l.energy > 0 ? '+' : ''}${l.energy}.` : '';
  return `${feel}${energy}${l.chauffeur ? ' Your chauffeur is waiting.' : ''}`;
}

// ---------------------------------------------------------------- The lounge and the flight (first-class release)

/**
 * What a moment in the lounge or on board does to you. Needs (hunger,
 * hygiene, fun, social), the life bars (energy, stress, health), network
 * points, and on board hours given back to the month (working).
 */
export interface PremiumFx {
  energy?: number;
  stress?: number;
  health?: number;
  hunger?: number;
  hygiene?: number;
  fun?: number;
  social?: number;
  network?: number;
  hours?: number;
}

export type LoungeAct = 'dine' | 'drink' | 'shower' | 'rest' | 'mingle';
export const LOUNGE_ACTS: readonly LoungeAct[] = ['dine', 'drink', 'shower', 'rest', 'mingle'];

/**
 * The business and first class lounges (bankers note): each act once per
 * ticket. First class is the bigger version of each: à la carte dining, the
 * champagne bar, a shower suite, a quiet room with daybeds, and the people
 * flying up front.
 */
export const LOUNGE_FX: Record<LoungeAct, Record<'business' | 'first', PremiumFx>> = {
  dine: { business: { hunger: 30, fun: 2 }, first: { hunger: 40, fun: 5 } },
  drink: {
    business: { fun: 5, stress: -3, social: 2 },
    first: { fun: 8, stress: -4, social: 4 },
  },
  shower: { business: { hygiene: 35 }, first: { hygiene: 45, stress: -2 } },
  rest: { business: { energy: 6, stress: -3 }, first: { energy: 10, stress: -5 } },
  mingle: { business: { social: 12, network: 1 }, first: { social: 18, network: 1 } },
};

const LOUNGE_LINE: Record<LoungeAct, Record<'business' | 'first', string>> = {
  dine: {
    business: 'A hot plate from the buffet.',
    first: 'Lunch à la carte at a table by the window.',
  },
  drink: { business: 'A glass at the bar.', first: 'A glass of champagne at the bar.' },
  shower: {
    business: 'A hot shower: you feel fresh.',
    first: 'The shower suite: rain shower, fresh towels, you feel new.',
  },
  rest: {
    business: 'A rest in a quiet armchair.',
    first: 'A nap on a daybed in the quiet room.',
  },
  mingle: {
    business: 'You chat with the travellers by the window.',
    first: 'You meet the people flying up front.',
  },
};

export type InflightAct = 'dine' | 'sleep' | 'watch' | 'work' | 'bar' | 'spa';
export const INFLIGHT_ACTS: readonly InflightAct[] = [
  'dine',
  'sleep',
  'watch',
  'work',
  'bar',
  'spa',
];

/**
 * On board a business or first flight (bankers note): how you spend it. Each
 * once per flight, sleep or work (not both), scaled by the flight's length
 * like the cabin's own effects. The onboard bar and the shower spa are first
 * class on a long haul only. Work gives hours back to the month.
 */
export const INFLIGHT_FX: Record<InflightAct, Partial<Record<'business' | 'first', PremiumFx>>> = {
  dine: { business: { hunger: 35, fun: 3 }, first: { hunger: 45, fun: 6 } },
  sleep: {
    business: { energy: 12, stress: -5 },
    first: { energy: 20, stress: -8, health: 2 },
  },
  watch: { business: { fun: 8, stress: -3 }, first: { fun: 10, stress: -4 } },
  work: { business: { hours: 2, energy: -4 }, first: { hours: 3, energy: -3 } },
  bar: { first: { social: 15, fun: 6, network: 1 } },
  spa: { first: { hygiene: 40, stress: -4 } },
};

const INFLIGHT_LINE: Record<InflightAct, Record<'business' | 'first', string>> = {
  dine: {
    business: 'Three courses on china, served at your seat.',
    first: 'The chef’s menu, course by course, with champagne.',
  },
  sleep: {
    business: 'You lie flat and sleep for most of the flight.',
    first: 'Turndown service: a real bed, pyjamas, the doors closed. You sleep well.',
  },
  watch: {
    business: 'A film on your screen with noise-cancelling headphones.',
    first: 'A film on your wide screen, feet up.',
  },
  work: {
    business: 'You clear your inbox at your seat.',
    first: 'You work at your desk in the suite, undisturbed.',
  },
  bar: { business: '', first: 'A drink at the onboard bar with other passengers.' },
  spa: { business: '', first: 'A shower in the onboard spa before landing.' },
};

/** Apply a moment's effects (scaled by `k`); returns what changed, rounded. */
function applyPremium(p: Player, fx: PremiumFx, k = 1): PremiumFx {
  const n = (x?: number) => (x ? Math.round(x * k) : 0);
  const out: PremiumFx = {};
  const energy = n(fx.energy);
  if (energy) out.energy = Math.round(bumpEnergy(p, energy));
  const stress = n(fx.stress);
  if (stress) out.stress = Math.round(bumpStress(p, stress));
  const health = n(fx.health);
  if (health) out.health = Math.round(bumpHealth(p, health));
  for (const key of ['hunger', 'hygiene', 'fun', 'social'] as const) {
    const by = n(fx[key]);
    if (by) out[key] = bumpNeed(p, key, by);
  }
  if (fx.network) {
    const before = p.network;
    p.network = Math.min(100, p.network + fx.network);
    out.network = p.network - before;
  }
  const hours = n(fx.hours);
  if (hours) {
    const before = p.hours.used;
    p.hours.used = Math.max(0, Math.round((before - hours) * 100) / 100);
    out.hours = Math.round((before - p.hours.used) * 100) / 100;
  }
  return out;
}

/** Other players waiting in your lounge: flying from here in your cabin (first) or up front (business). */
export function loungeGuests(world: World, p: Player) {
  const mine = p.flightTicket?.cabin;
  if (!mine) return [];
  const here = locationOf(p);
  return Object.values(world.players)
    .filter(
      (o) =>
        o.id !== p.id &&
        !o.ai &&
        o.flightTicket?.cabin &&
        o.flightTicket.from === here &&
        locationOf(o) === here &&
        (mine === 'business' || o.flightTicket.cabin === 'first'),
    )
    .slice(0, 8)
    .map((o) => ({
      id: o.id,
      name: o.name,
      cabin: o.flightTicket!.cabin!,
      to: o.flightTicket!.to,
      toName: getMarket(world, o.flightTicket!.to).data.name,
    }));
}

/** The lounge while you hold a business or first ticket (null otherwise). */
export function loungeView(world: World, p: Player) {
  const ticket = p.flightTicket;
  if (!bankersOn(world) || !ticket?.cabin) return null;
  const cabin = ticket.cabin;
  return {
    cabin,
    done: [...(ticket.lounge ?? [])],
    acts: LOUNGE_ACTS.map((act) => ({ act, ...LOUNGE_FX[act][cabin] })),
    guests: loungeGuests(world, p),
  };
}

/** Something to do in the lounge before boarding (bankers note). */
export function loungeAct(world: World, p: Player, act: LoungeAct, withId?: Id) {
  const ticket = p.flightTicket;
  ensure(
    ticket?.cabin,
    'travel.lounge',
    'The lounge is for business and first class tickets. Wait at the gate.',
  );
  const cabin = ticket.cabin;
  const done = (ticket.lounge ??= []);
  ensure(
    !done.includes(act),
    'travel.lounge.done',
    'You’ve done that already. Your flight is called soon.',
  );
  const month = getMarket(world, p.market).month;
  let met: { id: Id; name: string } | undefined;
  if (act === 'mingle' && withId) {
    const guest = loungeGuests(world, p).find((g) => g.id === withId);
    ensure(guest, 'travel.lounge.guest', 'They’re not in the lounge any more.');
    const other = world.players[guest.id]!;
    met = { id: other.id, name: other.name };
    addContact(p, { kind: 'player', refId: other.id, name: other.name, warmth: 0.08 }, month);
    addContact(other, { kind: 'player', refId: p.id, name: p.name, warmth: 0.08 }, month);
    notify(world, other.id, {
      month: getMarket(world, other.market).month,
      kind: 'meeting',
      text: `${p.name} came over to say hello in the lounge.`,
      from: p.id,
    });
  }
  const changes = applyPremium(p, LOUNGE_FX[act][cabin]);
  done.push(act);
  const line = met ? `You and ${met.name} get talking over a drink.` : LOUNGE_LINE[act][cabin];
  return {
    act,
    cabin,
    changes,
    ...(met ? { met } : {}),
    done: [...done],
    bars: barsOf(p),
    needs: needsOf(p),
    text: line,
  };
}

/** What you can still do on the business or first flight you just took (null when none). */
export function inflightView(world: World, p: Player) {
  const f = p.lastFlight;
  if (!bankersOn(world) || !f || f.month !== getMarket(world, p.market).month) return null;
  const k = haulOf(f.from, f.to);
  return {
    cabin: f.cabin,
    from: f.from,
    to: f.to,
    longHaul: k === 1,
    done: [...f.acts],
    acts: INFLIGHT_ACTS.filter((act) => inflightOffered(act, f.cabin, k)).map((act) => {
      const fx = INFLIGHT_FX[act][f.cabin]!;
      const scaled = Object.fromEntries(
        Object.entries(fx).map(([key, v]) => [key, key === 'network' ? v : Math.round(v * k)]),
      ) as PremiumFx;
      return { act, ...scaled };
    }),
  };
}

const inflightOffered = (act: InflightAct, cabin: 'business' | 'first', k: number) =>
  !!INFLIGHT_FX[act][cabin] && (act !== 'bar' && act !== 'spa' ? true : k === 1);

/**
 * How you spend the business or first flight you just took (bankers note):
 * its effects land with you. Each act once; sleep or work, not both.
 */
export function inflightAct(world: World, p: Player, act: InflightAct) {
  const f = p.lastFlight;
  ensure(
    f && f.month === getMarket(world, p.market).month,
    'travel.inflight',
    'That’s for business and first class flights.',
  );
  const k = haulOf(f.from, f.to);
  ensure(
    inflightOffered(act, f.cabin, k),
    'travel.inflight.offer',
    act === 'bar'
      ? 'There’s no onboard bar on this flight.'
      : act === 'spa'
        ? 'There’s no shower on this flight.'
        : 'That isn’t offered on this flight.',
  );
  ensure(!f.acts.includes(act), 'travel.inflight.done', 'You’ve done that on this flight already.');
  ensure(
    !(act === 'sleep' && f.acts.includes('work')) && !(act === 'work' && f.acts.includes('sleep')),
    'travel.inflight.time',
    act === 'sleep'
      ? 'You worked through the night: no time left to sleep.'
      : 'You slept through: no time left to work.',
  );
  const changes = applyPremium(p, INFLIGHT_FX[act][f.cabin]!, k);
  f.acts.push(act);
  return {
    act,
    cabin: f.cabin,
    changes,
    done: [...f.acts],
    bars: barsOf(p),
    needs: needsOf(p),
    text: INFLIGHT_LINE[act][f.cabin],
  };
}

// ---------------------------------------------------------------- Hotels

export type HotelTier = HotelStay['tier'];
export const HOTEL_TIERS: readonly HotelTier[] = ['budget', 'business', 'luxury'];

/** A stay abroad in USD, before the city's cost-of-living factor. */
const HOTEL_BASE_USD: Record<HotelTier, number> = {
  budget: 150,
  business: 500,
  luxury: 1_800,
};

/** Cost-of-living card (1–5) to a hotel price factor: Freetown is cheaper than London. */
const HOTEL_COL_FACTOR: Record<number, number> = { 1: 0.6, 2: 0.7, 3: 0.85, 4: 1, 5: 1.2 };

/** Hotel names per city: guesthouse, business hotel, five-star. */
const HOTEL_NAMES: Record<MarketId, Record<HotelTier, string>> = {
  lagos: { budget: 'Ikoyi Guesthouse', business: 'Eko Business Hotel', luxury: 'The Lagos Grand' },
  nairobi: {
    budget: 'Kilimani Guesthouse',
    business: 'Westlands Business Hotel',
    luxury: 'The Nairobi Serena Grand',
  },
  london: {
    budget: 'Camden Guesthouse',
    business: 'Canary Wharf Business Hotel',
    luxury: 'The Mayfair Grand',
  },
  accra: {
    budget: 'Osu Guesthouse',
    business: 'Airport City Business Hotel',
    luxury: 'The Accra Grand',
  },
  freetown: {
    budget: 'Lumley Guesthouse',
    business: 'Aberdeen Business Hotel',
    luxury: 'The Freetown Grand',
  },
  kigali: {
    budget: 'Kimihurura Guesthouse',
    business: 'Kigali Heights Business Hotel',
    luxury: 'The Kigali Grand',
  },
  johannesburg: {
    budget: 'Melville Guesthouse',
    business: 'Sandton Business Hotel',
    luxury: 'The Johannesburg Grand',
  },
  cairo: {
    budget: 'Zamalek Guesthouse',
    business: 'Downtown Business Hotel',
    luxury: 'The Nile Grand',
  },
  dubai: {
    budget: 'Deira Guesthouse',
    business: 'DIFC Business Hotel',
    luxury: 'The Marina Grand',
  },
  'san-francisco': {
    budget: 'Mission Guesthouse',
    business: 'SoMa Business Hotel',
    luxury: 'The Nob Hill Grand',
  },
};

export const hotelName = (to: MarketId, tier: HotelTier) =>
  HOTEL_NAMES[to]?.[tier] ?? `${to} ${tier}`;

/** A stay in USD in this city: base price times its cost-of-living factor, to the nearest $10. */
export function hotelPriceUsd(world: World, to: MarketId, tier: HotelTier): number {
  const card = getMarket(world, to).data.card?.costOfLiving ?? 3;
  const factor = HOTEL_COL_FACTOR[card] ?? 1;
  return Math.round((HOTEL_BASE_USD[tier] * factor) / 10) * 10;
}

/** A stay in this city, in the player's home currency (minor units). */
export const hotelPrice = (world: World, p: Player, to: MarketId, tier: HotelTier) =>
  usdToLocal(world, getMarket(world, p.market), hotelPriceUsd(world, to, tier));

/** The three hotels in a city, priced in home currency, with whether flight + hotel is affordable. */
export function hotelOptions(world: World, p: Player, to: MarketId) {
  if (to === p.market) return [];
  const balance = Math.max(0, account(world, p.accounts.local).balance);
  const fare = to === locationOf(p) ? 0 : flightFare(world, p, to);
  return HOTEL_TIERS.map((tier) => {
    const price = hotelPrice(world, p, to, tier);
    return { tier, name: hotelName(to, tier), price, affordable: balance >= fare + price };
  });
}

/**
 * Fly one way to another city and be there. Paid from the personal account
 * to the home market's suppliers; flying home clears the location. With
 * `hotel`, a stay abroad is paid for too (none when flying home).
 */
export function bookFlight(
  world: World,
  p: Player,
  to: MarketId,
  now: number,
  hotel?: HotelTier,
  flight?: TicketFlight,
  cabin?: CabinClass,
  returnCabin?: CabinClass,
) {
  if (p.flightTicket?.to === to && p.flightTicket.from === locationOf(p)) return p.flightTicket;
  // The first-class release (bankers note): return tickets, and the way home
  // in the cabin you booked (or flew out in). Worlds without it book as before.
  const fresh = bankersOn(world);
  ensure(!returnCabin || fresh, 'travel.return', 'Return tickets aren’t on sale yet.');
  ensure(
    !(returnCabin && to === p.market),
    'travel.return',
    'You’re flying home: there’s no way back to book.',
  );
  const held = fresh && to === p.market ? p.location?.returnLeg : undefined;
  if (fresh && to === p.market && cabin === undefined && !p.flightTicket) {
    // No cabin asked for on the way home: the return you hold, else the cabin you
    // flew out in when you can pay for it (else economy, as before).
    const out = p.location?.cabin;
    const have = Math.max(0, account(world, p.accounts.local).balance);
    if (held) cabin = held.cabin;
    else if (out && have >= cabinFare(world, p, to, out)) cabin = out;
  }
  // Business and first come with the investor release; economy is the ticket as it was.
  const upgraded = cabin && cabin !== 'economy' ? cabin : undefined;
  ensure(!upgraded || investorOn(world), 'travel.cabin', 'Only economy is on sale for now.');
  ensure(
    !p.flightTicket,
    'travel.booked',
    'Cancel your existing ticket before booking another flight.',
  );
  const home = getMarket(world, p.market);
  const from = locationOf(p);
  const dest = world.markets[to];
  ensure(dest, 'travel.closed', 'That market isn’t open yet.');
  ensure(to !== from, 'travel.here', `You’re already in ${dest.data.name}.`);
  const used = p.flights?.month === home.month ? p.flights.count : 0;
  ensure(
    used < MAX_FLIGHTS_PER_MONTH || to === p.market || hasVisa(world, p, to),
    'travel.flights',
    `That’s ${MAX_FLIGHTS_PER_MONTH} flights this month. Stay a while.`,
  );
  // Only the parts given (a command's optional fields): replays stay identical.
  const shown = flight
    ? (Object.fromEntries(
        Object.entries(flight).filter(([, v]) => typeof v === 'string' && v),
      ) as TicketFlight)
    : undefined;
  if (p.lastFlight) delete p.lastFlight;
  if (held && (cabin ?? 'economy') === held.cabin) {
    // Your return ticket: already paid for when you booked the way out.
    delete p.location!.returnLeg;
    p.flightTicket = {
      from,
      to,
      paid: held.paid,
      bookedAt: now,
      prepaid: true,
      ...(shown && Object.keys(shown).length ? { flight: shown } : {}),
      ...(upgraded ? { cabin: upgraded } : {}),
    };
    return p.flightTicket;
  }
  if (held) {
    // Another cabin home: the return you held is refunded, the new one charged.
    transfer(
      world,
      home.ext.suppliers,
      p.accounts.local,
      held.paid,
      'Return flight refund',
      home.month,
    );
    delete p.location!.returnLeg;
  }
  const fare = upgraded ? cabinFare(world, p, to, upgraded) : flightFare(world, p, to);
  const balance = Math.max(0, account(world, p.accounts.local).balance);
  const goingHome = to === p.market;
  let back: { cabin: CabinClass; paid: number } | undefined;
  if (returnCabin) {
    ensure(
      !p.location?.returnLeg,
      'travel.return',
      'You already hold a ticket home. Use it, or cancel it from the airport.',
    );
    back = { cabin: returnCabin, paid: legFare(world, p, to, p.market, returnCabin) };
  }
  ensure(!(hotel && goingHome), 'travel.hotel', 'You don’t need a hotel at home.');
  // Nobody is stranded abroad: short of the fare home, you fly standby for what you
  // have (in economy: there's no standby up front).
  const cost = goingHome && !upgraded ? Math.min(fare, balance) : fare;
  const stay: HotelStay | undefined = hotel
    ? { tier: hotel, name: hotelName(to, hotel), paid: hotelPrice(world, p, to, hotel) }
    : undefined;
  if (stay)
    ensure(
      balance >= cost + stay.paid,
      'travel.funds',
      `The flight and hotel cost ${formatMoney(cost + stay.paid, home.data.currency)}; you don’t have it.`,
    );
  if (back)
    ensure(
      balance >= cost + (stay?.paid ?? 0) + back.paid,
      'travel.funds',
      `The return trip costs ${formatMoney(cost + (stay?.paid ?? 0) + back.paid, home.data.currency)}; you don’t have it.`,
    );
  ensure(
    balance >= cost,
    'travel.funds',
    upgraded
      ? `${CABIN_NAME[upgraded]} costs ${formatMoney(cost, home.data.currency)}; you don’t have it.`
      : `The flight costs ${formatMoney(cost, home.data.currency)}; you don’t have it.`,
  );
  transfer(
    world,
    p.accounts.local,
    home.ext.suppliers,
    cost,
    upgraded
      ? `Flight ${getMarket(world, from).data.name} → ${dest.data.name} (${CABIN_NAME[upgraded]})`
      : `Flight ${getMarket(world, from).data.name} → ${dest.data.name}`,
    home.month,
  );
  if (back)
    transfer(
      world,
      p.accounts.local,
      home.ext.suppliers,
      back.paid,
      `Flight ${dest.data.name} → ${home.data.name} (${CABIN_NAME[back.cabin]}, return)`,
      home.month,
    );
  if (stay)
    transfer(
      world,
      p.accounts.local,
      home.ext.suppliers,
      stay.paid,
      `Hotel: ${stay.name}`,
      home.month,
    );
  p.flightTicket = {
    from,
    to,
    paid: cost,
    bookedAt: now,
    ...(stay ? { hotel: stay } : {}),
    ...(shown && Object.keys(shown).length ? { flight: shown } : {}),
    ...(upgraded ? { cabin: upgraded } : {}),
    ...(back ? { return: back } : {}),
  };
  return p.flightTicket;
}

export function cancelFlight(world: World, p: Player) {
  const ticket = p.flightTicket;
  ensure(ticket, 'travel.ticket', 'You have no booked flight.');
  const home = getMarket(world, p.market);
  if (ticket.prepaid) {
    // The flight home on your return ticket: cancelled, you keep the return.
    if (p.location) p.location.returnLeg = { cabin: ticket.cabin ?? 'economy', paid: ticket.paid };
    delete p.flightTicket;
    return { refunded: 0, keptReturn: true };
  }
  transfer(world, home.ext.suppliers, p.accounts.local, ticket.paid, 'Flight refund', home.month);
  if (ticket.return)
    transfer(
      world,
      home.ext.suppliers,
      p.accounts.local,
      ticket.return.paid,
      'Return flight refund',
      home.month,
    );
  if (ticket.hotel)
    transfer(
      world,
      home.ext.suppliers,
      p.accounts.local,
      ticket.hotel.paid,
      'Hotel refund',
      home.month,
    );
  delete p.flightTicket;
  const refunded = ticket.paid + (ticket.hotel?.paid ?? 0) + (ticket.return?.paid ?? 0);
  // Holiday with friends: a trip a host paid for goes back to the host.
  const host = ticket.sponsor ? world.players[ticket.sponsor.playerId] : undefined;
  const back = host
    ? Math.min(ticket.sponsor!.amount, refunded, account(world, p.accounts.local).balance)
    : 0;
  if (host && back > 0)
    pay(
      world,
      p.accounts.local,
      host.accounts.local,
      back,
      `Holiday refund to ${host.name}`,
      home.month,
      'sent',
    );
  return { refunded, ...(back > 0 ? { returnedToHost: back } : {}) };
}

export function fly(world: World, p: Player, to: MarketId, now: number) {
  // Legacy clients book and board in one command. Modern clients book first.
  const ticket = p.flightTicket ?? bookFlight(world, p, to, now);
  const from = locationOf(p);
  ensure(
    ticket.from === from && ticket.to === to,
    'travel.ticket',
    'That is not your booked flight.',
  );
  const home = getMarket(world, p.market);
  const dest = getMarket(world, to);
  const used = p.flights?.month === home.month ? p.flights.count : 0;
  const cost = ticket.paid;
  // A plain copy: the ticket is a draft, and the result outlives it.
  const hotel = ticket.hotel ? { ...ticket.hotel } : undefined;
  const cabin: CabinClass = ticket.cabin ?? 'economy';
  const fresh = bankersOn(world);
  delete p.flightTicket;
  // City places: a business visa's flights don't count against the monthly limit.
  p.flights = { month: home.month, count: hasVisa(world, p, to) ? used : used + 1 };
  if (to === p.market) delete p.location;
  else {
    // The first-class release: the return you booked (or still hold) goes with you,
    // and so does the cabin you flew in (the way home is offered in it).
    const back = fresh ? (ticket.return ?? p.location?.returnLeg) : undefined;
    p.location = {
      market: to,
      since: now,
      ...(hotel ? { hotel } : {}),
      ...(back ? { returnLeg: { ...back } } : {}),
      ...(fresh && ticket.cabin ? { cabin: ticket.cabin } : {}),
    };
    p.visited[to] = home.month;
  }
  // Business and first: the flight's acts (dine, sleep, watch, work…) until the next booking.
  if (fresh && !p.ai && ticket.cabin)
    p.lastFlight = { cabin: ticket.cabin, from, to, month: home.month, acts: [] };
  // The cabin's experience (investor release, humans only): old worlds land as before.
  const landed = investorOn(world) && !p.ai ? landIn(world, p, cabin, from, to) : null;
  const base =
    to === p.market
      ? fresh && ticket.prepaid
        ? `Welcome home to ${dest.data.name}. Flight: your return ticket (${formatMoney(cost, home.data.currency)}, paid when you booked).`
        : `Welcome home to ${dest.data.name}. Flight: ${formatMoney(cost, home.data.currency)}.`
      : hotel
        ? `You’ve landed in ${dest.data.name}. Flight: ${formatMoney(cost, home.data.currency)}. Hotel: ${hotel.name}.`
        : `You’ve landed in ${dest.data.name}. Flight: ${formatMoney(cost, home.data.currency)}.`;
  return {
    cost,
    currency: home.data.currency,
    hours: landed ? landed.hours : FLIGHT_HOURS,
    from,
    to,
    location: p.location ? { market: to, name: dest.data.name, sinceAt: now } : null,
    ...(hotel && to !== p.market ? { hotel } : {}),
    ...(landed ? { cabin: landed } : {}),
    text: landed ? `${base} ${landingLine(landed)}` : base,
  };
}

// ---------------------------------------------------------------- Getting around town (Wave 4)

export type FareMode = 'bus' | 'taxi';
/** Wave 5: 'drive' is your own car, free in your home city. */
export type RideMode = FareMode | 'drive';
export type RideDistance = 'short' | 'medium' | 'long';
export const MAX_RIDES_PER_MONTH = 30;

/** Fares as a share of the city's monthly cost of living. */
const RIDE_FARE_COL: Record<FareMode, Record<RideDistance, number>> = {
  bus: { short: 0.002, medium: 0.0035, long: 0.005 },
  taxi: { short: 0.01, medium: 0.02, long: 0.035 },
};

/** A fare in the local currency of the city the player is in (minor units). */
const rideFare = (world: World, market: MarketId, mode: FareMode, distance: RideDistance) =>
  Math.max(1, scale(col(getMarket(world, market)), RIDE_FARE_COL[mode][distance]));

/** Take a bus or a taxi across the city you're in, paid to its suppliers (converted if abroad). */
export function ride(world: World, p: Player, mode: RideMode, distance: RideDistance) {
  const home = getMarket(world, p.market);
  const m = getMarket(world, locationOf(p));
  if (mode === 'drive') {
    ensure(p.car, 'ride.car', 'You don’t have a car. Buy one at a car dealership.');
    ensure(m.id === p.market, 'ride.car', 'Your car is at home. Take a bus or a taxi here.');
    return {
      mode,
      distance,
      market: m.id,
      fare: 0,
      currency: m.data.currency,
      paid: 0,
      ridesLeft: MAX_RIDES_PER_MONTH - (p.rides?.month === home.month ? p.rides.count : 0),
      text: 'You drove: fuel is in your car’s running costs.',
    };
  }
  const used = p.rides?.month === home.month ? p.rides.count : 0;
  ensure(
    used < MAX_RIDES_PER_MONTH,
    'ride.limit',
    `That’s ${MAX_RIDES_PER_MONTH} rides this month. Walk or cycle for now.`,
  );
  const fare = rideFare(world, m.id, mode, distance);
  const local = account(world, p.accounts.local);
  const cost = costIn(world, fare, m.data.currency, local.currency);
  ensure(
    local.balance >= cost,
    'ride.funds',
    `The fare is ${formatMoney(fare, m.data.currency)}; you don’t have it.`,
  );
  const label = mode === 'bus' ? 'Bus' : 'Taxi';
  const paid = payExact(
    world,
    p.accounts.local,
    m.ext.suppliers,
    fare,
    `${label} in ${m.data.name}`,
    home.month,
  );
  p.rides = { month: home.month, count: used + 1 };
  return {
    mode,
    distance,
    market: m.id,
    fare,
    currency: m.data.currency,
    paid,
    ridesLeft: MAX_RIDES_PER_MONTH - used - 1,
    text: `${label}: ${formatMoney(fare, m.data.currency)}.`,
  };
}

export function travel(world: World, p: Player, to: MarketId) {
  const home = getMarket(world, p.market);
  ensure(to !== p.market, 'travel.home', 'You’re already here.');
  ensure(world.markets[to], 'travel.closed', 'That market isn’t open yet.');
  ensure(p.visited[to] !== home.month, 'travel.again', 'You’re already on that trip this month.');
  spendHours(p, TRIP_HOURS, 'A trip');
  const cost = usdToLocal(world, home, tripCostUsd(p.market, to));
  transfer(
    world,
    p.accounts.local,
    home.ext.suppliers,
    cost,
    `Trip to ${getMarket(world, to).data.name}`,
    home.month,
  );
  // Your company or fund gets less attention while you're away.
  p.energy = clamp(p.energy - 8, 0, 100);
  p.visited[to] = home.month;
  return {
    cost,
    text: `Trip to ${getMarket(world, to).data.name} booked: ${formatMoney(cost, home.data.currency)}, ${TRIP_HOURS}h.`,
  };
}

/** Holder id for shares lost to a market's central bank on relocation. */
const centralBankHolderId = (market: MarketId) => `cb:${market}`;

/**
 * Relocate permanently. Requires clean books: no personal loans and no
 * personal guarantees outstanding (you can't move away from your debts).
 */
export function relocate(world: World, p: Player, to: MarketId, newHandle: string | undefined) {
  ensure(!p.flightTicket, 'travel.booked', 'Cancel or use your flight ticket before relocating.');
  ensure(
    !Object.values(world.playRooms ?? {}).some(
      (r) =>
        (r.status === 'waiting' || r.status === 'playing') &&
        r.stake > 0 &&
        r.members.some((m) => m.id === p.id),
    ),
    'travel.game',
    'Finish your staked game or leave its waiting room before relocating.',
  );
  ensure(
    !Object.values(world.deliveries ?? {}).some((d) => d.owner === p.id && !d.complete),
    'travel.delivery',
    'Unpack your home deliveries before relocating.',
  );
  const from = getMarket(world, p.market);
  const dest = world.markets[to];
  ensure(dest, 'relocate.closed', 'That market isn’t open yet.');
  ensure(to !== p.market, 'relocate.home', 'You already live here.');
  ensure(p.loans.length === 0, 'relocate.loans', 'Repay your personal loans before relocating.');
  const guaranteed = Object.values(world.companies).some((c) =>
    c.finance.loans.some((l) => l.personalGuarantee === p.id && l.outstanding > 0),
  );
  ensure(!guaranteed, 'relocate.guarantee', 'You still guarantee a company loan. Settle it first.');

  // New identity in the destination market: handles are unique per market.
  const handle = newHandle ?? p.handle;
  const check = checkName(handle, { taken: {}, kind: 'handle' });
  if (!check.ok) ensure(false, 'relocate.handle', check.reason);
  const key = `@${normaliseName(handle)}`;
  const destNames = (world.names[to] ??= {});
  ensure(
    !destNames[key] || destNames[key] === p.id,
    'relocate.handle',
    'That handle is taken there. Pick another.',
  );

  const month = from.month;
  // A return ticket home you won't use: refunded before anything else.
  if (p.location?.returnLeg) {
    transfer(
      world,
      from.ext.suppliers,
      p.accounts.local,
      p.location.returnLeg.paid,
      'Return flight refund',
      month,
    );
    delete p.location.returnLeg;
  }
  // 1. Cash: half to the central bank of the market being left, the rest moves with you.
  const oldLocal = p.accounts.local;
  const cash = account(world, oldLocal).balance;
  const lost = Math.floor(cash / 2);
  transfer(world, oldLocal, from.ext.tax, lost, 'Relocation: half to the central bank', month);
  const newLocal = openAccount(world, {
    currency: dest.data.currency,
    market: to,
    label: `${p.name} personal`,
  });
  const moved = account(world, oldLocal).balance;
  const received =
    moved > 0 ? convert(world, oldLocal, newLocal, moved, 'Relocation: savings moved', month) : 0;
  if (p.accounts.usd) {
    const usd = account(world, p.accounts.usd).balance;
    transfer(
      world,
      p.accounts.usd,
      world.usdExt.genesis,
      Math.floor(usd / 2),
      'Relocation: half to the central bank',
      month,
    );
  }
  p.accounts.local = newLocal;
  forgetOwners(world);
  keepStatement(world, p);

  // 2. Shares and SAFEs everywhere: half to the old market's central bank.
  const cb = centralBankHolderId(from.id);
  for (const c of Object.values(world.companies)) {
    if (c.status !== 'active') continue;
    const h = c.capTable.holdings[p.id];
    if (h && h.shares > 0) {
      const half = Math.floor(h.shares / 2);
      h.shares -= half;
      const bh = (c.capTable.holdings[cb] ??= { shares: 0, kind: 'investor' });
      bh.shares += half;
      // Keep a portfolio record so the remaining stake is visible.
      world.positions[`${p.id}:${c.id}`] ??= {
        investorId: p.id,
        companyId: c.id,
        invested: 0,
        returned: 0,
        month,
        writtenOff: false,
      };
    }
    for (const s of c.capTable.safes.filter((x) => x.holderId === p.id)) {
      const half = Math.floor(s.amount / 2);
      s.amount -= half;
      c.capTable.safes.push({ holderId: cb, amount: half, cap: s.cap, month: s.month });
    }
    for (const pref of c.capTable.preferences.filter((x) => x.holderId === p.id)) {
      const half = Math.floor(pref.shares / 2);
      pref.shares -= half;
      const inv = Math.floor(pref.invested / 2);
      pref.invested -= inv;
      c.capTable.preferences.push({ ...pref, holderId: cb, shares: half, invested: inv });
    }
    // 3. Who runs what's left behind.
    if (c.founderIds.includes(p.id)) {
      c.founderIds = c.founderIds.filter((id) => id !== p.id);
      p.companyIds = p.companyIds.filter((id) => id !== c.id);
      if (c.founderIds.length === 0) c.aiCeo = true;
      for (const fid of c.founderIds)
        notify(world, fid, {
          month,
          kind: 'system',
          text: `${p.name} relocated and left ${c.name}. You’re running it now.`,
        });
    }
  }

  // Investors: fund stakes stay; AI LPs in the old market lose confidence.
  if (p.investor) {
    p.investor.lpCredibility = clamp(p.investor.lpCredibility - 0.2, 0, 1);
    const fund = p.investor.fundId ? world.funds[p.investor.fundId] : undefined;
    if (fund) fund.mood = clamp(fund.mood - 0.3, 0.5, 1.5);
  }

  // Open business in the old market is withdrawn.
  for (const d of Object.values(world.deals)) {
    if (
      d.status === 'open' &&
      d.market === from.id &&
      (d.proposer.id === p.id || d.counterparty.id === p.id)
    )
      d.status = 'withdrawn';
  }
  for (const inv of Object.values(world.media))
    if (inv.playerId === p.id && ['invited', 'questions', 'preview'].includes(inv.status))
      inv.status = 'pulled';

  // 4. Start from scratch in the new market.
  for (const [k, v] of Object.entries(world.names[from.id] ?? {}))
    if (v === p.id && k.startsWith('@')) delete world.names[from.id]![k];
  destNames[key] = p.id;
  p.handle = handle;
  p.market = to;
  delete p.location;
  p.visited[from.id] = month;
  p.diligence = {};
  p.hours.used = p.hours.available;
  notify(world, p.id, {
    month: dest.month,
    kind: 'system',
    text: `Welcome to ${dest.data.name}. You arrived with ${formatMoney(received, dest.data.currency)}; half of everything stayed with the central bank in ${from.data.name}.`,
  });
  return { received, lost };
}

/**
 * Companies run by an AI CEO pay out part of their profit as dividends, only
 * while profitable (§14 "pay dividends only while it is profitable").
 */
const DIVIDEND_SHARE = 0.25;

export function payDividends(world: World, c: Company, month: number) {
  if (!c.aiCeo || c.status !== 'active') return;
  const last = c.finance.history[c.finance.history.length - 1];
  if (!last || last.net <= 0) return;
  const pool = Math.min(Math.round(last.net * DIVIDEND_SHARE), account(world, c.account).balance);
  if (pool <= 0) return;
  const m = getMarket(world, c.market);
  // Pro rata to every holder as if converting to common (no preferences on dividends).
  const lines = waterfall({ ...c.capTable, preferences: [], safes: [] }, pool);
  for (const line of lines) {
    if (line.total <= 0) continue;
    const pl = world.players[line.holderId];
    const to = holderAccount(world, m, line.holderId);
    const paid = pay(world, c.account, to, line.total, `Dividend: ${c.name}`, month);
    if (pl && !pl.ai)
      notify(world, pl.id, {
        month,
        kind: 'deal',
        text: `Dividend from ${c.name}: ${formatMoney(paid, account(world, to).currency)}.`,
      });
    const pos = world.positions[`${line.holderId}:${c.id}`];
    if (pos) pos.returned += line.total;
  }
}

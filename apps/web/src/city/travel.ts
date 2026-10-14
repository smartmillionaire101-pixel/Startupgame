import { CITY_GEO } from './coordinates';
/**
 * Wave 4: getting around (docs/WAVE4-PACE-TRAVEL-SPACE.md §B).
 *
 * Adapters for the Wave 4 contracts, read when the server sends them and
 * falling back when it doesn't yet:
 *
 * - `view.clock` drives the "Next month in 3:42" chip (no clock: no chip).
 * - `view.here` is the market you're physically in (no `here`: your home
 *   market, as before). `view.me.location` says you're away from home.
 * - `view.flights` gives one-way fares (no flights: the airport falls back
 *   to the old trip command and its round-trip cost).
 *
 * And the pure helpers behind rides across town (walk, cycle, the city's
 * own transit, taxi) and flights between cities.
 */
import type { PlayerView } from '@runway/engine';
import { B } from './layout';
import type { VehicleSpec } from './flavour';

type Market = PlayerView['market'];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// Contracts

export interface ClockView {
  monthMs: number;
  /** Epoch ms of the next settlement. */
  nextSettlementAt: number;
  /** The server's clock when it built the view. */
  serverNow: number;
}

export function clockOf(view: PlayerView): ClockView | null {
  const c = (view as PlayerView & { clock?: unknown }).clock;
  if (!isObj(c) || !fin(c.monthMs) || !fin(c.nextSettlementAt) || !fin(c.serverNow)) return null;
  if (c.monthMs <= 0) return null;
  return { monthMs: c.monthMs, nextSettlementAt: c.nextSettlementAt, serverNow: c.serverNow };
}

/** Milliseconds left in the month, given when the view arrived (local clock) and now. */
export function msLeft(clock: ClockView, receivedAt: number, now: number): number {
  const serverNow = clock.serverNow + (now - receivedAt);
  return Math.max(0, clock.nextSettlementAt - serverNow);
}

/** "3:42" (or "12:05", or "1:02:03" for an hour or more). */
export function fmtCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whether the server sends where you are (`view.here`). */
export function hasHere(view: PlayerView): boolean {
  const h = (view as PlayerView & { here?: unknown }).here;
  return isObj(h) && typeof h.id === 'string' && Array.isArray(h.segments);
}

/** The market you're physically in: `view.here`, else your home market. */
export function hereOf(view: PlayerView): Market {
  const h = (view as PlayerView & { here?: unknown }).here;
  return hasHere(view) ? (h as Market) : view.market;
}

export const isAbroad = (view: PlayerView) => hereOf(view).id !== view.market.id;

/** The view the City shows: the market you're in stands in for `view.market`. */
export function cityViewOf(view: PlayerView): PlayerView {
  const here = hereOf(view);
  return here === view.market ? view : { ...view, market: here };
}

export interface LocationView {
  market: string;
  name: string;
  sinceAt: number;
}

export function locationOf(view: PlayerView): LocationView | null {
  const l = (view.me as PlayerView['me'] & { location?: unknown }).location;
  if (!isObj(l) || typeof l.market !== 'string') return null;
  return {
    market: l.market,
    name: typeof l.name === 'string' ? l.name : l.market,
    sinceAt: fin(l.sinceAt) ? l.sinceAt : 0,
  };
}

export interface FlightsView {
  /** One-way fare per destination, minor units of your home currency. */
  fareTo: Record<string, number>;
  hours: number;
}

/** `view.flights` when the server has one-way flights (`travel.fly`). */
export function flightsOf(view: PlayerView): FlightsView | null {
  const f = (view as PlayerView & { flights?: unknown }).flights;
  if (!isObj(f) || !isObj(f.fareTo)) return null;
  const fareTo: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.fareTo)) if (fin(v)) fareTo[k] = v;
  return { fareTo, hours: fin(f.hours) ? f.hours : 4 };
}

export interface Destination {
  id: string;
  name: string;
  /** Minor units of your home currency. */
  fare: number;
  hours: number;
  /** Fallback (old trip command) only: you already made this month's trip. */
  done: boolean;
}

/**
 * Where you can fly from where you are. With flights: every other market,
 * home included when you're away. Without: the old destinations list.
 */
export function destinationsOf(view: PlayerView): Destination[] {
  const flights = flightsOf(view);
  const here = hereOf(view).id;
  const names = new Map<string, string>([[view.market.id, view.market.name]]);
  for (const d of view.me.destinations) names.set(d.id, d.name);
  if (!flights)
    return view.me.destinations.map((d) => ({
      id: d.id,
      name: d.name,
      fare: d.tripCost,
      hours: 40,
      done: d.visitingNow,
    }));
  const ids = [...names.keys()].filter((id) => id !== here);
  // Home first when you're away, then the rest as the server lists them.
  ids.sort((a, b) => Number(b === view.market.id) - Number(a === view.market.id));
  return ids.map((id) => ({
    id,
    name: names.get(id) ?? id,
    fare: flights.fareTo[id] ?? view.me.destinations.find((d) => d.id === id)?.tripCost ?? 0,
    hours: flights.hours,
    done: false,
  }));
}

// ---------------------------------------------------------------------------
// Rides across town

/** Wave 10: 'drive' is your own car (engine `city.ride` mode 'drive': free at home, fuel is in its running cost). */
export type RideMode = 'walk' | 'cycle' | 'bus' | 'taxi' | 'drive';
export const RIDE_MODES: RideMode[] = ['walk', 'cycle', 'bus', 'taxi'];

/** Your car as the chooser needs it (life.ts carOf), and whether it is with you. */
export interface MyCar {
  modelId: string;
  label: string;
  /** Monthly running cost (fuel, insurance, upkeep), minor units; 0 when unknown. */
  monthlyCost?: number;
}

/**
 * Every way you can go: your own car first when you have one (and it is in
 * this city: it stays at home when you fly), then walk, cycle, transit, taxi.
 */
export function rideModesFor(car: MyCar | null | undefined, abroad = false): RideMode[] {
  return car && !abroad ? ['drive', ...RIDE_MODES] : RIDE_MODES;
}

/**
 * Fuel for a drive (minor units), for display only: the engine bills fuel in
 * the car's monthly running cost. About a fifth of that cost is fuel, spread
 * over some 40 trips a month, scaled by the trip's length.
 */
export function fuelCost(car: MyCar | null | undefined, tiles: number, costOfLiving: number) {
  if (car?.modelId === 'electric') return 0;
  const monthly = car?.monthlyCost && car.monthlyCost > 0 ? car.monthlyCost : costOfLiving * 0.08;
  const k = { short: 0.7, medium: 1, long: 1.6 }[rideDistance(tiles)];
  return Math.max(1, Math.round((monthly * 0.2 * k) / 40));
}
export type RideDistance = 'short' | 'medium' | 'long';

/** A trip this long (tiles along the streets) or shorter just walks. */
export const SHORT_HOP = 2 * B + 2;

export const rideDistance = (tiles: number): RideDistance =>
  tiles < 3 * B ? 'short' : tiles < 7 * B ? 'medium' : 'long';

/** Fare shares of the city's monthly cost of living (server: `city.ride`). */
const FARE_SHARE: Record<'bus' | 'taxi', Record<RideDistance, number>> = {
  bus: { short: 0.002, medium: 0.0035, long: 0.005 },
  taxi: { short: 0.01, medium: 0.02, long: 0.035 },
};

/** Estimated fare (minor units of the city's currency); walking and cycling are free. */
export function rideFare(mode: RideMode, tiles: number, costOfLiving: number): number {
  if (mode === 'walk' || mode === 'cycle' || mode === 'drive') return 0;
  return Math.round(costOfLiving * FARE_SHARE[mode][rideDistance(tiles)]);
}

/** Speed on screen (tiles a second), a floor and a cap on the trip's duration (ms). */
const RIDE_PACE: Record<RideMode, { speed: number; min: number; max: number }> = {
  walk: { speed: 5, min: 350, max: 6000 },
  cycle: { speed: 9, min: 350, max: 4000 },
  bus: { speed: 12, min: 900, max: 4500 },
  taxi: { speed: 16, min: 700, max: 3200 },
  drive: { speed: 16, min: 700, max: 3200 },
};

export const rideMs = (mode: RideMode, tiles: number) => {
  const p = RIDE_PACE[mode];
  return Math.round(Math.min(p.max, Math.max(p.min, (tiles / p.speed) * 1000)));
};

/** In-town minutes, for the chooser's ETA (a tile is about 50 m). */
export function rideMinutes(mode: RideMode, tiles: number): number {
  const m =
    mode === 'walk'
      ? tiles * 0.6
      : mode === 'cycle'
        ? tiles * 0.22
        : mode === 'bus'
          ? 5 + tiles * 0.15
          : mode === 'drive'
            ? 1 + tiles * 0.1
            : 2 + tiles * 0.1;
  return Math.max(1, Math.round(m));
}

/** Each city's own shared transport: its name and the vehicle you ride. */
const TRANSIT: Record<string, { name: string; vehicle: string }> = {
  lagos: { name: 'Danfo', vehicle: 'danfo' },
  nairobi: { name: 'Matatu', vehicle: 'matatu' },
  accra: { name: 'Trotro', vehicle: 'trotro' },
  freetown: { name: 'Poda-poda', vehicle: 'podapoda' },
  kigali: { name: 'Bus', vehicle: 'bus' },
  johannesburg: { name: 'Minibus taxi', vehicle: 'minibus' },
  cairo: { name: 'Microbus', vehicle: 'microbus' },
  dubai: { name: 'Bus', vehicle: 'bus' },
  london: { name: 'Bus', vehicle: 'routemaster' },
  'san-francisco': { name: 'Muni', vehicle: 'muni' },
};

/** The transit's proper name (untranslated: 'Bus' is translated by the caller). */
export const transitName = (marketId: string) => TRANSIT[marketId]?.name ?? 'Bus';

const BUS: VehicleSpec = {
  id: 'my-bus',
  body: '#f59e0b',
  accent: '#1e293b',
  len: 0.95,
  wid: 0.34,
  h: 15,
};
const TAXI: VehicleSpec = {
  id: 'my-taxi',
  body: '#facc15',
  accent: '#111827',
  len: 0.5,
  wid: 0.28,
  h: 11,
  extra: 'sign',
};
const BIKE: VehicleSpec = {
  id: 'my-bike',
  body: '#0f766e',
  accent: '#0f172a',
  len: 0.36,
  wid: 0.12,
  h: 8,
  extra: 'rider',
};

/** Your own car on the map: its paint by model (the luxury one is black, the electric white…). */
const MY_CAR: Record<string, Partial<VehicleSpec>> = {
  motorbike: { body: '#b91c1c', len: 0.34, wid: 0.12, h: 8, extra: 'rider' },
  hatchback: { body: '#2563eb', len: 0.42 },
  'ride-hail-sedan': { body: '#e5e7eb', len: 0.5 },
  'city-suv': { body: '#475569', len: 0.52, h: 13 },
  electric: { body: '#f8fafc', accent: '#0ea5e9', len: 0.5 },
  luxury: { body: '#111827', accent: '#d4af37', len: 0.58 },
};

export function myCarSpec(modelId: string | undefined): VehicleSpec {
  return {
    id: `my-car-${modelId ?? 'car'}`,
    body: '#2563eb',
    accent: '#0f172a',
    len: 0.48,
    wid: 0.26,
    h: 11,
    ...(modelId ? MY_CAR[modelId] : undefined),
  };
}

/** The vehicle you ride for a mode in a city (null for walking). */
export function rideVehicle(
  mode: RideMode,
  marketId: string,
  vehicles: VehicleSpec[],
  car?: MyCar | null,
): VehicleSpec | null {
  if (mode === 'walk') return null;
  if (mode === 'drive') return myCarSpec(car?.modelId);
  if (mode === 'cycle') return BIKE;
  if (mode === 'bus') {
    const want = TRANSIT[marketId]?.vehicle ?? 'bus';
    return vehicles.find((v) => v.id === want) ?? vehicles.find((v) => v.len >= 0.8) ?? BUS;
  }
  return vehicles.find((v) => v.id === 'taxi' || v.id === 'cab' || v.id === 'robotaxi') ?? TAXI;
}

const RIDE_KEY = 'rw_ride';

export function lastRide(): RideMode {
  try {
    const v = localStorage.getItem(RIDE_KEY);
    return RIDE_MODES.includes(v as RideMode) || v === 'drive' ? (v as RideMode) : 'walk';
  } catch {
    return 'walk';
  }
}

export function rememberRide(mode: RideMode) {
  try {
    localStorage.setItem(RIDE_KEY, mode);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}

// ---------------------------------------------------------------------------
// Flights

/** Where each city is, for the route map, and its time zone (day or night). */
export { CITY_GEO } from './coordinates';

/** Local hour (0–23) in a city right now; noon when unknown. */
export function localHour(marketId: string, now = Date.now()): number {
  const tz = CITY_GEO[marketId]?.tz;
  if (!tz) return 12;
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    timeZone: tz,
  }).formatToParts(new Date(now));
  return (
    (Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24) +
    Number(parts.find((p) => p.type === 'minute')?.value ?? 0) / 60
  );
}

export const isNight = (hour: number) => hour < 6 || hour >= 19;

/** Plain equirectangular map coordinates (x: 0–360, y: 0–180, north up). */
export const geoXY = (marketId: string) => {
  const g = CITY_GEO[marketId] ?? { lat: 0, lon: 0 };
  return { x: g.lon + 180, y: 90 - g.lat };
};

/**
 * The route between two cities as a quadratic curve bowed away from the
 * equator (flights look like arcs), plus the map window that frames it.
 */
export function routeOf(from: string, to: string) {
  const a = geoXY(from);
  const b = geoXY(to);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Perpendicular, pointing up (north) on the map.
  let nx = -(b.y - a.y) / len;
  let ny = (b.x - a.x) / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(28, len * 0.28);
  const c = { x: mx + nx * bow, y: my + ny * bow };
  const pad = Math.max(14, len * 0.25);
  const minX = Math.min(a.x, b.x, c.x) - pad;
  const maxX = Math.max(a.x, b.x, c.x) + pad;
  const minY = Math.min(a.y, b.y, c.y) - pad;
  const maxY = Math.max(a.y, b.y, c.y) + pad;
  return { a, b, c, box: { minX, minY, w: maxX - minX, h: maxY - minY } };
}

/** A point and heading (degrees, screen space) a fraction t along a route. */
export function alongRoute(r: ReturnType<typeof routeOf>, t: number) {
  const u = 1 - t;
  const x = u * u * r.a.x + 2 * u * t * r.c.x + t * t * r.b.x;
  const y = u * u * r.a.y + 2 * u * t * r.c.y + t * t * r.b.y;
  const dx = 2 * u * (r.c.x - r.a.x) + 2 * t * (r.b.x - r.c.x);
  const dy = 2 * u * (r.c.y - r.a.y) + 2 * t * (r.b.y - r.c.y);
  return { x, y, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// ---------------------------------------------------------------------------
// Wave 7: rides you experience

/** A string's FNV-1a hash (deterministic schedules and looks). */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small seeded generator (mulberry32): the same seed, the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cities that drive on the left: the taxi driver sits on the right. */
export const driveOnLeft = (marketId: string) =>
  marketId === 'london' || marketId === 'nairobi' || marketId === 'johannesburg';

/** Light at a local hour (for skies). */
export type DayPart = 'night' | 'dusk' | 'day';
export const dayPart = (hour: number): DayPart =>
  isNight(hour) ? 'night' : hour < 8 || hour >= 17 ? 'dusk' : 'day';

/**
 * Named districts along a route, in order (the bus's stop ticker): the
 * nearest named district every few tiles, topped up with the city's street
 * names when the city has no plan or the trip is short.
 */
export function stopsAlong(
  areas: { name: string; at: { x: number; y: number } }[],
  streets: string[],
  path: { x: number; y: number }[],
  max = 6,
): string[] {
  const out: string[] = [];
  const push = (n: string) => {
    if (n && !out.includes(n)) out.push(n);
  };
  if (areas.length && path.length) {
    // Sample evenly along the route's length.
    const seg = path.slice(1).map((q, i) => Math.hypot(q.x - path[i]!.x, q.y - path[i]!.y));
    const total = seg.reduce((s, d) => s + d, 0);
    const n = 12;
    for (let k = 0; k < n; k++) {
      let left = (k / (n - 1)) * total;
      let i = 0;
      while (i < seg.length - 1 && left > seg[i]!) left -= seg[i++]!;
      const a = path[i]!;
      const b = path[Math.min(i + 1, path.length - 1)]!;
      const f = seg[i] ? Math.min(1, left / seg[i]!) : 0;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      let best = areas[0]!;
      let bd = Infinity;
      for (const a of areas) {
        const d = Math.hypot(a.at.x - p.x, a.at.y - p.y);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      push(best.name);
    }
  }
  for (const s of streets) {
    if (out.length >= 3) break;
    push(s);
  }
  return out.slice(0, max);
}

/** Each market's name (English), for boards that list every city. */
export const CITY_NAMES: Record<string, string> = {
  lagos: 'Lagos',
  nairobi: 'Nairobi',
  london: 'London',
  accra: 'Accra',
  freetown: 'Freetown',
  kigali: 'Kigali',
  johannesburg: 'Johannesburg',
  cairo: 'Cairo',
  dubai: 'Dubai',
  'san-francisco': 'San Francisco',
};

/** The airport's own name (Freetown flies from Lungi, across the estuary). */
export const AIRPORT_NAMES: Record<string, string> = {
  lagos: 'Murtala Muhammed',
  nairobi: 'Jomo Kenyatta',
  london: 'Heathrow',
  accra: 'Kotoka',
  freetown: 'Lungi',
  kigali: 'Kigali International',
  johannesburg: 'O. R. Tambo',
  cairo: 'Cairo International',
  dubai: 'Dubai International',
  'san-francisco': 'SFO',
};

/** Fictional local airlines: [name, two-letter code, livery colour]. */
const AIRLINES: Record<string, [string, string, string][]> = {
  lagos: [
    ['Eko Air', 'EK', '#16a34a'],
    ['Naija Wings', 'NW', '#0f766e'],
  ],
  nairobi: [
    ['Savannah Air', 'SV', '#b91c1c'],
    ['Simba Express', 'SX', '#d97706'],
  ],
  london: [
    ['Thames Air', 'TA', '#1d4ed8'],
    ['Albion Airways', 'AL', '#7c3aed'],
  ],
  accra: [['Kente Airways', 'KN', '#ca8a04']],
  freetown: [['Salone Air', 'SL', '#059669']],
  kigali: [['Thousand Hills Air', 'TH', '#0284c7']],
  johannesburg: [
    ['Highveld Air', 'HV', '#ea580c'],
    ['Protea Airlines', 'PR', '#db2777'],
  ],
  cairo: [['Nile Wings', 'NL', '#0e7490']],
  dubai: [
    ['Falcon Gulf', 'FG', '#a16207'],
    ['Oasis Air', 'OA', '#be123c'],
  ],
  'san-francisco': [['Golden Gate Air', 'GG', '#c2410c']],
};
const airlinesOf = (id: string) => AIRLINES[id] ?? [['Runway Air', 'RW', '#0f766e']];

export type FlightStatus = 'Boarding' | 'Delayed' | 'Departed' | 'Landed' | 'On time';

export interface ScheduledFlight {
  /** Minutes after local midnight. */
  at: number;
  /** "14:05". */
  time: string;
  flight: string;
  airline: string;
  livery: string;
  /** The other city: where it flies to, or where it came from. */
  city: string;
  cityName: string;
  gate: string;
  arrival: boolean;
  /** Delayed by this many minutes (0: on time). */
  late: number;
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Today's flights at an airport: deterministic from the airport and the game
 * day, every other game market served once or twice, plus arrivals.
 */
export function airportSchedule(marketId: string, day: string | number): ScheduledFlight[] {
  const rnd = seeded(fnv(`${marketId}:${day}`));
  const others = Object.keys(CITY_NAMES).filter((id) => id !== marketId);
  const out: ScheduledFlight[] = [];
  const mk = (city: string, arrival: boolean): ScheduledFlight => {
    const own = airlinesOf(arrival ? city : marketId);
    const [airline, code, livery] = own[Math.floor(rnd() * own.length)]!;
    const at = (6 * 60 + Math.floor(rnd() * 210) * 5) % (24 * 60);
    return {
      at,
      time: hhmm(at),
      flight: `${code} ${100 + Math.floor(rnd() * 880)}`,
      airline,
      livery,
      city,
      cityName: CITY_NAMES[city] ?? city,
      gate: `${'ABC'[Math.floor(rnd() * 3)]}${1 + Math.floor(rnd() * 12)}`,
      arrival,
      late: rnd() < 0.18 ? 15 + Math.floor(rnd() * 8) * 5 : 0,
    };
  };
  for (const id of others) {
    out.push(mk(id, false));
    if (rnd() < 0.5) out.push(mk(id, false));
    out.push(mk(id, true));
  }
  return out.sort((a, b) => a.at - b.at || a.flight.localeCompare(b.flight));
}

/** The schedule's day key: the game month and today's date (the airport and the Travel app agree). */
export const scheduleDay = (month: number, now = Date.now()) =>
  `${month}:${new Date(now).toISOString().slice(0, 10)}`;

/** A flight's status at a local time (minutes after midnight). */
export function flightStatus(f: ScheduledFlight, now: number): FlightStatus {
  const due = f.at + f.late;
  if (f.arrival) return now >= due ? 'Landed' : f.late ? 'Delayed' : 'On time';
  if (now >= due) return 'Departed';
  if (due - now <= 40) return 'Boarding';
  return f.late ? 'Delayed' : 'On time';
}

/** The board: six rows around now (a couple gone, the rest still to come). */
export function boardRows(
  schedule: ScheduledFlight[],
  now: number,
  n = 6,
): (ScheduledFlight & { status: FlightStatus })[] {
  if (!schedule.length) return [];
  let first = schedule.findIndex((f) => f.at + f.late >= now);
  if (first < 0) first = schedule.length;
  const start = Math.max(0, Math.min(schedule.length - n, first - 2));
  return schedule.slice(start, start + n).map((f) => ({ ...f, status: flightStatus(f, now) }));
}

/** The next departure to a city after now (tomorrow's first if none is left today). */
export function nextFlightTo(
  schedule: ScheduledFlight[],
  to: string,
  now: number,
): ScheduledFlight | null {
  const deps = schedule.filter((f) => !f.arrival && f.city === to);
  return deps.find((f) => f.at + f.late > now) ?? deps[0] ?? null;
}

/** "6h 20m" for a flight time in hours. */
export const fmtFlightTime = (hours: number) => {
  const m = Math.max(1, Math.round(hours * 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
};

/** Minutes after local midnight in a city right now. */
export function localMinutes(marketId: string, now = Date.now()): number {
  const tz = CITY_GEO[marketId]?.tz;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      timeZone: tz,
    }).formatToParts(new Date(now));
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    return Number.isFinite(h) && Number.isFinite(m) ? (h % 24) * 60 + m : 12 * 60;
  } catch {
    return 12 * 60;
  }
}

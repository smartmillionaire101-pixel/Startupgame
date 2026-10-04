/**
 * People in the city (docs/WAVE2-PEOPLE-AND-EVENTS.md §C).
 *
 * Two things live here, both pure and testable:
 *
 * - Adapters for the Wave 2 contracts (presence, events, event kinds,
 *   contacts). Like ./contract.ts they read the new fields when present and
 *   fall back when the server or engine doesn't send them yet: no presence
 *   means no other players on the map; no events means the Event Hall shows
 *   "Events open soon".
 * - Deterministic ambient AI characters: fund partners near their offices,
 *   AI founders near the Hub, shoppers at the Market stalls, candidates at
 *   the Hub. Each strolls a loop along the street graph. Positions are a pure
 *   function of wall-clock time, so every player sees the same city.
 */
import type { PlayerView } from '@runway/engine';
import { angelsOf, businessesOf, hash, seeded } from './contract';
import {
  B,
  findPath,
  pathLength,
  pointAlong,
  type CityLayout,
  type Place,
  type Pt,
} from './layout';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---------------------------------------------------------------------------
// Presence (§A)

export interface PresenceView {
  id: string;
  name: string;
  handle: string;
  role: string;
  backgroundId: string;
  stars: number;
  company: string | null;
  x: number;
  y: number;
  place: string | null;
  seenAt: number;
}

/** Validates a `GET /api/presence` body; anything malformed is dropped. */
export function normPresence(raw: unknown, selfId?: string): PresenceView[] {
  const list = isObj(raw) && Array.isArray(raw.players) ? raw.players : [];
  const out: PresenceView[] = [];
  for (const p of list) {
    if (!isObj(p) || typeof p.id !== 'string' || p.id === selfId) continue;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    out.push({
      id: p.id,
      name: str(p.name, '—'),
      handle: str(p.handle),
      role: str(p.role, 'founder'),
      backgroundId: str(p.backgroundId),
      stars: num(p.stars),
      company: typeof p.company === 'string' ? p.company : null,
      x: p.x,
      y: p.y,
      place: typeof p.place === 'string' ? p.place : null,
      seenAt: num(p.seenAt),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events, event kinds, contacts (§B views)

export type EventKind =
  'founder-meetup' | 'investor-breakfast' | 'demo-day' | 'customer-mixer' | 'talent-night';
export type Venue = 'hall' | 'hub' | 'office';

export interface EventKindView {
  kind: string;
  label: string;
  description: string;
  /** Minor units; 0 when unknown (fallback). */
  cost: number;
  hoursHost: number;
  hoursAttend: number;
  capacity: [number, number];
  who: string;
}

export interface CityEventView {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  host: { id: string; name: string };
  venue: Venue;
  month: number;
  dateLabel: string;
  capacity: number;
  going: number;
  ticket: number;
  segmentKey: string | null;
  status: 'upcoming' | 'held' | 'cancelled';
  youHost: boolean;
  youGoing: boolean;
  outcome: { summary: string; contacts: number } | null;
}

export interface ContactView {
  id: string;
  kind: 'fund' | 'founder' | 'talent' | 'customer' | 'player';
  refId: string;
  name: string;
  warmth: number;
  month: number;
}

type Market = PlayerView['market'];
type Me = PlayerView['me'];

const VENUES: readonly Venue[] = ['hall', 'hub', 'office'];

function normEvent(raw: unknown): CityEventView | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const host = isObj(raw.host) ? raw.host : {};
  const status =
    raw.status === 'held' || raw.status === 'cancelled' ? raw.status : ('upcoming' as const);
  const outcome = isObj(raw.outcome)
    ? { summary: str(raw.outcome.summary), contacts: num(raw.outcome.contacts) }
    : null;
  return {
    id: raw.id,
    kind: str(raw.kind, 'founder-meetup'),
    kindLabel: str(raw.kindLabel, str(raw.kind)),
    title: str(raw.title),
    host: { id: str(host.id), name: str(host.name, '—') },
    venue: VENUES.includes(raw.venue as Venue) ? (raw.venue as Venue) : 'hall',
    month: num(raw.month),
    dateLabel: str(raw.dateLabel),
    capacity: num(raw.capacity),
    going: num(raw.going),
    ticket: num(raw.ticket),
    segmentKey: typeof raw.segmentKey === 'string' ? raw.segmentKey : null,
    status,
    youHost: raw.youHost === true,
    youGoing: raw.youGoing === true,
    outcome,
  };
}

/** The market's events, or null when the engine doesn't send them yet. */
export function eventsOf(view: { market: Market }): CityEventView[] | null {
  const raw = (view.market as Market & { events?: unknown }).events;
  if (!Array.isArray(raw)) return null;
  return raw.map(normEvent).filter((e): e is CityEventView => e !== null);
}

/** Event kinds a player can host, or null when the engine doesn't send them yet. */
export function eventKindsOf(view: { market: Market }): EventKindView[] | null {
  const raw = (view.market as Market & { eventKinds?: unknown }).eventKinds;
  if (!Array.isArray(raw)) return null;
  const out: EventKindView[] = [];
  for (const k of raw) {
    if (!isObj(k) || typeof k.kind !== 'string') continue;
    const cap = Array.isArray(k.capacity) ? k.capacity : [];
    out.push({
      kind: k.kind,
      label: str(k.label, k.kind),
      description: str(k.description),
      cost: num(k.cost),
      hoursHost: num(k.hoursHost, 10),
      hoursAttend: num(k.hoursAttend, 4),
      capacity: [num(cap[0], 10), num(cap[1], 40)],
      who: str(k.who),
    });
  }
  return out;
}

/** Your contacts, newest first; empty when the engine doesn't send them yet. */
export function contactsOf(view: { me: Me }): ContactView[] {
  const raw: unknown = (view.me as Me & { contacts?: unknown }).contacts;
  if (!Array.isArray(raw)) return [];
  const kinds = ['fund', 'founder', 'talent', 'customer', 'player'];
  return (raw as unknown[])
    .filter((c): c is Record<string, unknown> => isObj(c) && typeof c.id === 'string')
    .map((c) => ({
      id: c.id as string,
      kind: (kinds.includes(c.kind as string) ? c.kind : 'founder') as ContactView['kind'],
      refId: str(c.refId),
      name: str(c.name, '—'),
      warmth: Math.max(0, Math.min(1, num(c.warmth))),
      month: num(c.month),
    }))
    .sort((a, b) => b.month - a.month)
    .slice(0, 50);
}

/** The place ids that should fly bunting: venues with an event coming up. */
export function flaggedPlaces(events: CityEventView[] | null): string[] {
  const out = new Set<string>();
  for (const e of events ?? []) {
    if (e.status !== 'upcoming') continue;
    if (e.venue === 'hall') out.add('eventhall');
    else if (e.venue === 'hub') out.add('hub');
    // Only your own office is on your map.
    else if (e.venue === 'office' && e.youHost) out.add('office');
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Ambient AI characters

export type PersonKind =
  'player' | 'partner' | 'founder' | 'candidate' | 'shopper' | 'owner' | 'angel';

export interface AiPerson {
  /** Stable id: `ai:<kind>:<ref>`. */
  id: string;
  kind: Exclude<PersonKind, 'player'>;
  name: string;
  /** Fund id, founder (player) id, candidate id, segment key, business id or angel (player) id. */
  ref: string;
  /** A founder's company id. */
  company?: string;
  /** An AI angel's fund id. */
  fund?: string;
  /** Background id for the outfit, and the seed for skin and hair. */
  bg: string;
  /** The place they hang around. */
  home: string;
  /** A closed loop on the street graph (first point = last point). */
  route: Pt[];
  /** Milliseconds per loop. */
  period: number;
  /** Offset into the loop, 0–1. */
  phase: number;
  /** Fraction of each loop spent standing at the start (a chat at the door). */
  dwell: number;
}

export interface CrowdInput {
  marketId: string;
  funds: { id: string; partner: string }[];
  founders: { id: string; name: string; companyId: string }[];
  candidates: { id: string; name: string }[];
  segments: { key: string }[];
  /** Wave 3: AI business owners, by business id. */
  owners?: { id: string; name: string }[];
  /** Wave 3: AI angel investors. */
  angels?: { id: string; name: string; fundId: string | null }[];
}

const NPC_NAMES: Record<string, string[]> = {
  lagos: ['Chiamaka', 'Tunde', 'Ngozi', 'Bayo', 'Funmi', 'Emeka'],
  nairobi: ['Wanjiru', 'Otieno', 'Achieng', 'Kamau', 'Njeri', 'Mwangi'],
  london: ['Priya', 'Tom', 'Grace', 'Oliver', 'Amara', 'Callum'],
  accra: ['Ama', 'Kwame', 'Efua', 'Kofi', 'Akosua', 'Yaw'],
  freetown: ['Fatmata', 'Mohamed', 'Isatu', 'Abu', 'Mariama', 'Ibrahim'],
  kigali: ['Aline', 'Eric', 'Clarisse', 'Jean', 'Diane', 'Patrick'],
  johannesburg: ['Thandi', 'Sipho', 'Lerato', 'Pieter', 'Naledi', 'Thabo'],
  cairo: ['Nour', 'Omar', 'Mariam', 'Youssef', 'Salma', 'Karim'],
  dubai: ['Layla', 'Rashid', 'Aisha', 'Faisal', 'Meera', 'Hamdan'],
  'san-francisco': ['Maya', 'Diego', 'Mei', 'Jordan', 'Priya', 'Kai', 'Rosa', 'Wes'],
};

/** A local first name for a background character, stable for the seed. */
export const npcName = (market: string, seed: string) => {
  const xs = NPC_NAMES[market] ?? ['Sam', 'Alex', 'Jordan', 'Robin'];
  return xs[hash(seed) % xs.length]!;
};

/** What the city needs from the view to cast its characters. */
export function crowdInput(view: PlayerView): CrowdInput {
  const m = view.market;
  const founders: CrowdInput['founders'] = [];
  for (const c of view.directory) {
    if (!c.ai || c.status !== 'active' || c.market !== m.id) continue;
    const f = c.founders.find((x) => x.ai) ?? c.founders[0];
    if (f) founders.push({ id: f.id, name: f.name, companyId: c.id });
  }
  return {
    marketId: m.id,
    funds: m.funds.filter((f) => f.market === m.id).map((f) => ({ id: f.id, partner: f.partner })),
    founders,
    candidates: m.talent.map((c) => ({ id: c.id, name: c.name })),
    segments: m.segments.map((s) => ({ key: s.key })),
    owners: businessesOf(view)
      .filter((b) => b.open)
      .map((b) => ({ id: b.id, name: b.owner.name })),
    angels: angelsOf(view),
  };
}

const PARTNER_BG = ['i-banker', 'i-operator', 'i-exited', 'i-corporate', 'i-consultant'];
const FOUNDER_BG = ['f-engineer', 'f-dropout', 'f-second-time', 'f-consultant'];
const SHOPPER_BG = ['b-microfinance', 'b-commercial', 'f-corporate', 'b-wealthy'];
const CANDIDATE_BG = ['f-dropout', 'f-engineer', 'b-fintech'];
const OWNER_BG = ['b-commercial', 'b-microfinance', 'f-corporate', 'f-second-time'];
const ANGEL_BG = ['i-exited', 'i-operator', 'b-wealthy', 'i-banker'];

/** Lanes just inside the kerb, so people walk beside the traffic, not in it. */
const blockLoop = (i: number, j: number, inset: number, cw: boolean, startAt: Pt): Pt[] => {
  const a = { x: i * B + inset, y: j * B + inset };
  const b = { x: (i + 1) * B - inset, y: j * B + inset };
  const c = { x: (i + 1) * B - inset, y: (j + 1) * B - inset };
  const d = { x: i * B + inset, y: (j + 1) * B - inset };
  const ring = cw ? [a, b, c, d] : [a, d, c, b];
  // Snap the start onto the ring (nearest edge point) and rotate the ring to it.
  let best = 0;
  let bestD = Infinity;
  let snap: Pt = ring[0]!;
  for (let k = 0; k < 4; k++) {
    const p = ring[k]!;
    const q = ring[(k + 1) % 4]!;
    const t =
      p.x === q.x
        ? Math.max(0, Math.min(1, (startAt.y - p.y) / (q.y - p.y)))
        : Math.max(0, Math.min(1, (startAt.x - p.x) / (q.x - p.x)));
    const s = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    const dd = Math.hypot(s.x - startAt.x, s.y - startAt.y);
    if (dd < bestD) {
      bestD = dd;
      best = k;
      snap = s;
    }
  }
  const out: Pt[] = [snap];
  for (let k = 1; k <= 4; k++) out.push(ring[(best + k) % 4]!);
  out.push(snap);
  return out;
};

/** Up and down one stretch of kerb (a short pace back and forth). */
const pace = (from: Pt, to: Pt): Pt[] => [from, to, from];

const blockOf = (p: Place) => ({
  i: Math.floor((p.x + p.w / 2) / B),
  j: Math.floor((p.y + p.d / 2) / B),
});

/**
 * The cast of ambient characters for a city, at most `max` of them. Pure and
 * deterministic: the same layout and input give the same people, routes and
 * timings.
 */
export function aiCharacters(layout: CityLayout, input: CrowdInput, max: number): AiPerson[] {
  const rnd = seeded(hash(`crowd:${input.marketId}`));
  const places = new Map(layout.places.map((p) => [p.id, p]));
  const hub = places.get('hub');

  const make = (
    kind: AiPerson['kind'],
    ref: string,
    name: string,
    bgs: string[],
    home: Place,
    style: 'loop' | 'pace',
  ): AiPerson => {
    const h = hash(`${input.marketId}:${kind}:${ref}`);
    const { i, j } = blockOf(home);
    const inset = 0.44 + ((h >>> 3) % 5) * 0.02;
    const door = home.door;
    let route: Pt[];
    if (style === 'loop') route = blockLoop(i, j, inset, ((h >>> 7) & 1) === 1, door);
    else {
      // Pace along the kerb in front of the door, about a tile each way.
      const loop = blockLoop(i, j, inset, true, door);
      const start = loop[0]!;
      const horiz = Math.abs(door.y - Math.round(door.y / B) * B) < 1e-6;
      const off = 0.6 + ((h >>> 11) % 5) * 0.12;
      const lo = (v: number, base: number) => Math.max(base + inset, Math.min(base + B - inset, v));
      const end = horiz
        ? { x: lo(start.x + (h & 1 ? off : -off), i * B), y: start.y }
        : { x: start.x, y: lo(start.y + (h & 1 ? off : -off), j * B) };
      route = pace(start, end);
    }
    const len = Math.max(0.5, pathLength(route));
    // Slow strolling pace: about a third of a tile a second, give or take.
    const speed = 0.28 + ((h >>> 13) % 7) * 0.025;
    return {
      id: `ai:${kind}:${ref}`,
      kind,
      name,
      ref,
      bg: bgs[h % bgs.length]!,
      home: home.id,
      route,
      period: Math.round((len / speed) * 1000 * (style === 'pace' ? 2.2 : 1)),
      phase: (h % 1000) / 1000,
      dwell: style === 'pace' ? 0.35 : 0.12 + ((h >>> 17) % 4) * 0.03,
    };
  };

  const byId = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));

  const partners = byId(input.funds)
    .map((f) => {
      const home = places.get(`fund:${f.id}`);
      return home ? make('partner', f.id, f.partner, PARTNER_BG, home, 'pace') : null;
    })
    .filter((x): x is AiPerson => x !== null);

  const founders = hub
    ? byId(input.founders).map((f, n) => ({
        ...make('founder', f.id, f.name, FOUNDER_BG, hub, n % 2 ? 'pace' : 'loop'),
        company: f.companyId,
      }))
    : [];

  const stalls = layout.places.filter((p) => p.kind === 'stall');
  const shoppers = [...stalls]
    .sort((a, b) =>
      hash(`${input.marketId}:${a.id}`) < hash(`${input.marketId}:${b.id}`) ? -1 : 1,
    )
    .map((s, n) =>
      make(
        'shopper',
        s.ref ?? s.id,
        npcName(input.marketId, `shopper:${s.id}`),
        SHOPPER_BG,
        s,
        n % 2 ? 'loop' : 'pace',
      ),
    );

  const candidates = hub
    ? byId(input.candidates).map((c, n) =>
        make('candidate', c.id, c.name, CANDIDATE_BG, hub, n % 2 ? 'loop' : 'pace'),
      )
    : [];

  // Business owners stand at their shop doors.
  const owners = byId(input.owners ?? [])
    .map((o) => {
      const home = places.get(`biz:${o.id}`);
      return home ? make('owner', o.id, o.name, OWNER_BG, home, 'pace') : null;
    })
    .filter((x): x is AiPerson => x !== null);

  // AI angels walk between their offices and the city's restaurants and back.
  const venues = layout.places
    .filter((p) => p.motif === 'b-restaurant' || p.motif === 'b-cafe' || p.motif === 'b-pub')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const funds = layout.places.filter((p) => p.kind === 'fund');
  const angels = byId(input.angels ?? [])
    .map((a): AiPerson | null => {
      const office =
        (a.fundId && places.get(`fund:${a.fundId}`)) ||
        funds[hash(a.id) % Math.max(1, funds.length)];
      if (!office) return null;
      const venue = venues[hash(`${a.id}:lunch`) % Math.max(1, venues.length)];
      const base = make('angel', a.id, a.name, ANGEL_BG, office, 'loop');
      if (!venue) return { ...base, fund: a.fundId ?? undefined };
      const there = findPath(layout, office.door, venue.door);
      const route = [...there, ...[...there].reverse().slice(1)];
      const len = Math.max(0.5, pathLength(route));
      return {
        ...base,
        fund: a.fundId ?? undefined,
        route,
        period: Math.round((len / 0.6) * 1000),
        dwell: 0.18,
      };
    })
    .filter((x): x is AiPerson => x !== null);

  // Share the budget round-robin, so a small phone still sees every kind.
  const queues = [partners, founders, shoppers, candidates, owners, angels].map((q) => {
    // A seeded shuffle, so which partners show up varies by market, not by id order.
    const xs = [...q];
    for (let k = xs.length - 1; k > 0; k--) {
      const r = Math.floor(rnd() * (k + 1));
      [xs[k], xs[r]] = [xs[r]!, xs[k]!];
    }
    return xs;
  });
  const out: AiPerson[] = [];
  const caps = [5, 4, 4, 3, 6, 5];
  const taken = [0, 0, 0, 0, 0, 0];
  let progress = true;
  while (out.length < max && progress) {
    progress = false;
    for (let q = 0; q < queues.length && out.length < max; q++) {
      if (taken[q]! >= caps[q]!) continue;
      const next = queues[q]![taken[q]!];
      if (!next) continue;
      out.push(next);
      taken[q]!++;
      progress = true;
    }
  }
  return out;
}

/** How many ambient people to draw for a screen width. */
export const crowdSize = (width: number) => (width < 500 ? 6 : width < 900 ? 14 : 22);

/** Where a character is at a moment in time (ms), and whether they're walking. */
export function personAt(
  p: Pick<AiPerson, 'route' | 'period' | 'phase' | 'dwell'>,
  timeMs: number,
): { at: Pt; dx: number; dy: number; walking: boolean } {
  const u = (((timeMs / p.period + p.phase) % 1) + 1) % 1;
  if (u < p.dwell) {
    const a = p.route[0]!;
    const b = p.route[1] ?? a;
    return { at: a, dx: b.x - a.x, dy: b.y - a.y, walking: false };
  }
  const { p: at, dx, dy } = pointAlong(p.route, (u - p.dwell) / (1 - p.dwell));
  return { at, dx, dy, walking: true };
}

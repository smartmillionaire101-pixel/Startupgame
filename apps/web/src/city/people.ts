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
 * - Wave 6 (docs/WAVE6-ALIVE-CITY.md §C1): people live inside buildings.
 *   Who's here reads `businesses[].people` and merges in players from
 *   presence; the streets only carry a few anonymous passers-by, whose
 *   positions are a pure function of wall-clock time, so every player sees
 *   the same city.
 */
import type { PlayerView } from '@runway/engine';
import { hash, seeded } from './contract';
import {
  B,
  findPath,
  nearestStreetPoint,
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
  /** Wave 5: the player's chosen gender, when the server sends it. */
  gender?: 'female' | 'male' | null;
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
      gender: p.gender === 'female' || p.gender === 'male' ? p.gender : null,
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
  /** Wave 6: 'local' is a business owner or a regular you saved (`biz:` or `npc:`). */
  kind: 'fund' | 'founder' | 'talent' | 'customer' | 'player' | 'local';
  refId: string;
  /** Wave 6: the id to open a chat with, when the engine sends it. */
  chatId: string | null;
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

/** Your contacts (up to the engine's 300), newest first; empty when the engine doesn't send them yet. */
export function contactsOf(view: { me: Me }): ContactView[] {
  const raw: unknown = (view.me as Me & { contacts?: unknown }).contacts;
  if (!Array.isArray(raw)) return [];
  const kinds = ['fund', 'founder', 'talent', 'customer', 'player', 'local'];
  return (raw as unknown[])
    .filter((c): c is Record<string, unknown> => isObj(c) && typeof c.id === 'string')
    .map((c) => ({
      id: c.id as string,
      kind: (kinds.includes(c.kind as string) ? c.kind : 'founder') as ContactView['kind'],
      refId: str(c.refId),
      chatId: typeof c.chatId === 'string' && c.chatId ? c.chatId : null,
      name: str(c.name, '—'),
      warmth: Math.max(0, Math.min(1, num(c.warmth))),
      month: num(c.month),
    }))
    .sort((a, b) => b.month - a.month)
    .slice(0, 300);
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
  | 'player'
  | 'partner'
  | 'founder'
  | 'candidate'
  | 'shopper'
  | 'owner'
  | 'angel'
  | 'patron'
  | 'staff';

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

// ---------------------------------------------------------------------------
// Who's here (docs/WAVE6-ALIVE-CITY.md §A6, §C1): people live inside buildings.

/** Who someone is, inside a place. 'player' is a human from presence. */
export type HereKind = 'owner' | 'staff' | 'founder' | 'angel' | 'partner' | 'regular' | 'player';

export interface PersonHere {
  /** The chat character id: a player id, `fund:<id>`, `biz:<bizId>` or `npc:<market>:<n>`. */
  id: string;
  name: string;
  kind: HereKind;
  /** "Owner", "Bartender", "Founder, Kola Pay"… (engine text, or ours). */
  role: string;
  /** When it's a player (human staff, an AI founder or angel). */
  playerId?: string;
  gender: 'female' | 'male' | null;
  /** A real person: chats go to player chat, not the AI. */
  human: boolean;
  /** A player's background id (their outfit), from presence. */
  bg?: string;
}

const HERE_KINDS: readonly HereKind[] = [
  'owner',
  'staff',
  'founder',
  'angel',
  'partner',
  'regular',
  'player',
];

type ViewLike = Pick<PlayerView, 'market' | 'players'>;

const rawBusinesses = (view: Pick<PlayerView, 'market'>) => {
  const raw = (view.market as Market & { businesses?: unknown }).businesses;
  return Array.isArray(raw) ? (raw as unknown[]).filter(isObj) : [];
};

const isHumanPlayer = (view: ViewLike, id: string | undefined) =>
  !!id && (view.players ?? []).some((p) => p.id === id && !(p as { ai?: unknown }).ai);

/**
 * `businesses[].people` for one business, or null when the engine doesn't
 * send it yet (then Who's here falls back to what the view already says).
 */
export function peopleField(view: ViewLike, businessId: string): PersonHere[] | null {
  const b = rawBusinesses(view).find((x) => x.id === businessId);
  if (!b || !Array.isArray(b.people)) return null;
  const out: PersonHere[] = [];
  for (const p of b.people) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id) continue;
    const kind = HERE_KINDS.includes(p.kind as HereKind) ? (p.kind as HereKind) : 'regular';
    const playerId = typeof p.playerId === 'string' ? p.playerId : undefined;
    out.push({
      id: p.id,
      name: str(p.name, '—'),
      kind,
      role: str(p.role),
      ...(playerId ? { playerId } : {}),
      gender: p.gender === 'female' || p.gender === 'male' ? p.gender : null,
      human: isHumanPlayer(view, playerId ?? p.id),
    });
  }
  return out;
}

/** Business ids the engine marks `isNew` (opened in the last two months). */
export function newBusinessIds(view: Pick<PlayerView, 'market'>): string[] {
  return rawBusinesses(view)
    .filter((b) => b.isNew === true && typeof b.id === 'string' && b.open !== false)
    .map((b) => b.id as string)
    .sort();
}

/** How many other players are in each place right now (presence `place`). */
export function playersByPlace(players: PresenceView[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of players) if (p.place) out.set(p.place, (out.get(p.place) ?? 0) + 1);
  return out;
}

/** Whether you've saved this person: their chat id (or what it points at) is a contact. */
export function savedContact(contacts: ContactView[], personId: string): ContactView | null {
  const ref = personId.startsWith('fund:') ? personId.slice(5) : personId;
  return (
    contacts.find(
      (c) =>
        c.chatId === personId ||
        c.refId === personId ||
        (c.kind === 'fund' && personId.startsWith('fund:') && c.refId === ref),
    ) ?? null
  );
}

/** The chat to open for a contact: a player thread, an AI character, or none. */
export function contactChat(
  c: ContactView,
  view: ViewLike,
): { player: string } | { ai: string } | null {
  if (c.chatId) {
    if (c.kind === 'player' || isHumanPlayer(view, c.chatId)) return { player: c.chatId };
    return { ai: c.chatId };
  }
  if (c.kind === 'fund') return { ai: `fund:${c.refId}` };
  if (c.kind === 'player') return { player: c.refId };
  if (c.kind === 'founder')
    return isHumanPlayer(view, c.refId) ? { player: c.refId } : { ai: c.refId };
  if (c.kind === 'local' && c.refId) return { ai: c.refId };
  return null;
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

// ---------------------------------------------------------------------------
// Passers-by: a few anonymous people strolling the pavements for life. They
// have no name and no tap target; everyone you can talk to is inside a building.

export interface Walker {
  id: string;
  /** Background id for the outfit, and the seed for skin and hair. */
  bg: string;
  /** A closed loop just inside the kerb (first point = last point). */
  route: Pt[];
  /** Milliseconds per loop. */
  period: number;
  /** Offset into the loop, 0–1. */
  phase: number;
  /** Fraction of each loop spent standing at the start. */
  dwell: number;
}

const WALKER_BG = [
  'b-microfinance',
  'b-commercial',
  'f-corporate',
  'b-wealthy',
  'f-dropout',
  'f-engineer',
  'i-operator',
];

const blockOf = (p: Place) => ({
  i: Math.floor((p.x + p.w / 2) / B),
  j: Math.floor((p.y + p.d / 2) / B),
});

/**
 * Up to `max` passers-by, each looping the pavement around a block with
 * buildings on it. Pure and deterministic for the layout, so every player
 * sees the same street life.
 */
export function passersBy(layout: CityLayout, max: number): Walker[] {
  if (layout.geo) return roadWalkers(layout, max);
  const rnd = seeded(hash(`walkers:${layout.marketId}`));
  const blocks = new Map<string, { i: number; j: number; door: Pt }>();
  for (const p of [...layout.places].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const { i, j } = blockOf(p);
    if (!blocks.has(`${i},${j}`)) blocks.set(`${i},${j}`, { i, j, door: p.door });
  }
  const pool = [...blocks.values()];
  const out: Walker[] = [];
  for (let n = 0; n < max && pool.length; n++) {
    const blk = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    const h = hash(`${layout.marketId}:walker:${n}`);
    const inset = 0.44 + ((h >>> 3) % 5) * 0.02;
    const route = blockLoop(blk.i, blk.j, inset, ((h >>> 7) & 1) === 1, blk.door);
    const len = Math.max(0.5, pathLength(route));
    const speed = 0.28 + ((h >>> 13) % 7) * 0.025;
    out.push({
      id: `walker:${n}`,
      bg: WALKER_BG[h % WALKER_BG.length]!,
      route,
      period: Math.round((len / speed) * 1000),
      phase: (h % 1000) / 1000,
      dwell: 0.1 + ((h >>> 17) % 4) * 0.03,
    });
  }
  return out;
}

/**
 * Wave 8: on a real map, passers-by walk out from a building along the real
 * roads and back again.
 */
function roadWalkers(layout: CityLayout, max: number): Walker[] {
  const rnd = seeded(hash(`walkers:${layout.marketId}`));
  const pool = [...layout.places]
    .filter((p) => p.kind !== 'stall' && p.kind !== 'airport')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const out: Walker[] = [];
  for (let n = 0; n < max && pool.length; n++) {
    const p = pool.splice(Math.floor(rnd() * pool.length), 1)[0]!;
    const h = hash(`${layout.marketId}:walker:${n}`);
    const ang = ((h % 360) * Math.PI) / 180;
    const reach = 4 + ((h >>> 9) % 5);
    const end = nearestStreetPoint(layout, {
      x: p.door.x + Math.cos(ang) * reach,
      y: p.door.y + Math.sin(ang) * reach,
    });
    const there = findPath(layout, p.door, end);
    const route = [...there, ...there.slice(0, -1).reverse()];
    const len = Math.max(0.5, pathLength(route));
    const speed = 0.28 + ((h >>> 13) % 7) * 0.025;
    out.push({
      id: `walker:${n}`,
      bg: WALKER_BG[h % WALKER_BG.length]!,
      route,
      period: Math.round((len / speed) * 1000),
      phase: (h % 1000) / 1000,
      dwell: 0.1 + ((h >>> 17) % 4) * 0.03,
    });
  }
  return out;
}

/** How many passers-by to draw for a screen width: a few, never a crowd. */
export const crowdSize = (width: number) => (width < 500 ? 4 : width < 900 ? 7 : 10);

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

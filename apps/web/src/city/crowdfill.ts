/**
 * A city that feels alive: venues (clubs, bars, restaurants, cafés, co-working,
 * the Hub, the Event Hall, banks, investors' offices) are filled with named AI
 * people — AI founders, fund partners, business owners, bankers and people on
 * AI companies' teams — taken from the world itself (their real names and
 * companies). The fill shrinks as real players come in, so AI people phase
 * out as the city fills with humans:
 *
 *   AI fill = max(0, target occupancy for this room at this hour − real players here)
 *
 * Clubs and bars are busy at night, cafés in the morning, co-working and
 * banks in office hours. Everything is pure and deterministic for the world,
 * the place and the city's hour: every player sees the same people, and it
 * costs the server nothing (bankers and team members chat as `crowd:` ids).
 */
import { crowdId, crowdPerson, type MarketId, type PlayerView } from '@runway/engine';
import { businessesOf, hash, lendersOf } from './contract';
import { businessRoom, type RoomKind } from './rooms';
import { localHour } from './travel';

/**
 * The city's hour for its crowd: the local clock, or `runway.mapHour` in
 * localStorage (the same override the 3D sky takes, for tests and screenshots).
 */
export function crowdHour(marketId: string): number {
  try {
    const o = localStorage.getItem('runway.mapHour');
    if (o !== null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  } catch {
    /* no storage */
  }
  return localHour(marketId);
}

/** Who someone in the crowd is. */
export type CrowdRole = 'founder' | 'investor' | 'banker' | 'owner' | 'employee';

export interface CrowdPerson {
  /** The AI chat character id: a founder's player id, `fund:<id>`, `biz:<id>` or `crowd:…`. */
  id: string;
  name: string;
  role: CrowdRole;
  /** Their company, fund, bank or business. */
  org: string;
  orgId: string;
  gender: 'female' | 'male' | null;
}

type View = Pick<PlayerView, 'market' | 'directory'>;

/**
 * How many people a room holds at an hour (players and AI people together).
 * `hour` is the city's local hour, 0–24.
 */
export function venueTarget(room: RoomKind, hour: number): number {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const between = (a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
  switch (room) {
    case 'club':
      return between(22, 4) ? 10 : between(19, 22) ? 6 : between(4, 6) ? 3 : 1;
    case 'bar':
    case 'lounge':
    case 'karaoke':
    case 'stage':
      return between(19, 2) ? 8 : between(17, 19) ? 6 : between(12, 17) ? 3 : 1;
    case 'restaurant':
      return between(19, 23) ? 8 : between(12, 15) ? 7 : between(7, 12) ? 3 : between(0, 6) ? 0 : 2;
    case 'cafe':
      return between(7, 11) ? 6 : between(11, 17) ? 5 : between(17, 21) ? 3 : between(0, 6) ? 0 : 1;
    case 'cowork':
    case 'hub':
      return between(9, 18) ? 7 : between(18, 22) ? 3 : 1;
    case 'eventhall':
      return between(10, 22) ? 6 : 1;
    case 'bank':
      return between(9, 17) ? 5 : 0;
    case 'investor':
      return between(9, 19) ? 4 : 0;
    case 'gym':
      return between(6, 9) || between(17, 21) ? 6 : between(0, 5) ? 0 : 2;
    default:
      return 0;
  }
}

/** The AI people to add when `real` players are already here (never negative). */
export const aiFill = (target: number, real: number) => Math.max(0, target - Math.max(0, real));

/** Rooms that get a named crowd, and who goes there (weights by role). */
const MIX: Partial<Record<RoomKind, Partial<Record<CrowdRole, number>>>> = {
  club: { founder: 3, employee: 4, owner: 2, investor: 1.5, banker: 1 },
  bar: { founder: 3, employee: 3, owner: 2, investor: 2, banker: 1.5 },
  lounge: { founder: 2, employee: 2, owner: 2, investor: 3, banker: 2 },
  karaoke: { founder: 2, employee: 5, owner: 1, banker: 1 },
  stage: { founder: 2, employee: 4, owner: 2, investor: 1 },
  restaurant: { founder: 2, investor: 2.5, banker: 1.5, owner: 2, employee: 2 },
  cafe: { founder: 4, employee: 2, investor: 1.5, owner: 1 },
  cowork: { founder: 5, employee: 4, investor: 1 },
  hub: { founder: 5, employee: 3, investor: 1 },
  eventhall: { founder: 4, investor: 2, employee: 2, banker: 1, owner: 1 },
  bank: { banker: 3, owner: 4, founder: 2 },
  investor: { founder: 5, investor: 1 },
  gym: { founder: 2, employee: 4, owner: 1, banker: 1 },
};

export const hasCrowd = (room: RoomKind) => MIX[room] !== undefined;

/**
 * Everyone in the city who can be out and about, by role, from the world:
 * AI founders (their companies), AI fund partners, business owners, bankers
 * at each lender, people on AI companies' teams.
 */
export function crowdPool(view: View): CrowdPerson[] {
  const m = view.market;
  const market = m.id as MarketId;
  const out: CrowdPerson[] = [];
  const cos = view.directory
    .filter((c) => c.ai && c.status === 'active' && c.market === m.id)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const c of cos) {
    const f = c.founders.find((x) => x.ai);
    if (f)
      out.push({
        id: f.id,
        name: f.name,
        role: 'founder',
        org: c.name,
        orgId: c.id,
        gender: null,
      });
    const team = Math.min(6, Math.max(1, (c.teamSize ?? 1) - c.founders.length));
    for (let n = 0; n < team; n++) {
      const id = crowdId(market, 'staff', c.id, n);
      const who = crowdPerson(id);
      if (who) out.push({ id, ...who, role: 'employee', org: c.name, orgId: c.id });
    }
  }
  for (const f of [...m.funds]
    .filter((x) => x.ai && x.market === m.id && !(x as { angelId?: string }).angelId)
    .sort((a, b) => (a.id < b.id ? -1 : 1)))
    out.push({
      id: `fund:${f.id}`,
      name: f.partner,
      role: 'investor',
      org: f.name,
      orgId: f.id,
      gender: null,
    });
  for (const b of businessesOf(view).filter((x) => x.open))
    out.push({
      id: `biz:${b.id}`,
      name: b.owner.name,
      role: 'owner',
      org: b.name,
      orgId: b.id,
      gender: null,
    });
  for (const l of lendersOf(view)) {
    if (l.fallback) continue;
    for (let n = 0; n < 4; n++) {
      const id = crowdId(market, 'banker', l.id, n);
      const who = crowdPerson(id);
      if (who) out.push({ id, ...who, role: 'banker', org: l.name, orgId: l.id });
    }
  }
  return out;
}

export interface CrowdVenue {
  id: string;
  room: RoomKind;
}

/**
 * Where each person is this hour, if they're out: one venue, picked by how
 * busy each is at this hour and how much it suits them (founders at the Hub
 * by day and the clubs at night), so nobody is in two places at once.
 */
export function whereIs(
  p: CrowdPerson,
  venues: readonly CrowdVenue[],
  hour: number,
  slot: string,
): string | null {
  const h = hash(`${p.id}:${slot}`);
  // Most of the time people are somewhere you can't go (home, work): out a third of the hours.
  if (h % 3 !== 0) return null;
  let total = 0;
  const ws = venues.map((v) => {
    const w = venueTarget(v.room, hour) * (MIX[v.room]?.[p.role] ?? 0);
    total += w;
    return w;
  });
  if (!total) return null;
  let r = (hash(`${p.id}:${slot}:where`) / 4294967296) * total;
  for (let i = 0; i < venues.length; i++) {
    r -= ws[i]!;
    if (r < 0) return venues[i]!.id;
  }
  return venues[venues.length - 1]!.id;
}

export interface CrowdQuery {
  /** The place id (`biz:<id>`, `hub`, `lender:<id>`, `fund:<id>`, `eventhall`…). */
  placeId: string;
  room: RoomKind;
  /** The city's local hour (0–24). */
  hour: number;
  /** Real players here now. */
  real: number;
  /** People already shown here (the owner, angels…): not added again. */
  exclude?: readonly string[];
}

/** Every place a crowd can be in, for this view (sorted, so every client agrees). */
export function crowdVenues(view: View): CrowdVenue[] {
  const out: CrowdVenue[] = [
    { id: 'hub', room: 'hub' },
    { id: 'eventhall', room: 'eventhall' },
    ...businessesOf(view)
      .filter((b) => b.open)
      .map((b) => ({ id: `biz:${b.id}`, room: businessRoom(b.kind, b.look.shape) })),
    ...lendersOf(view)
      .filter((l) => !l.fallback)
      .map((l) => ({ id: `lender:${l.id}`, room: 'bank' as RoomKind })),
    ...view.market.funds
      .filter((f) => f.market === view.market.id)
      .map((f) => ({ id: `fund:${f.id}`, room: 'investor' as RoomKind })),
  ];
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * The named AI people in a place now. Deterministic for the world, the
 * place and the hour; shrinks as real players come in.
 */
export function crowdAt(view: View, q: CrowdQuery, pool = crowdPool(view)): CrowdPerson[] {
  const mix = MIX[q.room];
  if (!mix) return [];
  const want = aiFill(venueTarget(q.room, q.hour), q.real);
  if (!want) return [];
  const slot = `${view.market.month}:${Math.floor(q.hour)}`;
  const venues = crowdVenues(view);
  const hour = Math.floor(q.hour);
  const skip = new Set(q.exclude ?? []);
  const office = q.hour >= 9 && q.hour < 17;
  const fits = (p: CrowdPerson) => (mix[p.role] ?? 0) > 0 && !skip.has(p.id);
  // Who is here: at work (bankers at their bank, partners at their fund in
  // office hours), then whoever's out and came here, by how well they fit.
  const atWork = pool.filter(
    (p) =>
      fits(p) &&
      office &&
      ((p.role === 'banker' && q.placeId === `lender:${p.orgId}`) ||
        (p.role === 'investor' && q.placeId === `fund:${p.orgId}`)),
  );
  const out = pool
    .filter((p) => fits(p) && !atWork.includes(p))
    // At work elsewhere in office hours: not out.
    .filter((p) => !(office && (p.role === 'banker' || p.role === 'investor')))
    .filter((p) => whereIs(p, venues, hour, slot) === q.placeId);
  // Not enough: more of the many (team members, owners, bankers off duty) who
  // aren't out elsewhere; founders and partners are only ever in one place.
  const rest = pool
    .filter((p) => fits(p) && p.role !== 'founder' && p.role !== 'investor')
    .filter((p) => !atWork.includes(p) && !out.includes(p))
    .filter((p) => !(office && p.role === 'banker'))
    .filter((p) => whereIs(p, venues, hour, slot) === null)
    .map((p) => ({
      p,
      score: hash(`${q.placeId}:${slot}:${p.id}`) / 4294967296 / (mix[p.role] ?? 1),
    }))
    .sort((a, b) => a.score - b.score || (a.p.id < b.p.id ? -1 : 1))
    .map((x) => x.p);
  return [...atWork, ...out, ...rest].slice(0, want);
}

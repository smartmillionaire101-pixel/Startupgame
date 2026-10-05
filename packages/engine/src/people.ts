/**
 * Who's here (Wave 6): the people inside each business this month, and the
 * contacts you save from them.
 *
 * Read-only and deterministic for a market month: the owner is always in;
 * human players with a job there are staff; each AI founder, angel and fund
 * partner in the city is at exactly one place (`deriveRng(seed, 'people',
 * 'where', personId, month)`, weighted to places that fit them; angels stay
 * where Wave 5's `angelsAt` put them); food, fun and hospitality places get
 * two to six regulars (`deriveRng(seed, 'people', businessId, month)`), NPCs
 * whose name and job are fixed by their id `npc:<market>:<n>`. Human
 * visitors come from server presence and are merged in by the client.
 */
import { CITY_NAME_PARTS, REGULAR_JOBS, genderOfName } from './data/business-names.js';
import { MARKET_IDS } from './data/markets.js';
import type { MarketId } from './data/markets.js';
import { businessesOf, getBusiness, isOpen, specOf } from './economy.js';
import { ensure, fail } from './errors.js';
import { addContact, contactWarmth, putContact } from './events.js';
import { getMarket, locationOf } from './helpers.js';
import { angelsAt } from './programs.js';
import { deriveRng, hashString } from './rng.js';
import type { Rng } from './rng.js';
import type {
  Contact,
  ContactKind,
  Id,
  LocalBusiness,
  MarketState,
  Player,
  World,
} from './types.js';

export interface PersonHere {
  /** Chat character id: player id, `fund:<id>`, `biz:<bizId>` (owner) or `npc:<market>:<n>`. */
  id: string;
  name: string;
  kind: 'owner' | 'staff' | 'founder' | 'angel' | 'partner' | 'regular';
  /** "Owner", "Bartender", "Founder, Kola Pay", "Angel investor", "Nurse". */
  role: string;
  /** When it's a player (human staff, AI founder or angel). */
  playerId?: string;
  gender: 'female' | 'male';
}

/** Regulars are drawn from this many NPCs per city (`npc:<market>:0` … `npc:<market>:499`). */
export const NPC_POOL = 500;
/** Warmth when you meet someone at a venue. */
export const MET_WARMTH = 0.12;
/** Warmth when you save someone as a contact (more if you'd already met). */
export const SAVE_WARMTH = 0.15;
export const SAVE_WARMTH_MET = 0.3;

const FITS: Record<'founder' | 'angel' | 'partner', readonly string[]> = {
  angel: ['cafe', 'coffee-roaster', 'coffee-chain', 'bakery', 'lounge', 'lounge-bar', 'hotel'],
  founder: ['cafe', 'coffee-roaster', 'coffee-chain', 'co-working', 'bootcamp'],
  partner: ['hotel', 'restaurant', 'dim-sum', 'curry-house', 'grill-house', 'lounge-bar', 'lounge'],
};
const FIT_WEIGHT = 6;

/** A regular in a city: name, job and gender are fixed by their number. */
export function npcPerson(market: MarketId, n: number): PersonHere {
  const parts = CITY_NAME_PARTS[market];
  const h = hashString(`npc:${market}:${n}`);
  const gender = h % 2 === 0 ? 'female' : 'male';
  const firsts = parts[gender];
  const first = firsts[(h >>> 1) % firsts.length]!;
  const last = parts.last[(h >>> 9) % parts.last.length]!;
  return {
    id: `npc:${market}:${n}`,
    name: `${first} ${last}`,
    kind: 'regular',
    role: REGULAR_JOBS[(h >>> 17) % REGULAR_JOBS.length]!,
    gender,
  };
}

/** Parse `npc:<market>:<n>` (null when it isn't one). */
export function parseNpcId(id: string): { market: MarketId; n: number } | null {
  const m = /^npc:([a-z-]+):(\d{1,6})$/.exec(id);
  if (!m) return null;
  const market = m[1] as MarketId;
  const n = Number(m[2]);
  if (!(MARKET_IDS as readonly string[]).includes(market) || n >= NPC_POOL) return null;
  return { market, n };
}

const genderOf = (p: Player): 'female' | 'male' => p.gender ?? genderOfName(p.name);

const hasRegulars = (b: LocalBusiness) => {
  const spec = specOf(b);
  return (
    spec.category === 'food' ||
    spec.category === 'hospitality' ||
    !!spec.venue?.items.some((i) => i.activity)
  );
};

function weightedPick(rng: Rng, items: readonly { b: LocalBusiness; w: number }[]) {
  const total = items.reduce((a, x) => a + x.w, 0);
  let r = rng.next() * total;
  for (const x of items) {
    r -= x.w;
    if (r < 0) return x.b;
  }
  return items[items.length - 1]!.b;
}

/** Everyone inside each open business this month, by business id. */
export function peopleHere(world: World, m: MarketState): Record<Id, PersonHere[]> {
  const month = m.month;
  const open = Object.values(businessesOf(m))
    .filter(isOpen)
    .sort((a, z) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0));
  const out: Record<Id, PersonHere[]> = {};
  for (const b of open)
    out[b.id] = [
      {
        id: `biz:${b.id}`,
        name: b.owner.name,
        kind: 'owner',
        role: 'Owner',
        gender: genderOfName(b.owner.name),
      },
    ];

  // Human players at work.
  for (const p of Object.values(world.players)) {
    if (p.ai || !p.job || !out[p.job.businessId]) continue;
    const b = m.businesses![p.job.businessId]!;
    const role = specOf(b).roles.find((r) => r.role === p.job!.role);
    out[b.id]!.push({
      id: p.id,
      name: p.name,
      kind: 'staff',
      role: role?.label ?? 'Staff',
      playerId: p.id,
      gender: genderOf(p),
    });
  }

  // AI founders, angels and fund partners: each at exactly one place this month.
  const venues = open.filter((b) => specOf(b).venue?.items.some((i) => i.meeting));
  if (venues.length) {
    const placed = (kind: 'founder' | 'angel' | 'partner', personId: string, fixed?: Id) => {
      if (fixed && out[fixed]) return out[fixed]!;
      const rng = deriveRng(world.seed, 'people', 'where', personId, month);
      const b = weightedPick(
        rng,
        venues.map((v) => ({ b: v, w: FITS[kind].includes(v.kind) ? FIT_WEIGHT : 1 })),
      );
      return out[b.id]!;
    };
    const angelSpot: Record<Id, Id> = {};
    for (const [bizId, ids] of Object.entries(angelsAt(world, m.id)))
      for (const id of ids) angelSpot[id] = bizId;
    const players = Object.values(world.players)
      .filter((p) => p.ai && p.market === m.id)
      .sort((a, z) => (a.id < z.id ? -1 : 1));
    for (const p of players) {
      if (p.angel) {
        if (p.angel.retiredMonth !== undefined) continue;
        placed('angel', p.id, angelSpot[p.id]).push({
          id: p.id,
          name: p.name,
          kind: 'angel',
          role: 'Angel investor',
          playerId: p.id,
          gender: genderOf(p),
        });
        continue;
      }
      if (p.role !== 'founder') continue;
      const c = p.companyIds
        .map((id) => world.companies[id])
        .find((x) => x?.status === 'active' && x.market === m.id);
      if (!c) continue;
      placed('founder', p.id).push({
        id: p.id,
        name: p.name,
        kind: 'founder',
        role: `Founder, ${c.name}`,
        playerId: p.id,
        gender: genderOf(p),
      });
    }
    const funds = Object.values(world.funds)
      .filter((f) => f.market === m.id && f.ai && !f.angelId && !f.managerId)
      .sort((a, z) => (a.id < z.id ? -1 : 1));
    for (const f of funds)
      placed('partner', `fund:${f.id}`).push({
        id: `fund:${f.id}`,
        name: f.partner,
        kind: 'partner',
        role: `Partner, ${f.name}`,
        gender: genderOfName(f.partner),
      });
  }

  // Regulars in food, fun and hospitality places.
  for (const b of open) {
    if (!hasRegulars(b)) continue;
    const rng = deriveRng(world.seed, 'people', b.id, month);
    const count = rng.int(2, 6);
    const seen = new Set<number>();
    for (let i = 0; i < count; i++) {
      const n = rng.int(0, NPC_POOL - 1);
      if (seen.has(n)) continue;
      seen.add(n);
      out[b.id]!.push(npcPerson(m.id, n));
    }
  }
  return out;
}

// ---------------------------------------------------------------- Meeting and saving people

/** Who you'd be on warmer terms with, as a contact: kind, ref and display name. */
function asContact(
  world: World,
  person: PersonHere,
): { kind: ContactKind; refId: Id; name: string } | null {
  switch (person.kind) {
    case 'founder':
      return {
        kind: 'founder',
        refId: person.playerId!,
        name: `${person.name}, ${person.role.replace(/^Founder, /, '')}`,
      };
    case 'angel': {
      // Warmth with an angel goes to their fund, so warm intros work (as in Wave 5).
      const fundId = world.players[person.playerId!]?.angel?.fundId;
      const f = fundId ? world.funds[fundId] : undefined;
      return f
        ? { kind: 'fund', refId: f.id, name: `${person.name}, ${f.name}` }
        : { kind: 'founder', refId: person.playerId!, name: person.name };
    }
    case 'partner': {
      const id = person.id.slice('fund:'.length);
      const f = world.funds[id];
      return f ? { kind: 'fund', refId: f.id, name: `${f.partner}, ${f.name}` } : null;
    }
    case 'owner':
    case 'regular':
      return { kind: 'local', refId: person.id, name: `${person.name}, ${person.role}` };
    default:
      return null;
  }
}

/**
 * A venue buy's lucky roll came up (Wave 6): meet someone who's actually
 * here, an AI founder, angel or fund partner first, otherwise a regular
 * (or the owner). They become a contact at `MET_WARMTH`.
 */
export function metAtVenue(
  world: World,
  me: Player,
  b: LocalBusiness,
  rng: Rng,
  month: number,
  exclude: readonly string[] = [],
): { name: string; kind: ContactKind; refId: Id; role: string } | null {
  const m = getMarket(world, b.market);
  const here = (peopleHere(world, m)[b.id] ?? []).filter(
    (x) =>
      x.id !== me.id &&
      !exclude.includes(x.id) &&
      !exclude.includes(x.playerId ?? '') &&
      !exclude.includes(x.id.replace(/^fund:/, '')),
  );
  const vip = here.filter(
    (x) => x.kind === 'founder' || x.kind === 'angel' || x.kind === 'partner',
  );
  const regulars = here.filter((x) => x.kind === 'regular');
  const owner = here.filter((x) => x.kind === 'owner');
  const pool = vip.length ? vip : regulars.length ? regulars : owner;
  if (!pool.length) return null;
  const person = rng.pick(pool);
  const c = asContact(world, person);
  if (!c) return null;
  addContact(me, { ...c, warmth: MET_WARMTH }, month);
  return { name: person.name, kind: c.kind, refId: c.refId, role: person.role };
}

/** The id to open a chat with for a contact (null for kinds you can't chat with). */
export function chatIdOf(c: Contact): string | null {
  switch (c.kind) {
    case 'player':
    case 'founder':
    case 'local':
      return c.refId;
    case 'fund':
      return `fund:${c.refId}`;
    default:
      return null;
  }
}

/** Save someone you see in town as a contact (free; people in the city you're in). */
export function saveContact(world: World, me: Player, personId: string, givenName: string) {
  const here = locationOf(me);
  const m = getMarket(world, here);
  const month = m.month;
  ensure(personId !== me.id, 'contact.self', 'That’s you.');
  let c: { kind: ContactKind; refId: Id; name: string };
  const p = world.players[personId];
  if (p) {
    ensure(locationOf(p) === here, 'contact.where', `${p.name} isn’t in this city.`);
    if (p.ai) {
      const co = p.companyIds.map((id) => world.companies[id]).find((x) => x?.status === 'active');
      c = { kind: 'founder', refId: p.id, name: co ? `${p.name}, ${co.name}` : p.name };
    } else c = { kind: 'player', refId: p.id, name: p.name };
  } else if (personId.startsWith('fund:')) {
    const f = world.funds[personId.slice('fund:'.length)];
    ensure(f, 'contact.person', 'We can’t find that person.');
    ensure(f.market === here, 'contact.where', `${f.partner} isn’t in this city.`);
    c = { kind: 'fund', refId: f.id, name: `${f.partner}, ${f.name}` };
  } else if (personId.startsWith('biz:')) {
    let b: LocalBusiness;
    try {
      b = getBusiness(world, personId.slice('biz:'.length));
    } catch {
      return fail('contact.person', 'We can’t find that person.');
    }
    ensure(b.market === here, 'contact.where', `${b.owner.name} isn’t in this city.`);
    c = { kind: 'local', refId: personId, name: `${b.owner.name}, ${b.name}` };
  } else {
    const npc = parseNpcId(personId);
    ensure(npc, 'contact.person', 'We can’t find that person.');
    ensure(npc.market === here, 'contact.where', 'They aren’t in this city.');
    const known = npcPerson(npc.market, npc.n);
    const name = givenName.trim().slice(0, 60) || known.name;
    c = { kind: 'local', refId: personId, name: `${name}, ${known.role}` };
  }
  const id = `${c.kind}:${c.refId}`;
  const before = (me.contacts ?? []).find((x) => x.id === id);
  const warmth = before ? Math.max(contactWarmth(before, month), SAVE_WARMTH_MET) : SAVE_WARMTH;
  const contact = putContact(me, { ...c, warmth }, month);
  return {
    contact: { ...contact, chatId: chatIdOf(contact) },
    message: before
      ? `${c.name.split(',')[0]} is in your contacts.`
      : `Saved ${c.name.split(',')[0]} to your contacts.`,
  };
}

/** Remove a saved contact. */
export function removeContact(me: Player, contactId: string) {
  const list = me.contacts ?? [];
  const i = list.findIndex((x) => x.id === contactId);
  ensure(i >= 0, 'contact.missing', 'That contact isn’t in your list.');
  const [gone] = list.splice(i, 1);
  return { message: `Removed ${gone!.name.split(',')[0]} from your contacts.` };
}

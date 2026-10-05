/**
 * City events, contacts and warm intros (Wave 2).
 *
 * Players host events (paying the venue and a budget to the market's
 * suppliers) and others RSVP (paying a ticket to the host). At the
 * settlement of the event's month it is held deterministically: AI guests
 * turn up according to the kind, the budget, the host's stars, the market's
 * capital depth and the room's capacity; then every human there gets
 * contacts (fund partners, founders, candidates, a customer segment, each
 * other), and the kind's main outcome: warm intros to funds, customer leads,
 * referred candidates. Network and trust rise; the host's reputation moves
 * with the turnout.
 */
import {
  CONTACTS_LIMIT,
  CONTACT_FADE_MONTHS,
  EVENT_KIND_DATA,
  EVENT_MAX_BUDGET_COL,
  EVENT_MAX_LEAD_MONTHS,
  EVENT_MAX_TICKET_COL,
  VENUE_DATA,
} from './data/events.js';
import type { EventKind, EventVenue } from './data/events.js';
import { CAPITAL } from './data/capital.js';
import type { MarketId } from './data/markets.js';
import { emptyPosition } from './customers.js';
import { ensure } from './errors.js';
import { adjustTrust, col, getMarket, locationOf, notify, spendHours } from './helpers.js';
import { newId } from './ids.js';
import { pay, payExact, transfer } from './ledger.js';
import { eventVenueBusiness } from './economy.js';
import { clamp, clamp01 } from './math.js';
import { scale } from './money.js';
import { checkName } from './names.js';
import { deriveRng } from './rng.js';
import type { Rng } from './rng.js';
import { applyStarEvent, starMultiplier } from './stars.js';
import { makeCandidate } from './staff.js';
import type {
  CityEvent,
  Company,
  Contact,
  ContactKind,
  Id,
  MarketState,
  Player,
  World,
} from './types.js';

// ---------------------------------------------------------------- Contacts

/** Warmth today: contacts fade linearly over CONTACT_FADE_MONTHS without a new meeting. */
export function contactWarmth(c: Contact, nowMonth: number): number {
  const age = Math.max(0, nowMonth - c.month);
  return clamp01(c.warmth * (1 - age / CONTACT_FADE_MONTHS));
}

/** Best current warmth with someone (0 when no contact). */
export function warmthWith(
  world: World,
  p: Player,
  kind: ContactKind,
  refId: Id,
  nowMonth?: number,
): number {
  const c = (p.contacts ?? []).find((x) => x.kind === kind && x.refId === refId);
  if (!c) return 0;
  return contactWarmth(c, nowMonth ?? world.markets[p.market]?.month ?? c.month);
}

/** Add or warm a contact (meeting again compounds warmth); newest first. */
export function addContact(
  p: Player,
  input: { kind: ContactKind; refId: Id; name: string; warmth: number },
  month: number,
) {
  const list = (p.contacts ??= []);
  const id = `${input.kind}:${input.refId}`;
  const i = list.findIndex((c) => c.id === id);
  let warmth = clamp01(input.warmth);
  if (i >= 0) {
    const prev = contactWarmth(list[i]!, month);
    warmth = clamp01(1 - (1 - prev) * (1 - warmth));
    list.splice(i, 1);
  }
  list.unshift({
    id,
    kind: input.kind,
    refId: input.refId,
    name: input.name,
    warmth: Math.round(warmth * 100) / 100,
    month,
  });
  trimContacts(list, month);
}

/**
 * Wave 6: add a contact at exactly this warmth (saving someone you met), or
 * reset an existing one to it; newest first. Returns the stored contact.
 */
export function putContact(
  p: Player,
  input: { kind: ContactKind; refId: Id; name: string; warmth: number },
  month: number,
): Contact {
  const list = (p.contacts ??= []);
  const id = `${input.kind}:${input.refId}`;
  const i = list.findIndex((c) => c.id === id);
  if (i >= 0) list.splice(i, 1);
  const c: Contact = {
    id,
    kind: input.kind,
    refId: input.refId,
    name: input.name,
    warmth: Math.round(clamp01(input.warmth) * 100) / 100,
    month,
  };
  list.unshift(c);
  trimContacts(list, month);
  return c;
}

/** Keep at most CONTACTS_LIMIT contacts, dropping the coldest first (never the newest). */
function trimContacts(list: Contact[], month: number) {
  while (list.length > CONTACTS_LIMIT) {
    let coldest = list.length - 1;
    let w = contactWarmth(list[coldest]!, month);
    for (let i = list.length - 2; i >= 1; i--) {
      const x = contactWarmth(list[i]!, month);
      if (x < w) {
        w = x;
        coldest = i;
      }
    }
    list.splice(coldest, 1);
  }
}

/**
 * A warm introduction to a fund: relaxes the fund's minimum stars by up to 1
 * and improves the first-meeting score with warmth. A wider network helps a
 * little on its own (any fund).
 */
export function warmIntro(world: World, founder: Player, fundId: Id, nowMonth?: number) {
  const warmth = warmthWith(world, founder, 'fund', fundId, nowMonth);
  return {
    warmth,
    starRelief: warmth,
    scoreBonus: warmth * 0.12 + networkBonus(founder),
  };
}

/** Network above the typical starting 30 slightly raises AI investors' first-meeting odds (max +0.03). */
export const networkBonus = (p: Player): number => (clamp(p.network, 30, 100) - 30) * (0.03 / 70);

// ---------------------------------------------------------------- Costs

export function eventCost(m: MarketState, kind: EventKind, venue: EventVenue): number {
  return scale(col(m), EVENT_KIND_DATA[kind].costCol * VENUE_DATA[venue].costMult);
}

export function eventCapacity(kind: EventKind, venue: EventVenue): number {
  const [lo, hi] = EVENT_KIND_DATA[kind].capacity;
  return Math.round(lo + (hi - lo) * VENUE_DATA[venue].size);
}

const hasStanding = (p: Player) => p.role === 'investor' || p.stars.value >= 1.5;

const eventsOf = (world: World) => (world.events ??= {});

function getEvent(world: World, id: Id): CityEvent {
  const e = world.events?.[id];
  ensure(e, 'event.missing', 'Event not found.');
  return e;
}

// ---------------------------------------------------------------- Commands

export function hostEvent(
  world: World,
  me: Player,
  args: {
    kind: EventKind;
    title: string;
    venue: EventVenue;
    month?: number;
    budget: number;
    ticket?: number;
    segmentKey?: string;
    /** A local hotel or event venue (Wave 3): its fee goes to that business. */
    businessId?: Id;
  },
) {
  const m = getMarket(world, me.market);
  const k = EVENT_KIND_DATA[args.kind];
  ensure(
    me.role === 'founder' || me.role === 'investor',
    'event.role',
    'Founders and investors can host events.',
  );
  ensure(
    !k.needsStanding || hasStanding(me),
    'event.standing',
    `Hosting a ${k.label.toLowerCase()} needs some standing: 1.5 stars or an investor role.`,
  );
  ensure(
    !Object.values(eventsOf(world)).some((e) => e.hostId === me.id && e.status === 'upcoming'),
    'event.limit',
    'You already have an upcoming event. One at a time.',
  );
  const check = checkName(args.title, { taken: {}, maxLength: 48 });
  ensure(check.ok, 'event.title', check.ok ? '' : `Title: ${check.reason}`);
  const month = args.month ?? m.month;
  ensure(
    month >= m.month && month <= m.month + EVENT_MAX_LEAD_MONTHS,
    'event.month',
    `Pick this month or up to ${EVENT_MAX_LEAD_MONTHS} months ahead.`,
  );
  if (args.venue === 'office') {
    const hasOffice =
      me.companyIds.some((id) => world.companies[id]?.status === 'active') || !!me.investor?.fundId;
    ensure(hasOffice, 'event.venue', 'You need a company or a fund office to host there.');
  }
  ensure(
    args.budget <= scale(col(m), EVENT_MAX_BUDGET_COL),
    'event.budget',
    'That budget is more than any room needs.',
  );
  const ticket = args.ticket ?? 0;
  ensure(
    ticket <= scale(col(m), EVENT_MAX_TICKET_COL),
    'event.ticket',
    'Nobody will pay that for a ticket.',
  );
  let segmentKey: string | undefined;
  if (args.kind === 'customer-mixer') {
    ensure(
      args.segmentKey && m.segments[args.segmentKey],
      'event.segment',
      'Pick the customer segment to invite.',
    );
    segmentKey = args.segmentKey;
  } else {
    ensure(!args.segmentKey, 'event.segment', 'Only customer mixers invite a segment.');
  }
  const business = args.businessId ? eventVenueBusiness(world, me, args.businessId) : null;
  ensure(
    !business || args.venue === 'hall',
    'event.venue',
    'A hotel or event venue stands in for the Event Hall: pick the hall.',
  );
  spendHours(me, k.hoursHost, `Hosting a ${k.label.toLowerCase()}`);
  const cost = eventCost(m, args.kind, args.venue);
  if (business) {
    // The venue fee goes to the local business; the budget still goes to suppliers.
    transfer(
      world,
      me.accounts.local,
      business.account,
      cost,
      `Event venue: ${business.name}`,
      m.month,
    );
    transfer(
      world,
      me.accounts.local,
      m.ext.suppliers,
      args.budget,
      `Event: ${args.title.trim()}`,
      m.month,
    );
  } else
    transfer(
      world,
      me.accounts.local,
      m.ext.suppliers,
      cost + args.budget,
      `Event: ${args.title.trim()}`,
      m.month,
    );
  const e: CityEvent = {
    id: newId(world, 'ev'),
    market: m.id,
    hostId: me.id,
    kind: args.kind,
    title: args.title.trim(),
    venue: args.venue,
    month,
    capacity: eventCapacity(args.kind, args.venue),
    budget: args.budget,
    ticket,
    ...(segmentKey ? { segmentKey } : {}),
    ...(business ? { businessId: business.id } : {}),
    attendees: [],
    status: 'upcoming',
    createdMonth: m.month,
  };
  eventsOf(world)[e.id] = e;
  return {
    eventId: e.id,
    cost: cost + args.budget,
    message: `${e.title} is on. ${VENUE_DATA[e.venue].label}, ${e.capacity} seats.`,
  };
}

export function rsvpEvent(world: World, me: Player, eventId: Id, going: boolean) {
  const e = getEvent(world, eventId);
  const m = getMarket(world, e.market);
  ensure(e.status === 'upcoming', 'event.closed', 'This event is no longer taking RSVPs.');
  ensure(e.hostId !== me.id, 'event.host', 'You are hosting this one.');
  ensure(locationOf(me) === e.market, 'event.market', 'Events are for people in this city.');
  const isGoing = e.attendees.includes(me.id);
  const host = world.players[e.hostId];
  if (going) {
    ensure(!isGoing, 'event.going', 'You are already going.');
    ensure(e.attendees.length + 1 < e.capacity, 'event.full', 'The event is full.');
    if (e.ticket > 0 && host)
      payExact(
        world,
        me.accounts.local,
        host.accounts.local,
        e.ticket,
        `Ticket: ${e.title}`,
        m.month,
      );
    e.attendees.push(me.id);
    notify(world, e.hostId, {
      month: m.month,
      kind: 'meeting',
      text: `${me.name} is coming to ${e.title}.`,
    });
    return { going: true, message: `You’re going to ${e.title}.` };
  }
  ensure(isGoing, 'event.notGoing', 'You weren’t going.');
  if (e.ticket > 0 && host)
    pay(
      world,
      host.accounts.local,
      me.accounts.local,
      e.ticket,
      `Ticket refund: ${e.title}`,
      m.month,
    );
  e.attendees = e.attendees.filter((id) => id !== me.id);
  return {
    going: false,
    message: e.ticket > 0 ? 'RSVP cancelled; your ticket was refunded.' : 'RSVP cancelled.',
  };
}

export function cancelEvent(world: World, me: Player, eventId: Id) {
  const e = getEvent(world, eventId);
  const m = getMarket(world, e.market);
  ensure(e.hostId === me.id, 'event.forbidden', 'Only the host can cancel.');
  ensure(e.status === 'upcoming', 'event.closed', 'This event is no longer upcoming.');
  for (const id of e.attendees) {
    const a = world.players[id];
    if (!a) continue;
    if (e.ticket > 0)
      transfer(
        world,
        me.accounts.local,
        a.accounts.local,
        e.ticket,
        `Ticket refund: ${e.title}`,
        m.month,
      );
    notify(world, id, {
      month: m.month,
      kind: 'meeting',
      text: `${e.title} was cancelled.${e.ticket > 0 ? ' Your ticket was refunded.' : ''}`,
    });
  }
  e.status = 'cancelled';
  return { message: `${e.title} is cancelled. Tickets refunded; the venue keeps its fee.` };
}

// ---------------------------------------------------------------- Holding

/** Share of seats AI guests fill (0.05–1), before noise. */
export function expectedFill(world: World, e: CityEvent): number {
  const m = getMarket(world, e.market);
  const k = EVENT_KIND_DATA[e.kind];
  const host = world.players[e.hostId];
  const ref = Math.max(1, scale(col(m), k.costCol));
  const budget = 0.75 + 0.5 * Math.min(1, e.budget / (ref * 1.5));
  const stars = starMultiplier(host?.stars.value ?? 1);
  const investorEvent = e.kind === 'investor-breakfast' || e.kind === 'demo-day';
  const depth = investorEvent ? 0.5 + 0.5 * Math.min(1, Math.sqrt(CAPITAL[m.id].vcDepth)) : 1;
  // A broadcast (Wave 5) reaches people who'd never have heard: up to +50% turnout.
  const reach = 1 + 0.5 * Math.min(1, (e.broadcast ?? 0) / (ref * 1.5));
  return clamp(k.baseTurnout * budget * stars * depth * reach, 0.05, 1);
}

type Guest = { kind: ContactKind; refId: Id; name: string };

export function guestPool(world: World, e: CityEvent, m: MarketState): Guest[] {
  const funds = (): Guest[] =>
    Object.values(world.funds)
      .filter((f) => f.ai && f.market === m.id)
      .map((f) => ({
        kind: 'fund',
        refId: f.id,
        // AI angels (Wave 3) come as themselves; their fund carries their name already.
        name: f.angelId ? `${f.partner}, angel investor` : `${f.partner}, ${f.name}`,
      }));
  const founders = (): Guest[] =>
    Object.values(world.companies)
      .filter((c) => c.ai && c.market === m.id && c.status === 'active')
      .flatMap((c) =>
        c.founderIds
          .map((id) => world.players[id])
          .filter((p): p is Player => !!p && p.ai)
          .map((p) => ({ kind: 'founder' as const, refId: p.id, name: `${p.name}, ${c.name}` })),
      );
  const talent = (): Guest[] =>
    m.talent.map((t) => ({ kind: 'talent', refId: t.id, name: t.name }));
  switch (e.kind) {
    case 'founder-meetup':
      return [...founders(), ...talent().slice(0, 6)];
    case 'investor-breakfast':
      return [...funds(), ...founders().slice(0, 4)];
    case 'demo-day':
      return [...funds(), ...founders()];
    case 'talent-night':
      return talent();
    case 'customer-mixer':
      return [];
  }
}

/** Hold every event due by this settlement. Called from settleMarket after customers, before companies. */
export function holdDueEvents(world: World, marketId: MarketId, month: number) {
  for (const e of Object.values(world.events ?? {})) {
    // `month` is the market's new month; an event held "in month M" settles when M closes.
    if (e.market !== marketId || e.status !== 'upcoming' || e.month >= month) continue;
    holdEvent(world, e, month);
  }
}

function holdEvent(world: World, e: CityEvent, month: number) {
  const m = getMarket(world, e.market);
  const rng = deriveRng(world.seed, 'event', e.id);
  const host = world.players[e.hostId];
  const humans = [e.hostId, ...e.attendees]
    .map((id) => world.players[id])
    .filter((p): p is Player => !!p && !p.ai);
  const fill = clamp(expectedFill(world, e) + rng.normal(0, 0.08), 0.02, 1);
  const seats = Math.max(0, e.capacity - humans.length);
  const aiGuests = Math.round(seats * fill);
  const pool = rng.shuffle(guestPool(world, e, m));
  const outcome = {
    aiGuests,
    humans: humans.length,
    fill: Math.round(fill * 100) / 100,
    summary: '',
    contacts: {} as Record<Id, number>,
    hostStars: 0,
  };
  const seg = e.segmentKey ? m.segments[e.segmentKey] : undefined;
  let leadsTotal = 0;
  let referred = 0;

  for (const p of humans) {
    const isHost = p.id === e.hostId;
    let made = 0;
    const warmth = () =>
      clamp(0.25 + 0.35 * fill + rng.range(0, 0.25) + (isHost ? 0.1 : 0), 0.1, 1);
    // AI guests: a few useful conversations, more for the host and the well connected.
    const n = Math.min(
      pool.length,
      Math.round((aiGuests / 6) * (0.7 + Math.min(100, p.network) / 100)) + (isHost ? 1 : 0),
      isHost ? 7 : 5,
    );
    const met = rng.shuffle(pool).slice(0, n);
    for (const g of met) {
      addContact(p, { ...g, warmth: warmth() }, month);
      made++;
    }
    // Customer mixer: one warm line into the segment, plus leads for your companies in its sector.
    if (seg && aiGuests > 0) {
      addContact(p, { kind: 'customer', refId: seg.key, name: seg.name, warmth: warmth() }, month);
      made++;
      for (const c of activeCompanies(world, p))
        if (c.industry === seg.industry)
          leadsTotal += customerLeads(c, seg.key, aiGuests, rng, month, world);
    }
    // Referred hires: talent nights always, founder meetups sometimes.
    const refer =
      aiGuests > 0 &&
      (e.kind === 'talent-night' || (e.kind === 'founder-meetup' && rng.chance(0.5)));
    const company = activeCompanies(world, p)[0];
    if (refer && company) {
      const count = e.kind === 'talent-night' && fill > 0.6 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const cand = makeCandidate(world, e.market, rng, month);
        cand.referredFor = company.id;
        cand.expiresMonth = month + 2;
        cand.competingOffers = 0;
        cand.riskAppetite = Math.max(cand.riskAppetite, 0.6);
        m.talent.push(cand);
        addContact(p, { kind: 'talent', refId: cand.id, name: cand.name, warmth: warmth() }, month);
        made++;
        referred++;
      }
    }
    // Each other: every human there becomes a contact, and trust grows.
    for (const q of humans) {
      if (q.id === p.id) continue;
      addContact(p, { kind: 'player', refId: q.id, name: q.name, warmth: 0.4 + 0.2 * fill }, month);
      adjustTrust(p, q.id, q.id === e.hostId || isHost ? 0.08 : 0.05);
      made++;
    }
    p.network = Math.min(100, p.network + Math.round(made * 1.5));
    outcome.contacts[p.id] = made;
  }

  // Host reputation: a full room is noticed, an empty one too.
  if (host && fill >= 0.7)
    outcome.hostStars = applyStarEvent(host.stars, e.kind === 'demo-day' ? 0.15 : 0.08);
  else if (host && fill < 0.25) outcome.hostStars = applyStarEvent(host.stars, -0.05);

  const pct = Math.round(fill * 100);
  const extra =
    e.kind === 'customer-mixer' && seg
      ? ` ${seg.name} came; ${leadsTotal} trial${leadsTotal === 1 ? '' : 's'} for attendees.`
      : referred > 0
        ? ` ${referred} candidate${referred === 1 ? '' : 's'} referred.`
        : e.kind === 'investor-breakfast' || e.kind === 'demo-day'
          ? ' Fund partners swapped numbers.'
          : '';
  outcome.summary = `${aiGuests + humans.length} came (${pct}% full).${extra}`;
  // Who came, by name (Wave 5): the first guests of the shuffled pool.
  e.outcome = {
    ...outcome,
    aiNames: pool.slice(0, Math.min(aiGuests, 40)).map((g) => ({ name: g.name, kind: g.kind })),
  };
  e.status = 'held';

  for (const p of humans) {
    const isHost = p.id === e.hostId;
    const stars =
      isHost && outcome.hostStars > 0
        ? ' Your stars rose.'
        : isHost && outcome.hostStars < 0
          ? ' The empty room was noticed.'
          : '';
    notify(world, p.id, {
      month,
      kind: 'meeting',
      text: `${e.title}: ${outcome.summary} You made ${outcome.contacts[p.id] ?? 0} contacts.${stars}`,
    });
  }
}

function activeCompanies(world: World, p: Player): Company[] {
  return p.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.status === 'active' && c.founderIds.includes(p.id));
}

/** Awareness and a small number of trials in a segment; returns the trials. */
function customerLeads(
  c: Company,
  segKey: string,
  aiGuests: number,
  rng: Rng,
  month: number,
  world: World,
): number {
  const m = getMarket(world, c.market);
  const seg = m.segments[segKey]!;
  const pos = (c.segments[segKey] ??= emptyPosition());
  const reach = aiGuests * (seg.kind === 'b2b' ? 1 : 8);
  pos.awareness = clamp01(pos.awareness + Math.max(0.01, reach / Math.max(1, seg.buyers)));
  const trials = Math.min(8, Math.max(1, Math.round(aiGuests * 0.12 * rng.range(0.6, 1.3))));
  if (seg.kind === 'b2b') {
    pos.pipeline.push({ due: month + seg.salesCycle[0], count: trials });
  } else {
    const room = Math.max(
      0,
      seg.buyers -
        seg.incumbentCustomers -
        Object.values(world.companies).reduce((a, x) => a + (x.segments[segKey]?.paying ?? 0), 0),
    );
    const won = Math.min(room, Math.round(trials * 0.5));
    pos.paying += won;
    pos.won += won;
  }
  return trials;
}

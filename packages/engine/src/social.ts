/**
 * Wave 8 (section C): friends. Sending money to another player, home visits,
 * hangouts at a venue and the city's tech events.
 *
 * Money: `money.send` moves the amount from the sender's personal account to
 * the receiver's (converted at the official rate through the FX desks when
 * the currencies differ) and a 1% fee (at least 0.0001 of the sender's monthly
 * cost of living) to the receiver's market bank sink (`ext.bank`). The sender
 * may send at most 2 cost-of-living units a real (UTC) day. Tickets to tech
 * events go to the venue's till (or the city's suppliers at the Hub or the
 * Event Hall). Everything moves through the ledger, so money is conserved.
 *
 * Tech events are an AI calendar: 3–6 a month per city, drawn from
 * `deriveRng(seed, 'tech-events', market, month)`; venues and speakers come
 * from what existed before the month began, so the calendar doesn't shift
 * during the month.
 */
import { checkChatMessage } from './chat.js';
import { ensure, fail } from './errors.js';
import { addContact } from './events.js';
import { adjustTrust, col, getMarket, getPlayer, locationOf, notify } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, pay, payExact, valueIn } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { bumpNeed, moodOf, needsOf } from './needs.js';
import { NPC_POOL, npcPerson } from './people.js';
import { getBusiness, isOpen, specOf } from './economy.js';
import { deriveRng } from './rng.js';
import { homeView } from './shop.js';
import type { MarketId } from './data/markets.js';
import type { Hangout, Id, LocalBusiness, MarketState, Player, Visit, World } from './types.js';

// ---------------------------------------------------------------- Tuning

export const SEND_FEE_RATE = 0.01;
export const SEND_FEE_MIN_COL = 0.0001;
export const SEND_DAILY_LIMIT_COL = 2;
export const SEND_NOTE_MAX = 80;
const DAY_MS = 86_400_000;

export const VISIT_SOCIAL = 30;
export const VISIT_TRUST = 0.05;
export const VISIT_WARMTH = 0.15;
/** Invitations a host can send in a month. */
export const VISIT_INVITES_PER_MONTH = 6;

export const HANGOUT_SOCIAL = 20;
export const HANGOUT_FUN = 15;
export const HANGOUT_WARMTH = 0.12;
export const HANGOUT_TRUST = 0.03;
export const HANGOUT_MAX_INVITEES = 8;
export const HANGOUTS_PER_MONTH = 3;

export const TECH_EVENT_KINDS = [
  'meetup',
  'hackathon',
  'demo-day',
  'conference',
  'workshop',
] as const;
export type TechEventKind = (typeof TECH_EVENT_KINDS)[number];

interface TechKindSpec {
  label: string;
  capacity: [number, number];
  /** Chance the event is free. */
  free: number;
  /** Ticket range in cost-of-living units when it isn't. */
  ticketCol: [number, number];
  speakers: [number, number];
  network: number;
  fun: number;
  topics: readonly string[];
}

export const TECH_EVENT_KIND_DATA: Record<TechEventKind, TechKindSpec> = {
  meetup: {
    label: 'Meetup',
    capacity: [30, 80],
    free: 0.8,
    ticketCol: [0.01, 0.03],
    speakers: [1, 2],
    network: 2,
    fun: 8,
    topics: [
      'Fintech founders meetup',
      'Product people night',
      'Women in tech meetup',
      'Startup lawyers Q&A',
      'Climate tech meetup',
    ],
  },
  hackathon: {
    label: 'Hackathon',
    capacity: [40, 120],
    free: 0.6,
    ticketCol: [0.02, 0.05],
    speakers: [1, 1],
    network: 3,
    fun: 20,
    topics: ['48-hour AI hackathon', 'Payments hackathon', 'Civic tech hackathon', 'Agritech jam'],
  },
  'demo-day': {
    label: 'Demo day',
    capacity: [80, 250],
    free: 0.5,
    ticketCol: [0.03, 0.08],
    speakers: [2, 3],
    network: 3,
    fun: 10,
    topics: ['Accelerator demo day', 'Seed-stage demo day', 'University spinout showcase'],
  },
  conference: {
    label: 'Conference',
    capacity: [150, 600],
    free: 0.2,
    ticketCol: [0.08, 0.2],
    speakers: [3, 4],
    network: 4,
    fun: 10,
    topics: [
      'Tech summit',
      'Future of money conference',
      'Founders and funders forum',
      'Digital economy week',
    ],
  },
  workshop: {
    label: 'Workshop',
    capacity: [15, 40],
    free: 0.5,
    ticketCol: [0.02, 0.05],
    speakers: [1, 1],
    network: 1,
    fun: 5,
    topics: [
      'Pitch deck clinic',
      'Unit economics workshop',
      'Hiring your first engineers',
      'Growth marketing bootcamp',
    ],
  },
};

/** What speakers talk about (fixed strings, so the client can translate them). */
export const TALK_TITLES = [
  'What I wish I knew before raising',
  'Selling to your first hundred customers',
  'Building for the next billion users',
  'How we cut our burn in half',
  'Payments that just work',
  'Hiring when you can’t pay big salaries',
  'What investors look for at pre-seed',
  'From side project to company',
  'Pricing is a product decision',
  'Shipping fast without breaking trust',
  'Why we said no to a term sheet',
  'Distribution beats product',
] as const;

export const TECH_EVENT_SOCIAL = 15;
export const TECH_EVENT_SPEAKER_WARMTH = 0.15;
export const TECH_EVENT_CROWD_WARMTH = 0.12;
/** Demo day: the chance you get a slot to pitch on stage (more with stars). */
export const PITCH_SLOT_BASE = 0.45;
export const PITCH_INTEREST_WARMTH = 0.35;

/** Where tech events are held, besides the Hub and the Event Hall. */
const TECH_VENUE_KINDS = new Set(['hotel', 'event-venue', 'co-working', 'bootcamp', 'school']);

// ---------------------------------------------------------------- Helpers

const human = (world: World, id: Id, what: string): Player => {
  const p = world.players[id];
  ensure(p && !p.ai, 'social.player', `${what} must be another player.`);
  return p;
};

/** Notes go to another player: the chat filters apply (no links, emails, phone numbers). */
export function cleanNote(note: string | undefined): string {
  const raw = (note ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const check = checkChatMessage(raw.slice(0, SEND_NOTE_MAX));
  if (!check.ok) return fail('money.note', check.reason);
  return check.text;
}

/** Warm two players towards each other (contacts both ways, a little trust). */
function warmPair(a: Player, b: Player, month: number, warmth: number, trust: number) {
  addContact(a, { kind: 'player', refId: b.id, name: b.name, warmth }, month);
  addContact(b, { kind: 'player', refId: a.id, name: a.name, warmth }, month);
  adjustTrust(a, b.id, trust);
  adjustTrust(b, a.id, trust);
}

// ---------------------------------------------------------------- money.send

/** The sender's limits today, in the sender's account currency. */
export function sendLimits(world: World, me: Player, now: number) {
  const m = getMarket(world, me.market);
  const cur = account(world, me.accounts.local).currency;
  const inCur = (v: number) => valueIn(world, v, m.data.currency, cur);
  const day = Math.floor(now / DAY_MS);
  const used = me.moneySent?.day === day ? me.moneySent.total : 0;
  const limit = inCur(scale(col(m), SEND_DAILY_LIMIT_COL));
  return {
    currency: cur,
    day,
    used,
    limit,
    left: Math.max(0, limit - used),
    minFee: inCur(scale(col(m), SEND_FEE_MIN_COL)),
    feeRate: SEND_FEE_RATE,
  };
}

export const sendFee = (amount: number, minFee: number) =>
  Math.max(Math.round(amount * SEND_FEE_RATE), minFee);

export function sendMoney(
  world: World,
  me: Player,
  toPlayerId: Id,
  amount: number,
  note: string | undefined,
  now: number,
) {
  ensure(toPlayerId !== me.id, 'money.self', 'You can’t send money to yourself.');
  const to = human(world, toPlayerId, 'The person you pay');
  ensure(Number.isInteger(amount) && amount > 0, 'money.amount', 'Enter an amount above zero.');
  const lim = sendLimits(world, me, now);
  const fmt = (v: number, c = lim.currency) => formatMoney(v, c);
  ensure(
    amount <= lim.left,
    'money.limit',
    lim.left > 0
      ? `You can send up to ${fmt(lim.left)} more today.`
      : 'You’ve reached today’s sending limit.',
  );
  const fee = sendFee(amount, lim.minFee);
  const mine = account(world, me.accounts.local);
  ensure(
    mine.balance >= amount + fee,
    'money.funds',
    `That needs ${fmt(amount + fee)} with the fee; you don’t have it.`,
  );
  const m = getMarket(world, me.market);
  const toM = getMarket(world, to.market);
  const theirs = account(world, to.accounts.local);
  const clean = cleanNote(note);
  const received = pay(
    world,
    me.accounts.local,
    to.accounts.local,
    amount,
    `Transfer: ${me.name} to ${to.name}`,
    m.month,
  );
  pay(world, me.accounts.local, toM.ext.bank, fee, 'Transfer fee', m.month);
  me.moneySent = { day: lim.day, total: lim.used + amount };
  warmPair(me, to, m.month, 0.05, 0.02);
  notify(world, me.id, {
    month: m.month,
    kind: 'system',
    text: `You sent ${fmt(amount)} to ${to.name} (fee ${fmt(fee)}).`,
    ref: { kind: 'player', id: to.id },
  });
  notify(world, to.id, {
    month: toM.month,
    kind: 'system',
    text: `${me.name} sent you ${fmt(received, theirs.currency)}${clean ? `: “${clean}”` : '.'}`,
    ref: { kind: 'player', id: me.id },
  });
  return {
    amount,
    fee,
    received,
    currency: lim.currency,
    receivedCurrency: theirs.currency,
    leftToday: lim.left - amount,
    note: clean,
    message: `Sent ${fmt(amount)} to ${to.name}. Fee ${fmt(fee)}.`,
  };
}

// ---------------------------------------------------------------- Home visits

const visitsOf = (world: World) => (world.visits ??= {});

export function inviteVisit(world: World, me: Player, toPlayerId: Id) {
  ensure(toPlayerId !== me.id, 'visit.self', 'Invite someone else.');
  const guest = human(world, toPlayerId, 'Your guest');
  const m = getMarket(world, me.market);
  const mine = Object.values(world.visits ?? {}).filter(
    (v) => v.hostId === me.id && v.month === m.month,
  );
  ensure(mine.length < VISIT_INVITES_PER_MONTH, 'visit.cap', 'Enough invitations for this month.');
  ensure(
    !mine.some((v) => v.guestId === guest.id && v.status !== 'declined'),
    'visit.twice',
    `You’ve already invited ${guest.name} this month.`,
  );
  const id = newId(world, 'visit');
  visitsOf(world)[id] = {
    id,
    hostId: me.id,
    guestId: guest.id,
    market: me.market,
    month: m.month,
    status: 'pending',
  };
  notify(world, guest.id, {
    month: getMarket(world, guest.market).month,
    kind: 'meeting',
    text: `${me.name} invited you over to their place in ${m.data.name}.`,
    ref: { kind: 'visit', id },
  });
  return { inviteId: id, message: `Invitation sent to ${guest.name}.` };
}

function myInvite(world: World, me: Player, inviteId: Id): Visit {
  const v = world.visits?.[inviteId];
  ensure(v && v.guestId === me.id, 'visit.missing', 'We can’t find that invitation.');
  ensure(v.status === 'pending', 'visit.done', 'You already answered that invitation.');
  return v;
}

export function acceptVisit(world: World, me: Player, inviteId: Id) {
  const v = myInvite(world, me, inviteId);
  const m = getMarket(world, v.market);
  ensure(m.month === v.month, 'visit.expired', 'That invitation has expired.');
  ensure(
    locationOf(me) === v.market,
    'visit.where',
    `Their place is in ${m.data.name}. Fly there first.`,
  );
  const host = getPlayer(world, v.hostId);
  v.status = 'accepted';
  const social = bumpNeed(me, 'social', VISIT_SOCIAL);
  bumpNeed(host, 'social', VISIT_SOCIAL);
  warmPair(me, host, m.month, VISIT_WARMTH, VISIT_TRUST);
  notify(world, host.id, {
    month: m.month,
    kind: 'meeting',
    text: `${me.name} is coming over.`,
    ref: { kind: 'visit', id: v.id },
  });
  return {
    visitId: v.id,
    host: { id: host.id, name: host.name },
    effects: { social },
    needs: needsOf(me),
    mood: moodOf(me),
    message: `You’re at ${host.name}’s place.`,
  };
}

export function declineVisit(world: World, me: Player, inviteId: Id) {
  const v = myInvite(world, me, inviteId);
  v.status = 'declined';
  notify(world, v.hostId, {
    month: getMarket(world, v.market).month,
    kind: 'meeting',
    text: `${me.name} can’t come over this time.`,
    ref: { kind: 'visit', id: v.id },
  });
  return { visitId: v.id, message: 'Maybe next time.' };
}

/** `view.visiting`: the friend's home you're in right now (read-only), or null. */
export function visitingView(world: World, p: Player) {
  const here = locationOf(p);
  const v = Object.values(world.visits ?? {})
    .filter(
      (x) =>
        x.guestId === p.id &&
        x.status === 'accepted' &&
        x.market === here &&
        world.markets[x.market]?.month === x.month,
    )
    .sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  const host = v ? world.players[v.hostId] : undefined;
  if (!v || !host) return null;
  return {
    visitId: v.id,
    market: v.market,
    host: {
      id: host.id,
      name: host.name,
      backgroundId: host.backgroundId,
      gender: host.gender ?? null,
    },
    lifestyleTier: host.lifestyleTier,
    home: homeView(host),
    readOnly: true as const,
  };
}

/** `view.visits`: invitations to you, the ones you sent, and who's at yours (this month). */
export function visitsView(world: World, p: Player) {
  const live = (v: Visit) => world.markets[v.market]?.month === v.month;
  const name = (id: Id) => world.players[id]?.name ?? '';
  const row = (v: Visit) => ({
    id: v.id,
    hostId: v.hostId,
    hostName: name(v.hostId),
    guestId: v.guestId,
    guestName: name(v.guestId),
    market: v.market,
    city: world.markets[v.market]?.data.name ?? '',
    status: v.status,
  });
  const all = Object.values(world.visits ?? {}).filter(live);
  return {
    incoming: all.filter((v) => v.guestId === p.id).map(row),
    outgoing: all.filter((v) => v.hostId === p.id).map(row),
  };
}

// ---------------------------------------------------------------- Hangouts

const hangoutsOf = (world: World) => (world.hangouts ??= {});

/** A place you can hang out: an open business you can go into and spend in. */
function hangoutVenue(world: World, businessId: Id): LocalBusiness {
  const b = getBusiness(world, businessId);
  ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
  ensure(specOf(b).venue, 'hangout.venue', `${b.name} isn’t somewhere to hang out.`);
  return b;
}

function boost(p: Player) {
  return { social: bumpNeed(p, 'social', HANGOUT_SOCIAL), fun: bumpNeed(p, 'fun', HANGOUT_FUN) };
}

export function planHangout(
  world: World,
  me: Player,
  businessId: Id,
  inviteeIds: Id[],
  when: 'now' | 'tonight',
) {
  const b = hangoutVenue(world, businessId);
  ensure(b.market === locationOf(me), 'hangout.where', `${b.name} is in another city.`);
  const ids = [...new Set(inviteeIds)];
  ensure(ids.length > 0, 'hangout.nobody', 'Invite at least one friend.');
  ensure(ids.length <= HANGOUT_MAX_INVITEES, 'hangout.many', 'That’s a lot of people: 8 at most.');
  ensure(!ids.includes(me.id), 'hangout.self', 'Invite someone else.');
  const invitees = ids.map((id) => human(world, id, 'Everyone you invite'));
  const m = getMarket(world, b.market);
  const planned = Object.values(world.hangouts ?? {}).filter(
    (h) => h.hostId === me.id && h.month === m.month,
  ).length;
  ensure(planned < HANGOUTS_PER_MONTH, 'hangout.cap', 'Enough plans for this month.');
  const id = newId(world, 'hangout');
  hangoutsOf(world)[id] = {
    id,
    market: b.market,
    businessId: b.id,
    hostId: me.id,
    inviteeIds: invitees.map((p) => p.id),
    memberIds: [me.id],
    when,
    month: m.month,
    status: 'open',
  };
  const effects = boost(me);
  for (const q of invitees)
    notify(world, q.id, {
      month: getMarket(world, q.market).month,
      kind: 'meeting',
      text: `${me.name} wants to hang out at ${b.name} ${when === 'now' ? 'now' : 'tonight'}.`,
      ref: { kind: 'hangout', id },
    });
  return {
    hangoutId: id,
    effects,
    message: `Plans made: ${b.name}, ${when === 'now' ? 'now' : 'tonight'}.`,
  };
}

function liveHangout(world: World, hangoutId: Id): Hangout {
  const h = world.hangouts?.[hangoutId];
  ensure(h && h.status === 'open', 'hangout.missing', 'That hangout is off.');
  ensure(getMarket(world, h.market).month === h.month, 'hangout.over', 'That hangout is over.');
  return h;
}

export function joinHangout(world: World, me: Player, hangoutId: Id) {
  const h = liveHangout(world, hangoutId);
  ensure(
    h.inviteeIds.includes(me.id) || h.hostId === me.id,
    'hangout.invite',
    'You weren’t invited.',
  );
  ensure(!h.memberIds.includes(me.id), 'hangout.joined', 'You’re already in.');
  const b = hangoutVenue(world, h.businessId);
  ensure(
    locationOf(me) === h.market,
    'hangout.where',
    `${b.name} is in ${getMarket(world, h.market).data.name}.`,
  );
  const month = getMarket(world, h.market).month;
  for (const id of h.memberIds) {
    const q = world.players[id];
    if (q) warmPair(me, q, month, HANGOUT_WARMTH, HANGOUT_TRUST);
  }
  h.memberIds.push(me.id);
  const effects = boost(me);
  if (h.hostId !== me.id)
    notify(world, h.hostId, {
      month,
      kind: 'meeting',
      text: `${me.name} joined you at ${b.name}.`,
      ref: { kind: 'hangout', id: h.id },
    });
  return {
    hangoutId: h.id,
    businessId: b.id,
    effects,
    with: h.memberIds.filter((x) => x !== me.id).map((x) => world.players[x]?.name ?? ''),
    needs: needsOf(me),
    mood: moodOf(me),
    message: `You’re at ${b.name}.`,
  };
}

export function leaveHangout(world: World, me: Player, hangoutId: Id) {
  const h = world.hangouts?.[hangoutId];
  ensure(h && h.memberIds.includes(me.id), 'hangout.member', 'You’re not in that hangout.');
  h.memberIds = h.memberIds.filter((x) => x !== me.id);
  if (h.memberIds.length === 0) h.status = 'cancelled';
  return { hangoutId: h.id, message: 'You headed off.' };
}

/** `view.hangouts`: this month's hangouts you planned, were asked to or joined. */
export function hangoutsView(world: World, p: Player) {
  const name = (id: Id) => world.players[id]?.name ?? '';
  return Object.values(world.hangouts ?? {})
    .filter(
      (h) =>
        h.status === 'open' &&
        world.markets[h.market]?.month === h.month &&
        (h.hostId === p.id || h.inviteeIds.includes(p.id) || h.memberIds.includes(p.id)),
    )
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .map((h) => {
      const b = world.markets[h.market]?.businesses?.[h.businessId];
      return {
        id: h.id,
        market: h.market,
        city: world.markets[h.market]?.data.name ?? '',
        businessId: h.businessId,
        placeId: `biz:${h.businessId}`,
        businessName: b?.name ?? '',
        when: h.when,
        host: { id: h.hostId, name: name(h.hostId) },
        members: h.memberIds.map((id) => ({ id, name: name(id) })),
        invitees: h.inviteeIds.map((id) => ({
          id,
          name: name(id),
          joined: h.memberIds.includes(id),
        })),
        joined: h.memberIds.includes(p.id),
        mine: h.hostId === p.id,
      };
    });
}

// ---------------------------------------------------------------- Tech events

export interface TechSpeaker {
  /** Player id (AI founder or angel) or `fund:<id>` (a fund partner). */
  id: string;
  name: string;
  role: 'founder' | 'investor';
  /** Company or fund name. */
  org: string;
  talk: string;
  contact: { kind: 'founder' | 'fund'; refId: Id; name: string };
}

export interface TechEvent {
  id: string;
  market: MarketId;
  month: number;
  n: number;
  kind: TechEventKind;
  title: string;
  /** Day of the month it is on (1–28), for display. */
  day: number;
  venue: {
    kind: 'hub' | 'hall' | 'business';
    businessId: Id | null;
    name: string;
    /** The place on the web city map. */
    placeId: string;
  };
  speakers: TechSpeaker[];
  capacity: number;
  /** Local minor units; 0 = free. */
  ticket: number;
}

export const techEventId = (market: MarketId, month: number, n: number) =>
  `te:${market}:${month}:${n}`;

export function parseTechEventId(
  id: string,
): { market: MarketId; month: number; n: number } | null {
  const m = /^te:([a-z-]+):(\d+):(\d+)$/.exec(id);
  return m ? { market: m[1] as MarketId, month: Number(m[2]), n: Number(m[3]) } : null;
}

function speakerPool(world: World, m: MarketState): Omit<TechSpeaker, 'talk'>[] {
  const out: Omit<TechSpeaker, 'talk'>[] = [];
  const players = Object.values(world.players)
    .filter((p) => p.ai && p.market === m.id)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const p of players) {
    if (p.angel) {
      if (p.angel.retiredMonth !== undefined) continue;
      const f = world.funds[p.angel.fundId];
      if (f)
        out.push({
          id: p.id,
          name: p.name,
          role: 'investor',
          org: f.name,
          contact: { kind: 'fund', refId: f.id, name: `${p.name}, ${f.name}` },
        });
      continue;
    }
    const c = p.companyIds.map((id) => world.companies[id]).find((x) => x?.status === 'active');
    if (c)
      out.push({
        id: p.id,
        name: p.name,
        role: 'founder',
        org: c.name,
        contact: { kind: 'founder', refId: p.id, name: `${p.name}, ${c.name}` },
      });
  }
  const funds = Object.values(world.funds)
    .filter((f) => f.market === m.id && !f.angelId && !f.managerId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const f of funds)
    out.push({
      id: `fund:${f.id}`,
      name: f.partner,
      role: 'investor',
      org: f.name,
      contact: { kind: 'fund', refId: f.id, name: `${f.partner}, ${f.name}` },
    });
  return out;
}

/** The city's tech events in a month: 3–6, deterministic. */
export function techEventsFor(world: World, m: MarketState, month: number): TechEvent[] {
  const rng = deriveRng(world.seed, 'tech-events', m.id, month);
  const count = rng.int(3, 6);
  // Venues that were open before the month began, so the calendar holds all month.
  const venues: TechEvent['venue'][] = [
    { kind: 'hub', businessId: null, name: 'The Hub', placeId: 'hub' },
    { kind: 'hall', businessId: null, name: 'Event Hall', placeId: 'eventhall' },
    ...Object.values(m.businesses ?? {})
      .filter((b) => isOpen(b) && b.openedMonth < month && TECH_VENUE_KINDS.has(b.kind))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((b) => ({
        kind: 'business' as const,
        businessId: b.id,
        name: b.name,
        placeId: `biz:${b.id}`,
      })),
  ];
  const pool = speakerPool(world, m);
  const founders = pool.filter((s) => s.role === 'founder');
  const investors = pool.filter((s) => s.role === 'investor');
  const out: TechEvent[] = [];
  for (let n = 0; n < count; n++) {
    const r = deriveRng(world.seed, 'tech-events', m.id, month, n);
    const kind = r.pick(TECH_EVENT_KINDS);
    const spec = TECH_EVENT_KIND_DATA[kind];
    const venue = venues[Math.floor(r.next() * venues.length)]!;
    const title = spec.topics[Math.floor(r.next() * spec.topics.length)]!;
    const day = 1 + Math.floor(r.next() * 28);
    const capacity = r.int(spec.capacity[0], spec.capacity[1]);
    const ticket = r.chance(spec.free)
      ? 0
      : Math.max(1, scale(col(m), r.range(spec.ticketCol[0], spec.ticketCol[1])));
    const want = r.int(spec.speakers[0], spec.speakers[1]);
    // Demo days put investors on stage; the others mostly founders.
    const first = kind === 'demo-day' ? investors : founders;
    const second = kind === 'demo-day' ? founders : investors;
    const order = [...r.shuffle(first), ...r.shuffle(second)];
    const talks = r.shuffle(TALK_TITLES);
    const speakers = order.slice(0, want).map((s, i) => ({ ...s, talk: talks[i % talks.length]! }));
    out.push({
      id: techEventId(m.id, month, n),
      market: m.id,
      month,
      n,
      kind,
      title,
      day,
      venue,
      speakers,
      capacity,
      ticket,
    });
  }
  return out.sort((a, b) => a.day - b.day || a.n - b.n);
}

const attendedIds = (p: Player, month: number) =>
  p.techEvents?.month === month ? p.techEvents.ids : [];

function goingCount(world: World, e: TechEvent): number {
  return Object.values(world.players).filter((p) => !p.ai && attendedIds(p, e.month).includes(e.id))
    .length;
}

export function attendTechEvent(world: World, me: Player, eventId: string) {
  const ref = parseTechEventId(eventId);
  ensure(ref, 'techevent.missing', 'We can’t find that event.');
  const m = world.markets[ref.market];
  ensure(m, 'techevent.missing', 'We can’t find that event.');
  ensure(ref.month === m.month, 'techevent.when', 'That event isn’t on this month.');
  const e = techEventsFor(world, m, m.month).find((x) => x.id === eventId);
  ensure(e, 'techevent.missing', 'We can’t find that event.');
  ensure(locationOf(me) === e.market, 'techevent.where', `That’s in ${m.data.name}.`);
  ensure(!attendedIds(me, e.month).includes(e.id), 'techevent.twice', 'You’re already there.');
  ensure(goingCount(world, e) < e.capacity, 'techevent.full', 'It’s full.');
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  let paidTo: Id | null = null;
  if (e.ticket > 0) {
    const mine = account(world, me.accounts.local);
    ensure(
      mine.balance >= costIn(world, e.ticket, m.data.currency, mine.currency),
      'techevent.funds',
      `A ticket is ${fmt(e.ticket)}; you don’t have it.`,
    );
    const b = e.venue.businessId ? m.businesses?.[e.venue.businessId] : undefined;
    paidTo = b && isOpen(b) ? b.account : m.ext.suppliers;
    payExact(world, me.accounts.local, paidTo, e.ticket, `Ticket: ${e.title}`, m.month);
  }
  const spec = TECH_EVENT_KIND_DATA[e.kind];
  const network = Math.round(clamp(me.network + spec.network, 0, 100) - me.network);
  me.network += network;
  const social = bumpNeed(me, 'social', TECH_EVENT_SOCIAL);
  const fun = bumpNeed(me, 'fun', spec.fun);

  // Contacts: every speaker, and one or two people from the crowd.
  const contacts: { name: string; kind: string; refId: Id }[] = [];
  for (const s of e.speakers) {
    addContact(me, { ...s.contact, warmth: TECH_EVENT_SPEAKER_WARMTH }, m.month);
    contacts.push({ name: s.name, kind: s.contact.kind, refId: s.contact.refId });
  }
  const r = deriveRng(world.seed, 'tech-events', 'crowd', e.id, me.id);
  const crowd = r.int(1, 2);
  for (let i = 0; i < crowd; i++) {
    const p = npcPerson(e.market, r.int(0, NPC_POOL - 1));
    addContact(
      me,
      { kind: 'local', refId: p.id, name: `${p.name}, ${p.role}`, warmth: TECH_EVENT_CROWD_WARMTH },
      m.month,
    );
    contacts.push({ name: p.name, kind: 'local', refId: p.id });
  }
  // Other players who came: you meet them too.
  for (const q of Object.values(world.players))
    if (q.id !== me.id && !q.ai && attendedIds(q, e.month).includes(e.id))
      warmPair(me, q, m.month, TECH_EVENT_CROWD_WARMTH, 0.02);

  // Demo day: a chance to pitch on stage, and an investor who liked it.
  let pitch: {
    onStage: boolean;
    interest: { fundId: Id; name: string; fund: string } | null;
  } | null = null;
  if (e.kind === 'demo-day') {
    const company = me.companyIds
      .map((id) => world.companies[id])
      .find((c) => c && c.status === 'active');
    if (company) {
      const pr = deriveRng(world.seed, 'tech-events', 'pitch', e.id, me.id);
      const onStage = pr.chance(clamp(PITCH_SLOT_BASE + me.stars.value * 0.06, 0, 0.85));
      let interest: { fundId: Id; name: string; fund: string } | null = null;
      if (onStage) {
        const funds = Object.values(world.funds)
          .filter((f) => f.market === e.market && !f.managerId)
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        const f = funds.length ? funds[Math.floor(pr.next() * funds.length)]! : undefined;
        if (f) {
          const angel = f.angelId ? world.players[f.angelId] : undefined;
          const who = angel?.name ?? f.partner;
          addContact(
            me,
            { kind: 'fund', refId: f.id, name: `${who}, ${f.name}`, warmth: PITCH_INTEREST_WARMTH },
            m.month,
          );
          interest = { fundId: f.id, name: who, fund: f.name };
          notify(world, me.id, {
            month: m.month,
            kind: 'pitch',
            text: `${who} (${f.name}) liked your pitch at ${e.title}. A warm intro is waiting.`,
          });
        }
      }
      pitch = { onStage, interest };
    }
  }

  me.techEvents = { month: e.month, ids: [...attendedIds(me, e.month), e.id] };
  return {
    eventId: e.id,
    ticket: e.ticket,
    effects: { network, social, fun },
    contacts,
    pitch,
    needs: needsOf(me),
    mood: moodOf(me),
    message: `You went to ${e.title}${e.ticket ? ` (${fmt(e.ticket)})` : ''} and met ${contacts.length} people.`,
  };
}

/** `market.techEvents` / `here.techEvents`: this month's events ("on") and next month's ("soon"). */
export function techEventsView(world: World, p: Player, m: MarketState) {
  const row = (e: TechEvent, status: 'on' | 'soon') => ({
    id: e.id,
    kind: e.kind,
    label: TECH_EVENT_KIND_DATA[e.kind].label,
    title: e.title,
    day: e.day,
    month: e.month,
    status,
    venue: e.venue,
    speakers: e.speakers.map(({ contact: _c, ...s }) => s),
    capacity: e.capacity,
    going: goingCount(world, e),
    ticket: e.ticket,
    free: e.ticket === 0,
    attended: attendedIds(p, e.month).includes(e.id),
    /** Demo days give founders a chance to pitch on stage. */
    pitchChance: e.kind === 'demo-day',
  });
  return [
    ...techEventsFor(world, m, m.month).map((e) => row(e, 'on')),
    ...techEventsFor(world, m, m.month + 1).map((e) => row(e, 'soon')),
  ];
}

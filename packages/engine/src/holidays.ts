/**
 * Holiday with friends (player feedback: "People can invite their friends on
 * holidays to these places on travel trips").
 *
 * A player with a trip abroad (a booked ticket, or already there) invites
 * friends: each gets an invitation naming the city, the month and the hotel,
 * and whether the host pays their flight and hotel. Accepting books the same
 * destination and the same hotel tier from the guest's own city (each flies
 * from where they live). The host's money moves to the guest through the
 * ledger first (`payExact`, converted if the currencies differ), and the guest
 * pays the airline and the hotel as any booking does; a cancelled ticket
 * gives the host their money back. Invitations last the destination's month.
 *
 * Together abroad: a holiday's "things to do together" are hangouts at the
 * city's venues, marked with the holiday. Joining one gives everyone already
 * there and the one joining a small shared bonus: fun (so happiness) up,
 * stress down and trust between them up.
 *
 * Fly together: a guest who flies from the same city as the host, while the
 * host still holds their ticket, is booked on the host's flight (the same
 * airline, flight number and time, `flightTicket.flight`), in the seat next
 * to the host's (`Holiday.flight`). Guests from other cities fly on their own
 * and meet the others at arrivals.
 *
 * AI friends: the host's contacts who are AI people (an AI founder, a
 * business owner, one of the city's regulars) can be invited too. They answer
 * at once, from a derived RNG stream (`deriveRng(seed, 'holiday', holidayId,
 * friendId)`) weighed by how close you are (contact warmth and trust), who
 * pays and their means: yes, only if you pay, or can't make it this month,
 * each with a short chat reply. One who says yes is a travel companion: no
 * ticket, just a seat next to you (from the host's city), a room next door
 * and company on outings (the bonus is yours; trust with them rises). When
 * the host pays for them, the fare and hotel go from the host to the airline
 * and the hotel (the host's suppliers) through the ledger; an AI founder who
 * pays their own way pays from their own account.
 *
 * Room numbers and seats are a hash of the holiday id.
 */
import { appearanceSeed, defaultAppearance } from './appearance.js';
import { genderOfName } from './data/business-names.js';
import type { MarketId } from './data/markets.js';
import { getBusiness, isOpen, specOf } from './economy.js';
import { ensure, fail } from './errors.js';
import { addContact, contactWarmth } from './events.js';
import { adjustTrust, getMarket, getPlayer, locationOf, notify, usdToLocal } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, payExact, transfer } from './ledger.js';
import { lifeBarsOn } from './releases.js';
import { bumpStress } from './lifebars.js';
import { formatMoney } from './money.js';
import { bumpNeed, moodOf, needsOf } from './needs.js';
import { npcPerson, parseNpcId } from './people.js';
import { deriveRng, hashString } from './rng.js';
import { bookFlight, flightFare, flightFareUsd, hotelName, hotelPrice } from './travel.js';
import type {
  Contact,
  Gender,
  Holiday,
  HolidayGuest,
  Id,
  LocalBusiness,
  Player,
  World,
} from './types.js';

// ---------------------------------------------------------------- Tuning

const HOLIDAY_MAX_GUESTS = 6;
/** Things to do together a holiday can plan in its month. */
const HOLIDAY_ACTIVITIES = 6;
/** The shared bonus, for each person, when you do something together. */
const HOLIDAY_FUN = 10;
const HOLIDAY_STRESS = -8;
export const HOLIDAY_TRUST = 0.05;
const HOLIDAY_WARMTH = 0.15;
const HANGOUT_SOCIAL = 20;
/** What a holiday lists to do together: bars and hotels first, then food, then wellness. */
const OUTING_RANK: Record<string, number> = { hospitality: 0, food: 1, health: 2 };
const HANGOUT_FUN = 15;

// ---------------------------------------------------------------- Helpers

const holidaysOf = (world: World) => (world.holidays ??= {});

const live = (world: World, h: Holiday) => world.markets[h.market]?.month === h.month;

/** Everyone on the holiday who said yes: the host and the accepted guests (AI friends too). */
const membersOf = (h: Holiday): Id[] => [
  h.hostId,
  ...h.guests.filter((g) => g.status === 'accepted').map((g) => g.id),
];

/** The AI friends who said yes: travel companions. */
const aiCompanions = (h: Holiday) =>
  h.guests.filter(
    (g): g is HolidayGuest & { ai: NonNullable<HolidayGuest['ai']> } =>
      !!g.ai && g.status === 'accepted',
  );

const cityName = (world: World, m: MarketId) => getMarket(world, m).data.name;

/** A name on the holiday: a player's, or an AI friend's. */
const nameOn = (world: World, h: Holiday, id: Id) =>
  world.players[id]?.name ?? h.guests.find((g) => g.id === id)?.ai?.name ?? '';

const firstName = (name: string) => name.split(' ')[0] ?? name;

// ---------------------------------------------------------------- Flying together

/** The seat for the i-th person on the holiday's flight: side by side across a row, then the next row. */
const holidaySeat = (row: number, i: number) => `${row + Math.floor(i / 6)}${'ABCDEF'[i % 6]}`;

/**
 * Put someone flying from `from` on the host's flight, if the host still
 * holds a ticket to the holiday from there. Returns whether they're on it.
 */
function joinFlight(h: Holiday, host: Player, id: Id, from: MarketId): boolean {
  const t = host.flightTicket;
  if (!t || t.to !== h.market || t.from !== from) return false;
  if (!h.flight || h.flight.from !== t.from)
    h.flight = { from: t.from, row: 10 + (hashString(`${h.id}:row`) % 12), ids: [host.id] };
  if (!h.flight.ids.includes(id)) h.flight.ids.push(id);
  return true;
}

/** Who is (still) on the host's flight, in seat order: ticket holders on it, and AI friends. */
function onFlight(world: World, h: Holiday): Id[] {
  const f = h.flight;
  if (!f) return [];
  return f.ids.filter((id) => {
    const g = h.guests.find((x) => x.id === id);
    if (g?.ai) return g.status === 'accepted';
    if (id !== h.hostId && g?.status !== 'accepted') return false;
    const q = world.players[id];
    if (!q) return false;
    const t = q.flightTicket;
    if (t)
      return (
        t.to === h.market && t.from === f.from && (id === h.hostId || t.party?.holidayId === h.id)
      );
    // Already flown: they landed together.
    return locationOf(q) === h.market;
  });
}

// ---------------------------------------------------------------- AI friends

interface AiFriend {
  id: Id;
  name: string;
  kind: 'founder' | 'local';
  market: MarketId;
  gender: Gender;
  contact: Contact;
  /** An AI founder: a player with an account. */
  player?: Player;
  business?: LocalBusiness;
}

/** One of your contacts who is an AI person (an AI founder, a business owner, a regular), or null. */
function aiFriendOf(world: World, me: Player, id: Id): AiFriend | null {
  const contacts = me.contacts ?? [];
  const q = world.players[id];
  if (q?.ai) {
    const contact = contacts.find((c) => c.kind === 'founder' && c.refId === id);
    if (!contact) return null;
    return {
      id,
      name: q.name,
      kind: 'founder',
      market: q.market,
      gender: q.gender ?? genderOfName(q.name),
      contact,
      player: q,
    };
  }
  const contact = contacts.find((c) => c.kind === 'local' && c.refId === id);
  if (!contact) return null;
  const name = contact.name.split(',')[0]!.trim() || contact.name;
  const npc = parseNpcId(id);
  if (npc)
    return {
      id,
      name,
      kind: 'local',
      market: npc.market,
      gender: npcPerson(npc.market, npc.n).gender,
      contact,
    };
  if (id.startsWith('biz:')) {
    let b: LocalBusiness;
    try {
      b = getBusiness(world, id.slice('biz:'.length));
    } catch {
      return null;
    }
    return {
      id,
      name,
      kind: 'local',
      market: b.market,
      gender: genderOfName(b.owner.name),
      contact,
      business: b,
    };
  }
  return null;
}

export type AiAnswer = 'yes' | 'pay' | 'busy';

/** What AI friends say (short; translated on the client as they are). */
const AI_REPLIES: Record<AiAnswer, readonly string[]> = {
  yes: [
    'I’m in! Can’t wait. Save me the window seat.',
    'Yes! Count me in. This is going to be fun.',
    'Love it. I’ll pack tonight. See you there!',
  ],
  pay: [
    'I’d love to, but money’s tight this month. If you can cover it, I’m in.',
    'Only if you’re paying, honestly. It’s not cheap!',
  ],
  busy: [
    'I can’t make it this month, sorry. Next time!',
    'Ah, this month is packed for me. Have fun, send photos!',
  ],
};

/** An AI friend's trip in the host's currency: the fare from their city and the hotel. */
function aiTripCost(world: World, host: Player, f: AiFriend, h: Holiday) {
  if (f.market === h.market) return 0;
  const home = getMarket(world, host.market);
  const fare = usdToLocal(world, home, flightFareUsd(f.market, h.market));
  return fare + (h.tier ? hotelPrice(world, host, h.market, h.tier) : 0);
}

/** How well off an AI friend is: a founder by their own money, a business owner well, a regular by their number. */
function meansOf(world: World, f: AiFriend, h: Holiday): 'tight' | 'ok' | 'comfortable' {
  if (f.player) {
    const c = guestCost(world, f.player, h).total;
    const bal = account(world, f.player.accounts.local).balance;
    return bal >= c * 3 ? 'comfortable' : bal >= c ? 'ok' : 'tight';
  }
  if (f.business) return 'comfortable';
  return (['tight', 'ok', 'comfortable'] as const)[hashString(`${f.id}:means`) % 3]!;
}

/**
 * How an AI friend answers, the same every time for this holiday: the closer
 * you are (warmth, trust) the likelier they're free; if you don't pay, the
 * less well off ask you to.
 */
function aiAnswer(
  world: World,
  me: Player,
  f: AiFriend,
  h: Holiday,
  hostPays: boolean,
): { answer: AiAnswer; text: string } {
  const month = getMarket(world, me.market).month;
  const warmth = contactWarmth(f.contact, month);
  const trust = Math.max(0, me.trust[f.id] ?? 0);
  const close = Math.max(0, Math.min(1, 0.7 * warmth + 0.6 * trust));
  const rng = deriveRng(world.seed, 'holiday', h.id, f.id);
  const free = rng.next();
  const thrift = rng.next();
  const pick = rng.next();
  const means = meansOf(world, f, h);
  const answer: AiAnswer =
    free < Math.max(0, 0.55 - close)
      ? 'busy'
      : !hostPays && (means === 'tight' || (means === 'ok' && thrift < 0.5))
        ? 'pay'
        : 'yes';
  const lines = AI_REPLIES[answer];
  return { answer, text: lines[Math.floor(pick * lines.length)]! };
}

/** Where the host's trip goes: a booked ticket abroad, else where they are now. */
function tripOf(p: Player): { market: MarketId; tier: Holiday['tier'] } | null {
  const t = p.flightTicket;
  if (t && t.to !== p.market) return { market: t.to, tier: t.hotel?.tier ?? null };
  if (p.location && p.location.market !== p.market)
    return { market: p.location.market, tier: p.location.hotel?.tier ?? null };
  return null;
}

/** What the guest's trip costs them (home minor units): the fare from where they are and the hotel. */
function guestCost(world: World, guest: Player, h: Holiday) {
  if (guest.market === h.market || locationOf(guest) === h.market)
    return { fare: 0, hotel: 0, total: 0, needed: false };
  const fare = flightFare(world, guest, h.market);
  const hotel = h.tier ? hotelPrice(world, guest, h.market, h.tier) : 0;
  return { fare, hotel, total: fare + hotel, needed: true };
}

/** Why this guest can't come right now (travelling elsewhere), or null. */
function busyReason(world: World, guest: Player, h: Holiday): string | null {
  const city = cityName(world, h.market);
  const t = guest.flightTicket;
  if (t && t.to !== h.market)
    return `You already have a ticket to ${cityName(world, t.to)}. Cancel it before you join a holiday in ${city}.`;
  const here = locationOf(guest);
  if (here !== guest.market && here !== h.market)
    return `You’re in ${cityName(world, here)} right now. Fly home before you join a holiday in ${city}.`;
  return null;
}

function getHoliday(world: World, id: Id): Holiday {
  const h = world.holidays?.[id];
  ensure(h, 'holiday.missing', 'We can’t find that holiday.');
  return h;
}

// ---------------------------------------------------------------- holiday.invite

export function inviteHoliday(
  world: World,
  me: Player,
  inviteeIds: Id[],
  hostPays: boolean,
  now: number,
) {
  const trip = tripOf(me);
  ensure(trip, 'holiday.trip', 'Book a trip abroad first, then invite friends on it.');
  const ids = [...new Set(inviteeIds)];
  ensure(ids.length > 0, 'holiday.nobody', 'Pick at least one friend.');
  ensure(!ids.includes(me.id), 'holiday.self', 'Invite someone else.');
  // Other players, or AI people in your contacts (AI friends).
  const invitees = ids.map((id) => {
    const q = world.players[id];
    if (q && !q.ai) return { id, q, f: null };
    const f = aiFriendOf(world, me, id);
    ensure(f, 'holiday.player', 'Invite other players, or friends from your contacts.');
    return { id, q: null, f };
  });
  const dest = getMarket(world, trip.market);
  // One holiday per host, city and month: inviting more friends adds to it.
  let h = Object.values(world.holidays ?? {}).find(
    (x) => x.hostId === me.id && x.market === trip.market && live(world, x),
  );
  if (h) {
    // Upgrading from flight only to a hotel: the friends who come later stay there too.
    if (!h.tier && trip.tier) h.tier = trip.tier;
  } else {
    const id = newId(world, 'holiday');
    h = holidaysOf(world)[id] = {
      id,
      hostId: me.id,
      market: trip.market,
      month: dest.month,
      tier: trip.tier,
      guests: [],
      createdAt: now,
    };
  }
  const hol = h;
  const fresh = invitees.filter((x) => {
    const was = hol.guests.find((g) => g.id === x.id);
    return !was || was.status === 'declined';
  });
  ensure(fresh.length > 0, 'holiday.twice', 'You’ve already invited them.');
  const newOnes = fresh.filter((x) => !hol.guests.some((g) => g.id === x.id)).length;
  ensure(
    h.guests.length + newOnes <= HOLIDAY_MAX_GUESTS,
    'holiday.many',
    `That’s a lot of friends: ${HOLIDAY_MAX_GUESTS} at most.`,
  );
  const city = dest.data.name;
  const myMonth = getMarket(world, me.market).month;
  const humans: Player[] = [];
  const replies: { id: Id; name: string; answer: AiAnswer; text: string; paid: number }[] = [];
  for (const x of fresh) {
    const id = x.id;
    let g = h.guests.find((y) => y.id === id);
    if (g) {
      g.status = 'pending';
      g.hostPays = hostPays;
    } else {
      g = { id, status: 'pending', hostPays };
      h.guests.push(g);
    }
    if (x.q) {
      humans.push(x.q);
      continue;
    }
    // An AI friend answers now.
    const f = x.f!;
    const { answer, text } = aiAnswer(world, me, f, h, hostPays);
    g.ai = { name: f.name, kind: f.kind, market: f.market, gender: f.gender, answer, text };
    let paid = 0;
    if (answer === 'yes') {
      if (hostPays) {
        const cost = aiTripCost(world, me, f, h);
        const mine = account(world, me.accounts.local);
        ensure(
          mine.balance >= cost,
          'holiday.funds',
          `${f.name}’s trip costs ${formatMoney(cost, mine.currency)}; you don’t have it.`,
        );
        transfer(
          world,
          me.accounts.local,
          getMarket(world, me.market).ext.suppliers,
          cost,
          `Holiday: ${f.name}’s trip to ${city}`,
          myMonth,
        );
        paid = cost;
        if (cost) g.paid = cost;
      } else if (f.player) {
        // An AI founder pays their own way, from their own account.
        const cost = guestCost(world, f.player, h).total;
        const theirs = account(world, f.player.accounts.local);
        if (cost > 0 && theirs.balance >= cost)
          transfer(
            world,
            f.player.accounts.local,
            getMarket(world, f.player.market).ext.suppliers,
            cost,
            `Holiday in ${city}`,
            getMarket(world, f.player.market).month,
          );
      }
      g.status = 'accepted';
      // From the host's city: on the host's flight, in the next seat.
      joinFlight(h, me, f.id, f.market);
    } else g.status = 'declined';
    replies.push({ id: f.id, name: f.name, answer, text, paid });
    notify(world, me.id, {
      month: myMonth,
      kind: 'meeting',
      text: `${f.name}: “${text}”`,
      ref: { kind: 'holiday', id: h.id },
    });
  }
  const stay = h.tier ? `, staying at ${hotelName(h.market, h.tier)}` : '';
  for (const q of humans)
    notify(world, q.id, {
      month: getMarket(world, q.market).month,
      kind: 'meeting',
      text: `${me.name} invited you on holiday to ${city} (month ${h.month})${stay}. ${
        hostPays ? 'They’ll pay your flight and hotel.' : 'Everyone pays their own way.'
      }`,
      ref: { kind: 'holiday', id: h.id },
      from: me.id,
    });
  const parts: string[] = [];
  if (humans.length)
    parts.push(`Holiday invitation sent to ${humans.map((q) => q.name).join(', ')}.`);
  for (const r of replies)
    parts.push(
      r.answer === 'yes'
        ? `${firstName(r.name)} is coming with you.`
        : r.answer === 'pay'
          ? `${firstName(r.name)} would come if you pay.`
          : `${firstName(r.name)} can’t make it this month.`,
    );
  return {
    holidayId: h.id,
    invited: humans.map((q) => q.id),
    /** AI friends' answers, with their chat reply (the server adds it to your chat with them). */
    replies,
    city,
    message: parts.join(' '),
  };
}

// ---------------------------------------------------------------- holiday.accept / decline

function myInvite(world: World, me: Player, id: Id): { h: Holiday; g: HolidayGuest } {
  const h = getHoliday(world, id);
  const g = h.guests.find((x) => x.id === me.id);
  ensure(g, 'holiday.missing', 'We can’t find that invitation.');
  ensure(g.status === 'pending', 'holiday.done', 'You already answered that invitation.');
  ensure(live(world, h), 'holiday.expired', 'That holiday is over: the invitation has expired.');
  return { h, g };
}

export function acceptHoliday(
  world: World,
  me: Player,
  id: Id,
  payOwn: boolean | undefined,
  now: number,
) {
  const { h, g } = myInvite(world, me, id);
  const host = getPlayer(world, h.hostId);
  const city = cityName(world, h.market);
  const busy = busyReason(world, me, h);
  if (busy) fail('holiday.busy', busy);
  const cost = guestCost(world, me, h);
  const alreadyGoing = me.flightTicket?.to === h.market;
  const mine = account(world, me.accounts.local);
  const fmt = (v: number) => formatMoney(v, mine.currency);
  const hostPays = g.hostPays && !payOwn;
  let hostPaid = 0;
  let booked = false;
  // Flying from the host's city while the host still holds their ticket: the same flight.
  const from = locationOf(me);
  const sameFlight = cost.needed && joinFlight(h, host, me.id, from);
  if (cost.needed && !alreadyGoing) {
    if (hostPays) {
      const theirs = account(world, host.accounts.local);
      const need = costIn(world, cost.total, mine.currency, theirs.currency);
      ensure(
        theirs.balance >= need,
        'holiday.hostFunds',
        `${host.name} can’t cover your trip right now. Pay your own way, or decline.`,
      );
      const month = getMarket(world, host.market).month;
      hostPaid = payExact(
        world,
        host.accounts.local,
        me.accounts.local,
        cost.total,
        `Holiday: ${host.name} pays your trip to ${city}`,
        month,
        'sent',
      );
    } else
      ensure(
        Math.max(0, mine.balance) >= cost.total,
        'holiday.funds',
        `The trip to ${city} costs ${fmt(cost.total)}${h.tier ? ' with the hotel' : ''}; you have ${fmt(Math.max(0, mine.balance))}. Ask ${host.name} to cover it, or decline.`,
      );
    bookFlight(world, me, h.market, now, h.tier ?? undefined);
    if (hostPays && me.flightTicket)
      me.flightTicket.sponsor = { playerId: host.id, amount: cost.total };
    booked = true;
  }
  if (sameFlight && me.flightTicket) {
    me.flightTicket.party = { holidayId: h.id };
    const shown = host.flightTicket?.flight;
    if (shown) me.flightTicket.flight = { ...shown };
  }
  g.status = 'accepted';
  if (hostPaid) g.paid = hostPaid;
  addContact(me, { kind: 'player', refId: host.id, name: host.name, warmth: 0.05 }, h.month);
  addContact(host, { kind: 'player', refId: me.id, name: me.name, warmth: 0.05 }, h.month);
  notify(world, host.id, {
    month: getMarket(world, host.market).month,
    kind: 'meeting',
    text: `${me.name} is coming to ${city} with you.`,
    ref: { kind: 'holiday', id: h.id },
    from: me.id,
  });
  const stay = h.tier ? ` and ${hotelName(h.market, h.tier)}` : '';
  const shown = me.flightTicket?.flight;
  const onIt = sameFlight
    ? ` You’re on ${firstName(host.name)}’s flight${shown?.number ? ` (${shown.number})` : ''}, in the next seat.`
    : '';
  return {
    holidayId: h.id,
    booked,
    sameFlight,
    hostPaid: hostPays && booked,
    cost: booked ? cost.total : 0,
    currency: mine.currency,
    message:
      (booked
        ? hostPays
          ? `You’re going to ${city} with ${host.name}. ${host.name} paid your flight${stay}.`
          : `You’re going to ${city} with ${host.name}. Flight${stay} booked: ${fmt(cost.total)}.`
        : `You’re on ${host.name}’s holiday in ${city}.`) + onIt,
  };
}

export function declineHoliday(world: World, me: Player, id: Id) {
  const h = getHoliday(world, id);
  const g = h.guests.find((x) => x.id === me.id);
  ensure(g, 'holiday.missing', 'We can’t find that invitation.');
  ensure(g.status === 'pending', 'holiday.done', 'You already answered that invitation.');
  g.status = 'declined';
  const host = world.players[h.hostId];
  if (host)
    notify(world, host.id, {
      month: getMarket(world, host.market).month,
      kind: 'meeting',
      text: `${me.name} can’t come to ${cityName(world, h.market)} this time.`,
      ref: { kind: 'holiday', id: h.id },
      from: me.id,
    });
  return { holidayId: h.id, message: 'Maybe next time.' };
}

// ---------------------------------------------------------------- The shared bonus

/** Fun (so happiness) up and stress down, for one person: what doing something together gives. */
function cheer(world: World, p: Player) {
  return {
    fun: bumpNeed(p, 'fun', HOLIDAY_FUN),
    stress: lifeBarsOn(world) ? bumpStress(p, HOLIDAY_STRESS) : 0,
  };
}

/** Two players on the holiday a little closer: trust both ways, warmer contacts. */
function closer(h: Holiday, p: Player, q: Player) {
  adjustTrust(p, q.id, HOLIDAY_TRUST);
  adjustTrust(q, p.id, HOLIDAY_TRUST);
  addContact(p, { kind: 'player', refId: q.id, name: q.name, warmth: HOLIDAY_WARMTH }, h.month);
  addContact(q, { kind: 'player', refId: p.id, name: p.name, warmth: HOLIDAY_WARMTH }, h.month);
}

/** You and an AI friend closer: your trust in them, a warmer contact. */
function closerToAi(h: Holiday, me: Player, g: ReturnType<typeof aiCompanions>[number]) {
  adjustTrust(me, g.id, HOLIDAY_TRUST);
  const c = (me.contacts ?? []).find((x) => x.refId === g.id && x.kind === g.ai.kind);
  addContact(
    me,
    { kind: g.ai.kind, refId: g.id, name: c?.name ?? g.ai.name, warmth: HOLIDAY_WARMTH },
    h.month,
  );
}

// ---------------------------------------------------------------- holiday.together

export function doTogether(world: World, me: Player, id: Id, businessId: Id) {
  const h = getHoliday(world, id);
  ensure(live(world, h), 'holiday.expired', 'That holiday is over.');
  const members = membersOf(h);
  ensure(members.includes(me.id), 'holiday.member', 'You’re not on that holiday.');
  const city = cityName(world, h.market);
  ensure(
    locationOf(me) === h.market,
    'holiday.where',
    `The holiday is in ${city}. Fly there first.`,
  );
  const b = getBusiness(world, businessId);
  ensure(b.market === h.market, 'holiday.where', `${b.name} is in another city.`);
  ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
  ensure(specOf(b).venue, 'hangout.venue', `${b.name} isn’t somewhere to go together.`);
  const hangouts = world.hangouts ?? {};
  const open = Object.values(hangouts).find(
    (x) =>
      x.holidayId === h.id &&
      x.businessId === b.id &&
      x.status === 'open' &&
      x.month === getMarket(world, h.market).month,
  );
  // A companion already planned it: join them (the shared bonus is applied there).
  if (open && !open.memberIds.includes(me.id)) return { join: open.id } as const;
  ensure(!open, 'hangout.joined', 'You’re already in.');
  const companions = members.filter(
    (x) => x !== me.id && world.players[x] && locationOf(world.players[x]!) === h.market,
  );
  // AI friends on the holiday are with you wherever you go.
  const ais = aiCompanions(h);
  ensure(
    companions.length + ais.length > 0,
    'holiday.alone',
    `Nobody from your holiday is in ${city} yet. Wait for them to land.`,
  );
  const planned = Object.values(hangouts).filter(
    (x) => x.holidayId === h.id && x.month === h.month,
  ).length;
  ensure(planned < HOLIDAY_ACTIVITIES, 'holiday.cap', 'That’s plenty planned for this holiday.');
  const hid = newId(world, 'hangout');
  (world.hangouts ??= {})[hid] = {
    id: hid,
    market: h.market,
    businessId: b.id,
    hostId: me.id,
    inviteeIds: members.filter((x) => x !== me.id),
    memberIds: [me.id],
    when: 'now',
    month: h.month,
    status: 'open',
    holidayId: h.id,
  };
  const effects = {
    social: bumpNeed(me, 'social', HANGOUT_SOCIAL),
    fun: bumpNeed(me, 'fun', HANGOUT_FUN),
  };
  // AI friends come along now: the shared bonus is yours, and trust with them rises.
  const withAi = ais.length ? aiTogether(world, me, h, hid, b.id, b.name, ais) : null;
  for (const q of companions)
    notify(world, q, {
      month: h.month,
      kind: 'meeting',
      text: `${me.name} wants to go to ${b.name} together. Join them from your holiday.`,
      ref: { kind: 'holiday', id: h.id },
      from: me.id,
    });
  return {
    plan: {
      hangoutId: hid,
      holidayId: h.id,
      businessId: b.id,
      placeId: `biz:${b.id}`,
      effects,
      ...(withAi ? { holiday: withAi } : {}),
      message: withAi
        ? companions.length
          ? `${withAi.message} Your other friends on holiday can join you.`
          : withAi.message
        : `Plans made: ${b.name}. Your friends on holiday can join you.`,
    },
  } as const;
}

/** An outing with your AI companions: your bonus, trust with each of them, on the holiday's list. */
function aiTogether(
  world: World,
  me: Player,
  h: Holiday,
  hangoutId: Id,
  businessId: Id,
  name: string,
  ais: ReturnType<typeof aiCompanions>,
) {
  const bars = lifeBarsOn(world);
  const fun = bumpNeed(me, 'fun', HOLIDAY_FUN);
  const stress = bars ? bumpStress(me, HOLIDAY_STRESS) : 0;
  for (const g of ais) closerToAi(h, me, g);
  const list = (h.together ??= []);
  list.push({ hangoutId, businessId, name, memberIds: [me.id, ...ais.map((g) => g.id)] });
  const names = ais.map((g) => firstName(g.ai.name)).join(', ');
  return {
    holidayId: h.id,
    happiness: Math.round(fun / 2),
    stress,
    trust: HOLIDAY_TRUST,
    with: ais.map((g) => g.id),
    message: `${name} with ${names}: happier, less stressed, closer.`,
    needs: needsOf(me),
    mood: moodOf(me),
  };
}

/**
 * After a holiday hangout is joined: the shared bonus for the one joining and
 * everyone already there, and the outing goes on the holiday's list.
 */
export function holidayJoined(world: World, me: Player, hangoutId: Id) {
  const ho = world.hangouts?.[hangoutId];
  const h = ho?.holidayId ? world.holidays?.[ho.holidayId] : undefined;
  if (!ho || !h) return null;
  const others = ho.memberIds
    .filter((x) => x !== me.id)
    .map((x) => world.players[x])
    .filter((q): q is Player => !!q && !q.ai);
  if (!others.length) return null;
  const mine = cheer(world, me);
  for (const q of others) {
    cheer(world, q);
    closer(h, me, q);
  }
  const b = world.markets[ho.market]?.businesses?.[ho.businessId];
  const list = (h.together ??= []);
  const row = list.find((x) => x.hangoutId === ho.id);
  // AI friends who came along stay on the row.
  if (row) row.memberIds = [...new Set([...row.memberIds, ...ho.memberIds])];
  else
    list.push({
      hangoutId: ho.id,
      businessId: ho.businessId,
      name: b?.name ?? '',
      memberIds: [...ho.memberIds],
    });
  const names = others.map((q) => q.name.split(' ')[0]).join(', ');
  for (const q of others)
    notify(world, q.id, {
      month: h.month,
      kind: 'meeting',
      text: `${me.name} joined you at ${b?.name ?? 'the venue'}. Holiday together: happier, less stressed.`,
      ref: { kind: 'holiday', id: h.id },
      from: me.id,
    });
  return {
    holidayId: h.id,
    happiness: Math.round(mine.fun / 2),
    stress: mine.stress,
    trust: HOLIDAY_TRUST,
    with: others.map((q) => q.id),
    message: `Holiday together with ${names}: happier, less stressed, closer.`,
    needs: needsOf(me),
    mood: moodOf(me),
  };
}

// ---------------------------------------------------------------- hotel.knock / answer / leave

/** How often an AI friend next door opens up when you knock (the rest: not right now). */
const KNOCK_AI_YES = 0.85;
/** Company when a friend comes over to your room (on top of the shared bonus). */
const VISIT_SOCIAL = 15;

const AI_NOT_NOW = [
  'Just out of the shower! Give me a bit.',
  'Having a nap. Later?',
  'On a call. Knock again in a bit!',
] as const;

/** In the holiday city now: a player where they are; an AI friend with the host (as the view shows them). */
function hereOn(world: World, h: Holiday, id: Id): boolean {
  const g = h.guests.find((x) => x.id === id);
  if (g?.ai) {
    if (g.status !== 'accepted') return false;
    const q = world.players[id];
    if (q && locationOf(q) === h.market) return true;
    const host = world.players[h.hostId];
    return !onFlight(world, h).includes(id) || (!!host && locationOf(host) === h.market);
  }
  const q = world.players[id];
  return !!q && locationOf(q) === h.market;
}

/** The visit going on, if both are still in the city (one who flew off ended it). */
function liveVisit(world: World, h: Holiday) {
  const v = h.visit;
  return v && hereOn(world, h, v.host) && hereOn(world, h, v.guest) ? v : null;
}

const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * A friend comes over: the visit starts, and the first time these two do it
 * on this holiday, the shared bonus (fun, company, less stress, trust both
 * ways). Returns the bonus for `me` (one of the two), or null when already had.
 */
function startVisit(world: World, h: Holiday, hostId: Id, guestId: Id, me: Player, now: number) {
  h.visit = { host: hostId, guest: guestId, since: now };
  const key = pairKey(hostId, guestId);
  const seen = (h.visited ??= []);
  if (seen.includes(key)) return null;
  seen.push(key);
  const humans = [hostId, guestId]
    .map((id) => world.players[id])
    .filter((q): q is Player => !!q && !q.ai);
  let mine = { fun: 0, stress: 0, social: 0 };
  for (const q of humans) {
    const fx = { ...cheer(world, q), social: bumpNeed(q, 'social', VISIT_SOCIAL) };
    if (q.id === me.id) mine = fx;
  }
  const [a, b] = humans;
  if (a && b) closer(h, a, b);
  else if (a) {
    const ai = aiCompanions(h).find((g) => g.id === (a.id === hostId ? guestId : hostId));
    if (ai) closerToAi(h, a, ai);
  }
  return {
    happiness: Math.round(mine.fun / 2),
    social: mine.social,
    stress: mine.stress,
    trust: HOLIDAY_TRUST,
    needs: needsOf(me),
    mood: moodOf(me),
  };
}

/** You and a friend on this holiday, both in the city, with a hotel: the checks every knock needs. */
function knockable(world: World, me: Player, id: Id) {
  const h = getHoliday(world, id);
  ensure(live(world, h), 'holiday.expired', 'That holiday is over.');
  const members = membersOf(h);
  ensure(members.includes(me.id), 'holiday.member', 'You’re not on that holiday.');
  ensure(!!h.tier, 'hotel.none', 'There’s no hotel on this holiday.');
  ensure(
    locationOf(me) === h.market,
    'holiday.where',
    `The holiday is in ${cityName(world, h.market)}. Fly there first.`,
  );
  return { h, members };
}

/** `hotel.knock`: knock on a friend's door in the hotel. An AI friend answers at once. */
export function knockHotel(world: World, me: Player, id: Id, playerId: Id, now: number) {
  const { h, members } = knockable(world, me, id);
  ensure(playerId !== me.id, 'hotel.self', 'That’s your own door.');
  ensure(members.includes(playerId), 'holiday.member', 'They’re not on this holiday.');
  const them = firstName(nameOn(world, h, playerId));
  ensure(
    hereOn(world, h, playerId),
    'hotel.away',
    `${them} isn’t in ${cityName(world, h.market)} right now.`,
  );
  const v = liveVisit(world, h);
  if (v) {
    const other = v.host === me.id ? v.guest : v.guest === me.id ? v.host : null;
    fail(
      'hotel.visiting',
      other
        ? v.host === me.id
          ? `${firstName(nameOn(world, h, other))} is already over.`
          : `You’re in ${firstName(nameOn(world, h, other))}’s room. Say goodbye first.`
        : `${firstName(nameOn(world, h, v.guest))} is over at ${firstName(nameOn(world, h, v.host))}’s right now.`,
    );
  }
  delete h.visit;
  const room = roomsOf(h)[playerId] ?? null;
  const knocks = (h.knocks = (h.knocks ?? []).filter((k) => k.from !== me.id));
  const q = world.players[playerId];
  if (!q || q.ai) {
    // An AI friend next door: they open up at once, mostly.
    const rng = deriveRng(world.seed, 'hotel.knock', h.id, playerId, me.id, now);
    const yes = rng.next() < KNOCK_AI_YES;
    const pick = rng.next();
    if (!yes) {
      knocks.push({ from: me.id, to: playerId, at: now, room, status: 'declined' });
      const text = AI_NOT_NOW[Math.floor(pick * AI_NOT_NOW.length)]!;
      return {
        holidayId: h.id,
        answered: 'no' as const,
        text,
        message: `${them}: “${text}”`,
      };
    }
    const bonus = startVisit(world, h, me.id, playerId, me, now);
    return {
      holidayId: h.id,
      answered: 'yes' as const,
      visit: { host: me.id, guest: playerId, room },
      ...(bonus ? { bonus } : {}),
      message: `${them} opened the door and came over${room ? ` from room ${room}` : ''}.`,
    };
  }
  knocks.push({ from: me.id, to: playerId, at: now, room, status: 'pending' });
  notify(world, playerId, {
    month: getMarket(world, q.market).month,
    kind: 'meeting',
    text: `${me.name} is knocking on your door${room ? ` (room ${room})` : ''}.`,
    ref: { kind: 'holiday', id: h.id },
    from: me.id,
  });
  return {
    holidayId: h.id,
    answered: null,
    knock: { to: playerId, room },
    message: `You knock on ${them}’s door…`,
  };
}

/** `hotel.answer`: open the door to a friend who knocked (you go over to their room), or not now. */
export function answerKnock(
  world: World,
  me: Player,
  id: Id,
  from: Id,
  accept: boolean,
  now: number,
) {
  const h = getHoliday(world, id);
  const k = (h.knocks ?? []).find((x) => x.from === from && x.to === me.id);
  ensure(k && k.status === 'pending', 'hotel.knock', 'Nobody is knocking.');
  const q = getPlayer(world, from);
  const them = firstName(q.name);
  const month = getMarket(world, q.market).month;
  if (!accept) {
    k.status = 'declined';
    notify(world, from, {
      month,
      kind: 'meeting',
      text: `${me.name} can’t come over right now.`,
      ref: { kind: 'holiday', id: h.id },
      from: me.id,
    });
    return { holidayId: h.id, accepted: false, message: 'Maybe later.' };
  }
  knockable(world, me, id);
  ensure(hereOn(world, h, from), 'hotel.away', `${them} has gone out.`);
  const v = liveVisit(world, h);
  ensure(!v, 'hotel.visiting', 'Someone’s already visiting. Try again in a bit.');
  h.knocks = (h.knocks ?? []).filter((x) => x !== k);
  const bonus = startVisit(world, h, from, me.id, me, now);
  const room = roomsOf(h)[from] ?? null;
  notify(world, from, {
    month,
    kind: 'meeting',
    text: `${me.name} opened the door and came over to your room.`,
    ref: { kind: 'holiday', id: h.id },
    from: me.id,
  });
  return {
    holidayId: h.id,
    accepted: true,
    visit: { host: from, guest: me.id, room },
    ...(bonus ? { bonus } : {}),
    message: `You’re in ${them}’s room${room ? ` (${room})` : ''}.`,
  };
}

/** `hotel.leave`: the visit ends (the host says goodbye, or the guest goes back to their room). */
export function leaveVisit(world: World, me: Player, id: Id) {
  const h = getHoliday(world, id);
  const v = h.visit;
  ensure(v && (v.host === me.id || v.guest === me.id), 'hotel.novisit', 'Nobody’s over.');
  delete h.visit;
  const other = v.host === me.id ? v.guest : v.host;
  const rooms = roomsOf(h);
  const back = rooms[v.guest];
  const q = world.players[other];
  if (q && !q.ai)
    notify(world, other, {
      month: getMarket(world, q.market).month,
      kind: 'meeting',
      text:
        v.host === me.id
          ? `${me.name} said goodbye. You’re back in your room.`
          : `${me.name} went back to ${back ? `room ${back}` : 'their room'}.`,
      ref: { kind: 'holiday', id: h.id },
      from: me.id,
    });
  const them = firstName(nameOn(world, h, other));
  return {
    holidayId: h.id,
    message:
      v.host === me.id
        ? `${them} went back to ${back ? `room ${back}` : 'their room'}.`
        : `You said goodbye to ${them}.`,
  };
}

// ---------------------------------------------------------------- view.holidays

/** A room number on a floor, the same for everyone: the host's, and the guests' next to it. */
function roomsOf(h: Holiday): Record<Id, number> {
  let x = 0;
  for (const c of h.id) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const floor = 4 + (x % 18);
  const first = floor * 100 + 2 + ((x >>> 5) % 12);
  const out: Record<Id, number> = {};
  membersOf(h).forEach((id, i) => (out[id] = first + i));
  return out;
}

/** `view.holidays`: this month's holidays you host or were invited on. */
export function holidaysView(world: World, p: Player) {
  const here = locationOf(p);
  return Object.values(world.holidays ?? {})
    .filter(
      (h) =>
        live(world, h) &&
        (h.hostId === p.id || h.guests.some((g) => g.id === p.id && g.status !== 'declined')),
    )
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .map((h) => {
      const name = (id: Id) => nameOn(world, h, id);
      const m = getMarket(world, h.market);
      const mine = h.hostId === p.id;
      const me = h.guests.find((g) => g.id === p.id);
      const members = membersOf(h);
      const going = mine || me?.status === 'accepted';
      const hostP = world.players[h.hostId];
      const flying = onFlight(world, h);
      const seatOf = (id: Id) => {
        const i = h.flight?.ids.indexOf(id) ?? -1;
        return i >= 0 && h.flight ? holidaySeat(h.flight.row, i) : null;
      };
      const aiOf = (id: Id) => h.guests.find((g) => g.id === id)?.ai;
      const inCity = (id: Id) => {
        const q = world.players[id];
        if (q) return locationOf(q) === h.market;
        // An AI friend: there already if they made their own way, else with the host.
        const a = aiOf(id);
        if (!a) return false;
        return !flying.includes(id) || (!!hostP && locationOf(hostP) === h.market);
      };
      const companionsHere =
        going && here === h.market
          ? members
              .filter((id) => id !== p.id && (inCity(id) || !!aiOf(id)))
              .map((id) => ({ id, name: name(id) }))
          : [];
      const myCost = me && me.status === 'pending' ? guestCost(world, p, h) : null;
      const balance = Math.max(0, account(world, p.accounts.local).balance);
      const myCur = account(world, p.accounts.local).currency;
      const hangouts = Object.values(world.hangouts ?? {}).filter(
        (x) => x.holidayId === h.id && x.status === 'open' && x.month === m.month,
      );
      const rooms = h.tier ? roomsOf(h) : {};
      const visit = liveVisit(world, h);
      const myKnock = (h.knocks ?? []).find((k) => k.from === p.id) ?? null;
      // You and at least one friend on the host's flight.
      const meFlying = going && flying.includes(p.id) && flying.length > 1;
      /** Everyone else coming: how to draw them, their room, and their seat when you share a flight. */
      const companions = going
        ? members
            .filter((id) => id !== p.id)
            .map((id) => {
              const q = world.players[id];
              const a = aiOf(id);
              const gender: Gender = q
                ? (q.gender ?? genderOfName(q.name))
                : (a?.gender ?? genderOfName(name(id)));
              const market = q?.market ?? a?.market ?? h.market;
              const together = meFlying && flying.includes(id);
              return {
                id,
                name: name(id),
                ai: !q || q.ai,
                kind: q && !q.ai ? ('player' as const) : (a?.kind ?? ('founder' as const)),
                gender,
                backgroundId: q?.backgroundId ?? null,
                appearance: q
                  ? (q.appearance ?? defaultAppearance(appearanceSeed(q), q.gender, q.market))
                  : defaultAppearance(id, gender, market),
                from: market,
                room: rooms[id] ?? null,
                /** On your flight, next to you: their seat. */
                seat: together ? seatOf(id) : null,
                sameFlight: together,
                /** In the city now (an AI friend from elsewhere is there already). */
                here: inCity(id),
              };
            })
        : [];
      const shown =
        (hostP?.flightTicket?.from === h.flight?.from ? hostP?.flightTicket?.flight : undefined) ??
        p.flightTicket?.flight;
      return {
        id: h.id,
        market: h.market,
        city: m.data.name,
        month: h.month,
        hotel: h.tier ? { tier: h.tier, name: hotelName(h.market, h.tier) } : null,
        host: { id: h.hostId, name: name(h.hostId) },
        mine,
        myStatus: mine ? ('host' as const) : (me?.status ?? 'pending'),
        /** For a pending invitation: does the host pay, what it costs you, can you afford it. */
        invite:
          me && me.status === 'pending' && myCost
            ? {
                hostPays: me.hostPays,
                cost: myCost.total,
                fare: myCost.fare,
                hotel: myCost.hotel,
                currency: myCur,
                affordable: me.hostPays || balance >= myCost.total,
                blocked: busyReason(world, p, h),
              }
            : null,
        companions,
        /** Fly together: your seat on the host's flight and who's beside you. Null = you fly on your own. */
        flight:
          meFlying && h.flight
            ? {
                from: h.flight.from,
                seat: seatOf(p.id),
                ...(shown ?? {}),
                with: companions
                  .filter((c) => c.sameFlight)
                  .map((c) => ({ id: c.id, name: c.name, seat: c.seat })),
              }
            : null,
        guests: h.guests.map((g) => {
          const q = world.players[g.id];
          // The host sees roughly what each friend's trip costs them, in the host's currency.
          const est =
            mine && q && g.status === 'pending' && g.hostPays
              ? costIn(
                  world,
                  guestCost(world, q, h).total,
                  account(world, q.accounts.local).currency,
                  myCur,
                )
              : null;
          return {
            id: g.id,
            name: name(g.id),
            status: g.status,
            hostPays: g.hostPays,
            here: g.status === 'accepted' && inCity(g.id),
            ...(g.ai ? { ai: { answer: g.ai.answer, text: g.ai.text, kind: g.ai.kind } } : {}),
            ...(est !== null ? { estimate: est } : {}),
            ...(g.paid !== undefined && mine ? { paid: g.paid } : {}),
          };
        }),
        hostHere: !!hostP && locationOf(hostP) === h.market,
        /** You and at least one friend from the holiday are in the city now. */
        together: companionsHere.length > 0,
        companionsHere,
        /** Room numbers in the hotel (same hotel, neighbouring rooms). */
        rooms,
        /** Venues to go to together (open, ones you can go into), when you're there. */
        things:
          going && here === h.market
            ? Object.values(m.businesses ?? {})
                .filter(
                  (b) =>
                    isOpen(b) && specOf(b).venue && OUTING_RANK[specOf(b).category] !== undefined,
                )
                .sort(
                  (a, b) =>
                    OUTING_RANK[specOf(a).category]! - OUTING_RANK[specOf(b).category]! ||
                    (a.id < b.id ? -1 : 1),
                )
                .slice(0, 6)
                .map((b) => {
                  const ho = hangouts.find((x) => x.businessId === b.id);
                  return {
                    businessId: b.id,
                    placeId: `biz:${b.id}`,
                    name: b.name,
                    kind: b.kind,
                    planned: ho
                      ? {
                          hangoutId: ho.id,
                          by: name(ho.hostId),
                          members: ho.memberIds.map((id) => ({ id, name: name(id) })),
                          joined: ho.memberIds.includes(p.id),
                        }
                      : null,
                  };
                })
            : [],
        done: (h.together ?? []).map((x) => ({
          hangoutId: x.hangoutId,
          businessId: x.businessId,
          name: x.name,
          members: x.memberIds.map((id) => ({ id, name: name(id) })),
          withMe: x.memberIds.includes(p.id),
        })),
        bonus: { happiness: HOLIDAY_FUN / 2, stress: HOLIDAY_STRESS, trust: HOLIDAY_TRUST },
        /** Friends knocking on your door in the hotel, waiting for you to answer (`hotel.answer`). */
        knocks:
          going && here === h.market
            ? (h.knocks ?? [])
                .filter((k) => k.to === p.id && k.status === 'pending' && hereOn(world, h, k.from))
                .map((k) => ({ from: k.from, name: name(k.from), room: k.room, at: k.at }))
            : [],
        /** Your last knock: still waiting, or turned down. */
        myKnock: going ? (myKnock ? { ...myKnock, name: name(myKnock.to) } : null) : null,
        /** A friend over in someone's room: the guest is in the host's room (`hotel.leave` ends it). */
        visit:
          going && visit
            ? {
                host: { id: visit.host, name: name(visit.host), room: rooms[visit.host] ?? null },
                guest: {
                  id: visit.guest,
                  name: name(visit.guest),
                  room: rooms[visit.guest] ?? null,
                },
                since: visit.since,
                me:
                  visit.host === p.id
                    ? ('host' as const)
                    : visit.guest === p.id
                      ? ('guest' as const)
                      : null,
              }
            : null,
      };
    });
}

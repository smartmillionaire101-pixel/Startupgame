/**
 * Shopping together (player feedback: "you can invite someone and take them
 * shopping"). Like golf with a friend and home visits:
 *
 * - `mall.invite`: ask someone in the city you're in to the mall. A player
 *   gets an invitation (inbox) they answer with `mall.answer`; an AI friend
 *   says yes at once if they're free. While you're both there (the city's
 *   month, both still in town) each of you sees the other walking with you.
 * - Meeting there is an outing: social and fun for both, and the
 *   relationship warms both ways (contacts and trust), as other outings do;
 *   the life bars ease stress (dispatch.ts, with the bars).
 * - `mall.gift`: buy them something from any shop. The money moves from your
 *   personal account to the shop's till (the integer ledger, as `mall.buy`);
 *   the thing is theirs: clothes go on them, a phone in their pocket,
 *   things to keep in their bag (from you), food fills them up. Anything to
 *   wear (clothes, shoes, jewellery …) goes in their wardrobe (wardrobe.ts),
 *   from you, to put on when they like. They're happier, you're closer.
 * - `mall.leave` ends the outing (or calls off an invitation).
 *
 * The commands are new, so a logged world that never used them replays as
 * before; they're open once the investor release note is logged, with the
 * bigger mall they shop in.
 */
import { appearanceSeed, defaultAppearance } from './appearance.js';
import type { Command } from './commands.js';
import { MALL_TRIP, forWardrobe, giftable, mallItem, wearable } from './data/leisure.js';
import { ensure } from './errors.js';
import { addContact, warmthWith } from './events.js';
import { adjustTrust, getMarket, locationOf, notify } from './helpers.js';
import { newId } from './ids.js';
import {
  barsOfItem,
  consume,
  keepThing,
  mallPrice,
  mallSells,
  mallTill,
  payAtMall,
  wearing,
} from './leisure.js';
import { applyBars, barsApply } from './lifebars.js';
import { formatMoney } from './money.js';
import { bumpNeed, needsOf } from './needs.js';
import { investorOn } from './releases.js';
import type { Id, MallTrip, Player, World } from './types.js';
import { addToWardrobe } from './wardrobe.js';

const tripsOf = (world: World) => (world.mallTrips ??= {});

/** Still on: an invitation or an outing in the city's month it was made (and, together, both in town). */
function tripLive(world: World, t: MallTrip): boolean {
  if (t.status !== 'invited' && t.status !== 'together') return false;
  if (world.markets[t.market]?.month !== t.month) return false;
  if (t.status === 'invited') return true;
  const a = world.players[t.host];
  const b = world.players[t.guest];
  return !!a && !!b && locationOf(a) === t.market && locationOf(b) === t.market;
}

/** Someone's live invitation or outing, if any (the newest). */
function tripOf(world: World, playerId: Id): MallTrip | null {
  return (
    Object.values(world.mallTrips ?? {})
      .filter((t) => (t.host === playerId || t.guest === playerId) && tripLive(world, t))
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0] ?? null
  );
}

/** Warmer both ways: each other's contact, and trust. AI founders are filed as founders. */
function bond(world: World, a: Player, b: Player, warmth: number, trust: number) {
  const month = getMarket(world, a.market).month;
  const kindOf = (p: Player) => (p.ai && p.companyIds.length ? 'founder' : 'player');
  addContact(a, { kind: kindOf(b), refId: b.id, name: b.name, warmth }, month);
  addContact(b, { kind: kindOf(a), refId: a.id, name: a.name, warmth }, month);
  adjustTrust(a, b.id, trust);
  adjustTrust(b, a.id, trust);
}

/** You meet at the mall: social and fun for both, and closer. */
function startTrip(world: World, t: MallTrip) {
  const host = world.players[t.host]!;
  const guest = world.players[t.guest]!;
  t.status = 'together';
  for (const p of [host, guest]) {
    bumpNeed(p, 'social', MALL_TRIP.social);
    bumpNeed(p, 'fun', MALL_TRIP.fun);
  }
  bond(world, host, guest, MALL_TRIP.warmth, MALL_TRIP.trust);
}

function inviteToMall(world: World, me: Player, playerId: Id, now: number) {
  ensure(investorOn(world), 'mall.trip', 'Shopping together isn’t open yet.');
  const friend = world.players[playerId];
  ensure(friend && friend.id !== me.id, 'mall.invite', 'Pick who to take shopping.');
  const here = locationOf(me);
  const m = getMarket(world, here);
  ensure(
    locationOf(friend) === here,
    'mall.city',
    `${friend.name} isn’t in ${m.data.name} right now.`,
  );
  ensure(!tripOf(world, me.id), 'mall.busy', 'You’re already shopping with someone.');
  ensure(
    !tripOf(world, friend.id),
    'mall.busy',
    `${friend.name} is already shopping with someone.`,
  );
  const sent = Object.values(world.mallTrips ?? {}).filter(
    (t) => t.host === me.id && t.market === here && t.month === m.month,
  ).length;
  ensure(sent < MALL_TRIP.invitesPerMonth, 'mall.cap', 'Enough invitations for this month.');
  const id = newId(world, 'malltrip');
  const t: MallTrip = {
    id,
    host: me.id,
    guest: friend.id,
    market: here,
    month: m.month,
    status: 'invited',
    createdAt: now,
    gifts: [],
  };
  tripsOf(world)[id] = t;
  if (friend.ai) {
    // An AI friend who's free says yes at once.
    startTrip(world, t);
    return {
      tripId: id,
      status: t.status,
      friend: { id: friend.id, name: friend.name },
      needs: needsOf(me),
      message: `${friend.name} is coming shopping with you.`,
    };
  }
  notify(world, friend.id, {
    month: getMarket(world, friend.market).month,
    kind: 'meeting',
    text: `${me.name} invites you to go shopping at the mall in ${m.data.name}.`,
    ref: { kind: 'mall', id },
    from: me.id,
  });
  return {
    tripId: id,
    status: t.status,
    friend: { id: friend.id, name: friend.name },
    message: `Invitation sent to ${friend.name}.`,
  };
}

function answerMall(world: World, me: Player, tripId: Id, accept: boolean) {
  const t = world.mallTrips?.[tripId];
  ensure(t && t.guest === me.id, 'mall.missing', 'We can’t find that invitation.');
  ensure(t.status === 'invited' && tripLive(world, t), 'mall.done', 'That invitation is over.');
  const host = world.players[t.host];
  ensure(host, 'mall.missing', 'We can’t find that invitation.');
  const m = getMarket(world, t.market);
  if (!accept) {
    t.status = 'declined';
    notify(world, host.id, {
      month: m.month,
      kind: 'meeting',
      text: `${me.name} can’t come shopping this time.`,
      ref: { kind: 'mall', id: t.id },
      from: me.id,
    });
    return { tripId: t.id, status: t.status, message: 'Maybe next time.' };
  }
  ensure(
    locationOf(me) === t.market && locationOf(host) === t.market,
    'mall.city',
    `The mall is in ${m.data.name}: you both need to be there.`,
  );
  ensure(
    !Object.values(world.mallTrips ?? {}).some(
      (x) =>
        x.id !== t.id &&
        x.status === 'together' &&
        tripLive(world, x) &&
        [x.host, x.guest].some((id) => id === me.id || id === host.id),
    ),
    'mall.busy',
    'One of you is already shopping with someone.',
  );
  startTrip(world, t);
  notify(world, host.id, {
    month: m.month,
    kind: 'meeting',
    text: `${me.name} is coming shopping with you.`,
    ref: { kind: 'mall', id: t.id },
    from: me.id,
  });
  return {
    tripId: t.id,
    status: t.status,
    host: { id: host.id, name: host.name },
    needs: needsOf(me),
    message: `You’re at the mall with ${host.name}.`,
  };
}

function leaveMall(world: World, me: Player, tripId: Id) {
  const t = world.mallTrips?.[tripId];
  ensure(t && (t.host === me.id || t.guest === me.id), 'mall.missing', 'That’s not your outing.');
  ensure(t.status === 'invited' || t.status === 'together', 'mall.done', 'That outing is over.');
  t.status = 'ended';
  const other = t.host === me.id ? t.guest : t.host;
  if (world.markets[t.market]?.month === t.month)
    notify(world, other, {
      month: getMarket(world, t.market).month,
      kind: 'meeting',
      text: `${me.name} headed off from the mall.`,
      ref: { kind: 'mall', id: t.id },
      from: me.id,
    });
  return { tripId: t.id, status: t.status, message: 'You headed off.' };
}

function giftAtMall(
  world: World,
  me: Player,
  tripId: Id,
  itemId: string,
  colour: string | undefined,
  now: number,
) {
  const t = world.mallTrips?.[tripId];
  ensure(t && (t.host === me.id || t.guest === me.id), 'mall.missing', 'That’s not your outing.');
  ensure(
    t.status === 'together' && tripLive(world, t),
    'mall.together',
    'You can buy them something while you’re at the mall together.',
  );
  ensure(
    t.gifts.length < MALL_TRIP.giftsPerTrip,
    'mall.gifts',
    'That’s plenty of gifts for one trip.',
  );
  const friend = world.players[t.host === me.id ? t.guest : t.host]!;
  const x = mallItem(itemId);
  ensure(x && mallSells(world, x), 'mall.item', 'The mall doesn’t sell that.');
  ensure(giftable(x), 'mall.giftable', 'That isn’t something you can give.');
  const m = getMarket(world, t.market);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const price = mallPrice(world, m, x);
  const till = mallTill(m, x);
  // What changes for them is checked before anything is paid.
  const look = wearable(x) ? wearing(friend, x, colour) : null;
  if (x.phone)
    ensure(friend.phone?.tier !== x.phone, 'mall.owned', `That’s the phone ${friend.name} has.`);
  payAtMall(
    world,
    me,
    m,
    price,
    till?.account ?? m.ext.suppliers,
    `Gift for ${friend.name}: ${x.label} at the mall${till ? ` (${till.name})` : ''}`,
  );
  // It's theirs.
  if (look) {
    friend.appearance = look;
    friend.appearanceAt = now;
  }
  if (x.phone) friend.phone = { tier: x.phone, paid: price, month: m.month };
  const fx = consume(friend, x);
  if (forWardrobe(x) && investorOn(world)) addToWardrobe(friend, x, m.month, colour, me.id);
  else if (x.keep || look || x.phone) keepThing(friend, x.id, m.month, me.id);
  const bars = barsOfItem(x);
  if (bars && barsApply(world, friend)) applyBars(friend, bars);
  // Happier, and closer.
  bumpNeed(friend, 'fun', MALL_TRIP.giftFun);
  bumpNeed(friend, 'social', MALL_TRIP.giftSocial);
  bumpNeed(me, 'social', MALL_TRIP.giverSocial);
  bond(
    world,
    me,
    friend,
    Math.min(MALL_TRIP.giftWarmthMax, MALL_TRIP.giftWarmth + x.priceCol * 0.5),
    MALL_TRIP.giftTrust,
  );
  t.gifts.push({ from: me.id, to: friend.id, item: x.id, price });
  notify(world, friend.id, {
    month: m.month,
    kind: 'meeting',
    text: `${me.name} bought you a gift at the mall: ${x.label}.`,
    ref: { kind: 'mall', id: t.id },
    from: me.id,
  });
  return {
    tripId: t.id,
    item: x.id,
    shop: x.shop,
    price,
    to: { id: friend.id, name: friend.name },
    ...(look ? { appearance: look } : {}),
    effects: fx,
    needs: needsOf(me),
    message: `You bought ${friend.name} ${x.label}: ${fmt(price)}.`,
  };
}

export function mallTripCommand(
  world: World,
  me: Player,
  cmd: Extract<Command, { type: 'mall.invite' | 'mall.answer' | 'mall.leave' | 'mall.gift' }>,
  now: number,
) {
  switch (cmd.type) {
    case 'mall.invite':
      return inviteToMall(world, me, cmd.playerId, now);
    case 'mall.answer':
      return answerMall(world, me, cmd.tripId, cmd.accept);
    case 'mall.leave':
      return leaveMall(world, me, cmd.tripId);
    case 'mall.gift':
      return giftAtMall(world, me, cmd.tripId, cmd.itemId, cmd.colour, now);
  }
}

/** Someone as the shopping view shows them (how they look, for the figure walking with you). */
function person(p: Player) {
  return {
    id: p.id,
    name: p.name,
    ai: !!p.ai,
    role: p.role,
    backgroundId: p.backgroundId,
    gender: p.gender ?? null,
    appearance: p.appearance ?? defaultAppearance(appearanceSeed(p), p.gender),
    /** Whether they chose their look (else the client dresses them by their background). */
    styled: !!p.appearance,
  };
}

/**
 * `me.mall` (with the shops): your outing or invitation, invitations to you,
 * and the AI friends free here to ask. Empty before the release note.
 */
export function mallTripView(world: World, me: Player) {
  if (!investorOn(world)) return {};
  const here = locationOf(me);
  const name = (id: Id) => world.players[id]?.name ?? '';
  const mine = tripOf(world, me.id);
  const other = mine ? world.players[mine.host === me.id ? mine.guest : mine.host] : undefined;
  const trip =
    mine && other && (mine.status === 'together' || mine.host === me.id)
      ? {
          id: mine.id,
          status: mine.status,
          mine: mine.host === me.id,
          market: mine.market,
          friend: person(other),
          gifts: mine.gifts.map((g) => ({
            ...g,
            label: mallItem(g.item)?.label ?? g.item,
            fromName: name(g.from),
            toName: name(g.to),
          })),
        }
      : null;
  const invites = Object.values(world.mallTrips ?? {})
    .filter((t) => t.guest === me.id && t.status === 'invited' && tripLive(world, t))
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .map((t) => ({
      id: t.id,
      from: { id: t.host, name: name(t.host) },
      market: t.market,
      city: world.markets[t.market]?.data.name ?? '',
    }));
  const busy = new Set<Id>();
  for (const t of Object.values(world.mallTrips ?? {}))
    if (tripLive(world, t)) {
      busy.add(t.host);
      busy.add(t.guest);
    }
  const month = getMarket(world, here).month;
  const friends = Object.values(world.players)
    .filter((p) => p.ai && p.id !== me.id && !busy.has(p.id) && locationOf(p) === here)
    .map((p) => ({
      p,
      w: Math.max(
        warmthWith(world, me, 'player', p.id, month),
        warmthWith(world, me, 'founder', p.id, month),
      ),
    }))
    .sort((a, b) => b.w - a.w || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, 6)
    .map(({ p, w }) => {
      const co = p.companyIds.map((id) => world.companies[id]).find((c) => c?.status === 'active');
      return { ...person(p), company: co?.name ?? null, warmth: Math.round(w * 100) / 100 };
    });
  return { trip, invites, friends };
}

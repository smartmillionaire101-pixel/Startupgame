/**
 * Wave 13: giving a home to another player (from a chat).
 *
 * `property.gift` offers a home you own to another human player; they accept
 * (`property.gift.accept`) or decline (`property.gift.decline`, which the
 * giver may also use to take the offer back). Ownership changes only on
 * acceptance, because a home comes with running costs.
 *
 * The safe rule: a home with a mortgage, or one let to tenants, can't be
 * given (pay off the mortgage or end the let first). Everything is re-checked
 * when the gift is accepted. If the giver lived there, they move out; the
 * receiver may move in with `property.moveIn` like any home they own.
 *
 * No money moves: a gift is a change of owner, not a sale, so the ledger is
 * untouched and money is conserved. Net worth follows the owner (the home's
 * equity leaves the giver's and joins the receiver's).
 */
import { TIER_LABEL } from './data/property.js';
import { ensure } from './errors.js';
import { achieve, getMarket, notify } from './helpers.js';
import { newId } from './ids.js';
import { getProperty, priceOf } from './property.js';
import type { Id, Player, Property, PropertyGift, World } from './types.js';

/** Offers a player may have waiting at once. */
const GIFTS_PENDING_MAX = 5;

const label = (p: Property) => `${TIER_LABEL[p.tier]} on ${p.street}, ${p.neighbourhood}`;

/** Why this home can't be given right now, or null. */
export function giftBlocker(me: Player, p: Property): string | null {
  if (p.ownerId !== me.id) return 'You don’t own that property.';
  if (p.mortgage) return 'It has a mortgage. Pay it off (or sell) before giving it away.';
  if (p.rentedOut) return 'It’s let to tenants. End the let before giving it away.';
  return null;
}

const giftsOf = (world: World) => (world.propertyGifts ??= {});

export function giftProperty(world: World, me: Player, propertyId: Id, toPlayerId: Id) {
  ensure(toPlayerId !== me.id, 'gift.self', 'Give it to someone else.');
  const to = world.players[toPlayerId];
  ensure(to && !to.ai, 'gift.player', 'You can only give a home to another player.');
  ensure(!to.handle.startsWith('former_'), 'gift.player', 'That player has left the game.');
  const p = getProperty(world, propertyId);
  const blocker = giftBlocker(me, p);
  ensure(!blocker, 'gift.blocked', blocker ?? '');
  const open = Object.values(world.propertyGifts ?? {}).filter((g) => g.status === 'pending');
  ensure(
    !open.some((g) => g.propertyId === p.id),
    'gift.twice',
    'You’ve already offered that home.',
  );
  ensure(
    open.filter((g) => g.fromId === me.id).length < GIFTS_PENDING_MAX,
    'gift.cap',
    'Wait for answers to your other offers first.',
  );
  const m = getMarket(world, p.market);
  const id = newId(world, 'gift');
  giftsOf(world)[id] = {
    id,
    propertyId: p.id,
    fromId: me.id,
    toId: to.id,
    status: 'pending',
    month: m.month,
  };
  notify(world, to.id, {
    month: getMarket(world, to.market).month,
    kind: 'system',
    text: `${me.name} wants to give you a home: the ${label(p).toLowerCase()} in ${m.data.name}.`,
    ref: { kind: 'gift', id },
    from: me.id,
  });
  return {
    giftId: id,
    propertyId: p.id,
    value: priceOf(world, p),
    currency: m.data.currency,
    label: label(p),
    city: m.data.name,
    message: `You offered ${to.name} the ${label(p).toLowerCase()}.`,
  };
}

function pendingGift(world: World, giftId: Id): PropertyGift {
  const g = world.propertyGifts?.[giftId];
  ensure(g, 'gift.missing', 'We can’t find that gift.');
  ensure(g.status === 'pending', 'gift.done', 'That gift has already been answered.');
  return g;
}

export function acceptGift(world: World, me: Player, giftId: Id) {
  const g = pendingGift(world, giftId);
  ensure(g.toId === me.id, 'gift.missing', 'We can’t find that gift.');
  const from = world.players[g.fromId];
  const p = getProperty(world, g.propertyId);
  const m = getMarket(world, p.market);
  // Re-check: it may have been sold, mortgaged or let since the offer.
  const blocker = from ? giftBlocker(from, p) : 'The giver has left the game.';
  if (blocker) {
    g.status = 'cancelled';
    g.answeredMonth = m.month;
    return { giftId: g.id, accepted: false, message: `The gift fell through: ${blocker}` };
  }
  // The giver moves out if they lived there; no tenants (checked above).
  if (from!.residence?.propertyId === p.id) delete from!.residence;
  p.ownerId = me.id;
  p.bought = { price: priceOf(world, p), month: m.month };
  p.rentedOut = false;
  delete p.lastMonth;
  g.status = 'accepted';
  g.answeredMonth = m.month;
  achieve(world, me, 'life.property', 'First property', m.month);
  if (p.tier === 'mansion') achieve(world, me, 'life.mansion', 'A mansion of your own', m.month);
  notify(world, from!.id, {
    month: getMarket(world, from!.market).month,
    kind: 'system',
    text: `${me.name} accepted your gift: the ${label(p).toLowerCase()}.`,
    ref: { kind: 'gift', id: g.id },
    from: me.id,
  });
  return {
    giftId: g.id,
    accepted: true,
    propertyId: p.id,
    message: `The ${label(p).toLowerCase()} in ${m.data.name} is yours. A gift from ${from!.name}.`,
  };
}

/** The receiver says no thanks, or the giver takes the offer back. */
export function declineGift(world: World, me: Player, giftId: Id) {
  const g = pendingGift(world, giftId);
  ensure(g.toId === me.id || g.fromId === me.id, 'gift.missing', 'We can’t find that gift.');
  const p = world.properties?.[g.propertyId];
  const m = p ? getMarket(world, p.market) : getMarket(world, me.market);
  const mine = g.fromId === me.id;
  g.status = mine ? 'cancelled' : 'declined';
  g.answeredMonth = m.month;
  notify(world, mine ? g.toId : g.fromId, {
    month: m.month,
    kind: 'system',
    text: mine
      ? `${me.name} took back their offer of a home.`
      : `${me.name} declined your gift of a home.`,
    ref: { kind: 'gift', id: g.id },
    from: me.id,
  });
  return { giftId: g.id, message: mine ? 'Offer withdrawn.' : 'You declined the gift.' };
}

/** `me.propertyGifts`: offers you made or received that are still waiting, and recent answers. */
export function giftsView(world: World, p: Player) {
  const name = (id: Id) => world.players[id]?.name ?? '';
  return Object.values(world.propertyGifts ?? {})
    .filter((g) => g.fromId === p.id || g.toId === p.id)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, 20)
    .map((g) => {
      const x = world.properties?.[g.propertyId];
      return {
        id: g.id,
        propertyId: g.propertyId,
        from: { id: g.fromId, name: name(g.fromId) },
        to: { id: g.toId, name: name(g.toId) },
        status: g.status,
        mine: g.fromId === p.id,
        label: x ? label(x) : '',
        market: x?.market ?? null,
        value: x ? priceOf(world, x) : 0,
        currency: x ? getMarket(world, x.market).data.currency : null,
      };
    });
}

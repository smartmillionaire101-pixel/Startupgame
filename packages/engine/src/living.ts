import type { World, Player, Id } from './types.js';
import type { MarketId } from './data/markets.js';
import { ensure } from './errors.js';
import { locationOf } from './helpers.js';
import { newId } from './ids.js';
import { buyFurniture } from './shop.js';
import { canVisitHome } from './play.js';
import { bumpNeed } from './needs.js';
import type { Command } from './commands.js';
import { skyViewById } from './data/sky-views.js';
import { unpackOrder, vanOf, type OnlineOrder, type Van } from './catalog.js';
import { gameplayOn } from './releases.js';
import type { ChosenOptions } from './data/catalog.js';
export interface Delivery {
  id: Id;
  owner: Id;
  market: MarketId;
  label: string;
  /** Shop note: online orders add parcels, cars and walls. */
  kind: 'food' | 'furniture' | 'parcel' | 'car' | 'wall';
  orderedAt: number;
  arrivesAt: number;
  unpackedBy: Id[];
  complete: boolean;
  item?: { slot: string; itemId: string; paid: number; finish?: string; warranty?: string };
  /** Shop note: an online order (catalog.ts): what's in it, the delivery fee and speed. */
  order?: OnlineOrder;
  /** Round 7: the van it rides in with the rest of its order (catalog.ts `Van`). */
  van?: Id;
}
export interface DateSession {
  id: Id;
  host: Id;
  guest: Id;
  market: MarketId;
  location: 'home' | 'london-eye' | 'cable-car' | 'rooftop' | 'sky-view';
  /** Wave 12: the sky view (data/sky-views.ts) a date above the city is on. */
  viewId?: string;
  status: 'invited' | 'together' | 'ended';
  createdAt: number;
  handRequest: Id | null;
  holdingHands: boolean;
  reactions: { by: Id; action: 'compliment' | 'flirt' | 'laugh' | 'point'; at: number }[];
}
export function queueDelivery(
  w: World,
  p: Player,
  label: string,
  kind: Delivery['kind'],
  now: number,
  item?: Delivery['item'],
  van?: Van,
  order?: OnlineOrder,
) {
  ensure(
    locationOf(p) === p.market,
    'delivery.home',
    'Order home deliveries when you are in your home city.',
  );
  const list = (w.deliveries ??= {});
  // Waiting vans (a delivery on its own is a van); joining one on its way takes no room.
  ensure(
    !!van?.id ||
      new Set(
        Object.values(list)
          .filter((d) => d.owner === p.id && !d.complete)
          .map(vanOf),
      ).size < 8,
    'delivery.limit',
    'Unpack your waiting deliveries before ordering more.',
  );
  const id = newId(w, 'delivery');
  if (van) {
    van.id ??= id;
    van.ids.push(id);
  }
  list[id] = {
    id,
    owner: p.id,
    market: locationOf(p),
    label,
    kind,
    orderedAt: now,
    arrivesAt: now + 30_000,
    unpackedBy: [],
    complete: false,
    ...(item ? { item } : {}),
    ...(order ? { order } : {}),
    ...(van ? { van: van.id! } : {}),
  };
  return id;
}
export function orderFurniture(
  w: World,
  p: Player,
  itemId: string,
  now: number,
  businessId?: Id,
  /** Shop note: the catalogue's options (a finish, a warranty), priced in. */
  options?: ChosenOptions,
  van?: Van,
) {
  const prior = p.home?.items.map((i) => ({ ...i })) ?? [];
  const result = buyFurniture(w, p, itemId, businessId, options ? { options } : {});
  const item = p.home!.items.find((i) => i.itemId === itemId)!;
  ensure(
    !Object.values(w.deliveries ?? {}).some(
      (d) => d.owner === p.id && !d.complete && d.item?.slot === item.slot,
    ),
    'delivery.slot',
    'A delivery for this furniture slot is already on its way.',
  );
  const id = queueDelivery(w, p, itemId, 'furniture', now, { ...item }, van);
  p.home!.items = prior.filter((i) => i.slot !== item.slot);
  return {
    ...result,
    id,
    message:
      'Order paid. Your delivery van will arrive in 30 seconds. Unpack at home to install it.',
  };
}
export function livingCommand(
  w: World,
  p: Player,
  c: Extract<Command, { type: `living.${string}` }>,
  now: number,
) {
  if (c.type === 'living.collect') {
    const d = w.deliveries?.[c.deliveryId];
    ensure(d && !d.complete, 'delivery.missing', 'That delivery is already unpacked or missing.');
    // Round 7: "Unpack all" empties the whole van.
    if (c.all) {
      ensure(gameplayOn(w), 'command.unknown', 'Unknown command.');
      return unpackVan(w, p, d, now);
    }
    return collectOne(w, p, d, now, true);
  }
  if (c.type === 'living.date.invite') {
    const guest = w.players[c.playerId];
    ensure(guest && !guest.ai && guest.id !== p.id, 'date.person', 'Choose another human player.');
    ensure(locationOf(guest) === locationOf(p), 'date.city', 'You need to be in the same city.');
    ensure(
      c.location !== 'london-eye' || locationOf(p) === 'london',
      'date.place',
      'The London Eye is in London.',
    );
    const view = c.viewId ? skyViewById(c.viewId) : undefined;
    ensure(
      !c.viewId || (view && view.market === locationOf(p)),
      'date.place',
      'Choose a sky view in this city.',
    );
    ensure(c.location !== 'sky-view' || view, 'date.place', 'Choose which view to share.');
    if (c.location === 'home')
      ensure(canVisitHome(w, guest, p.id), 'date.home', 'Invite them to your home first.');
    const dates = (w.dates ??= {});
    ensure(
      !Object.values(dates).some(
        (d) =>
          d.status !== 'ended' &&
          now - d.createdAt < 3_600_000 &&
          [d.host, d.guest].some((id) => id === p.id || id === guest.id),
      ),
      'date.busy',
      'One of you already has a date invitation or date in progress.',
    );
    const id = newId(w, 'date');
    dates[id] = {
      id,
      host: p.id,
      guest: guest.id,
      market: locationOf(p),
      location: c.location,
      ...(view && c.location !== 'home' ? { viewId: view.id } : {}),
      status: 'invited',
      createdAt: now,
      handRequest: null,
      holdingHands: false,
      reactions: [],
    };
    return { id };
  }
  const d = w.dates?.[c.dateId];
  ensure(d && [d.host, d.guest].includes(p.id), 'date.missing', 'This is not your date.');
  if (c.type === 'living.date.end') {
    d.status = 'ended';
    d.holdingHands = false;
    d.handRequest = null;
    return { ok: true };
  }
  ensure(
    now - d.createdAt < 3_600_000,
    'date.expired',
    'This date has expired. Start a new invitation.',
  );
  ensure(locationOf(p) === d.market, 'date.city', 'Return to the date’s city first.');
  if (c.type === 'living.date.accept') {
    ensure(
      d.guest === p.id && d.status === 'invited',
      'date.invite',
      'Only the invited player can accept.',
    );
    d.status = 'together';
    return { ok: true };
  }
  ensure(d.status === 'together', 'date.wait', 'Wait for your partner to accept.');
  if (c.type === 'living.date.gesture') {
    ensure(
      !d.reactions.length || now - d.reactions[d.reactions.length - 1]!.at >= 1500,
      'date.slow',
      'Give your partner a moment to respond.',
    );
    d.reactions.push({ by: p.id, action: c.action, at: now });
    d.reactions = d.reactions.slice(-12);
    bumpNeed(p, 'social', 2);
    return { ok: true };
  }
  if (c.type === 'living.date.hands') {
    if (c.accept) {
      ensure(
        d.handRequest !== null && d.handRequest !== p.id,
        'date.consent',
        'Wait for your partner to offer their hand.',
      );
      d.holdingHands = true;
      d.handRequest = null;
    } else {
      const wasHolding = d.holdingHands;
      d.holdingHands = false;
      d.handRequest = wasHolding || (d.handRequest && d.handRequest !== p.id) ? null : p.id;
    }
    return { ok: true };
  }
  return { ok: true };
}
/** Unpack (or help unpack) one delivery; `lift`: the social lift of carrying it in. */
function collectOne(w: World, p: Player, d: Delivery, now: number, lift: boolean) {
  ensure(
    canVisitHome(w, p, d.owner) && locationOf(p) === d.market,
    'delivery.access',
    'You must be at this home or an invited guest.',
  );
  ensure(now >= d.arrivesAt, 'delivery.wait', 'The van is still on its way.');
  ensure(
    !d.unpackedBy.includes(p.id),
    'delivery.help',
    'You have already helped with this delivery.',
  );
  d.unpackedBy.push(p.id);
  // Every player can unload a parcel; the owner or a visiting friend can install it.
  const owner = w.players[d.owner]!;
  if (d.item) {
    const home = (owner.home ??= { items: [] });
    home.items = home.items.filter((i) => i.slot !== d.item!.slot);
    home.items.push({ ...d.item } as (typeof home.items)[number]);
  }
  if (d.kind === 'food') bumpNeed(owner, 'hunger', 35);
  const unpacked = d.order ? unpackOrder(w, owner, d) : null;
  if (lift) bumpNeed(p, 'social', 8);
  d.complete = true;
  return {
    ...(unpacked ?? {}),
    message:
      p.id === d.owner
        ? (unpacked?.message ?? 'Delivered and unpacked.')
        : 'You helped your friend unpack. Thank you!',
  };
}

/**
 * Round 7: unpack every thing in a van at once (the ones that are in, not
 * unpacked yet): each as one `living.collect` would, the social lift once.
 */
function unpackVan(w: World, p: Player, first: Delivery, now: number) {
  const van = vanOf(first);
  const ds = Object.values(w.deliveries ?? {})
    .filter((d) => vanOf(d) === van && d.owner === first.owner && !d.complete)
    .sort((a, z) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0));
  // One trip out to the van: the social lift once, not once a thing.
  const results = ds.map((d, i) => ({ deliveryId: d.id, ...collectOne(w, p, d, now, i === 0) }));
  const mine = p.id === first.owner;
  return {
    van,
    unpacked: results,
    message: mine
      ? `Unpacked ${ds.length} ${ds.length === 1 ? 'thing' : 'things'}.`
      : 'You helped your friend unpack. Thank you!',
  };
}

export function livingView(w: World, p: Player) {
  return {
    deliveries: Object.values(w.deliveries ?? {})
      .filter((d) => canVisitHome(w, p, d.owner))
      .slice(-40),
    dates: Object.values(w.dates ?? {})
      .filter((d) => [d.host, d.guest].includes(p.id))
      .slice(-10)
      .map((d) => ({
        ...d,
        hostName: w.players[d.host]?.name ?? 'Former player',
        guestName: w.players[d.guest]?.name ?? 'Former player',
      })),
    people: Object.values(w.players)
      .filter(
        (x) =>
          !x.ai &&
          x.id !== p.id &&
          locationOf(x) === locationOf(p) &&
          !x.handle.startsWith('former_'),
      )
      .map((x) => ({ id: x.id, name: x.name })),
  };
}

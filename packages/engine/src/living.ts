import type { World, Player, Id } from './types.js';
import type { MarketId } from './data/markets.js';
import { ensure } from './errors.js';
import { locationOf } from './helpers.js';
import { newId } from './ids.js';
import { buyFurniture } from './shop.js';
import { canVisitHome } from './play.js';
import { bumpNeed } from './needs.js';
import type { Command } from './commands.js';
export interface Delivery {
  id: Id;
  owner: Id;
  market: MarketId;
  label: string;
  kind: 'food' | 'furniture';
  orderedAt: number;
  arrivesAt: number;
  unpackedBy: Id[];
  complete: boolean;
  item?: { slot: string; itemId: string; paid: number };
}
export interface DateSession {
  id: Id;
  host: Id;
  guest: Id;
  market: MarketId;
  location: 'home' | 'london-eye' | 'cable-car' | 'rooftop';
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
) {
  ensure(
    locationOf(p) === p.market,
    'delivery.home',
    'Order home deliveries when you are in your home city.',
  );
  const list = (w.deliveries ??= {});
  ensure(
    Object.values(list).filter((d) => d.owner === p.id && !d.complete).length < 8,
    'delivery.limit',
    'Unpack your waiting deliveries before ordering more.',
  );
  const id = newId(w, 'delivery');
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
  };
  return id;
}
export function orderFurniture(w: World, p: Player, itemId: string, now: number, businessId?: Id) {
  const prior = p.home?.items.map((i) => ({ ...i })) ?? [];
  const result = buyFurniture(w, p, itemId, businessId);
  const item = p.home!.items.find((i) => i.itemId === itemId)!;
  ensure(
    !Object.values(w.deliveries ?? {}).some(
      (d) => d.owner === p.id && !d.complete && d.item?.slot === item.slot,
    ),
    'delivery.slot',
    'A delivery for this furniture slot is already on its way.',
  );
  const id = queueDelivery(w, p, itemId, 'furniture', now, { ...item });
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
    bumpNeed(p, 'social', 8);
    d.complete = true;
    return {
      message:
        p.id === d.owner ? 'Delivered and unpacked.' : 'You helped your friend unpack. Thank you!',
    };
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

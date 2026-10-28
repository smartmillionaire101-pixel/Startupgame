/**
 * Round 7 (GAMEPLAY_NOTE; player feedback: "I can't select more than one",
 * "every item comes in its own van"): a basket is one order, and one order
 * is one van.
 *
 * - `shop.order` takes the basket's lines: furniture with a quantity (the
 *   first goes in its slot unless it's the one you have, the rest are more
 *   of it: any furniture but built-ins, homestyle.ts extraSlotsOf), a mall thing, a wall with a
 *   quantity. Each line is bought as its own command would (the same
 *   prices, tills and checks), all or nothing.
 * - Online (`delivery` set) everything rides in one van (catalog.ts `Van`)
 *   that arrives with its slowest thing and charges its dearest delivery
 *   fee once. Without `delivery` it's the furniture shop's van home (30
 *   seconds, no fee: home.order), from Buy mode or a showroom.
 * - More of a thing you have comes in the van too (`order.extra`), and is
 *   yours once unpacked; one in the slot on its way counts as had.
 * - `living.collect` with `all` unpacks the whole van (living.ts).
 *
 * Deterministic: ids from the world's counter, no RNG. Unknown before the note.
 */
import {
  slotCategory,
  type ChosenOptions,
  type DeliverySpeed,
  type WallKind,
} from './data/catalog.js';
import { EXTRAS_MAX, EXTRAS_PER_SLOT } from './data/home-style.js';
import { extraSlotsOf } from './homestyle.js';
import { SHOP_KINDS_FOR_SLOT, furnitureLabel } from './data/lifestyle-shop.js';
import {
  buyWall,
  dispatchOrder,
  feeFor,
  newVan,
  orderFurnitureOnline,
  orderMallOnline,
  sealVan,
  type OnlineOrder,
  type Van,
} from './catalog.js';
import { ensure } from './errors.js';
import { col, getMarket } from './helpers.js';
import { newId } from './ids.js';
import { account, transfer } from './ledger.js';
import { orderFurniture, queueDelivery, type Delivery } from './living.js';
import { formatMoney, scale } from './money.js';
import { atHome, furnitureIn, storeAccount } from './shop.js';
import type { Id, Player, World } from './types.js';

export type OrderLine =
  | { kind: 'furniture'; itemId: string; qty: number; options?: ChosenOptions }
  | { kind: 'mall'; itemId: string; colour?: string; options?: ChosenOptions }
  | { kind: 'wall'; wall: WallKind; length: number; qty: number; options?: ChosenOptions };

/** Most things in one order. */
export const ORDER_MAX = 24;

const waiting = (w: World, p: Player): Delivery[] =>
  Object.values(w.deliveries ?? {}).filter((d) => d.owner === p.id && !d.complete);

/**
 * Another of a thing (its slot's one first: had, or on its way), in the van:
 * online with a delivery fee, or the shop's van home.
 */
export function orderExtra(
  w: World,
  p: Player,
  itemId: string,
  now: number,
  o: { speed?: DeliverySpeed; van: Van },
) {
  if (!o.speed) atHome(p);
  const f = furnitureIn(w, itemId);
  ensure(f, 'home.item', 'That isn’t in the catalogue.');
  ensure(extraSlotsOf(w).includes(f.slot), 'home.extra', 'A home has just the one of those.');
  const coming = waiting(w, p);
  ensure(
    (p.home?.items ?? []).some((x) => x.slot === f.slot) ||
      coming.some((d) => d.item?.slot === f.slot),
    'home.extra',
    'Get the first one, then add more.',
  );
  const more = [...(p.homeExtras ?? []), ...coming.flatMap((d) => d.order?.extra ?? [])];
  ensure(
    more.filter((x) => x.slot === f.slot).length < EXTRAS_PER_SLOT,
    'home.extra.max',
    `Up to ${EXTRAS_PER_SLOT + 1} of those in a home.`,
  );
  ensure(more.length < EXTRAS_MAX, 'home.extra.max', 'Your home is full of things already.');
  const m = getMarket(w, p.market);
  const price = scale(col(m), f.priceCol);
  const label = furnitureLabel(f, m.id);
  const category = slotCategory(f.slot);
  const fee = o.speed ? feeFor(m, category, price, o.speed) : 0;
  ensure(
    account(w, p.accounts.local).balance >= price + fee,
    'home.funds',
    `That costs ${formatMoney(price + fee, m.data.currency)}; you don’t have it.`,
  );
  const store = storeAccount(m, SHOP_KINDS_FOR_SLOT[f.slot]);
  transfer(
    w,
    p.accounts.local,
    store?.account ?? m.ext.suppliers,
    price,
    `${label} (another)${store ? ` from ${store.name}` : ''}`,
    m.month,
  );
  const extra = { id: newId(w, 'extra'), slot: f.slot, itemId: f.id, paid: price };
  const order: OnlineOrder = { category, speed: o.speed ?? 'standard', price, fee, extra };
  if (o.speed) {
    // Through the courier, as any online order (the van's fee once).
    const r = dispatchOrder(w, p, m, now, itemId, 'furniture', order, undefined, o.van);
    return { extra, price, ...r, fee: order.fee };
  }
  const id = queueDelivery(w, p, itemId, 'furniture', now, undefined, o.van, order);
  return { extra, price, id, fee: 0 };
}

/** `shop.order`: the basket, bought at once and delivered in one van. */
export function shopOrder(
  w: World,
  p: Player,
  lines: readonly OrderLine[],
  o: { speed?: DeliverySpeed; businessId?: Id },
  now: number,
) {
  ensure(lines.length > 0, 'shop.order', 'Your basket is empty.');
  const things = lines.reduce((n, l) => n + (l.kind === 'mall' ? 1 : l.qty), 0);
  ensure(things <= ORDER_MAX, 'shop.order', `Up to ${ORDER_MAX} things in one order.`);
  const van = newVan();
  let price = 0;
  for (const line of lines) {
    if (line.kind === 'mall') {
      ensure(o.speed, 'shop.order', 'Order it online, or buy it at the mall.');
      const r = orderMallOnline(w, p, line.itemId, o.speed, now, line.colour, line.options, van);
      price += r.price;
      continue;
    }
    if (line.kind === 'wall') {
      for (let q = 0; q < line.qty; q++) {
        const r = buyWall(w, p, line.wall, line.length, now, {
          ...(line.options ? { options: line.options } : {}),
          ...(o.businessId ? { businessId: o.businessId } : {}),
          ...(o.speed ? { speed: o.speed } : {}),
          van,
        });
        price += r.price;
      }
      continue;
    }
    const f = furnitureIn(w, line.itemId);
    ensure(f, 'home.item', 'That isn’t in the catalogue.');
    // The first goes in its slot, unless it's the one you have (or have coming).
    const had =
      (p.home?.items ?? []).some((x) => x.itemId === f.id) ||
      waiting(w, p).some((d) => d.item?.itemId === f.id);
    for (let q = 0; q < line.qty; q++) {
      if (q === 0 && !had) {
        const r = o.speed
          ? orderFurnitureOnline(w, p, f.id, o.speed, now, line.options, van)
          : orderFurniture(w, p, f.id, now, o.businessId, line.options, van);
        price += r.price;
      } else {
        const r = orderExtra(w, p, f.id, now, { ...(o.speed ? { speed: o.speed } : {}), van });
        price += r.price;
      }
    }
  }
  const arrivesAt = van.ids.length ? sealVan(w, van) : null;
  const m = getMarket(w, p.market);
  return {
    van: van.id,
    deliveries: [...van.ids],
    things,
    price,
    fee: van.fee,
    arrivesAt,
    message: van.ids.length
      ? `Ordered: ${things} ${things === 1 ? 'thing' : 'things'}, ${formatMoney(price + van.fee, m.data.currency)}. One van brings it all.`
      : `Bought: ${things} ${things === 1 ? 'thing' : 'things'}, ${formatMoney(price, m.data.currency)}.`,
  };
}

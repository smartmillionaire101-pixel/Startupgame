/**
 * Shopping online, the catalogue's prices and walls for your home (SHOP_NOTE;
 * data/catalog.ts has the entries, options and delivery terms).
 *
 * - Online orders reuse the shops' own purchases: `home.order`, `mall.buy`
 *   and `car.buy` with `delivery` set ('standard' or 'express'), and
 *   `home.wall.buy`. The price is the shop's (the same base price and the
 *   same options as in person) and goes to the same till; a delivery fee goes
 *   to the city's courier depot (else the suppliers). What you bought waits
 *   in a delivery (living.ts) until it's at your door, and you unpack it
 *   at home (`living.collect`). You can order from anywhere: it's delivered
 *   to your home, in your home city's money.
 * - In person stays instant and free. Things you do there (the food court,
 *   a film, the arcade) aren't sold online, and trying clothes on (you wear
 *   them out of the shop, and it's fun) and shopping with a friend stay
 *   in-person things: an online top goes in your wardrobe when it arrives.
 * - Walls and dividers (`home.wall.buy`, `home.wall.place`,
 *   `home.wall.remove`): bought at a furniture store or online, placed along
 *   the floor grid's tile edges (the client checks the floor plan; the engine
 *   keeps them from overlapping each other), turned, moved, taken down to
 *   storage or sold back. Rooms can be named (`home.room.label`).
 */
import {
  CATALOG_ENTRIES,
  DELIVERY_TERMS,
  EXPRESS_FEE,
  ROOM_LABELS_MAX,
  WALLS,
  WALLS_MAX,
  WALL_LENGTHS,
  WALL_SELL_BACK,
  WALL_SHOP_KINDS,
  deliveryFee,
  deliveryMs,
  groupsFor,
  inPersonOnly,
  mallGroups,
  priceWithOptions,
  slotCategory,
  type CatalogCategory,
  type ChosenOptions,
  type DeliverySpeed,
  type WallKind,
} from './data/catalog.js';
import { MALL_ITEMS, PHONE_NAMES, mallItem, wearable, type MallItem } from './data/leisure.js';
import { carModel, carsFor, furnitureItem, type FurnitureSlot } from './data/lifestyle-shop.js';
import type { MarketId } from './data/markets.js';
import { businessesOf, isOpen } from './economy.js';
import { ensure } from './errors.js';
import { col, getMarket, locationOf } from './helpers.js';
import { newId } from './ids.js';
import { account, transfer } from './ledger.js';
import { applyBars, barsApply } from './lifebars.js';
import { barsOfItem, consume, keepThing, mallPrice, mallSells, mallTill } from './leisure.js';
import type { Delivery } from './living.js';
import { formatMoney, scale } from './money.js';
import { atHome, buyFurniture, showroom, storeAccount } from './shop.js';
import type { HomeWall, Id, MarketState, Player, PlayerCar, World } from './types.js';
import { addToWardrobe, ownedToWear } from './wardrobe.js';

/** What an online order carries until it's unpacked. */
export interface OnlineOrder {
  category: CatalogCategory;
  speed: DeliverySpeed;
  /** What you paid for it and for the delivery (home currency, minor units). */
  price: number;
  fee: number;
  options?: ChosenOptions;
  /** A mall thing (a top in `colour`). */
  mall?: { item: string; colour?: string };
  car?: PlayerCar;
  wall?: HomeWall;
}

/** Most deliveries waiting for you at once (as living.ts). */
const DELIVERIES_MAX = 8;

const pendingOf = (w: World, p: Player): Delivery[] =>
  Object.values(w.deliveries ?? {}).filter((d) => d.owner === p.id && !d.complete);

/** The city's courier depot (open, lowest id first): it takes the delivery fee. */
function courierOf(m: MarketState): { account: Id; name: string } | null {
  const b = Object.values(businessesOf(m))
    .filter((x) => x.kind === 'courier-depot' && isOpen(x))
    .sort((a, z) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0];
  return b ? { account: b.account, name: b.name } : null;
}

/** The delivery fee here for a thing of this price. */
export function feeFor(
  m: MarketState,
  category: CatalogCategory,
  price: number,
  speed: DeliverySpeed,
) {
  return deliveryFee(category, price, scale(col(m), DELIVERY_TERMS[category].minCol), speed);
}

function fundsFor(w: World, p: Player, m: MarketState, total: number, what: string) {
  ensure(
    account(w, p.accounts.local).balance >= total,
    'shop.funds',
    `${what} costs ${formatMoney(total, m.data.currency)} with delivery; you don’t have it.`,
  );
}

function roomForOne(w: World, p: Player) {
  ensure(
    pendingOf(w, p).length < DELIVERIES_MAX,
    'delivery.limit',
    'Unpack your waiting deliveries before ordering more.',
  );
}

/** Pay the courier and put the order on its way (it arrives home). */
function dispatchOrder(
  w: World,
  p: Player,
  m: MarketState,
  now: number,
  label: string,
  kind: Delivery['kind'],
  order: OnlineOrder,
  item?: Delivery['item'],
) {
  const courier = courierOf(m);
  transfer(
    w,
    p.accounts.local,
    courier?.account ?? m.ext.suppliers,
    order.fee,
    `Delivery: ${label}${courier ? ` (${courier.name})` : ''}`,
    m.month,
  );
  const list = (w.deliveries ??= {});
  const id = newId(w, 'delivery');
  const arrivesAt = now + deliveryMs(order.category, order.speed);
  list[id] = {
    id,
    owner: p.id,
    market: p.market,
    label,
    kind,
    orderedAt: now,
    arrivesAt,
    unpackedBy: [],
    complete: false,
    ...(item ? { item } : {}),
    order,
  };
  return { id, arrivesAt };
}

const seconds = (ms: number) => Math.round(ms / 1000);

function arrives(order: OnlineOrder, m: MarketState) {
  const s = seconds(deliveryMs(order.category, order.speed));
  return `Ordered online. Delivery ${formatMoney(order.fee, m.data.currency)}, at your door in about ${s} seconds: unpack it at home.`;
}

// ---------------------------------------------------------------- Online orders

/** `home.order` online: the furniture store's price and till, delivered (the old one sold back now). */
export function orderFurnitureOnline(
  w: World,
  p: Player,
  itemId: string,
  speed: DeliverySpeed,
  now: number,
  options?: ChosenOptions,
) {
  const f = furnitureItem(itemId);
  ensure(f, 'home.item', 'That isn’t in the catalogue.');
  roomForOne(w, p);
  ensure(
    !pendingOf(w, p).some((d) => d.item?.slot === f.slot),
    'delivery.slot',
    'A delivery for this furniture slot is already on its way.',
  );
  const m = getMarket(w, p.market);
  const prior = p.home?.items.map((i) => ({ ...i })) ?? [];
  const r = buyFurniture(w, p, itemId, undefined, {
    online: true,
    ...(options ? { options } : {}),
  });
  const item = p.home!.items.find((i) => i.slot === f.slot)!;
  p.home!.items = prior.filter((i) => i.slot !== f.slot);
  const category = slotCategory(f.slot as FurnitureSlot);
  const order: OnlineOrder = {
    category,
    speed,
    price: r.price,
    fee: feeFor(m, category, r.price, speed),
    ...(options ? { options } : {}),
  };
  ensure(
    account(w, p.accounts.local).balance >= order.fee,
    'shop.funds',
    `The delivery costs ${formatMoney(order.fee, m.data.currency)}; you don’t have it.`,
  );
  const sent = dispatchOrder(w, p, m, now, itemId, 'furniture', order, { ...item });
  return { ...r, ...sent, fee: order.fee, online: true, message: arrives(order, m) };
}

/** `mall.buy` online: the mall shop's price and till, delivered home. */
export function orderMallOnline(
  w: World,
  p: Player,
  itemId: string,
  speed: DeliverySpeed,
  now: number,
  colour?: string,
  options?: ChosenOptions,
) {
  const x = mallItem(itemId);
  ensure(x && mallSells(w, x, p.market), 'mall.item', 'The mall doesn’t sell that.');
  ensure(
    !inPersonOnly(x),
    'shop.inperson',
    `${x.label}: that’s something you do there. Go in person.`,
  );
  if (x.furnitureId) return orderFurnitureOnline(w, p, x.furnitureId, speed, now, options);
  roomForOne(w, p);
  const m = getMarket(w, p.market);
  if (x.topStyle)
    ensure(colour && /^#[0-9a-fA-F]{6}$/.test(colour), 'mall.colour', 'Pick a colour.');
  const c = x.topStyle ? colour!.toLowerCase() : undefined;
  if (wearable(x) || x.worn)
    ensure(
      !ownedToWear(p).some((e) => e.item === x.id && (!x.topStyle || e.colour === c)),
      'mall.owned',
      'You have that already: wear it from your wardrobe.',
    );
  if (x.phone) {
    ensure(p.phone?.tier !== x.phone, 'mall.owned', 'That’s the phone you have.');
    ensure(
      !pendingOf(w, p).some((d) => d.order?.mall?.item === x.id),
      'delivery.slot',
      'That phone is already on its way.',
    );
  }
  const base = mallPrice(w, m, x);
  const { price, chosen } = priceWithOptions(base, mallGroups(x), options ?? {});
  const category = categoryOfMall(x);
  const fee = feeFor(m, category, price, speed);
  fundsFor(w, p, m, price + fee, x.label);
  const till = mallTill(m, x);
  transfer(
    w,
    p.accounts.local,
    till?.account ?? m.ext.suppliers,
    price,
    `${x.label} online${till ? ` (${till.name})` : ''}`,
    m.month,
  );
  const order: OnlineOrder = {
    category,
    speed,
    price,
    fee,
    options: chosen,
    mall: { item: x.id, ...(c ? { colour: c } : {}) },
  };
  const sent = dispatchOrder(w, p, m, now, x.id, 'parcel', order);
  return {
    item: x.id,
    shop: x.shop,
    price,
    ...sent,
    fee,
    online: true,
    message: arrives(order, m),
  };
}

function categoryOfMall(x: MallItem): CatalogCategory {
  return CATALOG_ENTRIES.find((e) => e.source === 'mall' && e.variants.some((v) => v.ref === x.id))!
    .category;
}

/** `car.buy` online: the dealer's price and till, delivered to your drive (kept with your others). */
export function orderCarOnline(
  w: World,
  p: Player,
  modelId: string,
  speed: DeliverySpeed,
  now: number,
  options?: ChosenOptions,
) {
  roomForOne(w, p);
  const m = getMarket(w, p.market);
  const model = carModel(m.id, modelId);
  ensure(model, 'car.model', 'That model isn’t sold here.');
  const garage = p.garage ?? (p.car ? [p.car] : []);
  const coming = pendingOf(w, p).filter((d) => d.order?.car);
  ensure(
    !garage.some((c) => c.modelId === model.id) &&
      !coming.some((d) => d.order!.car!.modelId === model.id),
    'car.owned',
    'That car is already in your garage.',
  );
  ensure(garage.length + coming.length < 8, 'car.capacity', 'Your garage holds up to eight cars.');
  const base = scale(col(m), model.priceCol);
  const { price, chosen } = priceWithOptions(base, groupsFor('car', model.id), options ?? {});
  const fee = feeFor(m, 'cars', price, speed);
  fundsFor(w, p, m, price + fee, model.label);
  const dealer = storeAccount(m, ['car-dealer', 'car-dealership']);
  transfer(
    w,
    p.accounts.local,
    dealer?.account ?? m.ext.suppliers,
    price,
    `${model.label} online${dealer ? ` (${dealer.name})` : ''}`,
    m.month,
  );
  const order: OnlineOrder = {
    category: 'cars',
    speed,
    price,
    fee,
    options: chosen,
    car: {
      modelId: model.id,
      paid: price,
      since: m.month,
      ...(chosen.paint ? { paint: chosen.paint } : {}),
      ...(chosen.trim ? { trim: chosen.trim } : {}),
    },
  };
  const sent = dispatchOrder(w, p, m, now, model.label, 'car', order);
  return {
    price,
    ...sent,
    fee,
    online: true,
    monthlyCost: scale(col(m), model.runningCol),
    message: arrives(order, m),
  };
}

// ---------------------------------------------------------------- Walls

function wallPrice(m: MarketState, kind: WallKind, len: number, options?: ChosenOptions) {
  const spec = WALLS[kind];
  ensure(spec, 'wall.kind', 'That isn’t in the catalogue.');
  ensure(
    (WALL_LENGTHS as readonly number[]).includes(len),
    'wall.length',
    'Walls come 1 to 4 metres long.',
  );
  return priceWithOptions(scale(col(m), spec.priceCol * len), [spec.finish], options ?? {});
}

/** `home.wall.buy`: at a furniture store (into your storage now) or online (delivered). */
export function buyWall(
  w: World,
  p: Player,
  kind: WallKind,
  len: number,
  now: number,
  o: { options?: ChosenOptions; businessId?: Id; speed?: DeliverySpeed },
) {
  const m = getMarket(w, p.market);
  const spec = WALLS[kind];
  const { price, chosen } = wallPrice(m, kind, len, o.options);
  const coming = pendingOf(w, p).filter((d) => d.order?.wall).length;
  ensure(
    (p.walls?.length ?? 0) + coming < WALLS_MAX,
    'wall.max',
    `A home holds up to ${WALLS_MAX} walls and dividers.`,
  );
  const label = `${spec.label} (${len} m)`;
  const wall: HomeWall = { id: newId(w, 'wall'), kind, len, finish: chosen.finish!, paid: price };
  if (o.speed) {
    roomForOne(w, p);
    const fee = feeFor(m, 'walls', price, o.speed);
    fundsFor(w, p, m, price + fee, label);
    const store = storeAccount(m, WALL_SHOP_KINDS);
    transfer(
      w,
      p.accounts.local,
      store?.account ?? m.ext.suppliers,
      price,
      `${label} online${store ? ` (${store.name})` : ''}`,
      m.month,
    );
    const order: OnlineOrder = {
      category: 'walls',
      speed: o.speed,
      price,
      fee,
      options: chosen,
      wall,
    };
    const sent = dispatchOrder(w, p, m, now, label, 'wall', order);
    return { wall, price, ...sent, fee, online: true, message: arrives(order, m) };
  }
  ensure(o.businessId, 'wall.shop', 'Buy it at a furniture store, or online.');
  const store = showroom(w, p, o.businessId, WALL_SHOP_KINDS, 'walls');
  atHome(p);
  ensure(
    account(w, p.accounts.local).balance >= price,
    'shop.funds',
    `That costs ${formatMoney(price, m.data.currency)}; you don’t have it.`,
  );
  transfer(w, p.accounts.local, store.account, price, `${label} from ${store.name}`, m.month);
  (p.walls ??= []).push(wall);
  return {
    wall,
    price,
    message: `${label}: ${formatMoney(price, m.data.currency)}. It’s at home: place it from Buy mode.`,
  };
}

/** The tile edges a wall covers ('h:x,y' / 'v:x,y'). */
export function wallEdgesOf(x: number, y: number, dir: 'h' | 'v', len: number): string[] {
  return Array.from({ length: len }, (_, i) =>
    dir === 'h' ? `h:${x + i},${y}` : `v:${x},${y + i}`,
  );
}

/** `home.wall.place`: put a wall up (or move it); it can't overlap another of yours. */
export function placeWall(
  p: Player,
  wallId: Id,
  floor: number,
  x: number,
  y: number,
  dir: 'h' | 'v',
) {
  const wall = p.walls?.find((v) => v.id === wallId);
  ensure(wall, 'wall.missing', 'That wall isn’t yours.');
  const mine = new Set(
    (p.walls ?? [])
      .filter((v) => v.id !== wallId && v.x !== undefined && (v.floor ?? 0) === floor)
      .flatMap((v) => wallEdgesOf(v.x!, v.y!, v.dir!, v.len)),
  );
  ensure(
    !wallEdgesOf(x, y, dir, wall.len).some((e) => mine.has(e)),
    'wall.overlap',
    'Another wall is already there.',
  );
  Object.assign(wall, { floor, x, y, dir });
  return { wall: { ...wall }, message: 'Wall placed.' };
}

/** `home.wall.remove`: take it down into storage, or sell it back (40%). */
export function removeWall(w: World, p: Player, wallId: Id, sell: boolean) {
  const wall = p.walls?.find((v) => v.id === wallId);
  ensure(wall, 'wall.missing', 'That wall isn’t yours.');
  if (!sell) {
    delete wall.floor;
    delete wall.x;
    delete wall.y;
    delete wall.dir;
    return { wall: { ...wall }, message: 'Taken down and put in storage.' };
  }
  const m = getMarket(w, p.market);
  const refund = Math.round(wall.paid * WALL_SELL_BACK);
  const label = WALLS[wall.kind].label;
  transfer(w, m.ext.suppliers, p.accounts.local, refund, `Sold: ${label}`, m.month);
  p.walls = p.walls!.filter((v) => v.id !== wallId);
  return {
    refund,
    message: `You sold the ${label.toLowerCase()} for ${formatMoney(refund, m.data.currency)}.`,
  };
}

/** `home.room.label`: name the room at a tile (an empty name clears it). */
export function labelRoom(p: Player, floor: number, x: number, y: number, label?: string) {
  const name = (label ?? '').replace(/\s+/g, ' ').trim();
  const rest = (p.roomLabels ?? []).filter((r) => !(r.floor === floor && r.x === x && r.y === y));
  if (name) {
    ensure(rest.length < ROOM_LABELS_MAX, 'room.max', `Up to ${ROOM_LABELS_MAX} room names.`);
    rest.push({ floor, x, y, label: name });
  }
  p.roomLabels = rest;
  return { rooms: rest.map((r) => ({ ...r })) };
}

// ---------------------------------------------------------------- Unpacking

/** An online order is unpacked at home: what it is goes where it belongs (the owner's). */
export function unpackOrder(w: World, owner: Player, d: Delivery) {
  const o = d.order!;
  const m = getMarket(w, owner.market);
  if (o.wall) {
    (owner.walls ??= []).push({ ...o.wall });
    return { wall: o.wall.id, message: 'Unpacked: place it from Buy mode at home.' };
  }
  if (o.car) {
    const garage = (owner.garage ??= owner.car ? [{ ...owner.car }] : []);
    if (!garage.some((c) => c.modelId === o.car!.modelId)) garage.push({ ...o.car });
    if (!owner.car) owner.car = { ...o.car };
    const label = carModel(m.id, o.car.modelId)?.label ?? 'car';
    return { car: o.car.modelId, message: `Your new ${label} is in the drive.` };
  }
  const x = o.mall ? mallItem(o.mall.item) : undefined;
  if (!x) return { message: 'Delivered and unpacked.' };
  if (wearable(x) || x.worn) {
    addToWardrobe(owner, x, m.month, o.mall!.colour);
    return {
      wardrobe: true,
      message: `${x.label}: in your wardrobe. Put it on from My purchases.`,
    };
  }
  if (x.phone) {
    owner.phone = { tier: x.phone, paid: o.price, month: m.month };
    return { phone: true, message: `Your ${PHONE_NAMES[x.phone]} is set up.` };
  }
  const effects = consume(owner, x);
  const bars = barsOfItem(x);
  if (bars && barsApply(w, owner)) applyBars(owner, bars);
  if (x.keep) keepThing(owner, x.id, m.month);
  return { effects, ...(x.keep ? { kept: true } : {}), message: `${x.label}: unpacked.` };
}

// ---------------------------------------------------------------- View

/**
 * `view.me.shop` (shop-note worlds; null before): the catalogue's prices in
 * your home city (online: delivered there), the cars sold there, and the
 * delivery terms. The client builds the catalogue from the engine's entries
 * (data/catalog.ts) and works out options and fees with the same functions.
 */
export function shopCatalogView(w: World, p: Player, market: MarketId = p.market) {
  const m = getMarket(w, market);
  const prices: Record<string, number> = {};
  for (const e of CATALOG_ENTRIES)
    for (const v of e.variants) {
      if (e.source === 'furniture') {
        const f = furnitureItem(v.ref);
        if (f) prices[v.ref] = scale(col(m), f.priceCol);
      } else if (e.source === 'mall') {
        const x = MALL_ITEMS.find((i) => i.id === v.ref);
        if (x && mallSells(w, x, m.id)) prices[v.ref] = mallPrice(w, m, x);
      } else if (e.source === 'wall')
        prices[`wall:${e.id.slice(5)}:${v.ref}`] = scale(
          col(m),
          WALLS[e.id.slice(5) as WallKind].priceCol * Number(v.ref),
        );
    }
  const cars = carsFor(m.id).map((c) => {
    prices[`car:${c.id}`] = scale(col(m), c.priceCol);
    return { id: c.id, label: c.label, monthlyCost: scale(col(m), c.runningCol) };
  });
  return {
    market: m.id,
    currency: m.data.currency,
    /** Online orders go to your home: here when you're home. */
    atHome: locationOf(p) === p.market,
    prices,
    cars,
    delivery: Object.fromEntries(
      Object.entries(DELIVERY_TERMS).map(([k, t]) => [
        k,
        {
          rate: t.rate,
          minFee: scale(col(m), t.minCol),
          standardS: t.standardS,
          expressS: t.expressS,
        },
      ]),
    ) as Record<
      CatalogCategory,
      { rate: number; minFee: number; standardS: number; expressS: number }
    >,
    expressFee: EXPRESS_FEE,
  };
}

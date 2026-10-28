/**
 * Home and car (Wave 5): furniture for your apartment and a car, bought with
 * money only (no hours) in your home city.
 *
 * Money flows: the price goes to an open furniture store or car dealership in
 * the city (or to the city's suppliers when none is open); what you get back
 * for the old item comes from the second-hand market (`ext.suppliers`). A
 * car's running costs (fuel, insurance, upkeep) go to the suppliers at each
 * settlement. Comfort (furniture) adds a little energy recovery; comfort, the
 * car and your lifestyle make a status score shown on your profile.
 */
import {
  CAR_SHOP_KINDS,
  FURNITURE,
  MAX_COMFORT_POINTS,
  SELL_BACK,
  SHOP_KINDS_FOR_SLOT,
  carModel,
  carsFor,
  furnitureItem,
  furnitureLabel,
  isRoomSlot,
  type FurnitureItem,
} from './data/lifestyle-shop.js';
import type { MarketId } from './data/markets.js';
import { groupsFor, priceWithOptions, type ChosenOptions } from './data/catalog.js';
import { ensure } from './errors.js';
import { getBusiness, isOpen } from './economy.js';
import { col, getMarket, locationOf, notify } from './helpers.js';
import { account, transfer, transferUpTo } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { gameplayOn } from './releases.js';
import type { Id, MarketState, Player, World } from './types.js';

/** Energy recovered a month with luxury furniture in every slot. */
export const MAX_COMFORT_ENERGY = 8;

/** The open business of one of these kinds that sells to you (lowest id first), if any. */
export function storeAccount(
  m: MarketState,
  kinds: readonly string[],
): { account: Id; name: string } | null {
  const b = Object.values(m.businesses ?? {})
    .filter((x) => kinds.includes(x.kind) && isOpen(x))
    .sort((a, z) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0];
  return b ? { account: b.account, name: b.name } : null;
}

/**
 * Wave 6: the showroom you're buying in. It must be open, in the city you're
 * in, and of a kind that sells this (`shop.kind`). Its till gets the money.
 */
export function showroom(
  world: World,
  me: Player,
  businessId: Id,
  kinds: readonly string[],
  what: string,
): { account: Id; name: string } {
  const b = getBusiness(world, businessId);
  ensure(isOpen(b), 'business.closed', `${b.name} has closed.`);
  ensure(b.market === locationOf(me), 'business.market', `${b.name} is in another city.`);
  ensure(kinds.includes(b.kind), 'shop.kind', `${b.name} doesn’t sell ${what}.`);
  return { account: b.account, name: b.name };
}

export function atHome(p: Player) {
  ensure(
    locationOf(p) === p.market,
    'shop.away',
    'The shop delivers to your home: buy it when you’re back.',
  );
}

/**
 * Shop note: the catalogue's options (a finish, a warranty) priced in; and
 * `online` (catalog.ts orders it for delivery): bought from anywhere, the
 * nearest store's till, delivered to your home.
 */
export interface BuyExtra {
  options?: ChosenOptions;
  online?: boolean;
}

/**
 * A catalogue item sold in this world: round 7's bathroom and hallway things
 * only with GAMEPLAY_NOTE (before it they aren't in the catalogue at all).
 */
export function furnitureIn(world: World, itemId: string): FurnitureItem | undefined {
  const f = furnitureItem(itemId);
  return f && (!isRoomSlot(f.slot) || gameplayOn(world)) ? f : undefined;
}

/** Buy a piece of furniture; the old one in that slot is sold back at 40%. */
export function buyFurniture(
  world: World,
  me: Player,
  itemId: string,
  businessId?: Id,
  extra: BuyExtra = {},
) {
  const item = furnitureIn(world, itemId);
  ensure(item, 'home.item', 'That isn’t in the catalogue.');
  const kinds = SHOP_KINDS_FOR_SLOT[item.slot];
  const chosen = businessId
    ? showroom(world, me, businessId, kinds, furnitureLabel(item, me.market).toLowerCase())
    : null;
  if (!extra.online) atHome(me);
  const m = getMarket(world, me.market);
  const label = furnitureLabel(item, m.id);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const base = scale(col(m), item.priceCol);
  const opts = extra.options
    ? priceWithOptions(base, groupsFor('furniture', item.id), extra.options)
    : null;
  const price = opts ? opts.price : base;
  const picked = opts
    ? {
        ...(opts.chosen.finish ? { finish: opts.chosen.finish } : {}),
        ...(opts.chosen.warranty ? { warranty: opts.chosen.warranty } : {}),
      }
    : {};
  const items = (me.home ??= { items: [] }).items;
  const old = items.find((x) => x.slot === item.slot);
  ensure(old?.itemId !== item.id, 'home.owned', 'You already have that.');
  const refund = old ? Math.round(old.paid * SELL_BACK.furniture) : 0;
  const oldItem = old ? furnitureItem(old.itemId) : undefined;
  const oldLabel = old ? (oldItem ? furnitureLabel(oldItem, m.id) : 'the old one') : null;
  if (refund > 0)
    transfer(world, m.ext.suppliers, me.accounts.local, refund, `Sold: ${oldLabel}`, m.month);
  ensure(
    account(world, me.accounts.local).balance >= price,
    'home.funds',
    `That costs ${fmt(price)}; you don’t have it.`,
  );
  const store = chosen ?? storeAccount(m, kinds);
  transfer(
    world,
    me.accounts.local,
    store?.account ?? m.ext.suppliers,
    price,
    `${label}${store ? ` from ${store.name}` : ''}`,
    m.month,
  );
  if (old) {
    old.itemId = item.id;
    old.paid = price;
    delete old.finish;
    delete old.warranty;
    Object.assign(old, picked);
  } else items.push({ slot: item.slot, itemId: item.id, paid: price, ...picked });
  return {
    price,
    refund,
    comfort: comfortOf(me),
    message: old
      ? `${label}: ${fmt(price)}. You sold ${oldLabel} for ${fmt(refund)}.`
      : `${label}: ${fmt(price)}. Home is getting comfier.`,
  };
}

/** Buy a car; the old one is sold back at 50%. */
export function buyCar(
  world: World,
  me: Player,
  modelId: string,
  businessId?: Id,
  keepCurrent = false,
  options?: ChosenOptions,
) {
  const chosen = businessId ? showroom(world, me, businessId, CAR_SHOP_KINDS, 'cars') : null;
  atHome(me);
  const m = getMarket(world, me.market);
  const model = carModel(m.id, modelId);
  ensure(model, 'car.model', 'That model isn’t sold here.');
  const garage = (me.garage ??= me.car ? [{ ...me.car }] : []);
  ensure(
    !garage.some((c) => c.modelId === model.id),
    'car.owned',
    'That car is already in your garage.',
  );
  ensure(!keepCurrent || garage.length < 8, 'car.capacity', 'Your garage holds up to eight cars.');
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const base = scale(col(m), model.priceCol);
  const opts = options ? priceWithOptions(base, groupsFor('car', model.id), options) : null;
  const price = opts ? opts.price : base;
  const refund = me.car && !keepCurrent ? Math.round(me.car.paid * SELL_BACK.car) : 0;
  const oldLabel = me.car ? (carModel(m.id, me.car.modelId)?.label ?? 'your old car') : null;
  if (refund > 0)
    transfer(world, m.ext.suppliers, me.accounts.local, refund, `Sold: ${oldLabel}`, m.month);
  ensure(
    account(world, me.accounts.local).balance >= price,
    'car.funds',
    `That costs ${fmt(price)}; you don’t have it.`,
  );
  const dealer = chosen ?? storeAccount(m, CAR_SHOP_KINDS);
  transfer(
    world,
    me.accounts.local,
    dealer?.account ?? m.ext.suppliers,
    price,
    `${model.label}${dealer ? ` from ${dealer.name}` : ''}`,
    m.month,
  );
  if (!keepCurrent && me.car) me.garage = garage.filter((c) => c.modelId !== me.car!.modelId);
  me.car = {
    modelId: model.id,
    paid: price,
    since: m.month,
    ...(opts?.chosen.paint ? { paint: opts.chosen.paint } : {}),
    ...(opts?.chosen.trim ? { trim: opts.chosen.trim } : {}),
  };
  me.garage!.push({ ...me.car });
  return {
    price,
    refund,
    monthlyCost: scale(col(m), model.runningCol),
    message:
      oldLabel && !keepCurrent
        ? `${model.label}: ${fmt(price)}. You sold ${oldLabel} for ${fmt(refund)}.`
        : `${model.label}: ${fmt(price)}. Driving around your city is free now (fuel is in the running costs).`,
  };
}

/** Sell your car back at 50% of what you paid. */
export function sellCar(world: World, me: Player) {
  ensure(me.car, 'car.none', 'You don’t have a car.');
  const m = getMarket(world, me.market);
  const label = carModel(m.id, me.car.modelId)?.label ?? 'your car';
  const refund = Math.round(me.car.paid * SELL_BACK.car);
  transfer(world, m.ext.suppliers, me.accounts.local, refund, `Sold: ${label}`, m.month);
  me.garage = (me.garage ?? []).filter((c) => c.modelId !== me.car!.modelId);
  if (me.garage.length) me.car = { ...me.garage[0]! };
  else delete me.car;
  return { refund, message: `You sold ${label} for ${formatMoney(refund, m.data.currency)}.` };
}

/** Month-end: fuel, insurance and upkeep. */
export function settleCar(world: World, p: Player, month: number) {
  if (!p.car) return;
  const m = getMarket(world, p.market);
  const model = carModel(m.id, p.car.modelId);
  if (!model) return;
  const due = (p.garage ?? [p.car]).reduce(
    (n, car) => n + scale(col(m), carModel(m.id, car.modelId)?.runningCol ?? 0),
    0,
  );
  const paid = transferUpTo(
    world,
    p.accounts.local,
    m.ext.suppliers,
    due,
    'Car running costs',
    month,
  );
  if (paid < due)
    notify(world, p.id, {
      month,
      kind: 'warning',
      text: `You couldn’t cover your car’s running costs (${formatMoney(due, m.data.currency)}). Sell it if money is tight.`,
    });
}

// ---------------------------------------------------------------- Comfort and status

/**
 * 0–100: furniture quality across all the slots (the best home is 100 however
 * many there are). Round 7's bathroom and hallway things add on top, up to 100.
 */
function comfortOf(p: Player): number {
  const points = (p.home?.items ?? []).reduce(
    (a, x) => a + (furnitureItem(x.itemId)?.comfort ?? 0),
    0,
  );
  return Math.min(100, Math.round((100 * points) / MAX_COMFORT_POINTS));
}

/** Extra energy recovered each month from a comfortable home. */
export const comfortEnergy = (p: Player) => Math.round((comfortOf(p) / 100) * MAX_COMFORT_ENERGY);

/** 0–100: home comfort, the car you drive and how you live. Shown on your profile. */
export function statusOf(p: Player): number {
  const car = p.car ? (carModel(p.market, p.car.modelId)?.status ?? 0) : 0;
  return clamp(
    Math.round(comfortOf(p) * 0.4 + (car / 15) * 40 + clamp(p.lifestyleTier, 1, 5) * 4),
    0,
    100,
  );
}

// ---------------------------------------------------------------- Views

/** `view.me.home`. */
export function homeView(p: Player) {
  return {
    items: (p.home?.items ?? []).flatMap((x) => {
      const f = furnitureItem(x.itemId);
      return f
        ? [
            {
              slot: f.slot,
              itemId: f.id,
              label: furnitureLabel(f, p.market),
              tier: f.tier,
              ...(x.finish ? { finish: x.finish } : {}),
            },
          ]
        : [];
    }),
    comfort: comfortOf(p),
    /** Shop note: walls and dividers (placed, or in storage without x), and room names. */
    ...(p.walls?.length ? { walls: p.walls.map((v) => ({ ...v })) } : {}),
    ...(p.roomLabels?.length ? { rooms: p.roomLabels.map((r) => ({ ...r })) } : {}),
  };
}

/** `view.me.car`. */
export function carView(world: World, p: Player) {
  if (!p.car) return null;
  const m = world.markets[p.market];
  const model = m ? carModel(m.id, p.car.modelId) : undefined;
  if (!m || !model) return null;
  return { modelId: model.id, label: model.label, monthlyCost: scale(col(m), model.runningCol) };
}

/** `view.here.shop`: furniture and cars with prices in this city's currency (minor units). */
export function shopView(world: World, m: MarketState) {
  const rooms = gameplayOn(world);
  return {
    furniture: FURNITURE.filter((f) => rooms || !isRoomSlot(f.slot)).map((f) => ({
      id: f.id,
      slot: f.slot,
      label: furnitureLabel(f, m.id),
      /** Wave 6: the business kinds whose showrooms sell it. */
      soldBy: SHOP_KINDS_FOR_SLOT[f.slot],
      tier: f.tier,
      price: scale(col(m), f.priceCol),
      comfort: f.comfort,
    })),
    cars: carsFor(m.id as MarketId).map((c) => ({
      id: c.id,
      label: c.label,
      price: scale(col(m), c.priceCol),
      monthlyCost: scale(col(m), c.runningCol),
      status: c.status,
    })),
  };
}

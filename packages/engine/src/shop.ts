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
  FURNITURE,
  MAX_COMFORT_POINTS,
  SELL_BACK,
  carModel,
  carsFor,
  furnitureItem,
} from './data/lifestyle-shop.js';
import type { MarketId } from './data/markets.js';
import { ensure } from './errors.js';
import { isOpen } from './economy.js';
import { col, getMarket, locationOf, notify } from './helpers.js';
import { account, transfer, transferUpTo } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import type { Id, MarketState, Player, World } from './types.js';

/** Energy recovered a month with luxury furniture in every slot. */
export const MAX_COMFORT_ENERGY = 8;

/** The open business of this kind that sells to you (lowest id first), if any. */
function storeAccount(m: MarketState, kind: string): { account: Id; name: string } | null {
  const b = Object.values(m.businesses ?? {})
    .filter((x) => x.kind === kind && isOpen(x))
    .sort((a, z) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0];
  return b ? { account: b.account, name: b.name } : null;
}

function atHome(p: Player) {
  ensure(
    locationOf(p) === p.market,
    'shop.away',
    'The shop delivers to your home: buy it when you’re back.',
  );
}

/** Buy a piece of furniture; the old one in that slot is sold back at 40%. */
export function buyFurniture(world: World, me: Player, itemId: string) {
  const item = furnitureItem(itemId);
  ensure(item, 'home.item', 'That isn’t in the catalogue.');
  atHome(me);
  const m = getMarket(world, me.market);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const price = scale(col(m), item.priceCol);
  const items = (me.home ??= { items: [] }).items;
  const old = items.find((x) => x.slot === item.slot);
  ensure(old?.itemId !== item.id, 'home.owned', 'You already have that.');
  const refund = old ? Math.round(old.paid * SELL_BACK.furniture) : 0;
  const oldLabel = old ? (furnitureItem(old.itemId)?.label ?? 'the old one') : null;
  if (refund > 0)
    transfer(world, m.ext.suppliers, me.accounts.local, refund, `Sold: ${oldLabel}`, m.month);
  ensure(
    account(world, me.accounts.local).balance >= price,
    'home.funds',
    `That costs ${fmt(price)}; you don’t have it.`,
  );
  const store = storeAccount(m, 'furniture-store');
  transfer(
    world,
    me.accounts.local,
    store?.account ?? m.ext.suppliers,
    price,
    `${item.label}${store ? ` from ${store.name}` : ''}`,
    m.month,
  );
  if (old) {
    old.itemId = item.id;
    old.paid = price;
  } else items.push({ slot: item.slot, itemId: item.id, paid: price });
  return {
    price,
    refund,
    comfort: comfortOf(me),
    message: old
      ? `${item.label}: ${fmt(price)}. You sold ${oldLabel} for ${fmt(refund)}.`
      : `${item.label}: ${fmt(price)}. Home is getting comfier.`,
  };
}

/** Buy a car; the old one is sold back at 50%. */
export function buyCar(world: World, me: Player, modelId: string) {
  atHome(me);
  const m = getMarket(world, me.market);
  const model = carModel(m.id, modelId);
  ensure(model, 'car.model', 'That model isn’t sold here.');
  ensure(me.car?.modelId !== model.id, 'car.owned', 'You already drive one.');
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const price = scale(col(m), model.priceCol);
  const refund = me.car ? Math.round(me.car.paid * SELL_BACK.car) : 0;
  const oldLabel = me.car ? (carModel(m.id, me.car.modelId)?.label ?? 'your old car') : null;
  if (refund > 0)
    transfer(world, m.ext.suppliers, me.accounts.local, refund, `Sold: ${oldLabel}`, m.month);
  ensure(
    account(world, me.accounts.local).balance >= price,
    'car.funds',
    `That costs ${fmt(price)}; you don’t have it.`,
  );
  const dealer = storeAccount(m, 'car-dealership');
  transfer(
    world,
    me.accounts.local,
    dealer?.account ?? m.ext.suppliers,
    price,
    `${model.label}${dealer ? ` from ${dealer.name}` : ''}`,
    m.month,
  );
  me.car = { modelId: model.id, paid: price, since: m.month };
  return {
    price,
    refund,
    monthlyCost: scale(col(m), model.runningCol),
    message: oldLabel
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
  delete me.car;
  return { refund, message: `You sold ${label} for ${formatMoney(refund, m.data.currency)}.` };
}

/** Month-end: fuel, insurance and upkeep. */
export function settleCar(world: World, p: Player, month: number) {
  if (!p.car) return;
  const m = getMarket(world, p.market);
  const model = carModel(m.id, p.car.modelId);
  if (!model) return;
  const due = scale(col(m), model.runningCol);
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

/** 0–100: furniture quality across the nine slots. */
export function comfortOf(p: Player): number {
  const points = (p.home?.items ?? []).reduce(
    (a, x) => a + (furnitureItem(x.itemId)?.comfort ?? 0),
    0,
  );
  return Math.round((100 * points) / MAX_COMFORT_POINTS);
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
      return f ? [{ slot: f.slot, itemId: f.id, label: f.label, tier: f.tier }] : [];
    }),
    comfort: comfortOf(p),
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
export function shopView(m: MarketState) {
  return {
    furniture: FURNITURE.map((f) => ({
      id: f.id,
      slot: f.slot,
      label: f.label,
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

/**
 * Buy mode at home (the feedback round, `feedbackOn`): what the things you
 * own do for you, and your rooms' floors and walls.
 *
 * - Owning a thing softens the monthly fall of the needs it lifts
 *   (`settleHomeBoosts`, after `decayNeeds`): its boost points (its tier)
 *   times `BOOST_SETTLE.needPerPoint`, capped per need; energy things add a
 *   little recovery, calming things (plants, art, power you can count on)
 *   take stress off.
 * - Using it (`home.act`) adds its boost points times `BOOST_ACT_PER_POINT`
 *   to what the act already moves (`actBoost`): a king bed rests you more
 *   than a bed frame, a chef's kitchen feeds you more than a hotplate.
 * - Floors and wall paint (`home.finish`): the everyday finishes are free;
 *   the rest are paid once (to the city's furniture store, through the
 *   ledger), then yours for any room. 'default' puts a room's own floor back.
 *
 * Worlds without the note play exactly as before: comfort is all a thing
 * does (shop.ts), and `home.finish` is unknown. Deterministic: no RNG.
 */
import { FURNITURE_SLOTS, furnitureItem } from './data/lifestyle-shop.js';
import {
  ACT_SLOTS,
  BOOST_ACT_PER_POINT,
  BOOST_KEYS,
  BOOST_SETTLE,
  FLOOR_FINISHES,
  SLOT_BOOSTS,
  WALL_FINISHES,
  finishSpec,
  type BoostKey,
  type FinishSurface,
} from './data/home-style.js';
import { WALL_SHOP_KINDS } from './data/catalog.js';
import { ensure } from './errors.js';
import { col, getMarket } from './helpers.js';
import { account, transfer } from './ledger.js';
import { bumpEnergy, bumpStress } from './lifebars.js';
import { formatMoney, scale } from './money.js';
import { HOME_ACTS, NEED_KEYS, bumpNeed, type HomeActId, type NeedKey } from './needs.js';
import { lifeBarsOn } from './releases.js';
import { atHome, storeAccount } from './shop.js';
import type { Player, World } from './types.js';

export type Boosts = Partial<Record<BoostKey, number>>;

/** What a catalogue item ('sofa-2') lifts: each of its slot's needs by its tier. */
export function boostsOf(itemId: string): Boosts {
  const f = furnitureItem(itemId);
  if (!f) return {};
  return Object.fromEntries(SLOT_BOOSTS[f.slot].map((k) => [k, f.tier]));
}

/** Every catalogue item's boosts (for the view). */
export function allBoosts(): Record<string, Boosts> {
  const out: Record<string, Boosts> = {};
  for (const slot of FURNITURE_SLOTS)
    for (const t of [1, 2, 3]) out[`${slot}-${t}`] = boostsOf(`${slot}-${t}`);
  return out;
}

/** The boost points of everything you own, per need. */
export function ownedBoosts(p: Player): Record<BoostKey, number> {
  const out = Object.fromEntries(BOOST_KEYS.map((k) => [k, 0])) as Record<BoostKey, number>;
  for (const x of p.home?.items ?? [])
    for (const [k, v] of Object.entries(boostsOf(x.itemId))) out[k as BoostKey] += v;
  return out;
}

const isNeed = (k: string): k is NeedKey => (NEED_KEYS as readonly string[]).includes(k);

/**
 * Month end (after the needs fall): what you own gives some of it back.
 * Returns what was applied. Callers gate on `feedbackOn`; AI players skip.
 */
export function settleHomeBoosts(world: World, p: Player): Boosts {
  const pts = ownedBoosts(p);
  const S = BOOST_SETTLE;
  const out: Boosts = {};
  for (const k of NEED_KEYS)
    if (pts[k] > 0) out[k] = bumpNeed(p, k, Math.min(S.needCap, pts[k] * S.needPerPoint));
  if (pts.energy > 0)
    out.energy = bumpEnergy(p, Math.min(S.energyCap, pts.energy * S.energyPerPoint));
  if (pts.mood > 0 && lifeBarsOn(world))
    out.mood = -bumpStress(p, Math.max(S.moodStressCap, pts.mood * S.moodStressPerPoint));
  return out;
}

/**
 * Using things at home: the slots an act uses add their boost points (times
 * `BOOST_ACT_PER_POINT`) to the needs the act already moves, and calming
 * things take a little stress off. Mutates; returns what was added.
 */
export function actBoost(world: World, p: Player, act: HomeActId | 'invite'): Boosts {
  const slots = ACT_SLOTS[act];
  if (!slots) return {};
  // Having someone over is social and fun (needs.ts `homeInvite`).
  const spec: Partial<Record<NeedKey | 'energy', number>> =
    act === 'invite' ? { social: 1, fun: 1 } : HOME_ACTS[act];
  const owned = new Map((p.home?.items ?? []).map((x) => [x.slot, x.itemId]));
  const pts: Boosts = {};
  for (const slot of slots) {
    const id = owned.get(slot);
    if (!id) continue;
    for (const [k, v] of Object.entries(boostsOf(id)))
      pts[k as BoostKey] = (pts[k as BoostKey] ?? 0) + v;
  }
  const out: Boosts = {};
  for (const [k, v] of Object.entries(pts) as [BoostKey, number][]) {
    const by = v * BOOST_ACT_PER_POINT;
    if (isNeed(k) && (spec[k] ?? 0) > 0) out[k] = bumpNeed(p, k, by);
    else if (k === 'energy' && (spec.energy ?? 0) > 0) out.energy = bumpEnergy(p, by);
    else if (k === 'mood' && lifeBarsOn(world)) out.mood = -bumpStress(p, -v);
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0));
}

// ---------------------------------------------------------------- Finishes

/** A room's key: its floor of the home and its id ('0:living'). */
export const roomKey = (floor: number, room: string) => `${floor}:${room}`;

/** `home.finish`: a floor for a room, or paint for the walls (free when it's yours). */
export function homeFinish(
  world: World,
  me: Player,
  surface: FinishSurface,
  finish: string,
  floor: number,
  room?: string,
) {
  atHome(me);
  const m = getMarket(world, me.market);
  ensure(surface === 'wall' || !!room, 'home.finish', 'Pick a room for the floor.');
  const style = (me.homeStyle ??= {});
  const key = surface === 'floor' ? roomKey(floor, room!) : '';
  if (finish === 'default') {
    if (surface === 'floor' && style.floors) delete style.floors[key];
    else if (surface === 'wall') delete style.wall;
    return { price: 0, message: 'Back to how it was.' };
  }
  const spec = finishSpec(surface, finish);
  ensure(spec, 'home.finish', 'That finish isn’t in the catalogue.');
  const own = `${surface}:${spec.id}`;
  const owned = style.owned ?? [];
  const price = spec.priceCol > 0 && !owned.includes(own) ? scale(col(m), spec.priceCol) : 0;
  if (price > 0) {
    ensure(
      account(world, me.accounts.local).balance >= price,
      'home.funds',
      `That costs ${formatMoney(price, m.data.currency)}; you don’t have it.`,
    );
    const store = storeAccount(m, WALL_SHOP_KINDS);
    transfer(
      world,
      me.accounts.local,
      store?.account ?? m.ext.suppliers,
      price,
      `${spec.label}${store ? ` from ${store.name}` : ''}`,
      m.month,
    );
    style.owned = [...owned, own];
  }
  if (surface === 'floor') (style.floors ??= {})[key] = spec.id;
  else style.wall = spec.id;
  return {
    price,
    message: price
      ? `${spec.label}: ${formatMoney(price, m.data.currency)}. It’s yours for any room now.`
      : `${spec.label}: done.`,
  };
}

/** `view.me.homeStyle` (the feedback round; null before). */
export function homeStyleView(world: World, p: Player) {
  const m = getMarket(world, p.market);
  const owned = new Set(p.homeStyle?.owned ?? []);
  const row = (surface: FinishSurface) => (f: (typeof FLOOR_FINISHES)[number]) => ({
    id: f.id,
    label: f.label,
    ...(f.swatch ? { swatch: f.swatch } : {}),
    /** 0 when it's free or yours already. */
    price: f.priceCol > 0 && !owned.has(`${surface}:${f.id}`) ? scale(col(m), f.priceCol) : 0,
    owned: f.priceCol === 0 || owned.has(`${surface}:${f.id}`),
  });
  return {
    /** Catalogue item id → the needs it lifts (points). */
    boosts: allBoosts(),
    /** What you own lifts, per need (points). */
    owned: ownedBoosts(p),
    floors: FLOOR_FINISHES.map(row('floor')),
    walls: WALL_FINISHES.map(row('wall')),
    /** Your rooms' floors ('0:living' → 'marble') and your walls' paint. */
    chosen: {
      floors: { ...(p.homeStyle?.floors ?? {}) },
      wall: p.homeStyle?.wall ?? null,
    },
  };
}

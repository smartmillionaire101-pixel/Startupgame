/**
 * Golf and the mall (data/leisure.ts).
 *
 * - `golf.round`: you play the city's three holes in the golf scene (the
 *   client runs the shots); the engine takes the scorecard. The green fee
 *   goes to the city's golf club (its till, when it's open; else the city's
 *   suppliers), the round takes hours and energy, and it's fun, calming and
 *   social: on the first rounds of a month you may get talking with an
 *   investor or a founder on the course (a roll on its own RNG stream).
 * - `mall.buy`: one thing from one of the mall's shops. Clothes change your
 *   look (`Player.appearance`), a phone is a cosmetic upgrade, furniture and
 *   electronics go into your home (the lifestyle shop's `buyFurniture`), food
 *   feeds you and a film is fun. Money goes to the till of a matching open
 *   business in the city (the mall's branch of it), else the suppliers.
 *   The bigger mall (data/mall.ts) adds ten shops and things you keep (in
 *   your bag), sold once the investor release note is logged; shopping
 *   with a friend is malltrips.ts. With that note, everything you wear is
 *   kept in your wardrobe (wardrobe.ts) to put on again free, and shoes,
 *   watches, jewellery and bags go on you when you buy them.
 *
 * Replay: both commands are new and the fields they write (`golf`, `phone`)
 * are optional, so a logged world without them replays exactly as before.
 */
import { appearanceSeed, defaultAppearance, type Appearance } from './appearance.js';
import {
  GOLF,
  MALL_ITEMS,
  MALL_SHOPS,
  MALL_SHOPS_FIRST,
  MALL_TILLS,
  MALL_TRIP,
  PHONE_NAMES,
  forWardrobe,
  giftable,
  golfCourse,
  mallItem,
  wearable,
  type MallItem,
} from './data/leisure.js';
import { furnitureItem, furnitureLabel } from './data/lifestyle-shop.js';
import { mallGroups, priceWithOptions, type ChosenOptions } from './data/catalog.js';
import { ensure } from './errors.js';
import { addContact } from './events.js';
import { businessesOf, isOpen } from './economy.js';
import { col, getMarket, hoursLeft, locationOf, usdToLocal } from './helpers.js';
import { investorOn } from './releases.js';
import { account, costIn, payExact } from './ledger.js';
import { bumpEnergy } from './lifebars.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { bumpNeed, needsOf } from './needs.js';
import { NPC_POOL, npcPerson } from './people.js';
import { deriveRng } from './rng.js';
import { buyFurniture } from './shop.js';
import type { Id, MarketState, Player, World } from './types.js';
import { addToWardrobe, ownedToWear } from './wardrobe.js';

/** The open business of one of these kinds (lowest id first), if any. */
function tillOf(m: MarketState, pick: (kind: string) => boolean) {
  return (
    Object.values(businessesOf(m))
      .filter((b) => isOpen(b) && pick(b.kind))
      .sort((a, z) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0] ?? null
  );
}

function pay(world: World, me: Player, m: MarketState, price: number, to: Id, memo: string) {
  const mine = account(world, me.accounts.local);
  ensure(
    mine.balance >= costIn(world, price, m.data.currency, mine.currency),
    'leisure.funds',
    `That costs ${formatMoney(price, m.data.currency)}; you don’t have it.`,
  );
  payExact(world, me.accounts.local, to, price, memo, m.month);
}
/** Pay a mall till from your personal account (refused if you can't cover it). */
export const payAtMall = pay;

// ---------------------------------------------------------------- Golf

/** The city's golf club (its open till), if it has one: the venue for a golf match. */
export const golfClubOf = (m: MarketState) => tillOf(m, (k) => k === 'golf-club');
/** The green fee for the course here (three holes, or any part of them). */
export const golfFee = (m: MarketState) => scale(col(m), GOLF.feeCol);

/** What a round costs here, and the course. */
export function golfView(world: World, me: Player) {
  const m = getMarket(world, locationOf(me));
  const course = golfCourse(m.id);
  const club = tillOf(m, (k) => k === 'golf-club');
  return {
    ...course,
    fee: scale(col(m), GOLF.feeCol),
    currency: m.data.currency,
    hours: GOLF.hours,
    clubId: club?.id ?? null,
    you: me.golf
      ? {
          rounds: me.golf.rounds,
          best: me.golf.best,
          last: me.golf.last,
        }
      : null,
  };
}

export function golfRound(world: World, me: Player, strokes: readonly number[]) {
  const m = getMarket(world, locationOf(me));
  const course = golfCourse(m.id);
  ensure(
    strokes.length === course.holes.length,
    'golf.card',
    `Hand in a score for each of the ${course.holes.length} holes.`,
  );
  ensure(
    hoursLeft(me) >= GOLF.hours,
    'golf.hours',
    `Three holes take ${GOLF.hours} hours; you don’t have them this month.`,
  );
  const card = strokes.map((s) => clamp(Math.round(s), 1, GOLF.maxStrokes));
  const total = card.reduce((a, b) => a + b, 0);
  const vsPar = total - course.par;
  const fee = scale(col(m), GOLF.feeCol);
  const club = tillOf(m, (k) => k === 'golf-club');
  pay(
    world,
    me,
    m,
    fee,
    club?.account ?? m.ext.suppliers,
    `Green fee, ${course.holes.length} holes at ${club?.name ?? course.name}`,
  );
  me.hours.used += GOLF.hours;
  const energy = Math.round(bumpEnergy(me, GOLF.energy));
  const fun = bumpNeed(me, 'fun', GOLF.fun + (vsPar <= 0 ? 4 : 0));
  const social = bumpNeed(me, 'social', GOLF.social);

  // Your record (a skill you build up: the client steadies your aim with it).
  const thisMonth = me.golf?.month === m.month ? me.golf.thisMonth : 0;
  const best = me.golf ? Math.min(me.golf.best, vsPar) : vsPar;
  me.golf = {
    rounds: (me.golf?.rounds ?? 0) + 1,
    best,
    last: { market: m.id, strokes: card, par: course.par, month: m.month },
    month: m.month,
    thisMonth: thisMonth + 1,
  };

  // Who you get talking with on the course.
  let met: { name: string; role: string; kind: string; refId: Id } | null = null;
  if (thisMonth < GOLF.meetRoundsPerMonth) {
    const rng = deriveRng(world.seed, 'golf', me.id, m.id, m.month, thisMonth);
    if (rng.chance(GOLF.meetChance)) {
      const funds = Object.values(world.funds)
        .filter((f) => f.market === m.id)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const founders = Object.values(world.players)
        .filter(
          (p) =>
            p.ai &&
            p.id !== me.id &&
            locationOf(p) === m.id &&
            p.companyIds.some((id) => world.companies[id]?.status === 'active'),
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const roll = rng.next();
      if (roll < 0.5 && funds.length) {
        const f = rng.pick(funds);
        const angel = f.angelId ? world.players[f.angelId] : undefined;
        const who = angel?.name ?? f.partner;
        met = { name: who, role: `Investor, ${f.name}`, kind: 'fund', refId: f.id };
        addContact(
          me,
          { kind: 'fund', refId: f.id, name: `${who}, ${f.name}`, warmth: GOLF.meetWarmth },
          m.month,
        );
      } else if (roll < 0.8 && founders.length) {
        const p = rng.pick(founders);
        const co = p.companyIds
          .map((id) => world.companies[id])
          .find((c) => c?.status === 'active');
        met = { name: p.name, role: `Founder, ${co?.name ?? ''}`, kind: 'founder', refId: p.id };
        addContact(
          me,
          {
            kind: 'founder',
            refId: p.id,
            name: co ? `${p.name}, ${co.name}` : p.name,
            warmth: GOLF.meetWarmth,
          },
          m.month,
        );
      } else {
        const p = npcPerson(m.id, rng.int(0, NPC_POOL - 1));
        met = { name: p.name, role: p.role, kind: 'local', refId: p.id };
        addContact(
          me,
          { kind: 'local', refId: p.id, name: `${p.name}, ${p.role}`, warmth: GOLF.meetWarmth },
          m.month,
        );
      }
      me.network = Math.min(100, me.network + 1);
    }
  }
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const score = vsPar === 0 ? 'level par' : vsPar < 0 ? `${-vsPar} under par` : `${vsPar} over par`;
  return {
    strokes: card,
    total,
    par: course.par,
    vsPar,
    fee,
    hours: GOLF.hours,
    energy,
    effects: { fun, social },
    needs: needsOf(me),
    best,
    rounds: me.golf.rounds,
    met,
    /** Stress the round eases (applied with the life bars). */
    barsFx: { stress: GOLF.stress + (vsPar <= 0 ? GOLF.goodRoundStress : 0) },
    message: `${course.holes.length} holes at ${course.name}: ${total} (${score}). Green fee ${fmt(fee)}.${met ? ` You got talking with ${met.name}.` : ''}`,
  };
}

// ---------------------------------------------------------------- The mall

/** A price as a shop tags it: two significant figures (₦18,400 → ₦18,000). */
function tagPrice(minor: number): number {
  const major = minor / 100;
  if (major < 10) return Math.max(1, Math.round(minor));
  const step = 10 ** (Math.floor(Math.log10(major)) - 1);
  return Math.round(major / step) * step * 100;
}

/**
 * What an item costs here. The first shops' items as they always did (the
 * cost of living); the bigger mall's tagged like a shop would, imported goods
 * at least their dollar price at the day's rate.
 */
export function mallPrice(world: World, m: MarketState, x: MallItem): number {
  const f = x.furnitureId ? furnitureItem(x.furnitureId) : undefined;
  const base = scale(col(m), f ? f.priceCol : x.priceCol);
  if (!x.more) return base;
  return tagPrice(Math.max(base, x.usd ? usdToLocal(world, m, x.usd) : 0));
}

/** Whether this world's mall sells it (the bigger mall's items once its note is logged). */
export const mallSells = (world: World, x: MallItem) => !x.more || investorOn(world);

/** The till a mall shop's sale goes to (its open business here), if any. */
export function mallTill(m: MarketState, x: MallItem) {
  return x.shop === 'foodcourt'
    ? tillOf(m, (k) => FOOD_KINDS.has(k))
    : x.shop === 'home'
      ? null
      : tillOf(m, (k) => MALL_TILLS[x.shop as keyof typeof MALL_TILLS].includes(k));
}

/** Put a thing in someone's bag (the oldest go when it's full). */
export function keepThing(p: Player, item: string, month: number, from?: Id) {
  const bag = (p.belongings ??= []);
  bag.push({ item, month, ...(from ? { from } : {}) });
  if (bag.length > MALL_TRIP.bagMax) bag.splice(0, bag.length - MALL_TRIP.bagMax);
}

/** The mall's shops and prices in the city you're in. */
export function mallView(world: World, me: Player) {
  const m = getMarket(world, locationOf(me));
  const on = investorOn(world);
  const items = [];
  // What you own to wear (a top: by colour), so the shop offers it free.
  const mine = on ? ownedToWear(me) : [];
  for (const x of MALL_ITEMS) {
    if (!mallSells(world, x)) continue;
    const f = x.furnitureId ? furnitureItem(x.furnitureId) : undefined;
    if (x.furnitureId && !f) continue;
    items.push({
      id: x.id,
      shop: x.shop,
      label: f ? furnitureLabel(f, m.id) : x.label,
      price: mallPrice(world, m, x),
      ...(x.topStyle ? { topStyle: x.topStyle } : {}),
      ...(x.headwear ? { headwear: x.headwear } : {}),
      ...(x.glasses ? { glasses: x.glasses } : {}),
      ...(x.phone ? { phone: x.phone } : {}),
      ...(f ? { furniture: f.id, slot: f.slot, tier: f.tier } : {}),
      ...(x.keep ? { keep: x.keep } : {}),
      ...(x.worn ? { worn: x.worn } : {}),
      ...(on && forWardrobe(x) && mine.some((e) => e.item === x.id) ? { have: true } : {}),
      ...(on && x.topStyle && mine.some((e) => e.item === x.id)
        ? {
            haveColours: mine
              .filter((e) => e.item === x.id && e.colour)
              .map((e) => e.colour as string),
          }
        : {}),
      ...(x.hunger ? { hunger: x.hunger } : {}),
      ...(x.fun ? { fun: x.fun } : {}),
      ...(x.energy ? { energy: x.energy } : {}),
      ...(x.hygiene ? { hygiene: x.hygiene } : {}),
      ...(x.health ? { health: x.health } : {}),
      ...(x.stress ? { stress: x.stress } : {}),
      ...(x.hours ? { hours: x.hours } : {}),
      ...(x.usd ? { imported: true } : {}),
      ...(on && giftable(x) ? { gift: true } : {}),
      owned: f
        ? !!me.home?.items.some((h) => h.itemId === f.id)
        : x.phone
          ? me.phone?.tier === x.phone
          : false,
    });
  }
  const label = (id: string) => mallItem(id)?.label ?? id;
  return {
    /** The wardrobe is open: wear what you own free (`wardrobe.wear`). */
    ...(on ? { wardrobe: true } : {}),
    currency: m.data.currency,
    /** The shops open here (the bigger mall's once its note is logged). */
    shops: on ? MALL_SHOPS : MALL_SHOPS_FIRST,
    /** Furniture is delivered home: only from a mall in your home city. */
    delivers: locationOf(me) === me.market,
    phone: me.phone ? { ...me.phone, name: PHONE_NAMES[me.phone.tier] } : null,
    items,
    /** What you keep from the mall (newest first), and who gave it to you. */
    bag: [...(me.belongings ?? [])].reverse().map((b) => ({
      item: b.item,
      label: label(b.item),
      kind: mallItem(b.item)?.keep ?? null,
      month: b.month,
      from: b.from ? { id: b.from, name: world.players[b.from]?.name ?? '' } : null,
    })),
  };
}

export function mallBuy(
  world: World,
  me: Player,
  itemId: string,
  colour?: string,
  now = 0,
  /** Shop note: the catalogue's options (a fabric, a brand …), priced in. */
  options?: ChosenOptions,
) {
  const x = mallItem(itemId);
  ensure(x && mallSells(world, x), 'mall.item', 'The mall doesn’t sell that.');
  const m = getMarket(world, locationOf(me));
  const fmt = (v: number) => formatMoney(v, m.data.currency);

  // Furniture and electronics for your home: the lifestyle shop does it (a
  // furniture or electronics store's till, the old item sold back).
  if (x.furnitureId) {
    const r = buyFurniture(world, me, x.furnitureId, undefined, options ? { options } : {});
    return { ...r, item: x.id, shop: x.shop, home: true };
  }

  const till = mallTill(m, x);
  const base = mallPrice(world, m, x);
  const price = options ? priceWithOptions(base, mallGroups(x), options).price : base;
  const memo = `${x.label} at the mall${till ? ` (${till.name})` : ''}`;

  // Clothes and accessories: your look changes (and everyone sees it).
  if (wearable(x)) {
    const next = wearing(me, x, colour);
    pay(world, me, m, price, till?.account ?? m.ext.suppliers, memo);
    me.appearance = next;
    me.appearanceAt = now;
    // Yours to wear again, free (in this colour).
    if (investorOn(world)) addToWardrobe(me, x, m.month, colour);
    const fun = bumpNeed(me, 'fun', 3);
    return {
      item: x.id,
      shop: x.shop,
      price,
      appearance: next,
      effects: { fun },
      message: `${x.label}: ${fmt(price)}. You’re wearing it.`,
    };
  }

  if (x.phone) {
    ensure(me.phone?.tier !== x.phone, 'mall.owned', 'That’s the phone you have.');
    pay(world, me, m, price, till?.account ?? m.ext.suppliers, memo);
    me.phone = { tier: x.phone, paid: price, month: m.month };
    return {
      item: x.id,
      shop: x.shop,
      price,
      phone: { ...me.phone, name: PHONE_NAMES[x.phone] },
      message: `${x.label}: ${fmt(price)}. New phone, who dis?`,
    };
  }

  // Food, groceries and films; the bigger mall's things you keep.
  if (x.hours)
    ensure(
      hoursLeft(me) >= x.hours,
      'mall.hours',
      `That takes ${x.hours} hours; you don’t have them this month.`,
    );
  pay(world, me, m, price, till?.account ?? m.ext.suppliers, memo);
  if (x.hours) me.hours.used += x.hours;
  const fx = consume(me, x);
  // Shoes, a watch, jewellery, a bag: into your wardrobe, and on you.
  const worn = !!x.worn && investorOn(world);
  if (worn) {
    addToWardrobe(me, x, m.month);
    me.appearance = wearing(me, x, undefined, false);
    me.appearanceAt = now;
  } else if (x.keep) keepThing(me, x.id, m.month);
  const bars = barsOfItem(x);
  return {
    item: x.id,
    shop: x.shop,
    price,
    effects: fx,
    needs: needsOf(me),
    ...(x.keep ? { kept: true } : {}),
    ...(worn ? { appearance: me.appearance, wardrobe: true } : {}),
    ...(bars ? { barsFx: bars } : {}),
    message: worn ? `${x.label}: ${fmt(price)}. You’re wearing it.` : `${x.label}: ${fmt(price)}.`,
  };
}

/**
 * What wearing a thing does to someone's look (refused if they wear it
 * already, unless `strict` is false: a second pair of the shoes you have on).
 */
export function wearing(p: Player, x: MallItem, colour?: string, strict = true): Appearance {
  const was: Appearance = p.appearance ?? defaultAppearance(appearanceSeed(p), p.gender);
  const next: Appearance = { ...was };
  if (x.topStyle) {
    ensure(colour && /^#[0-9a-fA-F]{6}$/.test(colour), 'mall.colour', 'Pick a colour.');
    next.topStyle = x.topStyle;
    next.topColor = colour.toLowerCase();
  }
  if (x.headwear) next.headwear = x.headwear;
  if (x.glasses) next.glasses = x.glasses;
  if (x.worn) (next as unknown as Record<string, string>)[x.worn.slot] = x.worn.style;
  ensure(
    !strict || JSON.stringify(next) !== JSON.stringify(was),
    'mall.owned',
    'You’re already wearing that.',
  );
  return next;
}

/** Food, a film, a toothbrush: someone's needs move (hunger, fun, energy, hygiene). */
export function consume(p: Player, x: MallItem) {
  const hunger = x.hunger ? bumpNeed(p, 'hunger', x.hunger) : 0;
  const fun = x.fun ? bumpNeed(p, 'fun', x.fun) : 0;
  const energy = x.energy ? Math.round(bumpEnergy(p, x.energy)) : 0;
  return {
    hunger,
    fun,
    energy,
    ...(x.hygiene ? { hygiene: bumpNeed(p, 'hygiene', x.hygiene) } : {}),
  };
}

/** Life bars an item moves (applied with the bars, when they're on). */
export function barsOfItem(x: MallItem): { stress?: number; health?: number } | null {
  if (!x.stress && !x.health) return null;
  return { ...(x.stress ? { stress: x.stress } : {}), ...(x.health ? { health: x.health } : {}) };
}

const FOOD_KINDS = new Set([
  'restaurant',
  'cafe',
  'food-truck',
  'shawarma',
  'buka',
  'grill-house',
  'chop-bar',
  'kibanda',
  'koshary',
  'taqueria',
  'dim-sum',
  'curry-house',
  'coffee-chain',
  'bakery',
]);

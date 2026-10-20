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
 *
 * Replay: both commands are new and the fields they write (`golf`, `phone`)
 * are optional, so a logged world without them replays exactly as before.
 */
import { appearanceSeed, defaultAppearance, type Appearance } from './appearance.js';
import { GOLF, MALL_ITEMS, MALL_TILLS, PHONE_NAMES, golfCourse, mallItem } from './data/leisure.js';
import { furnitureItem, furnitureLabel } from './data/lifestyle-shop.js';
import { ensure } from './errors.js';
import { addContact } from './events.js';
import { businessesOf, isOpen } from './economy.js';
import { col, getMarket, hoursLeft, locationOf } from './helpers.js';
import { account, costIn, payExact } from './ledger.js';
import { bumpEnergy } from './lifebars.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { bumpNeed, needsOf } from './needs.js';
import { NPC_POOL, npcPerson } from './people.js';
import { deriveRng } from './rng.js';
import { buyFurniture } from './shop.js';
import type { Id, MarketState, Player, World } from './types.js';

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

/** The mall's shops and prices in the city you're in. */
export function mallView(world: World, me: Player) {
  const m = getMarket(world, locationOf(me));
  const items = [];
  for (const x of MALL_ITEMS) {
    const f = x.furnitureId ? furnitureItem(x.furnitureId) : undefined;
    if (x.furnitureId && !f) continue;
    items.push({
      id: x.id,
      shop: x.shop,
      label: f ? furnitureLabel(f, m.id) : x.label,
      price: scale(col(m), f ? f.priceCol : x.priceCol),
      ...(x.topStyle ? { topStyle: x.topStyle } : {}),
      ...(x.headwear ? { headwear: x.headwear } : {}),
      ...(x.glasses ? { glasses: x.glasses } : {}),
      ...(x.phone ? { phone: x.phone } : {}),
      ...(f ? { furniture: f.id, slot: f.slot, tier: f.tier } : {}),
      ...(x.hunger ? { hunger: x.hunger } : {}),
      ...(x.fun ? { fun: x.fun } : {}),
      ...(x.hours ? { hours: x.hours } : {}),
      owned: f
        ? !!me.home?.items.some((h) => h.itemId === f.id)
        : x.phone
          ? me.phone?.tier === x.phone
          : false,
    });
  }
  return {
    currency: m.data.currency,
    /** Furniture is delivered home: only from a mall in your home city. */
    delivers: locationOf(me) === me.market,
    phone: me.phone ? { ...me.phone, name: PHONE_NAMES[me.phone.tier] } : null,
    items,
  };
}

export function mallBuy(world: World, me: Player, itemId: string, colour?: string, now = 0) {
  const x = mallItem(itemId);
  ensure(x, 'mall.item', 'The mall doesn’t sell that.');
  const m = getMarket(world, locationOf(me));
  const fmt = (v: number) => formatMoney(v, m.data.currency);

  // Furniture and electronics for your home: the lifestyle shop does it (a
  // furniture or electronics store's till, the old item sold back).
  if (x.furnitureId) {
    const r = buyFurniture(world, me, x.furnitureId);
    return { ...r, item: x.id, shop: x.shop, home: true };
  }

  const till =
    x.shop === 'foodcourt'
      ? tillOf(m, (k) => FOOD_KINDS.has(k))
      : x.shop === 'home'
        ? null
        : tillOf(m, (k) => MALL_TILLS[x.shop as keyof typeof MALL_TILLS].includes(k));
  const price = scale(col(m), x.priceCol);
  const memo = `${x.label} at the mall${till ? ` (${till.name})` : ''}`;

  // Clothes and accessories: your look changes (and everyone sees it).
  if (x.topStyle || x.headwear || x.glasses) {
    const was: Appearance = me.appearance ?? defaultAppearance(appearanceSeed(me), me.gender);
    const next: Appearance = { ...was };
    if (x.topStyle) {
      ensure(colour && /^#[0-9a-fA-F]{6}$/.test(colour), 'mall.colour', 'Pick a colour.');
      next.topStyle = x.topStyle;
      next.topColor = colour.toLowerCase();
    }
    if (x.headwear) next.headwear = x.headwear;
    if (x.glasses) next.glasses = x.glasses;
    ensure(
      JSON.stringify(next) !== JSON.stringify(was),
      'mall.owned',
      'You’re already wearing that.',
    );
    pay(world, me, m, price, till?.account ?? m.ext.suppliers, memo);
    me.appearance = next;
    me.appearanceAt = now;
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

  // Food, groceries and films.
  if (x.hours)
    ensure(
      hoursLeft(me) >= x.hours,
      'mall.hours',
      `That takes ${x.hours} hours; you don’t have them this month.`,
    );
  pay(world, me, m, price, till?.account ?? m.ext.suppliers, memo);
  if (x.hours) me.hours.used += x.hours;
  const hunger = x.hunger ? bumpNeed(me, 'hunger', x.hunger) : 0;
  const fun = x.fun ? bumpNeed(me, 'fun', x.fun) : 0;
  const energy = x.energy ? Math.round(bumpEnergy(me, x.energy)) : 0;
  return {
    item: x.id,
    shop: x.shop,
    price,
    effects: { hunger, fun, energy },
    needs: needsOf(me),
    ...(x.stress ? { barsFx: { stress: x.stress } } : {}),
    message: `${x.label}: ${fmt(price)}.`,
  };
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

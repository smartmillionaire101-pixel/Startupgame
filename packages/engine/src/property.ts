/**
 * Real estate (Wave 10): every city has a property market of real
 * neighbourhoods (data/property.ts). Players buy homes outright or with a
 * mortgage from the city's bank, let them out for monthly rent, sell them,
 * and move in to one (which sets their home city and lifestyle tier).
 *
 * Money flows (all ledger transfers, so money is conserved):
 *  - the purchase price goes to the outside world (`ext.genesis`, the sellers
 *    and developers), buying costs (stamp duty, fees) to `ext.tax`;
 *  - a mortgage is the city bank's money (`ext.bank`) paid to the seller;
 *    repayments go back to `ext.bank` at each settlement of that city;
 *  - rent comes from households (`ext.lifestyle`), net of income tax;
 *    running costs go to `ext.suppliers`;
 *  - a sale is paid by `ext.genesis`: the bank is repaid first, the owner
 *    gets the rest (an agent's fee is kept back).
 * Prices move with a city index drifting each settlement on its own RNG
 * stream (`deriveRng(seed, 'property', market, month)`).
 */
import { LIFESTYLE_TIERS } from './data/characters.js';
import {
  BUY_COSTS,
  MORTGAGE,
  NEIGHBOURHOODS,
  OCCUPANCY,
  OWNER_LIVING_DISCOUNT,
  PRICE_TREND,
  RENT_YIELD,
  SELL_FEE,
  TIER_BEDROOMS,
  TIER_LABEL,
  TIER_LIFESTYLE,
  TIER_PRICE,
  TIER_UPKEEP,
} from './data/property.js';
import type { MarketId } from './data/markets.js';
import { monthlyPayment } from './deals.js';
import { ensure, fail } from './errors.js';
import { achieve, getMarket, locationOf, notify } from './helpers.js';
import { account, costIn, pay, payExact, transfer, valueIn } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney, scale } from './money.js';
import { deriveRng } from './rng.js';
import { relocate } from './travel.js';
import type { Id, MarketState, Player, Property, World } from './types.js';

// ---------------------------------------------------------------- Seeding and prices

export const propertiesOf = (world: World): Record<Id, Property> => world.properties ?? {};

export const marketProperties = (world: World, market: MarketId): Property[] =>
  Object.values(propertiesOf(world)).filter((p) => p.market === market);

/** Seed a city's listings when missing (new markets and saved worlds). Own RNG stream. */
export function ensureProperties(world: World, marketId: MarketId) {
  const all = (world.properties ??= {});
  if (Object.values(all).some((p) => p.market === marketId)) return;
  const m = getMarket(world, marketId);
  m.propertyIndex ??= { value: 1, prev: 1, month: m.month };
  const rng = deriveRng(world.seed, 'property', 'genesis', marketId);
  let n = 0;
  for (const hood of NEIGHBOURHOODS[marketId] ?? []) {
    for (const tier of hood.tiers) {
      const id = `prop-${marketId}-${n++}`;
      const street = hood.streets[Math.floor(rng.next() * hood.streets.length)]!;
      // Each home is a little different: ±15–20% around the neighbourhood's going rate.
      const basePrice =
        Math.round((hood.apartment * TIER_PRICE[tier] * rng.range(0.85, 1.2)) / 1000) * 1000 * 100;
      all[id] = {
        id,
        market: marketId,
        neighbourhood: hood.name,
        district: hood.district,
        street,
        tier,
        bedrooms: TIER_BEDROOMS[tier],
        basePrice,
        ownerId: null,
        rentedOut: false,
        mortgage: null,
      };
    }
  }
}

export const propertyIndex = (m: MarketState): number => m.propertyIndex?.value ?? 1;

export function priceOf(world: World, p: Property): number {
  return Math.round(p.basePrice * propertyIndex(getMarket(world, p.market)));
}

export const upkeepOf = (world: World, p: Property) =>
  Math.round(priceOf(world, p) * TIER_UPKEEP[p.tier]);

export const rentOf = (world: World, p: Property) =>
  Math.round((priceOf(world, p) * RENT_YIELD[p.market]) / 12);

export const mortgageRateBps = (m: MarketState) => m.data.baseRateBps + MORTGAGE.spreadBps;

export function getProperty(world: World, id: Id): Property {
  const p = world.properties?.[id];
  if (!p) fail('property.missing', 'That property isn’t on the market.');
  return p;
}

function ownProperty(world: World, me: Player, id: Id): Property {
  const p = getProperty(world, id);
  ensure(p.ownerId === me.id, 'property.owner', 'You don’t own that property.');
  return p;
}

const label = (p: Property) => `${TIER_LABEL[p.tier]} on ${p.street}, ${p.neighbourhood}`;

/** The home a player lives in, when it is still theirs and in their home city. */
export function residenceOf(world: World, p: Player): Property | null {
  const id = p.residence?.propertyId;
  const prop = id ? world.properties?.[id] : undefined;
  return prop && prop.ownerId === p.id && prop.market === p.market ? prop : null;
}

/** Living costs multiplier: owners living in their own home pay no rent. */
export const livingCostFactor = (world: World, p: Player): number =>
  residenceOf(world, p) ? 1 - OWNER_LIVING_DISCOUNT : 1;

// ---------------------------------------------------------------- Buying

export interface MortgageRequest {
  downPct: number;
  months: number;
}

export interface BuyQuote {
  price: number;
  closingCosts: number;
  deposit: number;
  loan: number;
  rateBps: number;
  months: number;
  monthly: number;
  /** Cash needed now, local minor units of the property's city. */
  cashNow: number;
  /** Cash you must hold after buying (reserves), local minor. */
  reserve: number;
}

export function quote(world: World, p: Property, mortgage?: MortgageRequest | null): BuyQuote {
  const m = getMarket(world, p.market);
  const price = priceOf(world, p);
  const closingCosts = Math.round(price * BUY_COSTS);
  if (!mortgage)
    return {
      price,
      closingCosts,
      deposit: price,
      loan: 0,
      rateBps: 0,
      months: 0,
      monthly: 0,
      cashNow: price + closingCosts,
      reserve: 0,
    };
  const deposit = Math.round((price * mortgage.downPct) / 100);
  const loan = price - deposit;
  const rateBps = mortgageRateBps(m);
  const monthly = loan > 0 ? monthlyPayment(loan, rateBps, mortgage.months) : 0;
  return {
    price,
    closingCosts,
    deposit,
    loan,
    rateBps,
    months: mortgage.months,
    monthly,
    cashNow: deposit + closingCosts,
    reserve: monthly * MORTGAGE.reserveMonths,
  };
}

/** Why a player can't buy this property (null when they can). */
export function buyBlocker(
  world: World,
  me: Player,
  p: Property,
  mortgage?: MortgageRequest | null,
): string | null {
  const m = getMarket(world, p.market);
  if (p.ownerId === me.id) return 'You already own it.';
  if (p.ownerId) return 'It’s sold.';
  if (locationOf(me) !== p.market) return `Fly to ${m.data.name} to view and buy it.`;
  if (mortgage) {
    if (mortgage.downPct < MORTGAGE.minDownPct || mortgage.downPct > 90)
      return `Put down between ${MORTGAGE.minDownPct}% and 90%.`;
    if (mortgage.months < MORTGAGE.minMonths || mortgage.months > MORTGAGE.maxMonths)
      return `Mortgages run ${MORTGAGE.minMonths / 12}–${MORTGAGE.maxMonths / 12} years.`;
    if (me.credit.defaults > 0) return 'The bank won’t lend: you have a default on your record.';
  }
  const q = quote(world, p, mortgage);
  const mine = account(world, me.accounts.local);
  const need = costIn(world, q.cashNow + q.reserve, m.data.currency, mine.currency);
  if (mine.balance < need) {
    const fmt = (v: number) => formatMoney(v, m.data.currency);
    return mortgage
      ? `You need ${fmt(q.cashNow)} now (deposit and buying costs) and ${fmt(q.reserve)} in reserve (${MORTGAGE.reserveMonths} monthly payments).`
      : `It costs ${fmt(q.cashNow)} with buying costs; you don’t have it.`;
  }
  return null;
}

export function buyProperty(
  world: World,
  me: Player,
  propertyId: Id,
  mortgage?: MortgageRequest | null,
) {
  const p = getProperty(world, propertyId);
  const blocker = buyBlocker(world, me, p, mortgage);
  ensure(!blocker, 'property.buy', blocker ?? '');
  const m = getMarket(world, p.market);
  const q = quote(world, p, mortgage);
  const month = m.month;
  const what = label(p);
  payExact(world, me.accounts.local, m.ext.genesis, q.deposit, `Bought: ${what}`, month);
  payExact(
    world,
    me.accounts.local,
    m.ext.tax,
    q.closingCosts,
    `Stamp duty and fees: ${what}`,
    month,
  );
  if (q.loan > 0) {
    // The bank pays the seller the rest; you repay the bank monthly.
    transfer(world, m.ext.bank, m.ext.genesis, q.loan, `Mortgage: ${what}`, month);
    p.mortgage = {
      lenderAccount: m.ext.bank,
      lender: m.bankName,
      principal: q.loan,
      outstanding: q.loan,
      rateBps: q.rateBps,
      monthlyPayment: q.monthly,
      monthsLeft: q.months,
      missed: 0,
      startMonth: month,
    };
  } else p.mortgage = null;
  p.ownerId = me.id;
  p.bought = { price: q.price, month };
  p.rentedOut = false;
  delete p.lastMonth;
  achieve(world, me, 'life.property', 'First property', month);
  if (p.tier === 'mansion') achieve(world, me, 'life.mansion', 'A mansion of your own', month);
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  return {
    propertyId: p.id,
    price: q.price,
    closingCosts: q.closingCosts,
    mortgage: p.mortgage
      ? { loan: q.loan, monthly: q.monthly, rateBps: q.rateBps, months: q.months }
      : null,
    message: p.mortgage
      ? `You bought the ${what.toLowerCase()} for ${fmt(q.price)}: ${fmt(q.deposit)} down, ${fmt(q.monthly)} a month to ${m.bankName} for ${Math.round(q.months / 12)} years.`
      : `You bought the ${what.toLowerCase()} for ${fmt(q.price)} (plus ${fmt(q.closingCosts)} stamp duty and fees).`,
  };
}

// ---------------------------------------------------------------- Selling

/** Clear a property back onto the market (sold or repossessed). */
function release(world: World, p: Property) {
  const owner = p.ownerId ? world.players[p.ownerId] : undefined;
  if (owner?.residence?.propertyId === p.id) delete owner.residence;
  p.ownerId = null;
  p.rentedOut = false;
  p.mortgage = null;
  delete p.bought;
  delete p.lastMonth;
}

export function sellProperty(world: World, me: Player, propertyId: Id) {
  const p = ownProperty(world, me, propertyId);
  const m = getMarket(world, p.market);
  const month = m.month;
  const price = priceOf(world, p);
  const fee = Math.round(price * SELL_FEE);
  const net = price - fee;
  const owed = p.mortgage?.outstanding ?? 0;
  const fmt = (v: number) => formatMoney(v, m.data.currency);
  const what = label(p);
  if (owed > net) {
    // Negative equity: you bring the difference.
    const short = owed - net;
    const mine = account(world, me.accounts.local);
    ensure(
      mine.balance >= costIn(world, short, m.data.currency, mine.currency),
      'property.equity',
      `You owe ${fmt(owed)} on it and it sells for ${fmt(net)} after fees: you need ${fmt(short)} to clear the mortgage.`,
    );
    transfer(world, m.ext.genesis, p.mortgage!.lenderAccount, net, `Sale: ${what}`, month);
    payExact(
      world,
      me.accounts.local,
      p.mortgage!.lenderAccount,
      short,
      `Mortgage shortfall: ${what}`,
      month,
    );
  } else if (owed > 0) {
    transfer(
      world,
      m.ext.genesis,
      p.mortgage!.lenderAccount,
      owed,
      `Mortgage repaid: ${what}`,
      month,
    );
  }
  const proceeds = Math.max(0, net - owed);
  const received =
    proceeds > 0
      ? pay(world, m.ext.genesis, me.accounts.local, proceeds, `Sold: ${what}`, month)
      : 0;
  const gain = price - (p.bought?.price ?? price);
  release(world, p);
  return {
    price,
    fee,
    mortgageRepaid: Math.min(owed, net),
    proceeds,
    received,
    gain,
    message: `You sold the ${what.toLowerCase()} for ${fmt(price)}${owed ? `, repaid ${fmt(Math.min(owed, net))} to ${m.bankName}` : ''} and kept ${fmt(proceeds)} after the agent’s fee.`,
  };
}

// ---------------------------------------------------------------- Letting and moving in

export function letProperty(world: World, me: Player, propertyId: Id, on: boolean) {
  const p = ownProperty(world, me, propertyId);
  const m = getMarket(world, p.market);
  if (on) {
    ensure(!p.rentedOut, 'property.let', 'It’s already let.');
    ensure(
      me.residence?.propertyId !== p.id,
      'property.let',
      'You live there. Move somewhere else before letting it.',
    );
    p.rentedOut = true;
    return {
      rent: rentOf(world, p),
      message: `Listed with a letting agent: about ${formatMoney(rentOf(world, p), m.data.currency)} a month from the next settlement.`,
    };
  }
  ensure(p.rentedOut, 'property.let', 'It isn’t let.');
  p.rentedOut = false;
  return { rent: 0, message: 'The tenants move out at the end of the month. It’s yours again.' };
}

export function moveIn(world: World, me: Player, propertyId: Id) {
  const p = ownProperty(world, me, propertyId);
  ensure(!p.rentedOut, 'property.let', 'It’s let to tenants. End the let first.');
  ensure(
    me.residence?.propertyId !== p.id || me.market !== p.market,
    'property.home',
    'You already live there.',
  );
  let relocated = false;
  if (p.market !== me.market) {
    // Moving into a home in another city makes that city your home (the usual relocation rules).
    relocate(world, me, p.market, undefined);
    relocated = true;
  }
  const m = getMarket(world, p.market);
  me.residence = { propertyId: p.id, since: m.month };
  me.lifestyleTier = TIER_LIFESTYLE[p.tier];
  const tier = LIFESTYLE_TIERS[me.lifestyleTier - 1]!;
  return {
    propertyId: p.id,
    market: p.market,
    lifestyleTier: me.lifestyleTier,
    relocated,
    message: `Welcome home: you live in the ${label(p).toLowerCase()} now${relocated ? ` and ${m.data.name} is your home city` : ''}. Lifestyle: ${tier.name}, with no rent to pay.`,
  };
}

// ---------------------------------------------------------------- The month

function repossess(world: World, p: Property, owner: Player | undefined, month: number) {
  const m = getMarket(world, p.market);
  const sale = Math.round(priceOf(world, p) * MORTGAGE.repossessionPrice);
  const owed = p.mortgage?.outstanding ?? 0;
  const toBank = Math.min(owed, sale);
  if (p.mortgage)
    transfer(world, m.ext.genesis, p.mortgage.lenderAccount, toBank, 'Repossession sale', month);
  const surplus = sale - toBank;
  if (owner && surplus > 0)
    pay(
      world,
      m.ext.genesis,
      owner.accounts.local,
      surplus,
      `Repossession surplus: ${label(p)}`,
      month,
    );
  if (owner) {
    owner.credit.defaults += 1;
    notify(world, owner.id, {
      month,
      kind: 'warning',
      text: `${m.bankName} repossessed your ${label(p).toLowerCase()} after ${MORTGAGE.repossessAfter} missed payments.`,
    });
  }
  release(world, p);
}

/** Each settlement of a city: the price index moves, then rent, running costs and mortgages. */
export function settleProperties(world: World, marketId: MarketId, month: number) {
  ensureProperties(world, marketId);
  const m = getMarket(world, marketId);
  const rng = deriveRng(world.seed, 'property', marketId, month);
  const trend = PRICE_TREND[marketId];
  const idx = (m.propertyIndex ??= { value: 1, prev: 1, month });
  const climate = (clamp(m.climate, 0.5, 1.6) - 1) * 0.004;
  idx.prev = idx.value;
  idx.value =
    Math.round(
      clamp(idx.value * Math.exp(rng.normal(trend.drift + climate, trend.vol)), 0.4, 4) * 10_000,
    ) / 10_000;
  idx.month = month;

  for (const p of marketProperties(world, marketId)) {
    if (!p.ownerId) continue;
    const owner = world.players[p.ownerId];
    if (!owner) {
      release(world, p);
      continue;
    }
    const fmt = (v: number) => formatMoney(v, m.data.currency);
    const what = label(p).toLowerCase();
    // 1. Rent first (it helps pay the rest).
    let rent = 0;
    let vacant = false;
    if (p.rentedOut) {
      vacant = !deriveRng(world.seed, 'property', 'tenant', p.id, month).chance(OCCUPANCY);
      if (!vacant) {
        const gross = rentOf(world, p);
        const tax = Math.round(gross * m.data.tax.personalIncome);
        rent = gross - tax;
        pay(world, m.ext.lifestyle, owner.accounts.local, rent, `Rent: ${label(p)}`, month);
      }
    }
    const mine = () => account(world, owner.accounts.local);
    const canPay = (v: number) =>
      mine().balance >= costIn(world, v, m.data.currency, mine().currency);
    // 2. Running costs.
    let upkeep = upkeepOf(world, p);
    if (canPay(upkeep))
      payExact(
        world,
        owner.accounts.local,
        m.ext.suppliers,
        upkeep,
        `Running costs: ${label(p)}`,
        month,
      );
    else {
      notify(world, owner.id, {
        month,
        kind: 'warning',
        text: `You couldn’t cover the running costs of your ${what} (${fmt(upkeep)}). The service company will chase you.`,
      });
      upkeep = 0;
    }
    // 3. The mortgage.
    let paidMortgage = 0;
    const mg = p.mortgage;
    if (mg && mg.outstanding > 0) {
      const interest = Math.round((mg.outstanding * mg.rateBps) / 10_000 / 12);
      const due = Math.min(mg.monthlyPayment, mg.outstanding + interest);
      if (canPay(due)) {
        payExact(
          world,
          owner.accounts.local,
          mg.lenderAccount,
          due,
          `Mortgage: ${label(p)}`,
          month,
        );
        mg.outstanding = Math.max(0, mg.outstanding - (due - Math.min(due, interest)));
        mg.monthsLeft = Math.max(0, mg.monthsLeft - 1);
        mg.missed = 0;
        paidMortgage = due;
        owner.credit.onTimePayments += 1;
        if (mg.outstanding === 0) {
          p.mortgage = null;
          notify(world, owner.id, {
            month,
            kind: 'milestone',
            text: `Mortgage paid off: your ${what} is all yours.`,
          });
        }
      } else {
        mg.missed += 1;
        owner.credit.missedPayments += 1;
        if (mg.missed >= MORTGAGE.repossessAfter) {
          repossess(world, p, owner, month);
          continue;
        }
        notify(world, owner.id, {
          month,
          kind: 'warning',
          text: `You missed a mortgage payment on your ${what} (${fmt(due)}). ${MORTGAGE.repossessAfter - mg.missed} more and ${m.bankName} repossesses it.`,
        });
      }
    }
    p.lastMonth = { month, rent, upkeep, mortgage: paidMortgage, vacant };
  }
}

// ---------------------------------------------------------------- Views

const DEFAULT_MORTGAGE: MortgageRequest = { downPct: 25, months: 300 };

/** `market.properties` / `here.properties`: every home in the city, for sale or owned. */
export function propertiesView(world: World, viewer: Player, m: MarketState) {
  const index = propertyIndex(m);
  const prev = m.propertyIndex?.prev ?? index;
  return {
    index: Math.round(index * 1000) / 1000,
    /** Change at the last settlement, percent. */
    changePct: Math.round(((index - prev) / Math.max(0.0001, prev)) * 1000) / 10,
    rentYieldPct: Math.round(RENT_YIELD[m.id] * 1000) / 10,
    mortgageRateBps: mortgageRateBps(m),
    listings: marketProperties(world, m.id).map((p) => {
      const price = priceOf(world, p);
      const owner = p.ownerId ? world.players[p.ownerId] : undefined;
      const mq = quote(world, p, DEFAULT_MORTGAGE);
      const cashBlocker = buyBlocker(world, viewer, p, null);
      const mortgageBlocker = buyBlocker(world, viewer, p, DEFAULT_MORTGAGE);
      return {
        id: p.id,
        market: p.market,
        neighbourhood: p.neighbourhood,
        district: p.district,
        street: p.street,
        tier: p.tier,
        tierLabel: TIER_LABEL[p.tier],
        bedrooms: p.bedrooms,
        /** The lifestyle tier living here gives you. */
        lifestyleTier: TIER_LIFESTYLE[p.tier],
        price,
        upkeep: upkeepOf(world, p),
        rent: rentOf(world, p),
        forSale: !p.ownerId,
        owner: owner ? { id: owner.id, name: owner.name, you: owner.id === viewer.id } : null,
        rentedOut: p.ownerId ? p.rentedOut : false,
        closingCosts: mq.closingCosts,
        /** A typical mortgage: 25% down over 25 years. */
        mortgageQuote: {
          downPct: DEFAULT_MORTGAGE.downPct,
          months: DEFAULT_MORTGAGE.months,
          deposit: mq.deposit,
          loan: mq.loan,
          rateBps: mq.rateBps,
          monthly: mq.monthly,
        },
        canBuy: cashBlocker === null,
        canMortgage: mortgageBlocker === null,
        reason: cashBlocker,
        mortgageReason: mortgageBlocker,
      };
    }),
  };
}

/** `me.properties`: your portfolio across cities (amounts in each property's currency). */
export function myPropertiesView(world: World, p: Player) {
  return Object.values(propertiesOf(world))
    .filter((x) => x.ownerId === p.id)
    .map((x) => {
      const m = getMarket(world, x.market);
      const value = priceOf(world, x);
      const owed = x.mortgage?.outstanding ?? 0;
      const rent = x.rentedOut ? scale(rentOf(world, x), 1 - m.data.tax.personalIncome) : 0;
      const upkeep = upkeepOf(world, x);
      const mortgagePayment = x.mortgage?.monthlyPayment ?? 0;
      return {
        id: x.id,
        market: x.market,
        marketName: m.data.name,
        currency: m.data.currency,
        neighbourhood: x.neighbourhood,
        district: x.district,
        street: x.street,
        tier: x.tier,
        tierLabel: TIER_LABEL[x.tier],
        bedrooms: x.bedrooms,
        lifestyleTier: TIER_LIFESTYLE[x.tier],
        value,
        bought: x.bought ?? null,
        gain: value - (x.bought?.price ?? value),
        mortgage: x.mortgage
          ? {
              lender: x.mortgage.lender,
              outstanding: owed,
              monthly: mortgagePayment,
              monthsLeft: x.mortgage.monthsLeft,
              rateBps: x.mortgage.rateBps,
              missed: x.mortgage.missed,
            }
          : null,
        equity: value - owed,
        rentedOut: x.rentedOut,
        /** Expected monthly rent after tax (0 when not let). */
        monthlyRent: rent,
        upkeep,
        mortgagePayment,
        /** Expected monthly income: rent − running costs − mortgage. */
        netMonthly: rent - upkeep - mortgagePayment,
        residence: p.residence?.propertyId === x.id,
        lastMonth: x.lastMonth ?? null,
      };
    });
}

/** `me.residence`: the home you live in, or null when renting. */
export function residenceView(world: World, p: Player) {
  const r = residenceOf(world, p);
  return r
    ? {
        propertyId: r.id,
        market: r.market,
        neighbourhood: r.neighbourhood,
        district: r.district,
        street: r.street,
        tier: r.tier,
        tierLabel: TIER_LABEL[r.tier],
        lifestyleTier: TIER_LIFESTYLE[r.tier],
      }
    : null;
}

/** `me.netWorth`: cash, property equity and company stakes less personal debts, home currency. */
export function netWorth(world: World, p: Player) {
  const home = getMarket(world, p.market);
  const cur = home.data.currency;
  const local = world.accounts[p.accounts.local]?.balance ?? 0;
  const usd = p.accounts.usd ? (world.accounts[p.accounts.usd]?.balance ?? 0) : 0;
  const cash = local + valueIn(world, usd, 'USD', cur);
  let property = 0;
  for (const x of Object.values(propertiesOf(world))) {
    if (x.ownerId !== p.id) continue;
    const equity = priceOf(world, x) - (x.mortgage?.outstanding ?? 0);
    property += valueIn(world, equity, getMarket(world, x.market).data.currency, cur);
  }
  const loans = p.loans.reduce(
    (a, l) => a + valueIn(world, l.outstanding, world.markets[l.market]?.data.currency ?? cur, cur),
    0,
  );
  return { currency: cur, cash, propertyEquity: property, loans, total: cash + property - loans };
}

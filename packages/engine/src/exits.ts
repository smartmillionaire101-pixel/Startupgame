/**
 * Founder Journey 5, chapter 6 "The Exit" (blueprint §2.1, §6.7, §7.4):
 * turning company value into money a founder can spend.
 *
 *  - Secondary sales: a founder sells part of their shares (no new shares)
 *    to an existing investor, an outside secondary buyer, or a real player.
 *  - The IPO path: a readiness checklist, bankers (a fee, a few months),
 *    then a listing. Public companies get a share price every month from
 *    the valuation model plus bounded, seeded market noise.
 *  - Public shares: founders sell after a lock-up; anyone can buy or sell
 *    against the public float.
 *
 * Every sale pays capital gains tax where the company is, and the cash
 * reaches the seller's personal account through the ledger. Only cash
 * actually received counts as realised wealth (§7.4).
 *
 * Replay safety: only worlds that issue these commands carry any of this
 * state; settlement work loops over listed companies only.
 */
import { fullyDiluted, safeOwnership, sharesOf } from './captable.js';
import { companyRunway } from './company.js';
import { ensure, fail } from './errors.js';
import {
  achieve,
  adjustTrust,
  getCompany,
  getMarket,
  getPlayer,
  lastPnl,
  nextStage,
  notify,
  publish,
} from './helpers.js';
import { newId } from './ids.js';
import { costIn, payExact, pay, transfer, valueIn, withTx, account } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { deriveRng } from './rng.js';
import { afterBuy, afterSell, checkBuy, checkSell } from './exchange.js';
import { applyStarEvent } from './stars.js';
import { monthlyGrowth, valueCompany } from './valuation.js';
import type { Company, Id, MarketState, Player, SecondaryOffer, World } from './types.js';

/** Every exit threshold in one place (money in US dollars, converted per city). */
export const EXITS = {
  secondary: {
    /** Most of a holding a founder may sell in any 12 months, bps. */
    maxBpsPerYear: 2_500,
    /** Discount to the last round price: existing investors, players, outside buyers. */
    discountBps: { investor: 1_500, player: 1_500, outside: 2_500 },
    /** Months a player has to answer an offer. */
    offerMonths: 2,
    /** Board consent: at least this much runway, or a profitable month. */
    boardRunwayMonths: 6,
  },
  ipo: {
    /** Monthly revenue to list (about $600k a year). */
    revenueUsd: 50_000,
    /** Monthly growth over the last quarter, or a profitable month. */
    growth: 0.03,
    /** Months of accounts (audited books). */
    auditedMonths: 12,
    /** Independent (investor) board members. */
    boardSeats: 1,
    /** Months the bankers need. */
    prepMonths: 3,
    bankerFeeUsd: 150_000,
    /** Share of the company sold to the public at listing, bps of post-listing shares. */
    floatBps: 1_500,
    lockupMonths: 6,
    /** Most the market moves a price in a month on noise alone. */
    noise: 0.06,
    /** How fast the price drifts back toward the model's value each month. */
    reversion: 0.3,
    /** Broker's fee on every market trade, bps. */
    brokerBps: 100,
    /** The price can't stray further than this from the model value. */
    band: [0.5, 2] as const,
    historyLimit: 24,
    /** How far a listing price may be set from the bankers' price. */
    hint: [0.8, 1.2] as const,
  },
} as const;

const usd = (m: MarketState, dollars: number) => Math.round(dollars * 100 * m.data.unitsPerUsd);
const money = (m: MarketState, v: number) => formatMoney(v, m.data.currency);

// ---------------------------------------------------------------- realised wealth

/** Add a sale to the player's realised wealth (in the currency they started counting in). */
export function recordRealised(
  world: World,
  p: Player,
  m: MarketState,
  proceeds: number,
  gain: number,
  tax: number,
) {
  if (p.ai) return;
  const r = (p.realised ??= {
    currency: getMarket(world, p.market).data.currency,
    proceeds: 0,
    gains: 0,
    tax: 0,
  });
  const conv = (v: number) => valueIn(world, v, m.data.currency, r.currency);
  r.proceeds += conv(proceeds);
  r.gains += conv(gain);
  r.tax += conv(tax);
}

/**
 * Pay a player for shares sold: `gross` is waiting in the company market's
 * LP account. Capital gains tax on the gain over `basis` is withheld there;
 * the rest goes to their personal account (converted if they live elsewhere).
 */
export function payShareSale(
  world: World,
  c: Company,
  p: Player,
  gross: number,
  basis: number,
  memo: string,
): { tax: number; net: number; gain: number } {
  const m = getMarket(world, c.market);
  const gain = Math.max(0, gross - basis);
  const tax = Math.round(gain * m.data.tax.capitalGains);
  withTx(world, { kind: 'sale' }, () => {
    transfer(world, m.ext.lps, m.ext.tax, tax, `Capital gains tax: ${c.name}`, m.month);
    pay(world, m.ext.lps, p.accounts.local, gross - tax, memo, m.month, 'move');
  });
  recordRealised(world, p, m, gross, gain, tax);
  return { tax, net: gross - tax, gain };
}

// ---------------------------------------------------------------- secondary sales

/**
 * The last round's price per share: a priced round's, or (SAFEs only) the
 * newest SAFE's post-money cap spread over today's shares. 0 = no round yet.
 */
export function referencePrice(c: Company): number {
  const ct = c.capTable;
  if (ct.lastPrice > 0) return ct.lastPrice;
  if (!ct.safes.length) return 0;
  const latest = ct.safes.reduce((a, x) => (x.month >= a.month ? x : a));
  const fd = fullyDiluted(ct);
  const p = Math.min(0.9, safeOwnership(ct));
  return fd > 0 ? (latest.cap * (1 - p)) / fd : 0;
}

/** Bps of their holding this seller has sold in the last 12 months. */
export function soldThisYear(c: Company, sellerId: Id, month: number): number {
  return (c.secondaries ?? [])
    .filter((s) => s.sellerId === sellerId && s.month > month - 12)
    .reduce((a, s) => a + s.bps, 0);
}

/** Investors with a board seat agree when the company isn't in trouble. */
export function boardConsents(world: World, c: Company): { needed: boolean; ok: boolean } {
  if (c.board.length === 0) return { needed: false, ok: true };
  const profitable = (lastPnl(c)?.net ?? 0) > 0;
  const runway = companyRunway(world, c);
  const ok =
    !c.distress && !c.hibernation && (profitable || runway >= EXITS.secondary.boardRunwayMonths);
  return { needed: true, ok };
}

export type SecondaryBuyer = 'investor' | 'player' | 'outside';

export function secondaryPrice(c: Company, kind: SecondaryBuyer): number {
  return referencePrice(c) * (1 - EXITS.secondary.discountBps[kind] / 10_000);
}

/** Why a founder can't sell `bps` of their shares right now (null: they can). */
export function secondaryBlocker(world: World, c: Company, seller: Player, bps: number) {
  const m = getMarket(world, c.market);
  if (c.status !== 'active') return 'This company is no longer operating.';
  if (c.ipo?.status === 'listed') return 'Your company is listed: sell on the market instead.';
  if (!c.founderIds.includes(seller.id)) return 'Only a founder can sell founder shares here.';
  if (sharesOf(c.capTable, seller.id) <= 0) return 'You hold no shares in this company.';
  if (referencePrice(c) <= 0) return 'There is no share price yet: raise a round first.';
  const used = soldThisYear(c, seller.id, m.month);
  if (used + bps > EXITS.secondary.maxBpsPerYear)
    return `You can sell at most ${EXITS.secondary.maxBpsPerYear / 100}% of your shares in a year (${(EXITS.secondary.maxBpsPerYear - used) / 100}% left).`;
  if (!boardConsents(world, c).ok)
    return 'Your board said no: they won’t let a founder cash out while the company is short of runway.';
  return null;
}

interface Buyer {
  holderId: Id;
  /** Who pays (null: the outside world through the LP account). */
  account: Id | null;
  name: string;
  kind: SecondaryBuyer;
}

/** Move the shares and the money, and record the sale. Returns what the seller received. */
function executeSecondary(
  world: World,
  c: Company,
  seller: Player,
  buyer: Buyer,
  bps: number,
  shares: number,
  price: number,
) {
  const m = getMarket(world, c.market);
  const ct = c.capTable;
  const holding = ct.holdings[seller.id];
  ensure(
    holding && holding.shares >= shares && shares > 0,
    'secondary.shares',
    'Not enough shares.',
  );
  if (buyer.account) {
    const acc = account(world, buyer.account);
    const cost = costIn(world, price, m.data.currency, acc.currency);
    ensure(acc.balance >= cost, 'secondary.funds', `${buyer.name} can’t pay for these shares.`);
    payExact(
      world,
      buyer.account,
      m.ext.lps,
      price,
      `Secondary: ${c.name} shares`,
      m.month,
      'invested',
    );
  }
  // The shares change hands: no new shares, so nobody else is diluted.
  holding.shares -= shares;
  const to = ct.holdings[buyer.holderId];
  if (to) to.shares += shares;
  else ct.holdings[buyer.holderId] = { shares, kind: 'investor' };
  if (world.players[buyer.holderId] || world.funds[buyer.holderId]) {
    const pos = (world.positions[`${buyer.holderId}:${c.id}`] ??= {
      investorId: buyer.holderId,
      companyId: c.id,
      invested: 0,
      returned: 0,
      month: m.month,
      writtenOff: false,
    });
    pos.invested += price;
  }
  // What the founder paid in as equity is their cost; the rest is gain.
  const before = holding.shares + shares;
  const basis = Math.round(((c.founderEquity?.[seller.id] ?? 0) * shares) / before);
  const paid = payShareSale(
    world,
    c,
    seller,
    price,
    basis,
    `Secondary sale: ${c.name} shares to ${buyer.name}`,
  );
  (c.secondaries ??= []).push({
    sellerId: seller.id,
    buyerId: buyer.holderId,
    month: m.month,
    shares,
    bps,
    price,
  });
  achieve(world, seller, 'founder.secondary', 'First secondary sale', m.month);
  notify(world, seller.id, {
    month: m.month,
    kind: 'deal',
    text: `You sold ${bps / 100}% of your ${c.name} shares to ${buyer.name} for ${money(m, price)}. Tax: ${money(m, paid.tax)}. ${money(m, paid.net)} is in your personal account.`,
  });
  return { shares, price, ...paid };
}

/**
 * `exit.secondary`: sell `pctBps` of your shares. A fund already on the cap
 * table (or, without `buyerId`, an outside secondary fund) buys at once; a
 * real player (or a player-run fund) gets an offer card to accept.
 */
export function proposeSecondary(
  world: World,
  me: Player,
  companyId: Id,
  bps: number,
  buyerKind: 'fund' | 'player',
  buyerId: Id | undefined,
) {
  const c = getCompany(world, companyId);
  const m = getMarket(world, c.market);
  ensure(
    Number.isInteger(bps) && bps >= 1 && bps <= 10_000,
    'secondary.pct',
    'Pick how much to sell.',
  );
  const blocker = secondaryBlocker(world, c, me, bps);
  if (blocker) fail('secondary.blocked', blocker);
  const shares = Math.floor((sharesOf(c.capTable, me.id) * bps) / 10_000);
  ensure(shares > 0, 'secondary.shares', 'That is less than one share.');

  // A real player decides: an offer card they accept or decline.
  const offerTo = (decider: Player, holderId: Id) => {
    const price = Math.round(shares * secondaryPrice(c, 'player'));
    ensure(price > 0, 'secondary.price', 'There is no price for these shares yet.');
    const offers = (world.secondaryOffers ??= {});
    ensure(
      !Object.values(offers).some(
        (o) => o.status === 'open' && o.companyId === c.id && o.sellerId === me.id,
      ),
      'secondary.open',
      'You already have a secondary offer waiting for an answer.',
    );
    const id = newId(world, 'sec');
    const offer: SecondaryOffer = {
      id,
      companyId: c.id,
      market: c.market,
      sellerId: me.id,
      buyerId: decider.id,
      holderId,
      bps,
      shares,
      price,
      status: 'open',
      month: m.month,
      expiresMonth: m.month + EXITS.secondary.offerMonths,
    };
    offers[id] = offer;
    notify(world, decider.id, {
      month: m.month,
      kind: 'deal',
      text: `${me.name} offers you ${bps / 100}% of their ${c.name} shares for ${money(m, price)} (a ${EXITS.secondary.discountBps.player / 100}% discount to the last round). Answer in Capital.`,
    });
    return { offerId: id, price, shares, waiting: true };
  };

  if (buyerKind === 'player') {
    ensure(buyerId, 'secondary.buyer', 'Pick the player to offer the shares to.');
    const buyer = getPlayer(world, buyerId);
    ensure(
      !buyer.ai && buyer.id !== me.id,
      'secondary.buyer',
      'Offer the shares to another player.',
    );
    return offerTo(buyer, buyer.id);
  }
  if (buyerId) {
    const fund = world.funds[buyerId];
    ensure(fund, 'fund.missing', 'Fund not found.');
    ensure(
      sharesOf(c.capTable, fund.id) > 0,
      'secondary.buyer',
      'Only a fund already on your cap table buys this way.',
    );
    const manager = fund.managerId ? world.players[fund.managerId] : undefined;
    if (manager && !manager.ai) return offerTo(manager, fund.id);
    const price = Math.round(shares * secondaryPrice(c, 'investor'));
    return executeSecondary(
      world,
      c,
      me,
      { holderId: fund.id, account: fund.account, name: fund.name, kind: 'investor' },
      bps,
      shares,
      price,
    );
  }
  // An outside secondary fund: always there, but at a steeper discount.
  const price = Math.round(shares * secondaryPrice(c, 'outside'));
  ensure(price > 0, 'secondary.price', 'There is no price for these shares yet.');
  return executeSecondary(
    world,
    c,
    me,
    {
      holderId: `sec:${c.market}`,
      account: null,
      name: `${m.data.name} Secondaries`,
      kind: 'outside',
    },
    bps,
    shares,
    price,
  );
}

function getOffer(world: World, id: Id): SecondaryOffer {
  const o = world.secondaryOffers?.[id];
  if (!o) fail('secondary.missing', 'Offer not found.');
  return o;
}

/** The buyer accepts: the sale goes through if it still can. */
export function acceptSecondary(world: World, me: Player, offerId: Id) {
  const o = getOffer(world, offerId);
  ensure(o.buyerId === me.id, 'secondary.forbidden', 'This offer isn’t for you.');
  ensure(o.status === 'open', 'secondary.closed', 'This offer is no longer open.');
  const c = getCompany(world, o.companyId);
  const m = getMarket(world, c.market);
  if (m.month > o.expiresMonth) {
    o.status = 'expired';
    fail('secondary.expired', 'This offer has expired.');
  }
  const seller = getPlayer(world, o.sellerId);
  // Limits are checked again: the year's allowance counts this sale once.
  const blocker = secondaryBlocker(world, c, seller, o.bps);
  if (blocker) fail('secondary.blocked', blocker);
  const fund = world.funds[o.holderId];
  const res = executeSecondary(
    world,
    c,
    seller,
    {
      holderId: o.holderId,
      account: fund ? fund.account : me.accounts.local,
      name: fund ? fund.name : me.name,
      kind: 'player',
    },
    o.bps,
    Math.min(o.shares, sharesOf(c.capTable, seller.id)),
    o.price,
  );
  o.status = 'accepted';
  adjustTrust(me, seller.id, 0.05);
  adjustTrust(seller, me.id, 0.05);
  achieve(world, me, 'investor.secondary', 'Bought founder shares', m.month);
  return { accepted: true, price: res.price };
}

/** The buyer declines, or the seller withdraws. */
export function declineSecondary(world: World, me: Player, offerId: Id) {
  const o = getOffer(world, offerId);
  ensure(
    o.buyerId === me.id || o.sellerId === me.id,
    'secondary.forbidden',
    'This offer isn’t yours.',
  );
  ensure(o.status === 'open', 'secondary.closed', 'This offer is no longer open.');
  o.status = 'declined';
  const other = o.buyerId === me.id ? o.sellerId : o.buyerId;
  const m = getMarket(world, o.market);
  notify(world, other, {
    month: m.month,
    kind: 'deal',
    text: `The secondary offer for ${world.companies[o.companyId]?.name ?? 'the shares'} was declined.`,
  });
  return { declined: true };
}

// ---------------------------------------------------------------- the IPO path

export interface IpoCheck {
  id: 'revenue' | 'growth' | 'board' | 'audited' | 'health';
  ok: boolean;
  have: number;
  need: number;
}

/** The readiness checklist (all must pass to start, and again to list). */
export function ipoChecks(world: World, c: Company): IpoCheck[] {
  const m = getMarket(world, c.market);
  const t = EXITS.ipo;
  const revenue = lastPnl(c)?.revenue ?? 0;
  const growth = monthlyGrowth(c);
  const profitable = (lastPnl(c)?.net ?? 0) > 0;
  return [
    {
      id: 'revenue',
      ok: revenue >= usd(m, t.revenueUsd),
      have: revenue,
      need: usd(m, t.revenueUsd),
    },
    {
      id: 'growth',
      ok: profitable || growth >= t.growth,
      have: Math.round(growth * 10_000),
      need: Math.round(t.growth * 10_000),
    },
    { id: 'board', ok: c.board.length >= t.boardSeats, have: c.board.length, need: t.boardSeats },
    {
      id: 'audited',
      ok: c.finance.history.length >= t.auditedMonths,
      have: Math.min(c.finance.history.length, t.auditedMonths),
      need: t.auditedMonths,
    },
    {
      id: 'health',
      ok: c.status === 'active' && !c.distress && !c.hibernation && !c.bannedFromRaising,
      have: 0,
      need: 0,
    },
  ];
}

export const ipoReady = (world: World, c: Company) => ipoChecks(world, c).every((x) => x.ok);

export const bankerFee = (world: World, c: Company) =>
  usd(getMarket(world, c.market), EXITS.ipo.bankerFeeUsd);

/** `ipo.prepare`: hire the bankers (fee now), list in a few months. */
export function prepareIpo(world: World, me: Player, c: Company) {
  const m = getMarket(world, c.market);
  ensure(!c.ipo || c.ipo.status === 'delisted', 'ipo.already', 'The bankers are already on it.');
  const missing = ipoChecks(world, c).filter((x) => !x.ok);
  if (missing.length) fail('ipo.notReady', 'Not ready to list yet: finish the checklist first.');
  const fee = bankerFee(world, c);
  ensure(
    account(world, c.account).balance >= fee,
    'ipo.fee',
    `The bankers want ${money(m, fee)} up front; the company can’t pay it.`,
  );
  withTx(world, { kind: 'fee', fee: true }, () =>
    transfer(
      world,
      c.account,
      m.ext.suppliers,
      fee,
      `IPO bankers and auditors: ${c.name}`,
      m.month,
    ),
  );
  c.ipo = {
    status: 'preparing',
    preparedMonth: m.month,
    readyMonth: m.month + EXITS.ipo.prepMonths,
    bankerFee: fee,
  };
  for (const fid of c.founderIds)
    notify(world, fid, {
      month: m.month,
      kind: 'deal',
      text: `The bankers are preparing ${c.name} for the stock market. You can list from month ${c.ipo.readyMonth}.`,
    });
  achieve(world, me, 'founder.ipo-prep', 'Started the IPO path', m.month);
  return { readyMonth: c.ipo.readyMonth, fee };
}

/** What the model says the whole company is worth (local minor). */
export function fairValue(world: World, c: Company): number {
  return Math.max(1, valueCompany(world, c, nextStage(c.lastRound)).value);
}

/** The bankers' price per share for a listing (before any hint). */
export function listingPrice(world: World, c: Company): number {
  const fd = fullyDiluted(c.capTable);
  return fd > 0 ? fairValue(world, c) / fd : 0;
}

/** `ipo.list`: sell a slice of new shares to the public; the company is listed. */
export function listCompany(world: World, me: Player, c: Company, hint?: number) {
  const m = getMarket(world, c.market);
  const ipo = c.ipo;
  ensure(ipo && ipo.status === 'preparing', 'ipo.notPrepared', 'Hire the bankers first.');
  ensure(
    m.month >= ipo.readyMonth,
    'ipo.notYet',
    `The bankers need until month ${ipo.readyMonth}.`,
  );
  ensure(ipoReady(world, c), 'ipo.notReady', 'The checklist slipped: fix it before listing.');
  const fair = listingPrice(world, c);
  ensure(fair > 0, 'ipo.price', 'No price for the shares.');
  const [lo, hi] = EXITS.ipo.hint;
  const price = hint ? clamp(hint, fair * lo, fair * hi) : fair;
  const ct = c.capTable;
  const fd = fullyDiluted(ct);
  const newShares = Math.round((fd * EXITS.ipo.floatBps) / (10_000 - EXITS.ipo.floatBps));
  const raised = Math.round(newShares * price);
  const pubId = `pub:${c.id}`;
  withTx(world, { kind: 'investment' }, () =>
    transfer(world, m.ext.lps, c.account, raised, `IPO: new shares sold to the public`, m.month),
  );
  ct.holdings[pubId] = { shares: (ct.holdings[pubId]?.shares ?? 0) + newShares, kind: 'investor' };
  ct.lastPrice = price;
  ct.lastPostMoney = Math.round(price * (fd + newShares));
  const lockups: Record<Id, number> = {};
  for (const h of Object.keys(ct.holdings))
    if (world.players[h] && !world.players[h]!.ai) lockups[h] = m.month + EXITS.ipo.lockupMonths;
  Object.assign(ipo, {
    status: 'listed',
    listedMonth: m.month,
    price,
    prevPrice: price,
    history: [price],
    lockups,
    basis: {},
    raised,
  });
  const outlet = m.outlets.find((o) => o.type === 'national') ?? m.outlets[0];
  publish(world, {
    market: c.market,
    month: m.month,
    outletId: outlet?.id ?? 'national',
    outletName: outlet?.name ?? 'National desk',
    kind: 'raise',
    alert: `${c.name} lists on the stock market.`,
    headline: `${c.name} lists on the stock market, raising ${money(m, raised)}`,
    body: `${c.name} sold ${EXITS.ipo.floatBps / 100}% of the company to the public. Shares open at ${money(m, Math.round(price))}.`,
    starDelta: 0.3,
    verified: true,
    subject: { kind: 'company', id: c.id },
  });
  for (const fid of c.founderIds) {
    const f = world.players[fid];
    if (!f) continue;
    achieve(world, f, 'founder.ipo', 'Listed on the stock market', m.month);
    applyStarEvent(f.stars, 0.3);
    notify(world, fid, {
      month: m.month,
      kind: 'deal',
      text: `${c.name} is public. Your shares are worth more and you can sell them on the market after the lock-up (month ${m.month + EXITS.ipo.lockupMonths}). Until you sell, it isn’t cash.`,
    });
  }
  applyStarEvent(c.stars, 0.3);
  return { price, raised, newShares, lockupUntil: m.month + EXITS.ipo.lockupMonths, by: me.id };
}

// ---------------------------------------------------------------- a stock market from day one

/** Established AI companies listed in each city when the stock market opens. */
export const SEED_LISTINGS = 2;

/**
 * The stock market opens (the exits release note, or a city opening after
 * it): each city's most valuable AI companies list at the model's price, so
 * there is something to buy before any founder gets there. No fees, no
 * lock-up (no human holders), no dice.
 */
export function seedPublicMarket(world: World, marketId: string, count = SEED_LISTINGS) {
  const m = world.markets[marketId as MarketState['id']];
  if (!m) return 0;
  const listed = Object.values(world.companies).filter(
    (c) => c.market === marketId && c.ipo?.status === 'listed',
  ).length;
  const candidates = Object.values(world.companies)
    .filter(
      (c) =>
        c.market === marketId &&
        c.ai &&
        c.status === 'active' &&
        !c.ipo &&
        c.founderIds.every((f) => world.players[f]?.ai !== false),
    )
    .map((c) => ({ c, v: fairValue(world, c) }))
    .sort((a, b) => b.v - a.v || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, Math.max(0, count - listed));
  for (const { c } of candidates) {
    const ct = c.capTable;
    const fd = fullyDiluted(ct);
    if (fd <= 0) continue;
    const price = listingPrice(world, c);
    const newShares = Math.round((fd * EXITS.ipo.floatBps) / (10_000 - EXITS.ipo.floatBps));
    const raised = Math.round(newShares * price);
    withTx(world, { kind: 'investment' }, () =>
      transfer(world, m.ext.lps, c.account, raised, `IPO: new shares sold to the public`, m.month),
    );
    ct.holdings[`pub:${c.id}`] = { shares: newShares, kind: 'investor' };
    ct.lastPrice = price;
    ct.lastPostMoney = Math.round(price * (fd + newShares));
    c.ipo = {
      status: 'listed',
      preparedMonth: m.month,
      readyMonth: m.month,
      bankerFee: 0,
      listedMonth: m.month,
      price,
      prevPrice: price,
      history: [price],
      lockups: {},
      basis: {},
      raised,
    };
  }
  return candidates.length;
}

// ---------------------------------------------------------------- the public market

export const isListed = (c: Company) => c.status === 'active' && c.ipo?.status === 'listed';

function getListed(world: World, companyId: Id): Company {
  const c = getCompany(world, companyId);
  ensure(isListed(c), 'shares.notListed', 'This company isn’t on the stock market.');
  return c;
}

/** `shares.sell`: sell part of your holding to the market at today's price. */
export function sellShares(world: World, me: Player, companyId: Id, bps: number, now?: number) {
  const c = getListed(world, companyId);
  const m = getMarket(world, c.market);
  const ipo = c.ipo!;
  ensure(
    Number.isInteger(bps) && bps >= 1 && bps <= 10_000,
    'shares.pct',
    'Pick how much to sell.',
  );
  const holding = c.capTable.holdings[me.id];
  ensure(holding && holding.shares > 0, 'shares.none', 'You hold no shares in this company.');
  const until = ipo.lockups?.[me.id] ?? 0;
  ensure(
    m.month >= until,
    'shares.locked',
    `Your shares are locked up until month ${until}: early holders can’t sell straight after a listing.`,
  );
  const shares = Math.floor((holding.shares * bps) / 10_000);
  ensure(shares > 0, 'shares.tiny', 'That is less than one share.');
  checkSell(world, me, c, now);
  const price = ipo.price!;
  const gross = Math.round(shares * price);
  const fee = Math.round((gross * EXITS.ipo.brokerBps) / 10_000);
  const proceeds = gross - fee;
  ensure(proceeds > 0, 'shares.tiny', 'Too small to sell.');
  const basisAll = ipo.basis?.[me.id] ?? 0;
  const basisSold = Math.round((basisAll * shares) / holding.shares);
  holding.shares -= shares;
  const pubId = `pub:${c.id}`;
  const pub = c.capTable.holdings[pubId];
  if (pub) pub.shares += shares;
  else c.capTable.holdings[pubId] = { shares, kind: 'investor' };
  if (ipo.basis) ipo.basis[me.id] = basisAll - basisSold;
  const pos = world.positions[`${me.id}:${c.id}`];
  if (pos) pos.returned += proceeds;
  // A big sale nudges the price down a little.
  const fd = fullyDiluted(c.capTable);
  ipo.price = Math.max(price * (1 - (0.5 * shares) / fd), price * 0.9);
  c.capTable.lastPrice = ipo.price;
  const paid = payShareSale(
    world,
    c,
    me,
    proceeds,
    basisSold,
    `Shares sold: ${c.name} (${bps / 100}% of your holding)`,
  );
  afterSell(world, me, c, basisSold, proceeds - basisSold);
  if (c.founderIds.includes(me.id))
    achieve(world, me, 'founder.public-sale', 'Sold shares on the market', m.month);
  return { shares, gross, fee, ...paid };
}

/** Cost (company currency) of `shares` at today's price, broker's fee included. */
const buyCost = (c: Company, shares: number) => {
  const gross = Math.round(shares * c.ipo!.price!);
  return gross + Math.round((gross * EXITS.ipo.brokerBps) / 10_000);
};

/** `shares.buy`: buy about `amount` (company currency) of shares from the public float. */
export function buyShares(world: World, me: Player, companyId: Id, amount: number, now?: number) {
  const c = getListed(world, companyId);
  const m = getMarket(world, c.market);
  const ipo = c.ipo!;
  ensure(
    !c.founderIds.includes(me.id),
    'shares.insider',
    'Founders can’t trade their own company’s shares this way.',
  );
  const price = ipo.price!;
  const perShare = price * (1 + EXITS.ipo.brokerBps / 10_000);
  const pubId = `pub:${c.id}`;
  const float = c.capTable.holdings[pubId]?.shares ?? 0;
  const shares = Math.min(float, Math.floor(amount / perShare));
  ensure(
    shares > 0,
    'shares.tiny',
    float > 0 ? 'Not enough for one share.' : 'No shares for sale right now.',
  );
  const cost = buyCost(c, shares);
  const acc = account(world, me.accounts.local);
  ensure(
    acc.balance >= costIn(world, cost, m.data.currency, acc.currency),
    'shares.funds',
    'Not enough money in your account.',
  );
  // Investor career: insider blackouts and the monthly depth cap.
  checkBuy(world, me, c, shares, now);
  payExact(
    world,
    me.accounts.local,
    m.ext.lps,
    cost,
    `Shares bought: ${c.name}`,
    m.month,
    'invested',
  );
  c.capTable.holdings[pubId]!.shares -= shares;
  const mine = c.capTable.holdings[me.id];
  if (mine) mine.shares += shares;
  else c.capTable.holdings[me.id] = { shares, kind: 'investor' };
  (ipo.basis ??= {})[me.id] = (ipo.basis[me.id] ?? 0) + cost;
  const pos = (world.positions[`${me.id}:${c.id}`] ??= {
    investorId: me.id,
    companyId: c.id,
    invested: 0,
    returned: 0,
    month: m.month,
    writtenOff: false,
  });
  pos.invested += cost;
  afterBuy(world, me, c, shares, cost);
  achieve(world, me, 'investor.public-shares', 'Bought shares on the stock market', m.month);
  return { shares, cost, price };
}

/**
 * Month end for listed companies in this market: the price drifts toward
 * the model's value, plus seeded noise (own stream per company and month),
 * inside a band. A closed company leaves the market.
 */
export function settlePublicMarket(world: World, marketId: string, month: number) {
  for (const c of Object.values(world.companies)) {
    if (c.market !== marketId || c.ipo?.status !== 'listed') continue;
    if (c.status !== 'active') {
      c.ipo.status = 'delisted';
      continue;
    }
    const fd = fullyDiluted(c.capTable);
    const fair = fd > 0 ? fairValue(world, c) / fd : 0;
    const price = c.ipo.price ?? fair;
    const rng = deriveRng(world.seed, 'ipo', c.id, month);
    const noise = (rng.next() * 2 - 1) * EXITS.ipo.noise;
    const drift = price + EXITS.ipo.reversion * (fair - price);
    const [lo, hi] = EXITS.ipo.band;
    const next = clamp(drift * (1 + noise), fair * lo, fair * hi);
    c.ipo.prevPrice = price;
    c.ipo.price = next;
    const h = (c.ipo.history ??= []);
    h.push(next);
    if (h.length > EXITS.ipo.historyLimit) h.splice(0, h.length - EXITS.ipo.historyLimit);
    c.capTable.lastPrice = next;
    c.capTable.lastPostMoney = Math.round(next * fd);
    if (c.ipo.lockups)
      for (const [pid, until] of Object.entries(c.ipo.lockups))
        if (until === month)
          notify(world, pid, {
            month,
            kind: 'deal',
            text: `Your ${c.name} lock-up is over: you can sell shares on the market now.`,
          });
  }
}

// ---------------------------------------------------------------- views

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The stock market: every listed company, with the viewer's holding. */
export function publicMarketView(world: World, p: Player) {
  return Object.values(world.companies)
    .filter(isListed)
    .map((c) => {
      const m = getMarket(world, c.market);
      const ipo = c.ipo!;
      const mine = sharesOf(c.capTable, p.id);
      const fd = fullyDiluted(c.capTable);
      const price = ipo.price ?? 0;
      return {
        companyId: c.id,
        name: c.name,
        market: c.market,
        city: m.data.name,
        industry: c.industry,
        currency: m.data.currency,
        price: round2(price),
        changePct: ipo.prevPrice ? round2(((price - ipo.prevPrice) / ipo.prevPrice) * 100) : 0,
        history: (ipo.history ?? []).map(round2),
        marketCap: Math.round(price * fd),
        floatShares: c.capTable.holdings[`pub:${c.id}`]?.shares ?? 0,
        listedMonth: ipo.listedMonth ?? m.month,
        yourShares: mine,
        yourValue: Math.round(mine * price),
        yourCost: ipo.basis?.[p.id] ?? 0,
        lockedUntil: (ipo.lockups?.[p.id] ?? 0) > m.month ? ipo.lockups![p.id]! : null,
        isFounder: c.founderIds.includes(p.id),
        brokerBps: EXITS.ipo.brokerBps,
      };
    });
}

/** Exit options for each active company you founded: offers, secondary, IPO. */
export function exitOptionsView(world: World, p: Player) {
  return p.companyIds
    .map((id) => world.companies[id])
    .filter((c): c is Company => !!c && c.status === 'active' && c.founderIds.includes(p.id))
    .map((c) => {
      const m = getMarket(world, c.market);
      const shares = sharesOf(c.capTable, p.id);
      const fd = fullyDiluted(c.capTable);
      const used = soldThisYear(c, p.id, m.month);
      const board = boardConsents(world, c);
      const investors = Object.keys(c.capTable.holdings)
        .filter((h) => world.funds[h] && c.capTable.holdings[h]!.shares > 0)
        .map((h) => ({
          id: h,
          name: world.funds[h]!.name,
          playerRun: !!world.funds[h]!.managerId && !world.players[world.funds[h]!.managerId!]?.ai,
        }));
      const offers = Object.values(world.deals)
        .filter(
          (d) => d.companyId === c.id && d.status === 'open' && d.terms.kind === 'acquisition',
        )
        .map((d) => ({
          dealId: d.id,
          buyer: d.terms.kind === 'acquisition' ? d.terms.buyer : '',
          price: d.terms.kind === 'acquisition' ? d.terms.price : 0,
          expiresMonth: d.expiresMonth,
        }));
      const checks = ipoChecks(world, c);
      return {
        companyId: c.id,
        name: c.name,
        currency: m.data.currency,
        yourShares: shares,
        yourPct: fd ? Math.round((shares / fd) * 10_000) / 100 : 0,
        lastPrice: round2(referencePrice(c)),
        /** Your stake at the last round price: paper value, not cash. */
        paperValue: Math.round(shares * referencePrice(c)),
        acquisitionOffers: offers,
        secondary: {
          blocked: secondaryBlocker(world, c, p, 100),
          leftBps: Math.max(0, EXITS.secondary.maxBpsPerYear - used),
          maxBpsPerYear: EXITS.secondary.maxBpsPerYear,
          boardConsentNeeded: board.needed,
          boardConsents: board.ok,
          prices: {
            investor: round2(secondaryPrice(c, 'investor')),
            player: round2(secondaryPrice(c, 'player')),
            outside: round2(secondaryPrice(c, 'outside')),
          },
          discountBps: EXITS.secondary.discountBps,
          capitalGainsRate: m.data.tax.capitalGains,
          investors,
          pending: Object.values(world.secondaryOffers ?? {})
            .filter((o) => o.companyId === c.id && o.sellerId === p.id && o.status === 'open')
            .map((o) => ({ ...o, buyerName: world.players[o.buyerId]?.name ?? '' })),
          history: (c.secondaries ?? []).filter((s) => s.sellerId === p.id).slice(-5),
        },
        ipo: {
          status: c.ipo?.status ?? null,
          readyMonth: c.ipo?.readyMonth ?? null,
          checks,
          ready: checks.every((x) => x.ok),
          bankerFee: bankerFee(world, c),
          prepMonths: EXITS.ipo.prepMonths,
          floatBps: EXITS.ipo.floatBps,
          lockupMonths: EXITS.ipo.lockupMonths,
          bankersPrice: round2(listingPrice(world, c)),
          month: m.month,
        },
      };
    });
}

/** Secondary offers waiting for this player's answer. */
export function secondaryOffersView(world: World, p: Player) {
  return Object.values(world.secondaryOffers ?? {})
    .filter((o) => o.buyerId === p.id && o.status === 'open')
    .filter((o) => (world.markets[o.market]?.month ?? 0) <= o.expiresMonth)
    .map((o) => ({
      ...o,
      companyName: world.companies[o.companyId]?.name ?? '',
      sellerName: world.players[o.sellerId]?.name ?? '',
      currency: getMarket(world, o.market).data.currency,
      viaFund: world.funds[o.holderId]?.name ?? null,
    }));
}

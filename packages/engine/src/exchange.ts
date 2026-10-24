/**
 * The city exchange (investor blueprint §7, Phase 2), built on the stock
 * market of Founder Journey 5 (exits.ts: listings, monthly prices,
 * shares.buy / shares.sell):
 *
 *  - Every exchange opens with a handful of AI-listed companies, so there is
 *    something to trade before any player lists.
 *  - A cap-weighted index per city (level 100 at opening; a divisor keeps it
 *    continuous as companies list and leave) and the city index fund: a real
 *    holder (`idx:<market>`) that buys a basket from the public float, charges
 *    a small yearly fee in shares and reinvests its dividends.
 *  - Holdings with cost basis, realised gains and dividends, compared with
 *    what the same money would have done in the index.
 *  - Limit orders, filled at a settlement when the price crosses; per-player
 *    monthly depth caps and price impact so nobody corners a stock; listed,
 *    profitable companies pay dividends; insiders are blacked out while a
 *    vote or an offer is open and in the last week before results.
 *
 * Investor-career worlds only (investorOn); money moves through the ledger
 * (the public float trades against the market's LP account, as in exits.ts).
 */
import { fullyDiluted, waterfall } from './captable.js';
import { INVESTOR } from './data/investor.js';
import type { MarketId } from './data/markets.js';
import { ensure, GameRuleError } from './errors.js';
import { EXITS, isListed, recordRealised, seedPublicMarket } from './exits.js';
import { achieve, getCompany, getMarket, holderAccount, notify } from './helpers.js';
import { newId } from './ids.js';
import { account, costIn, pay, payExact, transfer, withTx } from './ledger.js';
import { formatMoney } from './money.js';
import { investorOn } from './releases.js';
import {
  buyLimitShares,
  cityMultiplesOnce,
  homeFirst,
  homeMarketOf,
  stockAnalysis,
} from './stocks.js';
import type {
  Company,
  ExchangeState,
  Id,
  MarketState,
  Player,
  ShareOrder,
  World,
} from './types.js';

/** AI-listed companies per exchange in investor-career worlds. */
export const EXCHANGE_LISTINGS = 5;
/** Open limit orders per player. */
const MAX_OPEN_ORDERS = 10;
/** Index fund units start at this price (major units of the city's currency). */
const INDEX_UNIT_START = 100;

export const indexHolderId = (market: MarketId | string) => `idx:${market}`;

export const listedIn = (world: World, marketId: string): Company[] =>
  Object.values(world.companies)
    .filter((c) => c.market === marketId && isListed(c))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

const mcap = (c: Company, price = c.ipo?.price ?? 0) => price * fullyDiluted(c.capTable);

/** The exchange of a market, created (level 100) on first use. */
function exchangeOf(world: World, m: MarketState): ExchangeState {
  if (m.exchange) return m.exchange;
  const listed = listedIn(world, m.id);
  const total = listed.reduce((a, c) => a + mcap(c), 0);
  m.exchange = {
    level: 100,
    prevLevel: 100,
    history: [100],
    divisor: total > 0 ? total / 100 : 1,
    constituents: listed.map((c) => c.id),
    units: {},
    totalUnits: 0,
    unitCost: {},
    bench: {},
    realised: {},
    dividends: {},
    bought: { month: m.month, by: {} },
  };
  return m.exchange;
}

/** Investor-career worlds: each exchange has its AI listings and an index. */
export function ensureExchange(world: World, marketId: string) {
  if (!investorOn(world)) return;
  const m = world.markets[marketId as MarketId];
  if (!m) return;
  seedPublicMarket(world, marketId, EXCHANGE_LISTINGS);
  exchangeOf(world, m);
}

// ---------------------------------------------------------------- insiders

/** Founders, board members (themselves or a fund they run), mentors. */
function isInsider(world: World, p: Player, c: Company): boolean {
  if (c.founderIds.includes(p.id)) return true;
  const mine = (h: Id) => h === p.id || world.funds[h]?.managerId === p.id;
  if (c.board.some(mine)) return true;
  return Object.values(world.mentorships ?? {}).some(
    (x) => x.mentorId === p.id && x.companyId === c.id && x.status === 'active',
  );
}

/**
 * Why an insider can't trade right now (§7.2 "insider rules"), or null: a
 * vote or a sale offer is open, or results are due within the last quarter
 * of the month (known only when the clock settles the market).
 */
function blackoutReason(world: World, p: Player, c: Company, now?: number): string | null {
  if (!investorOn(world) || !isInsider(world, p, c)) return null;
  if (Object.values(world.votes).some((v) => v.companyId === c.id && v.status === 'open'))
    return `A vote on ${c.name} is open: insiders can’t trade until it closes.`;
  if (
    Object.values(world.deals).some(
      (d) => d.companyId === c.id && d.status === 'open' && d.terms.kind === 'acquisition',
    )
  )
    return `${c.name} has an open offer to buy it: insiders can’t trade until it’s settled.`;
  const m = getMarket(world, c.market);
  if (now !== undefined && m.settledAt !== undefined && m.monthMs)
    if (now >= m.settledAt + m.monthMs * 0.75)
      return `${c.name} reports at month end: insiders can’t trade in the last week before results.`;
  return null;
}

// ---------------------------------------------------------------- hooks for shares.buy / shares.sell

/** Before a buy: blackout and the monthly depth cap. Throws with a reason. */
export function checkBuy(world: World, me: Player, c: Company, shares: number, now?: number) {
  if (!investorOn(world)) return;
  const why = blackoutReason(world, me, c, now);
  ensure(!why, 'shares.blackout', why ?? '');
  const m = getMarket(world, c.market);
  const ex = exchangeOf(world, m);
  if (ex.bought.month !== m.month) ex.bought = { month: m.month, by: {} };
  const key = `${me.id}:${c.id}`;
  const mine = ex.bought.by[key] ?? 0;
  const float = c.capTable.holdings[`pub:${c.id}`]?.shares ?? 0;
  const allowed = Math.floor(INVESTOR.exchange.depthShare * (float + mine)) - mine;
  ensure(
    shares <= allowed,
    'shares.depth',
    allowed > 0
      ? `Too big for the market: at most ${allowed} shares of ${c.name} this month (about ${formatMoney(Math.round(allowed * (c.ipo?.price ?? 0)), m.data.currency)}).`
      : `You’ve bought all the ${c.name} shares the market allows this month.`,
  );
}

/** After a buy: price impact, depth used, and the index benchmark. */
export function afterBuy(
  world: World,
  me: Player,
  c: Company,
  shares: number,
  cost: number,
  personal = true,
) {
  if (!investorOn(world)) return;
  const m = getMarket(world, c.market);
  const ex = exchangeOf(world, m);
  const key = `${me.id}:${c.id}`;
  ex.bought.by[key] = (ex.bought.by[key] ?? 0) + shares;
  const ipo = c.ipo!;
  const fd = fullyDiluted(c.capTable);
  const price = ipo.price!;
  ipo.price = Math.min(price * (1 + (INVESTOR.exchange.impact * shares) / fd), price * 1.1);
  c.capTable.lastPrice = ipo.price;
  if (!personal) return;
  const b = (ex.bench[me.id] ??= { units: 0, since: m.month });
  b.units += cost / Math.max(0.0001, ex.level);
}

/** Before a sale: insiders wait out a blackout. */
export function checkSell(world: World, me: Player, c: Company, now?: number) {
  if (!investorOn(world)) return;
  const why = blackoutReason(world, me, c, now);
  ensure(!why, 'shares.blackout', why ?? '');
}

/** After a sale: realised gain, and the benchmark shrinks with the cost sold. */
export function afterSell(world: World, me: Player, c: Company, basisSold: number, gain: number) {
  if (!investorOn(world)) return;
  const m = getMarket(world, c.market);
  const ex = exchangeOf(world, m);
  ex.realised[me.id] = (ex.realised[me.id] ?? 0) + gain;
  const total = listedIn(world, m.id).reduce((a, x) => a + (x.ipo?.basis?.[me.id] ?? 0), 0);
  const before = total + basisSold;
  const b = ex.bench[me.id];
  if (b && before > 0) b.units *= Math.max(0, 1 - basisSold / before);
}

// ---------------------------------------------------------------- the index fund

const unitPrice = (world: World, m: MarketState, ex: ExchangeState) => {
  if (ex.totalUnits <= 0) return INDEX_UNIT_START * 100;
  return indexNav(world, m) / ex.totalUnits;
};

/** What the index fund holds, at today's prices (local minor units). */
export function indexNav(world: World, m: MarketState): number {
  const h = indexHolderId(m.id);
  return listedIn(world, m.id).reduce(
    (a, c) => a + (c.capTable.holdings[h]?.shares ?? 0) * (c.ipo?.price ?? 0),
    0,
  );
}

/** `index.buy`: put `amount` (the city's currency) into the city index fund. */
export function buyIndex(world: World, me: Player, marketId: MarketId, amount: number) {
  ensure(investorOn(world), 'index.off', 'The index fund isn’t open yet.');
  const m = getMarket(world, marketId);
  const ex = exchangeOf(world, m);
  const listed = listedIn(world, m.id).filter(
    (c) => (c.capTable.holdings[`pub:${c.id}`]?.shares ?? 0) > 0,
  );
  ensure(listed.length > 0, 'index.empty', 'Nothing is listed here yet.');
  ensure(amount > 0, 'index.amount', 'Say how much.');
  const total = listed.reduce((a, c) => a + mcap(c), 0);
  const price = unitPrice(world, m, ex);
  const h = indexHolderId(m.id);
  const buys: { c: Company; shares: number }[] = [];
  let cost = 0;
  for (const c of listed) {
    const p = c.ipo!.price!;
    const float = c.capTable.holdings[`pub:${c.id}`]!.shares;
    const shares = Math.min(float, Math.floor((amount * mcap(c)) / total / p));
    if (shares <= 0) continue;
    buys.push({ c, shares });
    cost += Math.round(shares * p);
  }
  ensure(cost > 0, 'index.tiny', 'Too small to buy a share of every company. Put in more.');
  const acc = account(world, me.accounts.local);
  ensure(
    acc.balance >= costIn(world, cost, m.data.currency, acc.currency),
    'index.funds',
    'Not enough money in your account.',
  );
  payExact(
    world,
    me.accounts.local,
    m.ext.lps,
    cost,
    `City index fund: ${m.data.name}`,
    m.month,
    'invested',
  );
  for (const { c, shares } of buys) {
    c.capTable.holdings[`pub:${c.id}`]!.shares -= shares;
    const mine = (c.capTable.holdings[h] ??= { shares: 0, kind: 'investor' });
    mine.shares += shares;
  }
  const units = cost / price;
  ex.units[me.id] = (ex.units[me.id] ?? 0) + units;
  ex.totalUnits += units;
  ex.unitCost[me.id] = (ex.unitCost[me.id] ?? 0) + cost;
  achieve(world, me, 'investor.index-fund', 'Bought the city index fund', m.month);
  return { cost, units: Math.round(units * 100) / 100, unitPrice: Math.round(price) };
}

/** `index.sell`: sell part of your index fund units (bps of your units). */
export function sellIndex(world: World, me: Player, marketId: MarketId, bps: number) {
  ensure(investorOn(world), 'index.off', 'The index fund isn’t open yet.');
  const m = getMarket(world, marketId);
  const ex = exchangeOf(world, m);
  const mine = ex.units[me.id] ?? 0;
  ensure(mine > 0, 'index.none', 'You hold no units of this index fund.');
  ensure(Number.isInteger(bps) && bps >= 1 && bps <= 10_000, 'index.pct', 'Pick how much to sell.');
  const units = (mine * bps) / 10_000;
  const share = units / ex.totalUnits;
  const h = indexHolderId(m.id);
  let gross = 0;
  for (const c of listedIn(world, m.id)) {
    const held = c.capTable.holdings[h];
    if (!held || held.shares <= 0) continue;
    const shares = Math.min(held.shares, Math.round(held.shares * share));
    if (shares <= 0) continue;
    held.shares -= shares;
    const pub = (c.capTable.holdings[`pub:${c.id}`] ??= { shares: 0, kind: 'investor' });
    pub.shares += shares;
    gross += Math.round(shares * c.ipo!.price!);
  }
  const basis = Math.round(((ex.unitCost[me.id] ?? 0) * bps) / 10_000);
  ex.units[me.id] = mine - units;
  ex.totalUnits -= units;
  ex.unitCost[me.id] = (ex.unitCost[me.id] ?? 0) - basis;
  if (ex.units[me.id]! < 1e-9) {
    delete ex.units[me.id];
    delete ex.unitCost[me.id];
  }
  const gain = Math.max(0, gross - basis);
  const tax = Math.round(gain * m.data.tax.capitalGains);
  withTx(world, { kind: 'sale' }, () => {
    transfer(
      world,
      m.ext.lps,
      m.ext.tax,
      tax,
      `Capital gains tax: ${m.data.name} index fund`,
      m.month,
    );
    pay(
      world,
      m.ext.lps,
      me.accounts.local,
      gross - tax,
      `City index fund sold: ${m.data.name}`,
      m.month,
      'move',
    );
  });
  recordRealised(world, me, m, gross, gain, tax);
  ex.realised[me.id] = (ex.realised[me.id] ?? 0) + (gross - basis);
  return { gross, tax, net: gross - tax, gain: gross - basis };
}

// ---------------------------------------------------------------- limit orders

/** `shares.order`: a limit order, filled at a settlement when the price crosses. */
export function placeOrder(
  world: World,
  me: Player,
  args: { companyId: Id; side: 'buy' | 'sell'; amount: number; limit: number },
) {
  ensure(investorOn(world), 'order.off', 'Limit orders aren’t open yet.');
  const c = getCompany(world, args.companyId);
  ensure(isListed(c), 'shares.notListed', 'This company isn’t on the stock market.');
  ensure(args.limit > 0, 'order.limit', 'Set a limit price.');
  if (args.side === 'buy') {
    ensure(args.amount > 0, 'order.amount', 'Say how much to spend.');
    ensure(
      !c.founderIds.includes(me.id),
      'shares.insider',
      'Founders can’t trade their own company’s shares this way.',
    );
  } else {
    ensure(
      Number.isInteger(args.amount) && args.amount >= 1 && args.amount <= 10_000,
      'order.amount',
      'Pick how much of your holding to sell.',
    );
    ensure(
      (c.capTable.holdings[me.id]?.shares ?? 0) > 0,
      'shares.none',
      'You hold no shares in this company.',
    );
  }
  const open = Object.values(world.orders ?? {}).filter(
    (o) => o.playerId === me.id && o.status === 'open',
  );
  ensure(open.length < MAX_OPEN_ORDERS, 'order.many', `At most ${MAX_OPEN_ORDERS} open orders.`);
  const m = getMarket(world, c.market);
  const order: ShareOrder = {
    id: newId(world, 'ord'),
    playerId: me.id,
    companyId: c.id,
    market: c.market,
    side: args.side,
    amount: args.amount,
    limit: args.limit,
    month: m.month,
    expiresMonth: m.month + INVESTOR.exchange.orderMonths,
    status: 'open',
  };
  (world.orders ??= {})[order.id] = order;
  return {
    orderId: order.id,
    message:
      args.side === 'buy'
        ? `Limit order placed: buy ${c.name} at ${formatMoney(Math.round(args.limit), m.data.currency)} or less. It fills at a month end.`
        : `Limit order placed: sell ${c.name} at ${formatMoney(Math.round(args.limit), m.data.currency)} or more. It fills at a month end.`,
  };
}

export function cancelOrder(world: World, me: Player, orderId: Id) {
  const o = world.orders?.[orderId];
  ensure(o && o.playerId === me.id, 'order.missing', 'Order not found.');
  ensure(o.status === 'open', 'order.closed', 'That order is closed.');
  o.status = 'cancelled';
  o.reason = 'Cancelled by you.';
  return { status: o.status };
}

type Trade = (
  world: World,
  me: Player,
  companyId: Id,
  amount: number,
  now?: number,
) => { shares: number; price?: number; gross?: number };

/** Fill open orders whose price crossed (after this month's prices). */
function fillOrders(world: World, m: MarketState, buy: Trade, sell: Trade) {
  for (const o of Object.values(world.orders ?? {})) {
    if (o.market !== m.id || o.status !== 'open') continue;
    const me = world.players[o.playerId];
    const c = world.companies[o.companyId];
    if (!me || !c || !isListed(c)) {
      o.status = 'cancelled';
      o.reason = 'The company left the market.';
      continue;
    }
    if (m.month > o.expiresMonth) {
      o.status = 'expired';
      continue;
    }
    const price = c.ipo!.price!;
    const crosses = o.side === 'buy' ? price <= o.limit : price >= o.limit;
    if (!crosses) continue;
    try {
      const r = o.side === 'buy' ? buy(world, me, c.id, o.amount) : sell(world, me, c.id, o.amount);
      o.status = 'filled';
      o.fill = { month: m.month, price, shares: r.shares };
      notify(world, me.id, {
        month: m.month,
        kind: 'deal',
        text: `Order filled: ${o.side === 'buy' ? 'bought' : 'sold'} ${r.shares} ${c.name} shares at ${formatMoney(Math.round(price), m.data.currency)}.`,
      });
    } catch (e) {
      if (!(e instanceof GameRuleError)) throw e;
      o.status = 'cancelled';
      o.reason = e.message;
      notify(world, me.id, {
        month: m.month,
        kind: 'deal',
        text: `Order for ${c.name} cancelled: ${e.message}`,
      });
    }
  }
}

// ---------------------------------------------------------------- settlement

/**
 * Dividends from listed, profitable companies (§7.2): a share of last month's
 * profit, pro rata to every holder. The index fund reinvests its share.
 * (Companies run by an AI CEO already pay theirs: travel.ts.)
 */
export function listedDividends(world: World, c: Company, month: number) {
  if (c.aiCeo || !isListed(c)) return;
  const last = c.finance.history[c.finance.history.length - 1];
  if (!last || last.net <= 0) return;
  const pool = Math.min(
    Math.round(last.net * INVESTOR.exchange.dividendShare),
    account(world, c.account).balance,
  );
  if (pool <= 0) return;
  const m = getMarket(world, c.market);
  const ex = exchangeOf(world, m);
  const lines = waterfall({ ...c.capTable, preferences: [], safes: [] }, pool);
  const idx = indexHolderId(m.id);
  for (const line of lines) {
    if (line.total <= 0) continue;
    if (line.holderId === idx) {
      // Reinvested: the fund buys more of the company from the float.
      const price = c.ipo!.price!;
      const pub = c.capTable.holdings[`pub:${c.id}`];
      const shares = Math.min(pub?.shares ?? 0, Math.floor(line.total / price));
      transfer(world, c.account, m.ext.lps, line.total, `Dividend: ${c.name} (index fund)`, month);
      if (shares > 0 && pub) {
        pub.shares -= shares;
        c.capTable.holdings[idx]!.shares += shares;
      }
      continue;
    }
    const pl = world.players[line.holderId];
    const to = holderAccount(world, m, line.holderId);
    const paid = pay(world, c.account, to, line.total, `Dividend: ${c.name}`, month);
    if (pl && !pl.ai) {
      ex.dividends[pl.id] = (ex.dividends[pl.id] ?? 0) + line.total;
      notify(world, pl.id, {
        month,
        kind: 'deal',
        text: `Dividend from ${c.name}: ${formatMoney(paid, account(world, to).currency)}.`,
      });
    }
    const pos = world.positions[`${line.holderId}:${c.id}`];
    if (pos) pos.returned += line.total;
  }
}

/**
 * Month end for an exchange (after listed prices moved): dividends, the
 * index level, the index fund's fee, limit orders, and the beat-the-index
 * milestone.
 */
export function settleExchange(
  world: World,
  marketId: MarketId,
  month: number,
  trades: { buy: Trade; sell: Trade },
) {
  if (!investorOn(world)) return;
  ensureExchange(world, marketId);
  const m = getMarket(world, marketId);
  const ex = exchangeOf(world, m);
  for (const c of listedIn(world, marketId)) listedDividends(world, c, month);
  // The level moves with the constituents that were in it; then the new set takes over.
  let now = 0;
  let before = 0;
  for (const id of ex.constituents) {
    const c = world.companies[id];
    if (!c || !isListed(c)) continue;
    now += mcap(c);
    before += mcap(c, c.ipo!.prevPrice ?? c.ipo!.price);
  }
  ex.prevLevel = ex.level;
  if (before > 0) ex.level = ex.level * (now / before);
  ex.history.push(Math.round(ex.level * 100) / 100);
  if (ex.history.length > EXITS.ipo.historyLimit)
    ex.history.splice(0, ex.history.length - EXITS.ipo.historyLimit);
  const listed = listedIn(world, marketId);
  ex.constituents = listed.map((c) => c.id);
  const total = listed.reduce((a, c) => a + mcap(c), 0);
  ex.divisor = total > 0 ? total / ex.level : ex.divisor;
  // The index fund's fee: a twelfth of the yearly rate, in shares back to the float.
  const h = indexHolderId(marketId);
  for (const c of listed) {
    const held = c.capTable.holdings[h];
    if (!held || held.shares <= 0) continue;
    const owed = (ex.feeOwed ??= {});
    owed[c.id] = (owed[c.id] ?? 0) + (held.shares * INVESTOR.exchange.indexFeeYear) / 12;
    const fee = Math.min(held.shares, Math.floor(owed[c.id]!));
    if (fee <= 0) continue;
    owed[c.id]! -= fee;
    held.shares -= fee;
    c.capTable.holdings[`pub:${c.id}`]!.shares += fee;
  }
  fillOrders(world, m, trades.buy, trades.sell);
  // Beat the city index over 12 months (§10.2).
  for (const [pid, b] of Object.entries(ex.bench)) {
    const p = world.players[pid];
    if (!p || p.ai || month - b.since < 12 || b.units <= 0) continue;
    const s = holdingsSummary(world, p, m);
    if (s.value > 0 && s.value + s.realised + s.dividends > s.benchValue)
      achieve(world, p, 'investor.beat-index', 'Beat the city index over 12 months', m.month);
  }
}

/** A player's listed shares on one exchange: value, cost, gains and the index benchmark. */
function holdingsSummary(world: World, p: Player, m: MarketState) {
  const ex = m.exchange;
  let value = 0;
  let cost = 0;
  for (const c of listedIn(world, m.id)) {
    const shares = c.capTable.holdings[p.id]?.shares ?? 0;
    if (shares <= 0) continue;
    value += Math.round(shares * (c.ipo?.price ?? 0));
    cost += c.ipo?.basis?.[p.id] ?? 0;
  }
  const benchValue = Math.round((ex?.bench[p.id]?.units ?? 0) * (ex?.level ?? 100));
  return {
    value,
    cost,
    unrealised: value - cost,
    realised: ex?.realised[p.id] ?? 0,
    dividends: ex?.dividends[p.id] ?? 0,
    benchValue,
    /** Your shares' return vs the same money in the index, percentage points. */
    yourPct: cost > 0 ? Math.round(((value - cost) / cost) * 1000) / 10 : 0,
    indexPct: cost > 0 ? Math.round(((benchValue - cost) / cost) * 1000) / 10 : 0,
    since: ex?.bench[p.id]?.since ?? null,
  };
}

// ---------------------------------------------------------------- view

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * `view.exchange`: every open city's exchange, the viewer's own city first,
 * with the viewer's holdings, units and orders, and an analysis per listing.
 */
export function exchangeView(world: World, p: Player, now?: number) {
  if (!investorOn(world) || p.ai) return null;
  // Crossover (public-equity) funds you run trade here too.
  const crossover = Object.values(world.funds).filter(
    (f) =>
      f.managerId === p.id &&
      f.lp?.strategy === 'public' &&
      (f.lp.stage === 'investing' || f.lp.stage === 'harvest' || f.lp.stage === 'extended'),
  );
  const multiples = cityMultiplesOnce(world);
  const markets = Object.values(world.markets)
    .filter((m): m is MarketState => !!m && !!m.exchange)
    .map((m) => {
      const ex = m.exchange!;
      const nav = indexNav(world, m);
      const unit = ex.totalUnits > 0 ? nav / ex.totalUnits : INDEX_UNIT_START * 100;
      const units = ex.units[p.id] ?? 0;
      return {
        market: m.id,
        city: m.data.name,
        country: m.data.country,
        home: m.id === homeMarketOf(p),
        currency: m.data.currency,
        level: r2(ex.level),
        changePct: ex.prevLevel ? r2(((ex.level - ex.prevLevel) / ex.prevLevel) * 100) : 0,
        history: ex.history,
        indexFund: {
          unitPrice: Math.round(unit),
          nav: Math.round(nav),
          yourUnits: r2(units),
          yourValue: Math.round(units * unit),
          yourCost: Math.round(ex.unitCost[p.id] ?? 0),
          feeYear: INVESTOR.exchange.indexFeeYear,
        },
        listings: listedIn(world, m.id).map((c) => {
          const last = c.finance.history[c.finance.history.length - 1];
          const revenue = last?.revenue ?? 0;
          const cap = Math.round(mcap(c));
          const float = c.capTable.holdings[`pub:${c.id}`]?.shares ?? 0;
          const maxShares = buyLimitShares(world, p, c);
          return {
            companyId: c.id,
            name: c.name,
            ai: c.ai,
            industry: c.industry,
            price: r2(c.ipo!.price ?? 0),
            changePct: c.ipo!.prevPrice
              ? r2(((c.ipo!.price! - c.ipo!.prevPrice) / c.ipo!.prevPrice) * 100)
              : 0,
            marketCap: cap,
            monthlyRevenue: revenue,
            profit: last?.net ?? 0,
            /** Price to yearly sales. */
            ps: revenue > 0 ? r2(cap / (revenue * 12)) : null,
            weightPct: ex.divisor > 0 ? r2((cap / (ex.level * ex.divisor)) * 100) : 0,
            news: m.news
              .filter((n) => n.subject.kind === 'company' && n.subject.id === c.id)
              .slice(0, 2)
              .map((n) => n.headline),
            yourShares: c.capTable.holdings[p.id]?.shares ?? 0,
            yourCost: c.ipo!.basis?.[p.id] ?? 0,
            /** Most you can buy this month (depth cap). */
            maxBuyShares: maxShares,
            blackout: blackoutReason(world, p, c, now),
            insider: isInsider(world, p, c),
            isFounder: c.founderIds.includes(p.id),
            lockedUntil: (c.ipo!.lockups?.[p.id] ?? 0) > m.month ? c.ipo!.lockups![p.id]! : null,
            history: (c.ipo!.history ?? []).map(r2),
            floatShares: float,
            /** Your crossover funds' holdings here (Phase 6). */
            fundShares: crossover.map((f) => ({
              fundId: f.id,
              name: f.name,
              shares: c.capTable.holdings[f.id]?.shares ?? 0,
            })),
            analysis: stockAnalysis(world, p, c, multiples),
          };
        }),
        holdings: holdingsSummary(world, p, m),
      };
    })
    .sort((a, b) => homeFirst(p, a, b));
  const orders = Object.values(world.orders ?? {})
    .filter((o) => o.playerId === p.id)
    .sort((a, b) => b.month - a.month || (a.id < b.id ? 1 : -1))
    .slice(0, 20)
    .map((o) => ({
      ...o,
      companyName: world.companies[o.companyId]?.name ?? '',
      currency: getMarket(world, o.market).data.currency,
    }));
  return {
    markets,
    orders,
    rules: {
      depthShare: INVESTOR.exchange.depthShare,
      brokerBps: EXITS.ipo.brokerBps,
      orderMonths: INVESTOR.exchange.orderMonths,
      dividendShare: INVESTOR.exchange.dividendShare,
      indexFeeYear: INVESTOR.exchange.indexFeeYear,
    },
  };
}

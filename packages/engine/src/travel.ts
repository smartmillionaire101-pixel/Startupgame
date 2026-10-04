/**
 * Travel and relocation (§14).
 *
 * - Travel: a short trip to another market costs money and hours. Nothing
 *   transfers; the player returns home. A trip is required at least once
 *   before investing or acquiring across markets, and lets a founder pitch
 *   that market's investors during the trip month.
 * - Relocation: permanent, at the cost of half of everything. The lost half
 *   goes to the central bank of the market being left. Companies left behind
 *   are run by remaining co-founders or an AI CEO, and pay dividends only
 *   while profitable.
 */
import type { MarketId } from './data/markets.js';
import { ensure } from './errors.js';
import { holderAccount, getMarket, notify, spendHours, usdToLocal } from './helpers.js';
import { account, convert, openAccount, pay, transfer } from './ledger.js';
import { clamp } from './math.js';
import { formatMoney } from './money.js';
import { checkName, normaliseName } from './names.js';
import { waterfall } from './captable.js';
import type { Company, Player, World } from './types.js';

export const TRIP_HOURS = 40;

const REGION: Record<MarketId, string> = {
  lagos: 'west-africa',
  accra: 'west-africa',
  freetown: 'west-africa',
  nairobi: 'east-africa',
  kigali: 'east-africa',
  johannesburg: 'southern-africa',
  cairo: 'north-africa',
  dubai: 'gulf',
  london: 'europe',
  'san-francisco': 'north-america',
};

/** Round-trip cost in USD: flights, a hotel and a week of meetings. */
export function tripCostUsd(from: MarketId, to: MarketId): number {
  if (REGION[from] === REGION[to]) return 500;
  const africa = (m: MarketId) => REGION[m]!.endsWith('africa');
  if (africa(from) && africa(to)) return 1_200;
  return 2_200;
}

/** Has the player ever been to this market (home counts)? */
export const hasVisited = (p: Player, market: MarketId) =>
  p.market === market || p.visited[market] !== undefined;

/** Is the player on a trip to this market this month? */
export const isVisiting = (world: World, p: Player, market: MarketId) =>
  p.market === market || p.visited[market] === getMarket(world, p.market).month;

export function travel(world: World, p: Player, to: MarketId) {
  const home = getMarket(world, p.market);
  ensure(to !== p.market, 'travel.home', 'You’re already here.');
  ensure(world.markets[to], 'travel.closed', 'That market isn’t open yet.');
  ensure(p.visited[to] !== home.month, 'travel.again', 'You’re already on that trip this month.');
  spendHours(p, TRIP_HOURS, 'A trip');
  const cost = usdToLocal(world, home, tripCostUsd(p.market, to));
  transfer(
    world,
    p.accounts.local,
    home.ext.suppliers,
    cost,
    `Trip to ${getMarket(world, to).data.name}`,
    home.month,
  );
  // Your company or fund gets less attention while you're away.
  p.energy = clamp(p.energy - 8, 0, 100);
  p.visited[to] = home.month;
  return {
    cost,
    text: `Trip to ${getMarket(world, to).data.name} booked: ${formatMoney(cost, home.data.currency)}, ${TRIP_HOURS}h.`,
  };
}

/** Holder id for shares lost to a market's central bank on relocation. */
export const centralBankHolderId = (market: MarketId) => `cb:${market}`;

/**
 * Relocate permanently. Requires clean books: no personal loans and no
 * personal guarantees outstanding (you can't move away from your debts).
 */
export function relocate(world: World, p: Player, to: MarketId, newHandle: string | undefined) {
  const from = getMarket(world, p.market);
  const dest = world.markets[to];
  ensure(dest, 'relocate.closed', 'That market isn’t open yet.');
  ensure(to !== p.market, 'relocate.home', 'You already live here.');
  ensure(p.loans.length === 0, 'relocate.loans', 'Repay your personal loans before relocating.');
  const guaranteed = Object.values(world.companies).some((c) =>
    c.finance.loans.some((l) => l.personalGuarantee === p.id && l.outstanding > 0),
  );
  ensure(!guaranteed, 'relocate.guarantee', 'You still guarantee a company loan. Settle it first.');

  // New identity in the destination market: handles are unique per market.
  const handle = newHandle ?? p.handle;
  const check = checkName(handle, { taken: {}, kind: 'handle' });
  if (!check.ok) ensure(false, 'relocate.handle', check.reason);
  const key = `@${normaliseName(handle)}`;
  const destNames = (world.names[to] ??= {});
  ensure(
    !destNames[key] || destNames[key] === p.id,
    'relocate.handle',
    'That handle is taken there. Pick another.',
  );

  const month = from.month;
  // 1. Cash: half to the central bank of the market being left, the rest moves with you.
  const oldLocal = p.accounts.local;
  const cash = account(world, oldLocal).balance;
  const lost = Math.floor(cash / 2);
  transfer(world, oldLocal, from.ext.tax, lost, 'Relocation: half to the central bank', month);
  const newLocal = openAccount(world, {
    currency: dest.data.currency,
    market: to,
    label: `${p.name} personal`,
  });
  const moved = account(world, oldLocal).balance;
  const received =
    moved > 0 ? convert(world, oldLocal, newLocal, moved, 'Relocation: savings moved', month) : 0;
  if (p.accounts.usd) {
    const usd = account(world, p.accounts.usd).balance;
    transfer(
      world,
      p.accounts.usd,
      world.usdExt.genesis,
      Math.floor(usd / 2),
      'Relocation: half to the central bank',
      month,
    );
  }
  p.accounts.local = newLocal;

  // 2. Shares and SAFEs everywhere: half to the old market's central bank.
  const cb = centralBankHolderId(from.id);
  for (const c of Object.values(world.companies)) {
    if (c.status !== 'active') continue;
    const h = c.capTable.holdings[p.id];
    if (h && h.shares > 0) {
      const half = Math.floor(h.shares / 2);
      h.shares -= half;
      const bh = (c.capTable.holdings[cb] ??= { shares: 0, kind: 'investor' });
      bh.shares += half;
      // Keep a portfolio record so the remaining stake is visible.
      world.positions[`${p.id}:${c.id}`] ??= {
        investorId: p.id,
        companyId: c.id,
        invested: 0,
        returned: 0,
        month,
        writtenOff: false,
      };
    }
    for (const s of c.capTable.safes.filter((x) => x.holderId === p.id)) {
      const half = Math.floor(s.amount / 2);
      s.amount -= half;
      c.capTable.safes.push({ holderId: cb, amount: half, cap: s.cap, month: s.month });
    }
    for (const pref of c.capTable.preferences.filter((x) => x.holderId === p.id)) {
      const half = Math.floor(pref.shares / 2);
      pref.shares -= half;
      const inv = Math.floor(pref.invested / 2);
      pref.invested -= inv;
      c.capTable.preferences.push({ ...pref, holderId: cb, shares: half, invested: inv });
    }
    // 3. Who runs what's left behind.
    if (c.founderIds.includes(p.id)) {
      c.founderIds = c.founderIds.filter((id) => id !== p.id);
      p.companyIds = p.companyIds.filter((id) => id !== c.id);
      if (c.founderIds.length === 0) c.aiCeo = true;
      for (const fid of c.founderIds)
        notify(world, fid, {
          month,
          kind: 'system',
          text: `${p.name} relocated and left ${c.name}. You’re running it now.`,
        });
    }
  }

  // Investors: fund stakes stay; AI LPs in the old market lose confidence.
  if (p.investor) {
    p.investor.lpCredibility = clamp(p.investor.lpCredibility - 0.2, 0, 1);
    const fund = p.investor.fundId ? world.funds[p.investor.fundId] : undefined;
    if (fund) fund.mood = clamp(fund.mood - 0.3, 0.5, 1.5);
  }

  // Open business in the old market is withdrawn.
  for (const d of Object.values(world.deals)) {
    if (
      d.status === 'open' &&
      d.market === from.id &&
      (d.proposer.id === p.id || d.counterparty.id === p.id)
    )
      d.status = 'withdrawn';
  }
  for (const inv of Object.values(world.media))
    if (inv.playerId === p.id && ['invited', 'questions', 'preview'].includes(inv.status))
      inv.status = 'pulled';

  // 4. Start from scratch in the new market.
  for (const [k, v] of Object.entries(world.names[from.id] ?? {}))
    if (v === p.id && k.startsWith('@')) delete world.names[from.id]![k];
  destNames[key] = p.id;
  p.handle = handle;
  p.market = to;
  p.visited[from.id] = month;
  p.diligence = {};
  p.hours.used = p.hours.available;
  notify(world, p.id, {
    month: dest.month,
    kind: 'system',
    text: `Welcome to ${dest.data.name}. You arrived with ${formatMoney(received, dest.data.currency)}; half of everything stayed with the central bank in ${from.data.name}.`,
  });
  return { received, lost };
}

/**
 * Companies run by an AI CEO pay out part of their profit as dividends, only
 * while profitable (§14 "pay dividends only while it is profitable").
 */
export const DIVIDEND_SHARE = 0.25;

export function payDividends(world: World, c: Company, month: number) {
  if (!c.aiCeo || c.status !== 'active') return;
  const last = c.finance.history[c.finance.history.length - 1];
  if (!last || last.net <= 0) return;
  const pool = Math.min(Math.round(last.net * DIVIDEND_SHARE), account(world, c.account).balance);
  if (pool <= 0) return;
  const m = getMarket(world, c.market);
  // Pro rata to every holder as if converting to common (no preferences on dividends).
  const lines = waterfall({ ...c.capTable, preferences: [], safes: [] }, pool);
  for (const line of lines) {
    if (line.total <= 0) continue;
    const pl = world.players[line.holderId];
    const to = holderAccount(world, m, line.holderId);
    const paid = pay(world, c.account, to, line.total, `Dividend: ${c.name}`, month);
    if (pl && !pl.ai)
      notify(world, pl.id, {
        month,
        kind: 'deal',
        text: `Dividend from ${c.name}: ${formatMoney(paid, account(world, to).currency)}.`,
      });
    const pos = world.positions[`${line.holderId}:${c.id}`];
    if (pos) pos.returned += line.total;
  }
}

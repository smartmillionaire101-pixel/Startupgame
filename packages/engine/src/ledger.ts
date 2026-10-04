/**
 * Double-entry ledger. Every money movement is a transfer between two accounts
 * in the same currency, so money is conserved: the sum of all balances in a
 * currency (including the external "outside world" accounts) is always zero.
 * Currency conversion moves money through per-currency FX desk accounts.
 *
 * This invariant is property-tested (test/invariants.test.ts).
 */
import { fail } from './errors.js';
import { newId } from './ids.js';
import type { Currency } from './money.js';
import type { MarketId } from './data/markets.js';
import type { Account, Id, World } from './types.js';

const RECENT_LIMIT = 30;

export function openAccount(
  world: World,
  opts: { currency: Currency; market: MarketId; label: string; external?: boolean; id?: Id },
): Id {
  const id = opts.id ?? newId(world, 'acc');
  world.accounts[id] = {
    id,
    currency: opts.currency,
    market: opts.market,
    balance: 0,
    external: opts.external ?? false,
    label: opts.label,
    recent: [],
  };
  return id;
}

export function account(world: World, id: Id): Account {
  const acc = world.accounts[id];
  if (!acc) fail('account.missing', `Unknown account ${id}`);
  return acc;
}

export const balance = (world: World, id: Id): number => account(world, id).balance;

function record(acc: Account, month: number, amount: number, memo: string) {
  acc.recent.unshift({ month, amount, memo });
  if (acc.recent.length > RECENT_LIMIT) acc.recent.length = RECENT_LIMIT;
}

/**
 * Move `amount` minor units. Fails (atomically, nothing moves) if a non-external
 * source would go negative, or currencies differ. Zero transfers are no-ops.
 */
export function transfer(
  world: World,
  fromId: Id,
  toId: Id,
  amount: number,
  memo: string,
  month: number,
): void {
  if (!Number.isInteger(amount) || amount < 0) fail('ledger.amount', `Invalid amount ${amount}`);
  if (amount === 0) return;
  const from = account(world, fromId);
  const to = account(world, toId);
  if (from.currency !== to.currency) fail('ledger.currency', 'Currencies differ; convert first');
  if (!from.external && from.balance - amount < -(from.overdraftLimit ?? 0))
    fail('ledger.funds', 'Not enough money in the account');
  from.balance -= amount;
  to.balance += amount;
  record(from, month, -amount, memo);
  record(to, month, amount, memo);
}

/** Transfer as much as possible up to `amount`; returns what actually moved. */
export function transferUpTo(
  world: World,
  fromId: Id,
  toId: Id,
  amount: number,
  memo: string,
  month: number,
): number {
  const from = account(world, fromId);
  const paid = from.external ? amount : Math.max(0, Math.min(amount, from.balance));
  transfer(world, fromId, toId, paid, memo, month);
  return paid;
}

/** Units of `to` per 1 unit of `from`, using official rates from market data. */
export function fxRate(world: World, from: Currency, to: Currency): number {
  if (from === to) return 1;
  const unitsPerUsd = (c: Currency): number => {
    if (c === 'USD') return 1;
    const m = Object.values(world.markets).find((mk) => mk.data.currency === c);
    if (!m) fail('fx.currency', `No market quotes ${c}`);
    return m.data.unitsPerUsd;
  };
  return unitsPerUsd(to) / unitsPerUsd(from);
}

export function fxFeeBps(world: World, a: Currency, b: Currency): number {
  const fee = (c: Currency) =>
    Object.values(world.markets).find((m) => m.data.currency === c)?.data.fxFeeBps ?? 0;
  return Math.max(fee(a), fee(b));
}

/**
 * The external FX desk for a currency. Dollars always go through the world's
 * USD desk, including in a dollar market (San Francisco): its local account
 * *is* a USD account, so there is one dollar pool and one dollar desk.
 */
const fxDesk = (world: World, currency: Currency): Id => {
  if (currency === 'USD') return world.usdExt.fx;
  const m = Object.values(world.markets).find((mk) => mk.data.currency === currency);
  if (!m) fail('fx.currency', `No FX desk for ${currency}`);
  return m.ext.fx;
};

/**
 * Convert `amount` (in the source account's currency) into the target account,
 * at the official rate minus the bank's conversion fee. Returns amount received.
 */
export function convert(
  world: World,
  fromId: Id,
  toId: Id,
  amount: number,
  memo: string,
  month: number,
): number {
  const from = account(world, fromId);
  const to = account(world, toId);
  // Same currency (e.g. a dollar account in a dollar market): no desk, no fee.
  if (from.currency === to.currency) {
    transfer(world, fromId, toId, amount, memo, month);
    return amount;
  }
  const rate = fxRate(world, from.currency, to.currency);
  const fee = fxFeeBps(world, from.currency, to.currency) / 10_000;
  const received = Math.floor(amount * rate * (1 - fee));
  transfer(world, fromId, fxDesk(world, from.currency), amount, memo, month);
  transfer(world, fxDesk(world, to.currency), toId, received, memo, month);
  return received;
}

/** Value of an amount in another currency at the official rate (no fee), for display/valuation. */
export function valueIn(world: World, amount: number, from: Currency, to: Currency): number {
  return Math.round(amount * fxRate(world, from, to));
}

/**
 * Pay someone, converting if their account is in another currency (cross-
 * market investors, relocated players). Returns what they received.
 */
export function pay(
  world: World,
  fromId: Id,
  toId: Id,
  amount: number,
  memo: string,
  month: number,
): number {
  if (account(world, fromId).currency === account(world, toId).currency) {
    transfer(world, fromId, toId, amount, memo, month);
    return amount;
  }
  return convert(world, fromId, toId, amount, memo, month);
}

/**
 * Deliver exactly `target` (in the destination currency) from a source account
 * that may hold another currency, converting at the official rate plus fee.
 * Fails atomically if the source can't cover it.
 */
export function payExact(
  world: World,
  fromId: Id,
  toId: Id,
  target: number,
  memo: string,
  month: number,
): number {
  const from = account(world, fromId);
  const to = account(world, toId);
  if (from.currency === to.currency) {
    transfer(world, fromId, toId, target, memo, month);
    return target;
  }
  const rate =
    fxRate(world, from.currency, to.currency) *
    (1 - fxFeeBps(world, from.currency, to.currency) / 10_000);
  const needed = Math.ceil(target / rate) + 1;
  if (!from.external && from.balance < needed)
    fail('ledger.funds', 'Not enough money in the account');
  transfer(world, fromId, fxDesk(world, from.currency), needed, memo, month);
  transfer(world, fxDesk(world, to.currency), toId, target, memo, month);
  return needed;
}

/** Source-currency cost of delivering `target` in another currency (for affordability checks). */
export function costIn(
  world: World,
  target: number,
  toCurrency: Currency,
  fromCurrency: Currency,
): number {
  if (toCurrency === fromCurrency) return target;
  const rate =
    fxRate(world, fromCurrency, toCurrency) *
    (1 - fxFeeBps(world, fromCurrency, toCurrency) / 10_000);
  return Math.ceil(target / rate) + 1;
}

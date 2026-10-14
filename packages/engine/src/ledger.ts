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
import type { Account, Id, TxFx, TxKind, TxRecord, World } from './types.js';

const RECENT_LIMIT = 30;
/** Lines a human player's own accounts keep: their bank statement. */
export const STATEMENT_HISTORY = 200;
export type MoneyPurpose = 'spent' | 'sent' | 'invested' | 'capital' | 'move';

/** Count the outgoing leg once, in its source currency. AI cash is excluded. */
function recordActivity(
  world: World,
  from: Account,
  amount: number,
  memo: string,
  kind: MoneyPurpose,
) {
  const stats = world.activity;
  if (!stats || kind === 'move' || from.external) return;
  let player = Object.values(world.players).find(
    (p) => !p.ai && (p.accounts.local === from.id || p.accounts.usd === from.id),
  );
  if (!player && kind === 'invested') {
    const fund = Object.values(world.funds).find(
      (f) => f.account === from.id && !f.ai && f.managerId,
    );
    if (fund?.managerId) player = world.players[fund.managerId];
  }
  if (!player || player.ai) return;
  const totals = (stats.totals[from.currency] ??= { spent: 0, sent: 0, invested: 0, capital: 0 });
  totals[kind] += amount;
  stats.recent.unshift({
    id: ++stats.sequence,
    at: stats.at,
    playerId: player.id,
    kind,
    currency: from.currency,
    amount,
    memo,
  });
  stats.recent.length = Math.min(stats.recent.length, 100);
}

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

/**
 * A human player's own accounts keep a long statement. Set when they open;
 * saves from before statements pick it up at the player's next command.
 */
export function keepStatement(
  world: World,
  p: { ai: boolean; accounts: { local: Id; usd?: Id } },
): void {
  if (p.ai) return;
  for (const id of [p.accounts.local, p.accounts.usd]) {
    const acc = id ? world.accounts[id] : undefined;
    if (acc && acc.history !== STATEMENT_HISTORY) acc.history = STATEMENT_HISTORY;
  }
}

// ---------------------------------------------------------------- Transactions

/**
 * What the code moving money says about it, for statements and receipts. Every
 * transfer made inside `withTx` shares one transaction number, so a payment,
 * its fee and its currency conversion read as one receipt. Contexts nest: an
 * inner one keeps the outer number and overrides the rest. They live only for
 * the duration of a synchronous call, never in the world.
 */
export interface TxMeta {
  kind?: TxKind;
  note?: string;
  fee?: boolean;
  /** The real payer and payee, when the money passes through an FX desk. */
  from?: Id;
  to?: Id;
}

const txStack: (TxMeta & { tx: number })[] = [];

const nextTx = (world: World): number => (world.txSeq = (world.txSeq ?? 0) + 1);

/** A transaction number as players see it on receipts. */
export const txRef = (tx: number): string => `TX${String(tx).padStart(8, '0')}`;

/** The number in a reference from `txRef` (null if it isn't one). */
export function parseTxRef(ref: string): number | null {
  const m = /^TX(\d{1,15})$/.exec(ref);
  return m ? Number(m[1]) : null;
}

/** Run `fn` as one transaction; returns what it returns. `fn` gets the receipt reference. */
export function withTx<T>(world: World, meta: TxMeta, fn: (ref: string) => T): T {
  const parent = txStack[txStack.length - 1];
  const tx = parent?.tx ?? nextTx(world);
  txStack.push({ ...parent, ...meta, tx });
  try {
    return fn(txRef(tx));
  } finally {
    txStack.pop();
  }
}

function record(acc: Account, month: number, amount: number, memo: string, extra?: TxRecord) {
  acc.recent.unshift(extra && !acc.external ? extra : { month, amount, memo });
  const keep = acc.history ?? RECENT_LIMIT;
  if (acc.recent.length > keep) acc.recent.length = keep;
}

/** Add details to the line a transfer just wrote (FX on a conversion). */
function annotate(world: World, id: Id, patch: Partial<TxRecord>) {
  const acc = account(world, id);
  const line = acc.recent[0];
  if (line && !acc.external) Object.assign(line, patch);
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
  purpose: MoneyPurpose = 'spent',
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
  const ctx = txStack[txStack.length - 1];
  const tx = ctx?.tx ?? nextTx(world);
  const at = world.activity?.at;
  const line = (sign: 1 | -1, peer: Id): TxRecord => ({
    month,
    amount: sign * amount,
    memo,
    tx,
    ...(at !== undefined ? { at } : {}),
    peer,
    ...(ctx?.kind ? { kind: ctx.kind } : {}),
    ...(ctx?.note ? { note: ctx.note } : {}),
    ...(ctx?.fee ? { fee: true } : {}),
  });
  record(from, month, -amount, memo, line(-1, ctx?.to ?? toId));
  record(to, month, amount, memo, line(1, ctx?.from ?? fromId));
  recordActivity(world, from, amount, memo, purpose);
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
  purpose: MoneyPurpose = 'move',
): number {
  const from = account(world, fromId);
  const to = account(world, toId);
  // Same currency (e.g. a dollar account in a dollar market): no desk, no fee.
  if (from.currency === to.currency) {
    transfer(world, fromId, toId, amount, memo, month, purpose);
    return amount;
  }
  const rate = fxRate(world, from.currency, to.currency);
  const feeBps = fxFeeBps(world, from.currency, to.currency);
  const received = Math.floor(amount * rate * (1 - feeBps / 10_000));
  throughDesks(world, fromId, toId, amount, received, rate, feeBps, memo, month, purpose);
  return received;
}

/** The two legs of a conversion, recorded as one transaction between the real parties. */
function throughDesks(
  world: World,
  fromId: Id,
  toId: Id,
  sent: number,
  received: number,
  rate: number,
  feeBps: number,
  memo: string,
  month: number,
  purpose: MoneyPurpose,
) {
  const from = account(world, fromId);
  const to = account(world, toId);
  const fx: TxFx = { from: from.currency, to: to.currency, rate, feeBps, sent, received };
  withTx(world, { from: fromId, to: toId }, () => {
    transfer(world, fromId, fxDesk(world, from.currency), sent, memo, month, purpose);
    if (sent > 0) annotate(world, fromId, { fx });
    transfer(world, fxDesk(world, to.currency), toId, received, memo, month, purpose);
    if (received > 0) annotate(world, toId, { fx });
  });
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
  purpose: MoneyPurpose = 'spent',
): number {
  if (account(world, fromId).currency === account(world, toId).currency) {
    transfer(world, fromId, toId, amount, memo, month, purpose);
    return amount;
  }
  return convert(world, fromId, toId, amount, memo, month, purpose);
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
  purpose: MoneyPurpose = 'spent',
): number {
  const from = account(world, fromId);
  const to = account(world, toId);
  if (from.currency === to.currency) {
    transfer(world, fromId, toId, target, memo, month, purpose);
    return target;
  }
  const official = fxRate(world, from.currency, to.currency);
  const feeBps = fxFeeBps(world, from.currency, to.currency);
  const rate = official * (1 - feeBps / 10_000);
  const needed = Math.ceil(target / rate) + 1;
  if (!from.external && from.balance < needed)
    fail('ledger.funds', 'Not enough money in the account');
  throughDesks(world, fromId, toId, needed, target, official, feeBps, memo, month, purpose);
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

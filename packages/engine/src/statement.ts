/**
 * Bank statements and receipts. The ledger is the source of truth: every
 * movement on an account is a line in its history (`Account.recent`), with
 * the transaction number, the other party's account, the note and any
 * currency conversion (see ledger.ts). This module only reads.
 *
 * Privacy: a player only ever sees lines of their own accounts. The other
 * party appears by display name and kind (and player id, already public in
 * contacts); never their account, balance or other lines.
 */
import { parseTxRef, txRef } from './ledger.js';
import type { Currency } from './money.js';
import type { ExternalPurpose, Id, Player, TxFx, TxKind, TxRecord, World } from './types.js';

export type CounterpartyKind =
  'player' | 'company' | 'business' | 'bank' | 'fund' | 'game' | 'fee' | 'tax' | 'world' | 'self';

export interface Counterparty {
  name: string;
  kind: CounterpartyKind;
  /** Another player (to open their profile or chat). */
  playerId?: Id;
}

export interface StatementLine {
  /** Receipt reference (`TX00000123`), shared by every leg of one transaction; null on old lines. */
  ref: string | null;
  /** Unique within the account's statement (for list keys). */
  key: string;
  month: number;
  /** Wall-clock time (ms), when known. */
  at: number | null;
  description: string;
  kind: TxKind;
  counterparty: Counterparty;
  /** Signed, in the account's currency: in is positive. */
  amount: number;
  /** The account's balance right after this line. */
  balance: number;
  fee: boolean;
  note: string | null;
  fx: TxFx | null;
}

export type StatementAccount = 'local' | 'usd';

export interface StatementQuery {
  account?: StatementAccount;
  dir?: 'all' | 'in' | 'out';
  /** Text to look for in the description, the other party, the note or the reference. */
  q?: string;
  /** A game month, or all of them. */
  month?: number | null;
  /** Lines older than this transaction number (the `next` of the previous page). */
  before?: number | null;
  limit?: number;
}

export const STATEMENT_PAGE = 30;
export const STATEMENT_PAGE_MAX = 100;
/** Lines of each account sent with the player view (the Bank app's first screen). */
export const STATEMENT_IN_VIEW = 12;

// ---------------------------------------------------------------- Who is on the other side

const EXTERNAL_NAME: Record<ExternalPurpose, [string, CounterpartyKind]> = {
  genesis: ['Central bank', 'bank'],
  customers: ['Customers', 'world'],
  payroll: ['Payroll', 'world'],
  suppliers: ['Suppliers', 'world'],
  tax: ['Tax office', 'tax'],
  lifestyle: ['Shops and services', 'world'],
  lps: ['Fund investors', 'world'],
  bank: ['Bank', 'bank'],
  fx: ['Currency exchange', 'bank'],
  gigs: ['Gig clients', 'world'],
};

type Owners = Map<Id, Counterparty>;
const ownerCache = new WeakMap<World, Owners>();

/** Who holds each account, built once per world snapshot (worlds are immutable). */
function owners(world: World): Owners {
  const hit = ownerCache.get(world);
  if (hit) return hit;
  const out: Owners = new Map();
  for (const p of Object.values(world.players)) {
    const who: Counterparty = { name: p.name, kind: 'player', playerId: p.id };
    out.set(p.accounts.local, who);
    if (p.accounts.usd) out.set(p.accounts.usd, who);
  }
  for (const c of Object.values(world.companies))
    out.set(c.account, { name: c.name, kind: 'company' });
  for (const f of Object.values(world.funds)) out.set(f.account, { name: f.name, kind: 'fund' });
  for (const b of Object.values(world.banks ?? {}))
    out.set(b.account, { name: b.name, kind: 'bank' });
  for (const m of Object.values(world.markets)) {
    if (!m) continue;
    for (const b of Object.values(m.businesses ?? {}))
      out.set(b.account, { name: b.name, kind: 'business' });
    for (const [purpose, id] of Object.entries(m.ext) as [ExternalPurpose, Id][]) {
      const [name, kind] = EXTERNAL_NAME[purpose] ?? [m.data.name, 'world'];
      out.set(id, { name: purpose === 'bank' ? m.bankName || name : name, kind });
    }
  }
  for (const r of Object.values(world.playRooms ?? {}))
    out.set(r.escrow, { name: 'Game pot', kind: 'game' });
  if (world.usdExt) {
    out.set(world.usdExt.fx, { name: 'Currency exchange', kind: 'bank' });
    out.set(world.usdExt.suppliers, { name: 'Suppliers', kind: 'world' });
    out.set(world.usdExt.genesis, { name: 'Central bank', kind: 'bank' });
  }
  ownerCache.set(world, out);
  return out;
}

function counterpartyOf(world: World, me: Player, line: TxRecord): Counterparty {
  if (!line.peer) return { name: line.memo, kind: 'world' };
  if (line.peer === me.accounts.local || line.peer === me.accounts.usd)
    return { name: me.name, kind: 'self', playerId: me.id };
  const who = owners(world).get(line.peer);
  const acc = world.accounts[line.peer];
  const base = who ?? { name: acc?.label ?? line.memo, kind: acc?.external ? 'world' : 'company' };
  return line.fee ? { name: base.name, kind: 'fee' } : base;
}

// ---------------------------------------------------------------- What kind of movement

const KIND_RULES: [RegExp, TxKind][] = [
  [/^Transfer:/, 'transfer'],
  [/\bfee\b/i, 'fee'],
  [/^Social game entry/, 'stake'],
  [/winnings|^Prize/i, 'pot'],
  [/refund/i, 'refund'],
  [/wages|salary|severance|final pay|retention package/i, 'salary'],
  [/loan|repayment|mortgage|guarantee/i, 'loan'],
  [/\btax\b|fine\b|central bank$/i, 'tax'],
  [/^rent\b/i, 'rent'],
  [/conversion|savings moved/i, 'exchange'],
  [/^starting savings/i, 'deposit'],
  [/dividend|exit|investment|capital|grant|distribution|carried interest|wind-down/i, 'investment'],
  [/^sold:|^sale:|takings|revenue|gig/i, 'sale'],
];

export function classify(line: Pick<TxRecord, 'memo' | 'amount' | 'kind'>): TxKind {
  if (line.kind) return line.kind;
  for (const [re, kind] of KIND_RULES) if (re.test(line.memo)) return kind;
  return line.amount < 0 ? 'purchase' : 'income';
}

// ---------------------------------------------------------------- Statements

const accountIdOf = (me: Player, which: StatementAccount): Id | undefined =>
  which === 'usd' ? me.accounts.usd : me.accounts.local;

/** Every line the account still keeps, newest first, with the balance after each. */
export function statementLines(world: World, me: Player, accountId: Id): StatementLine[] {
  const acc = world.accounts[accountId];
  if (!acc) return [];
  let balance = acc.balance;
  return acc.recent.map((r, i) => {
    const line: StatementLine = {
      ref: r.tx ? txRef(r.tx) : null,
      key: r.tx ? `${r.tx}:${i}` : `old:${acc.recent.length - i}`,
      month: r.month,
      at: r.at ?? null,
      description: r.memo,
      kind: r.fee ? 'fee' : classify(r),
      counterparty: counterpartyOf(world, me, r),
      amount: r.amount,
      balance,
      fee: r.fee ?? false,
      note: r.note ?? null,
      fx: r.fx ?? null,
    };
    balance -= r.amount;
    return line;
  });
}

const txOf = (l: StatementLine) => (l.ref ? (parseTxRef(l.ref) ?? 0) : 0);

/**
 * One page of a player's statement for one of their accounts, filtered, with
 * the money in and out over everything that matches (not just this page).
 * `next` is the cursor for the following page (null at the end).
 */
export function statementView(world: World, playerId: Id, query: StatementQuery = {}) {
  const me = world.players[playerId];
  if (!me) return null;
  const which = query.account ?? 'local';
  const id = accountIdOf(me, which);
  const acc = id ? world.accounts[id] : undefined;
  if (!id || !acc) return null;
  const all = statementLines(world, me, id);
  const q = query.q?.trim().toLowerCase() ?? '';
  const matches = all.filter(
    (l) =>
      (query.dir === 'in' ? l.amount > 0 : query.dir === 'out' ? l.amount < 0 : true) &&
      (query.month == null || l.month === query.month) &&
      (!q ||
        l.description.toLowerCase().includes(q) ||
        l.counterparty.name.toLowerCase().includes(q) ||
        (l.note ?? '').toLowerCase().includes(q) ||
        (l.ref ?? '').toLowerCase().includes(q)),
  );
  let moneyIn = 0;
  let moneyOut = 0;
  for (const l of matches) {
    if (l.amount > 0) moneyIn += l.amount;
    else moneyOut -= l.amount;
  }
  const limit = Math.max(1, Math.min(STATEMENT_PAGE_MAX, query.limit ?? STATEMENT_PAGE));
  const before = query.before ?? null;
  const rest = before === null ? matches : matches.filter((l) => txOf(l) < before);
  let end = Math.min(limit, rest.length);
  // Never split a transaction (an amount and its fee) across two pages.
  while (end < rest.length && end > 0 && txOf(rest[end]!) === txOf(rest[end - 1]!)) end++;
  const lines = rest.slice(0, end);
  const last = lines[lines.length - 1];
  return {
    account: which,
    currency: acc.currency as Currency,
    balance: acc.balance,
    lines,
    totals: { in: moneyIn, out: moneyOut, count: matches.length },
    months: [...new Set(all.map((l) => l.month))],
    next: end < rest.length && last ? txOf(last) : null,
  };
}

/** The statement summary sent with the player view: the latest lines of an account. */
export function statementPreview(world: World, me: Player, accountId: Id) {
  const all = statementLines(world, me, accountId);
  return { lines: all.slice(0, STATEMENT_IN_VIEW), more: all.length > STATEMENT_IN_VIEW };
}

// ---------------------------------------------------------------- Receipts

export interface Receipt {
  ref: string;
  status: 'completed';
  at: number | null;
  month: number;
  kind: TxKind;
  description: string;
  /** In: money came to you; out: you paid; own: between your own accounts. */
  direction: 'in' | 'out' | 'own';
  from: Counterparty;
  to: Counterparty;
  counterparty: Counterparty;
  /** The payment itself (no fee), in `currency`. */
  amount: number;
  /** Fees on it, in `currency` (0 if none). */
  fee: number;
  /** What left (out) or arrived in (in) your account in total. */
  total: number;
  currency: Currency;
  fx: TxFx | null;
  note: string | null;
  /** Your account's balance after the transaction. */
  balanceAfter: number;
  /** Your lines in it, on each of your accounts. */
  lines: (StatementLine & { account: StatementAccount; currency: Currency })[];
}

/** A transaction as one of its parties sees it; null unless it touched their own accounts. */
export function receiptView(world: World, playerId: Id, ref: string): Receipt | null {
  const me = world.players[playerId];
  const tx = parseTxRef(ref);
  if (!me || tx === null) return null;
  const legs: Receipt['lines'] = [];
  for (const which of ['local', 'usd'] as const) {
    const id = accountIdOf(me, which);
    const acc = id ? world.accounts[id] : undefined;
    if (!id || !acc) continue;
    for (const l of statementLines(world, me, id))
      if (l.ref === ref) legs.push({ ...l, account: which, currency: acc.currency });
  }
  if (!legs.length) return null;
  const main = legs.find((l) => !l.fee) ?? legs[0]!;
  const own = legs.some((l) => l.amount < 0) && legs.some((l) => l.amount > 0 && !l.fee);
  const direction: Receipt['direction'] = own ? 'own' : main.amount < 0 ? 'out' : 'in';
  const onMain = legs.filter((l) => l.account === main.account);
  const fee = onMain.filter((l) => l.fee).reduce((a, l) => a - l.amount, 0);
  const amount = Math.abs(main.amount);
  const meParty: Counterparty = { name: me.name, kind: 'self', playerId: me.id };
  const other = own ? meParty : main.counterparty;
  return {
    ref,
    status: 'completed',
    at: main.at,
    month: main.month,
    kind: main.kind,
    description: main.description,
    direction,
    from: direction === 'in' ? other : meParty,
    to: direction === 'in' ? meParty : other,
    counterparty: other,
    amount,
    fee,
    total: direction === 'in' ? amount : amount + fee,
    currency: main.currency,
    fx: main.fx ?? legs.find((l) => l.fx)?.fx ?? null,
    note: main.note,
    // Lines are newest first: the first one on the main account is the last movement.
    balanceAfter: onMain[0]!.balance,
    lines: legs,
  };
}

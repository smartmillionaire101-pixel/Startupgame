import { describe, expect, it } from 'vitest';
import { col } from '../src/helpers.js';
import { STATEMENT_HISTORY, transfer } from '../src/ledger.js';
import { scale } from '../src/money.js';
import { classify, receiptView, statementView } from '../src/statement.js';
import { playerView } from '../src/views.js';
import type { MarketId } from '../src/data/markets.js';
import type { World } from '../src/types.js';
import { makeWorld, moneyByCurrency, run } from './helpers.js';

function person(w: World, id: string, market: MarketId, name: string): World {
  return run(w, id, {
    type: 'player.create',
    handle: `h_${id}`,
    name,
    role: 'investor',
    backgroundId: 'i-first',
    market,
    investor: { sectors: ['fintech'], stages: ['seed'], checkSize: 1_000_000_00 },
  }).world;
}

const three = () =>
  person(
    person(
      person(makeWorld(8, ['lagos', 'london']), 'u_a', 'lagos', 'Ade A'),
      'u_b',
      'lagos',
      'Bisi B',
    ),
    'u_l',
    'london',
    'Lou L',
  );

const bal = (w: World, id: string) => w.accounts[w.players[id]!.accounts.local]!.balance;

/** Each line's balance follows from the one before it. */
function expectRunningBalance(lines: { amount: number; balance: number }[], current: number) {
  expect(lines[0]!.balance).toBe(current);
  for (let i = 0; i + 1 < lines.length; i++)
    expect(lines[i + 1]!.balance).toBe(lines[i]!.balance - lines[i]!.amount);
}

describe('bank statements and receipts', () => {
  it('a transfer shows on both statements with the other party, the note and running balances', () => {
    const w0 = three();
    const total = moneyByCurrency(w0);
    const amount = scale(col(w0.markets.lagos!), 1);
    const r = run(w0, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount, note: 'For lunch' });
    const w = r.world;
    const { fee, receiptId } = r.result as { fee: number; receiptId: string };
    expect(receiptId).toMatch(/^TX\d{8}$/);
    expect(moneyByCurrency(w)).toEqual(total);

    const a = statementView(w, 'u_a')!;
    expect(a.currency).toBe('NGN');
    expect(a.balance).toBe(bal(w, 'u_a'));
    const [feeLine, sent] = a.lines;
    expect(sent).toMatchObject({
      ref: receiptId,
      amount: -amount,
      kind: 'transfer',
      note: 'For lunch',
      fee: false,
      counterparty: { name: 'Bisi B', kind: 'player', playerId: 'u_b' },
    });
    expect(feeLine).toMatchObject({ ref: receiptId, amount: -fee, kind: 'fee', fee: true });
    expect(feeLine!.counterparty.kind).toBe('fee');
    expectRunningBalance(a.lines, bal(w, 'u_a'));
    expect(sent!.balance).toBe(bal(w0, 'u_a') - amount);
    expect(feeLine!.balance).toBe(bal(w0, 'u_a') - amount - fee);
    expect(sent!.at).not.toBeNull();

    const b = statementView(w, 'u_b')!;
    expect(b.lines[0]).toMatchObject({
      ref: receiptId,
      amount,
      kind: 'transfer',
      note: 'For lunch',
      balance: bal(w, 'u_b'),
      counterparty: { name: 'Ade A', kind: 'player', playerId: 'u_a' },
    });
    expectRunningBalance(b.lines, bal(w, 'u_b'));

    const ra = receiptView(w, 'u_a', receiptId)!;
    expect(ra).toMatchObject({
      ref: receiptId,
      status: 'completed',
      direction: 'out',
      kind: 'transfer',
      amount,
      fee,
      total: amount + fee,
      currency: 'NGN',
      note: 'For lunch',
      fx: null,
      balanceAfter: bal(w, 'u_a'),
      from: { name: 'Ade A', kind: 'self' },
      to: { name: 'Bisi B', kind: 'player' },
    });
    const rb = receiptView(w, 'u_b', receiptId)!;
    expect(rb).toMatchObject({
      direction: 'in',
      amount,
      fee: 0,
      total: amount,
      note: 'For lunch',
      balanceAfter: bal(w, 'u_b'),
      from: { name: 'Ade A', kind: 'player' },
      to: { name: 'Bisi B', kind: 'self' },
    });
  });

  it('records the FX rate and the amount received in the other currency on both sides', () => {
    const w0 = three();
    const total = moneyByCurrency(w0);
    const amount = scale(col(w0.markets.lagos!), 0.5);
    const r = run(w0, 'u_a', { type: 'money.send', toPlayerId: 'u_l', amount, note: 'Rent share' });
    const w = r.world;
    expect(moneyByCurrency(w)).toEqual(total);
    const { receiptId, received, fee } = r.result as {
      receiptId: string;
      received: number;
      fee: number;
    };
    const ra = receiptView(w, 'u_a', receiptId)!;
    expect(ra.currency).toBe('NGN');
    expect(ra.to).toMatchObject({ name: 'Lou L', kind: 'player' });
    expect(ra.fee).toBe(fee);
    expect(ra.fx).toMatchObject({ from: 'NGN', to: 'GBP', sent: amount, received });
    expect(ra.fx!.rate).toBeGreaterThan(0);
    expect(ra.fx!.rate).toBeLessThan(1);
    const rl = receiptView(w, 'u_l', receiptId)!;
    expect(rl).toMatchObject({
      direction: 'in',
      currency: 'GBP',
      amount: received,
      fee: 0,
      note: 'Rent share',
      from: { name: 'Ade A', kind: 'player' },
      balanceAfter: bal(w, 'u_l'),
    });
    expect(rl.fx).toEqual(ra.fx);
    // The FX desks in between never show as the other party.
    const l = statementView(w, 'u_l')!;
    expect(l.lines[0]!.counterparty.name).toBe('Ade A');
    expectRunningBalance(l.lines, bal(w, 'u_l'));
  });

  it('shows only your own lines: no receipts or account ids of other players', () => {
    const w0 = three();
    const r = run(w0, 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 10_000 });
    const w = r.world;
    expect(receiptView(w, 'u_l', r.result.receiptId)).toBeNull();
    expect(receiptView(w, 'u_a', 'TX99999999')).toBeNull();
    expect(receiptView(w, 'u_a', 'not-a-ref')).toBeNull();
    const view = playerView(w, 'u_a')!;
    const json = JSON.stringify([view.accounts, statementView(w, 'u_a')]);
    expect(json).not.toContain(w.players.u_b!.accounts.local);
    // The old `recent` lines keep their small shape.
    expect(Object.keys(view.accounts.local!.recent[0]!).sort()).toEqual([
      'amount',
      'memo',
      'month',
    ]);
    expect(view.accounts.local!.statement.lines.length).toBeLessThanOrEqual(12);
  });

  it('filters by direction, month and text, totals what matches and pages without splitting a fee', () => {
    let w = three();
    for (let i = 0; i < 12; i++)
      w = run(w, 'u_a', {
        type: 'money.send',
        toPlayerId: i % 2 ? 'u_b' : 'u_l',
        amount: 1_000 + i,
        note: `n${i}`,
      }).world;
    w = run(w, 'u_b', { type: 'money.send', toPlayerId: 'u_a', amount: 5_000, note: 'Back' }).world;

    const all = statementView(w, 'u_a')!;
    const out = statementView(w, 'u_a', { dir: 'out' })!;
    const inn = statementView(w, 'u_a', { dir: 'in' })!;
    expect(out.lines.every((l) => l.amount < 0)).toBe(true);
    expect(inn.lines.every((l) => l.amount > 0)).toBe(true);
    expect(out.totals.count + inn.totals.count).toBe(all.totals.count);
    expect(inn.totals.in).toBe(all.totals.in);
    expect(out.totals.out).toBe(all.totals.out);
    expect(inn.lines[0]).toMatchObject({ amount: 5_000, note: 'Back' });

    const found = statementView(w, 'u_a', { q: 'bisi' })!;
    expect(found.lines.length).toBeGreaterThan(0);
    expect(found.lines.every((l) => l.counterparty.name === 'Bisi B')).toBe(true);
    // The note is on the whole transaction: the amount and its fee.
    expect(statementView(w, 'u_a', { q: 'n11' })!.lines.map((l) => l.kind)).toEqual([
      'fee',
      'transfer',
    ]);
    expect(statementView(w, 'u_a', { month: 999 })!.lines).toEqual([]);

    // Pages of 5: every transaction stays whole, no line twice, nothing lost.
    const seen: string[] = [];
    let before: number | null = null;
    for (let guard = 0; guard < 50; guard++) {
      const page = statementView(w, 'u_a', { limit: 5, before })!;
      for (const l of page.lines) seen.push(l.key);
      const refs = page.lines.map((l) => l.ref);
      const last = refs[refs.length - 1];
      if (page.next !== null) expect(refs.filter((x) => x === last).length).toBe(2);
      if (page.next === null) break;
      before = page.next;
    }
    expect(seen).toEqual(all.lines.map((l) => l.key));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('keeps a long statement for players, a short history elsewhere', () => {
    const w = structuredClone(three());
    const mine = w.players.u_a!.accounts.local;
    const sink = w.markets.lagos!.ext.bank;
    for (let i = 0; i < 260; i++) transfer(w, mine, sink, 1, 'Coffee', 0);
    expect(w.accounts[mine]!.recent).toHaveLength(STATEMENT_HISTORY);
    expect(w.accounts[sink]!.recent).toHaveLength(30);
    // External accounts keep the old, small lines.
    expect(Object.keys(w.accounts[sink]!.recent[0]!).sort()).toEqual(['amount', 'memo', 'month']);
  });

  it('is deterministic: the same commands give the same references', () => {
    const go = () =>
      run(three(), 'u_a', { type: 'money.send', toPlayerId: 'u_b', amount: 5_000 }).world;
    expect(JSON.stringify(go())).toBe(JSON.stringify(go()));
  });

  it('names what each movement was', () => {
    const k = (memo: string, amount = -1) => classify({ memo, amount });
    expect(k('Transfer: A to B')).toBe('transfer');
    expect(k('Transfer fee')).toBe('fee');
    expect(k('Social game entry')).toBe('stake');
    expect(k('Social game winnings', 1)).toBe('pot');
    expect(k('Game entry refunded', 1)).toBe('refund');
    expect(k('Flight refund', 1)).toBe('refund');
    expect(k('Wages: Barista at Mama Put', 1)).toBe('salary');
    expect(k('Personal loan from Zenith', 1)).toBe('loan');
    expect(k('Personal income tax')).toBe('tax');
    expect(k('Starting savings', 1)).toBe('deposit');
    expect(k('Bought: Sofa')).toBe('purchase');
    expect(k('Sold: Sofa', 1)).toBe('sale');
  });
});

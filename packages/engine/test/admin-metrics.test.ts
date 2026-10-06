import { expect, it } from 'vitest';
import { addFounder, addInvestor, makeWorld, run, settle, tryRun, T0 } from './helpers.js';
import { playerView } from '../src/views.js';
import { convert, openAccount, payExact, transfer } from '../src/ledger.js';
import type { World } from '../src/types.js';

it('separates transfer principal from fees, counts source currency once, and rolls back failed commands', () => {
  let w = addFounder(addFounder(makeWorld(), 'sender'), 'recipient', 'london', 'London Tools');
  const before = w.activity!.totals.NGN!;
  const balance = w.accounts[w.players.sender!.accounts.local]!.balance;
  w = run(w, 'sender', { type: 'money.send', toPlayerId: 'recipient', amount: 10_000 }).world;
  const after = w.activity!.totals.NGN!;
  const paid = balance - w.accounts[w.players.sender!.accounts.local]!.balance;
  expect(after.sent - before.sent).toBe(10_000);
  expect(after.spent - before.spent).toBe(paid - 10_000);
  expect(w.activity!.totals.GBP!.sent).toBe(0);
  const saved = JSON.stringify(w.activity);
  expect(
    tryRun(w, 'sender', { type: 'money.send', toPlayerId: 'recipient', amount: 1e15 }).ok,
  ).toBe(false);
  expect(JSON.stringify(w.activity)).toBe(saved);
});
it('records an accepted investment exactly once, independently of business capital', () => {
  let w = settle(addInvestor(addFounder(makeWorld(31, ['lagos'])), 'investor'), 'lagos', 2);
  const deal = playerView(w, 'investor')!.market.dealFlow.find(
    (d) => d.ai && d.canInvest && d.maxCheck > 0,
  )!;
  const amount = Math.min(deal.maxCheck, 1_000_000_00);
  const before = structuredClone(w.activity!.totals.NGN!);
  w = run(w, 'investor', { type: 'invest.quick', companyId: deal.companyId, amount }).world;
  expect(w.activity!.totals.NGN!.invested - before.invested).toBe(amount);
  expect(w.activity!.totals.NGN!.capital).toBe(before.capital);
});
it('keeps durable totals beyond short ledger history, excludes AI and currency moves, and counts managed fund investments', () => {
  const w: World = structuredClone(addInvestor(addFounder(makeWorld()), 'investor'));
  const from = w.players.investor!.accounts.local;
  const to = w.markets.lagos!.ext.bank;
  const before = w.activity!.totals.NGN!.spent;
  for (let i = 0; i < 120; i++) transfer(w, from, to, 100, 'Payment', 0);
  expect(w.accounts[from]!.recent).toHaveLength(30);
  expect(w.activity!.recent).toHaveLength(100);
  expect(w.activity!.totals.NGN!.spent - before).toBe(12_000);
  const stats = structuredClone(w.activity);
  const usd = openAccount(w, { currency: 'USD', market: 'lagos', label: 'Investor dollars' });
  w.players.investor!.accounts.usd = usd;
  convert(w, from, usd, 100, 'Own currency move', 0);
  const aiFund = Object.values(w.funds).find((f) => f.ai)!;
  transfer(w, aiFund.account, to, 100, 'AI investment', 0, 'invested');
  expect(w.activity).toEqual(stats);
  aiFund.ai = false;
  aiFund.managerId = 'investor';
  const invested = w.activity!.totals.NGN!.invested;
  payExact(w, aiFund.account, to, 500, 'Managed fund investment', 0, 'invested');
  expect(w.activity!.totals.NGN!.invested - invested).toBe(500);
  expect(w.activity!.recent[0]!.playerId).toBe('investor');
});
it('starts tracking old snapshots at the next command without pretending to reconstruct history', () => {
  const w = structuredClone(addFounder(makeWorld()));
  delete w.activity;
  const next = run(w, 'u_founder', { type: 'player.seen' }, T0 + 1000).world;
  expect(next.activity).toMatchObject({ since: T0 + 1000, totals: {}, recent: [] });
});

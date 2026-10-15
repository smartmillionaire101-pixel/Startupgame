import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  cloudCost,
  loanPaymentsDue,
  marketingSpend,
  monthlyCosts,
  officeRent,
  payrollThisMonth,
} from '../src/company.js';
import { getMarket } from '../src/helpers.js';
import { lifestyleCost } from '../src/personal.js';
import { recapView } from '../src/recap.js';
import { JOURNEY_EVENTS_NOTE } from '../src/releases.js';
import { statementLines, statementView } from '../src/statement.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addFounder, addInvestor, companyOf, makeWorld, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const month = (w: World) => w.markets.lagos!.month;

/** A founder who has played a month: put money in the company, then the month settled. */
function played() {
  let w = addFounder(makeWorld());
  const c = companyOf(w, F);
  w = run(w, F, {
    type: 'company.contribute',
    companyId: c.id,
    amount: 200_000_00,
    as: 'loan',
  }).world;
  return settle(w, 'lagos', 1);
}

/** Sum of every statement line of an account for one month. */
function statementSum(w: World, accountId: string, mo: number) {
  const lines = statementLines(w, w.players[F]!, accountId).filter((l) => l.month === mo);
  return {
    in: lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0),
    out: -lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0),
    net: lines.reduce((a, l) => a + l.amount, 0),
    count: lines.length,
  };
}

describe('month recap', () => {
  it('personal totals reconcile with the bank statement for that month', () => {
    const w = played();
    for (const mo of [month(w) - 1, month(w)]) {
      const r = recapView(w, F, mo)!;
      expect(r.month).toBe(mo);
      const mine = r.personal.find((a) => a.account === 'local')!;
      const s = statementView(w, F, { month: mo, limit: 100 })!;
      expect(mine.in).toBe(s.totals.in);
      expect(mine.out).toBe(s.totals.out);
      expect(mine.count).toBe(s.totals.count);
      expect(mine.net).toBe(s.lines.reduce((a, l) => a + l.amount, 0));
      expect(mine.net).toBe(statementSum(w, w.players[F]!.accounts.local, mo).net);
      expect(mine.complete).toBe(true);
    }
  });

  it('keeps personal and business money apart', () => {
    let w = addFounder(makeWorld());
    const c = companyOf(w, F);
    const mo = month(w);
    const before = recapView(w, F)!;
    const amount = 150_000_00;
    w = run(w, F, { type: 'company.contribute', companyId: c.id, amount, as: 'loan' }).world;
    const r = recapView(w, F)!;
    const mine = r.personal[0]!;
    const biz = r.business.find((a) => a.account === c.id)!;
    expect(mine.scope).toBe('personal');
    expect(biz.scope).toBe('business');
    expect(biz.name).toBe(c.name);
    // The same money leaves you and reaches the company: once on each side, never summed.
    expect(mine.out - before.personal[0]!.out).toBe(amount);
    expect(biz.in - before.business[0]!.in).toBe(amount);
    // The biggest movements, largest first (at most three).
    const sizes = mine.biggest.map((i) => Math.abs(i.amount));
    expect(sizes.length).toBeLessThanOrEqual(3);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    expect(sizes.length === 3 ? sizes[2]! >= amount : sizes.includes(amount)).toBe(true);
    // Each side reconciles with its own account's lines.
    expect(mine.net).toBe(statementSum(w, w.players[F]!.accounts.local, mo).net);
    expect(biz.net).toBe(statementSum(w, c.account, mo).net);
    expect(biz.balanceEnd).toBe(w.accounts[c.account]!.balance);
    expect(mine.balanceEnd).toBe(w.accounts[w.players[F]!.accounts.local]!.balance);
  });

  it('Tomorrow lists payroll, rent and living costs at the amounts the settlement will charge', () => {
    let w = played();
    const c0 = companyOf(w, F);
    // Somebody to pay: hire from the talent pool.
    const cand = getMarket(w, 'lagos').talent.find((t) => t.seniority === 'junior');
    if (cand) {
      const r = tryRun(w, F, {
        type: 'company.offer',
        companyId: c0.id,
        candidateId: cand.id,
        salary: cand.ask * 2,
        equityBps: 0,
      });
      if (r.ok) w = r.world;
    }
    const c = companyOf(w, F);
    const m = getMarket(w, 'lagos');
    const r = recapView(w, F)!;
    expect(r.tomorrow.month).toBe(month(w) + 1);
    const biz = r.tomorrow.business.find((b) => b.company === c.name)!;
    const amount = (k: string) => biz.bills.find((b) => b.kind === k)?.amount ?? 0;
    expect(amount('payroll')).toBe(payrollThisMonth(c));
    expect(amount('rent')).toBe(officeRent(m, c));
    expect(amount('rent')).toBeGreaterThan(0);
    expect(amount('marketing')).toBe(marketingSpend(c));
    expect(amount('cloud')).toBe(cloudCost(m, c));
    expect(amount('loan')).toBe(loanPaymentsDue(c));
    expect(biz.total).toBe(monthlyCosts(w, c));
    const living = r.tomorrow.personal.find((b) => b.kind === 'living')!;
    expect(living.amount).toBe(lifestyleCost(w, w.players[F]!));
    expect(living.currency).toBe(m.data.currency);
    // Settling charges exactly that for living costs.
    const after = settle(w, 'lagos', 1);
    const paid = statementLines(after, after.players[F]!, after.players[F]!.accounts.local).find(
      (l) => l.month === month(after) && l.description.startsWith('Living costs'),
    );
    expect(paid?.amount).toBe(-living.amount);
  });

  it('an empty month shows nothing moved, and the view never changes the world', () => {
    let w = addInvestor(makeWorld());
    w = settle(w, 'lagos', 3);
    // The investor's statement: whatever moved in the first month, nothing before it.
    const snapshot = JSON.stringify(w);
    const r = recapView(w, 'u_investor', 0)!;
    const s = statementView(w, 'u_investor', { month: 0 })!;
    expect(r.personal[0]!.count).toBe(s.totals.count);
    // A month with no line at all.
    const quiet = [0, 1, 2, 3].find(
      (mo) => statementView(w, 'u_investor', { month: mo })!.totals.count === 0,
    );
    if (quiet !== undefined) {
      const q = recapView(w, 'u_investor', quiet)!;
      expect(q.personal[0]).toMatchObject({ in: 0, out: 0, net: 0, count: 0, biggest: [] });
    }
    expect(r.business).toEqual([]);
    expect(r.companies).toEqual([]);
    expect(r.journey).toBeNull();
    expect(JSON.stringify(w)).toBe(snapshot);
    // Out of range months are clamped; unknown players get nothing.
    expect(recapView(w, 'u_investor', 999)!.month).toBe(month(w));
    expect(recapView(w, 'nobody')).toBeNull();
  });

  it('company changes come from the month’s P&L, and the view carries the recap', () => {
    const w = played();
    const c = companyOf(w, F);
    const r = recapView(w, F)!;
    const rc = r.companies.find((x) => x.id === c.id)!;
    const pnl = c.finance.history.find((h) => h.month === month(w))!;
    expect(rc.revenue).toBe(pnl.revenue);
    expect(rc.customers).toBe(pnl.customers);
    expect(rc.net).toBe(pnl.net);
    expect(rc.won).not.toBeNull();
    expect(r.journey?.current).not.toBeNull();
    expect(r.months[0]).toBe(month(w));
    const v = playerView(w, F)!;
    expect(v.recap?.month).toBe(month(w));
  });
});

describe('month recap across every system (Phase 7)', () => {
  const edit = (w: World, f: (d: World) => void) => produce(w, f);

  it('lists the month’s rival moves in your industry, the ones that hit you first', () => {
    // Rivals arrive with the decision-events release, at the next settlement.
    let w = run(addFounder(makeWorld()), null, {
      type: 'system.announce',
      id: JOURNEY_EVENTS_NOTE,
      text: 'Decisions are here.',
    }).world;
    w = settle(w, 'lagos', 1);
    const c = companyOf(w, F);
    const mo = month(w);
    w = edit(w, (d) => {
      const rivals = d.markets.lagos!.rivals![c.industry]!;
      expect(rivals.length).toBeGreaterThan(0);
      rivals[0]!.moves.push(
        { month: mo, kind: 'raise', text: 'Rival A raised ₦50m' },
        { month: mo, kind: 'poach', text: 'Rival A tried to poach', targetCompanyId: c.id },
        { month: mo - 1, kind: 'launch', text: 'An old launch' },
      );
    });
    const r = recapView(w, F)!;
    const mine = r.rivals.filter((x) => x.text.startsWith('Rival A'));
    expect(mine.map((x) => [x.kind, x.hitYou])).toEqual([
      ['poach', true],
      ['raise', false],
    ]);
    expect(r.rivals.every((x) => x.company === c.name)).toBe(true);
    expect(r.rivals.some((x) => x.text === 'An old launch')).toBe(false);
  });

  it('lists decisions answered or defaulted that month, not open ones', () => {
    let w = addFounder(makeWorld());
    const c = companyOf(w, F);
    const mo = month(w);
    const base = {
      family: 'team' as const,
      companyId: c.id,
      market: 'lagos' as const,
      month: mo,
      deadline: mo,
      vars: {},
      choices: [],
      defaultChoice: 'wait',
    };
    w = edit(w, (d) => {
      d.players[F]!.decisions = {
        seq: 3,
        cooldowns: {},
        events: [
          {
            ...base,
            id: 'ev1',
            template: 't1',
            status: 'chosen',
            choiceId: 'hire',
            resolvedMonth: mo,
            succeeded: true,
          },
          {
            ...base,
            id: 'ev2',
            template: 't2',
            status: 'defaulted',
            choiceId: 'wait',
            resolvedMonth: mo,
          },
          { ...base, id: 'ev3', template: 't3', status: 'open' },
        ],
      };
    });
    const r = recapView(w, F)!;
    expect(
      r.decisions.map((e) => [e.id, e.status, e.choiceId, e.succeeded, e.companyName]),
    ).toEqual([
      ['ev1', 'chosen', 'hire', true, c.name],
      ['ev2', 'defaulted', 'wait', null, c.name],
    ]);
  });

  it('shows wealth now (liquid vs owned) only for the current month', () => {
    const w = played();
    const r = recapView(w, F)!;
    const me = w.players[F]!;
    expect(r.wealth!.liquid).toBe(w.accounts[me.accounts.local]!.balance);
    expect(r.wealth!.netWorth).toBe(r.wealth!.liquid + r.wealth!.illiquid - r.wealth!.liabilities);
    expect(recapView(w, F, month(w) - 1)!.wealth).toBeNull();
  });

  it('carries the chosen ambition’s progress', () => {
    let w = addFounder(makeWorld());
    expect(recapView(w, F)!.ambition).toBeNull();
    w = run(w, F, { type: 'journey.ambition', id: 'serial' }).world;
    expect(recapView(w, F)!.ambition).toMatchObject({
      id: 'serial',
      title: 'Serial founder',
      done: 0,
      need: 3,
      reached: false,
    });
  });
});

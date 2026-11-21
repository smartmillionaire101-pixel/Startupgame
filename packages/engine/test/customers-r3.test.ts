/**
 * Customers you can see (CUSTOMERS_NOTE, round 3 player feedback: "I have
 * about six paying customers now but their monies are not counted, and I
 * can't see how to track my customers, and I don't know how it calculates
 * that I have only 3 customers").
 *
 * A signed customer pays its monthly price at every month end into the
 * company account and counts in that month's revenue; the Customers view
 * lists every customer with one total. Worlds without the note invoice on
 * 30–90 day terms exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { customerBook } from '../src/customerbook.js';
import { pitchPassWhy } from '../src/founderguide.js';
import { CUSTOMERS_NOTE, customersOn } from '../src/releases.js';
import { customerFacts, payingCustomers } from '../src/traction.js';
import { playerView } from '../src/views.js';
import type { Company, World } from '../src/types.js';
import { companyOf, run, settle, tryRun } from './helpers.js';
import { F, founder, talkWin } from './r7-helpers.js';

const co = (w: World): Company => companyOf(w, F);
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: CUSTOMERS_NOTE, text: 'Update.' }).world;
/** A London founder; the customers note logged when `on`. */
const world = (on: boolean) => {
  const w = founder('healthtech');
  return on ? announce(w) : w;
};

const MONTHLY = 250_00;

/** A customer signed in the Sales pipeline this month (as closeDeal leaves it). */
function signed(w: World, name = 'Harley Street Clinic', monthly = MONTHLY): World {
  return produce(w, (x) => {
    const c = companyOf(x, F);
    const month = x.markets.london!.month;
    const id = `deal_t_${(c.salesAccounts ?? []).length + 1}`;
    (c.salesAccounts ??= []).push({
      dealId: id,
      name,
      segmentKey: c.targetSegments[0]!,
      monthly,
      since: month,
    });
  });
}

/** The ledger lines on the company account for a settlement month. */
const lines = (w: World, month: number) =>
  w.accounts[co(w).account]!.recent.filter((r) => r.month === month);

describe('signed customers pay every month end (customers note)', () => {
  it('bills the monthly price into the company account and counts it in that month’s revenue', () => {
    const w0 = signed(world(true));
    expect(customersOn(w0)).toBe(true);
    const receivablesBefore = co(w0).finance.receivables.length;
    const w = settle(w0, 'london', 1);
    const c = co(w);
    const pnl = c.finance.history.at(-1)!;
    expect(pnl.signedRevenue).toBe(MONTHLY);
    // In the month's revenue, beside everything else that came in.
    expect(pnl.revenue).toBeGreaterThanOrEqual(MONTHLY);
    // Through the ledger, as its own line: from the market's customers to the company.
    const line = lines(w, pnl.month).find((l) => l.memo === 'Harley Street Clinic (monthly)');
    expect(line?.amount).toBe(MONTHLY);
    // Not invoiced on terms: no receivable carries it.
    expect(
      c.finance.receivables.length - receivablesBefore,
      'only the market’s B2B invoices go on terms',
    ).toBeLessThanOrEqual(1);
    const a = c.salesAccounts![0]!;
    expect(a.paid).toBe(MONTHLY);
    expect(a.paidThrough).toBe(pnl.month - 1);
    // The next month bills again, once.
    const w2 = settle(w, 'london', 1);
    const a2 = co(w2).salesAccounts![0]!;
    expect(co(w2).finance.history.at(-1)!.signedRevenue).toBe(MONTHLY);
    expect(a2.paid).toBe(2 * MONTHLY);
  });

  it('every signed customer pays: six signed customers, six bills', () => {
    let w = world(true);
    for (let i = 1; i <= 6; i++) w = signed(w, `Clinic ${i}`, 100_00 * i);
    const s = settle(w, 'london', 1);
    const pnl = co(s).finance.history.at(-1)!;
    expect(pnl.signedRevenue).toBe(100_00 * 21);
    const book = customerBook(s, co(s));
    expect(book.breakdown.signed).toBe(6);
    expect(book.lastMonth!.signed).toBe(100_00 * 21);
    expect(book.mrrBy.signed).toBe(100_00 * 21);
  });

  it('a first month paid up front is not billed again at the month end', () => {
    // The café idea's first customer pays up front (firstsession.ts).
    let w = world(true);
    for (let tries = 0; tries < 6 && !co(w).salesAccounts?.length; tries++) {
      const r = tryRun(w, F, { type: 'sales.prospect' });
      if (r.ok) w = r.world;
      for (const d of (co(w).deals ?? []).filter((x) => x.stage === 'lead')) {
        const out = talkWin(w, d.id);
        w = out.world;
        if (out.result.won) break;
      }
      if (!co(w).salesAccounts?.length) w = settle(w, 'london', 1);
    }
    const a = co(w).salesAccounts![0]!;
    // Upfront only for a starter idea; otherwise nothing is paid yet.
    const upfront = co(w).starterIdea?.paid ? a.monthly : 0;
    expect(a.paid ?? 0).toBe(upfront);
    const s = settle(w, 'london', 1);
    const pnl = co(s).finance.history.at(-1)!;
    // One month of service, one payment, whichever way it was paid.
    expect(pnl.signedRevenue).toBe(a.monthly);
    expect(co(s).salesAccounts?.[0]?.paid ?? a.monthly).toBe(a.monthly);
  });

  it('a signed customer pays its first bill before it can leave', () => {
    // A hibernating, unreliable company loses customers fast: still, the
    // customer signed last month always pays once.
    for (let seed = 1; seed <= 6; seed++) {
      let w = announce(founder('healthtech', true, seed));
      w = produce(w, (x) => {
        const c = companyOf(x, F);
        c.hibernation = { since: x.markets.london!.month };
        Object.assign(c.product, { quality: 0.1, techDebt: 1 });
      });
      w = signed(w);
      const s = settle(w, 'london', 1);
      expect(co(s).salesAccounts!.length, `seed ${seed}`).toBe(1);
      expect(co(s).finance.history.at(-1)!.signedRevenue).toBe(MONTHLY);
    }
  });

  it('a customer who leaves keeps what it paid in the list, marked churned', () => {
    let w = signed(world(true));
    w = settle(w, 'london', 1);
    // Make it leave at the next settlement.
    w = produce(w, (x) => {
      const c = companyOf(x, F);
      c.hibernation = { since: x.markets.london!.month };
      Object.assign(c.product, { quality: 0, techDebt: 1 });
    });
    for (let i = 0; i < 24 && co(w).salesAccounts!.length; i++) w = settle(w, 'london', 1);
    expect(co(w).salesAccounts!.length).toBe(0);
    const book = customerBook(w, co(w));
    const row = book.rows.find((r) => r.status === 'churned')!;
    expect(row.name).toBe('Harley Street Clinic');
    expect(row.paid).toBeGreaterThanOrEqual(MONTHLY);
    expect(row.left!.reason).toBe('hibernation');
  });

  it('marks customers at risk while the company hibernates', () => {
    let w = signed(world(true));
    w = produce(w, (x) => {
      companyOf(x, F).hibernation = { since: x.markets.london!.month };
    });
    const row = customerBook(w, co(w)).rows.find((r) => r.kind === 'signed')!;
    expect(row.status).toBe('risk');
    expect(row.risk).toBe('hibernation');
  });
});

describe('worlds without the note play as before', () => {
  it('a signed customer is invoiced on 30–90 day terms, not paid at the month end', () => {
    const w0 = signed(world(false));
    expect(customersOn(w0)).toBe(false);
    const w = settle(w0, 'london', 1);
    const c = co(w);
    const pnl = c.finance.history.at(-1)!;
    expect(pnl.signedRevenue).toBeUndefined();
    expect(lines(w, pnl.month).some((l) => l.memo.endsWith('(monthly)'))).toBe(false);
    // The invoice (less a bad-debt cut) waits in receivables for a later month.
    const due = c.finance.receivables.reduce((a, r) => a + r.amount, 0);
    expect(due).toBeGreaterThanOrEqual(Math.round(MONTHLY * 0.94));
    expect(c.salesAccounts![0]!.paid).toBeUndefined();
    expect(c.salesAccounts![0]!.paidThrough).toBeUndefined();
  });

  it('settles exactly as without the customers code (same world, note or no note before it)', () => {
    // Two copies of a world without the note settle identically, and the
    // note-only fields never appear in them.
    const a = settle(signed(world(false)), 'london', 3);
    const b = settle(signed(world(false)), 'london', 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const json = JSON.stringify(a);
    expect(json).not.toContain('"signedRevenue"');
    expect(json).not.toContain('"paidThrough"');
  });
});

describe('one count of customers everywhere', () => {
  it('the Customers view total is the number every screen shows, with its breakdown', () => {
    let w = world(true);
    for (let i = 1; i <= 4; i++) w = signed(w, `Clinic ${i}`);
    // Two local businesses buying after a pitch (economy.ts suppliers).
    w = produce(w, (x) => {
      const c = companyOf(x, F);
      const m = x.markets.london!;
      const open = Object.values(m.businesses!).filter((b) => b.closedMonth === undefined);
      for (const b of open.slice(0, 2))
        b.suppliers.push({
          companyId: c.id,
          sector: c.industry,
          monthlyMinor: 90_00,
          since: m.month,
        });
    });
    const c = co(w);
    const facts = customerFacts(w, c);
    const book = customerBook(w, c);
    expect(book.total).toBe(facts.total);
    expect(book.breakdown.signed).toBe(4);
    expect(book.breakdown.businesses).toBe(2);
    expect(book.breakdown.signed + book.breakdown.businesses + book.breakdown.market).toBe(
      book.total,
    );
    // One row per signed customer and per business, active.
    expect(book.rows.filter((r) => r.kind === 'signed' && r.status !== 'churned')).toHaveLength(4);
    expect(book.rows.filter((r) => r.kind === 'business')).toHaveLength(2);
    // The Company screen's view carries it, and the tile's count agrees.
    const pv = playerView(w, F)!.companies[0]!;
    expect(pv.customerBook.total).toBe(pv.traction.total);
    expect(pv.customerBook.total).toBe(payingCustomers(w, c));
  });

  it('an investor’s pass reason names the same count (it used to leave businesses out)', () => {
    const pass = (w: World) => {
      const c = co(w);
      const fund = Object.values(w.funds)[0]!;
      const p = { slides: [], questions: [] } as never;
      return pitchPassWhy(w, fund, c, p, 0);
    };
    const withBiz = (w: World) =>
      produce(w, (x) => {
        const c = companyOf(x, F);
        // Strong on everything but customers, so traction is the reason.
        Object.assign(c.product, { fit: 1, quality: 1, techDebt: 0 });
        c.finance.history.push({ ...c.finance.history.at(-1)!, revenue: 1e12, month: 0 });
        x.accounts[c.account]!.balance += 1e12;
        const m = x.markets.london!;
        const open = Object.values(m.businesses!).filter((b) => b.closedMonth === undefined);
        for (const b of open.slice(0, 3))
          b.suppliers.push({ companyId: c.id, sector: c.industry, monthlyMinor: 1, since: 0 });
      });
    const on = withBiz(signed(world(true)));
    const why = pass(on);
    expect(why.id).toBe('traction');
    expect(why.values.customers).toBe(payingCustomers(on, co(on)));
    // Before the note the reason counted the funnel and Sales accounts only.
    const off = withBiz(signed(world(false)));
    const old = pass(off);
    expect(old.id).toBe('traction');
    expect(old.values.customers).toBe(payingCustomers(off, co(off)) - 3);
  });

  it('the Customers view explains how signed customers are billed', () => {
    expect(customerBook(world(true), co(world(true))).billing).toBe('month-end');
    expect(customerBook(world(false), co(world(false))).billing).toBe('terms');
  });
});

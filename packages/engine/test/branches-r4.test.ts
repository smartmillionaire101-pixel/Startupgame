/**
 * Branches you can run (BRANCHES_NOTE, round 4 player feedback from a London
 * founder at Series A: "I just opened my second branch but can't see anything
 * on how to get customers there or manage it in any way").
 *
 * A branch wins its own customers (walk-ins, its local marketing budget, its
 * sales reps), takes what they spend and pays its budget, rent and staff,
 * all through the ledger; its customers count in the one customer total and
 * the Customers view, with their city; Sales works leads from its city; and
 * "Sell in a second city" needs customers there. Worlds without the note
 * play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { BRANCH_GROW, companyBranches, maxBranchBudget } from '../src/branches.js';
import { customerBook } from '../src/customerbook.js';
import { costIn } from '../src/ledger.js';
import { founderGuide } from '../src/founderguide.js';
import {
  BRANCHES_NOTE,
  CUSTOMERS_NOTE,
  FEEDBACK_NOTE,
  GAMEPLAY_NOTE,
  branchesOn,
} from '../src/releases.js';
import { customerFacts } from '../src/traction.js';
import { playerView } from '../src/views.js';
import type { Branch, Company, World } from '../src/types.js';
import { companyOf, makeWorld, moneyByCurrency, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const co = (w: World): Company => companyOf(w, F);
const announce = (w: World, id: string) =>
  run(w, null, { type: 'system.announce', id, text: 'Update.' }).world;

/** A London fintech founder with money in the company; the branches note logged when `on`. */
function world(on: boolean, seed = 11): World {
  let w = makeWorld(seed, ['london', 'lagos']);
  w = announce(w, FEEDBACK_NOTE);
  w = announce(w, GAMEPLAY_NOTE);
  w = announce(w, CUSTOMERS_NOTE);
  if (on) w = announce(w, BRANCHES_NOTE);
  w = run(w, F, {
    type: 'player.create',
    handle: 'h_lena',
    name: 'Lena Founder',
    role: 'founder',
    backgroundId: 'f-engineer',
    market: 'london',
    company: {
      name: 'Ledgerly',
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Payments for market traders',
      incorporation: 'local',
    },
  }).world;
  // Money in the company (from outside the books, like an investor would).
  return produce(w, (x) => {
    const c = companyOf(x, F);
    const m = x.markets.london!;
    x.accounts[m.ext.genesis]!.balance -= 5_000_000_00;
    x.accounts[c.account]!.balance += 5_000_000_00;
  });
}

/** Open a branch in Lagos. */
function openLagos(w: World): { w: World; b: Branch } {
  const r = run(w, F, {
    type: 'company.branch.open',
    companyId: co(w).id,
    market: 'lagos',
    district: 'ikeja',
  });
  return { w: r.world, b: companyBranches(r.world, co(r.world).id)[0]! };
}

const branch = (w: World, id: string) => w.branches![id]!;
const lines = (w: World, account: string, memo: RegExp) =>
  w.accounts[account]!.recent.filter((r) => memo.test(r.memo));

describe('a branch you can run (branches note)', () => {
  it('wins its own customers, takes their money and counts them everywhere', () => {
    const { w: w0, b } = openLagos(world(true));
    expect(branchesOn(w0)).toBe(true);
    const start = moneyByCurrency(w0);
    let w = settle(w0, 'lagos', 1);
    w = settle(w, 'london', 1);
    expect(moneyByCurrency(w)).toEqual(start);
    const br = branch(w, b.id);
    expect(br.customers).toBeGreaterThan(0);
    expect(br.lastMonth.won).toBe(br.customers);
    expect(br.lastMonth.revenue).toBeGreaterThan(0);
    // Takings come from Lagos households through the ledger, booked in London's P&L.
    expect(lines(w, co(w).account, /^Branch takings/).length).toBe(1);
    const pnl = co(w).finance.history.at(-1)!;
    expect(pnl.branches!.revenue).toBeGreaterThan(0);
    // The one customer total, the Customers view (with the city) and the step.
    const facts = customerFacts(w, co(w));
    expect(facts.branches).toBe(br.customers);
    const book = customerBook(w, co(w));
    const row = book.rows.find((r) => r.kind === 'branch')!;
    expect(row.count).toBe(br.customers);
    expect(row.market).toBe('lagos');
    expect(row.city).toBe('Lagos');
    expect(book.breakdown.branches).toBe(br.customers);
    expect(book.total).toBe(facts.total);
    expect(book.rows.filter((r) => r.kind !== 'branch').every((r) => r.market === 'london')).toBe(
      true,
    );
    const step = founderGuide(w, co(w))
      .stages.find((s) => s.id === 'series-a')!
      .tasks.find((x) => x.id === 'a.city')!;
    expect(step.done).toBe(true);
    expect(step.city).toMatchObject({ branches: 1, customers: br.customers });
    expect(step.go).toEqual({ kind: 'tab', tab: 'company', section: 'branches' });
  });

  it('"Sell in a second city" waits for customers, and a branch in the home city does not count', () => {
    const w0 = world(true);
    const task = (w: World) =>
      founderGuide(w, co(w))
        .stages.find((s) => s.id === 'series-a')!
        .tasks.find((x) => x.id === 'a.city')!;
    expect(task(w0).done).toBe(false);
    const home = run(w0, F, {
      type: 'company.branch.open',
      companyId: co(w0).id,
      market: 'london',
      district: 'shoreditch',
    }).world;
    expect(task(home).done).toBe(false);
    expect(task(home).city).toMatchObject({ branches: 0, sameCity: 1 });
    const { w } = openLagos(w0);
    // Open, but nobody has bought there yet.
    expect(task(w).done).toBe(false);
    expect(task(w).city).toMatchObject({ branches: 1, customers: 0 });
  });

  it('a budget is paid through the ledger each month and brings more customers', () => {
    const { w: w0, b } = openLagos(world(true));
    const lagos = w0.markets.lagos!;
    const budget = Math.round(maxBranchBudget(lagos) / 4);
    expect(
      tryRun(w0, F, {
        type: 'company.branch.budget',
        branchId: b.id,
        amount: maxBranchBudget(lagos) + 1,
      }).ok,
    ).toBe(false);
    const w1 = run(w0, F, { type: 'company.branch.budget', branchId: b.id, amount: budget }).world;
    expect(branch(w1, b.id).budget).toBe(budget);
    const start = moneyByCurrency(w1);
    const plain = settle(w0, 'lagos', 2);
    const spent = settle(w1, 'lagos', 2);
    expect(moneyByCurrency(spent)).toEqual(start);
    const bs = branch(spent, b.id);
    expect(bs.lastMonth.marketing).toBe(budget);
    expect(lines(spent, co(spent).account, /^Branch marketing/).length).toBe(2);
    // Paid from London in pounds: exactly the naira budget at the bank's rate, each month.
    const each = costIn(w1, budget, 'NGN', 'GBP');
    for (const l of lines(spent, co(spent).account, /^Branch marketing/))
      expect(Math.abs(l.amount)).toBe(each);
    expect(bs.customers!).toBeGreaterThan(branch(plain, b.id).customers!);
    // Booked as branch costs for London's next settlement.
    expect(co(spent).ledgerThisMonth.branchCost!).toBeGreaterThan(
      co(plain).ledgerThisMonth.branchCost!,
    );
  });

  it('hires a rep who is paid monthly and brings Lagos leads to Sales; letting go costs a month', () => {
    const { w: w0, b } = openLagos(world(true));
    const r = run(w0, F, { type: 'company.branch.hire', branchId: b.id, role: 'rep' });
    let w = r.world;
    const rep = branch(w, b.id).staff![0]!;
    expect(rep.role).toBe('rep');
    expect(rep.salary).toBe(r.result.salary);
    const start = moneyByCurrency(w);
    w = settle(w, 'lagos', 1);
    expect(moneyByCurrency(w)).toEqual(start);
    const salaryLines = lines(w, co(w).account, /^Branch salary/);
    expect(salaryLines.length).toBe(1);
    expect(Math.abs(salaryLines[0]!.amount)).toBe(costIn(w, rep.salary, 'NGN', 'GBP'));
    expect(branch(w, b.id).lastMonth.staff).toBe(rep.salary);
    const leads = co(w).deals!.filter((d) => d.customer.market === 'lagos');
    expect(leads.length).toBe(BRANCH_GROW.rep.leads);
    expect(branch(w, b.id).lastMonth.leads).toBe(leads.length);
    // The Sales view says which city a deal is in.
    const deal = playerView(w, F)!.companies[0]!.sales!.deals.find((d) => d.id === leads[0]!.id)!;
    expect(deal.market).toBe('lagos');
    expect(deal.city).toBe('Lagos');
    // Let them go: a month's pay.
    const f = run(w, F, { type: 'company.branch.fire', branchId: b.id, staffId: rep.id });
    expect(f.result.severance).toBe(rep.salary);
    expect(lines(f.world, co(f.world).account, /^Severance/).length).toBe(1);
    expect(branch(f.world, b.id).staff).toEqual([]);
  });

  it('Sales finds leads in a branch city, budgets in the company’s currency, and a signed one keeps its city', () => {
    const { w: w0 } = openLagos(world(true));
    const r = run(w0, F, { type: 'sales.prospect', companyId: co(w0).id, market: 'lagos' });
    const deals = co(r.world).deals!;
    expect(deals.length).toBeGreaterThan(0);
    expect(deals.every((d) => d.customer.market === 'lagos')).toBe(true);
    // Not in naira: about what a London buyer would think in pounds is a fraction of it.
    const naira = r.world.markets.lagos!.segments[deals[0]!.customer.segmentKey]!.budget;
    expect(deals[0]!.customer.budgetMax).toBeLessThan(naira);
    // Without a branch there, refused.
    const none = tryRun(world(true), F, {
      type: 'sales.prospect',
      companyId: co(w0).id,
      market: 'lagos',
    });
    expect(!none.ok && none.error.message).toMatch(/Open a branch in Lagos first/);
    // Sign one: the customer keeps its city, counts toward the second city and is billed.
    const id = deals[0]!.id;
    let w = produce(r.world, (x) => {
      const d = companyOf(x, F).deals!.find((y) => y.id === id)!;
      Object.assign(d.customer, { trust: 1, authority: 1, urgency: 1, current: 'nothing' });
      d.customer.budgetMin = 1_000_00;
      d.customer.budgetMax = 9_000_00;
      d.stage = 'proposal';
      d.price = 100_00;
      d.revealed = true;
    });
    for (let i = 0; i < 6 && co(w).deals!.find((d) => d.id === id)!.stage !== 'won'; i++) {
      const tryClose = tryRun(w, F, { type: 'sales.advance', dealId: id, action: 'close' });
      if (!tryClose.ok) break;
      w = tryClose.world;
      if (co(w).deals!.find((d) => d.id === id)!.stage === 'lost')
        w = run(w, F, { type: 'sales.advance', dealId: id, action: 'recover' }).world;
    }
    const acct = co(w).salesAccounts?.find((a) => a.dealId === id);
    expect(acct?.market).toBe('lagos');
    const row = customerBook(w, co(w)).rows.find((x) => x.id === `signed:${id}`)!;
    expect(row.city).toBe('Lagos');
  });

  it('pitches a Lagos business in person only while there', () => {
    const { w: w0, b } = openLagos(world(true));
    const v0 = playerView(w0, F)!.companies[0]!.expansion.branches[0]!.run!;
    expect(v0.here).toBe(false);
    expect(v0.pitch.businesses).toEqual([]);
    const there = produce(w0, (x) => {
      x.players[F]!.location = { market: 'lagos', since: 0 };
    });
    const v = playerView(there, F)!.companies[0]!.expansion.branches[0]!.run!;
    expect(v.here).toBe(true);
    const target = v.pitch.businesses[0]!;
    expect(target).toBeTruthy();
    const away = tryRun(w0, F, {
      type: 'company.branch.pitch',
      branchId: b.id,
      businessId: target.id,
    });
    expect(!away.ok && away.error.message).toMatch(/travel there/);
    const r = run(there, F, {
      type: 'company.branch.pitch',
      branchId: b.id,
      businessId: target.id,
    });
    const d = co(r.world).deals!.find((x) => x.id === r.result.dealId)!;
    expect(d.stage).toBe('contacted');
    expect(d.customer.market).toBe('lagos');
    expect(d.customer.businessId).toBe(target.id);
    // Not twice.
    expect(
      tryRun(r.world, F, { type: 'company.branch.pitch', branchId: b.id, businessId: target.id })
        .ok,
    ).toBe(false);
  });

  it('closing pays the lease break and each person a month, through the ledger', () => {
    const { w: w0, b } = openLagos(world(true));
    let w = run(w0, F, { type: 'company.branch.hire', branchId: b.id, role: 'manager' }).world;
    w = run(w, F, { type: 'company.branch.budget', branchId: b.id, amount: 1000_00 }).world;
    const v = playerView(w, F)!.companies[0]!.expansion.branches[0]!.run!;
    const salary = branch(w, b.id).staff![0]!.salary;
    expect(v.closeCost).toBe(b.monthlyOpex + salary);
    const start = moneyByCurrency(w);
    const r = run(w, F, { type: 'company.branch.close', branchId: b.id });
    expect(r.result.leaseBreak).toBe(b.monthlyOpex);
    expect(r.result.severance).toBe(salary);
    expect(moneyByCurrency(r.world)).toEqual(start);
    const closed = branch(r.world, b.id);
    expect(closed.status).toBe('closed');
    expect(closed.staff).toEqual([]);
    expect(closed.budget).toBeUndefined();
  });
});

describe('old worlds (no branches note) are unchanged', () => {
  it('a branch trades on its old takings, with no customers, and the new commands are unknown', () => {
    const { w: w0, b } = openLagos(world(false));
    expect(branchesOn(w0)).toBe(false);
    for (const cmd of [
      { type: 'company.branch.budget', branchId: b.id, amount: 100 },
      { type: 'company.branch.hire', branchId: b.id, role: 'rep' },
      { type: 'company.branch.fire', branchId: b.id, staffId: 'x' },
      { type: 'company.branch.pitch', branchId: b.id, businessId: 'x' },
      { type: 'sales.prospect', companyId: co(w0).id, market: 'lagos' },
    ] as const) {
      const r = tryRun(w0, F, cmd);
      expect(!r.ok && r.error.code).toBe('command.unknown');
    }
    const w = settle(w0, 'lagos', 2);
    const br = branch(w, b.id);
    expect(br.customers).toBeUndefined();
    expect(Object.keys(br.lastMonth).sort()).toEqual(['month', 'opex', 'revenue']);
    expect(br.lastMonth.revenue).toBeGreaterThan(0);
    expect(customerFacts(w, co(w)).branches).toBe(0);
    expect(customerBook(w, co(w)).rows.some((r) => r.kind === 'branch')).toBe(false);
    // An open branch in another city is enough for the step, as before.
    const step = founderGuide(w, co(w))
      .stages.find((s) => s.id === 'series-a')!
      .tasks.find((x) => x.id === 'a.city')!;
    expect(step.done).toBe(true);
    expect(step.city).toBeUndefined();
    expect(playerView(w, F)!.companies[0]!.expansion.branches[0]!.run).toBeNull();
  });

  it('settles deterministically: the same world settled twice gives the same branches and books', () => {
    const { w: w0 } = openLagos(world(false, 23));
    const a = settle(w0, 'lagos', 3);
    const b = settle(w0, 'lagos', 3);
    expect(a.branches).toEqual(b.branches);
    expect(co(a).finance.history).toEqual(co(b).finance.history);
  });
});

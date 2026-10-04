import { describe, expect, it } from 'vitest';
import { addSafe } from '../src/captable.js';
import { monthlyCosts } from '../src/company.js';
import { transfer } from '../src/ledger.js';
import { assessDistress, rescuePlan } from '../src/rescue.js';
import { playerView } from '../src/views.js';
import type { Staff, World } from '../src/types.js';
import {
  addFounder,
  addInvestor,
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';

/** A founder with extra cash in the company and a marketing push. */
function growing(marketing = 150_000_00, months = 3): World {
  let w = addFounder(makeWorld());
  const c = companyOf(w, F);
  w = run(w, F, { type: 'company.inject', companyId: c.id, amount: 2_000_000_00 }).world;
  w = run(w, F, { type: 'company.strategy', companyId: c.id, marketingBudget: marketing }).world;
  return settle(w, 'lagos', months);
}

/** An editable copy (test setup only; money moves still go through the ledger). */
const editable = (w: World): World => structuredClone(w);

function addStaff(w: World, n: number, salary: number) {
  const c = companyOf(w, F);
  for (let i = 0; i < n; i++) {
    const s: Staff = {
      id: `st_test_${i}`,
      name: `Tester ${i}`,
      role: i % 2 ? 'engineer' : 'support',
      seniority: 'mid',
      salary,
      equityBps: 0,
      morale: 70,
      skill: 0.6,
      personality: 'steady',
      hiredMonth: w.markets.lagos!.month,
    };
    c.staff.push(s);
  }
}

/** Leave the company with exactly `cash` by paying the rest to the outside world. */
function setCash(w: World, cash: number) {
  const c = companyOf(w, F);
  const m = w.markets.lagos!;
  const bal = w.accounts[c.account]!.balance;
  if (bal > cash) transfer(w, c.account, m.ext.suppliers, bal - cash, 'Test spend', m.month);
  else transfer(w, m.ext.genesis, c.account, cash - bal, 'Test cash', m.month);
}

describe('monthly story', () => {
  it('explains a marketing-driven growth month', () => {
    let w = addFounder(makeWorld());
    const c0 = companyOf(w, F);
    w = run(w, F, { type: 'company.inject', companyId: c0.id, amount: 2_000_000_00 }).world;
    w = settle(w, 'lagos', 1);
    w = run(w, F, {
      type: 'company.strategy',
      companyId: c0.id,
      marketingBudget: 400_000_00,
    }).world;
    w = settle(w, 'lagos', 1);
    const story = companyOf(w, F).story!;
    expect(story.month).toBe(w.markets.lagos!.month);
    expect(story.items.length).toBeGreaterThanOrEqual(3);
    expect(story.items.length).toBeLessThanOrEqual(6);
    const mkt = story.items.find((i) => /came from marketing/.test(i.text));
    expect(mkt).toBeDefined();
    expect(mkt!.tone).toBe('good');
    expect(mkt!.metric).toBe('customers');
    expect(mkt!.cause).toMatch(/raised marketing/);
    // The biggest customer driver is marketing, and the headline says so.
    const firstCustomers = story.items.find((i) => i.metric === 'customers' && i.tone === 'good');
    expect(firstCustomers).toBe(mkt);
    expect(story.headline).toMatch(/^Revenue up \d+%: the marketing push worked$/);
    expect(story.next.length).toBeGreaterThanOrEqual(1);
    expect(story.next.length).toBeLessThanOrEqual(3);
    for (const n of story.next) expect(n.place).toMatch(/bank|investors|market|hub|office|home/);
  });

  it('explains a churn month and suggests the fix', () => {
    let w = growing(150_000_00, 4);
    const c0 = companyOf(w, F);
    const seg = w.markets.lagos!.segments[c0.targetSegments[0]!]!;
    w = run(w, F, { type: 'company.strategy', companyId: c0.id, price: seg.budget * 3 }).world;
    w = settle(w, 'lagos', 2);
    const story = companyOf(w, F).story!;
    const churn = story.items.find((i) => /customers? left/.test(i.text));
    expect(churn).toBeDefined();
    expect(churn!.tone).toBe('bad');
    expect(churn!.delta).toBeLessThan(0);
    expect(churn!.cause).toMatch(/above what .* will pay/);
    expect(story.headline).toMatch(/Revenue down \d+%: customers balked at the price/);
    const fix = story.next.find((n) => n.command?.type === 'company.strategy');
    expect(fix?.command).toMatchObject({ type: 'company.strategy', price: seg.budget });
  });

  it('is deterministic and visible in the player view', () => {
    const a = growing();
    const b = growing();
    expect(companyOf(a, F).story).toEqual(companyOf(b, F).story);
    const v = playerView(a, F)!;
    expect(v.companies[0]!.story).toEqual(companyOf(a, F).story);
  });

  it('treats a saved company without story fields as null', () => {
    const w = editable(addFounder(makeWorld()));
    const c = companyOf(w, F);
    delete c.story;
    delete c.distress;
    delete c.hibernation;
    const v = playerView(w, F)!;
    expect(v.companies[0]!.story).toBeNull();
    const after = settle(w, 'lagos', 1);
    expect(companyOf(after, F).story).not.toBeNull();
  });
});

describe('distress', () => {
  it('climbs watch → danger as runway shrinks', () => {
    const w = editable(addFounder(makeWorld()));
    const c = companyOf(w, F);
    addStaff(w, 2, 200_000_00);
    const costs = monthlyCosts(w, c);
    setCash(w, costs * 10);
    expect(assessDistress(w, c)).toBeNull();
    setCash(w, costs * 5);
    expect(assessDistress(w, c)).toEqual({ level: 'watch', monthsLeft: 5 });
    setCash(w, costs * 2);
    expect(assessDistress(w, c)).toEqual({ level: 'danger', monthsLeft: 2 });
    const plan = rescuePlan(w, c, F);
    expect(plan.level).toBe('danger');
    expect(plan.deadline).toMatch(/Cash runs out in about 2 months/);
    expect(plan.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['hibernate', 'layoff', 'bank', 'wind-down', 'inject']),
    );
    const bank = plan.options.find((o) => o.id === 'bank')!;
    expect(bank).toMatchObject({ place: 'bank', label: 'Ask a lender for working capital' });
    expect(bank.command).toBeUndefined();
    // Other players see the level but get no moves.
    expect(rescuePlan(w, c, 'u_other').options).toEqual([]);
  });

  it('missed payroll: danger, then critical says plainly what ends the company', () => {
    let w = editable(addFounder(makeWorld()));
    addStaff(w, 3, 300_000_00);
    setCash(w, 100_000_00);
    w = settle(w, 'lagos', 1);
    let c = companyOf(w, F);
    expect(c.status).toBe('active');
    expect(c.finance.unpaidPayroll).toBeGreaterThan(0);
    expect(c.distress?.level).toBe('critical');
    const plan = playerView(w, F)!.companies[0]!.rescue!;
    expect(plan.level).toBe('critical');
    expect(plan.deadline).toMatch(/One more missed payroll ends Paylink/);
    expect(c.story!.headline).toMatch(/one missed payroll from closing/);
    expect(c.story!.items[0]!.text).toBe('One more missed payroll ends the company.');
    const inbox = w.inbox[F]!;
    expect(inbox.some((i) => /one more missed payroll ends the company/.test(i.text))).toBe(true);
    // Shutdown rules are unchanged: the second miss ends it.
    w = settle(w, 'lagos', 1);
    c = companyOf(w, F);
    expect(c.status).toBe('shutdown');
    expect(c.distress).toBeNull();
  });

  it('a healthy company has no rescue plan in the view', () => {
    let w = editable(addFounder(makeWorld()));
    setCash(w, 50_000_000_00);
    w = settle(w, 'lagos', 1);
    expect(companyOf(w, F).distress).toBeNull();
    expect(playerView(w, F)!.companies[0]!.rescue).toBeNull();
  });
});

describe('rescue moves', () => {
  it('cutCosts reduces burn: survival budget in one tap', () => {
    let w = editable(addFounder(makeWorld()));
    addStaff(w, 2, 200_000_00);
    setCash(w, 20_000_000_00);
    const c0 = companyOf(w, F);
    w = run(w, F, {
      type: 'company.strategy',
      companyId: c0.id,
      marketingBudget: 200_000_00,
      founderSalary: 300_000_00,
    }).world;
    w = settle(w, 'lagos', 1);
    const before = companyOf(w, F).finance.history.at(-1)!;
    const costsBefore = monthlyCosts(w, companyOf(w, F));
    const total = moneyByCurrency(w);
    const r = run(w, F, { type: 'company.cutCosts', companyId: c0.id });
    w = r.world;
    expect(r.result.savedPerMonth).toBeGreaterThan(0);
    const c = companyOf(w, F);
    expect(c.marketingBudget).toBe(0);
    expect(c.founderSalary).toBeLessThan(300_000_00);
    expect(c.officeDownsized).toBe(true);
    expect(monthlyCosts(w, c)).toBe(costsBefore - r.result.savedPerMonth);
    w = settle(w, 'lagos', 1);
    const after = companyOf(w, F).finance.history.at(-1)!;
    expect(after.marketing).toBe(0);
    expect(after.office).toBeLessThan(before.office);
    expect(after.founderSalary).toBeLessThan(before.founderSalary);
    expect(moneyByCurrency(w)).toEqual(total);
    // A second survival tap has nothing left to cut; partial cuts can't raise spending.
    expect(tryRun(w, F, { type: 'company.cutCosts', companyId: c0.id }).ok).toBe(false);
    expect(
      tryRun(w, F, { type: 'company.cutCosts', companyId: c0.id, marketing: 1_000_00 }).ok,
    ).toBe(false);
  });

  it('hibernate lowers burn, freezes the product and decays customers', () => {
    let w = editable(growing(150_000_00, 4));
    addStaff(w, 2, 200_000_00);
    setCash(w, 20_000_000_00);
    const c0 = companyOf(w, F);
    const costs = monthlyCosts(w, c0);
    const product = { ...c0.product, discovery: undefined };
    const paying = Object.values(c0.segments).reduce((a, s) => a + s.paying, 0);
    expect(paying).toBeGreaterThan(10);
    const r = run(w, F, { type: 'company.hibernate', companyId: c0.id, on: true });
    w = r.world;
    let c = companyOf(w, F);
    expect(c.hibernation).toEqual({ since: w.markets.lagos!.month });
    expect(monthlyCosts(w, c)).toBeLessThan(costs * 0.7);
    expect(c.staff.every((s) => s.morale <= 60)).toBe(true);
    // No hiring or building while hibernating.
    const cand = w.markets.lagos!.talent[0]!;
    const hire = tryRun(w, F, {
      type: 'company.offer',
      companyId: c.id,
      candidateId: cand.id,
      salary: cand.ask * 2,
      equityBps: 0,
    });
    expect(hire.ok).toBe(false);
    if (!hire.ok) expect(hire.error.code).toBe('hire.hibernating');
    expect(tryRun(w, F, { type: 'company.build', companyId: c.id, hours: 20 }).ok).toBe(false);
    w = settle(w, 'lagos', 2);
    c = companyOf(w, F);
    const pnl = c.finance.history.at(-1)!;
    expect(pnl.marketing).toBe(0);
    expect(pnl.payroll).toBe(Math.round(400_000_00 * 0.4));
    const nowPaying = Object.values(c.segments).reduce((a, s) => a + s.paying, 0);
    expect(nowPaying).toBeLessThan(paying);
    expect(nowPaying).toBeGreaterThan(paying * 0.85);
    expect(Object.values(c.segments).every((s) => s.won === 0)).toBe(true);
    expect({ ...c.product, discovery: undefined }).toEqual(product);
    expect(c.story!.items.some((i) => /Hibernating/.test(i.text))).toBe(true);
    // Waking up restores full pay.
    w = run(w, F, { type: 'company.hibernate', companyId: c.id, on: false }).world;
    expect(companyOf(w, F).hibernation).toBeNull();
  });

  function withFundBacker(w0: World, invested: number) {
    const w = editable(w0);
    const c = companyOf(w, F);
    const m = w.markets.lagos!;
    const fund = Object.values(w.funds).find((f) => f.market === 'lagos' && !f.managerId)!;
    transfer(w, fund.account, c.account, invested, 'Test seed SAFE', m.month);
    addSafe(c.capTable, {
      holderId: fund.id,
      amount: invested,
      cap: invested * 10,
      month: m.month,
    });
    c.capTable.lastPostMoney = invested * 10;
    w.positions[`${fund.id}:${c.id}`] = {
      investorId: fund.id,
      companyId: c.id,
      invested,
      returned: 0,
      month: m.month,
      writtenOff: false,
    };
    return { w, fund };
  }

  it('bridge: an AI investor backs a growing company on a discounted SAFE', () => {
    const { w: w0, fund } = withFundBacker(growing(150_000_00, 3), 10_000_000_00);
    const c0 = companyOf(w0, F);
    const total = moneyByCurrency(w0);
    const cash = w0.accounts[c0.account]!.balance;
    const r = run(w0, F, { type: 'company.bridge', companyId: c0.id, amount: 3_000_000_00 });
    const w = r.world;
    expect(r.result.dealIds).toHaveLength(1);
    const d = w.deals[r.result.dealIds[0]]!;
    expect(d.counterparty).toEqual({ kind: 'fund', id: fund.id });
    expect(d.terms).toMatchObject({ kind: 'investment', instrument: 'safe', bridge: true });
    expect(d.terms.kind === 'investment' && d.terms.valuation).toBe(80_000_000_00);
    expect(d.summary).toMatch(/bridge/i);
    expect(d.status).toBe('accepted');
    const c = companyOf(w, F);
    expect(w.accounts[c.account]!.balance).toBe(cash + 3_000_000_00);
    expect(c.capTable.safes.filter((s) => s.holderId === fund.id)).toHaveLength(2);
    expect(w.positions[`${fund.id}:${c.id}`]!.invested).toBe(13_000_000_00);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(negativeInternalAccounts(w)).toEqual([]);
  });

  it('bridge: an AI investor counters a big ask and walks from a collapsing company', () => {
    const { w: w0 } = withFundBacker(growing(150_000_00, 3), 10_000_000_00);
    const c0 = companyOf(w0, F);
    // Asking for more than half the position: the fund meets partway.
    const big = run(w0, F, { type: 'company.bridge', companyId: c0.id, amount: 8_000_000_00 });
    const d = big.world.deals[big.result.dealIds[0]]!;
    expect(d.status).toBe('open');
    expect(d.awaiting).toEqual({ kind: 'company', id: c0.id });
    expect(d.terms.kind === 'investment' && d.terms.amount).toBe(5_000_000_00);
    const ok = run(big.world, F, { type: 'deal.act', dealId: d.id, action: 'accept' });
    expect(ok.world.deals[d.id]!.status).toBe('accepted');

    // Unpaid staff: no follow-on.
    const bad = editable(w0);
    companyOf(bad, F).finance.unpaidPayroll = 1;
    const no = run(bad, F, { type: 'company.bridge', companyId: c0.id, amount: 1_000_000_00 });
    const nd = no.world.deals[no.result.dealIds[0]]!;
    expect(nd.status).toBe('declined');
    expect(nd.history.at(-1)!.summary).toBe('Not while staff are unpaid.');
    expect(no.result.message).toMatch(/passed/);
  });

  it('bridge: a human investor gets the deal card; no investors means no bridge', () => {
    const solo = addFounder(makeWorld());
    const none = tryRun(solo, F, {
      type: 'company.bridge',
      companyId: companyOf(solo, F).id,
      amount: 1_000_000_00,
    });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error.code).toBe('bridge.none');

    const w = editable(addInvestor(growing(150_000_00, 2), 'u_inv'));
    const c = companyOf(w, F);
    addSafe(c.capTable, { holderId: 'u_inv', amount: 1, cap: 10_000_000_00, month: 0 });
    c.capTable.lastPostMoney = 10_000_000_00;
    const r = run(w, F, { type: 'company.bridge', companyId: c.id, amount: 1_000_000_00 });
    const d = r.world.deals[r.result.dealIds[0]]!;
    expect(d.status).toBe('open');
    expect(d.awaiting).toEqual({ kind: 'player', id: 'u_inv' });
    expect(r.world.inbox.u_inv!.some((i) => i.ref?.id === d.id)).toBe(true);
    // One bridge at a time.
    const again = tryRun(r.world, F, { type: 'company.bridge', companyId: c.id, amount: 1_000_00 });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('bridge.open');
    const total = moneyByCurrency(r.world);
    const done = run(r.world, 'u_inv', { type: 'deal.act', dealId: d.id, action: 'accept' });
    expect(done.world.deals[d.id]!.status).toBe('accepted');
    expect(moneyByCurrency(done.world)).toEqual(total);
  });

  it('fire sale: an AI acquirer makes a quick distressed offer the founder can take', () => {
    const w0 = growing(150_000_00, 4);
    const c0 = companyOf(w0, F);
    const total = moneyByCurrency(w0);
    const r = run(w0, F, { type: 'company.fireSale', companyId: c0.id });
    const d = r.world.deals[r.result.dealId]!;
    expect(d.terms.kind).toBe('acquisition');
    expect(d.proposer.kind).toBe('corporate');
    expect(d.awaiting).toEqual({ kind: 'company', id: c0.id });
    expect(d.expiresMonth).toBe(r.world.markets.lagos!.month + 1);
    expect(d.terms.kind === 'acquisition' && d.terms.price).toBeGreaterThan(0);
    expect(tryRun(r.world, F, { type: 'company.fireSale', companyId: c0.id }).ok).toBe(false);
    const done = run(r.world, F, { type: 'deal.act', dealId: d.id, action: 'accept' });
    expect(companyOf(done.world, F).status).toBe('acquired');
    expect(moneyByCurrency(done.world)).toEqual(total);
  });

  it('rescue commands respect permissions and hours', () => {
    let w = addFounder(makeWorld());
    w = addFounder(w, 'u_rival', 'lagos', 'Tradeflow');
    const c = companyOf(w, F);
    for (const cmd of [
      { type: 'company.cutCosts' as const, companyId: c.id },
      { type: 'company.hibernate' as const, companyId: c.id, on: true },
      { type: 'company.fireSale' as const, companyId: c.id },
    ]) {
      const r = tryRun(w, 'u_rival', cmd);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('company.forbidden');
    }
    const tired = editable(w);
    const p = tired.players[F]!;
    p.hours.used = p.hours.available;
    const r = tryRun(tired, F, { type: 'company.fireSale', companyId: c.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('hours.short');
  });
});

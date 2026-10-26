/**
 * Founder setup (setup.ts): a new founder registers the company, funds it
 * (own money, startup loans from city lenders and player banks), writes a
 * plan with live checks when asking for loans, and leases an office, before
 * the company has any costs. Behind the feedback note: without it a company
 * is founded and seeded exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { monthlyCosts, officeRent } from '../src/company.js';
import { journeyView } from '../src/journey.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { planScore, setupPlanChecks, type SetupPlanBase } from '../src/setup.js';
import { playerView } from '../src/views.js';
import type { SetupPlanFields, World } from '../src/types.js';
import { DAY, T0, companyOf, makeWorld, moneyByCurrency, run, settle, tryRun } from './helpers.js';

const F = 'u_founder';
const B = 'u_bank';
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;

const idea = {
  name: 'Iwe Books',
  industry: 'fintech' as const,
  revenueModel: 'subscription' as const,
  idea: 'A phone ledger for market traders',
  incorporation: 'local' as const,
};

/** A founder who has just picked an idea (and so reserved the name). */
function founder(w: World): World {
  w = run(w, F, {
    type: 'player.quickStart',
    username: 'adaeze',
    role: 'founder',
    market: 'lagos',
  }).world;
  return run(w, F, { type: 'company.found', company: idea }).world;
}

/** A licensed player bank in Lagos (licensed before the note, the old way, to keep it short). */
function withBank(seed: number): World {
  let w = run(makeWorld(seed, ['lagos']), B, {
    type: 'player.create',
    handle: 'h_bank',
    name: 'Ngozi Banker',
    role: 'banker',
    backgroundId: 'b-wealthy',
    market: 'lagos',
    bank: { name: 'Lagoon Venture Bank', bankType: 'microfinance' },
  }).world;
  w = settle(w, 'lagos', 2, T0 + DAY);
  expect(Object.values(w.banks)[0]!.status).toBe('licensed');
  return w;
}

const view = (w: World) => playerView(w, F)!.companies[0]!.setup!;
const co = (w: World) => companyOf(w, F);

function registered(w: World): World {
  return run(w, F, {
    type: 'company.setup',
    companyId: co(w).id,
    action: 'register',
    incorporation: 'local',
  }).world;
}

function plan(w: World, over: Partial<SetupPlanFields> = {}): SetupPlanFields {
  const c = co(w);
  const seg = w.markets.lagos!.segments[c.targetSegments[0]!]!;
  return {
    sell: 'A phone ledger for sales and pay-later customers',
    segment: seg.key,
    price: Math.round(seg.budget * 0.7),
    costToServe: Math.round(seg.budget * 0.07),
    monthlyCosts: 30_000_000,
    customersMonth6: 400,
    ask: 250_000_000,
    months: 6,
    ...over,
  };
}

describe('founder setup', () => {
  it('reserves the name only: no money moves and nothing is due before setup', () => {
    let w = announce(makeWorld(81, ['lagos']));
    w = run(w, F, {
      type: 'player.quickStart',
      username: 'adaeze',
      role: 'founder',
      market: 'lagos',
    }).world;
    const before = moneyByCurrency(w);
    const savings = w.accounts[w.players[F]!.accounts.local]!.balance;
    w = run(w, F, { type: 'company.found', company: idea }).world;
    const c = co(w);
    expect(c.setup?.step).toBe('register');
    expect(w.accounts[c.account]!.balance).toBe(0);
    expect(w.accounts[w.players[F]!.accounts.local]!.balance).toBe(savings);
    expect(moneyByCurrency(w)).toEqual(before);
    // No costs, so no payday warning and no distress.
    expect(monthlyCosts(w, c)).toBe(0);
    const pv = playerView(w, F)!.companies[0]!;
    expect(pv.nextMonth).toBeNull();
    expect(pv.setup!.steps.map((s) => s.status)).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    w = settle(w, 'lagos', 1, T0 + DAY);
    expect(co(w).distress ?? null).toBeNull();
    expect(co(w).status).toBe('active');
  });

  it('goes register → own money → office → done, rent through the ledger', () => {
    let w = founder(announce(makeWorld(82, ['lagos'])));
    const savings0 = w.accounts[w.players[F]!.accounts.local]!.balance;
    const total = moneyByCurrency(w);
    // The office needs money in the company first.
    expect(tryRun(w, F, { type: 'company.setup', companyId: co(w).id, action: 'next' }).ok).toBe(
      false,
    );
    w = registered(w);
    const fee = co(w).setup!.registered!.fee;
    expect(w.accounts[w.players[F]!.accounts.local]!.balance).toBe(savings0 - fee);
    expect(view(w).step).toBe('fund');
    // Own money, half as shares.
    const own = Math.round((savings0 - fee) / 2);
    w = run(w, F, {
      type: 'company.contribute',
      companyId: co(w).id,
      amount: own,
      as: 'equity',
    }).world;
    expect(w.accounts[co(w).account]!.balance).toBe(own);
    // The runway estimate measures the chosen capital.
    const est = view(w).runway;
    expect(est.cash).toBe(own);
    expect(est.months).toBeCloseTo(own / est.monthly, 0);
    // Still no costs before the office: no payday warning.
    expect(playerView(w, F)!.companies[0]!.nextMonth).toBeNull();
    w = run(w, F, { type: 'company.setup', companyId: co(w).id, action: 'next' }).world;
    expect(view(w).step).toBe('office');
    const offices = view(w).offices;
    expect(offices.map((o) => o.id)).toEqual(['home', 'cowork', 'small', 'shop', 'serviced']);
    expect(new Set(offices.slice(1).map((o) => o.district)).size).toBe(4);
    const cowork = offices.find((o) => o.id === 'cowork')!;
    expect(cowork.rent).toBeGreaterThan(0);
    w = run(w, F, {
      type: 'company.setup',
      companyId: co(w).id,
      action: 'office',
      officeId: 'cowork',
    }).world;
    const c = co(w);
    expect(c.setup!.step).toBe('done');
    expect(view(w).steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'skipped', 'done']);
    expect(officeRent(w.markets.lagos!, c)).toBe(cowork.rent);
    // The month's rent leaves the company account for the landlord.
    const cash = w.accounts[c.account]!.balance;
    w = settle(w, 'lagos', 1, T0 + DAY);
    const pnl = co(w).finance.history.at(-1)!;
    expect(pnl.office).toBe(cowork.rent);
    expect(w.accounts[co(w).account]!.balance).toBeLessThan(cash);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('the journey leads a founder in setup back to it until the office is chosen', () => {
    let w = founder(announce(makeWorld(83, ['lagos'])));
    const first = (x: World) =>
      journeyView(x, x.players[F]!)!.chapters[0]!.steps.find((s) => s.id === 'hustle.company')!;
    expect(first(w)).toMatchObject({
      done: false,
      go: { kind: 'tab', tab: 'company' },
      progress: { have: 1, need: 5 },
    });
    w = registered(w);
    w = run(w, F, {
      type: 'company.contribute',
      companyId: co(w).id,
      amount: Math.round(w.accounts[w.players[F]!.accounts.local]!.balance / 2),
      as: 'equity',
    }).world;
    expect(first(w)).toMatchObject({ done: false, progress: { have: 2, need: 5 } });
    w = run(w, F, { type: 'company.setup', companyId: co(w).id, action: 'next' }).world;
    w = run(w, F, {
      type: 'company.setup',
      companyId: co(w).id,
      action: 'office',
      officeId: 'home',
    }).world;
    expect(first(w).done).toBe(true);
    expect(first(w).progress).toBeUndefined();
  });

  it('checks the plan live, blocks a red check, and a city lender decides on it', () => {
    let w = registered(founder(announce(makeWorld(83, ['lagos']))));
    const c = co(w);
    const savings = w.accounts[w.players[F]!.accounts.local]!.balance;
    w = run(w, F, {
      type: 'company.contribute',
      companyId: c.id,
      amount: Math.round(savings / 3),
      as: 'equity',
    }).world;
    // Months it lasts claimed far beyond the money: red, refused.
    const red = tryRun(w, F, {
      type: 'company.setup',
      companyId: c.id,
      action: 'plan',
      plan: plan(w, { months: 60 }),
    });
    expect(red.ok).toBe(false);
    expect(!red.ok && red.error.code).toBe('setup.plan.red');
    // A city startup loan needs the plan first.
    const lender = view(w).loans.find((l) => l.lenderId === 'delta-enterprise' && l.startup)!;
    expect(lender.eligible).toBe(true);
    const ask = {
      type: 'company.loan' as const,
      companyId: c.id,
      lenderId: lender.lenderId,
      productId: lender.productId,
      amount: 250_000_000,
      months: 24,
      personalGuarantee: false,
    };
    expect(tryRun(w, F, ask).ok).toBe(false);
    w = run(w, F, { type: 'company.setup', companyId: c.id, action: 'plan', plan: plan(w) }).world;
    expect(co(w).setup!.plan!.checks.every((x) => x.level !== 'bad')).toBe(true);
    const total = moneyByCurrency(w);
    const before = w;
    const r = run(w, F, ask);
    w = r.world;
    const d = co(w).setup!.decisions[0]!;
    // Customer understanding is still thin: approved, with conditions.
    expect(d.outcome).toBe('conditions');
    // Deterministic: the same plan gets the same answer.
    expect(co(run(before, F, ask).world).setup!.decisions[0]).toEqual(d);
    expect(d.now + d.rest).toBe(d.amount);
    expect(d.restAfterCustomers).toBeGreaterThan(0);
    // Accept: the money lands in the company, conserved.
    const cash = w.accounts[co(w).account]!.balance;
    w = run(w, F, { type: 'deal.act', dealId: d.dealId!, action: 'accept' }).world;
    expect(w.accounts[co(w).account]!.balance).toBe(cash + d.now);
    expect(co(w).finance.loans).toHaveLength(1);
    expect(moneyByCurrency(w)).toEqual(total);
    // Approved with conditions: paying customers release the rest at month end.
    {
      w = produce(w, (x) => {
        const cc = x.companies[c.id]!;
        const pos = cc.segments[cc.targetSegments[0]!]!;
        pos.paying += d.restAfterCustomers + 1;
      });
      w = settle(w, 'lagos', 1, T0 + DAY);
      const rest = co(w).setup!.decisions[0]!.restDealId!;
      expect(w.deals[rest]!.terms).toMatchObject({ amount: d.rest });
      expect(w.inbox[F]!.some((i) => /condition met/.test(i.text))).toBe(true);
    }
  });

  it('declines a weak plan with the reasons, and a lender the founder isn’t eligible for', () => {
    let w = registered(founder(announce(makeWorld(84, ['lagos']))));
    const c = co(w);
    // Barely any margin, a long claimed runway, too few customers: many warnings.
    w = run(w, F, {
      type: 'company.setup',
      companyId: c.id,
      action: 'plan',
      plan: plan(w, {
        costToServe: Math.round(plan(w).price * 0.75),
        customersMonth6: 5,
        months: 1,
      }),
    }).world;
    const lender = view(w).loans.find((l) => l.lenderId === 'delta-enterprise' && l.startup)!;
    const r = run(w, F, {
      type: 'company.loan',
      companyId: c.id,
      lenderId: lender.lenderId,
      productId: lender.productId,
      amount: 250_000_000,
      months: 24,
      personalGuarantee: false,
    });
    const d = co(r.world).setup!.decisions[0]!;
    expect(d.outcome).not.toBe('approved');
    expect(d.reasons.length).toBeGreaterThan(0);
    // Asking the same lender again the same month after a decline is refused.
    if (d.outcome === 'declined')
      expect(
        tryRun(r.world, F, {
          type: 'company.loan',
          companyId: c.id,
          lenderId: lender.lenderId,
          productId: lender.productId,
          amount: 250_000_000,
          months: 24,
          personalGuarantee: false,
        }).ok,
      ).toBe(false);
  });

  it('scores checks: good, warn and bad with figures', () => {
    const base: SetupPlanBase = {
      budget: 6_750_00,
      known: 0.08,
      cash: 2_870_000_00,
      reachable: 5000,
      rateBps: 500,
      termMonths: 24,
    };
    const fields: SetupPlanFields = {
      sell: 'Ledger',
      segment: 'x',
      price: 5_000_00,
      costToServe: 600_00,
      monthlyCosts: 455_000_00,
      customersMonth6: 60,
      ask: 2_500_000_00,
      months: 12,
    };
    const checks = setupPlanChecks(fields, base);
    const by = Object.fromEntries(checks.map((x) => [x.id, x]));
    expect(by.price!.level).toBe('good');
    expect(by.margin!.values.pct).toBe(88);
    expect(by.breakEven!.values.need).toBe(104);
    expect(by.breakEven!.level).toBe('warn');
    expect(by.runway!.level).toBe('bad');
    expect(by.understanding!.level).toBe('warn');
    expect(by.repayment!.level).toBe('good');
    expect(planScore(checks, 58)).toBeGreaterThan(0);
    // Saying 9 months fixes the runway check.
    const fixed = setupPlanChecks({ ...fields, months: by.runway!.values.sayMonths! }, base);
    expect(fixed.find((x) => x.id === 'runway')!.level).toBe('good');
  });

  it('sends a startup loan application to a player bank; the banker approves it', () => {
    let w = registered(founder(announce(withBank(85))));
    const c = co(w);
    const bank = Object.values(w.banks)[0]!;
    const req = {
      type: 'company.loan' as const,
      companyId: c.id,
      bankId: bank.id,
      amount: 100_000_000,
      months: 18,
      personalGuarantee: false,
    };
    // The banker reads the plan: no plan, no application.
    expect(tryRun(w, F, req).ok).toBe(false);
    w = run(w, F, { type: 'company.setup', companyId: c.id, action: 'plan', plan: plan(w) }).world;
    const sent = run(w, F, req);
    w = sent.world;
    const deal = w.deals[sent.result.dealId]!;
    expect(deal.application?.plan.sell).toMatch(/phone ledger/);
    // On the banker's desk: the plan and the bank-side checks.
    const desk = playerView(w, B)!.deals.find((d) => d.id === deal.id)!;
    expect(desk.yourTurn).toBe(true);
    expect(desk.application!.checks.map((x) => x.id)).toEqual([
      'repayment',
      'customers',
      'credit',
      'capital',
      'single',
    ]);
    expect(desk.application!.interest).toBeGreaterThan(0);
    const total = moneyByCurrency(w);
    const cash = w.accounts[c.account]!.balance;
    w = run(w, B, { type: 'deal.act', dealId: deal.id, action: 'accept' }).world;
    expect(w.deals[deal.id]!.status).toBe('accepted');
    expect(w.accounts[c.account]!.balance).toBe(cash + 100_000_000);
    expect(co(w).finance.loans[0]!.lenderBankId).toBe(bank.id);
    expect(moneyByCurrency(w)).toEqual(total);
    // The founder sees the result.
    expect(w.inbox[F]!.some((i) => /Loan received/.test(i.text))).toBe(true);
  });

  it('a banker counters (amount, term, rate, guarantee) and the founder accepts', () => {
    let w = registered(founder(announce(withBank(86))));
    const c = co(w);
    const bank = Object.values(w.banks)[0]!;
    w = run(w, F, { type: 'company.setup', companyId: c.id, action: 'plan', plan: plan(w) }).world;
    const sent = run(w, F, {
      type: 'company.loan',
      companyId: c.id,
      bankId: bank.id,
      amount: 150_000_000,
      months: 18,
      personalGuarantee: false,
    });
    w = sent.world;
    const id = sent.result.dealId as string;
    w = run(w, B, {
      type: 'deal.act',
      dealId: id,
      action: 'counter',
      terms: { amount: 100_000_000, months: 24, rateBps: 3100, personalGuarantee: true },
    }).world;
    const t = w.deals[id]!.terms;
    expect(t).toMatchObject({
      amount: 100_000_000,
      months: 24,
      rateBps: 3100,
      personalGuarantee: true,
    });
    expect(playerView(w, F)!.deals.find((d) => d.id === id)!.yourTurn).toBe(true);
    const total = moneyByCurrency(w);
    w = run(w, F, { type: 'deal.act', dealId: id, action: 'accept' }).world;
    expect(co(w).finance.loans[0]!).toMatchObject({ principal: 100_000_000, rateBps: 3100 });
    expect(co(w).finance.loans[0]!.personalGuarantee).toBe(F);
    expect(moneyByCurrency(w)).toEqual(total);
  });

  it('a banker declines with a reason; the founder can withdraw a waiting one', () => {
    let w = registered(founder(announce(withBank(87))));
    const c = co(w);
    const bank = Object.values(w.banks)[0]!;
    w = run(w, F, { type: 'company.setup', companyId: c.id, action: 'plan', plan: plan(w) }).world;
    const ask = {
      type: 'company.loan' as const,
      companyId: c.id,
      bankId: bank.id,
      amount: 100_000_000,
      months: 18,
      personalGuarantee: false,
    };
    const total = moneyByCurrency(w);
    const one = run(w, F, ask);
    w = run(one.world, B, {
      type: 'deal.act',
      dealId: one.result.dealId,
      action: 'decline',
      reason: 'no-customers',
    }).world;
    const d = w.deals[one.result.dealId]!;
    expect(d.status).toBe('declined');
    expect(d.application!.declineReason).toBe('no-customers');
    expect(d.history.at(-1)!.summary).toMatch(/no customers yet/);
    expect(moneyByCurrency(w)).toEqual(total);
    // A second application nobody answers can be withdrawn.
    const two = run(w, F, ask);
    w = run(two.world, F, {
      type: 'deal.act',
      dealId: two.result.dealId,
      action: 'withdraw',
    }).world;
    expect(w.deals[two.result.dealId]!.status).toBe('withdrawn');
  });

  it('without the feedback note a company is founded and seeded as before', () => {
    let w = makeWorld(88, ['lagos']);
    w = run(w, F, {
      type: 'player.quickStart',
      username: 'adaeze',
      role: 'founder',
      market: 'lagos',
    }).world;
    w = run(w, F, { type: 'company.found', company: idea }).world;
    const c = co(w);
    expect(c.setup).toBeUndefined();
    expect(w.accounts[c.account]!.balance).toBeGreaterThan(0);
    expect(officeRent(w.markets.lagos!, c)).toBeGreaterThan(0);
    expect(playerView(w, F)!.companies[0]!.setup).toBeNull();
    expect(
      tryRun(w, F, {
        type: 'company.setup',
        companyId: c.id,
        action: 'register',
        incorporation: 'local',
      }).ok,
    ).toBe(false);
  });

  it('player.create with a company (the seeded start) is unchanged under the note', () => {
    const w = run(announce(makeWorld(89, ['lagos'])), F, {
      type: 'player.create',
      handle: 'h_founder',
      name: 'Ada',
      role: 'founder',
      backgroundId: 'f-engineer',
      market: 'lagos',
      company: idea,
    }).world;
    expect(co(w).setup).toBeUndefined();
    expect(w.accounts[co(w).account]!.balance).toBeGreaterThan(0);
  });
});

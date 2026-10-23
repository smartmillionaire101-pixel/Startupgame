/**
 * A realistic first fund (MORE_GAMES_NOTE, firstfund.ts): a suggested size
 * from the record, first-time-manager LPs (an emerging-manager programme,
 * angels you met, friends and family), the anchor effect, rolling closes and
 * next steps when LPs pass.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { FIRST_FUND, INVESTOR } from '../src/data/investor.js';
import {
  emergingProgramme,
  firstFundPool,
  firstFundRecord,
  markupsOf,
  suggestFundSize,
} from '../src/firstfund.js';
import type { FirstFundRecord } from '../src/firstfund.js';
import { committedTotal } from '../src/lpfunds.js';
import { fitPlanToSize, reviewPitch, strategyChecks, typicalPostMoney } from '../src/lpreview.js';
import type { StrategyPlan } from '../src/lpreview.js';
import { DEALFLOW_NOTE, MORE_GAMES_NOTE, PLACES_NOTE } from '../src/releases.js';
import { createRng } from '../src/rng.js';
import { valueIn } from '../src/ledger.js';
import { playerView } from '../src/views.js';
import type { World } from '../src/types.js';
import { addInvestor, makeWorld, moneyByCurrency, run, settle, tryRun } from './helpers.js';

const I = 'u_investor';
/** ₦2m: a new angel's cheque (minor units). */
const CHEQUE = 2_000_000_00;

function noteWorld(note: string, seed: number, markets = ['lagos'] as const): World {
  return run(makeWorld(seed, [...markets]), null, {
    type: 'system.announce',
    id: note,
    text: 'An update.',
  }).world;
}

function newInvestor(w: World): World {
  w = addInvestor(w);
  return run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
}

/**
 * An angel's record: `deals` cheques into AI companies, `markups` of them
 * marked up by a later round, and `met` investors talked to at events.
 */
function withRecord(w: World, deals: number, markups: number, met = 3, cheque = CHEQUE): World {
  return produce(w, (d) => {
    const ids = Object.values(d.companies)
      .filter((c) => c.market === 'lagos' && c.status === 'active' && c.ai)
      .slice(0, deals)
      .map((c) => c.id);
    expect(ids.length).toBe(deals);
    ids.forEach((cid, i) => {
      d.positions[`${I}:${cid}`] = {
        investorId: I,
        companyId: cid,
        invested: cheque,
        returned: 0,
        month: 0,
        writtenOff: false,
        ...(i < markups
          ? { marks: [{ month: 1, value: cheque * 2, source: 'round' as const }] }
          : {}),
      };
    });
    const p = d.players[I]!;
    const book = (p.dealflow ??= { lessons: [], talks: [] });
    const funds = Object.values(d.funds).filter((f) => f.market === 'lagos');
    for (let k = 0; k < met; k++) {
      const f = funds[k % funds.length]!;
      book.talks.push({
        fundId: `${f.id}-${k}`,
        name: `Investor ${k + 1}`,
        org: f.name,
        angel: true,
        where: 'Demo day',
        month: d.markets.lagos!.month,
        lessonId: 'thesis-focus',
        learned: false,
        sectors: 'any',
        stages: ['seed'],
        cheque: [CHEQUE, CHEQUE * 2],
        size: 0,
        currency: 'NGN',
        companies: 20,
        reserveRatio: 0.5,
        ownership: 0.05,
        referredId: null,
        coinvest: false,
      });
    }
  });
}

/** A coherent pre-seed plan at this size (the client's "Use this size"). */
function planAt(w: World, size: number): StrategyPlan {
  return {
    sectors: ['fintech'],
    stages: ['pre-seed'],
    geography: 'city',
    feeRate: 0.02,
    carry: 0.2,
    size,
    ...fitPlanToSize(size, ['pre-seed'], typicalPostMoney(w, 'lagos')),
  };
}

const raise = (plan: StrategyPlan) => ({
  type: 'fund.raise' as const,
  sectors: ['fintech' as const],
  stages: ['pre-seed' as const],
  checkSize: plan.avgCheque,
  why: 'Pre-seed fintech for the market traders I already back',
  plan: {
    geography: plan.geography,
    size: plan.size,
    avgCheque: plan.avgCheque,
    companies: plan.companies,
    reserveRatio: plan.reserveRatio,
    targetOwnership: plan.targetOwnership,
    feeRate: plan.feeRate,
    carry: plan.carry,
  },
});

const NAIRA_M = 1_000_000_00;

describe('first fund: the suggested size', () => {
  const base: FirstFundRecord = {
    invested: 5 * CHEQUE,
    returned: 0,
    deals: 5,
    markups: 1,
    dpi: 0,
    lessons: 2,
    lessonsTotal: 20,
    stars: 1.8,
    monthCost: 450_000_00,
  };

  it('is about ₦100–300m in Lagos for a new investor with a handful of deals', () => {
    const s = suggestFundSize(base);
    expect(s.size).toBeGreaterThanOrEqual(100 * NAIRA_M);
    expect(s.size).toBeLessThanOrEqual(300 * NAIRA_M);
    expect(s.lo).toBeLessThan(s.size);
    expect(s.hi).toBeGreaterThan(s.size);
    expect(s.multiple).toBeGreaterThanOrEqual(10);
    expect(s.multiple).toBeLessThanOrEqual(50);
  });

  it('grows with deals, markups, cash returned, lessons and reputation', () => {
    const at = (r: Partial<FirstFundRecord>) => suggestFundSize({ ...base, ...r }).size;
    expect(at({ deals: 8 })).toBeGreaterThan(at({}));
    expect(at({ markups: 2 })).toBeGreaterThan(at({}));
    expect(at({ dpi: 1, returned: base.invested })).toBeGreaterThan(at({}));
    expect(at({ lessons: 10 })).toBeGreaterThan(at({}));
    expect(at({ stars: 3.5 })).toBeGreaterThan(at({}));
    expect(at({ deals: 1, markups: 0 })).toBeLessThan(at({}));
    // Big cheques: 10–50× the capital deployed takes over from the floor.
    const big = suggestFundSize({ ...base, invested: 5 * 50 * NAIRA_M });
    expect(big.size).toBeGreaterThan(at({}));
    expect(big.size / (5 * 50 * NAIRA_M)).toBeGreaterThanOrEqual(10);
    expect(big.size / (5 * 50 * NAIRA_M)).toBeLessThanOrEqual(50);
  });

  it('scales per city with the cost of living', () => {
    // A new angel's small cheques: the city's floor sets the size.
    let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 301, ['lagos', 'london'] as never));
    w = withRecord(w, 5, 1, 3, 20_000_00);
    const lagos = firstFundRecord(w, w.players[I]!);
    expect(lagos.markups).toBe(1);
    expect(lagos.monthCost).toBe(w.markets.lagos!.data.costOfLiving * 100);
    const london = {
      ...lagos,
      invested: valueIn(w, lagos.invested, 'NGN', 'GBP'),
      monthCost: w.markets.london!.data.costOfLiving * 100,
    };
    const a = suggestFundSize(lagos);
    const b = suggestFundSize(london);
    // Same record, each city's money: sizes follow the cost of living (rounded to 2 figures).
    const ratio = a.size / lagos.monthCost / (b.size / london.monthCost);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    expect(a.size).toBeGreaterThanOrEqual(100 * NAIRA_M);
  });
});

describe('first fund: raising Fund I', () => {
  it('a new investor with 5 deals and a markup raises Fund I at the suggested size and holds a first close', () => {
    let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 302));
    w = withRecord(w, 5, 1);
    const me = w.players[I]!;
    expect(markupsOf(w, me)).toBe(1);
    const view = playerView(w, I)!.investorDealFlow!.firstFund!;
    expect(view.suggested.size).toBeGreaterThanOrEqual(100 * NAIRA_M);
    expect(view.suggested.size).toBeLessThanOrEqual(300 * NAIRA_M);
    const plan = planAt(w, view.suggested.size);
    expect(
      strategyChecks(plan, typicalPostMoney(w, 'lagos')).every((c) => c.level === 'good'),
    ).toBe(true);
    const before = moneyByCurrency(w);
    const r = run(w, I, raise(plan));
    expect(r.result.ok).toBe(true);
    const review = r.result.review;
    // The emerging-manager programme anchored it, 20–30% of the target.
    expect(review.anchor.name).toBe(emergingProgramme(w, 'lagos').name);
    const anchor = review.lps.find((v: { anchor?: boolean }) => v.anchor);
    expect(anchor.amount).toBeGreaterThanOrEqual(plan.size * 0.2 - 1);
    expect(anchor.amount).toBeLessThanOrEqual(plan.size * 0.3 + 1);
    expect(review.committed).toBeGreaterThanOrEqual(plan.size / 2);
    expect(review.committed).toBeLessThanOrEqual(plan.size);
    expect(review.checks.find((c: { id: string }) => c.id === 'size').level).toBe('good');
    // Each LP asks and answers with a reason; pension and sovereign money waits for Fund II.
    expect(review.questions.length).toBeGreaterThan(0);
    for (const v of review.lps)
      expect(v.reason).toMatch(/^(commit|pass|bar|later|circle|first|wait)-/);
    w = r.world;
    const f = w.funds[r.result.fund.id]!;
    expect(f.lp!.stage).toBe('investing');
    expect(f.lp!.firstCloseMonth).toBe(w.markets.lagos!.month);
    expect(f.lp!.rolling).toBe(true);
    expect(f.lp!.finalCloseMonth).toBeUndefined();
    expect(w.players[I]!.investor!.fundId).toBe(f.id);
    // AI LPs paid in at the first close; the GP's own 1% is called.
    expect(w.accounts[f.account]!.balance).toBe(f.lp!.paidIn);
    expect(f.lp!.calls.some((c) => c.commitmentId === `${f.id}:gp`)).toBe(true);
    expect(f.size).toBe(committedTotal(f));
    // Money only moved through the ledger.
    expect(moneyByCurrency(w)).toEqual(before);
    // It invests from the first close.
    expect(playerView(w, I)!.investorDealFlow!.firstFund!.fund!.committed).toBe(f.size);
  });

  it('the anchor raises every other LP’s willingness, and the review says who anchored', () => {
    let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 303));
    w = withRecord(w, 5, 1);
    const me = w.players[I]!;
    const plan = planAt(w, suggestFundSize(firstFundRecord(w, me)).size);
    // No noise: the scores are the lens arithmetic alone.
    const calm = () => ({ ...createRng(1), normal: (mean = 0) => mean });
    const ctx = { number: 1, type: 'vc' as const, month: 0 };
    // An angel you met, just short of committing on their own.
    const circle = (warmth: number) => ({
      ...firstFundPool(w, me, 'lagos').find((x) => x.kind === 'angel')!,
      id: 'circle:test',
      warmth,
    });
    const base = 0.25 + (me.stars.value / 5) * 0.2 + (5 / 5) * 0.15;
    const warmth = (FIRST_FUND.circle.score - 0.02 - base) / 0.4;
    const alone = reviewPitch(w, me, plan, [circle(warmth)], ctx, calm());
    const anchored = reviewPitch(
      w,
      me,
      plan,
      [circle(warmth)],
      { ...ctx, anchor: { name: 'Test Anchor DFI', amount: 1 } },
      calm(),
    );
    const v0 = alone.lps.find((v) => v.lpId === 'circle:test')!;
    const v1 = anchored.lps.find((v) => v.lpId === 'circle:test')!;
    expect(v0.score).toBe(v1.score);
    expect(v0.commit).toBe(false);
    expect(v1.commit).toBe(true);
    expect(v1.reason).toBe('commit-anchored');
    expect(anchored.anchor!.name).toBe('Test Anchor DFI');
    // In a real panel the programme anchors and the others are lifted the same way.
    const full = reviewPitch(w, me, plan, firstFundPool(w, me, 'lagos'), ctx, calm());
    expect(full.anchor!.name).toBe(emergingProgramme(w, 'lagos').name);
    expect(full.lps.filter((v) => v.anchor).length).toBe(1);
    const lifted = full.lps.filter((v) => !v.anchor && (v.commit || v.reason === 'wait-close'));
    expect(lifted.length).toBeGreaterThan(0);
    for (const v of lifted) expect(v.score + FIRST_FUND.anchorLift).toBeGreaterThanOrEqual(0.45);
  });

  it('after the first close, LPs that waited join month by month up to the target, then the final close', () => {
    let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 302));
    w = withRecord(w, 5, 1, 4);
    const size = playerView(w, I)!.investorDealFlow!.firstFund!.suggested.size;
    const r = run(w, I, raise(planAt(w, size)));
    expect(r.result.ok).toBe(true);
    const waiting = r.result.review.lps.filter(
      (v: { reason: string }) => v.reason === 'wait-close',
    );
    expect(waiting.length).toBeGreaterThan(0);
    w = r.world;
    const id = r.result.fund.id;
    const at = w.funds[id]!.lp!.firstCloseMonth!;
    const first = committedTotal(w.funds[id]!);
    w = settle(w, 'lagos', 1);
    const f1 = w.funds[id]!;
    const late = f1.lp!.commitments.filter((c) => c.month > at && c.kind !== 'gp');
    expect(late.length).toBe(1);
    expect(committedTotal(f1)).toBeGreaterThan(first);
    // The late LP paid in at once, with a catch-up for the month it missed.
    expect(late[0]!.paidIn).toBe(late[0]!.committed);
    expect(late[0]!.catchUp).toBeGreaterThan(0);
    expect(f1.lp!.finalCloseMonth).toBeUndefined();
    const view = playerView(w, I)!.investorDealFlow!.firstFund!.fund!;
    expect(view.joined.map((x) => x.name)).toEqual([late[0]!.name]);
    w = settle(w, 'lagos', INVESTOR.fund.finalCloseMonths);
    const f = w.funds[id]!;
    expect(f.lp!.finalCloseMonth).toBeDefined();
    expect(committedTotal(f)).toBeLessThanOrEqual(size + Math.round(size * 0.01));
    expect(f.lp!.commitments.filter((c) => c.month > at && c.kind !== 'gp').length).toBe(
      waiting.length,
    );
    expect(f.size).toBe(committedTotal(f));
    // Every late commitment came in through the ledger: the fund holds what LPs paid in, catch-ups
    // included, less fees and anything invested.
    expect(Number.isInteger(w.accounts[f.account]!.balance)).toBe(true);
  });

  it('pitching far above the suggested size fails, with the size to try instead', () => {
    let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 304));
    w = withRecord(w, 5, 1);
    const suggested = playerView(w, I)!.investorDealFlow!.firstFund!.suggested;
    const r = run(w, I, raise(planAt(w, 1_600 * NAIRA_M)));
    expect(r.result.ok).toBe(false);
    const review = r.result.review;
    expect(review.checks.find((c: { id: string }) => c.id === 'size').level).toBe('bad');
    expect(review.committed).toBe(0);
    expect(review.lps.some((v: { reason: string }) => v.reason === 'pass-size')).toBe(true);
    const size = review.nextSteps.find((x: { id: string }) => x.id === 'size');
    expect(size.values).toEqual({ size: suggested.size, asked: 1_600 * NAIRA_M });
    expect(Object.values(r.world.funds).some((f) => f.managerId === I)).toBe(false);
    expect(r.world.players[I]!.dealflow!.lastPanel!.nextSteps!.length).toBeGreaterThan(0);
  });

  it('an investor with 0–2 deals is heard and told what to do next', () => {
    for (const deals of [0, 2]) {
      let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 305 + deals));
      w = withRecord(w, deals, 0, 1);
      const view = playerView(w, I)!.investorDealFlow!.firstFund!;
      expect(view.ready).toBe(false);
      expect(view.steps.map((x) => x.id)).toEqual(['deals', 'markup', 'meet']);
      expect(view.steps[0]!.values.n).toBe(FIRST_FUND.readyDeals - deals);
      const r = run(w, I, raise(planAt(w, view.suggested.size)));
      expect(r.result.ok).toBe(false);
      const steps = r.result.review.nextSteps.map((x: { id: string }) => x.id);
      expect(steps).toContain('deals');
      expect(steps).toContain('markup');
      expect(steps).toContain('meet');
      // Every LP gives a specific reason, with the figures behind a bar.
      const bar = r.result.review.lps.find((v: { reason: string }) => v.reason === 'bar-deals');
      expect(bar.values.have).toBe(deals);
    }
  });

  it('is deterministic: the same pitch gives the same review', () => {
    const go = () => {
      let w = newInvestor(noteWorld(MORE_GAMES_NOTE, 309));
      w = withRecord(w, 5, 1);
      const size = playerView(w, I)!.investorDealFlow!.firstFund!.suggested.size;
      return run(w, I, raise(planAt(w, size))).result.review;
    };
    expect(go()).toEqual(go());
  });
});

describe('first fund: worlds without the more-games note', () => {
  it('play exactly as before', () => {
    let w = newInvestor(noteWorld(PLACES_NOTE, 310));
    w = withRecord(w, 2, 0, 1);
    expect(playerView(w, I)!.investorDealFlow!.firstFund).toBeNull();
    const plan = planAt(w, 200 * NAIRA_M);
    // A thin record is still refused outright.
    const thin = tryRun(w, I, raise(plan));
    expect(thin.ok).toBe(false);
    if (!thin.ok) expect(thin.error.code).toBe('fund.record');
    // A deal-flow world reviews the old way: no suggested size, no next steps, no LP book.
    let d = newInvestor(noteWorld(DEALFLOW_NOTE, 311));
    d = withRecord(d, 5, 1);
    const big = {
      ...plan,
      ...fitPlanToSize(400_000 * 1530 * 100, ['pre-seed'], typicalPostMoney(d, 'lagos')),
      size: 400_000 * 1530 * 100,
    };
    const r = tryRun(d, I, raise(big));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const review = (r.result as { review: Record<string, unknown> }).review;
      expect(review.suggested).toBeUndefined();
      expect(review.nextSteps).toBeUndefined();
      expect(review.anchor).toBeUndefined();
      const size = (review.checks as { id: string; values: Record<string, number> }[]).find(
        (c) => c.id === 'size',
      )!;
      expect(size.values.upTo).toBeUndefined();
      const fund = Object.values(r.world.funds).find((f) => f.managerId === I);
      if (fund) expect(fund.lp).toBeUndefined();
    }
  });
});

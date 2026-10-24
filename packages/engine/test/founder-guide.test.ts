/**
 * Founder guidance (founderguide.ts): the stage tracker read from the
 * company, the live pricing / spend / payroll checks, scored pitch answers
 * and real pass reasons, and the demo breakdown. The pitch and demo changes
 * are behind the feedback note: worlds without it play exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import type { Command } from '../src/commands.js';
import {
  FOUNDER_GUIDE,
  bestCandidate,
  founderGuide,
  founderPlanBase,
  founderPlanChecks,
  type FounderPlanInput,
} from '../src/founderguide.js';
import { totalCustomers } from '../src/helpers.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Pitch, World } from '../src/types.js';
import { addFounder, companyOf, makeWorld, run } from './helpers.js';

const F = 'u_founder';
const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Feedback.' }).world;
const edit = (w: World, f: (d: World) => void) => produce(w, f);
const mine = (w: World) => companyOf(w, F);
const guide = (w: World) => founderGuide(w, mine(w));
const task = (w: World, id: string) =>
  guide(w)
    .stages.flatMap((s) => s.tasks)
    .find((x) => x.id === id)!;

/** The old random reasons (fundraising.ts PASS_REASONS). */
const OLD_REASONS = [
  'Too early for us. Come back with more traction.',
  'We don’t see how this gets big enough.',
  'Retention worries us. Show us customers stay.',
  'We just lost money in this sector; we’re cautious.',
  'Great team, but the market is crowded.',
];

describe('founder stage tracker', () => {
  it('starts a new company at Idea, with measurable tasks', () => {
    const w = addFounder(makeWorld(3, ['lagos']));
    const g = guide(w);
    expect(g.stage).toBe('idea');
    expect(g.index).toBe(0);
    expect(g.stages.map((s) => s.id)).toEqual([
      'idea',
      'first-customers',
      'product-fit',
      'seed',
      'growth',
      'series-a',
    ]);
    expect(g.stages[0]!.status).toBe('current');
    expect(g.stages[1]!.status).toBe('upcoming');
    expect(task(w, 'idea.discovery')).toMatchObject({ done: false, have: 0, need: 20 });
    expect(g.next?.id).toBe('idea.discovery');
  });

  it('ticks tasks off from real company state and moves stage', () => {
    let w = addFounder(makeWorld(3, ['lagos']));
    const c = mine(w);
    w = run(w, F, {
      type: 'company.discovery',
      companyId: c.id,
      segmentKey: c.targetSegments[0]!,
    }).world;
    expect(task(w, 'idea.discovery').done).toBe(true);
    w = run(w, F, { type: 'sales.prospect' }).world;
    expect(task(w, 'idea.lead').done).toBe(true);
    // The default price sits inside the segment's budget.
    expect(task(w, 'idea.price').done).toBe(true);
    expect(guide(w).stage).toBe('first-customers');
    // Five paying customers.
    w = edit(w, (d) => {
      Object.values(mine(d).segments)[0]!.paying = 5;
    });
    expect(totalCustomers(mine(w))).toBe(5);
    expect(task(w, 'first.customers')).toMatchObject({ done: true, have: 5, need: 5 });
    // A seed round means the company is past Seed, whatever else is open.
    w = edit(w, (d) => {
      mine(d).lastRound = 'seed';
    });
    expect(guide(w).stage).toBe('growth');
    expect(guide(w).stages[3]!.status).toBe('done');
  });

  it('is in the company view', () => {
    const w = addFounder(makeWorld(3, ['lagos']));
    const v = playerView(w, F)!;
    const c = v.companies[0]! as unknown as {
      guide: { stage: string };
      planBase: { budgetMax: number };
    };
    expect(c.guide.stage).toBe('idea');
    expect(c.planBase.budgetMax).toBeGreaterThan(0);
  });
});

describe('pricing, spend and payroll checks', () => {
  const base: FounderPlanInput = {
    costShare: 0.12,
    fixedCosts: 100_000_00,
    payroll: 60_000_00,
    founders: 1,
    cash: 1_200_000_00,
    revenue: 50_000_00,
    basePrice: 5_000_00,
    recurring: true,
    customers: 10,
    budgetMin: 6_000_00,
    budgetMax: 8_000_00,
    reachable: 500,
    lastMarketing: 0,
    lastFromMarketing: 0,
    price: 5_000_00,
    marketing: 20_000_00,
    founderSalary: 0,
  };
  const check = (i: Partial<FounderPlanInput>, id: string) =>
    founderPlanChecks({ ...base, ...i }).find((c) => c.id === id)!;

  it('warns on a price above what customers can pay, and suggests one', () => {
    expect(check({}, 'budget').level).toBe('good');
    expect(check({ price: 9_000_00 }, 'budget').level).toBe('warn');
    const bad = check({ price: 12_000_00 }, 'budget');
    expect(bad.level).toBe('bad');
    expect(bad.values).toMatchObject({ price: 12_000_00, budgetMax: 8_000_00 });
    expect(bad.values.suggested).toBeGreaterThan(0);
    expect(bad.values.suggested).toBeLessThanOrEqual(8_000_00);
  });

  it('works out the margin per customer and the break-even count', () => {
    const m = check({}, 'margin');
    // ₦5,000 less 12% to serve = ₦4,400 a customer; ₦100k of fixed costs = 23 customers.
    expect(m.values).toMatchObject({ cost: 600_00, margin: 4_400_00, breakEven: 23 });
    expect(m.level).toBe('warn');
    expect(check({ customers: 30 }, 'margin').level).toBe('good');
    expect(check({ reachable: 10 }, 'margin').level).toBe('bad');
    expect(check({ costShare: 1.2 }, 'margin').level).toBe('bad');
  });

  it('counts the months the money lasts, from spend and from payroll', () => {
    const r = check({}, 'runway');
    // Out: 100k fixed + 6k to serve + 20k marketing; in: 50k → 76k a month.
    expect(r.values.burn).toBe(76_000_00);
    expect(r.values.months).toBeCloseTo(15.8, 1);
    expect(r.level).toBe('good');
    expect(check({ cash: 500_000_00 }, 'runway').level).toBe('warn');
    expect(check({ cash: 100_000_00 }, 'runway').level).toBe('bad');
    // Payroll alone: 60k salaries less 50k revenue = 10k a month.
    expect(check({}, 'payroll').values.months).toBe(120);
    // An offer on the table moves both.
    const hire = check({ extraPayroll: 200_000_00 }, 'payroll');
    expect(hire.values.months).toBeCloseTo(5.7, 1);
    expect(hire.level).toBe('bad');
    // Earning more than you spend: the money never runs out.
    expect(check({ revenue: 500_000_00 }, 'runway').values.months).toBe(-1);
  });

  it('judges marketing on what a customer costs to win and how long it pays back', () => {
    expect(check({ marketing: 0 }, 'marketing').level).toBe('warn');
    // ₦20k bought 10 customers: ₦2k each, paid back in under a month.
    const ok = check({ lastMarketing: 20_000_00, lastFromMarketing: 10 }, 'marketing');
    expect(ok.values).toMatchObject({ cac: 2_000_00, won: 10 });
    expect(ok.level).toBe('good');
    // ₦200k for 1 customer: 45 months to pay back.
    expect(check({ lastMarketing: 200_000_00, lastFromMarketing: 1 }, 'marketing').level).toBe(
      'bad',
    );
    expect(check({ lastMarketing: 20_000_00, lastFromMarketing: 0 }, 'marketing').level).toBe(
      'warn',
    );
  });

  it('reads its base from the company', () => {
    const w = addFounder(makeWorld(3, ['lagos']));
    const b = founderPlanBase(w, mine(w));
    expect(b.basePrice).toBe(mine(w).price);
    expect(b.founders).toBe(1);
    expect(b.costShare).toBeGreaterThan(0);
    expect(b.costShare).toBeLessThan(1);
    expect(b.cash).toBe(w.accounts[mine(w).account]!.balance);
  });
});

describe('the best candidate to offer', () => {
  it('asks for interviews first, then prefers checked skill and fit', () => {
    const a = { id: 'a', skill: null, cvSkill: 0.7, fit: null, ask: 100 };
    const b = { id: 'b', skill: null, cvSkill: 0.6, fit: null, ask: 100 };
    expect(bestCandidate([a])).toBeNull();
    expect(bestCandidate([a, b])).toEqual({ id: 'a', why: 'interview' });
    expect(bestCandidate([a, { ...b, skill: 0.72 }])).toEqual({ id: 'b', why: 'checked' });
    expect(
      bestCandidate([
        { ...a, skill: 0.6, fit: 0.9 },
        { ...b, skill: 0.6, fit: 0.2 },
      ]),
    ).toEqual({ id: 'a', why: 'fit' });
  });
});

// ---------------------------------------------------------------- pitches

/** A founder with an open pitch at an AI fund that asks questions, or null for this seed. */
function openPitch(seed: number, released: boolean): { w: World; p: Pitch } | null {
  const base = makeWorld(seed, ['lagos']);
  const w = addFounder(released ? announce(base) : base);
  const c = mine(w);
  const fund = Object.values(w.funds).find(
    (f) =>
      f.market === 'lagos' &&
      f.stages.includes('pre-seed') &&
      (f.sectors === 'any' || f.sectors.includes('fintech')) &&
      f.minStars <= 0.5,
  );
  if (!fund) return null;
  const s = run(w, F, {
    type: 'pitch.start',
    companyId: c.id,
    fundId: fund.id,
    slides: ['problem', 'product', 'team'],
    ask: fund.check[0],
  });
  if (s.result.status !== 'questions') return null;
  return { w: s.world, p: s.world.pitches[s.result.pitchId]! };
}

const answerAll = (p: Pitch, tone: 'honest' | 'vague'): Command => ({
  type: 'pitch.answer',
  pitchId: p.id,
  answers: Object.fromEntries(
    p.questions.map((q) => [q.id, q.options.find((o) => o.tone === tone)?.id ?? q.options[0]!.id]),
  ),
});

const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

describe('scored pitch answers and real pass reasons (feedback note)', () => {
  it('scores each answer, names the best one, and an honest answer beats a dodge', () => {
    let tried = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, true);
      if (!o) continue;
      tried++;
      const honest = run(o.w, F, answerAll(o.p, 'honest')).world.pitches[o.p.id]!;
      const vague = run(o.w, F, answerAll(o.p, 'vague')).world.pitches[o.p.id]!;
      expect(honest.scores).toHaveLength(o.p.questions.length);
      for (const s of honest.scores!) {
        const q = o.p.questions.find((x) => x.id === s.questionId)!;
        expect(s.best).toBe(q.options.find((x) => x.tone === 'honest')!.id);
        expect(s.tone).toBe('honest');
        expect(s.score).toBeGreaterThanOrEqual(50);
        expect(s.factors[0]).toEqual({ id: 'honest', points: 50 });
      }
      for (const s of vague.scores!) {
        expect(s.tone).toBe('vague');
        expect(s.score).toBe(10);
      }
      if (tried >= 4) break;
    }
    expect(tried).toBeGreaterThan(2);
  });

  it('gives a pass reason derived from the company’s numbers, the same every time', () => {
    let passes = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, true);
      if (!o) continue;
      const a = run(o.w, F, answerAll(o.p, 'honest')).world.pitches[o.p.id]!;
      if (a.status !== 'passed' || a.reason.includes('diligence')) continue;
      passes++;
      // A new company has a customer or so and no revenue yet: that is the biggest gap.
      const customers = totalCustomers(mine(o.w));
      expect(a.passWhy).toEqual(
        customers === 0
          ? {
              id: 'traction',
              values: { customers: 0, need: FOUNDER_GUIDE.bar.customers['pre-seed'] },
            }
          : { id: 'revenue', values: { revenue: 0, need: expect.any(Number) } },
      );
      expect(a.reason).toMatch(customers === 0 ? /You have 0 paying customers/ : /Revenue is ₦0/);
      expect(OLD_REASONS.some((r) => a.reason.includes(r))).toBe(false);
      // Deterministic: the same world, the same answer.
      const b = run(o.w, F, answerAll(o.p, 'honest')).world.pitches[o.p.id]!;
      expect(b.reason).toBe(a.reason);
    }
    expect(passes).toBeGreaterThan(0);
  });

  it('names dodged answers as the reason once the company has traction', () => {
    let passes = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, true);
      if (!o) continue;
      // Customers, revenue, fit and runway at the bar: what's left is the answers.
      const w = edit(o.w, (d) => {
        const c = mine(d);
        Object.values(c.segments)[0]!.paying = 60;
        c.product.fit = 0.8;
        c.finance.history.push({
          month: 0,
          revenue: 100_000_000,
          playerRevenue: 0,
          suppliers: 0,
          payroll: 0,
          founderSalary: 0,
          office: 0,
          marketing: 0,
          cloud: 0,
          compliance: 0,
          interest: 0,
          tax: 0,
          net: 100,
          cashEnd: 0,
          customers: 60,
        });
      });
      const a = run(w, F, answerAll(o.p, 'vague')).world.pitches[o.p.id]!;
      if (a.status !== 'passed') continue;
      passes++;
      expect(a.passWhy!.id).toBe('answers');
      expect(a.passWhy!.values.vague).toBe(o.p.questions.length);
    }
    expect(passes).toBeGreaterThan(0);
  });

  it('keeps the old random reasons, and no scores, in a world without the note', () => {
    let passes = 0;
    for (const seed of seeds) {
      const o = openPitch(seed, false);
      if (!o) continue;
      const a = run(o.w, F, answerAll(o.p, 'honest')).world.pitches[o.p.id]!;
      expect(a.scores).toBeUndefined();
      if (a.status !== 'passed' || a.reason.includes('diligence')) continue;
      passes++;
      expect(a.passWhy).toBeUndefined();
      expect(OLD_REASONS.some((r) => a.reason.endsWith(`“${r}”`))).toBe(true);
    }
    expect(passes).toBeGreaterThan(0);
  });
});

describe('demo breakdown (feedback note)', () => {
  const demo = (released: boolean) => {
    const base = makeWorld(5, ['lagos']);
    let w = addFounder(released ? announce(base) : base);
    const r = run(w, F, { type: 'sales.prospect' });
    w = r.world;
    const id = r.result.leads[0].id as string;
    w = run(w, F, { type: 'sales.advance', dealId: id, action: 'contact' } as never).world;
    w = run(w, F, { type: 'sales.advance', dealId: id, action: 'demo' } as never).world;
    return mine(w).deals!.find((d) => d.id === id)!;
  };

  it('keeps what the demo score was made of, and it adds up', () => {
    const d = demo(true);
    const p = d.demoParts!;
    expect(p.discovery).toBe(false);
    const sum = 0.45 * p.fit + 0.35 * p.quality + 0.2 * p.reliability + p.luck;
    expect(Math.abs(sum - d.demoScore!)).toBeLessThan(0.02);
  });

  it('scores the demo exactly as before, and keeps no parts, without the note', () => {
    const off = demo(false);
    expect(off.demoParts).toBeUndefined();
    expect(off.demoScore).toBe(demo(true).demoScore);
  });
});

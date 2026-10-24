import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  GUIDE,
  chequeGuide,
  firstCallBest,
  investChecks,
  niceDown,
  screenBest,
  stageOf,
} from '../src/investorguide.js';
import { FEEDBACK_NOTE } from '../src/releases.js';
import { playerView } from '../src/views.js';
import type { Company, World } from '../src/types.js';
import { addFounder, addInvestor, careerWorld, makeWorld, run } from './helpers.js';

const I = 'u_investor';

const announce = (w: World) =>
  run(w, null, { type: 'system.announce', id: FEEDBACK_NOTE, text: 'Game feedback round.' }).world;

/** An investor past the first session in Lagos; `feedback`: the feedback round is logged. */
function world(feedback: boolean, seed = 91): World {
  let w = addInvestor(careerWorld(seed));
  if (feedback) w = announce(w);
  return run(w, I, { type: 'investor.tutorial', action: 'skip' }).world;
}

const aiCompany = (w: World) =>
  Object.values(w.companies)
    .filter((c) => c.ai && c.market === 'lagos' && c.status === 'active' && !c.ipo)
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;

const guide = (w: World) => playerView(w, I)!.investorGuide!;

const hold = (w: World, c: Company, invested: number) =>
  produce(w, (d) => {
    d.positions[`${I}:${c.id}`] = {
      investorId: I,
      companyId: c.id,
      invested,
      returned: 0,
      month: 0,
      writtenOff: false,
    };
  });

describe('investor guide: stages', () => {
  it('starts at angel with a checklist and a next step, aligned with the ladder', () => {
    const w = world(true);
    const g = guide(w);
    expect(g.stage).toBe('angel');
    expect(g.stages.map((s) => s.status)).toEqual([
      'now',
      'later',
      'later',
      'later',
      'later',
      'later',
    ]);
    expect(g.items.map((x) => x.id)).toEqual(['meet', 'first-call', 'first-cheque']);
    expect(g.next?.id).toBe('meet');
    expect(g.mentor?.name).toBeTruthy();
  });

  it('moves to syndicate lead after the first cheque, then with each rung reached', () => {
    let w = world(true);
    const c = aiCompany(w);
    w = hold(w, c, 1_000_00);
    expect(stageOf(w, w.players[I]!)).toBe('syndicate');
    const items = guide(w).items;
    expect(items.map((x) => x.id)).toEqual(['deals', 'diligence', 'stars', 'spread']);
    // No first call on the company you backed: diligence isn't done.
    expect(items.find((x) => x.id === 'diligence')!.done).toBe(false);
    const reached = (n: number) =>
      produce(w, (d) => {
        for (let k = 2; k <= n; k++) d.players[I]!.career!.reached[k] = 1;
      });
    expect(stageOf(reached(2), reached(2).players[I]!)).toBe('first-exit');
    expect(stageOf(reached(3), reached(3).players[I]!)).toBe('fund-1');
    expect(stageOf(reached(4), reached(4).players[I]!)).toBe('fund-2');
    expect(stageOf(reached(5), reached(5).players[I]!)).toBe('family-office');
  });

  it('is null for founders and before the investor career', () => {
    const w = addFounder(world(true));
    expect(playerView(w, 'u_founder')!.investorGuide).toBeNull();
    expect(playerView(addInvestor(makeWorld(5)), I)!.investorGuide).toBeNull();
  });
});

describe('investor guide: live checks', () => {
  const base = {
    amount: 50_000_00,
    liquid: 166_000_00,
    industry: 'fintech',
    holdings: { fintech: 1, saas: 1 } as Record<string, number>,
    diligence: 1,
    model: 0,
    valuation: 0,
  };
  const level = (id: string, i = base) => investChecks(i).find((c) => c.id === id)?.level;

  it('flags a cheque over a tenth of your money and suggests a round one under it', () => {
    const size = investChecks(base).find((c) => c.id === 'size')!;
    expect(size.level).toBe('bad');
    expect(size.values.share).toBeCloseTo(0.301, 3);
    expect(size.values.suggested).toBe(15_000_00);
    expect(chequeGuide(166_000_00)).toBe(15_000_00);
    expect(niceDown(16_600)).toBe(15_000);
    expect(level('size', { ...base, amount: 15_000_00 })).toBe('good');
    expect(level('size', { ...base, amount: 30_000_00 })).toBe('warn');
  });

  it('checks sector concentration, follow-on reserves, diligence and price', () => {
    // Two of three companies in fintech: a warning.
    expect(level('spread')).toBe('warn');
    expect(level('spread', { ...base, holdings: { fintech: 2, saas: 1 } })).toBe('bad');
    expect(level('spread', { ...base, industry: 'health' })).toBe('good');
    expect(level('spread', { ...base, holdings: {} })).toBe('good');
    // 50k into a third company leaves 116k against 75k of follow-ons: fine; 120k doesn't.
    expect(level('reserves')).toBe('good');
    expect(level('reserves', { ...base, amount: 120_000_00 })).toBe('bad');
    expect(level('diligence', { ...base, diligence: 0 })).toBe('bad');
    expect(level('price')).toBeUndefined();
    const priced = { ...base, model: 1_000_000_00 };
    expect(level('price', { ...priced, valuation: 1_000_000_00 })).toBe('good');
    expect(level('price', { ...priced, valuation: 1_400_000_00 })).toBe('warn');
    expect(level('price', { ...priced, valuation: 2_000_000_00 })).toBe('bad');
    // Not comparable (a fund's money, another currency): no size or reserves check.
    expect(investChecks({ ...base, liquid: 0 }).map((c) => c.id)).toEqual(['diligence', 'spread']);
  });
});

describe('investor guide: scored decisions', () => {
  it('scores a first call against the company’s biggest risk, the same way every time', () => {
    const play = () => {
      let w = world(true);
      const c = aiCompany(w);
      const best = firstCallBest(w, c).best;
      const skill0 = w.players[I]!.skills.investing;
      const r = run(w, I, { type: 'invest.diligence', companyId: c.id, depth: 1, ask: best });
      w = r.world;
      return { r: r.result, best, c, w, gained: w.players[I]!.skills.investing - skill0 };
    };
    const a = play();
    const b = play();
    expect(a.r.call).toEqual(b.r.call);
    expect(a.r.call.step).toBe('first-call');
    expect(a.r.call.best).toBe(a.best);
    expect(a.r.call.score).toBe(1);
    // The right question teaches more than the first call alone.
    expect(a.gained).toBeCloseTo(1 + GUIDE.askSkill, 5);
    // Taking the call was screened too, and both show in the guide.
    expect(a.r.screen.step).toBe('screen');
    expect(
      guide(a.w)
        .decisions.map((d) => d.step)
        .sort(),
    ).toEqual(['first-call', 'screen']);
    expect(a.w.players[I]!.pipeline![a.c.id]!.calls).toHaveLength(2);
  });

  it('a question off the company’s risks scores nothing and teaches nothing extra', () => {
    let w = world(true, 92);
    const c = aiCompany(w);
    const f = firstCallBest(w, c);
    const wrong = (['growth', 'burn', 'customers', 'team'] as const).find(
      (x) => !f.weak.includes(x) && x !== f.best,
    );
    expect(wrong).toBeDefined();
    const skill0 = w.players[I]!.skills.investing;
    const r = run(w, I, { type: 'invest.diligence', companyId: c.id, depth: 1, ask: wrong! });
    w = r.world;
    expect(r.result.call.score).toBe(0);
    expect(w.players[I]!.skills.investing - skill0).toBeCloseTo(1, 5);
  });

  it('asks about money first when the company is running out of it', () => {
    let w = world(true);
    const c = aiCompany(w);
    w = produce(w, (d) => {
      const co = d.companies[c.id]!;
      d.accounts[d.markets.lagos!.ext.genesis]!.balance += d.accounts[co.account]!.balance;
      d.accounts[co.account]!.balance = 0;
    });
    expect(firstCallBest(w, w.companies[c.id]!).best).toBe('burn');
  });

  it('scores a pass by its reason, and the price and the cheque on a term sheet', () => {
    let w = world(true);
    const c = aiCompany(w);
    const best = screenBest(w, w.players[I]!, c).best;
    const r = run(w, I, { type: 'pipeline.pass', companyId: c.id, reason: 'timing' });
    expect(r.result.stage).toBe('passed');
    expect(r.result.screen.best).toBe(best);
    expect(r.result.screen.score).toBe(best === 'call' ? 0 : 0.5);

    w = world(true, 93);
    const d = aiCompany(w);
    w = run(w, I, { type: 'invest.diligence', companyId: d.id, depth: 1 }).world;
    const model = playerView(w, I)!.directory.find((x) => x.id === d.id)!.diligence!.modelValuation;
    const liquid = guide(w).money.liquid;
    const p = run(w, I, {
      type: 'invest.propose',
      companyId: d.id,
      instrument: 'safe',
      amount: Math.round(liquid * 0.3),
      valuation: model * 3,
      proRata: true,
      boardSeat: false,
      vetoOnSale: false,
    }).result;
    const byStep = Object.fromEntries(p.calls.map((x: { step: string }) => [x.step, x]));
    expect(byStep.valuation).toMatchObject({ choice: 'high', best: 'fair', score: 0 });
    expect(byStep.cheque).toMatchObject({ choice: 'too-big', best: 'small', score: 0 });
    expect(byStep.cheque.values.suggested).toBe(chequeGuide(liquid));
  });
});

describe('investor guide: the feedback-round switch', () => {
  it('without the feedback note, a first call, a pass and a term sheet play exactly as before', () => {
    let w = world(false);
    const c = aiCompany(w);
    const skill0 = w.players[I]!.skills.investing;
    const r = run(w, I, { type: 'invest.diligence', companyId: c.id, depth: 1, ask: 'growth' });
    w = r.world;
    expect(r.result).toEqual({ message: 'First call done: revenue, customers and burn unlocked.' });
    expect(w.players[I]!.skills.investing - skill0).toBeCloseTo(1, 5);
    expect(w.players[I]!.pipeline?.[c.id]).toBeUndefined();
    const p = run(w, I, { type: 'pipeline.pass', companyId: c.id, reason: 'traction' });
    expect(p.result).toEqual({ stage: 'passed' });
    expect(p.world.players[I]!.pipeline![c.id]!.calls).toBeUndefined();
    // The guide (a view) still shows the stages, but nothing is scored.
    expect(guide(p.world).scoring).toBe(false);
    expect(guide(p.world).decisions).toEqual([]);
  });
});

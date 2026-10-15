import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { STARTER_IDEAS, founderFit, ideaById, ideaEdge } from '../src/data/ideas.js';
import { backgroundById } from '../src/data/characters.js';
import { winChance } from '../src/sales.js';
import { journeyView } from '../src/journey.js';
import { playerView } from '../src/views.js';
import type { Command } from '../src/commands.js';
import type { World } from '../src/types.js';
import {
  companyOf,
  makeWorld,
  moneyByCurrency,
  negativeInternalAccounts,
  run,
  tryRun,
} from './helpers.js';

const F = 'u_new';

const quick = (w: World, backgroundId?: string): World =>
  run(w, F, {
    type: 'player.quickStart',
    username: 'new_founder',
    role: 'founder',
    name: 'Ada',
    gender: 'female',
    market: 'lagos',
    ...(backgroundId ? { backgroundId } : {}),
  }).world;

const found = (w: World, ideaId?: string): World =>
  run(w, F, {
    type: 'company.found',
    company: {
      name: 'Cafe Idea Co',
      industry: 'fintech',
      revenueModel: 'subscription',
      idea: 'Something from the café',
      incorporation: 'local',
      ...(ideaId ? { ideaId } : {}),
    },
  }).world;

describe('first session: founder background at quick start', () => {
  it('uses the chosen background (skills, savings) and defaults without one', () => {
    const w = quick(makeWorld(), 'f-consultant');
    const p = w.players[F]!;
    expect(p.backgroundId).toBe('f-consultant');
    expect(p.skills.sales).toBe(backgroundById('f-consultant')!.skills.sales);
    expect(quick(makeWorld()).players[F]!.backgroundId).toBe('f-engineer');
    // A dropout starts with fewer savings than an ex-banker.
    const bal = (bg: string) => {
      const x = quick(makeWorld(), bg);
      return x.accounts[x.players[F]!.accounts.local]!.balance;
    };
    expect(bal('f-banker')).toBeGreaterThanOrEqual(bal('f-dropout'));
  });

  it('refuses a background from another role', () => {
    const r = tryRun(makeWorld(), F, {
      type: 'player.quickStart',
      username: 'new_founder',
      role: 'founder',
      backgroundId: 'i-exited',
    });
    expect(r.ok).toBe(false);
  });
});

describe('first session: choosing an idea', () => {
  it('stores the idea, its industry and model, and the founder fit', () => {
    const idea = ideaById('shop-stock')!;
    const w = found(quick(makeWorld(), 'f-engineer'), idea.id);
    const c = companyOf(w, F);
    expect(c.industry).toBe(idea.industry);
    expect(c.revenueModel).toBe(idea.revenueModel);
    expect(c.starterIdea).toEqual({
      id: idea.id,
      fit: founderFit(idea, w.players[F]!.skills),
    });
    const view = playerView(w, F);
    const mine = view!.companies.find((x) => x.id === c.id)! as unknown as {
      starterIdea: { id: string; edge: number } | null;
    };
    expect(mine.starterIdea?.id).toBe(idea.id);
  });

  it('refuses an unknown idea and leaves old-style founding unchanged', () => {
    const w0 = quick(makeWorld());
    const bad = tryRun(w0, F, {
      type: 'company.found',
      company: {
        name: 'Cafe Idea Co',
        industry: 'fintech',
        revenueModel: 'subscription',
        idea: 'Something from the café',
        incorporation: 'local',
        ideaId: 'nope',
      },
    });
    expect(bad.ok).toBe(false);
    const c = companyOf(found(w0), F);
    expect(c.starterIdea).toBeUndefined();
    expect(c.industry).toBe('fintech');
  });

  it('fit follows the background: a consultant suits tutoring more than an engineer', () => {
    const idea = ideaById('tutor-match')!;
    const consultant = { ...defaults(), ...backgroundById('f-consultant')!.skills };
    const engineer = { ...defaults(), ...backgroundById('f-engineer')!.skills };
    expect(founderFit(idea, consultant)).toBeGreaterThan(founderFit(idea, engineer));
  });

  it('every idea has distinct attributes in range', () => {
    const keys = new Set(STARTER_IDEAS.map((i) => JSON.stringify(i.attributes)));
    expect(keys.size).toBe(STARTER_IDEAS.length);
    for (const i of STARTER_IDEAS) {
      for (const v of Object.values(i.attributes)) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(i.attributes)) expect(v).toBeLessThanOrEqual(1);
      expect(i.pitch.length).toBeGreaterThanOrEqual(5);
      expect(i.pitch.length).toBeLessThanOrEqual(120);
    }
  });
});

const defaults = () =>
  Object.fromEntries(
    [
      'product',
      'sales',
      'fundraising',
      'finance',
      'hiring',
      'leadership',
      'negotiation',
      'publicSpeaking',
      'investing',
      'risk',
    ].map((s) => [s, 20]),
  );

describe('first session: the idea changes the sales win chance (only for idea companies)', () => {
  it('shifts winChance by the idea edge; companies without an idea are unchanged', () => {
    const idea = ideaById('shop-stock')!;
    let w = found(quick(makeWorld(), 'f-engineer'), idea.id);
    w = run(w, F, { type: 'sales.prospect' }).world;
    const c = companyOf(w, F);
    const d = c.deals![0]!;
    const withIdea = winChance(w, c, d);
    // The same world, minus the idea: the old calculation.
    const plain = produce(w, (x) => {
      delete companyOf(x, F).starterIdea;
    });
    const without = winChance(plain, companyOf(plain, F), companyOf(plain, F).deals![0]!);
    const edge = ideaEdge(idea, c.starterIdea!.fit);
    expect(edge).not.toBe(0);
    expect(withIdea).toBeCloseTo(Math.min(0.95, Math.max(0.05, without + edge)), 6);
  });
});

describe('first session: first payment and a small expense', () => {
  /** Found with an idea, then walk one deal to a win (tuned so it signs). */
  function wonDeal(ideaId?: string) {
    let w = found(quick(makeWorld(), 'f-consultant'), ideaId);
    w = run(w, F, { type: 'sales.prospect' }).world;
    const id = companyOf(w, F).deals![0]!.id;
    const adv = (action: string, extra: Record<string, number> = {}) => {
      w = run(w, F, { type: 'sales.advance', dealId: id, action, ...extra } as Command).world;
    };
    adv('contact');
    adv('discover');
    adv('demo');
    w = produce(w, (x) => {
      const d = companyOf(x, F).deals!.find((y) => y.id === id)!;
      d.customer.trust = 1;
      d.customer.authority = 1;
      d.customer.urgency = 1;
      d.customer.current = 'nothing';
      d.demoScore = 1;
    });
    adv('propose', { price: 1 });
    const before = moneyByCurrency(w);
    const cash = w.accounts[companyOf(w, F).account]!.balance;
    // A few tries: a deal can still be lost; recover once.
    let r = run(w, F, { type: 'sales.advance', dealId: id, action: 'close' } as Command);
    w = r.world;
    if (!r.result.won) {
      adv('recover');
      adv('close');
      r = { world: w, result: { won: companyOf(w, F).deals!.find((d) => d.id === id)!.stage } };
    }
    return { w, before, cash, id };
  }

  it('pays the first month up front into the business account, once', () => {
    const { w, before, cash } = wonDeal('tutor-match');
    const c = companyOf(w, F);
    expect(c.salesAccounts?.length).toBe(1);
    const monthly = c.salesAccounts![0]!.monthly;
    expect(c.starterIdea!.paid).toEqual({ month: w.markets.lagos!.month, amount: monthly });
    expect(w.accounts[c.account]!.balance).toBe(cash + monthly);
    expect(c.ledgerThisMonth.upfrontRevenue).toBe(monthly);
    expect(w.accounts[c.account]!.recent[0]!.memo).toMatch(/^First payment: /);
    expect(moneyByCurrency(w)).toEqual(before);
    expect(negativeInternalAccounts(w)).toEqual([]);
    // Journey: chapter 1's first-customer step follows the pipeline sale.
    const step = journeyView(w, w.players[F]!)!.chapters[0]!.steps.find(
      (s) => s.id === 'hustle.first-customer',
    )!;
    expect(step.done).toBe(true);
  });

  it('pays nothing up front for a company founded without an idea', () => {
    const { w, cash } = wonDeal();
    const c = companyOf(w, F);
    expect(c.salesAccounts?.length).toBe(1);
    expect(w.accounts[c.account]!.balance).toBe(cash);
    expect(c.ledgerThisMonth.upfrontRevenue).toBeUndefined();
  });

  it('a small expense comes out of the company account, not the founder’s', () => {
    const w0 = found(quick(makeWorld()), 'shop-stock');
    const c0 = companyOf(w0, F);
    const personal = w0.accounts[w0.players[F]!.accounts.local]!.balance;
    const business = w0.accounts[c0.account]!.balance;
    const { world: w, result } = run(w0, F, {
      type: 'company.expense',
      companyId: c0.id,
      item: 'cards',
    });
    expect(result.amount).toBeGreaterThan(0);
    expect(w.accounts[c0.account]!.balance).toBe(business - result.amount);
    expect(w.accounts[w.players[F]!.accounts.local]!.balance).toBe(personal);
    expect(companyOf(w, F).expenses).toEqual([
      { item: 'cards', month: w.markets.lagos!.month, amount: result.amount },
    ]);
    expect(moneyByCurrency(w)).toEqual(moneyByCurrency(w0));
    // Someone else's company: refused.
    expect(
      tryRun(w, 'u_other', { type: 'company.expense', companyId: c0.id, item: 'cards' }).ok,
    ).toBe(false);
  });

  it('a guided company’s journey waits for the pipeline sale, not the welcome customer', () => {
    const w = found(quick(makeWorld()), 'shop-stock');
    const ch1 = journeyView(w, w.players[F]!)!.chapters[0]!;
    expect(ch1.steps.find((s) => s.id === 'hustle.company')!.done).toBe(true);
    expect(ch1.steps.find((s) => s.id === 'hustle.first-customer')!.done).toBe(false);
    // The old way: the welcome customer counts at once.
    const old = found(quick(makeWorld()));
    const ch1old = journeyView(old, old.players[F]!)!.chapters[0]!;
    expect(ch1old.steps.find((s) => s.id === 'hustle.first-customer')!.done).toBe(true);
  });
});

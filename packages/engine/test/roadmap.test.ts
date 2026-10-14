import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { settleProduct } from '../src/company.js';
import { FEATURES, featureById, featuresFor } from '../src/data/roadmap.js';
import { INDUSTRIES } from '../src/data/industries.js';
import { FIRST_RELEASE, ROADMAP, roadmapView } from '../src/roadmap.js';
import { outputOf } from '../src/staff.js';
import { clamp01 } from '../src/math.js';
import type { Company, World } from '../src/types.js';
import {
  addFounder,
  companyOf,
  makeWorld,
  moneyByCurrency,
  run,
  settle,
  tryRun,
} from './helpers.js';

const F = 'u_founder';
const edit = (w: World, f: (d: World) => void) => produce(w, f);
const cid = (w: World) => companyOf(w, F).id;
const add = (w: World, featureId: string) =>
  run(w, F, { type: 'roadmap.add', companyId: cid(w), featureId });
const build = (w: World, hours = 160) =>
  run(w, F, { type: 'company.build', companyId: cid(w), hours }).world;
const project = (w: World, featureId: string) =>
  companyOf(w, F).roadmap!.projects.find((p) => p.featureId === featureId)!;
/** A founder whose company has money in the bank (from the outside world, so books balance). */
const funded = () =>
  edit(addFounder(makeWorld()), (d) => {
    const c = companyOf(d, F);
    const amount = 500_000_000_00;
    d.accounts[d.markets.lagos!.ext.genesis]!.balance -= amount;
    d.accounts[c.account]!.balance += amount;
  });
/** Mark a project's work done (a mid-game state). */
const finish = (w: World, featureId: string) =>
  edit(w, (d) => {
    const p = companyOf(d, F).roadmap!.projects.find((x) => x.featureId === featureId)!;
    p.progress = featureById(featureId)!.effortWeeks;
    p.status = 'in_progress';
  });

/** The product step as it was before the roadmap existed (the replay reference). */
function legacyProduct(c: Company, skill: number) {
  const MODE = {
    fast: { fit: 1.35, quality: 0.5, debt: 1.6 },
    balanced: { fit: 1, quality: 1, debt: 0.6 },
    quality: { fit: 0.7, quality: 1.5, debt: -0.4 },
  }[c.product.buildMode];
  const output =
    outputOf(c, ['engineer']) +
    outputOf(c, ['product']) * 0.6 +
    (c.buildHours / 160) * (skill / 60);
  const discovery =
    c.targetSegments.reduce((a, k) => a + (c.product.discovery[k] ?? 0), 0) /
    Math.max(1, c.targetSegments.length);
  const p = { ...c.product };
  p.fit = clamp01(p.fit + output * 0.025 * (1 - p.fit) * (0.3 + 0.7 * discovery) * MODE.fit);
  p.quality = clamp01(
    p.quality + output * 0.02 * (1 - p.quality) * MODE.quality - p.techDebt * 0.025,
  );
  p.techDebt = clamp01(p.techDebt + output * 0.012 * MODE.debt + (output === 0 ? 0.005 : 0));
  return p;
}

describe('roadmap catalogue', () => {
  it('offers 8–13 features per industry, with dependencies in the same catalogue', () => {
    for (const ind of INDUSTRIES) {
      const list = featuresFor(ind);
      expect(list.length).toBeGreaterThanOrEqual(8);
      expect(list.length).toBeLessThanOrEqual(13);
      for (const f of list) if (f.requires) expect(list.map((x) => x.id)).toContain(f.requires);
    }
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });
});

describe('roadmap: no roadmap, no change', () => {
  it('product work without a roadmap matches the old formula exactly', () => {
    let w = build(funded());
    w = edit(w, (d) => {
      const c = companyOf(d, F);
      const f = d.players[F]!;
      const expected = legacyProduct(c, f.skills.product);
      settleProduct(c, f, { world: d, month: 1 });
      expect(c.product).toEqual(expected);
      expect(c.roadmap).toBeUndefined();
    });
  });

  it('a roadmap with nothing to build leaves product work as before', () => {
    let w = funded();
    w = add(w, 'onboarding').world;
    w = finish(w, 'onboarding');
    w = run(w, F, { type: 'roadmap.release', companyId: cid(w), projectId: 'rp1' }).world;
    w = build(w);
    edit(w, (d) => {
      const c = companyOf(d, F);
      const f = d.players[F]!;
      const expected = legacyProduct(c, f.skills.product);
      settleProduct(c, f, { world: d, month: 1 });
      expect(c.product).toEqual(expected);
    });
  });

  it('settling a world nobody touched the roadmap in creates no roadmap state', () => {
    const w = settle(build(funded()), 'lagos', 3);
    expect(Object.values(w.companies).every((c) => c.roadmap === undefined)).toBe(true);
  });
});

describe('roadmap projects', () => {
  it('adding a feature pays its cost through the ledger and queues it', () => {
    const w0 = funded();
    const total = moneyByCurrency(w0);
    const cash0 = w0.accounts[companyOf(w0, F).account]!.balance;
    const { world: w, result } = add(w0, 'onboarding');
    expect(result.cost).toBeGreaterThan(0);
    expect(w.accounts[companyOf(w, F).account]!.balance).toBe(cash0 - result.cost);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(project(w, 'onboarding')).toMatchObject({ id: 'rp1', status: 'planned', progress: 0 });
    expect(w.nextId).toBe(w0.nextId);
    expect(
      tryRun(w, F, { type: 'roadmap.add', companyId: cid(w), featureId: 'onboarding' }).ok,
    ).toBe(false);
    // A feature from another industry is refused.
    expect(
      tryRun(w, F, { type: 'roadmap.add', companyId: cid(w), featureId: 'telehealth' }).ok,
    ).toBe(false);
  });

  it('progresses at month end from founder build hours, sharing that capacity', () => {
    const base = build(funded());
    const without = settle(base, 'lagos', 1);
    let w = add(base, 'onboarding').world;
    w = settle(w, 'lagos', 1);
    const p = project(w, 'onboarding');
    expect(p.status).toBe('in_progress');
    expect(p.progress).toBeGreaterThan(0);
    expect(p.progress).toBeLessThan(featureById('onboarding')!.effortWeeks);
    // The roadmap took most of the month's work, so general polishing grew less.
    const fitGain = (x: World) => companyOf(x, F).product.fit - companyOf(base, F).product.fit;
    expect(fitGain(w)).toBeLessThan(fitGain(without));
    const v = roadmapView(w, companyOf(w, F));
    expect(v.projects[0]!.pct).toBeGreaterThan(0);
  });

  it('waits for its dependency, and the top of the queue gets the work', () => {
    let w = build(funded());
    w = add(w, 'mobile-app').world; // needs Onboarding flow
    w = settle(w, 'lagos', 1);
    expect(project(w, 'mobile-app')).toMatchObject({ status: 'planned', progress: 0 });
    const v = roadmapView(w, companyOf(w, F));
    expect(v.projects[0]!.blockedBy).toBe('Onboarding flow');
    expect(tryRun(w, F, { type: 'roadmap.contract', companyId: cid(w), projectId: 'rp1' }).ok).toBe(
      false,
    );
    w = add(w, 'onboarding').world;
    w = add(w, 'analytics').world;
    w = run(w, F, {
      type: 'roadmap.prioritise',
      companyId: cid(w),
      projectId: 'rp3',
      dir: 'top',
    }).world;
    expect(companyOf(w, F).roadmap!.projects.map((p) => p.featureId)).toEqual([
      'analytics',
      'mobile-app',
      'onboarding',
    ]);
    w = settle(build(w), 'lagos', 1);
    expect(project(w, 'analytics').progress).toBeGreaterThan(0);
    // Mobile app is still blocked; onboarding only gets what analytics left over.
    expect(project(w, 'mobile-app').progress).toBe(0);
    w = run(w, F, { type: 'roadmap.remove', companyId: cid(w), projectId: 'rp1' }).world;
    expect(companyOf(w, F).roadmap!.projects.some((p) => p.featureId === 'mobile-app')).toBe(false);
  });

  it('release applies its effect, records the first-release milestone without a world id', () => {
    let w = add(funded(), 'savings-goals').world;
    expect(tryRun(w, F, { type: 'roadmap.release', companyId: cid(w), projectId: 'rp1' }).ok).toBe(
      false,
    );
    w = finish(w, 'savings-goals');
    const before = companyOf(w, F).product;
    const { world: after, result } = run(w, F, {
      type: 'roadmap.release',
      companyId: cid(w),
      projectId: 'rp1',
    });
    expect(companyOf(after, F).product.fit).toBeGreaterThan(before.fit);
    expect(project(after, 'savings-goals')).toMatchObject({ status: 'released' });
    expect(result.change.fit).toBeGreaterThan(0);
    expect(after.players[F]!.milestones[FIRST_RELEASE]).toBeDefined();
    expect(after.inbox[F]!.some((i) => i.id === 'in_first_release')).toBe(true);
    expect(after.nextId).toBe(w.nextId);
  });

  it('fast mode ships more tech debt and bugs than quality mode', () => {
    const shipIn = (mode: 'fast' | 'quality') => {
      let w = funded();
      w = run(w, F, { type: 'company.strategy', companyId: cid(w), buildMode: mode }).world;
      w = finish(add(w, 'mobile-app').world, 'mobile-app');
      // Pretend the dependency shipped.
      w = edit(w, (d) => {
        companyOf(d, F).roadmap!.projects.push({
          id: 'rp9',
          featureId: 'onboarding',
          status: 'released',
          progress: 4,
          addedMonth: 0,
        });
      });
      const before = companyOf(w, F).product.techDebt;
      w = run(w, F, { type: 'roadmap.release', companyId: cid(w), projectId: 'rp1' }).world;
      return { debt: companyOf(w, F).product.techDebt - before, bugs: project(w, 'mobile-app') };
    };
    const fast = shipIn('fast');
    const quality = shipIn('quality');
    expect(fast.debt).toBeGreaterThan(quality.debt);
    expect(fast.bugs.defects!).toBeGreaterThanOrEqual(quality.bugs.defects!);
    expect(fast.bugs.debtAdded!).toBeGreaterThan(quality.bugs.debtAdded! * 5);
  });

  it('contractors are paid through the ledger and finish the work by month end', () => {
    let w = add(funded(), 'analytics').world;
    const total = moneyByCurrency(w);
    const c0 = companyOf(w, F);
    const cash0 = w.accounts[c0.account]!.balance;
    const fee = roadmapView(w, c0).projects[0]!.contractFee;
    expect(fee).toBeGreaterThan(0);
    const r = run(w, F, { type: 'roadmap.contract', companyId: cid(w), projectId: 'rp1' });
    w = r.world;
    expect(r.result.fee).toBe(fee);
    expect(w.accounts[c0.account]!.balance).toBe(cash0 - fee);
    expect(moneyByCurrency(w)).toEqual(total);
    expect(tryRun(w, F, { type: 'roadmap.contract', companyId: cid(w), projectId: 'rp1' }).ok).toBe(
      false,
    );
    w = settle(w, 'lagos', 1);
    expect(roadmapView(w, companyOf(w, F)).projects[0]!.ready).toBe(true);
    w = run(w, F, { type: 'roadmap.release', companyId: cid(w), projectId: 'rp1' }).world;
    expect(project(w, 'analytics').contracted).toBe(true);
    expect(project(w, 'analytics').debtAdded!).toBeGreaterThanOrEqual(ROADMAP.contractorDebt);
  });

  it('customer feedback suggests features (deterministically) and one tap adds them', () => {
    let w = add(funded(), 'onboarding').world;
    w = settle(w, 'lagos', 6);
    const again = settle(add(funded(), 'onboarding').world, 'lagos', 6);
    const fb = companyOf(w, F).roadmap!.feedback;
    expect(fb).toEqual(companyOf(again, F).roadmap!.feedback);
    const idea = fb.find((x) => x.kind === 'idea');
    expect(idea).toBeDefined();
    expect(fb.length).toBeLessThanOrEqual(ROADMAP.maxFeedback);
    w = add(w, idea!.featureId).world;
    expect(companyOf(w, F).roadmap!.feedback.some((x) => x.featureId === idea!.featureId)).toBe(
      false,
    );
  });

  it('shipped bugs raise a support incident; a bug bash fixes them', () => {
    let w = add(funded(), 'onboarding').world;
    w = edit(w, (d) => {
      companyOf(d, F).roadmap!.defects = 3;
    });
    w = settle(w, 'lagos', 1);
    const incident = companyOf(w, F).roadmap!.feedback.find((x) => x.kind === 'incident');
    expect(incident).toMatchObject({ featureId: 'bug-bash', count: 3 });
    w = finish(add(w, 'bug-bash').world, 'bug-bash');
    const id = project(w, 'bug-bash').id;
    const q = companyOf(w, F).product.quality;
    w = run(w, F, { type: 'roadmap.release', companyId: cid(w), projectId: id }).world;
    expect(companyOf(w, F).roadmap!.defects).toBe(0);
    expect(companyOf(w, F).product.quality).toBeGreaterThan(q);
    expect(companyOf(w, F).roadmap!.feedback.some((x) => x.kind === 'incident')).toBe(false);
  });
});

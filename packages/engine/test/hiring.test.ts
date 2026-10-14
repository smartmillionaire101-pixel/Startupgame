import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { fullyDiluted, ownership } from '../src/captable.js';
import { HIRING, aiCofounderOffers, coverageGaps, trialFee, workloadOf } from '../src/hiring.js';
import { journeyView } from '../src/journey.js';
import { companyDetail } from '../src/views.js';
import type { PipelineCandidate, World } from '../src/types.js';
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
const funded = () =>
  edit(addFounder(makeWorld()), (d) => {
    const c = companyOf(d, F);
    const amount = 500_000_000_00;
    d.accounts[d.markets.lagos!.ext.genesis]!.balance -= amount;
    d.accounts[c.account]!.balance += amount;
  });
const cash = (w: World) => w.accounts[companyOf(w, F).account]!.balance;
const open = (w: World) =>
  run(w, F, { type: 'hire.open', companyId: cid(w), role: 'engineer', seniority: 'mid' });
const sourced = (w: World): { world: World; cands: PipelineCandidate[] } => {
  const a = open(w);
  const b = run(a.world, F, { type: 'hire.source', companyId: cid(w), roleId: a.result.roleId });
  return { world: b.world, cands: companyOf(b.world, F).hiring!.candidates };
};

describe('hiring pipeline', () => {
  it('a job post costs a small fee through the ledger, and money is conserved', () => {
    const w = funded();
    const before = moneyByCurrency(w);
    const r = open(w);
    expect(r.result.cost).toBeGreaterThan(0);
    expect(cash(w) - cash(r.world)).toBe(r.result.cost);
    expect(moneyByCurrency(r.world)).toEqual(before);
  });

  it('sources 2–4 tailored candidates with a CV, hidden skill and fit, deterministically', () => {
    const { world, cands } = sourced(funded());
    expect(cands.length).toBeGreaterThanOrEqual(2);
    expect(cands.length).toBeLessThanOrEqual(4);
    for (const c of cands) {
      expect(c.role).toBe('engineer');
      expect(c.seniority).toBe('mid');
    }
    expect(sourced(funded()).cands).toEqual(cands);
    const view = companyDetail(world, companyOf(world, F)).hiring;
    expect(view.candidates).toHaveLength(cands.length);
    for (const v of view.candidates) {
      expect(v.skill).toBeNull();
      expect(v.fit).toBeNull();
      expect(v.cvSkill).toBeGreaterThanOrEqual(0);
    }
  });

  it('interviews reveal true skill (technical) and fit (culture) and cost founder hours', () => {
    const { world, cands } = sourced(funded());
    const id = cands[0]!.id;
    const hours = world.players[F]!.hours.used;
    const t = run(world, F, {
      type: 'hire.interview',
      companyId: cid(world),
      candidateId: id,
      style: 'technical',
    });
    expect(t.world.players[F]!.hours.used - hours).toBe(HIRING.interviewHours.technical);
    let v = companyDetail(t.world, companyOf(t.world, F)).hiring.candidates.find(
      (x) => x.id === id,
    )!;
    expect(v.skill).toBe(cands[0]!.skill);
    expect(v.fit).toBeNull();
    const c = run(t.world, F, {
      type: 'hire.interview',
      companyId: cid(world),
      candidateId: id,
      style: 'culture',
    });
    v = companyDetail(c.world, companyOf(c.world, F)).hiring.candidates.find((x) => x.id === id)!;
    expect(v.fit).toBe(cands[0]!.fit);
    expect(v.personality).toBe(cands[0]!.personality);
    // The same interview twice is refused.
    const again = tryRun(c.world, F, {
      type: 'hire.interview',
      companyId: cid(world),
      candidateId: id,
      style: 'culture',
    });
    expect(again.ok).toBe(false);
  });

  it('a work trial pays the candidate through the ledger; money is conserved', () => {
    const { world, cands } = sourced(funded());
    const before = moneyByCurrency(world);
    const r = run(world, F, {
      type: 'hire.interview',
      companyId: cid(world),
      candidateId: cands[1]!.id,
      style: 'work_trial',
    });
    expect(r.result.fee).toBe(trialFee(cands[1]!));
    expect(r.result.fee).toBeGreaterThan(0);
    expect(cash(world) - cash(r.world)).toBe(r.result.fee);
    expect(moneyByCurrency(r.world)).toEqual(before);
    expect(r.result.skill).toBe(cands[1]!.skill);
    expect(r.result.fit).toBe(cands[1]!.fit);
  });

  it('company.offer hires a sourced candidate, fills the role and tracks fit and workload', () => {
    const { world, cands } = sourced(funded());
    const cand = cands[0]!;
    const r = run(world, F, {
      type: 'company.offer',
      companyId: cid(world),
      candidateId: cand.id,
      salary: Math.round(cand.ask * 1.6),
      equityBps: 100,
    });
    expect(r.result.outcome).toBe('accept');
    const c = companyOf(r.world, F);
    const s = c.staff.find((x) => x.id === r.result.staffId)!;
    expect(s.skill).toBe(cand.skill);
    expect(s.fit).toBe(cand.fit);
    expect(s.workload).toBeGreaterThan(0);
    expect(c.hiring!.roles[0]!.status).toBe('filled');
    expect(c.hiring!.candidates.every((x) => x.status !== 'open')).toBe(true);
    expect(ownership(c.capTable, s.id)).toBeCloseTo(0.01, 3);
  });

  it('candidates withdraw once their deadline passes', () => {
    const { world, cands } = sourced(funded());
    const last = Math.max(...cands.map((x) => x.deadline));
    const month = world.markets.lagos!.month;
    const w = settle(world, 'lagos', last - month + 1);
    const c = companyOf(w, F);
    expect(c.hiring!.candidates.filter((x) => x.status === 'open')).toHaveLength(0);
    const offer = tryRun(w, F, {
      type: 'company.offer',
      companyId: c.id,
      candidateId: cands[0]!.id,
      salary: cands[0]!.ask * 2,
      equityBps: 0,
    });
    expect(offer.ok).toBe(false);
  });

  it('a company that never uses the pipeline settles exactly as before (no workload, no hiring)', () => {
    const w = settle(funded(), 'lagos', 2);
    const c = companyOf(w, F);
    expect(c.hiring).toBeUndefined();
    expect(c.staff.every((s) => s.workload === undefined && s.fit === undefined)).toBe(true);
  });

  it('reports coverage gaps and workload in plain terms', () => {
    const w = funded();
    const c = companyOf(w, F);
    expect(coverageGaps(c)).toContain('engineer');
    expect(workloadOf(c)).toEqual({});
  });
});

describe('AI co-founder', () => {
  it('offers three profiles asking 15–35% on a 4-year vest with a 1-year cliff', () => {
    const w = funded();
    const offers = aiCofounderOffers(w, companyOf(w, F));
    expect(offers.map((o) => o.id)).toEqual(['cto', 'operator', 'growth']);
    for (const o of offers) {
      expect(o.equityBps).toBeGreaterThanOrEqual(1500);
      expect(o.equityBps).toBeLessThanOrEqual(3500);
      expect(o.vestingMonths).toBe(48);
      expect(o.cliffMonths).toBe(12);
    }
  });

  it('joins with founder shares that reconcile in the cap table, and completes chapter 2’s hire step', () => {
    const w = funded();
    const c0 = companyOf(w, F);
    const mine0 = ownership(c0.capTable, F);
    const fd0 = fullyDiluted(c0.capTable);
    const cap0 = companyDetail(w, c0).management.capacity;
    const offer = aiCofounderOffers(w, c0).find((o) => o.id === 'cto')!;
    const r = run(w, F, { type: 'cofounder.ai', companyId: c0.id, candidateId: 'cto' });
    const c = companyOf(r.world, F);
    const s = c.staff.find((x) => x.id === r.result.staffId)!;
    expect(s.cofounder).toMatchObject({ title: 'CTO', vestingMonths: 48, cliffMonths: 12 });
    expect(c.capTable.holdings[s.id]!.kind).toBe('founder');
    expect(ownership(c.capTable, s.id)).toBeCloseTo(offer.equityBps / 10_000, 4);
    expect(ownership(c.capTable, F)).toBeCloseTo(mine0 * (1 - offer.equityBps / 10_000), 4);
    const total = Object.keys(c.capTable.holdings).reduce(
      (a, h) => a + ownership(c.capTable, h),
      0,
    );
    expect(total).toBeCloseTo(1, 9);
    expect(fullyDiluted(c.capTable)).toBeGreaterThan(fd0);
    expect(companyDetail(r.world, c).management.capacity).toBeGreaterThan(cap0);
    const step = journeyView(r.world, r.world.players[F]!)!
      .chapters.find((x) => x.id === 'team')!
      .steps.find((x) => x.id === 'team.hire')!;
    expect(step.done).toBe(true);
    expect(step.go).toEqual({ kind: 'tab', tab: 'company', section: 'team' });
    // Only one AI co-founder.
    expect(tryRun(r.world, F, { type: 'cofounder.ai', companyId: c.id }).ok).toBe(false);
    // They stay through settlements and money is conserved.
    const before = moneyByCurrency(r.world);
    const later = settle(r.world, 'lagos', 3);
    expect(companyOf(later, F).staff.some((x) => x.cofounder)).toBe(true);
    expect(moneyByCurrency(later)).toEqual(before);
  });
});

describe('journey: chapter 2 with the pipeline', () => {
  it('the first hire step goes to the Team screen and completes on a pipeline hire', () => {
    const { world, cands } = sourced(funded());
    const steps = () =>
      journeyView(world, world.players[F]!)!.chapters.find((x) => x.id === 'team')!.steps;
    expect(steps().find((x) => x.id === 'team.hire')!.done).toBe(false);
    const r = run(world, F, {
      type: 'company.offer',
      companyId: cid(world),
      candidateId: cands[0]!.id,
      salary: cands[0]!.ask * 2,
      equityBps: 0,
    });
    const after = journeyView(r.world, r.world.players[F]!)!.chapters.find(
      (x) => x.id === 'team',
    )!.steps;
    expect(after.find((x) => x.id === 'team.hire')!.done).toBe(true);
  });
});
